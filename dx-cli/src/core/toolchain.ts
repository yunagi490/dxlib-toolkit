import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { logger } from "./logger";
import { MINGW_WINDOWS_X64, SEVENZR_WINDOWS } from "./manifest";
import { ensureVerifiedFile } from "./download";

// DxLib同梱ライブラリと一致するMinGW-w64を、dx-cli専用のフォルダへ取得する補助機能。
// 既存のMinGWは決して上書きしない(findGpp は PATH/既知の場所を先に見て、見つからない時だけここを使う)。
// 保存先: ~/.dxlib-setup/toolchain/<id>/   (システムへのインストール・PATH変更・管理者権限は不要)

const PKG_ID = MINGW_WINDOWS_X64.id;

export function toolchainRoot(): string {
  return path.join(os.homedir(), ".dxlib-setup", "toolchain");
}

/** 管理下ツールチェーンの g++ のパス(Windowsのみ)。存在確認は呼び出し側で行う。 */
export function managedGppPath(): string {
  return path.join(toolchainRoot(), PKG_ID, "mingw64", "bin", "g++.exe");
}

export function managedGppIfPresent(): string | null {
  if (process.platform !== "win32") return null;
  const p = managedGppPath();
  return fs.existsSync(p) ? p : null;
}

function dumpVersion(gpp: string): string | null {
  try {
    return execFileSync(gpp, ["-dumpversion"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** g++ が実際に動き、期待バージョンで、小さなプログラムをコンパイルできるか。 */
function smokeTest(gpp: string, workDir: string): string | null {
  const ver = dumpVersion(gpp);
  if (!ver) return "g++ を実行できません";
  if (ver !== MINGW_WINDOWS_X64.version) return `g++ のバージョンが想定と違います (${ver} / 想定 ${MINGW_WINDOWS_X64.version})`;

  fs.mkdirSync(workDir, { recursive: true });
  const src = path.join(workDir, "smoke.cpp");
  const out = path.join(workDir, "smoke.exe");
  fs.writeFileSync(src, "#include <string>\nint main(){ std::string s(\"ok\"); return s.size() == 2 ? 0 : 1; }\n");
  const r = spawnSync(gpp, [src, "-o", out], { cwd: workDir, stdio: "pipe" });
  const ok = r.status === 0 && fs.existsSync(out);
  fs.rmSync(src, { force: true });
  fs.rmSync(out, { force: true });
  return ok ? null : "テストコードのコンパイルに失敗しました";
}

export function printAntivirusGuidance(): void {
  logger.warn("ツールチェーンの展開が途中で止まったか、必要なファイルが欠けています。");
  logger.plain("  考えられる原因: セキュリティソフトが展開中のファイルを隔離した可能性があります。");
  logger.plain("  (MinGW付属の gcc/ld/as などは、ソフトによって誤検知されることがあります)");
  logger.plain("  対処の例:");
  logger.plain(`    1. セキュリティソフトの隔離/検疫の一覧に ${toolchainRoot()} 配下や 7z のファイルがないか確認する`);
  logger.plain("    2. 内容を自分で判断したうえで、復元または除外フォルダに上記フォルダを追加する");
  logger.plain("    3. その後 `dx toolchain install --force` を再実行する");
  logger.plain("  セキュリティソフトの設定を変えたくない場合は、MinGW-w64 を自分で導入し PATH に通してください。");
}

export interface EnsureResult {
  gppPath: string | null;
  reason?: string;
}

/**
 * 管理下ツールチェーンを用意する。
 * 7zr.exe と MinGW 7z をそれぞれ取得・検証 → 一時フォルダへ展開 → g++ を実行して検証 → 正式な場所へ移動。
 * 検証を通ったものだけが最終フォルダに現れる(失敗した残骸でfindGppが誤って成功しない)。
 */
export async function ensureManagedToolchain(opts?: { force?: boolean }): Promise<EnsureResult> {
  if (process.platform !== "win32") {
    return { gppPath: null, reason: "管理下ツールチェーンの取得はWindowsのみ対応です。" };
  }

  const finalDir = path.join(toolchainRoot(), PKG_ID);
  const finalGpp = managedGppPath();

  if (!opts?.force && fs.existsSync(finalGpp)) {
    if (smokeTest(finalGpp, path.join(toolchainRoot(), ".smoke")) === null) {
      logger.info(`取得済みのツールチェーンを使用します: ${finalGpp}`);
      return { gppPath: finalGpp };
    }
    logger.warn("取得済みのツールチェーンが壊れているため、取り直します。");
  }

  const cache = path.join(os.homedir(), ".dxlib-setup", "cache");
  const sevenZr = await ensureVerifiedFile(SEVENZR_WINDOWS, cache, { force: opts?.force });
  if (!sevenZr) return { gppPath: null, reason: "7zr.exe を取得できませんでした。" };

  const archive = await ensureVerifiedFile(MINGW_WINDOWS_X64, cache, { force: opts?.force });
  if (!archive) return { gppPath: null, reason: "MinGW-w64 のアーカイブを取得できませんでした。" };

  const tmpDir = `${finalDir}.tmp`;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  logger.step("展開中です(数分かかることがあります)...");
  const r = spawnSync(sevenZr, ["x", archive, `-o${tmpDir}`, "-y"], { stdio: "pipe" });
  const tmpGpp = path.join(tmpDir, "mingw64", "bin", "g++.exe");

  if (r.status !== 0 || !fs.existsSync(tmpGpp)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    printAntivirusGuidance();
    return { gppPath: null, reason: "展開に失敗しました。" };
  }

  const problem = smokeTest(tmpGpp, path.join(tmpDir, ".smoke"));
  if (problem) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    printAntivirusGuidance();
    return { gppPath: null, reason: `展開後の検証に失敗しました: ${problem}` };
  }

  fs.rmSync(path.join(tmpDir, ".smoke"), { recursive: true, force: true });
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(tmpDir, finalDir);
  logger.success(`ツールチェーンを用意しました: ${finalGpp}`);
  return { gppPath: finalGpp };
}

/** `dx toolchain` コマンド本体。 */
export async function toolchainCommand(args: string[]): Promise<void> {
  const sub = args[0] ?? "status";
  if (sub === "status") {
    const p = managedGppIfPresent();
    if (p) logger.success(`管理下ツールチェーン: ${p} (${dumpVersion(p) ?? "version unknown"})`);
    else logger.info("管理下ツールチェーンはありません。`dx toolchain install` で取得できます(Windowsのみ)。");
    return;
  }
  if (sub === "install") {
    const res = await ensureManagedToolchain({ force: args.includes("--force") });
    if (!res.gppPath) {
      logger.error(res.reason ?? "ツールチェーンを用意できませんでした。");
      process.exitCode = 1;
    }
    return;
  }
  if (sub === "remove") {
    fs.rmSync(path.join(toolchainRoot(), PKG_ID), { recursive: true, force: true });
    logger.success("管理下ツールチェーンを削除しました。");
    return;
  }
  logger.error(`不明なサブコマンドです: ${sub} (status | install [--force] | remove)`);
  process.exitCode = 1;
}
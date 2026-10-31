import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { logger } from "./logger";
import { QUICKJS_AMALGAM } from "./manifest";
import { ensureVerifiedFile } from "./download";
import { cacheDir, extractZip } from "./env";

// スクリプト層(QuickJS)の取得とビルド。
//  - 取得: 公式リリースのamalgam zipを検証して lib/quickjs/ に展開(dx-cliは再配布しない)
//  - ビルド: 3MB級のCファイルを毎回コンパイルしないよう、build/quickjs.o にキャッシュする

const SOURCE_FILES = ["quickjs-amalgam.c", "quickjs.h", "quickjs-libc.h"];

export function quickjsDir(projectRoot: string): string {
  return path.join(projectRoot, "lib", "quickjs");
}

export function hasQuickJsSources(projectRoot: string): boolean {
  const dir = quickjsDir(projectRoot);
  return SOURCE_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}

/** QuickJSのソースを取得して lib/quickjs/ に配置する。成功したらtrue。 */
export async function ensureQuickJsSources(projectRoot: string, opts?: { force?: boolean }): Promise<boolean> {
  if (!opts?.force && hasQuickJsSources(projectRoot)) return true;

  const zip = await ensureVerifiedFile(QUICKJS_AMALGAM, cacheDir(), { force: opts?.force });
  if (!zip) {
    logger.error("QuickJSを取得できませんでした。ネットワークを確認するか、DX_MIRROR_URL を設定してください。");
    return false;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx_quickjs_"));
  try {
    extractZip(zip, tmp);
    const missing = SOURCE_FILES.filter((f) => !fs.existsSync(path.join(tmp, f)));
    if (missing.length > 0) {
      logger.error(`QuickJSのzipに想定したファイルがありません: ${missing.join(", ")}`);
      return false;
    }
    const dest = quickjsDir(projectRoot);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of SOURCE_FILES) {
      fs.writeFileSync(path.join(dest, f), fs.readFileSync(path.join(tmp, f)));
    }
    fs.writeFileSync(
      path.join(dest, "README.txt"),
      [
        `QuickJS (quickjs-ng) ${QUICKJS_AMALGAM.version}`,
        "https://github.com/quickjs-ng/quickjs",
        "License: MIT (Copyright (c) 2017-2024 Fabrice Bellard, Charlie Gordon, and quickjs-ng contributors)",
        "このフォルダは dx-cli が取得したものです。git管理の対象外(.gitignore)です。",
        "",
      ].join("\n")
    );
    logger.success(`QuickJS ${QUICKJS_AMALGAM.version} を配置しました: ${dest}`);
    return true;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** g++ と同じフォルダの gcc(Cコンパイラ)。 */
function siblingGcc(gppPath: string): string {
  return path.join(path.dirname(gppPath), process.platform === "win32" ? "gcc.exe" : "gcc");
}

/**
 * QuickJSをオブジェクトファイル(build/quickjs.o)にコンパイルして、そのパスを返す。失敗したらnull。
 * 同じソース・同じgccなら再利用する(build/quickjs.o.key に記録)。
 */
export function ensureQuickJsObject(projectRoot: string, gppPath: string): string | null {
  const src = path.join(quickjsDir(projectRoot), "quickjs-amalgam.c");
  const buildDir = path.join(projectRoot, "build");
  const obj = path.join(buildDir, "quickjs.o");
  const keyFile = `${obj}.key`;
  const gcc = siblingGcc(gppPath);

  if (!fs.existsSync(src)) {
    logger.error("lib/quickjs が見つかりません。`dx update --force` で再取得してください。");
    return null;
  }

  const key = `${QUICKJS_AMALGAM.version}|${QUICKJS_AMALGAM.sha256}|${gcc}|${fs.readFileSync(src).length}`;
  if (fs.existsSync(obj) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, "utf8").trim() === key) {
    return obj;
  }

  fs.mkdirSync(buildDir, { recursive: true });
  logger.step("QuickJSをコンパイル中です(初回のみ。数十秒かかることがあります)...");
  fs.rmSync(obj, { force: true });
  fs.rmSync(keyFile, { force: true });

  const r = spawnSync(gcc, ["-c", "-O2", "-w", "-std=gnu11", src, "-o", obj], { stdio: "pipe" });
  if (r.status !== 0 || !fs.existsSync(obj)) {
    const tail = (r.stderr ? r.stderr.toString() : "").split(/\r?\n/).slice(-30).join("\n");
    logger.error("QuickJSのコンパイルに失敗しました。");
    if (tail.trim()) logger.plain(tail);
    return null;
  }
  fs.writeFileSync(keyFile, `${key}\n`);
  logger.success("QuickJSをコンパイルしました。");
  return obj;
}
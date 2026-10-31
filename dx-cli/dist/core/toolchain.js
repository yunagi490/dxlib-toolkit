"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolchainRoot = toolchainRoot;
exports.managedGppPath = managedGppPath;
exports.managedGppIfPresent = managedGppIfPresent;
exports.printAntivirusGuidance = printAntivirusGuidance;
exports.ensureManagedToolchain = ensureManagedToolchain;
exports.toolchainCommand = toolchainCommand;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("./logger");
const manifest_1 = require("./manifest");
const download_1 = require("./download");
// DxLib同梱ライブラリと一致するMinGW-w64を、dx-cli専用のフォルダへ取得する補助機能。
// 既存のMinGWは決して上書きしない(findGpp は PATH/既知の場所を先に見て、見つからない時だけここを使う)。
// 保存先: ~/.dxlib-setup/toolchain/<id>/   (システムへのインストール・PATH変更・管理者権限は不要)
const PKG_ID = manifest_1.MINGW_WINDOWS_X64.id;
function toolchainRoot() {
    return path.join(os.homedir(), ".dxlib-setup", "toolchain");
}
/** 管理下ツールチェーンの g++ のパス(Windowsのみ)。存在確認は呼び出し側で行う。 */
function managedGppPath() {
    return path.join(toolchainRoot(), PKG_ID, "mingw64", "bin", "g++.exe");
}
function managedGppIfPresent() {
    if (process.platform !== "win32")
        return null;
    const p = managedGppPath();
    return fs.existsSync(p) ? p : null;
}
function dumpVersion(gpp) {
    try {
        return (0, node_child_process_1.execFileSync)(gpp, ["-dumpversion"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
    }
    catch {
        return null;
    }
}
/** g++ が実際に動き、期待バージョンで、小さなプログラムをコンパイルできるか。 */
function smokeTest(gpp, workDir) {
    const ver = dumpVersion(gpp);
    if (!ver)
        return "g++ を実行できません";
    if (ver !== manifest_1.MINGW_WINDOWS_X64.version)
        return `g++ のバージョンが想定と違います (${ver} / 想定 ${manifest_1.MINGW_WINDOWS_X64.version})`;
    fs.mkdirSync(workDir, { recursive: true });
    const src = path.join(workDir, "smoke.cpp");
    const out = path.join(workDir, "smoke.exe");
    fs.writeFileSync(src, "#include <string>\nint main(){ std::string s(\"ok\"); return s.size() == 2 ? 0 : 1; }\n");
    const r = (0, node_child_process_1.spawnSync)(gpp, [src, "-o", out], { cwd: workDir, stdio: "pipe" });
    const ok = r.status === 0 && fs.existsSync(out);
    fs.rmSync(src, { force: true });
    fs.rmSync(out, { force: true });
    return ok ? null : "テストコードのコンパイルに失敗しました";
}
function printAntivirusGuidance() {
    logger_1.logger.warn("ツールチェーンの展開が途中で止まったか、必要なファイルが欠けています。");
    logger_1.logger.plain("  考えられる原因: セキュリティソフトが展開中のファイルを隔離した可能性があります。");
    logger_1.logger.plain("  (MinGW付属の gcc/ld/as などは、ソフトによって誤検知されることがあります)");
    logger_1.logger.plain("  対処の例:");
    logger_1.logger.plain(`    1. セキュリティソフトの隔離/検疫の一覧に ${toolchainRoot()} 配下や 7z のファイルがないか確認する`);
    logger_1.logger.plain("    2. 内容を自分で判断したうえで、復元または除外フォルダに上記フォルダを追加する");
    logger_1.logger.plain("    3. その後 `dx toolchain install --force` を再実行する");
    logger_1.logger.plain("  セキュリティソフトの設定を変えたくない場合は、MinGW-w64 を自分で導入し PATH に通してください。");
}
/**
 * 管理下ツールチェーンを用意する。
 * 7zr.exe と MinGW 7z をそれぞれ取得・検証 → 一時フォルダへ展開 → g++ を実行して検証 → 正式な場所へ移動。
 * 検証を通ったものだけが最終フォルダに現れる(失敗した残骸でfindGppが誤って成功しない)。
 */
async function ensureManagedToolchain(opts) {
    if (process.platform !== "win32") {
        return { gppPath: null, reason: "管理下ツールチェーンの取得はWindowsのみ対応です。" };
    }
    const finalDir = path.join(toolchainRoot(), PKG_ID);
    const finalGpp = managedGppPath();
    if (!opts?.force && fs.existsSync(finalGpp)) {
        if (smokeTest(finalGpp, path.join(toolchainRoot(), ".smoke")) === null) {
            logger_1.logger.info(`取得済みのツールチェーンを使用します: ${finalGpp}`);
            return { gppPath: finalGpp };
        }
        logger_1.logger.warn("取得済みのツールチェーンが壊れているため、取り直します。");
    }
    const cache = path.join(os.homedir(), ".dxlib-setup", "cache");
    const sevenZr = await (0, download_1.ensureVerifiedFile)(manifest_1.SEVENZR_WINDOWS, cache, { force: opts?.force });
    if (!sevenZr)
        return { gppPath: null, reason: "7zr.exe を取得できませんでした。" };
    const archive = await (0, download_1.ensureVerifiedFile)(manifest_1.MINGW_WINDOWS_X64, cache, { force: opts?.force });
    if (!archive)
        return { gppPath: null, reason: "MinGW-w64 のアーカイブを取得できませんでした。" };
    const tmpDir = `${finalDir}.tmp`;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    logger_1.logger.step("展開中です(数分かかることがあります)...");
    const r = (0, node_child_process_1.spawnSync)(sevenZr, ["x", archive, `-o${tmpDir}`, "-y"], { stdio: "pipe" });
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
    logger_1.logger.success(`ツールチェーンを用意しました: ${finalGpp}`);
    return { gppPath: finalGpp };
}
/** `dx toolchain` コマンド本体。 */
async function toolchainCommand(args) {
    const sub = args[0] ?? "status";
    if (sub === "status") {
        const p = managedGppIfPresent();
        if (p)
            logger_1.logger.success(`管理下ツールチェーン: ${p} (${dumpVersion(p) ?? "version unknown"})`);
        else
            logger_1.logger.info("管理下ツールチェーンはありません。`dx toolchain install` で取得できます(Windowsのみ)。");
        return;
    }
    if (sub === "install") {
        const res = await ensureManagedToolchain({ force: args.includes("--force") });
        if (!res.gppPath) {
            logger_1.logger.error(res.reason ?? "ツールチェーンを用意できませんでした。");
            process.exitCode = 1;
        }
        return;
    }
    if (sub === "remove") {
        fs.rmSync(path.join(toolchainRoot(), PKG_ID), { recursive: true, force: true });
        logger_1.logger.success("管理下ツールチェーンを削除しました。");
        return;
    }
    logger_1.logger.error(`不明なサブコマンドです: ${sub} (status | install [--force] | remove)`);
    process.exitCode = 1;
}

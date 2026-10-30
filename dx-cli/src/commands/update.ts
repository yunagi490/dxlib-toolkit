import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logger } from "../core/logger";
import { requireProjectRoot, writeConfig } from "../core/config";
import {
  findGpp,
  findDebugger,
  currentPlatform,
  ensureDxLibWindowsZip,
  extractZip,
  findGccVersionRoot,
  pickBestVersionFolder,
  copyRecursive,
  cloneOrUpdateDxLibForLinux,
  buildDxLibForLinux,
  nativeDxLibSourceDir,
} from "../core/env";
import * as vscodeTpl from "../templates/vscode";

/**
 * dx update は以下のみを更新対象とする(src/, tests/ のユーザーコードには一切触れない):
 *   - .vscode/ 配下の設定ファイル
 *   - lib/DxLib (DxLib本体。再ダウンロード/再ビルド)
 *   - dx.config.json の lastDxLibSyncAt
 */
export async function updateCommand(args: string[]): Promise<void> {
  const { root, config } = requireProjectRoot(process.cwd());
  const skipDxLib = args.includes("--vscode-only");

  logger.info(`プロジェクト "${config.name}" を更新します (mode: ${config.dxlibMode})`);
  logger.warn("src/ 配下のユーザーコードは更新対象外です(変更されません)。");

  if (!skipDxLib) {
    await refreshDxLib(root, config.dxlibMode, args.includes("--force"));
    config.lastDxLibSyncAt = new Date().toISOString();
    writeConfig(root, config);
  }

  refreshVscode(root, config);

  logger.success("更新が完了しました。");
}

async function refreshDxLib(root: string, mode: "windows" | "native" | "stub", force: boolean): Promise<void> {
  const destDir = path.join(root, "lib", "DxLib");

  if (mode === "native") {
    cloneOrUpdateDxLibForLinux();
    buildDxLibForLinux();

    const srcDir = nativeDxLibSourceDir();
    const includeDest = path.join(destDir, "include");
    const libDest = path.join(destDir, "lib");
    fs.rmSync(includeDest, { recursive: true, force: true });
    fs.rmSync(libDest, { recursive: true, force: true });
    fs.mkdirSync(includeDest, { recursive: true });
    fs.mkdirSync(libDest, { recursive: true });

    const includeSrc = path.join(srcDir, "include");
    if (fs.existsSync(includeSrc)) {
      copyRecursive(includeSrc, includeDest);
    }
    return;
  }

  const zipPath = await ensureDxLibWindowsZip({ forceRedownload: force });
  if (!zipPath) {
    logger.warn("DxLib zipの取得に失敗したため、既存の lib/DxLib はそのままにします。");
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dxlib_extract_"));
    try {
    extractZip(zipPath, tmpDir);
    const gccFolder = findGccVersionRoot(tmpDir);
    if (!gccFolder) {
      logger.warn("zip内にコンパイラバージョン別フォルダが見つかりませんでした。既存のlib/DxLibを保持します。");
      return;
    }
    const versionFolder = pickBestVersionFolder(gccFolder, findGpp());
    if (!versionFolder) {
      logger.warn("コンパイラバージョン別フォルダが見つかりませんでした。既存のlib/DxLibを保持します。");
      return;
    }
    logger.info(`使用するライブラリ: ${path.basename(versionFolder)}`);
    fs.rmSync(destDir, { recursive: true, force: true });
    copyRecursive(versionFolder, destDir);
    logger.success(`DxLibを更新しました: ${destDir}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function refreshVscode(root: string, config: ReturnType<typeof requireProjectRoot>["config"]): void {
  const vscodeDir = path.join(root, ".vscode");
  fs.mkdirSync(vscodeDir, { recursive: true });

  fs.writeFileSync(path.join(vscodeDir, "tasks.json"), vscodeTpl.tasksJson());

  const gppPath = findGpp();
  if (gppPath) {
    const dxlibDir = path.join(root, "lib", "DxLib");
    const includeDir = config.dxlibMode === "native" ? path.join(dxlibDir, "include") : dxlibDir;
    const intelliSenseMode =
      config.dxlibMode === "windows"
        ? "gcc-x64"
        : currentPlatform() === "macos"
          ? process.arch === "arm64" ? "macos-clang-arm64" : "macos-clang-x64"
          : "linux-gcc-x64";

    fs.writeFileSync(
      path.join(vscodeDir, "c_cpp_properties.json"),
      vscodeTpl.cppPropertiesJson(config, gppPath, includeDir, intelliSenseMode)
    );
  }

  const debuggerInfo = findDebugger();
  const launch = vscodeTpl.launchJson(config, debuggerInfo);
  if (launch) {
    fs.writeFileSync(path.join(vscodeDir, "launch.json"), launch);
  }

  logger.success(".vscode の設定ファイルを最新化しました。");
}

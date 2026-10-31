import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { logger } from "../core/logger";
import { confirm, select } from "../core/prompt";
import { DxConfig, DxLibMode, writeConfig } from "../core/config";
import {
  currentPlatform,
  findGpp,
  findDebugger,
  ensureDxLibWindowsZip,
  extractZip,
  findGccVersionRoot,
  pickBestVersionFolder,
  copyRecursive,
  cloneOrUpdateDxLibForLinux,
  buildDxLibForLinux,
  nativeDxLibSourceDir,
} from "../core/env";
import { ensureManagedToolchain } from "../core/toolchain";
import { DXLIB_WINDOWS_GCC, QUICKJS_AMALGAM } from "../core/manifest";
import { ensureQuickJsSources } from "../core/quickjs";
import * as engineTpl from "../templates/engine";
import * as testTpl from "../templates/test";
import * as vscodeTpl from "../templates/vscode";

const DX_CLI_VERSION = "0.2.0-beta.1";

export async function createCommand(rawName: string | undefined, args: string[]): Promise<void> {
  if (!rawName) {
    logger.error("プロジェクト名を指定してください: dx create <name>");
    process.exitCode = 1;
    return;
  }

  const projectDir = path.resolve(process.cwd(), rawName);
  if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
    logger.error(`フォルダ "${rawName}" は既に存在し、空ではありません。`);
    process.exitCode = 1;
    return;
  }

  logger.divider();
  logger.info(`新規プロジェクト "${rawName}" を作成します`);
  logger.divider();

  const mode = await resolveDxLibMode(args);
  let useScript = args.includes("--script");
  if (useScript && mode !== "windows") {
    logger.warn("--script は現在 windows モードのみ対応です。スクリプト層なしで作成します。");
    useScript = false;
  }
  if (mode === "windows" && process.platform === "win32" && !findGpp()) {
    logger.warn("g++ (MinGW-w64) が見つかりません。");
    logger.plain("  DxLib 3.25a のライブラリと一致するMinGW-w64 12.2.0 (約70MB) を、");
    logger.plain("  dx-cli専用フォルダ(~/.dxlib-setup/toolchain)へ取得できます。システムの設定は変更しません。");
    if (await confirm("取得しますか?", false)) {
      const res = await ensureManagedToolchain();
      if (!res.gppPath) logger.warn(`${res.reason ?? "取得できませんでした。"} 後で \`dx toolchain install\` で再試行できます。`);
    } else {
      logger.info("スキップしました。MinGW-w64を自分で導入するか、後で `dx toolchain install` を実行してください。");
    }
  }

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "engine"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "scenes"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "build"), { recursive: true });

  // エンジン部分
  fs.writeFileSync(path.join(projectDir, "src", "engine", "IScene.h"), engineTpl.isSceneHeader());
  fs.writeFileSync(path.join(projectDir, "src", "engine", "SceneManager.h"), engineTpl.sceneManagerHeader());
  fs.writeFileSync(path.join(projectDir, "src", "engine", "SceneManager.cpp"), engineTpl.sceneManagerSource());
  if (useScript) {
    fs.mkdirSync(path.join(projectDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "src", "engine", "ScriptScene.h"), engineTpl.scriptSceneHeader());
    fs.writeFileSync(path.join(projectDir, "src", "engine", "ScriptScene.cpp"), engineTpl.scriptSceneSource());
    fs.writeFileSync(path.join(projectDir, "scripts", "title.js"), engineTpl.titleScript());
  } else {
    fs.writeFileSync(path.join(projectDir, "src", "scenes", "TitleScene.h"), engineTpl.titleSceneHeader());
    fs.writeFileSync(path.join(projectDir, "src", "scenes", "TitleScene.cpp"), engineTpl.titleSceneSource());
  }
  fs.writeFileSync(path.join(projectDir, "src", "main.cpp"), engineTpl.mainCpp(useScript));
  // テスト
  fs.writeFileSync(path.join(projectDir, "tests", "dx_test.h"), testTpl.dxTestHeader());
  fs.writeFileSync(path.join(projectDir, "tests", "example_test.cpp"), testTpl.exampleTestSource());

  // 設定ファイル
  const config: DxConfig = {
    name: rawName,
    dxlibMode: mode,
    cppStandard: "c++17",
    createdWithDxCliVersion: DX_CLI_VERSION,
    ...(useScript ? { scripting: { engine: "quickjs" as const, version: QUICKJS_AMALGAM.version } } : {}),
  };
  writeConfig(projectDir, config);

  // .gitignore
  fs.writeFileSync(
    path.join(projectDir, ".gitignore"),
    ["build/", "lib/DxLib/", "lib/quickjs/", "node_modules/", "Log.txt", ""].join("\n")
  );

  logger.success("プロジェクトの足場を生成しました。");

  // DxLib本体の取得
    const libFolder = await setupDxLib(projectDir, mode);
    if (libFolder) {
      config.dxlib = { version: DXLIB_WINDOWS_GCC.version, libFolder };
      writeConfig(projectDir, config);
  }
  // スクリプト層(QuickJS)の取得
  if (useScript) {
    const ok = await ensureQuickJsSources(projectDir);
    if (!ok) logger.warn("QuickJSの取得に失敗しました。後で `dx update --force` で再試行できます。");
  }
  // .vscode生成
  setupVscode(projectDir, config);

  logger.divider();
  logger.success(`完了！ 次のコマンドで開発を始められます:`);
  logger.plain(`  cd ${rawName}`);
  logger.plain(`  dx dev`);
  logger.divider();
}

async function resolveDxLibMode(args: string[]): Promise<DxLibMode> {
  const modeArg = args.find((a) => a.startsWith("--mode="));
  if (modeArg) {
    const value = modeArg.split("=")[1];
    if (value === "windows" || value === "native" || value === "stub") return value;
    logger.warn(`不明な --mode 値: ${value} (windows/native/stub のいずれかを指定してください)`);
  }

  const platform = currentPlatform();
  if (platform === "windows") return "windows";
  if (platform === "macos") {
    logger.info("macOSではX11ベースのnativeモードは使用できないため、stubモードを使用します。");
    return "stub";
  }

  // Linux: 対話選択
  const idx = await select("どちらのモードでセットアップしますか？", [
    "native - dxlib-for-linux(dra版)を実機ビルド。実行可能だがX11環境が必要",
    "stub   - Windows版DxLibヘッダのみ配置。構文チェック/IntelliSenseのみ、実行不可",
  ]);
  return idx === 0 ? "native" : "stub";
}

/** DxLibを配置し、windows/stubモードでは使用したライブラリフォルダ名を返す(それ以外・失敗時はnull)。 */
async function setupDxLib(projectDir: string, mode: DxLibMode): Promise<string | null> {
  const destDir = path.join(projectDir, "lib", "DxLib");

  if (mode === "native") {
    cloneOrUpdateDxLibForLinux();
    buildDxLibForLinux();

    const srcDir = nativeDxLibSourceDir();
    const includeDest = path.join(destDir, "include");
    const libDest = path.join(destDir, "lib");
    fs.mkdirSync(includeDest, { recursive: true });
    fs.mkdirSync(libDest, { recursive: true });

    const includeSrc = path.join(srcDir, "include");
    if (fs.existsSync(includeSrc)) {
      copyRecursive(includeSrc, includeDest);
    } else {
      logger.warn(`dxlib-for-linuxのincludeフォルダが見つかりません: ${includeSrc}`);
    }

    copyArtifacts(srcDir, libDest, [".a", ".so"]);
    return destDir;
  }

  // windows / stub は同じWindows版gcc zipを使う
  const zipPath = await ensureDxLibWindowsZip();
  if (!zipPath) {
    logger.warn("DxLib zipの自動取得に失敗しました。手動でダウンロードしてキャッシュフォルダに置いてから");
    logger.warn("`dx doctor` を実行し、再度配置を試みてください。");
    return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dxlib_extract_"));
    try {
    extractZip(zipPath, tmpDir);
    const gccFolder = findGccVersionRoot(tmpDir);
    if (!gccFolder) {
      logger.warn(`zip内にコンパイラバージョン別フォルダが見つかりませんでした: ${tmpDir}`);
      return null;
    }
    const versionFolder = pickBestVersionFolder(gccFolder, findGpp());
    if (!versionFolder) {
      logger.warn(`コンパイラバージョン別フォルダが見つかりませんでした: ${gccFolder}`);
      return null;
    }
    logger.info(`使用するライブラリ: ${path.basename(versionFolder)}`);
    copyRecursive(versionFolder, destDir);
    logger.success(`DxLibを配置しました: ${destDir}`);
    return path.basename(versionFolder);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function copyArtifacts(searchDir: string, destDir: string, extensions: string[]): void {
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        fs.copyFileSync(full, path.join(destDir, entry.name));
      }
    }
  }
  if (fs.existsSync(searchDir)) walk(searchDir);
}

function setupVscode(projectDir: string, config: DxConfig): void {
  const vscodeDir = path.join(projectDir, ".vscode");
  fs.mkdirSync(vscodeDir, { recursive: true });

  fs.writeFileSync(path.join(vscodeDir, "tasks.json"), vscodeTpl.tasksJson());

  const gppPath = findGpp();
  const dxlibDir = path.join(projectDir, "lib", "DxLib");
  const includeDir = config.dxlibMode === "native" ? path.join(dxlibDir, "include") : dxlibDir;

  if (gppPath) {
    const intelliSenseMode = resolveIntelliSenseMode(config);
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

  logger.success(".vscode の設定ファイルを生成しました。");
}

function resolveIntelliSenseMode(config: DxConfig): string {
  const platform = currentPlatform();
  if (config.dxlibMode === "windows") return "gcc-x64";
  if (platform === "macos") {
    return process.arch === "arm64" ? "macos-clang-arm64" : "macos-clang-x64";
  }
  return "linux-gcc-x64";
}

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
exports.createCommand = createCommand;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const logger_1 = require("../core/logger");
const prompt_1 = require("../core/prompt");
const config_1 = require("../core/config");
const env_1 = require("../core/env");
const toolchain_1 = require("../core/toolchain");
const manifest_1 = require("../core/manifest");
const quickjs_1 = require("../core/quickjs");
const engineTpl = __importStar(require("../templates/engine"));
const testTpl = __importStar(require("../templates/test"));
const vscodeTpl = __importStar(require("../templates/vscode"));
const DX_CLI_VERSION = "0.1.0";
async function createCommand(rawName, args) {
    if (!rawName) {
        logger_1.logger.error("プロジェクト名を指定してください: dx create <name>");
        process.exitCode = 1;
        return;
    }
    const projectDir = path.resolve(process.cwd(), rawName);
    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
        logger_1.logger.error(`フォルダ "${rawName}" は既に存在し、空ではありません。`);
        process.exitCode = 1;
        return;
    }
    logger_1.logger.divider();
    logger_1.logger.info(`新規プロジェクト "${rawName}" を作成します`);
    logger_1.logger.divider();
    const mode = await resolveDxLibMode(args);
    let useScript = args.includes("--script");
    if (useScript && mode !== "windows") {
        logger_1.logger.warn("--script は現在 windows モードのみ対応です。スクリプト層なしで作成します。");
        useScript = false;
    }
    if (mode === "windows" && process.platform === "win32" && !(0, env_1.findGpp)()) {
        logger_1.logger.warn("g++ (MinGW-w64) が見つかりません。");
        logger_1.logger.plain("  DxLib 3.25a のライブラリと一致するMinGW-w64 12.2.0 (約70MB) を、");
        logger_1.logger.plain("  dx-cli専用フォルダ(~/.dxlib-setup/toolchain)へ取得できます。システムの設定は変更しません。");
        if (await (0, prompt_1.confirm)("取得しますか?", false)) {
            const res = await (0, toolchain_1.ensureManagedToolchain)();
            if (!res.gppPath)
                logger_1.logger.warn(`${res.reason ?? "取得できませんでした。"} 後で \`dx toolchain install\` で再試行できます。`);
        }
        else {
            logger_1.logger.info("スキップしました。MinGW-w64を自分で導入するか、後で `dx toolchain install` を実行してください。");
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
    }
    else {
        fs.writeFileSync(path.join(projectDir, "src", "scenes", "TitleScene.h"), engineTpl.titleSceneHeader());
        fs.writeFileSync(path.join(projectDir, "src", "scenes", "TitleScene.cpp"), engineTpl.titleSceneSource());
    }
    fs.writeFileSync(path.join(projectDir, "src", "main.cpp"), engineTpl.mainCpp(useScript));
    // テスト
    fs.writeFileSync(path.join(projectDir, "tests", "dx_test.h"), testTpl.dxTestHeader());
    fs.writeFileSync(path.join(projectDir, "tests", "example_test.cpp"), testTpl.exampleTestSource());
    // 設定ファイル
    const config = {
        name: rawName,
        dxlibMode: mode,
        cppStandard: "c++17",
        createdWithDxCliVersion: DX_CLI_VERSION,
        ...(useScript ? { scripting: { engine: "quickjs", version: manifest_1.QUICKJS_AMALGAM.version } } : {}),
    };
    (0, config_1.writeConfig)(projectDir, config);
    // .gitignore
    fs.writeFileSync(path.join(projectDir, ".gitignore"), ["build/", "lib/DxLib/", "lib/quickjs/", "node_modules/", "Log.txt", ""].join("\n"));
    logger_1.logger.success("プロジェクトの足場を生成しました。");
    // DxLib本体の取得
    const libFolder = await setupDxLib(projectDir, mode);
    if (libFolder) {
        config.dxlib = { version: manifest_1.DXLIB_WINDOWS_GCC.version, libFolder };
        (0, config_1.writeConfig)(projectDir, config);
    }
    // スクリプト層(QuickJS)の取得
    if (useScript) {
        const ok = await (0, quickjs_1.ensureQuickJsSources)(projectDir);
        if (!ok)
            logger_1.logger.warn("QuickJSの取得に失敗しました。後で `dx update --force` で再試行できます。");
    }
    // .vscode生成
    setupVscode(projectDir, config);
    logger_1.logger.divider();
    logger_1.logger.success(`完了！ 次のコマンドで開発を始められます:`);
    logger_1.logger.plain(`  cd ${rawName}`);
    logger_1.logger.plain(`  dx dev`);
    logger_1.logger.divider();
}
async function resolveDxLibMode(args) {
    const modeArg = args.find((a) => a.startsWith("--mode="));
    if (modeArg) {
        const value = modeArg.split("=")[1];
        if (value === "windows" || value === "native" || value === "stub")
            return value;
        logger_1.logger.warn(`不明な --mode 値: ${value} (windows/native/stub のいずれかを指定してください)`);
    }
    const platform = (0, env_1.currentPlatform)();
    if (platform === "windows")
        return "windows";
    if (platform === "macos") {
        logger_1.logger.info("macOSではX11ベースのnativeモードは使用できないため、stubモードを使用します。");
        return "stub";
    }
    // Linux: 対話選択
    const idx = await (0, prompt_1.select)("どちらのモードでセットアップしますか？", [
        "native - dxlib-for-linux(dra版)を実機ビルド。実行可能だがX11環境が必要",
        "stub   - Windows版DxLibヘッダのみ配置。構文チェック/IntelliSenseのみ、実行不可",
    ]);
    return idx === 0 ? "native" : "stub";
}
/** DxLibを配置し、windows/stubモードでは使用したライブラリフォルダ名を返す(それ以外・失敗時はnull)。 */
async function setupDxLib(projectDir, mode) {
    const destDir = path.join(projectDir, "lib", "DxLib");
    if (mode === "native") {
        (0, env_1.cloneOrUpdateDxLibForLinux)();
        (0, env_1.buildDxLibForLinux)();
        const srcDir = (0, env_1.nativeDxLibSourceDir)();
        const includeDest = path.join(destDir, "include");
        const libDest = path.join(destDir, "lib");
        fs.mkdirSync(includeDest, { recursive: true });
        fs.mkdirSync(libDest, { recursive: true });
        const includeSrc = path.join(srcDir, "include");
        if (fs.existsSync(includeSrc)) {
            (0, env_1.copyRecursive)(includeSrc, includeDest);
        }
        else {
            logger_1.logger.warn(`dxlib-for-linuxのincludeフォルダが見つかりません: ${includeSrc}`);
        }
        copyArtifacts(srcDir, libDest, [".a", ".so"]);
        return destDir;
    }
    // windows / stub は同じWindows版gcc zipを使う
    const zipPath = await (0, env_1.ensureDxLibWindowsZip)();
    if (!zipPath) {
        logger_1.logger.warn("DxLib zipの自動取得に失敗しました。手動でダウンロードしてキャッシュフォルダに置いてから");
        logger_1.logger.warn("`dx doctor` を実行し、再度配置を試みてください。");
        return null;
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dxlib_extract_"));
    try {
        (0, env_1.extractZip)(zipPath, tmpDir);
        const gccFolder = (0, env_1.findGccVersionRoot)(tmpDir);
        if (!gccFolder) {
            logger_1.logger.warn(`zip内にコンパイラバージョン別フォルダが見つかりませんでした: ${tmpDir}`);
            return null;
        }
        const versionFolder = (0, env_1.pickBestVersionFolder)(gccFolder, (0, env_1.findGpp)());
        if (!versionFolder) {
            logger_1.logger.warn(`コンパイラバージョン別フォルダが見つかりませんでした: ${gccFolder}`);
            return null;
        }
        logger_1.logger.info(`使用するライブラリ: ${path.basename(versionFolder)}`);
        (0, env_1.copyRecursive)(versionFolder, destDir);
        logger_1.logger.success(`DxLibを配置しました: ${destDir}`);
        return path.basename(versionFolder);
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
function copyArtifacts(searchDir, destDir, extensions) {
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (extensions.some((ext) => entry.name.endsWith(ext))) {
                fs.copyFileSync(full, path.join(destDir, entry.name));
            }
        }
    }
    if (fs.existsSync(searchDir))
        walk(searchDir);
}
function setupVscode(projectDir, config) {
    const vscodeDir = path.join(projectDir, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, "tasks.json"), vscodeTpl.tasksJson());
    const gppPath = (0, env_1.findGpp)();
    const dxlibDir = path.join(projectDir, "lib", "DxLib");
    const includeDir = config.dxlibMode === "native" ? path.join(dxlibDir, "include") : dxlibDir;
    if (gppPath) {
        const intelliSenseMode = resolveIntelliSenseMode(config);
        fs.writeFileSync(path.join(vscodeDir, "c_cpp_properties.json"), vscodeTpl.cppPropertiesJson(config, gppPath, includeDir, intelliSenseMode));
    }
    const debuggerInfo = (0, env_1.findDebugger)();
    const launch = vscodeTpl.launchJson(config, debuggerInfo);
    if (launch) {
        fs.writeFileSync(path.join(vscodeDir, "launch.json"), launch);
    }
    logger_1.logger.success(".vscode の設定ファイルを生成しました。");
}
function resolveIntelliSenseMode(config) {
    const platform = (0, env_1.currentPlatform)();
    if (config.dxlibMode === "windows")
        return "gcc-x64";
    if (platform === "macos") {
        return process.arch === "arm64" ? "macos-clang-arm64" : "macos-clang-x64";
    }
    return "linux-gcc-x64";
}

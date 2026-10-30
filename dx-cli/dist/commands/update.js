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
exports.updateCommand = updateCommand;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const env_1 = require("../core/env");
const vscodeTpl = __importStar(require("../templates/vscode"));
/**
 * dx update は以下のみを更新対象とする(src/, tests/ のユーザーコードには一切触れない):
 *   - .vscode/ 配下の設定ファイル
 *   - lib/DxLib (DxLib本体。再ダウンロード/再ビルド)
 *   - dx.config.json の lastDxLibSyncAt
 */
async function updateCommand(args) {
    const { root, config } = (0, config_1.requireProjectRoot)(process.cwd());
    const skipDxLib = args.includes("--vscode-only");
    logger_1.logger.info(`プロジェクト "${config.name}" を更新します (mode: ${config.dxlibMode})`);
    logger_1.logger.warn("src/ 配下のユーザーコードは更新対象外です(変更されません)。");
    if (!skipDxLib) {
        await refreshDxLib(root, config.dxlibMode, args.includes("--force"));
        config.lastDxLibSyncAt = new Date().toISOString();
        (0, config_1.writeConfig)(root, config);
    }
    refreshVscode(root, config);
    logger_1.logger.success("更新が完了しました。");
}
async function refreshDxLib(root, mode, force) {
    const destDir = path.join(root, "lib", "DxLib");
    if (mode === "native") {
        (0, env_1.cloneOrUpdateDxLibForLinux)();
        (0, env_1.buildDxLibForLinux)();
        const srcDir = (0, env_1.nativeDxLibSourceDir)();
        const includeDest = path.join(destDir, "include");
        const libDest = path.join(destDir, "lib");
        fs.rmSync(includeDest, { recursive: true, force: true });
        fs.rmSync(libDest, { recursive: true, force: true });
        fs.mkdirSync(includeDest, { recursive: true });
        fs.mkdirSync(libDest, { recursive: true });
        const includeSrc = path.join(srcDir, "include");
        if (fs.existsSync(includeSrc)) {
            (0, env_1.copyRecursive)(includeSrc, includeDest);
        }
        return;
    }
    const zipPath = await (0, env_1.ensureDxLibWindowsZip)({ forceRedownload: force });
    if (!zipPath) {
        logger_1.logger.warn("DxLib zipの取得に失敗したため、既存の lib/DxLib はそのままにします。");
        return;
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dxlib_extract_"));
    try {
        (0, env_1.extractZip)(zipPath, tmpDir);
        const gccFolder = (0, env_1.findGccVersionRoot)(tmpDir);
        if (!gccFolder) {
            logger_1.logger.warn("zip内にコンパイラバージョン別フォルダが見つかりませんでした。既存のlib/DxLibを保持します。");
            return;
        }
        const versionFolder = (0, env_1.pickBestVersionFolder)(gccFolder, (0, env_1.findGpp)());
        if (!versionFolder) {
            logger_1.logger.warn("コンパイラバージョン別フォルダが見つかりませんでした。既存のlib/DxLibを保持します。");
            return;
        }
        logger_1.logger.info(`使用するライブラリ: ${path.basename(versionFolder)}`);
        fs.rmSync(destDir, { recursive: true, force: true });
        (0, env_1.copyRecursive)(versionFolder, destDir);
        logger_1.logger.success(`DxLibを更新しました: ${destDir}`);
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
function refreshVscode(root, config) {
    const vscodeDir = path.join(root, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, "tasks.json"), vscodeTpl.tasksJson());
    const gppPath = (0, env_1.findGpp)();
    if (gppPath) {
        const dxlibDir = path.join(root, "lib", "DxLib");
        const includeDir = config.dxlibMode === "native" ? path.join(dxlibDir, "include") : dxlibDir;
        const intelliSenseMode = config.dxlibMode === "windows"
            ? "gcc-x64"
            : (0, env_1.currentPlatform)() === "macos"
                ? process.arch === "arm64" ? "macos-clang-arm64" : "macos-clang-x64"
                : "linux-gcc-x64";
        fs.writeFileSync(path.join(vscodeDir, "c_cpp_properties.json"), vscodeTpl.cppPropertiesJson(config, gppPath, includeDir, intelliSenseMode));
    }
    const debuggerInfo = (0, env_1.findDebugger)();
    const launch = vscodeTpl.launchJson(config, debuggerInfo);
    if (launch) {
        fs.writeFileSync(path.join(vscodeDir, "launch.json"), launch);
    }
    logger_1.logger.success(".vscode の設定ファイルを最新化しました。");
}

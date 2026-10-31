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
exports.devCommand = devCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const typescript_1 = require("../core/typescript");
const build_1 = require("./build");
const run_1 = require("./run");
const DEBOUNCE_MS = 300;
function devCommand() {
    const { root, config } = (0, config_1.requireProjectRoot)(process.cwd());
    if (config.dxlibMode === "stub") {
        logger_1.logger.warn("stubモードのため実行はできません。ファイル変更時の構文チェックのみ行います。");
    }
    let currentProcess = null;
    let debounceTimer = null;
    let building = false;
    let rebuildQueued = false;
    let lastOutputPath = null;
    function killCurrentProcess() {
        if (currentProcess && !currentProcess.killed) {
            currentProcess.kill();
            currentProcess = null;
        }
    }
    function rebuildAndRestart() {
        if (building) {
            rebuildQueued = true;
            return;
        }
        building = true;
        logger_1.logger.divider();
        logger_1.logger.step("変更を検知。再ビルドします...");
        killCurrentProcess();
        const result = (0, build_1.buildCommand)([]);
        building = false;
        if (rebuildQueued) {
            rebuildQueued = false;
            rebuildAndRestart();
            return;
        }
        if (!result.success) {
            logger_1.logger.warn("ビルド失敗。修正して保存すると再試行します。");
            return;
        }
        if (config.dxlibMode === "stub") {
            logger_1.logger.info("(stubモードのため実行はスキップします)");
            return;
        }
        if (result.outputPath && fs.existsSync(result.outputPath)) {
            lastOutputPath = result.outputPath;
            launch(result.outputPath);
        }
    }
    function launch(outputPath) {
        logger_1.logger.step("起動中...");
        const proc = (0, run_1.spawnBuiltExecutable)(outputPath, root);
        currentProcess = proc;
        proc.on("exit", (code) => {
            // 再起動のために自分で止めた場合は、すでに別プロセスに置き換わっているので何も言わない
            if (currentProcess !== proc && currentProcess !== null)
                return;
            if (currentProcess === proc)
                currentProcess = null;
            logger_1.logger.info(`アプリが終了しました (code: ${code ?? "null"})。ファイル変更を待機中...`);
        });
    }
    /**
     * scripts/ の変更時。スクリプトは起動時に読み込まれるだけなので、C++の再ビルドは不要。
     * 実行ファイルを起動し直すだけで反映される。
     */
    function restartOnly() {
        if (config.dxlibMode === "stub")
            return;
        if (building) {
            rebuildQueued = true;
            return;
        }
        if (!lastOutputPath || !fs.existsSync(lastOutputPath)) {
            // まだ一度もビルドできていない場合は通常の再ビルドに任せる
            rebuildAndRestart();
            return;
        }
        logger_1.logger.divider();
        logger_1.logger.step("スクリプトの変更を検知。アプリを再起動します...(再ビルドなし)");
        const old = currentProcess;
        currentProcess = null;
        if (old && !old.killed)
            old.kill();
        launch(lastOutputPath);
    }
    function scheduleRebuild() {
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(rebuildAndRestart, DEBOUNCE_MS);
    }
    const tsMode = (0, typescript_1.isTypeScriptProject)(config);
    /** TypeScriptのスクリプト: .js に変換できたときだけ再起動する(型エラー中は動いているアプリを止めない) */
    function recompileScriptsAndRestart() {
        if (!(0, typescript_1.compileScripts)(root)) {
            logger_1.logger.warn("型エラーのため再起動しません。直して保存すると再試行します。");
            return;
        }
        restartOnly();
    }
    let scriptTimer = null;
    function scheduleRestart() {
        if (scriptTimer)
            clearTimeout(scriptTimer);
        scriptTimer = setTimeout(tsMode ? recompileScriptsAndRestart : restartOnly, DEBOUNCE_MS);
    }
    const srcDir = path.join(root, "src");
    const scriptsDir = path.join(root, "scripts");
    logger_1.logger.info(`監視中: ${srcDir}`);
    watchRecursive(srcDir, scheduleRebuild, [".cpp", ".h", ".hpp"]);
    if (config.scripting && fs.existsSync(scriptsDir)) {
        logger_1.logger.info(tsMode
            ? `監視中: ${scriptsDir} (.ts の変更時は変換して、C++の再ビルドなしで再起動します)`
            : `監視中: ${scriptsDir} (変更時は再ビルドせずに再起動します)`);
        // TypeScriptでは、変換の出力(.js)ではなく元の .ts を監視する(出力で再度反応しないように)
        watchRecursive(scriptsDir, scheduleRestart, tsMode ? [".ts"] : [".js"]);
    }
    logger_1.logger.info("Ctrl+C で終了します。");
    process.on("SIGINT", () => {
        logger_1.logger.info("\n終了します。");
        killCurrentProcess();
        process.exit(0);
    });
    // 初回ビルド
    rebuildAndRestart();
}
/**
 * fs.watch はディレクトリ単位なので、サブディレクトリ含め再帰的に監視対象を貼る。
 * (Node18+ の fs.watch は { recursive: true } がLinuxで未対応の場合があるため、手動で再帰登録する)
 */
function watchRecursive(dir, onChange, extensions) {
    if (!fs.existsSync(dir))
        return;
    const watch = (target) => {
        try {
            fs.watch(target, { persistent: true }, (_event, filename) => {
                if (filename && extensions.some((ext) => filename.endsWith(ext))) {
                    onChange();
                }
            });
        }
        catch (e) {
            logger_1.logger.warn(`監視に失敗しました: ${target} (${e.message})`);
        }
    };
    watch(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            watchRecursive(path.join(dir, entry.name), onChange, extensions);
        }
    }
}

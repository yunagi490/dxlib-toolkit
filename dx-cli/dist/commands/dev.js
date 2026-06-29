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
            logger_1.logger.step("起動中...");
            currentProcess = (0, run_1.spawnBuiltExecutable)(result.outputPath, root);
            currentProcess.on("exit", (code) => {
                logger_1.logger.info(`アプリが終了しました (code: ${code ?? "null"})。ファイル変更を待機中...`);
            });
        }
    }
    function scheduleRebuild() {
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(rebuildAndRestart, DEBOUNCE_MS);
    }
    const srcDir = path.join(root, "src");
    logger_1.logger.info(`監視中: ${srcDir}`);
    logger_1.logger.info("Ctrl+C で終了します。");
    watchRecursive(srcDir, scheduleRebuild);
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
function watchRecursive(dir, onChange) {
    if (!fs.existsSync(dir))
        return;
    const watch = (target) => {
        try {
            fs.watch(target, { persistent: true }, (_event, filename) => {
                if (filename && (filename.endsWith(".cpp") || filename.endsWith(".h") || filename.endsWith(".hpp"))) {
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
            watchRecursive(path.join(dir, entry.name), onChange);
        }
    }
}

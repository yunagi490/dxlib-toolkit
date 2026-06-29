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
exports.runCommand = runCommand;
exports.spawnBuiltExecutable = spawnBuiltExecutable;
const fs = __importStar(require("node:fs"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const build_1 = require("./build");
function runCommand(args) {
    const { root, config } = (0, config_1.requireProjectRoot)(process.cwd());
    if (config.dxlibMode === "stub") {
        logger_1.logger.warn("stubモードのため実行はできません(構文チェックのみ可能です)。`dx build` を使ってください。");
        process.exitCode = 1;
        return;
    }
    const result = (0, build_1.buildCommand)(args.filter((a) => a !== "--no-build"));
    if (!result.success) {
        process.exitCode = 1;
        return;
    }
    if (!fs.existsSync(result.outputPath)) {
        logger_1.logger.error(`実行ファイルが見つかりません: ${result.outputPath}`);
        process.exitCode = 1;
        return;
    }
    logger_1.logger.step(`実行中: ${result.outputPath}`);
    const proc = (0, node_child_process_1.spawnSync)(result.outputPath, [], { cwd: root, stdio: "inherit" });
    process.exitCode = proc.status ?? 0;
}
/**
 * dx dev から使う非同期版。プロセスハンドルを返し、watchループ側で再起動を制御できるようにする。
 */
function spawnBuiltExecutable(outputPath, cwd) {
    return (0, node_child_process_1.spawn)(outputPath, [], { cwd, stdio: "inherit" });
}

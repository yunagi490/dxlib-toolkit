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
exports.buildCommand = buildCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const env_1 = require("../core/env");
const compiler_1 = require("../core/compiler");
const compat_1 = require("../core/compat");
function buildCommand(args) {
    const release = args.includes("--release");
    const { root, config } = (0, config_1.requireProjectRoot)(process.cwd());
    const gppPath = (0, env_1.findGpp)();
    if (!gppPath) {
        logger_1.logger.error("g++ が見つかりません。`dx doctor` で環境を確認してください。");
        process.exitCode = 1;
        return { success: false, outputPath: "" };
    }
    if (config.dxlibMode === "windows" && config.dxlib) {
        const lib = (0, compat_1.parseLibFolder)(config.dxlib.libFolder);
        const gppInfo = (0, compat_1.inspectGpp)(gppPath);
        if (lib && gppInfo) {
            for (const issue of (0, compat_1.checkCompat)(lib, gppInfo)) {
                if (issue.level === "warn")
                    logger_1.logger.warn(`${issue.message} (\`dx doctor\` で詳細を確認できます)`);
            }
        }
    }
    fs.mkdirSync(path.join(root, "build"), { recursive: true });
    if (config.dxlibMode === "stub") {
        logger_1.logger.step("stubモードのため構文チェックのみ実行します(実行ファイルは生成されません)。");
        const plan = (0, compiler_1.syntaxCheckPlan)(root, config, gppPath);
        const result = (0, node_child_process_1.spawnSync)(plan.gppPath, plan.args, { cwd: root, stdio: "inherit" });
        if (result.status !== 0) {
            logger_1.logger.error("構文チェックでエラーが見つかりました。");
            process.exitCode = 1;
            return { success: false, outputPath: "" };
        }
        logger_1.logger.success("構文チェックOK(実行ファイルはstubモードのため生成されません)。");
        return { success: true, outputPath: "" };
    }
    logger_1.logger.step(`ビルド中... (${release ? "release" : "debug"})`);
    const plan = (0, compiler_1.buildPlan)(root, config, gppPath, { release });
    const result = (0, node_child_process_1.spawnSync)(plan.gppPath, plan.args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) {
        logger_1.logger.error("ビルドに失敗しました。");
        process.exitCode = 1;
        return { success: false, outputPath: "" };
    }
    logger_1.logger.success(`ビルド完了: ${plan.outputPath}`);
    return { success: true, outputPath: plan.outputPath };
}

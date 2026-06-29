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
exports.testCommand = testCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const env_1 = require("../core/env");
function testCommand() {
    const { root, config } = (0, config_1.requireProjectRoot)(process.cwd());
    const testsDir = path.join(root, "tests");
    if (!fs.existsSync(testsDir)) {
        logger_1.logger.warn("tests/ フォルダが見つかりません。テストはありません。");
        return;
    }
    const gppPath = (0, env_1.findGpp)();
    if (!gppPath) {
        logger_1.logger.error("g++ が見つかりません。`dx doctor` で環境を確認してください。");
        process.exitCode = 1;
        return;
    }
    const testFiles = fs
        .readdirSync(testsDir)
        .filter((f) => f.endsWith(".cpp"))
        .sort();
    if (testFiles.length === 0) {
        logger_1.logger.warn("tests/ に .cpp ファイルが見つかりません。");
        return;
    }
    const buildDir = path.join(root, "build", "tests");
    fs.mkdirSync(buildDir, { recursive: true });
    let passed = 0;
    let failed = 0;
    const failedNames = [];
    logger_1.logger.divider();
    logger_1.logger.info(`テストを実行します (${testFiles.length}件)`);
    logger_1.logger.divider();
    for (const file of testFiles) {
        const testName = path.basename(file, ".cpp");
        const srcPath = path.join(testsDir, file);
        const exeName = process.platform === "win32" ? `${testName}.exe` : testName;
        const exePath = path.join(buildDir, exeName);
        // テストはDxLib本体に依存しないシンプルなロジック検証を想定し、
        // テストフォルダ自体(dx_test.h)のみをインクルードパスに通す。
        const compileArgs = [
            "-std=" + config.cppStandard,
            "-O0",
            "-g",
            srcPath,
            `-I${testsDir}`,
            "-o",
            exePath,
        ];
        const compileResult = (0, node_child_process_1.spawnSync)(gppPath, compileArgs, { stdio: "pipe" });
        if (compileResult.status !== 0) {
            failed++;
            failedNames.push(testName);
            logger_1.logger.error(`${testName}: コンパイルエラー`);
            process.stderr.write(compileResult.stderr?.toString() ?? "");
            continue;
        }
        const runResult = (0, node_child_process_1.spawnSync)(exePath, [], { stdio: "pipe" });
        const stdout = runResult.stdout?.toString() ?? "";
        const stderrOut = runResult.stderr?.toString() ?? "";
        if (runResult.status === 0) {
            passed++;
            logger_1.logger.plain(`  ${logger_1.color.green("PASS")}  ${testName}`);
            if (stdout.trim())
                logger_1.logger.plain(logger_1.color.gray(`    ${stdout.trim()}`));
        }
        else {
            failed++;
            failedNames.push(testName);
            logger_1.logger.plain(`  ${logger_1.color.red("FAIL")}  ${testName} (exit code: ${runResult.status})`);
            if (stderrOut.trim())
                logger_1.logger.plain(logger_1.color.gray(`    ${stderrOut.trim()}`));
        }
    }
    logger_1.logger.divider();
    logger_1.logger.plain(`${logger_1.color.green(`${passed} passed`)}, ${failed > 0 ? logger_1.color.red(`${failed} failed`) : "0 failed"}`);
    if (failed > 0) {
        logger_1.logger.error(`失敗したテスト: ${failedNames.join(", ")}`);
        process.exitCode = 1;
    }
    else {
        logger_1.logger.success("すべてのテストが成功しました。");
    }
}

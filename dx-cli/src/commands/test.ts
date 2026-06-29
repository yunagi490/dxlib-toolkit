import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { logger, color } from "../core/logger";
import { requireProjectRoot } from "../core/config";
import { findGpp } from "../core/env";

export function testCommand(): void {
  const { root, config } = requireProjectRoot(process.cwd());
  const testsDir = path.join(root, "tests");

  if (!fs.existsSync(testsDir)) {
    logger.warn("tests/ フォルダが見つかりません。テストはありません。");
    return;
  }

  const gppPath = findGpp();
  if (!gppPath) {
    logger.error("g++ が見つかりません。`dx doctor` で環境を確認してください。");
    process.exitCode = 1;
    return;
  }

  const testFiles = fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith(".cpp"))
    .sort();

  if (testFiles.length === 0) {
    logger.warn("tests/ に .cpp ファイルが見つかりません。");
    return;
  }

  const buildDir = path.join(root, "build", "tests");
  fs.mkdirSync(buildDir, { recursive: true });

  let passed = 0;
  let failed = 0;
  const failedNames: string[] = [];

  logger.divider();
  logger.info(`テストを実行します (${testFiles.length}件)`);
  logger.divider();

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

    const compileResult = spawnSync(gppPath, compileArgs, { stdio: "pipe" });
    if (compileResult.status !== 0) {
      failed++;
      failedNames.push(testName);
      logger.error(`${testName}: コンパイルエラー`);
      process.stderr.write(compileResult.stderr?.toString() ?? "");
      continue;
    }

    const runResult = spawnSync(exePath, [], { stdio: "pipe" });
    const stdout = runResult.stdout?.toString() ?? "";
    const stderrOut = runResult.stderr?.toString() ?? "";

    if (runResult.status === 0) {
      passed++;
      logger.plain(`  ${color.green("PASS")}  ${testName}`);
      if (stdout.trim()) logger.plain(color.gray(`    ${stdout.trim()}`));
    } else {
      failed++;
      failedNames.push(testName);
      logger.plain(`  ${color.red("FAIL")}  ${testName} (exit code: ${runResult.status})`);
      if (stderrOut.trim()) logger.plain(color.gray(`    ${stderrOut.trim()}`));
    }
  }

  logger.divider();
  logger.plain(`${color.green(`${passed} passed`)}, ${failed > 0 ? color.red(`${failed} failed`) : "0 failed"}`);

  if (failed > 0) {
    logger.error(`失敗したテスト: ${failedNames.join(", ")}`);
    process.exitCode = 1;
  } else {
    logger.success("すべてのテストが成功しました。");
  }
}

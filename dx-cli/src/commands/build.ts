import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { logger } from "../core/logger";
import { requireProjectRoot } from "../core/config";
import { findGpp } from "../core/env";
import { buildPlan, syntaxCheckPlan } from "../core/compiler";
import { ensureQuickJsObject, hasQuickJsSources } from "../core/quickjs";
import { checkCompat, inspectGpp, parseLibFolder } from "../core/compat";

export interface BuildResult {
  success: boolean;
  outputPath: string;
}

export function buildCommand(args: string[]): BuildResult {
  const release = args.includes("--release");
  const { root, config } = requireProjectRoot(process.cwd());

  const gppPath = findGpp();
  if (!gppPath) {
    logger.error("g++ が見つかりません。`dx doctor` で環境を確認してください。");
    process.exitCode = 1;
    return { success: false, outputPath: "" };
  }
  if (config.dxlibMode === "windows" && config.dxlib) {
    const lib = parseLibFolder(config.dxlib.libFolder);
    const gppInfo = inspectGpp(gppPath);
    if (lib && gppInfo) {
      for (const issue of checkCompat(lib, gppInfo)) {
        if (issue.level === "warn") logger.warn(`${issue.message} (\`dx doctor\` で詳細を確認できます)`);
      }
    }
  }


  fs.mkdirSync(path.join(root, "build"), { recursive: true });

  if (config.dxlibMode === "stub") {
    logger.step("stubモードのため構文チェックのみ実行します(実行ファイルは生成されません)。");
    const plan = syntaxCheckPlan(root, config, gppPath);
    const result = spawnSync(plan.gppPath, plan.args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) {
      logger.error("構文チェックでエラーが見つかりました。");
      process.exitCode = 1;
      return { success: false, outputPath: "" };
    }
    logger.success("構文チェックOK(実行ファイルはstubモードのため生成されません)。");
    return { success: true, outputPath: "" };
  }

  logger.step(`ビルド中... (${release ? "release" : "debug"})`);
      const extraObjects: string[] = [];
    if (config.scripting) {
      if (!hasQuickJsSources(root)) {
        logger.error("スクリプト層(QuickJS)のソースが lib/quickjs にありません。`dx update --force` で取得してください。");
        process.exitCode = 1;
        return { success: false, outputPath: "" };
      }
      const obj = ensureQuickJsObject(root, gppPath);
      if (!obj) {
        process.exitCode = 1;
        return { success: false, outputPath: "" };
      }
      extraObjects.push(obj);
    }
  const plan = buildPlan(root, config, gppPath, { release, extraObjects });
  const result = spawnSync(plan.gppPath, plan.args, { cwd: root, stdio: "inherit" });

  if (result.status !== 0) {
    logger.error("ビルドに失敗しました。");
    process.exitCode = 1;
    return { success: false, outputPath: "" };
  }

  logger.success(`ビルド完了: ${plan.outputPath}`);
  return { success: true, outputPath: plan.outputPath };
}

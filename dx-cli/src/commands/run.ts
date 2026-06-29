import * as fs from "node:fs";
import { spawnSync, spawn, ChildProcess } from "node:child_process";
import { logger } from "../core/logger";
import { requireProjectRoot } from "../core/config";
import { buildCommand } from "./build";

export function runCommand(args: string[]): void {
  const { root, config } = requireProjectRoot(process.cwd());

  if (config.dxlibMode === "stub") {
    logger.warn("stubモードのため実行はできません(構文チェックのみ可能です)。`dx build` を使ってください。");
    process.exitCode = 1;
    return;
  }

  const result = buildCommand(args.filter((a) => a !== "--no-build"));
  if (!result.success) {
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(result.outputPath)) {
    logger.error(`実行ファイルが見つかりません: ${result.outputPath}`);
    process.exitCode = 1;
    return;
  }

  logger.step(`実行中: ${result.outputPath}`);
  const proc = spawnSync(result.outputPath, [], { cwd: root, stdio: "inherit" });
  process.exitCode = proc.status ?? 0;
}

/**
 * dx dev から使う非同期版。プロセスハンドルを返し、watchループ側で再起動を制御できるようにする。
 */
export function spawnBuiltExecutable(outputPath: string, cwd: string): ChildProcess {
  return spawn(outputPath, [], { cwd, stdio: "inherit" });
}

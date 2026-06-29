import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../core/logger";
import { requireProjectRoot } from "../core/config";

export function cleanCommand(): void {
  const { root } = requireProjectRoot(process.cwd());
  const buildDir = path.join(root, "build");

  if (!fs.existsSync(buildDir)) {
    logger.info("build/ は既に存在しません。");
    return;
  }

  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  logger.success("build/ を削除しました。");
}

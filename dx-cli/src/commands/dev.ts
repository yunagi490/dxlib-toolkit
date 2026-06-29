import * as fs from "node:fs";
import * as path from "node:path";
import { ChildProcess } from "node:child_process";
import { logger } from "../core/logger";
import { requireProjectRoot } from "../core/config";
import { buildCommand } from "./build";
import { spawnBuiltExecutable } from "./run";

const DEBOUNCE_MS = 300;

export function devCommand(): void {
  const { root, config } = requireProjectRoot(process.cwd());

  if (config.dxlibMode === "stub") {
    logger.warn("stubモードのため実行はできません。ファイル変更時の構文チェックのみ行います。");
  }

  let currentProcess: ChildProcess | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let building = false;
  let rebuildQueued = false;

  function killCurrentProcess(): void {
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill();
      currentProcess = null;
    }
  }

  function rebuildAndRestart(): void {
    if (building) {
      rebuildQueued = true;
      return;
    }
    building = true;
    logger.divider();
    logger.step("変更を検知。再ビルドします...");

    killCurrentProcess();

    const result = buildCommand([]);
    building = false;

    if (rebuildQueued) {
      rebuildQueued = false;
      rebuildAndRestart();
      return;
    }

    if (!result.success) {
      logger.warn("ビルド失敗。修正して保存すると再試行します。");
      return;
    }

    if (config.dxlibMode === "stub") {
      logger.info("(stubモードのため実行はスキップします)");
      return;
    }

    if (result.outputPath && fs.existsSync(result.outputPath)) {
      logger.step("起動中...");
      currentProcess = spawnBuiltExecutable(result.outputPath, root);
      currentProcess.on("exit", (code) => {
        logger.info(`アプリが終了しました (code: ${code ?? "null"})。ファイル変更を待機中...`);
      });
    }
  }

  function scheduleRebuild(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuildAndRestart, DEBOUNCE_MS);
  }

  const srcDir = path.join(root, "src");
  logger.info(`監視中: ${srcDir}`);
  logger.info("Ctrl+C で終了します。");

  watchRecursive(srcDir, scheduleRebuild);

  process.on("SIGINT", () => {
    logger.info("\n終了します。");
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
function watchRecursive(dir: string, onChange: () => void): void {
  if (!fs.existsSync(dir)) return;

  const watch = (target: string) => {
    try {
      fs.watch(target, { persistent: true }, (_event, filename) => {
        if (filename && (filename.endsWith(".cpp") || filename.endsWith(".h") || filename.endsWith(".hpp"))) {
          onChange();
        }
      });
    } catch (e) {
      logger.warn(`監視に失敗しました: ${target} (${(e as Error).message})`);
    }
  };

  watch(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      watchRecursive(path.join(dir, entry.name), onChange);
    }
  }
}

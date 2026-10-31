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
  let lastOutputPath: string | null = null;

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
      lastOutputPath = result.outputPath;
      launch(result.outputPath);
    }
  }

  function launch(outputPath: string): void {
    logger.step("起動中...");
    const proc = spawnBuiltExecutable(outputPath, root);
    currentProcess = proc;
    proc.on("exit", (code) => {
      // 再起動のために自分で止めた場合は、すでに別プロセスに置き換わっているので何も言わない
      if (currentProcess !== proc && currentProcess !== null) return;
      if (currentProcess === proc) currentProcess = null;
      logger.info(`アプリが終了しました (code: ${code ?? "null"})。ファイル変更を待機中...`);
    });
  }

  /**
   * scripts/ の変更時。スクリプトは起動時に読み込まれるだけなので、C++の再ビルドは不要。
   * 実行ファイルを起動し直すだけで反映される。
   */
  function restartOnly(): void {
    if (config.dxlibMode === "stub") return;
    if (building) {
      rebuildQueued = true;
      return;
    }
    if (!lastOutputPath || !fs.existsSync(lastOutputPath)) {
      // まだ一度もビルドできていない場合は通常の再ビルドに任せる
      rebuildAndRestart();
      return;
    }
    logger.divider();
    logger.step("スクリプトの変更を検知。アプリを再起動します...(再ビルドなし)");
    const old = currentProcess;
    currentProcess = null;
    if (old && !old.killed) old.kill();
    launch(lastOutputPath);
  }

  function scheduleRebuild(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuildAndRestart, DEBOUNCE_MS);
  }

  let scriptTimer: NodeJS.Timeout | null = null;
  function scheduleRestart(): void {
    if (scriptTimer) clearTimeout(scriptTimer);
    scriptTimer = setTimeout(restartOnly, DEBOUNCE_MS);
  }

  const srcDir = path.join(root, "src");
  const scriptsDir = path.join(root, "scripts");
  logger.info(`監視中: ${srcDir}`);
  watchRecursive(srcDir, scheduleRebuild, [".cpp", ".h", ".hpp"]);

  if (config.scripting && fs.existsSync(scriptsDir)) {
    logger.info(`監視中: ${scriptsDir} (変更時は再ビルドせずに再起動します)`);
    watchRecursive(scriptsDir, scheduleRestart, [".js"]);
  }
  logger.info("Ctrl+C で終了します。");

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
function watchRecursive(dir: string, onChange: () => void, extensions: string[]): void {
  if (!fs.existsSync(dir)) return;

  const watch = (target: string) => {
    try {
      fs.watch(target, { persistent: true }, (_event, filename) => {
        if (filename && extensions.some((ext) => filename.endsWith(ext))) {
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
      watchRecursive(path.join(dir, entry.name), onChange, extensions);
    }
  }
}
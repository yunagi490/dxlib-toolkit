#!/usr/bin/env node

import { logger } from "../core/logger";
import { createCommand } from "../commands/create";
import { buildCommand } from "../commands/build";
import { runCommand } from "../commands/run";
import { devCommand } from "../commands/dev";
import { testCommand } from "../commands/test";
import { cleanCommand } from "../commands/clean";
import { doctorCommand } from "../commands/doctor";
import { updateCommand } from "../commands/update";
import { addCommand } from "../commands/add";

const HELP_TEXT = `
dx - DxLib プロジェクト用開発CLI

使い方:
  dx create <name> [--mode=windows|native|stub]   新規プロジェクトを作成
  dx dev                                          開発モード(自動ビルド&実行、ファイル監視)
  dx build [--release]                            ビルド(デフォルトはdebug)
  dx run                                          ビルドして実行
  dx test                                         tests/ 配下のテストを実行
  dx clean                                        build/ を削除
  dx update [--vscode-only] [--force]             DxLib本体と.vscode設定を最新化(srcは触りません)
  dx doctor                                       環境診断
  dx add scene <Name>                             シーンを追加 (IScene派生 + .h/.cpp)
  dx add class <Name>                             クラスを追加 (.h/.cpp)
  dx help                                         このヘルプを表示
`;

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  try {
    switch (command) {
      case "create":
        await createCommand(rest[0], rest.slice(1));
        break;
      case "dev":
        devCommand();
        break;
      case "build":
        buildCommand(rest);
        break;
      case "run":
        runCommand(rest);
        break;
      case "test":
        testCommand();
        break;
      case "clean":
        cleanCommand();
        break;
      case "update":
        await updateCommand(rest);
        break;
      case "doctor":
        doctorCommand();
        break;
      case "add":
        addCommand(rest[0], rest[1]);
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        logger.plain(HELP_TEXT);
        break;
      default:
        logger.error(`不明なコマンドです: ${command}`);
        logger.plain(HELP_TEXT);
        process.exitCode = 1;
    }
  } catch (e) {
    logger.error((e as Error).message);
    process.exitCode = 1;
  }
}

main();

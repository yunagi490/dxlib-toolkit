#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../core/logger");
const create_1 = require("../commands/create");
const build_1 = require("../commands/build");
const run_1 = require("../commands/run");
const dev_1 = require("../commands/dev");
const test_1 = require("../commands/test");
const clean_1 = require("../commands/clean");
const doctor_1 = require("../commands/doctor");
const update_1 = require("../commands/update");
const add_1 = require("../commands/add");
const toolchain_1 = require("../core/toolchain");
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
  dx toolchain [status|install [--force]|remove] 管理下MinGWの状態確認/取得/削除(Windows)                                  環境診断
  dx add scene <Name>                             シーンを追加 (IScene派生 + .h/.cpp)
  dx add class <Name>                             クラスを追加 (.h/.cpp)
  dx help                                         このヘルプを表示
`;
async function main() {
    const [, , command, ...rest] = process.argv;
    try {
        switch (command) {
            case "create":
                await (0, create_1.createCommand)(rest[0], rest.slice(1));
                break;
            case "dev":
                (0, dev_1.devCommand)();
                break;
            case "build":
                (0, build_1.buildCommand)(rest);
                break;
            case "run":
                (0, run_1.runCommand)(rest);
                break;
            case "test":
                (0, test_1.testCommand)();
                break;
            case "clean":
                (0, clean_1.cleanCommand)();
                break;
            case "update":
                await (0, update_1.updateCommand)(rest);
                break;
            case "doctor":
                (0, doctor_1.doctorCommand)();
                break;
            case "add":
                (0, add_1.addCommand)(rest[0], rest[1]);
                break;
            case "toolchain":
                (0, toolchain_1.toolchainCommand)(rest);
                break;
            case "help":
            case "--help":
            case "-h":
            case undefined:
                logger_1.logger.plain(HELP_TEXT);
                break;
            default:
                logger_1.logger.error(`不明なコマンドです: ${command}`);
                logger_1.logger.plain(HELP_TEXT);
                process.exitCode = 1;
        }
    }
    catch (e) {
        logger_1.logger.error(e.message);
        process.exitCode = 1;
    }
}
main();

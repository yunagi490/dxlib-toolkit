import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { logger } from "./logger";
import { DxConfig } from "./config";
import { TYPESCRIPT_VERSION } from "../templates/typescript";

/** このプロジェクトのスクリプトがTypeScriptか */
export function isTypeScriptProject(config: DxConfig): boolean {
  return config.scripting?.language === "typescript";
}

export function scriptsDirOf(projectRoot: string): string {
  return path.join(projectRoot, "scripts");
}

/** プロジェクトに入れたtscの入口(純JS)。node で直接実行する。 */
export function tscEntry(projectRoot: string): string {
  return path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
}

export function hasTypeScript(projectRoot: string): boolean {
  return fs.existsSync(tscEntry(projectRoot));
}

/**
 * プロジェクトに typescript を npm で導入する(`npm install --ignore-scripts`)。
 * package.json に書いた固定バージョンだけを入れる。成功したら true。
 */
export function installTypeScript(projectRoot: string): boolean {
  logger.step(`TypeScript ${TYPESCRIPT_VERSION} を npm で導入します (node_modules/)...`);
  try {
    // 固定の文字列のみ。Windows の npm.cmd を呼ぶため shell 経由で実行する。
    execSync("npm install --ignore-scripts --no-audit --no-fund", { cwd: projectRoot, stdio: "inherit" });
  } catch {
    logger.warn("npm install に失敗しました。npm が使える状態か(Node.js 付属)確認してください。");
    logger.warn(`後でプロジェクトのフォルダで \`npm install\` を実行すれば導入できます。`);
    return false;
  }
  if (!hasTypeScript(projectRoot)) {
    logger.warn("npm install は終わりましたが、typescript が見つかりません。");
    return false;
  }
  logger.success("TypeScriptを導入しました。");
  return true;
}

/**
 * scripts/*.ts を scripts/*.js に変換する。
 * 型エラーがあれば tsc の出力をそのまま表示し、false を返す(.js は更新されない)。
 */
export function compileScripts(projectRoot: string): boolean {
  const tsconfig = path.join(scriptsDirOf(projectRoot), "tsconfig.json");
  if (!fs.existsSync(tsconfig)) {
    logger.error("scripts/tsconfig.json がありません。`dx update` で再生成できます。");
    return false;
  }
  if (!hasTypeScript(projectRoot)) {
    logger.error("TypeScript が node_modules にありません。プロジェクトのフォルダで `npm install` を実行してください。");
    return false;
  }
  logger.step("スクリプト(TypeScript)を変換中...");
  const res = spawnSync(process.execPath, [tscEntry(projectRoot), "-p", tsconfig], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (res.status !== 0) {
    logger.error("スクリプトの型エラーがあります(上の表示を直してください)。");
    return false;
  }
  // import / export は、QuickJSが1つのスクリプトとして読み込む都合で使えない。実行時に分かりにくい
  // 構文エラーになる前に、変換後のJSから検出して知らせる。
  const dir = scriptsDirOf(projectRoot);
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    if (!fs.existsSync(path.join(dir, name.slice(0, -3) + ".ts"))) continue;
    const src = fs.readFileSync(path.join(dir, name), "utf-8");
    if (/^\s*(import|export)\b/m.test(src)) {
      logger.error(`scripts/${name.slice(0, -3)}.ts で import / export が使われています。スクリプトでは使えません(グローバルに関数や変数を書いてください)。`);
      return false;
    }
  }
  logger.success("スクリプトを変換しました。");
  return true;
}
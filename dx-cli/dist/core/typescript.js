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
exports.isTypeScriptProject = isTypeScriptProject;
exports.scriptsDirOf = scriptsDirOf;
exports.tscEntry = tscEntry;
exports.hasTypeScript = hasTypeScript;
exports.installTypeScript = installTypeScript;
exports.compileScripts = compileScripts;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("./logger");
const typescript_1 = require("../templates/typescript");
/** このプロジェクトのスクリプトがTypeScriptか */
function isTypeScriptProject(config) {
    return config.scripting?.language === "typescript";
}
function scriptsDirOf(projectRoot) {
    return path.join(projectRoot, "scripts");
}
/** プロジェクトに入れたtscの入口(純JS)。node で直接実行する。 */
function tscEntry(projectRoot) {
    return path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
}
function hasTypeScript(projectRoot) {
    return fs.existsSync(tscEntry(projectRoot));
}
/**
 * プロジェクトに typescript を npm で導入する(`npm install --ignore-scripts`)。
 * package.json に書いた固定バージョンだけを入れる。成功したら true。
 */
function installTypeScript(projectRoot) {
    logger_1.logger.step(`TypeScript ${typescript_1.TYPESCRIPT_VERSION} を npm で導入します (node_modules/)...`);
    try {
        // 固定の文字列のみ。Windows の npm.cmd を呼ぶため shell 経由で実行する。
        (0, node_child_process_1.execSync)("npm install --ignore-scripts --no-audit --no-fund", { cwd: projectRoot, stdio: "inherit" });
    }
    catch {
        logger_1.logger.warn("npm install に失敗しました。npm が使える状態か(Node.js 付属)確認してください。");
        logger_1.logger.warn(`後でプロジェクトのフォルダで \`npm install\` を実行すれば導入できます。`);
        return false;
    }
    if (!hasTypeScript(projectRoot)) {
        logger_1.logger.warn("npm install は終わりましたが、typescript が見つかりません。");
        return false;
    }
    logger_1.logger.success("TypeScriptを導入しました。");
    return true;
}
/**
 * scripts/*.ts を scripts/*.js に変換する。
 * 型エラーがあれば tsc の出力をそのまま表示し、false を返す(.js は更新されない)。
 */
function compileScripts(projectRoot) {
    const tsconfig = path.join(scriptsDirOf(projectRoot), "tsconfig.json");
    if (!fs.existsSync(tsconfig)) {
        logger_1.logger.error("scripts/tsconfig.json がありません。`dx update` で再生成できます。");
        return false;
    }
    if (!hasTypeScript(projectRoot)) {
        logger_1.logger.error("TypeScript が node_modules にありません。プロジェクトのフォルダで `npm install` を実行してください。");
        return false;
    }
    logger_1.logger.step("スクリプト(TypeScript)を変換中...");
    const res = (0, node_child_process_1.spawnSync)(process.execPath, [tscEntry(projectRoot), "-p", tsconfig], {
        cwd: projectRoot,
        stdio: "inherit",
    });
    if (res.status !== 0) {
        logger_1.logger.error("スクリプトの型エラーがあります(上の表示を直してください)。");
        return false;
    }
    // import / export は、QuickJSが1つのスクリプトとして読み込む都合で使えない。実行時に分かりにくい
    // 構文エラーになる前に、変換後のJSから検出して知らせる。
    const dir = scriptsDirOf(projectRoot);
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".js"))
            continue;
        if (!fs.existsSync(path.join(dir, name.slice(0, -3) + ".ts")))
            continue;
        const src = fs.readFileSync(path.join(dir, name), "utf-8");
        if (/^\s*(import|export)\b/m.test(src)) {
            logger_1.logger.error(`scripts/${name.slice(0, -3)}.ts で import / export が使われています。スクリプトでは使えません(グローバルに関数や変数を書いてください)。`);
            return false;
        }
    }
    logger_1.logger.success("スクリプトを変換しました。");
    return true;
}

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
exports.quickjsDir = quickjsDir;
exports.hasQuickJsSources = hasQuickJsSources;
exports.ensureQuickJsSources = ensureQuickJsSources;
exports.ensureQuickJsObject = ensureQuickJsObject;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("./logger");
const manifest_1 = require("./manifest");
const download_1 = require("./download");
const env_1 = require("./env");
// スクリプト層(QuickJS)の取得とビルド。
//  - 取得: 公式リリースのamalgam zipを検証して lib/quickjs/ に展開(dx-cliは再配布しない)
//  - ビルド: 3MB級のCファイルを毎回コンパイルしないよう、build/quickjs.o にキャッシュする
const SOURCE_FILES = ["quickjs-amalgam.c", "quickjs.h", "quickjs-libc.h"];
function quickjsDir(projectRoot) {
    return path.join(projectRoot, "lib", "quickjs");
}
function hasQuickJsSources(projectRoot) {
    const dir = quickjsDir(projectRoot);
    return SOURCE_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}
/** QuickJSのソースを取得して lib/quickjs/ に配置する。成功したらtrue。 */
async function ensureQuickJsSources(projectRoot, opts) {
    if (!opts?.force && hasQuickJsSources(projectRoot))
        return true;
    const zip = await (0, download_1.ensureVerifiedFile)(manifest_1.QUICKJS_AMALGAM, (0, env_1.cacheDir)(), { force: opts?.force });
    if (!zip) {
        logger_1.logger.error("QuickJSを取得できませんでした。ネットワークを確認するか、DX_MIRROR_URL を設定してください。");
        return false;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx_quickjs_"));
    try {
        (0, env_1.extractZip)(zip, tmp);
        const missing = SOURCE_FILES.filter((f) => !fs.existsSync(path.join(tmp, f)));
        if (missing.length > 0) {
            logger_1.logger.error(`QuickJSのzipに想定したファイルがありません: ${missing.join(", ")}`);
            return false;
        }
        const dest = quickjsDir(projectRoot);
        fs.mkdirSync(dest, { recursive: true });
        for (const f of SOURCE_FILES) {
            fs.writeFileSync(path.join(dest, f), fs.readFileSync(path.join(tmp, f)));
        }
        fs.writeFileSync(path.join(dest, "README.txt"), [
            `QuickJS (quickjs-ng) ${manifest_1.QUICKJS_AMALGAM.version}`,
            "https://github.com/quickjs-ng/quickjs",
            "License: MIT (Copyright (c) 2017-2024 Fabrice Bellard, Charlie Gordon, and quickjs-ng contributors)",
            "このフォルダは dx-cli が取得したものです。git管理の対象外(.gitignore)です。",
            "",
        ].join("\n"));
        logger_1.logger.success(`QuickJS ${manifest_1.QUICKJS_AMALGAM.version} を配置しました: ${dest}`);
        return true;
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}
/** g++ と同じフォルダの gcc(Cコンパイラ)。 */
function siblingGcc(gppPath) {
    return path.join(path.dirname(gppPath), process.platform === "win32" ? "gcc.exe" : "gcc");
}
/**
 * QuickJSをオブジェクトファイル(build/quickjs.o)にコンパイルして、そのパスを返す。失敗したらnull。
 * 同じソース・同じgccなら再利用する(build/quickjs.o.key に記録)。
 */
function ensureQuickJsObject(projectRoot, gppPath) {
    const src = path.join(quickjsDir(projectRoot), "quickjs-amalgam.c");
    const buildDir = path.join(projectRoot, "build");
    const obj = path.join(buildDir, "quickjs.o");
    const keyFile = `${obj}.key`;
    const gcc = siblingGcc(gppPath);
    if (!fs.existsSync(src)) {
        logger_1.logger.error("lib/quickjs が見つかりません。`dx update --force` で再取得してください。");
        return null;
    }
    const key = `${manifest_1.QUICKJS_AMALGAM.version}|${manifest_1.QUICKJS_AMALGAM.sha256}|${gcc}|${fs.readFileSync(src).length}`;
    if (fs.existsSync(obj) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, "utf8").trim() === key) {
        return obj;
    }
    fs.mkdirSync(buildDir, { recursive: true });
    logger_1.logger.step("QuickJSをコンパイル中です(初回のみ。数十秒かかることがあります)...");
    fs.rmSync(obj, { force: true });
    fs.rmSync(keyFile, { force: true });
    const r = (0, node_child_process_1.spawnSync)(gcc, ["-c", "-O2", "-w", "-std=gnu11", src, "-o", obj], { stdio: "pipe" });
    if (r.status !== 0 || !fs.existsSync(obj)) {
        const tail = (r.stderr ? r.stderr.toString() : "").split(/\r?\n/).slice(-30).join("\n");
        logger_1.logger.error("QuickJSのコンパイルに失敗しました。");
        if (tail.trim())
            logger_1.logger.plain(tail);
        return null;
    }
    fs.writeFileSync(keyFile, `${key}\n`);
    logger_1.logger.success("QuickJSをコンパイルしました。");
    return obj;
}

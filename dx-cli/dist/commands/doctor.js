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
exports.doctorCommand = doctorCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const compat_1 = require("../core/compat");
const env_1 = require("../core/env");
function doctorCommand() {
    logger_1.logger.divider();
    logger_1.logger.info(`dx doctor — 環境診断 (OS: ${(0, env_1.currentPlatform)()})`);
    logger_1.logger.divider();
    const checks = [];
    // g++
    const gpp = (0, env_1.findGpp)();
    checks.push({
        label: "g++ (MinGW/gcc)",
        ok: gpp !== null,
        detail: gpp ? `${gpp} (${(0, env_1.gppVersion)(gpp) ?? "version unknown"})` : undefined,
        hint: gpp ? undefined : buildGppHint(),
    });
    // デバッガ
    const debuggerInfo = (0, env_1.findDebugger)();
    checks.push({
        label: "デバッガ (gdb/lldb)",
        ok: debuggerInfo !== null,
        detail: debuggerInfo ? `${debuggerInfo.mode}: ${debuggerInfo.path}` : undefined,
        hint: debuggerInfo ? undefined : "デバッグ実行(F5)を使いたい場合はgdb/lldbを別途インストールしてください。",
    });
    // パッケージマネージャ
    if ((0, env_1.currentPlatform)() === "windows") {
        checks.push({
            label: "Chocolatey",
            ok: (0, env_1.hasChocolatey)(),
            hint: (0, env_1.hasChocolatey)() ? undefined : "MinGWの自動インストールにはChocolateyの導入を推奨します。",
        });
    }
    else {
        const pkgMgr = (0, env_1.detectUnixPkgManager)();
        checks.push({
            label: "パッケージマネージャ",
            ok: pkgMgr !== "none",
            detail: pkgMgr !== "none" ? pkgMgr : undefined,
            hint: pkgMgr === "none" ? "brew/apt/dnf/pacmanのいずれかが見つかりませんでした。" : undefined,
        });
    }
    // キャッシュディレクトリ・DxLib zip
    const cache = (0, env_1.cacheDir)();
    checks.push({
        label: "dx-setup キャッシュフォルダ",
        ok: fs.existsSync(cache),
        detail: cache,
    });
    const cachedZip = (0, env_1.findCachedDxLibZip)();
    checks.push({
        label: "DxLib(Windows gcc版) zip キャッシュ",
        ok: cachedZip !== null,
        detail: cachedZip ?? undefined,
        hint: cachedZip ? undefined : "未取得です。`dx create`または`dx update`時に自動取得されます。",
    });
    if ((0, env_1.currentPlatform)() !== "windows") {
        const nativeSrc = (0, env_1.nativeDxLibSourceDir)();
        checks.push({
            label: "dxlib-for-linux ソース",
            ok: fs.existsSync(path.join(nativeSrc, ".git")),
            detail: fs.existsSync(nativeSrc) ? nativeSrc : undefined,
            hint: fs.existsSync(path.join(nativeSrc, ".git")) ? undefined : "nativeモードを使う場合は `dx create --mode=native` 等でcloneされます。",
        });
    }
    // プロジェクト設定(カレントディレクトリがdxプロジェクト内かどうか)
    const root = (0, config_1.findProjectRoot)(process.cwd());
    if (root) {
        const config = (0, config_1.readConfig)(root);
        checks.push({
            label: "dx.config.json",
            ok: config !== null,
            detail: config ? `name=${config.name}, mode=${config.dxlibMode}` : undefined,
        });
        if (config) {
            const dxlibDir = path.join(root, "lib", "DxLib");
            const headerPath = config.dxlibMode === "native"
                ? path.join(dxlibDir, "include", "DxLib.h")
                : path.join(dxlibDir, "DxLib.h");
            checks.push({
                label: "lib/DxLib (プロジェクト内配置)",
                ok: fs.existsSync(headerPath),
                detail: fs.existsSync(headerPath) ? headerPath : undefined,
                hint: fs.existsSync(headerPath) ? undefined : "`dx update` でDxLibの再配置を試みてください。",
            });
            if (config.dxlibMode === "windows") {
                if (!config.dxlib) {
                    checks.push({
                        label: "DxLibライブラリの記録",
                        ok: true,
                        detail: "記録なし(`dx update` を実行すると記録され、g++との食い違いを検出できます)",
                    });
                }
                else {
                    const lib = (0, compat_1.parseLibFolder)(config.dxlib.libFolder);
                    const gppInfo = gpp ? (0, compat_1.inspectGpp)(gpp) : null;
                    const issues = lib && gppInfo ? (0, compat_1.checkCompat)(lib, gppInfo) : [];
                    const warns = issues.filter((i) => i.level === "warn");
                    checks.push({
                        label: "DxLibライブラリとg++の組み合わせ",
                        ok: warns.length === 0,
                        detail: `DxLib ${config.dxlib.version} / ${config.dxlib.libFolder}`,
                        hint: warns.length === 0 ? undefined : `${warns.map((i) => i.message).join(" ")} 合うMinGWは \`dx toolchain install\` で取得できます。`,
                    });
                    for (const i of issues.filter((x) => x.level === "info"))
                        logger_1.logger.info(i.message);
                }
            }
        }
    }
    else {
        checks.push({
            label: "現在のディレクトリ",
            ok: false,
            detail: "dxプロジェクト外です(参考情報、エラーではありません)",
        });
    }
    // 結果表示
    for (const c of checks) {
        const mark = c.ok ? logger_1.color.green("✓") : logger_1.color.red("✗");
        logger_1.logger.plain(`  ${mark} ${c.label}${c.detail ? logger_1.color.gray(`  (${c.detail})`) : ""}`);
        if (!c.ok && c.hint) {
            logger_1.logger.plain(`      ${logger_1.color.yellow("→")} ${c.hint}`);
        }
    }
    logger_1.logger.divider();
    const failedCount = checks.filter((c) => !c.ok && c.label !== "現在のディレクトリ").length;
    if (failedCount === 0) {
        logger_1.logger.success("問題は見つかりませんでした。");
    }
    else {
        logger_1.logger.warn(`${failedCount}件の項目を確認してください。`);
    }
}
function buildGppHint() {
    if ((0, env_1.currentPlatform)() === "windows") {
        return "MinGWが見つかりません。`dx toolchain install` でDxLibと一致するMinGW-w64を取得できます(または自分で導入してPATHに通してください)。";
    }
    if ((0, env_1.currentPlatform)() === "macos") {
        return "g++が見つかりません。`brew install gcc` を試してください(あるいはXcode Command Line Tools)。";
    }
    return "g++が見つかりません。`sudo apt install g++` 等でインストールしてください。";
}

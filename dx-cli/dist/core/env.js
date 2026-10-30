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
exports.NATIVE_DEPS = exports.DXLIB_FOR_LINUX_REPO = void 0;
exports.currentPlatform = currentPlatform;
exports.cacheDir = cacheDir;
exports.ensureDir = ensureDir;
exports.findGpp = findGpp;
exports.findDebugger = findDebugger;
exports.gppVersion = gppVersion;
exports.gppArch = gppArch;
exports.hasChocolatey = hasChocolatey;
exports.detectUnixPkgManager = detectUnixPkgManager;
exports.findCachedDxLibZip = findCachedDxLibZip;
exports.ensureDxLibWindowsZip = ensureDxLibWindowsZip;
exports.extractZip = extractZip;
exports.findGccVersionRoot = findGccVersionRoot;
exports.pickBestVersionFolder = pickBestVersionFolder;
exports.copyRecursive = copyRecursive;
exports.nativeDxLibSourceDir = nativeDxLibSourceDir;
exports.cloneOrUpdateDxLibForLinux = cloneOrUpdateDxLibForLinux;
exports.buildDxLibForLinux = buildDxLibForLinux;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const node_child_process_1 = require("node:child_process");
const logger_1 = require("./logger");
const manifest_1 = require("./manifest");
const download_1 = require("./download");
const toolchain_1 = require("./toolchain");
function currentPlatform() {
    switch (process.platform) {
        case "win32":
            return "windows";
        case "darwin":
            return "macos";
        default:
            return "linux";
    }
}
/** dx-cli独自のキャッシュディレクトリ。旧vbs/shスクリプトと同じ場所(~/.dxlib-setup/cache)を共有し、二重ダウンロードを避ける。 */
function cacheDir() {
    return path.join(os.homedir(), ".dxlib-setup", "cache");
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
// ----------------------------------------------------------------------------
// コンパイラ・デバッガ検出
// ----------------------------------------------------------------------------
function tryWhich(cmd) {
    try {
        const finder = currentPlatform() === "windows" ? "where" : "which";
        const out = (0, node_child_process_1.execSync)(`${finder} ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        const first = out.split(/\r?\n/)[0]?.trim();
        return first && fs.existsSync(first) ? first : null;
    }
    catch {
        return null;
    }
}
const WINDOWS_GPP_CANDIDATES = [
    "C:\\MinGW\\bin\\g++.exe",
    "C:\\msys64\\mingw64\\bin\\g++.exe",
    "C:\\msys64\\mingw32\\bin\\g++.exe",
    "C:\\ProgramData\\chocolatey\\lib\\mingw\\tools\\install\\mingw64\\bin\\g++.exe",
    "C:\\ProgramData\\mingw64\\mingw64\\bin\\g++.exe",
    "C:\\Program Files\\mingw-w64\\bin\\g++.exe",
];
function findGpp() {
    const exeName = currentPlatform() === "windows" ? "g++.exe" : "g++";
    const fromPath = tryWhich(exeName);
    if (fromPath)
        return fromPath;
    if (currentPlatform() === "windows") {
        for (const candidate of WINDOWS_GPP_CANDIDATES) {
            if (fs.existsSync(candidate))
                return candidate;
        }
        // 上記で見つからない時だけ、dx-cliが取得した管理下ツールチェーンを使う(既存のMinGWを優先)
        return (0, toolchain_1.managedGppIfPresent)();
    }
    return null;
}
function findDebugger() {
    if (currentPlatform() === "windows") {
        const gppPath = findGpp();
        if (gppPath) {
            const gdbPath = path.join(path.dirname(gppPath), "gdb.exe");
            if (fs.existsSync(gdbPath))
                return { mode: "gdb", path: gdbPath };
        }
        const gdb = tryWhich("gdb.exe");
        if (gdb)
            return { mode: "gdb", path: gdb };
        return null;
    }
    const lldb = tryWhich("lldb");
    if (lldb)
        return { mode: "lldb", path: lldb };
    const gdb = tryWhich("gdb");
    if (gdb)
        return { mode: "gdb", path: gdb };
    return null;
}
function gppVersion(gppPath) {
    try {
        const out = (0, node_child_process_1.execFileSync)(gppPath, ["-dumpversion"], { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        return out || null;
    }
    catch {
        return null;
    }
}
/** g++ のターゲットアーキテクチャ(`g++ -dumpmachine` の先頭要素)。判別できなければnull。 */
function gppArch(gppPath) {
    try {
        const out = (0, node_child_process_1.execFileSync)(gppPath, ["-dumpmachine"], { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        if (out.startsWith("x86_64"))
            return "x86_64";
        if (/^i[3-6]86/.test(out))
            return "i686";
        return null;
    }
    catch {
        return null;
    }
}
function hasChocolatey() {
    return tryWhich("choco.exe") !== null;
}
function detectUnixPkgManager() {
    if (tryWhich("brew"))
        return "brew";
    if (tryWhich("apt-get"))
        return "apt";
    if (tryWhich("dnf"))
        return "dnf";
    if (tryWhich("pacman"))
        return "pacman";
    return "none";
}
// ----------------------------------------------------------------------------
// DxLib (Windows gcc版) のダウンロード・キャッシュ
// ----------------------------------------------------------------------------
const DXLIB_DOWNLOAD_PAGE = "https://dxlib.xsrv.jp/dxdload.html";
const DXLIB_BASE_URL = "https://dxlib.xsrv.jp/";
const USER_AGENT = "Mozilla/5.0 (compatible; dx-cli-setup-script)";
/**
 * キャッシュ内の使えるDxLib zipを探す。マニフェストで固定したファイルを最優先し、
 * 無ければ名前に dxlib を含む zip(手動配置・旧バージョン)を新しい順に調べる。
 * いずれも壊れたもの(サイズ不足・zip構造不正・ハッシュ不一致)は返さない。
 */
function findCachedDxLibZip() {
    const dir = cacheDir();
    if (!fs.existsSync(dir))
        return null;
    const pinned = path.join(dir, manifest_1.DXLIB_WINDOWS_GCC.fileName);
    if (fs.existsSync(pinned) && (0, download_1.verifyCachedEntry)(pinned, manifest_1.DXLIB_WINDOWS_GCC).ok) {
        return pinned;
    }
    const candidates = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".zip") && f.toLowerCase().includes("dxlib"))
        .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    // sidecar(初回取得時のハッシュ記録)があれば照合し、無ければ構造チェックのみ(手動配置のzip)
    const generic = { ...manifest_1.DXLIB_WINDOWS_GCC, sha256: undefined };
    for (const c of candidates) {
        if (c.f.toLowerCase() === manifest_1.DXLIB_WINDOWS_GCC.fileName.toLowerCase())
            continue; // 固定ファイルは上で判定済み
        const full = path.join(dir, c.f);
        if ((0, download_1.verifyCachedEntry)(full, generic).ok)
            return full;
    }
    return null;
}
function extractMinGwZipUrl(html) {
    // パターン1: <a href="...zip">テキスト</a> で テキストにGnu/MinGWを含むもの
    const anchorRe = /<a[^>]+href=["']([^"']+\.zip)["'][^>]*>([^<]*)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(html)) !== null) {
        const href = m[1];
        const text = m[2];
        const lowerText = text.toLowerCase();
        if ((lowerText.includes("mingw") || text.includes("Gnu") || text.includes("ＧｎｕＣ")) &&
            !lowerText.includes("android") &&
            !lowerText.includes("ios")) {
            return href;
        }
    }
    // パターン2: ファイル名にgccを含むzip
    const gccRe = /href=["']([^"']*[Gg][Cc][Cc][^"']*\.zip)["']/;
    const gccMatch = html.match(gccRe);
    if (gccMatch)
        return gccMatch[1];
    // 以前は「JS埋め込みのzipなら何でも」というパターン3があったが、無関係なzipを拾う恐れがあるため廃止した。
    return null;
}
function toAbsoluteUrl(url) {
    if (url.startsWith("http"))
        return url;
    if (url.startsWith("/"))
        return `https://dxlib.xsrv.jp${url}`;
    return `${DXLIB_BASE_URL}${url}`;
}
/**
 * DxLib(Windows版 gcc用)のzipを取得する。優先順位は次のとおり。
 *  1. マニフェスト(core/manifest.ts)で固定したバージョン。複数の取得元を順に試し、
 *     サイズ・zip構造・SHA-256を検証してからキャッシュする
 *  2. キャッシュ内の既存zip(手動配置や旧バージョン)。ネットワークに繋がらないときの保険
 *  3. 公式ダウンロードページからのリンク抽出。最終手段で、バージョンもハッシュも固定できない
 * すべて失敗した場合はnullを返し、呼び出し側で手動DLを案内する。
 */
async function ensureDxLibWindowsZip(opts) {
    ensureDir(cacheDir());
    const pinned = await (0, download_1.ensureVerifiedZip)(manifest_1.DXLIB_WINDOWS_GCC, cacheDir(), { force: opts?.forceRedownload });
    if (pinned)
        return pinned;
    const existing = findCachedDxLibZip();
    if (existing) {
        logger_1.logger.warn(`固定バージョン(${manifest_1.DXLIB_WINDOWS_GCC.version})を取得できなかったため、キャッシュ内の既存zipを使用します: ${existing}`);
        return existing;
    }
    return scrapeAndDownloadDxLibZip();
}
async function scrapeAndDownloadDxLibZip() {
    logger_1.logger.step("固定URLからの取得に失敗したため、公式ダウンロードページからリンクを探します(最終手段)...");
    let html;
    try {
        const res = await fetch(DXLIB_DOWNLOAD_PAGE, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
            logger_1.logger.warn(`ページ取得に失敗しました (HTTP ${res.status})`);
            return null;
        }
        html = await res.text();
    }
    catch (e) {
        logger_1.logger.warn(`ページ取得に失敗しました: ${e.message}`);
        return null;
    }
    const zipUrlRaw = extractMinGwZipUrl(html);
    if (!zipUrlRaw) {
        logger_1.logger.warn("ダウンロードページからzipリンクを自動抽出できませんでした。");
        return null;
    }
    const zipUrl = toAbsoluteUrl(zipUrlRaw);
    logger_1.logger.warn("このzipはバージョンもハッシュも固定されていません。");
    const safeName = path.basename(zipUrl).replace(/[^A-Za-z0-9._-]/g, "_");
    return (0, download_1.ensureVerifiedZip)({
        id: "dxlib-windows-gcc-scraped",
        version: "unknown",
        fileName: `dxlib_scraped_${safeName}`,
        sources: [zipUrl],
        minBytes: manifest_1.DXLIB_WINDOWS_GCC.minBytes,
    }, cacheDir());
}
// ----------------------------------------------------------------------------
// zip展開 (OS標準コマンドに委譲: unzip / PowerShell Expand-Archive)
// ----------------------------------------------------------------------------
function extractZip(zipPath, destDir) {
    ensureDir(destDir);
    if (currentPlatform() === "windows") {
        // PowerShell 5+ 標準のExpand-Archiveを使用(Windows 10/11に標準搭載)
        const psCommand = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`;
        const result = (0, node_child_process_1.spawnSync)("powershell", ["-NoProfile", "-Command", psCommand], { stdio: "pipe" });
        if (result.status !== 0) {
            throw new Error(`zip展開に失敗しました: ${result.stderr?.toString() ?? "unknown error"}`);
        }
    }
    else {
        const result = (0, node_child_process_1.spawnSync)("unzip", ["-q", "-o", zipPath, "-d", destDir], { stdio: "pipe" });
        if (result.status !== 0) {
            throw new Error(`unzipに失敗しました: ${result.stderr?.toString() ?? "unknown error"}`);
        }
    }
}
/** DxLibのコンパイラバージョン別フォルダの名前(例: 12_2_0_x86_64_release_win32_seh_ucrt_rt_v10_rev2, 4_8_1)。 */
const GCC_VERSION_DIR_RE = /^\d+_\d+_\d+/;
function subDirNames(dir) {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return [];
    }
}
/**
 * 展開したDxLib zipから、コンパイラバージョン別フォルダが並んでいる親フォルダを探す(幅優先)。
 * フォルダ名(日本語名や "GCC" を含むか)には頼らず、「<数字>_<数字>_<数字>…」という名前の子フォルダの有無で判定するので、
 * zipのフォルダ名や文字コードが変わっても影響を受けない。
 * (以前は名前に "GCC" を含む最初のフォルダを選んでいたため、zip最上位の DxLib_GCC を拾って誤った場所を配置していた)
 */
function findGccVersionRoot(rootDir, maxDepth = 4) {
    let level = [rootDir];
    for (let depth = 0; depth <= maxDepth; depth++) {
        const next = [];
        for (const dir of level) {
            const names = subDirNames(dir);
            if (names.some((n) => GCC_VERSION_DIR_RE.test(n)))
                return dir;
            for (const n of names)
                next.push(path.join(dir, n));
        }
        level = next;
    }
    return null;
}
function compareVersionDesc(a, b) {
    const pa = a.split("_").slice(0, 3).map((s) => parseInt(s, 10) || 0);
    const pb = b.split("_").slice(0, 3).map((s) => parseInt(s, 10) || 0);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i])
            return pb[i] - pa[i];
    }
    return 0;
}
/**
 * コンパイラバージョン別フォルダのうち、手元のg++に最も合うものを選ぶ。採点の優先順位:
 *  1. g++のバージョンが完全一致(メジャー・マイナー・パッチ) → 最優先
 *  2. メジャーが一致 → 次点。一致しない場合は、メジャーが近いほど有利
 *  3. アーキテクチャ(x86_64 / i686)が g++ のターゲットと同じなら加点、違えば大きく減点
 *     (32bit用ライブラリを64bitのg++で使うとリンクできないため)
 * 同点なら新しいバージョンを選ぶ。g++が無い場合は x86_64 を想定する。
 */
function pickBestVersionFolder(gccFolder, gppPath) {
    const candidates = subDirNames(gccFolder).filter((n) => GCC_VERSION_DIR_RE.test(n));
    if (candidates.length === 0)
        return null;
    const version = gppPath ? gppVersion(gppPath) : null;
    const [majorStr, minorStr, patchStr] = version ? version.split(".") : [];
    const major = majorStr ? parseInt(majorStr, 10) : NaN;
    const arch = (gppPath ? gppArch(gppPath) : null) ?? "x86_64";
    const otherArch = arch === "x86_64" ? "i686" : "x86_64";
    const score = (name) => {
        const parts = name.split("_");
        let s = 0;
        if (!Number.isNaN(major)) {
            const candMajor = parseInt(parts[0], 10);
            if (candMajor === major) {
                s += 50;
                if (minorStr !== undefined && patchStr !== undefined && parts[1] === minorStr && parts[2] === patchStr) {
                    s += 100;
                }
            }
            else {
                s -= Math.min(Math.abs(candMajor - major), 40);
            }
        }
        if (name.includes(arch))
            s += 20;
        if (name.includes(otherArch))
            s -= 50;
        return s;
    };
    candidates.sort((a, b) => score(b) - score(a) || compareVersionDesc(a, b) || (a < b ? -1 : a > b ? 1 : 0));
    return path.join(gccFolder, candidates[0]);
}
function copyRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(s, d);
        }
        else {
            fs.copyFileSync(s, d);
        }
    }
}
// ----------------------------------------------------------------------------
// dxlib-for-linux (dra様作, native実機ビルド用)
// ----------------------------------------------------------------------------
exports.DXLIB_FOR_LINUX_REPO = "https://github.com/dragoon2014/dxlib-for-linux.git";
function nativeDxLibSourceDir() {
    return path.join(cacheDir(), "dxlib-for-linux");
}
function cloneOrUpdateDxLibForLinux() {
    const dir = nativeDxLibSourceDir();
    if (fs.existsSync(path.join(dir, ".git"))) {
        logger_1.logger.step(`既存のdxlib-for-linuxを更新します: ${dir}`);
        const result = (0, node_child_process_1.spawnSync)("git", ["pull", "--ff-only"], { cwd: dir, stdio: "inherit" });
        if (result.status !== 0) {
            logger_1.logger.warn("更新に失敗しましたが、既存のものを使用します。");
        }
    }
    else {
        ensureDir(cacheDir());
        logger_1.logger.step("dxlib-for-linux をcloneしています...");
        const result = (0, node_child_process_1.spawnSync)("git", ["clone", exports.DXLIB_FOR_LINUX_REPO, dir], { stdio: "inherit" });
        if (result.status !== 0) {
            throw new Error("dxlib-for-linuxのcloneに失敗しました。");
        }
    }
}
function buildDxLibForLinux() {
    const dir = nativeDxLibSourceDir();
    logger_1.logger.step("dxlib-for-linux をビルドしています (make patch && make)...");
    const patchResult = (0, node_child_process_1.spawnSync)("make", ["patch"], { cwd: dir, stdio: "inherit" });
    if (patchResult.status !== 0) {
        throw new Error("make patch に失敗しました。");
    }
    const cpuCount = os.cpus()?.length || 2;
    const buildResult = (0, node_child_process_1.spawnSync)("make", [`-j${cpuCount}`], { cwd: dir, stdio: "inherit" });
    if (buildResult.status !== 0) {
        throw new Error("dxlib-for-linuxのビルドに失敗しました。依存パッケージを確認してください。");
    }
}
exports.NATIVE_DEPS = {
    apt: [
        "git",
        "g++",
        "unzip",
        "make",
        "wget",
        "libtiff-dev",
        "libopenal-dev",
        "libvorbis-dev",
        "libopusfile-dev",
        "libtheora-dev",
        "libpng-dev",
        "libegl-dev",
        "libgles-dev",
        "libx11-dev",
    ],
    dnf: [
        "git",
        "gcc-c++",
        "unzip",
        "make",
        "wget",
        "libtiff-devel",
        "openal-soft-devel",
        "libvorbis-devel",
        "opusfile-devel",
        "libtheora-devel",
        "libpng-devel",
        "mesa-libEGL-devel",
        "mesa-libGLES-devel",
        "libX11-devel",
    ],
    pacman: ["git", "gcc", "unzip", "make", "wget", "libtiff", "openal", "libvorbis", "opusfile", "libtheora", "libpng", "libglvnd", "libx11"],
};

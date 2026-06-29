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
exports.hasChocolatey = hasChocolatey;
exports.detectUnixPkgManager = detectUnixPkgManager;
exports.findCachedDxLibZip = findCachedDxLibZip;
exports.ensureDxLibWindowsZip = ensureDxLibWindowsZip;
exports.extractZip = extractZip;
exports.findFolderRecursive = findFolderRecursive;
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
function findCachedDxLibZip() {
    const dir = cacheDir();
    if (!fs.existsSync(dir))
        return null;
    const candidates = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".zip") && f.toLowerCase().includes("dxlib"))
        .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    return candidates.length > 0 ? path.join(dir, candidates[0].f) : null;
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
    // パターン3: JS埋め込み(onclick="location.href='...zip'"等)
    const jsRe = /(?:href|location\.href|location)\s*=?\s*["']([^"']+\.zip)["']/gi;
    while ((m = jsRe.exec(html)) !== null) {
        const lower = m[1].toLowerCase();
        if (!lower.includes("android") && !lower.includes("ios")) {
            return m[1];
        }
    }
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
 * DxLib(Windows版 gcc用)のzipを取得する。キャッシュがあれば再利用し、
 * 無ければダウンロードページからリンクを抽出してダウンロードする。
 * 自動抽出に失敗した場合はnullを返し、呼び出し側で手動DLを案内する。
 */
async function ensureDxLibWindowsZip(opts) {
    if (!opts?.forceRedownload) {
        const cached = findCachedDxLibZip();
        if (cached) {
            logger_1.logger.info(`キャッシュ済みのDxLib zipを使用します: ${cached}`);
            return cached;
        }
    }
    logger_1.logger.step("DxLibのダウンロードページを取得しています...");
    let html;
    try {
        const res = await fetch(DXLIB_DOWNLOAD_PAGE, { headers: { "User-Agent": USER_AGENT } });
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
    logger_1.logger.step(`ダウンロード中: ${zipUrl}`);
    ensureDir(cacheDir());
    const dest = path.join(cacheDir(), `dxlib_gcc_${timestamp()}.zip`);
    try {
        const res = await fetch(zipUrl, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            logger_1.logger.warn(`ダウンロードに失敗しました (HTTP ${res.status})`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        logger_1.logger.success(`ダウンロード完了: ${dest}`);
        return dest;
    }
    catch (e) {
        logger_1.logger.warn(`ダウンロードに失敗しました: ${e.message}`);
        return null;
    }
}
function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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
/** ディレクトリを再帰的に探索し、名前にkeywordを含む最初のフォルダを返す(深さ3まで)。 */
function findFolderRecursive(rootDir, keyword, maxDepth = 3) {
    function walk(dir, depth) {
        if (depth > maxDepth)
            return null;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return null;
        }
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.includes(keyword)) {
                return path.join(dir, entry.name);
            }
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const found = walk(path.join(dir, entry.name), depth + 1);
                if (found)
                    return found;
            }
        }
        return null;
    }
    return walk(rootDir, 0);
}
/** GCC(MinGW)用フォルダ内のコンパイラバージョン別サブフォルダから、g++のバージョンに最も近いものを選ぶ。 */
function pickBestVersionFolder(gccFolder, gppPath) {
    const entries = fs
        .readdirSync(gccFolder, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    if (entries.length === 0)
        return null;
    const version = gppPath ? gppVersion(gppPath) : null;
    const major = version ? version.split(".")[0] : null;
    if (major) {
        const exactMatch = entries.find((name) => name.split("_")[0] === major);
        if (exactMatch)
            return path.join(gccFolder, exactMatch);
    }
    // フォールバック: 最初に見つかったもの
    entries.sort();
    return path.join(gccFolder, entries[0]);
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

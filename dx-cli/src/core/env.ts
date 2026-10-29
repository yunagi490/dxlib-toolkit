import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, execFileSync, spawnSync } from "node:child_process";
import { logger } from "./logger";
import { DXLIB_WINDOWS_GCC } from "./manifest";
import { ensureVerifiedZip, verifyCachedEntry, verifyZipFile } from "./download";

export type Platform = "windows" | "macos" | "linux";

export function currentPlatform(): Platform {
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
export function cacheDir(): string {
  return path.join(os.homedir(), ".dxlib-setup", "cache");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ----------------------------------------------------------------------------
// コンパイラ・デバッガ検出
// ----------------------------------------------------------------------------

function tryWhich(cmd: string): string | null {
  try {
    const finder = currentPlatform() === "windows" ? "where" : "which";
    const out = execSync(`${finder} ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const first = out.split(/\r?\n/)[0]?.trim();
    return first && fs.existsSync(first) ? first : null;
  } catch {
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

export function findGpp(): string | null {
  const exeName = currentPlatform() === "windows" ? "g++.exe" : "g++";
  const fromPath = tryWhich(exeName);
  if (fromPath) return fromPath;

  if (currentPlatform() === "windows") {
    for (const candidate of WINDOWS_GPP_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function findDebugger(): { mode: "gdb" | "lldb"; path: string } | null {
  if (currentPlatform() === "windows") {
    const gppPath = findGpp();
    if (gppPath) {
      const gdbPath = path.join(path.dirname(gppPath), "gdb.exe");
      if (fs.existsSync(gdbPath)) return { mode: "gdb", path: gdbPath };
    }
    const gdb = tryWhich("gdb.exe");
    if (gdb) return { mode: "gdb", path: gdb };
    return null;
  }

  const lldb = tryWhich("lldb");
  if (lldb) return { mode: "lldb", path: lldb };
  const gdb = tryWhich("gdb");
  if (gdb) return { mode: "gdb", path: gdb };
  return null;
}

export function gppVersion(gppPath: string): string | null {
  try {
    const out = execFileSync(gppPath, ["-dumpversion"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

export function hasChocolatey(): boolean {
  return tryWhich("choco.exe") !== null;
}

export function detectUnixPkgManager(): "brew" | "apt" | "dnf" | "pacman" | "none" {
  if (tryWhich("brew")) return "brew";
  if (tryWhich("apt-get")) return "apt";
  if (tryWhich("dnf")) return "dnf";
  if (tryWhich("pacman")) return "pacman";
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
export function findCachedDxLibZip(): string | null {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) return null;

  const pinned = path.join(dir, DXLIB_WINDOWS_GCC.fileName);
  if (fs.existsSync(pinned) && verifyCachedEntry(pinned, DXLIB_WINDOWS_GCC).ok) {
    return pinned;
  }

  const candidates = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".zip") && f.toLowerCase().includes("dxlib"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  // sidecar(初回取得時のハッシュ記録)があれば照合し、無ければ構造チェックのみ(手動配置のzip)
  const generic = { ...DXLIB_WINDOWS_GCC, sha256: undefined };
  for (const c of candidates) {
    if (c.f.toLowerCase() === DXLIB_WINDOWS_GCC.fileName.toLowerCase()) continue; // 固定ファイルは上で判定済み
    const full = path.join(dir, c.f);
    if (verifyCachedEntry(full, generic).ok) return full;
  }
  return null;
}

function extractMinGwZipUrl(html: string): string | null {
  // パターン1: <a href="...zip">テキスト</a> で テキストにGnu/MinGWを含むもの
  const anchorRe = /<a[^>]+href=["']([^"']+\.zip)["'][^>]*>([^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const text = m[2];
    const lowerText = text.toLowerCase();
    if (
      (lowerText.includes("mingw") || text.includes("Gnu") || text.includes("ＧｎｕＣ")) &&
      !lowerText.includes("android") &&
      !lowerText.includes("ios")
    ) {
      return href;
    }
  }

  // パターン2: ファイル名にgccを含むzip
  const gccRe = /href=["']([^"']*[Gg][Cc][Cc][^"']*\.zip)["']/;
  const gccMatch = html.match(gccRe);
  if (gccMatch) return gccMatch[1];

  // 以前は「JS埋め込みのzipなら何でも」というパターン3があったが、無関係なzipを拾う恐れがあるため廃止した。
  return null;
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `https://dxlib.xsrv.jp${url}`;
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
export async function ensureDxLibWindowsZip(opts?: { forceRedownload?: boolean }): Promise<string | null> {
  ensureDir(cacheDir());

  const pinned = await ensureVerifiedZip(DXLIB_WINDOWS_GCC, cacheDir(), { force: opts?.forceRedownload });
  if (pinned) return pinned;

  const existing = findCachedDxLibZip();
  if (existing) {
    logger.warn(`固定バージョン(${DXLIB_WINDOWS_GCC.version})を取得できなかったため、キャッシュ内の既存zipを使用します: ${existing}`);
    return existing;
  }

  return scrapeAndDownloadDxLibZip();
}

async function scrapeAndDownloadDxLibZip(): Promise<string | null> {
  logger.step("固定URLからの取得に失敗したため、公式ダウンロードページからリンクを探します(最終手段)...");
  let html: string;
  try {
    const res = await fetch(DXLIB_DOWNLOAD_PAGE, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      logger.warn(`ページ取得に失敗しました (HTTP ${res.status})`);
      return null;
    }
    html = await res.text();
  } catch (e) {
    logger.warn(`ページ取得に失敗しました: ${(e as Error).message}`);
    return null;
  }

  const zipUrlRaw = extractMinGwZipUrl(html);
  if (!zipUrlRaw) {
    logger.warn("ダウンロードページからzipリンクを自動抽出できませんでした。");
    return null;
  }
  const zipUrl = toAbsoluteUrl(zipUrlRaw);

  logger.warn("このzipはバージョンもハッシュも固定されていません。");
  const safeName = path.basename(zipUrl).replace(/[^A-Za-z0-9._-]/g, "_");
  return ensureVerifiedZip(
    {
      id: "dxlib-windows-gcc-scraped",
      version: "unknown",
      fileName: `dxlib_scraped_${safeName}`,
      sources: [zipUrl],
      minBytes: DXLIB_WINDOWS_GCC.minBytes,
    },
    cacheDir()
  );
}

// ----------------------------------------------------------------------------
// zip展開 (OS標準コマンドに委譲: unzip / PowerShell Expand-Archive)
// ----------------------------------------------------------------------------

export function extractZip(zipPath: string, destDir: string): void {
  ensureDir(destDir);
  if (currentPlatform() === "windows") {
    // PowerShell 5+ 標準のExpand-Archiveを使用(Windows 10/11に標準搭載)
    const psCommand = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`;
    const result = spawnSync("powershell", ["-NoProfile", "-Command", psCommand], { stdio: "pipe" });
    if (result.status !== 0) {
      throw new Error(`zip展開に失敗しました: ${result.stderr?.toString() ?? "unknown error"}`);
    }
  } else {
    const result = spawnSync("unzip", ["-q", "-o", zipPath, "-d", destDir], { stdio: "pipe" });
    if (result.status !== 0) {
      throw new Error(`unzipに失敗しました: ${result.stderr?.toString() ?? "unknown error"}`);
    }
  }
}

/** ディレクトリを再帰的に探索し、名前にkeywordを含む最初のフォルダを返す(深さ3まで)。 */
export function findFolderRecursive(rootDir: string, keyword: string, maxDepth = 3): string | null {
  function walk(dir: string, depth: number): string | null {
    if (depth > maxDepth) return null;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
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
        if (found) return found;
      }
    }
    return null;
  }
  return walk(rootDir, 0);
}

/** GCC(MinGW)用フォルダ内のコンパイラバージョン別サブフォルダから、g++のバージョンに最も近いものを選ぶ。 */
export function pickBestVersionFolder(gccFolder: string, gppPath: string | null): string | null {
  const entries = fs
    .readdirSync(gccFolder, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (entries.length === 0) return null;

  const version = gppPath ? gppVersion(gppPath) : null;
  const major = version ? version.split(".")[0] : null;

  if (major) {
    const exactMatch = entries.find((name) => name.split("_")[0] === major);
    if (exactMatch) return path.join(gccFolder, exactMatch);
  }

  // フォールバック: 最初に見つかったもの
  entries.sort();
  return path.join(gccFolder, entries[0]);
}

export function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ----------------------------------------------------------------------------
// dxlib-for-linux (dra様作, native実機ビルド用)
// ----------------------------------------------------------------------------

export const DXLIB_FOR_LINUX_REPO = "https://github.com/dragoon2014/dxlib-for-linux.git";

export function nativeDxLibSourceDir(): string {
  return path.join(cacheDir(), "dxlib-for-linux");
}

export function cloneOrUpdateDxLibForLinux(): void {
  const dir = nativeDxLibSourceDir();
  if (fs.existsSync(path.join(dir, ".git"))) {
    logger.step(`既存のdxlib-for-linuxを更新します: ${dir}`);
    const result = spawnSync("git", ["pull", "--ff-only"], { cwd: dir, stdio: "inherit" });
    if (result.status !== 0) {
      logger.warn("更新に失敗しましたが、既存のものを使用します。");
    }
  } else {
    ensureDir(cacheDir());
    logger.step("dxlib-for-linux をcloneしています...");
    const result = spawnSync("git", ["clone", DXLIB_FOR_LINUX_REPO, dir], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error("dxlib-for-linuxのcloneに失敗しました。");
    }
  }
}

export function buildDxLibForLinux(): void {
  const dir = nativeDxLibSourceDir();
  logger.step("dxlib-for-linux をビルドしています (make patch && make)...");

  const patchResult = spawnSync("make", ["patch"], { cwd: dir, stdio: "inherit" });
  if (patchResult.status !== 0) {
    throw new Error("make patch に失敗しました。");
  }

  const cpuCount = os.cpus()?.length || 2;
  const buildResult = spawnSync("make", [`-j${cpuCount}`], { cwd: dir, stdio: "inherit" });
  if (buildResult.status !== 0) {
    throw new Error("dxlib-for-linuxのビルドに失敗しました。依存パッケージを確認してください。");
  }
}

export const NATIVE_DEPS: Record<"apt" | "dnf" | "pacman", string[]> = {
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
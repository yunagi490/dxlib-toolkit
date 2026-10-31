import { spawnSync } from "node:child_process";

// DxLib同梱ライブラリ(コンパイラ別フォルダ)と、手元のg++が合っているかを判定する。
// 方針は「警告だけ」。食い違っていてもビルドは止めない(動くことも多いため)。

/** ライブラリフォルダ名 `12_2_0_x86_64_release_win32_seh_ucrt_rt_v10_rev2` を分解した結果。 */
export interface LibFolderInfo {
  gcc: string; // "12.2.0"
  arch: "x86_64" | "i686" | null;
  thread: "win32" | "posix" | null;
}

export function parseLibFolder(name: string): LibFolderInfo | null {
  const m = /^(\d+)_(\d+)_(\d+)_/.exec(name);
  if (!m) return null;
  return {
    gcc: `${m[1]}.${m[2]}.${m[3]}`,
    arch: name.includes("_x86_64_") ? "x86_64" : name.includes("_i686_") ? "i686" : null,
    thread: name.includes("_win32_") ? "win32" : name.includes("_posix_") ? "posix" : null,
  };
}

/** 手元のg++の情報(`g++ -v` の出力から取得)。 */
export interface GppInfo {
  version: string | null;
  arch: "x86_64" | "i686" | null;
  thread: "win32" | "posix" | null;
}

export function parseGppVerbose(output: string): GppInfo {
  const ver = /gcc version (\d+\.\d+\.\d+)/.exec(output);
  const target = /Target:\s*(\S+)/.exec(output);
  const thread = /Thread model:\s*(\S+)/.exec(output);
  const t = target ? target[1] : "";
  return {
    version: ver ? ver[1] : null,
    arch: t.startsWith("x86_64") ? "x86_64" : /^i[3-6]86/.test(t) ? "i686" : null,
    thread: thread && (thread[1] === "win32" || thread[1] === "posix") ? thread[1] : null,
  };
}

export function inspectGpp(gppPath: string): GppInfo | null {
  try {
    const r = spawnSync(gppPath, ["-v"], { stdio: "pipe" });
    const text = (r.stderr ? r.stderr.toString() : "") + (r.stdout ? r.stdout.toString() : "");
    return parseGppVerbose(text);
  } catch {
    return null;
  }
}

export interface CompatIssue {
  level: "warn" | "info";
  message: string;
}

/**
 * 判定基準:
 *  - アーキテクチャ(x86_64/i686)の不一致 → warn(リンクできない)
 *  - スレッドモデル(win32/posix)の不一致 → warn(ランタイムの組み合わせが想定外になる)
 *  - gccのメジャーバージョンの不一致 → warn
 *  - メジャーが同じでマイナー/パッチだけ違う → info
 * 判別できなかった項目は比較しない。
 */
export function checkCompat(lib: LibFolderInfo, gpp: GppInfo): CompatIssue[] {
  const issues: CompatIssue[] = [];
  if (lib.arch && gpp.arch && lib.arch !== gpp.arch) {
    issues.push({ level: "warn", message: `アーキテクチャが違います (ライブラリ: ${lib.arch} / g++: ${gpp.arch})。リンクに失敗します。` });
  }
  if (lib.thread && gpp.thread && lib.thread !== gpp.thread) {
    issues.push({ level: "warn", message: `スレッドモデルが違います (ライブラリ: ${lib.thread} / g++: ${gpp.thread})。` });
  }
  if (gpp.version) {
    const [lMaj] = lib.gcc.split(".");
    const [gMaj] = gpp.version.split(".");
    if (lMaj !== gMaj) {
      issues.push({ level: "warn", message: `gccのメジャーバージョンが違います (ライブラリ: ${lib.gcc} / g++: ${gpp.version})。` });
    } else if (lib.gcc !== gpp.version) {
      issues.push({ level: "info", message: `gccのバージョンが少し違います (ライブラリ: ${lib.gcc} / g++: ${gpp.version})。通常は問題ありません。` });
    }
  }
  return issues;
}
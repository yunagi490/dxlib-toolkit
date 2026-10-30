import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { logger } from "./logger";
import { ManifestEntry, resolveSources } from "./manifest";

const SIG_7Z = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const USER_AGENT = "Mozilla/5.0 (compatible; dx-cli-setup-script)";
const TIMEOUT_MS = 120_000;

export interface Verification {
  ok: boolean;
  reason?: string;
  sha256: string;
}

/**
 * zipとして最低限成立しているかを確認する(先頭のローカルヘッダと、末尾の終端レコード)。
 * HTMLのエラーページや、途中で切れたダウンロードを弾くのが目的。
 */
function zipStructureError(buf: Buffer, minBytes: number): string | null {
  if (buf.length < minBytes) {
    return `サイズが小さすぎます (${buf.length} bytes < ${minBytes} bytes)`;
  }
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    return "zipの先頭シグネチャがありません(HTMLのエラーページ等の可能性があります)";
  }
  // 終端レコード(PK\x05\x06)は末尾の最大 22 + 65535 bytes 以内にある
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      return null;
    }
  }
  return "zipの終端レコードがありません(ダウンロードが途中で切れた可能性があります)";
}

function sevenZipStructureError(buf: Buffer, minBytes: number): string | null {
  if (buf.length < minBytes) {
    return `サイズが小さすぎます (${buf.length} bytes < ${minBytes} bytes)`;
  }
  if (!SIG_7Z.every((b, i) => buf[i] === b)) {
    return "7zの先頭シグネチャがありません(HTMLのエラーページ等の可能性があります)";
  }
  return null;
}

function exeStructureError(buf: Buffer, minBytes: number): string | null {
  if (buf.length < minBytes) {
    return `サイズが小さすぎます (${buf.length} bytes < ${minBytes} bytes)`;
  }
  if (!(buf[0] === 0x4d && buf[1] === 0x5a)) {
    return "exeの先頭シグネチャ(MZ)がありません(HTMLのエラーページ等の可能性があります)";
  }
  return null;
}

function structureError(kind: "zip" | "7z" | "exe", buf: Buffer, minBytes: number): string | null {
  switch (kind) {
    case "7z":
      return sevenZipStructureError(buf, minBytes);
    case "exe":
      return exeStructureError(buf, minBytes);
    default:
      return zipStructureError(buf, minBytes);
  }
}

export function verifyZipFile(
  file: string,
  minBytes: number,
  expectedSha256?: string,
  kind: "zip" | "7z" | "exe" = "zip"
): Verification {
  const buf = fs.readFileSync(file);
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const structural = structureError(kind, buf, minBytes);
  if (structural) return { ok: false, reason: structural, sha256 };

  if (expectedSha256 && expectedSha256.toLowerCase() !== sha256) {
    return {
      ok: false,
      reason: `SHA-256が一致しません (期待: ${expectedSha256.toLowerCase()}, 実際: ${sha256})`,
      sha256,
    };
  }
  return { ok: true, sha256 };
}

function sidecarPath(file: string): string {
  return `${file}.sha256`;
}

function readSidecar(file: string): string | undefined {
  const p = sidecarPath(file);
  try {
    if (!fs.existsSync(p)) return undefined;
    return fs.readFileSync(p, "utf8").trim().toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function discard(file: string): void {
  fs.rmSync(file, { force: true });
  fs.rmSync(sidecarPath(file), { force: true });
}

/** キャッシュ済みファイルの検証。マニフェストにハッシュがあればそれと、無ければ初回取得時の記録(sidecar)と照合する。 */
export function verifyCachedEntry(file: string, entry: ManifestEntry): Verification {
  const expected = entry.sha256 ?? readSidecar(file);
  return verifyZipFile(file, entry.minBytes, expected, entry.kind ?? "zip");
}

/**
 * マニフェストのエントリをdestDirに取得する。
 * - 検証に通るキャッシュがあれば再利用し、壊れていれば破棄して取り直す
 * - 取得元は複数を順に試す。HTTPエラー・サイズ不足・zip構造不正・ハッシュ不一致はいずれも次の取得元へ進む
 * - 検証前のデータは `.part` に書き、通ったものだけを本来の名前にリネームする(壊れたファイルがキャッシュに残らない)
 * すべて失敗した場合はnullを返す。
 */
export async function ensureVerifiedFile(
  entry: ManifestEntry,
  destDir: string,
  opts?: { force?: boolean }
): Promise<string | null> {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, entry.fileName);
  const part = `${dest}.part`;

  if (fs.existsSync(dest) && !opts?.force) {
    const v = verifyCachedEntry(dest, entry);
    if (v.ok) {
      logger.info(`キャッシュ済みの ${entry.fileName} を使用します: ${dest}`);
      return dest;
    }
    logger.warn(`キャッシュが壊れているため破棄します: ${v.reason}`);
    discard(dest);
  }

  for (const url of resolveSources(entry)) {
    logger.step(`ダウンロード中: ${url}`);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn(`取得に失敗しました (HTTP ${res.status}): ${url}`);
        continue;
      }
      fs.writeFileSync(part, Buffer.from(await res.arrayBuffer()));

      const v = verifyZipFile(part, entry.minBytes, entry.sha256, entry.kind ?? "zip");
      if (!v.ok) {
        logger.warn(`ダウンロードしたファイルを破棄します: ${v.reason}`);
        fs.rmSync(part, { force: true });
        continue;
      }

      discard(dest); // --force で既存を置き換える場合。新しいファイルの検証が済んでから消す
      fs.renameSync(part, dest);
      if (!entry.sha256) {
        fs.writeFileSync(sidecarPath(dest), `${v.sha256}\n`);
        logger.info(`SHA-256: ${v.sha256}`);
        logger.info("(マニフェストにハッシュが未設定のため、この値を初回記録として以後の照合に使います)");
      }
      logger.success(`ダウンロード完了: ${dest}`);
      return dest;
    } catch (e) {
      logger.warn(`取得に失敗しました: ${(e as Error).message}`);
      fs.rmSync(part, { force: true });
    }
  }
  return null;
}
/** 旧名。zip以外(7z/exe)にも使えるようになったため ensureVerifiedFile に改名し、互換のため残している。 */
export const ensureVerifiedZip = ensureVerifiedFile;
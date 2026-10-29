// 依存物(DxLib本体など)の取得元・バージョン・検証情報を1か所に集約するマニフェスト。
// 「公式ページのHTMLからリンクを推測する」のではなく、バージョンを固定して取得する。

export interface ManifestEntry {
  id: string;
  version: string;
  /** キャッシュ内での保存名(取得元のURL末尾と一致させる) */
  fileName: string;
  /** 取得元URL。先頭から順に試す(DX_MIRROR_URL が設定されていればそのミラーが最優先、resolveSources参照) */
  sources: string[];
  /**
   * 期待するSHA-256(小文字hex)。
   * 未設定の場合は初回取得時のハッシュを `<fileName>.sha256` に記録し、以降はそれと照合する(TOFU)。
   * リリース時にここへ値を書いて固定すること。
   */
  sha256?: string;
  /** これ未満のサイズは壊れている(エラーページ等)とみなす。実サイズより十分小さい保守的な値にしてある。 */
  minBytes: number;
}

export const DXLIB_WINDOWS_GCC: ManifestEntry = {
  id: "dxlib-windows-gcc",
  version: "3.25a",
  fileName: "DxLib_GCC3_25a.zip",
  sources: ["https://dxlib.xsrv.jp/DxLib/DxLib_GCC3_25a.zip"],
  sha256: undefined,
  minBytes: 1024 * 1024,
};

/**
 * 取得元の一覧を、実際に試す順に返す。
 * 環境変数 DX_MIRROR_URL(例: https://example.com/dxlib-mirror)があれば、
 * `<DX_MIRROR_URL>/<fileName>` を公式より先に試す。公式サイトが落ちている・リンクが変わった場合の逃げ道になる。
 */
export function resolveSources(entry: ManifestEntry): string[] {
  const list: string[] = [];
  const mirror = process.env.DX_MIRROR_URL;
  if (mirror) {
    list.push(`${mirror.replace(/\/+$/, "")}/${entry.fileName}`);
  }
  list.push(...entry.sources);
  return list;
}
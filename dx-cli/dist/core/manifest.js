"use strict";
// 依存物(DxLib本体など)の取得元・バージョン・検証情報を1か所に集約するマニフェスト。
// 「公式ページのHTMLからリンクを推測する」のではなく、バージョンを固定して取得する。
Object.defineProperty(exports, "__esModule", { value: true });
exports.DXLIB_WINDOWS_GCC = void 0;
exports.resolveSources = resolveSources;
exports.DXLIB_WINDOWS_GCC = {
    id: "dxlib-windows-gcc",
    version: "3.25a",
    fileName: "DxLib_GCC3_25a.zip",
    sources: ["https://dxlib.xsrv.jp/DxLib/DxLib_GCC3_25a.zip"],
    sha256: "4656f11dc0cab3f23d0a7c44103c10d1b7132558964a32aab0dfb24c165660a7",
    minBytes: 1024 * 1024,
};
/**
 * 取得元の一覧を、実際に試す順に返す。
 * 環境変数 DX_MIRROR_URL(例: https://example.com/dxlib-mirror)があれば、
 * `<DX_MIRROR_URL>/<fileName>` を公式より先に試す。公式サイトが落ちている・リンクが変わった場合の逃げ道になる。
 */
function resolveSources(entry) {
    const list = [];
    const mirror = process.env.DX_MIRROR_URL;
    if (mirror) {
        list.push(`${mirror.replace(/\/+$/, "")}/${entry.fileName}`);
    }
    list.push(...entry.sources);
    return list;
}

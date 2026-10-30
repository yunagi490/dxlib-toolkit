"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MINGW_WINDOWS_X64 = exports.SEVENZR_WINDOWS = exports.DXLIB_WINDOWS_GCC = void 0;
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
 * 7z形式を展開するための単体exe(7-Zip公式の 7zr.exe)。バージョン固定。
 * Windows標準の tar.exe は 7z の LZMA を展開できないため、ツールチェーン展開にのみ使う。
 */
exports.SEVENZR_WINDOWS = {
    id: "7zr-windows",
    version: "26.05",
    kind: "exe",
    fileName: "7zr.exe",
    sources: ["https://github.com/ip7z/7zip/releases/download/26.05/7zr.exe"],
    sha256: "9bf582b894dfa665f852d7e9112b02290a1c303c2d95a21fcdc41ffcb03143b7",
    minBytes: 300 * 1024,
};
/**
 * DxLib 3.25a のGCC版ライブラリ(12_2_0_x86_64_release_win32_seh_ucrt_rt_v10_rev2)と一致するMinGW-w64。
 * niXman/mingw-builds の 12.2.0 rt_v10 rev2 (win32スレッド, SEH, UCRT)。
 * 上流はチェックサムを公開していないため、ここのSHA-256はdx-cli側で実測して固定した値。
 */
exports.MINGW_WINDOWS_X64 = {
    id: "mingw-w64-x86_64-12.2.0-win32-seh-ucrt-rev2",
    version: "12.2.0",
    kind: "7z",
    fileName: "x86_64-12.2.0-release-win32-seh-ucrt-rt_v10-rev2.7z",
    sources: [
        "https://github.com/niXman/mingw-builds-binaries/releases/download/12.2.0-rt_v10-rev2/x86_64-12.2.0-release-win32-seh-ucrt-rt_v10-rev2.7z",
    ],
    sha256: "d2911a1b1a4947a592b3b82968847a0ad05c11d19a16c64b55bcc9ddd45618e7",
    minBytes: 50 * 1024 * 1024,
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

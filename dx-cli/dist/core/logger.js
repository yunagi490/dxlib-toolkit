"use strict";
// chalk等を使わず、生のANSIエスケープコードで色付け出力を行う最小ロガー。
// NO_COLOR環境変数 or 非TTY出力時は自動で色なしにフォールバックする。
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.color = void 0;
const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;
function wrap(code) {
    return (s) => (isColorSupported ? `\u001b[${code}m${s}\u001b[0m` : s);
}
exports.color = {
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    blue: wrap("34"),
    magenta: wrap("35"),
    cyan: wrap("36"),
    gray: wrap("90"),
    bold: wrap("1"),
};
const PREFIX = exports.color.cyan("[dx]");
exports.logger = {
    info(msg) {
        console.log(`${PREFIX} ${msg}`);
    },
    success(msg) {
        console.log(`${PREFIX} ${exports.color.green("✓")} ${msg}`);
    },
    warn(msg) {
        console.warn(`${PREFIX} ${exports.color.yellow("!")} ${msg}`);
    },
    error(msg) {
        console.error(`${PREFIX} ${exports.color.red("✗")} ${msg}`);
    },
    step(msg) {
        console.log(`${PREFIX} ${exports.color.blue("→")} ${msg}`);
    },
    plain(msg) {
        console.log(msg);
    },
    divider() {
        console.log(exports.color.gray("----------------------------------------"));
    },
};

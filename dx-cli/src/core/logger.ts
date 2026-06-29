// chalk等を使わず、生のANSIエスケープコードで色付け出力を行う最小ロガー。
// NO_COLOR環境変数 or 非TTY出力時は自動で色なしにフォールバックする。

const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(code: string): (s: string) => string {
  return (s: string) => (isColorSupported ? `\u001b[${code}m${s}\u001b[0m` : s);
}

export const color = {
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  gray: wrap("90"),
  bold: wrap("1"),
};

const PREFIX = color.cyan("[dx]");

export const logger = {
  info(msg: string): void {
    console.log(`${PREFIX} ${msg}`);
  },
  success(msg: string): void {
    console.log(`${PREFIX} ${color.green("✓")} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${PREFIX} ${color.yellow("!")} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${PREFIX} ${color.red("✗")} ${msg}`);
  },
  step(msg: string): void {
    console.log(`${PREFIX} ${color.blue("→")} ${msg}`);
  },
  plain(msg: string): void {
    console.log(msg);
  },
  divider(): void {
    console.log(color.gray("----------------------------------------"));
  },
};

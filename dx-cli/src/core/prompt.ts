import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * y/N形式の確認プロンプトを表示する。
 * 非TTY環境(CI等)では常にdefaultValueを返す。
 */
export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  if (!stdin.isTTY) {
    return defaultValue;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  try {
    const answer = (await rl.question(`${message} ${suffix}: `)).trim().toLowerCase();
    if (answer === "") return defaultValue;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/**
 * 自由入力を受け取るプロンプト。
 */
export async function ask(message: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    const answer = (await rl.question(`${message}${suffix}: `)).trim();
    return answer === "" && defaultValue !== undefined ? defaultValue : answer;
  } finally {
    rl.close();
  }
}

/**
 * 選択肢からの単一選択(番号入力式)。
 */
export async function select(message: string, options: string[]): Promise<number> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log(message);
    options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt}`));
    while (true) {
      const answer = (await rl.question("番号を選んでください: ")).trim();
      const idx = Number.parseInt(answer, 10);
      if (Number.isInteger(idx) && idx >= 1 && idx <= options.length) {
        return idx - 1;
      }
      console.log(`1〜${options.length}の番号を入力してください。`);
    }
  } finally {
    rl.close();
  }
}

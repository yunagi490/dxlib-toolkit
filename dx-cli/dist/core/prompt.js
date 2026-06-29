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
exports.confirm = confirm;
exports.ask = ask;
exports.select = select;
const readline = __importStar(require("node:readline/promises"));
const node_process_1 = require("node:process");
/**
 * y/N形式の確認プロンプトを表示する。
 * 非TTY環境(CI等)では常にdefaultValueを返す。
 */
async function confirm(message, defaultValue = false) {
    if (!node_process_1.stdin.isTTY) {
        return defaultValue;
    }
    const rl = readline.createInterface({ input: node_process_1.stdin, output: node_process_1.stdout });
    const suffix = defaultValue ? "[Y/n]" : "[y/N]";
    try {
        const answer = (await rl.question(`${message} ${suffix}: `)).trim().toLowerCase();
        if (answer === "")
            return defaultValue;
        return answer === "y" || answer === "yes";
    }
    finally {
        rl.close();
    }
}
/**
 * 自由入力を受け取るプロンプト。
 */
async function ask(message, defaultValue) {
    const rl = readline.createInterface({ input: node_process_1.stdin, output: node_process_1.stdout });
    try {
        const suffix = defaultValue ? ` (${defaultValue})` : "";
        const answer = (await rl.question(`${message}${suffix}: `)).trim();
        return answer === "" && defaultValue !== undefined ? defaultValue : answer;
    }
    finally {
        rl.close();
    }
}
/**
 * 選択肢からの単一選択(番号入力式)。
 */
async function select(message, options) {
    const rl = readline.createInterface({ input: node_process_1.stdin, output: node_process_1.stdout });
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
    }
    finally {
        rl.close();
    }
}

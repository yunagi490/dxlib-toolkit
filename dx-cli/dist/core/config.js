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
exports.CONFIG_FILENAME = void 0;
exports.configPath = configPath;
exports.readConfig = readConfig;
exports.writeConfig = writeConfig;
exports.findProjectRoot = findProjectRoot;
exports.requireProjectRoot = requireProjectRoot;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.CONFIG_FILENAME = "dx.config.json";
function configPath(projectDir) {
    return path.join(projectDir, exports.CONFIG_FILENAME);
}
function readConfig(projectDir) {
    const p = configPath(projectDir);
    if (!fs.existsSync(p))
        return null;
    try {
        const raw = fs.readFileSync(p, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function writeConfig(projectDir, config) {
    const p = configPath(projectDir);
    fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
/**
 * カレントディレクトリから上位に向かって dx.config.json を探索する。
 * (dx dev 等を src/ の中などサブディレクトリから実行した場合に対応するため)
 */
function findProjectRoot(startDir) {
    let dir = path.resolve(startDir);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (fs.existsSync(configPath(dir))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
function requireProjectRoot(startDir) {
    const root = findProjectRoot(startDir);
    if (!root) {
        throw new Error(`dx.config.json が見つかりません。dxプロジェクトのフォルダ内で実行してください。(dx create <name> で新規作成できます)`);
    }
    const config = readConfig(root);
    if (!config) {
        throw new Error(`dx.config.json の読み込みに失敗しました: ${configPath(root)}`);
    }
    return { root, config };
}

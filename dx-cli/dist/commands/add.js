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
exports.addCommand = addCommand;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const logger_1 = require("../core/logger");
const config_1 = require("../core/config");
const addTpl = __importStar(require("../templates/add"));
function addCommand(kind, rawName) {
    if (!kind || !rawName) {
        logger_1.logger.error("使い方: dx add scene <Name> | dx add class <Name>");
        process.exitCode = 1;
        return;
    }
    const { root } = (0, config_1.requireProjectRoot)(process.cwd());
    if (kind === "scene") {
        addScene(root, rawName);
    }
    else if (kind === "class") {
        addClass(root, rawName);
    }
    else {
        logger_1.logger.error(`不明な種類です: "${kind}" (scene または class を指定してください)`);
        process.exitCode = 1;
    }
}
function addScene(root, rawName) {
    const dir = path.join(root, "src", "scenes");
    fs.mkdirSync(dir, { recursive: true });
    const header = addTpl.sceneHeader(rawName);
    const source = addTpl.sceneSource(rawName);
    const headerPath = path.join(dir, `${header.className}.h`);
    const sourcePath = path.join(dir, `${header.className}.cpp`);
    if (fs.existsSync(headerPath) || fs.existsSync(sourcePath)) {
        logger_1.logger.error(`既に存在します: ${header.className} (src/scenes/)`);
        process.exitCode = 1;
        return;
    }
    fs.writeFileSync(headerPath, header.content);
    fs.writeFileSync(sourcePath, source.content);
    logger_1.logger.success(`シーンを追加しました: src/scenes/${header.className}.h / .cpp`);
    logger_1.logger.info(`利用例: SceneManager::Get().ChangeScene(std::make_unique<${header.className}>());`);
}
function addClass(root, rawName) {
    const dir = path.join(root, "src");
    fs.mkdirSync(dir, { recursive: true });
    const header = addTpl.classHeader(rawName);
    const source = addTpl.classSource(rawName);
    const headerPath = path.join(dir, `${header.className}.h`);
    const sourcePath = path.join(dir, `${header.className}.cpp`);
    if (fs.existsSync(headerPath) || fs.existsSync(sourcePath)) {
        logger_1.logger.error(`既に存在します: ${header.className} (src/)`);
        process.exitCode = 1;
        return;
    }
    fs.writeFileSync(headerPath, header.content);
    fs.writeFileSync(sourcePath, source.content);
    logger_1.logger.success(`クラスを追加しました: src/${header.className}.h / .cpp`);
}

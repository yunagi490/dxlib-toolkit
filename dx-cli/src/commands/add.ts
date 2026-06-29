import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../core/logger";
import { requireProjectRoot } from "../core/config";
import * as addTpl from "../templates/add";

export function addCommand(kind: string | undefined, rawName: string | undefined): void {
  if (!kind || !rawName) {
    logger.error("使い方: dx add scene <Name> | dx add class <Name>");
    process.exitCode = 1;
    return;
  }

  const { root } = requireProjectRoot(process.cwd());

  if (kind === "scene") {
    addScene(root, rawName);
  } else if (kind === "class") {
    addClass(root, rawName);
  } else {
    logger.error(`不明な種類です: "${kind}" (scene または class を指定してください)`);
    process.exitCode = 1;
  }
}

function addScene(root: string, rawName: string): void {
  const dir = path.join(root, "src", "scenes");
  fs.mkdirSync(dir, { recursive: true });

  const header = addTpl.sceneHeader(rawName);
  const source = addTpl.sceneSource(rawName);

  const headerPath = path.join(dir, `${header.className}.h`);
  const sourcePath = path.join(dir, `${header.className}.cpp`);

  if (fs.existsSync(headerPath) || fs.existsSync(sourcePath)) {
    logger.error(`既に存在します: ${header.className} (src/scenes/)`);
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(headerPath, header.content);
  fs.writeFileSync(sourcePath, source.content);

  logger.success(`シーンを追加しました: src/scenes/${header.className}.h / .cpp`);
  logger.info(
    `利用例: SceneManager::Get().ChangeScene(std::make_unique<${header.className}>());`
  );
}

function addClass(root: string, rawName: string): void {
  const dir = path.join(root, "src");
  fs.mkdirSync(dir, { recursive: true });

  const header = addTpl.classHeader(rawName);
  const source = addTpl.classSource(rawName);

  const headerPath = path.join(dir, `${header.className}.h`);
  const sourcePath = path.join(dir, `${header.className}.cpp`);

  if (fs.existsSync(headerPath) || fs.existsSync(sourcePath)) {
    logger.error(`既に存在します: ${header.className} (src/)`);
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(headerPath, header.content);
  fs.writeFileSync(sourcePath, source.content);

  logger.success(`クラスを追加しました: src/${header.className}.h / .cpp`);
}

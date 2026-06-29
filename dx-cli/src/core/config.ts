import * as fs from "node:fs";
import * as path from "node:path";

export type DxLibMode = "windows" | "native" | "stub";

export interface DxConfig {
  /** プロジェクト名 */
  name: string;
  /** DxLibの取得・ビルドモード */
  dxlibMode: DxLibMode;
  /** C++標準 */
  cppStandard: string;
  /** このプロジェクトを作成したdx-cliのバージョン */
  createdWithDxCliVersion: string;
  /** 最後にDxLibを取得/更新した日時(ISO8601) */
  lastDxLibSyncAt?: string;
}

export const CONFIG_FILENAME = "dx.config.json";

export function configPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILENAME);
}

export function readConfig(projectDir: string): DxConfig | null {
  const p = configPath(projectDir);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as DxConfig;
  } catch {
    return null;
  }
}

export function writeConfig(projectDir: string, config: DxConfig): void {
  const p = configPath(projectDir);
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * カレントディレクトリから上位に向かって dx.config.json を探索する。
 * (dx dev 等を src/ の中などサブディレクトリから実行した場合に対応するため)
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(configPath(dir))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireProjectRoot(startDir: string): { root: string; config: DxConfig } {
  const root = findProjectRoot(startDir);
  if (!root) {
    throw new Error(
      `dx.config.json が見つかりません。dxプロジェクトのフォルダ内で実行してください。(dx create <name> で新規作成できます)`
    );
  }
  const config = readConfig(root);
  if (!config) {
    throw new Error(`dx.config.json の読み込みに失敗しました: ${configPath(root)}`);
  }
  return { root, config };
}

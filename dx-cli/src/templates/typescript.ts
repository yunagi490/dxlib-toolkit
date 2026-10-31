/**
 * `dx create --script --ts` で生成するTypeScript用のファイル。
 * QuickJSはJavaScriptしか読めないので、scripts/*.ts を tsc で scripts/*.js へ変換して使う。
 */

/** プロジェクトに導入するTypeScriptのバージョン(純JS実装の安定版に固定) */
export const TYPESCRIPT_VERSION = "5.9.3";

/** npmのパッケージ名として使える形にする */
function packageName(projectName: string): string {
  const s = projectName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+/, "");
  return s || "dx-project";
}

export function packageJson(projectName: string): string {
  return (
    JSON.stringify(
      {
        name: packageName(projectName),
        version: "0.0.0",
        private: true,
        description: "dx-cli が生成したプロジェクト。scripts/*.ts を変換するためのTypeScriptだけを入れています。",
        scripts: {
          "build:scripts": "tsc -p scripts/tsconfig.json",
        },
        devDependencies: {
          typescript: TYPESCRIPT_VERSION,
        },
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * scripts/tsconfig.json
 * - noEmitOnError … 型エラーがあるときは .js を更新しない(動いているアプリを壊さない)
 * - outDir: "." … title.ts の隣に title.js を出力する(C++側は scripts/title.js を読む)
 * - exclude: [] … outDir が自分自身のフォルダなので、既定の除外(outDirを除く)で全部が除外されないようにする
 * import/export はQuickJS側で1つのスクリプトとして読み込めないため、dx-cli が変換後に検出してエラーにする。
 */
export function scriptsTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022"],
          types: [],
          strict: true,
          noEmitOnError: true,
          skipLibCheck: true,
          newLine: "lf",
          rootDir: ".",
          outDir: ".",
        },
        include: ["*.ts"],
        exclude: [],
      },
      null,
      2
    ) + "\n"
  );
}

/** エンジンが提供するAPIの型。`dx update` で最新版に書き換わる(編集しないでください)。 */
export function dxDts(): string {
  return `// dx-cli が管理するファイルです。\`dx update\` で上書きされるので、編集しないでください。
// エンジン(ScriptScene)が JavaScript に公開している関数の型です。

/** 文字を描く。色(r, g, b)は省略すると白。 */
declare function drawText(x: number, y: number, text: string, r?: number, g?: number, b?: number): void;

/** 塗りつぶしの四角形を描く。色(r, g, b)は省略すると白。 */
declare function drawBox(x1: number, y1: number, x2: number, y2: number, r?: number, g?: number, b?: number): void;

/** キーが押されているか。keyCode は DxLib の KEY_INPUT_* の値(例: ESC は 1)。 */
declare function isKeyDown(keyCode: number): boolean;
`;
}

export function titleScriptTs(): string {
  return `// dx-cli が生成したスクリプトシーン(TypeScript)。保存すると tsc で title.js に変換され、
// \`dx dev\` ならアプリが自動で再起動します。(title.js は自動生成なので編集しないでください)
// 使えるAPIの型は dx.d.ts を見てください。
// 関数 init() / update(dt) / draw() は、定義されていれば呼ばれます(dt は秒)。
// 注意: import / export は使えません(1つのスクリプトとして読み込まれます)。

let elapsed = 0;

function update(dt: number): void {
  elapsed += dt;
}

function draw(): void {
  drawBox(270, 190, 370, 290, 255, 255, 255);
  drawText(10, 10, "TitleScene (ts) elapsed: " + elapsed.toFixed(1) + "s - ESCで終了");
}
`;
}
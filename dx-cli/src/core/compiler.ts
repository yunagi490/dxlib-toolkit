import * as fs from "node:fs";
import * as path from "node:path";
import { DxConfig } from "./config";
import { currentPlatform } from "./env";

export interface BuildOptions {
  /** リリースビルド(最適化・デバッグ情報なし)かどうか */
  release: boolean;
}

export interface BuildPlan {
  gppPath: string;
  args: string[];
  outputPath: string;
}

const WINDOWS_LINK_LIBS = [
  "-lDxLib",
  "-lDxUseCLib",
  "-lDxDrawFunc",
  "-ljpeg",
  "-lpng",
  "-lzlib",
  "-ltiff",
  "-ltheora_static",
  "-lvorbis_static",
  "-lvorbisfile_static",
  "-logg_static",
  "-lbulletdynamics",
  "-lbulletcollision",
  "-lbulletmath",
  "-lopusfile",
  "-lopus",
  "-lsilk_common",
  "-lcelt",
  "-ldinput8",
  "-ldxguid",
  "-ldsound",
  "-lwinmm",
  "-limm32",
  "-lole32",
  "-loleaut32",
  "-lcomdlg32",
  "-lwininet",
];

const NATIVE_LINUX_LINK_LIBS = [
  "-lDxLib",
  "-lEGL",
  "-lGLESv2",
  "-lX11",
  "-lpthread",
  "-lpng",
  "-ljpeg",
  "-lz",
  "-ltiff",
  "-lopenal",
  "-lvorbisfile",
  "-lvorbis",
  "-logg",
  "-lopusfile",
  "-lopus",
  "-ltheoradec",
];

/** src/ 以下の全 .cpp ファイルを再帰的に列挙する(テンプレートリテラルではなく実ファイルを都度検出)。 */
function collectSources(projectRoot: string): string[] {
  const srcDir = path.join(projectRoot, "src");
  const result: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".cpp")) {
        result.push(full);
      }
    }
  }
  walk(srcDir);
  return result;
}

export function buildPlan(
  projectRoot: string,
  config: DxConfig,
  gppPath: string,
  options: BuildOptions
): BuildPlan {
  const dxlibDir = path.join(projectRoot, "lib", "DxLib");
  const srcRootDir = path.join(projectRoot, "src");
  const sources = collectSources(projectRoot);
  const buildDir = path.join(projectRoot, "build");
  const exeName = currentPlatform() === "windows" ? `${config.name}.exe` : config.name;
  const outputPath = path.join(buildDir, exeName);

  const args: string[] = ["-fdiagnostics-color=always", `-std=${config.cppStandard}`, `-I${srcRootDir}`];

  if (options.release) {
    args.push("-O2", "-DNDEBUG");
  } else {
    args.push("-g");
  }

  args.push(...sources);

  if (config.dxlibMode === "windows") {
    args.push(
      "-finput-charset=UTF-8",
      "-fexec-charset=UTF-8",
      `-I${dxlibDir}`,
      "-DDX_GCC_COMPILE",
      // DX_NON_INLINE_ASM は DxCompileConfig.h 側で定義されるため、ここでは渡さない(渡すと "redefined" 警告になる)
      "-mwindows",
      "-static-libgcc",
      "-static-libstdc++",
      "-o",
      outputPath,
      `-L${dxlibDir}`,
      ...WINDOWS_LINK_LIBS
    );
  } else if (config.dxlibMode === "native") {
    args.push(
      `-I${path.join(dxlibDir, "include")}`,
      "-DDX_GCC_COMPILE",
      "-DDX_NON_INLINE_ASM",
      "-o",
      outputPath,
      `-L${path.join(dxlibDir, "lib")}`,
      ...NATIVE_LINUX_LINK_LIBS
    );
  } else {
    // stub: リンクせず構文チェックのみ。呼び出し側でこの分岐の場合は
    // buildPlanではなくsyntaxCheckPlanを使うことを推奨(ここはフォールバック)。
    args.push(`-I${dxlibDir}`, "-DDX_GCC_COMPILE", "-DDX_NON_INLINE_ASM", "-D__DXLIB_STUB_MODE__", "-fsyntax-only");
  }

  return { gppPath, args, outputPath };
}

export function syntaxCheckPlan(projectRoot: string, config: DxConfig, gppPath: string): BuildPlan {
  const dxlibDir = path.join(projectRoot, "lib", "DxLib");
  const srcRootDir = path.join(projectRoot, "src");
  const sources = collectSources(projectRoot);

  const args: string[] = [
    "-fdiagnostics-color=always",
    "-fsyntax-only",
    `-std=${config.cppStandard}`,
    ...sources,
    `-I${srcRootDir}`,
    `-I${dxlibDir}`,
    "-DDX_GCC_COMPILE",
    "-DDX_NON_INLINE_ASM",
    "-D__DXLIB_STUB_MODE__",
  ];

  return { gppPath, args, outputPath: "" };
}

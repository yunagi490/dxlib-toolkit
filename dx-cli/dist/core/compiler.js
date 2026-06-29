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
exports.buildPlan = buildPlan;
exports.syntaxCheckPlan = syntaxCheckPlan;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const env_1 = require("./env");
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
function collectSources(projectRoot) {
    const srcDir = path.join(projectRoot, "src");
    const result = [];
    function walk(dir) {
        if (!fs.existsSync(dir))
            return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (entry.name.endsWith(".cpp")) {
                result.push(full);
            }
        }
    }
    walk(srcDir);
    return result;
}
function buildPlan(projectRoot, config, gppPath, options) {
    const dxlibDir = path.join(projectRoot, "lib", "DxLib");
    const srcRootDir = path.join(projectRoot, "src");
    const sources = collectSources(projectRoot);
    const buildDir = path.join(projectRoot, "build");
    const exeName = (0, env_1.currentPlatform)() === "windows" ? `${config.name}.exe` : config.name;
    const outputPath = path.join(buildDir, exeName);
    const args = ["-fdiagnostics-color=always", `-std=${config.cppStandard}`, `-I${srcRootDir}`];
    if (options.release) {
        args.push("-O2", "-DNDEBUG");
    }
    else {
        args.push("-g");
    }
    args.push(...sources);
    if (config.dxlibMode === "windows") {
        args.push("-finput-charset=UTF-8", "-fexec-charset=UTF-8", `-I${dxlibDir}`, "-DDX_GCC_COMPILE", "-DDX_NON_INLINE_ASM", "-mwindows", "-static-libgcc", "-static-libstdc++", "-o", outputPath, `-L${dxlibDir}`, ...WINDOWS_LINK_LIBS);
    }
    else if (config.dxlibMode === "native") {
        args.push(`-I${path.join(dxlibDir, "include")}`, "-DDX_GCC_COMPILE", "-DDX_NON_INLINE_ASM", "-o", outputPath, `-L${path.join(dxlibDir, "lib")}`, ...NATIVE_LINUX_LINK_LIBS);
    }
    else {
        // stub: リンクせず構文チェックのみ。呼び出し側でこの分岐の場合は
        // buildPlanではなくsyntaxCheckPlanを使うことを推奨(ここはフォールバック)。
        args.push(`-I${dxlibDir}`, "-DDX_GCC_COMPILE", "-DDX_NON_INLINE_ASM", "-D__DXLIB_STUB_MODE__", "-fsyntax-only");
    }
    return { gppPath, args, outputPath };
}
function syntaxCheckPlan(projectRoot, config, gppPath) {
    const dxlibDir = path.join(projectRoot, "lib", "DxLib");
    const srcRootDir = path.join(projectRoot, "src");
    const sources = collectSources(projectRoot);
    const args = [
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

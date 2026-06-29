// .vscode/tasks.json, launch.json, c_cpp_properties.json を生成する。
// 重要な設計判断: tasks.jsonは直接g++を叩かず、必ず `dx build` / `dx run` を経由する。
// これによりビルドフラグの定義場所が compiler.ts の1箇所に集約され、
// dx update で設定を再生成してもズレが生じない。

import { DxConfig } from "../core/config";
import { currentPlatform } from "../core/env";

export function tasksJson(): string {
  const isWindows = currentPlatform() === "windows";
  const dxCmd = isWindows ? "dx.cmd" : "dx";

  const obj = {
    version: "2.0.0",
    tasks: [
      {
        type: "shell",
        label: "dx: build (debug)",
        command: dxCmd,
        args: ["build"],
        options: { cwd: "${workspaceFolder}" },
        problemMatcher: ["$gcc"],
        group: { kind: "build", isDefault: true },
        detail: "dx build を実行します(デバッグビルド)。",
      },
      {
        type: "shell",
        label: "dx: build (release)",
        command: dxCmd,
        args: ["build", "--release"],
        options: { cwd: "${workspaceFolder}" },
        problemMatcher: ["$gcc"],
        group: { kind: "build", isDefault: false },
      },
      {
        type: "shell",
        label: "dx: run",
        command: dxCmd,
        args: ["run"],
        options: { cwd: "${workspaceFolder}" },
        problemMatcher: [],
        group: { kind: "test", isDefault: false },
        dependsOn: ["dx: build (debug)"],
      },
      {
        type: "shell",
        label: "dx: test",
        command: dxCmd,
        args: ["test"],
        options: { cwd: "${workspaceFolder}" },
        problemMatcher: ["$gcc"],
        group: { kind: "test", isDefault: true },
      },
    ],
  };

  return JSON.stringify(obj, null, 4) + "\n";
}

export function launchJson(config: DxConfig, debuggerInfo: { mode: "gdb" | "lldb"; path: string } | null): string {
  if (!debuggerInfo || config.dxlibMode === "stub") {
    // stubモード、またはデバッガ未検出の場合はlaunch.jsonを生成しない(呼び出し側で判定)
    return "";
  }

  const isWindows = currentPlatform() === "windows";
  const exeName = isWindows ? `${config.name}.exe` : config.name;
  const dxCmd = isWindows ? "dx.cmd" : "dx";

  const obj = {
    version: "0.2.0",
    configurations: [
      {
        name: `dx: 実行 (${debuggerInfo.mode})`,
        type: "cppdbg",
        request: "launch",
        program: `\${workspaceFolder}/build/${exeName}`,
        args: [] as string[],
        stopAtEntry: false,
        cwd: "${workspaceFolder}/build",
        environment: [] as unknown[],
        externalConsole: false,
        MIMode: debuggerInfo.mode,
        miDebuggerPath: debuggerInfo.path,
        preLaunchTask: "dx: build (debug)",
      },
    ],
  };

  return JSON.stringify(obj, null, 4) + "\n";
}

export function cppPropertiesJson(
  config: DxConfig,
  gppPath: string,
  dxlibIncludeDir: string,
  intelliSenseMode: string
): string {
  const defines = ["DX_GCC_COMPILE", "DX_NON_INLINE_ASM"];
  if (config.dxlibMode === "stub") {
    defines.push("__DXLIB_STUB_MODE__");
  }

  const obj = {
    configurations: [
      {
        name: `dx-${config.dxlibMode}`,
        includePath: ["${workspaceFolder}/**", dxlibIncludeDir],
        defines,
        compilerPath: gppPath,
        cStandard: "c17",
        cppStandard: config.cppStandard,
        intelliSenseMode,
      },
    ],
    version: 4,
  };

  return JSON.stringify(obj, null, 4) + "\n";
}

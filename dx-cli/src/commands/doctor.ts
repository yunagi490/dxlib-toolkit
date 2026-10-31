import * as fs from "node:fs";
import * as path from "node:path";
import { logger, color } from "../core/logger";
import { findProjectRoot, readConfig } from "../core/config";
import { checkCompat, inspectGpp, parseLibFolder } from "../core/compat";
import {
  currentPlatform,
  findGpp,
  findDebugger,
  gppVersion,
  hasChocolatey,
  detectUnixPkgManager,
  cacheDir,
  findCachedDxLibZip,
  nativeDxLibSourceDir,
} from "../core/env";

interface CheckItem {
  label: string;
  ok: boolean;
  detail?: string;
  hint?: string;
}

export function doctorCommand(): void {
  logger.divider();
  logger.info(`dx doctor — 環境診断 (OS: ${currentPlatform()})`);
  logger.divider();

  const checks: CheckItem[] = [];

  // g++
  const gpp = findGpp();
  checks.push({
    label: "g++ (MinGW/gcc)",
    ok: gpp !== null,
    detail: gpp ? `${gpp} (${gppVersion(gpp) ?? "version unknown"})` : undefined,
    hint: gpp ? undefined : buildGppHint(),
  });

  // デバッガ
  const debuggerInfo = findDebugger();
  checks.push({
    label: "デバッガ (gdb/lldb)",
    ok: debuggerInfo !== null,
    detail: debuggerInfo ? `${debuggerInfo.mode}: ${debuggerInfo.path}` : undefined,
    hint: debuggerInfo ? undefined : "デバッグ実行(F5)を使いたい場合はgdb/lldbを別途インストールしてください。",
  });

  // パッケージマネージャ
  if (currentPlatform() === "windows") {
    checks.push({
      label: "Chocolatey",
      ok: hasChocolatey(),
      hint: hasChocolatey() ? undefined : "MinGWの自動インストールにはChocolateyの導入を推奨します。",
    });
  } else {
    const pkgMgr = detectUnixPkgManager();
    checks.push({
      label: "パッケージマネージャ",
      ok: pkgMgr !== "none",
      detail: pkgMgr !== "none" ? pkgMgr : undefined,
      hint: pkgMgr === "none" ? "brew/apt/dnf/pacmanのいずれかが見つかりませんでした。" : undefined,
    });
  }

  // キャッシュディレクトリ・DxLib zip
  const cache = cacheDir();
  checks.push({
    label: "dx-setup キャッシュフォルダ",
    ok: fs.existsSync(cache),
    detail: cache,
  });

  const cachedZip = findCachedDxLibZip();
  checks.push({
    label: "DxLib(Windows gcc版) zip キャッシュ",
    ok: cachedZip !== null,
    detail: cachedZip ?? undefined,
    hint: cachedZip ? undefined : "未取得です。`dx create`または`dx update`時に自動取得されます。",
  });

  if (currentPlatform() !== "windows") {
    const nativeSrc = nativeDxLibSourceDir();
    checks.push({
      label: "dxlib-for-linux ソース",
      ok: fs.existsSync(path.join(nativeSrc, ".git")),
      detail: fs.existsSync(nativeSrc) ? nativeSrc : undefined,
      hint: fs.existsSync(path.join(nativeSrc, ".git")) ? undefined : "nativeモードを使う場合は `dx create --mode=native` 等でcloneされます。",
    });
  }

  // プロジェクト設定(カレントディレクトリがdxプロジェクト内かどうか)
  const root = findProjectRoot(process.cwd());
  if (root) {
    const config = readConfig(root);
    checks.push({
      label: "dx.config.json",
      ok: config !== null,
      detail: config ? `name=${config.name}, mode=${config.dxlibMode}` : undefined,
    });

    if (config) {
      const dxlibDir = path.join(root, "lib", "DxLib");
      const headerPath =
        config.dxlibMode === "native"
          ? path.join(dxlibDir, "include", "DxLib.h")
          : path.join(dxlibDir, "DxLib.h");
      checks.push({
        label: "lib/DxLib (プロジェクト内配置)",
        ok: fs.existsSync(headerPath),
        detail: fs.existsSync(headerPath) ? headerPath : undefined,
        hint: fs.existsSync(headerPath) ? undefined : "`dx update` でDxLibの再配置を試みてください。",
      });
      if (config.dxlibMode === "windows") {
        if (!config.dxlib) {
          checks.push({
            label: "DxLibライブラリの記録",
            ok: true,
            detail: "記録なし(`dx update` を実行すると記録され、g++との食い違いを検出できます)",
          });
        } else {
          const lib = parseLibFolder(config.dxlib.libFolder);
          const gppInfo = gpp ? inspectGpp(gpp) : null;
          const issues = lib && gppInfo ? checkCompat(lib, gppInfo) : [];
          const warns = issues.filter((i) => i.level === "warn");
          checks.push({
            label: "DxLibライブラリとg++の組み合わせ",
            ok: warns.length === 0,
            detail: `DxLib ${config.dxlib.version} / ${config.dxlib.libFolder}`,
            hint: warns.length === 0 ? undefined : `${warns.map((i) => i.message).join(" ")} 合うMinGWは \`dx toolchain install\` で取得できます。`,
          });
          for (const i of issues.filter((x) => x.level === "info")) logger.info(i.message);
        }
      }
    }
  } else {
    checks.push({
      label: "現在のディレクトリ",
      ok: false,
      detail: "dxプロジェクト外です(参考情報、エラーではありません)",
    });
  }

  // 結果表示
  for (const c of checks) {
    const mark = c.ok ? color.green("✓") : color.red("✗");
    logger.plain(`  ${mark} ${c.label}${c.detail ? color.gray(`  (${c.detail})`) : ""}`);
    if (!c.ok && c.hint) {
      logger.plain(`      ${color.yellow("→")} ${c.hint}`);
    }
  }

  logger.divider();
  const failedCount = checks.filter((c) => !c.ok && c.label !== "現在のディレクトリ").length;
  if (failedCount === 0) {
    logger.success("問題は見つかりませんでした。");
  } else {
    logger.warn(`${failedCount}件の項目を確認してください。`);
  }
}

function buildGppHint(): string {
  if (currentPlatform() === "windows") {
    return "MinGWが見つかりません。`dx toolchain install` でDxLibと一致するMinGW-w64を取得できます(または自分で導入してPATHに通してください)。";
  }
  if (currentPlatform() === "macos") {
    return "g++が見つかりません。`brew install gcc` を試してください(あるいはXcode Command Line Tools)。";
  }
  return "g++が見つかりません。`sudo apt install g++` 等でインストールしてください。";
}

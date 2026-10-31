# dx-cli

DxLib(gcc/MinGW版)プロジェクト用の開発CLI。Vite/Nuxtのような

```
dx create MyGame
cd MyGame
dx dev
```

という開発体験を提供します。

**外部npm依存ゼロ**で動作します(Node.js組み込みAPIのみ使用)。`yarn global add` するだけで、
`yarn install` のネットワークアクセスなしに即動きます。

---

## インストール

### Homebrew (Mac/Linux)

```bash
brew tap yunagi490/dxlib-toolkit
brew install dx-cli
dx help
```

### yarn (Windows含む全OS)

```bash
# このフォルダをどこかに展開した上で
yarn global add file:/path/to/dx-cli

# 確認
dx help
```

TypeScriptソースから再ビルドしたい場合(任意、`dist/`は同梱済みなので通常は不要):

```bash
yarn install   # devDependency(typescript)のみ
yarn build
```

---
## 特長

- **再現できる環境構築**: DxLibはバージョンを固定し、サイズ・構造・SHA-256を検証して取得します(ミラー指定も可)。
- **MinGW-w64の取得(任意・Windows)**: DxLib同梱のライブラリと一致するMinGW-w64を、確認のうえ取得します。既存のMinGWは上書きしません。
- **組み合わせの記録と警告**: 使ったライブラリを `dx.config.json` に記録し、手元のg++と食い違えば警告します(ビルドは止めません)。
- **JavaScriptでシーンを書ける(任意)**: `dx create --script` で、QuickJSによるスクリプトシーン付きのプロジェクトを作れます。
- **Node.js 18以上が必要です。**
## コマンド一覧

| コマンド | 説明 |
|---|---|
| `dx create <name> [--mode=windows\|native\|stub] [--script]` | 新規プロジェクトを作成。DxLib本体の取得・配置・`.vscode`生成まで一括実行。`--script`(windowsモードのみ)でスクリプト層(QuickJS)付きにする |
| `dx dev` | 開発モード。`src/**/*.{cpp,h,hpp}` を監視し、変更があれば自動で再ビルド&再起動(`scripts/` はまだ監視しません) |
| `dx build [--release]` | ビルド(デフォルトはdebug)。`--release`で最適化ビルド |
| `dx run` | ビルドして実行 |
| `dx test` | `tests/` 配下の `*.cpp` を独立ビルド&実行。exit codeのみで成否判定(フレームワーク不使用) |
| `dx clean` | `build/` を削除 |
| `dx update [--vscode-only] [--force]` | DxLib本体と`.vscode`設定を最新化(スクリプト層があればQuickJSも取得)。`--force`で再取得。**`src/`配下のユーザーコードは一切変更しません** |
| `dx doctor` | 環境診断(g++/デバッガ/DxLibキャッシュ/プロジェクト設定、ライブラリとg++の組み合わせ、スクリプト層の状態を一覧表示) |
| `dx toolchain [status\|install [--force]\|remove]` | (Windows)DxLibと一致するMinGW-w64の取得・状態確認・削除。後述の「MinGW-w64の自動取得」を参照 |
| `dx add scene <Name>` | `IScene`を継承するシーンクラスを`src/scenes/`に生成 |
| `dx add class <Name>` | 素のクラス(.h/.cpp)を`src/`に生成 |

---

## dxlibMode (windows / native / stub)

`dx create`時に決まり、`dx.config.json`に保存されます。

| モード | 対象 | 実体 | 実行可否 |
|---|---|---|---|
| `windows` | Windows | DxLib公式 Windows版 gcc(MinGW)用 | 可能 |
| `native` | Linux(X11必須) | [dxlib-for-linux](https://github.com/dragoon2014/dxlib-for-linux)(dra様作、コミュニティ実装) | 可能 |
| `stub` | Mac/Windows/Linuxどこでも | DxLib公式Windows版ヘッダのみ配置 | 不可(構文チェックのみ) |

`dx create`引数なしの場合、Windowsでは`windows`、macOSでは`stub`が自動選択されます。
Linuxでは対話式でnative/stubを選べます。

`native`モードは公式のLinux版ではなく、コミュニティによる別実装(API互換)です。
内部実装は別物のため、公式Windows版と完全に同一の挙動とは限りません。

---
## MinGW-w64の自動取得(Windows・任意)

MinGWの導入が難しい人向けの補助機能です。**検出が主で、取得は確認を取ってから行う補助**という位置づけです。

- `dx create`(windowsモード)で `g++` が見つからないときだけ、「取得しますか?」と確認します(標準は「いいえ」)。
  `dx toolchain install` でいつでも手動実行できます。
- 取得するのは、DxLib 3.25a同梱のライブラリ(`12_2_0_x86_64_release_win32_seh_ucrt_rt_v10_rev2`)と一致する
  [niXman/mingw-builds](https://github.com/niXman/mingw-builds-binaries) の12.2.0 (win32スレッド/SEH/UCRT, 約70MB)です。
  7z形式のため、展開用に7-Zip公式の `7zr.exe`(バージョン固定)も合わせて取得します。
- 保存先は `~/.dxlib-setup/toolchain/` です。システムへのインストール、PATHの変更、管理者権限は不要です。
- **既存のMinGWは上書きしません。** `g++` はPATHと既知の場所を先に探し、見つからないときだけ取得したものを使います。
- 取得物はサイズ・シグネチャ・SHA-256を検証し、一時フォルダへ展開 → `g++ -dumpversion` と
  テストコードのコンパイルで動作確認 → 正式な場所へ移動、の順で配置します。検証に失敗したものは残りません。
- ダウンロードのタイムアウトは、全体の時間ではなく「30秒間データが届かない場合」です。遅い回線でも完走します。
- dx-cliは取得物を再配布していません。実行時に上流(GitHub)から直接取得します。

セキュリティソフトが展開中のファイルを隔離すると、展開に失敗することがあります (MinGW付属のツールが誤検知される場合があります)。
その場合は案内が表示されます。隔離の一覧を確認し、内容を自分で判断したうえで復元または除外設定をしてから
`dx toolchain install --force` を再実行してください。設定を変えたくない場合は、MinGW-w64を自分で導入してPATHに通してください。

---
## スクリプト層(QuickJS・任意)

`dx create <name> --mode=windows --script` で、JavaScriptでシーンを書けるプロジェクトを作れます
(現在はwindowsモードのみ対応。native/stubでは無視されます)。

```
dx create MyGame --mode=windows --script
cd MyGame
dx run
```

- 最初のシーンは `scripts/title.js` です。保存して `dx run` し直すと反映されます。
- スクリプトは、グローバル関数 `init()` / `update(dt)` / `draw()` を(定義されていれば)呼ばれます。`dt` はです。
- スクリプトから使えるAPI(現在は最小限です):

| 関数 | 説明 |
|---|---|
| `drawText(x, y, text [, r, g, b])` | 文字を描く |
| `drawBox(x1, y1, x2, y2 [, r, g, b])` | 塗りつぶしの四角形を描く |
| `isKeyDown(keyCode)` | キーが押されているか(DxLibの `KEY_INPUT_*` の値を渡す) |

- スクリプトのエラーは、ウィンドウアプリでコンソールが無いため、**ウィンドウの左上に赤い文字で表示**されます。
- 仕組み: [quickjs-ng](https://github.com/quickjs-ng/quickjs) の amalgam版(MIT)を、`dx create --cript` の実行時に
  上流から取得してSHA-256を検証し、`lib/quickjs/` に配置します。dx-cliは再配布しません。
  初回のビルド時にだけCファイルをコンパイルし、`build/quickjs.o` にキャッシュします(2回目以降は再利用)。
- `dx.config.json` の `scripting` に、使っているQuickJSのバージョンが記録されます。
  `lib/quickjs/` が無い場合は `dx update --force` で取得し直せます。
- TypeScriptはまだ対応していません(QuickJSはJavaScriptのみ読めます)。
---
## プロジェクト構成 (dx create後)

```
MyGame/
├── dx.config.json         # プロジェクト設定(name, dxlibMode, cppStandard, 使用ライブラリの記録 dxlib, scripting 等)
├── src/
│   ├── main.cpp            # エントリポイント。SceneManagerでTitleSceneを起動
│   ├── engine/
│   │   ├── IScene.h         # シーン共通インターフェース(Init/Update/Draw/End)
│   │   ├── SceneManager.h/.cpp
│   │   └── ScriptScene.h/.cpp  # (--script のみ)JavaScriptのシーンを動かすシーン
│   └── scenes/
│       └── TitleScene.h/.cpp   # (--script なしの場合)
├── scripts/                  # (--script のみ)title.js 等
├── lib/quickjs/              # (--script のみ)QuickJS。取得物(.gitignore対象)
├── tests/
│   ├── dx_test.h            # 自作アサートマクロ(DX_CHECK / DX_PASS)
│   └── example_test.cpp
├── lib/DxLib/                # DxLib本体(.gitignore対象)
├── build/                     # ビルド出力(.gitignore対象)
├── .vscode/                   # tasks.json等。実体は全て `dx` コマンド呼び出しに委譲
└── .gitignore
```

### シーンシステムについて

DxLib自体にシーン管理機能は無いため、`dx-cli`独自の軽量な規約を採用しています。

```cpp
// シーン切り替えの例
SceneManager::Get().ChangeScene(std::make_unique<BattleScene>());
```

`Init()` → 毎フレーム `Update()`/`Draw()` → `End()` という単純なライフサイクルです。
切り替えは次フレームの先頭で安全に行われます(描画/更新中の差し替えを避けるため)。

### `dx test` のテスト方式

doctest/Catch2のような外部フレームワークを使わず、**1ファイル = 1実行ファイル、exit codeのみで判定**する
自作の最小ランナーです。`tests/dx_test.h` の `DX_CHECK` / `DX_PASS` マクロのみ提供します。
DxLib本体へのリンクは行わないため、ロジック単体のテストに向いています。

---

## `.vscode` の設計について

`tasks.json` は直接 `g++` を呼ぶのではなく、すべて `dx build` / `dx run` / `dx test` を経由します。
これにより、ビルドフラグの定義場所が `dx-cli` 内の1箇所(`core/compiler.ts`)に集約され、
VSCode上のビルドとターミナルからの `dx build` でズレが生じません。

---

## 旧 vbs/sh ツール(`dxlib-setup-kit`)との関係

以前作成した `windows/dxlib-setup.vbs` ・ `unix/dxlib-setup.sh` は、Node.jsを使わない環境向けの
代替セットアップ手段として**そのまま維持されます**。どちらも `~/.dxlib-setup/cache` を共有するため、
一度ダウンロード済みのDxLib zipやdxlib-for-linuxソースは、`dx-cli`でも旧スクリプトでも再利用されます。

`dx-cli`が使える環境では`dx-cli`の使用を推奨しますが、Node.js導入が難しい環境やワンショットの
セットアップだけで十分な場合は、旧スクリプトを使ってください。

---

## 既知の制約

- DxLibは `src/core/manifest.ts` で固定したバージョンを、サイズ・zip構造・SHA-256を検証して取得します。
  公式サイトが落ちている・URLが変わった場合は、環境変数 `DX_MIRROR_URL`(`<URL>/<ファイル名>` を最優先で試す)で
  ミラーを指定できます。それも失敗したときだけ、公式ダウンロードページからのリンク抽出にフォールバックします
  (この場合はバージョンもハッシュも固定されません)。
  すべて失敗した場合は、ダウンロードしたzipを `~/.dxlib-setup/cache/` に置いてから `dx update --force` を実行してください。
- DxLibのSHA-256は `src/core/manifest.ts` に固定されています。公式のファイルが差し替えられた場合は、
  ハッシュ不一致として取得を拒否します。DxLibのバージョンを上げるときは、`version` / `fileName` / `sources` /
  `sha256` をまとめて更新してください。
- 管理下のMinGW-w64(`dx toolchain`)はDxLib 3.25a用の1組(12.2.0)のみ対応です。上流(niXman)はチェックサムを公開していないため、
- ライブラリとg++の食い違い(アーキテクチャ・スレッドモデル・gccのメジャーバージョン)は、`dx doctor` と `dx build` が
  警告するだけで、ビルドは止めません。判別できない項目は比較しません。
- スクリプト層(QuickJS)はwindowsモードのみです。`dx dev` は `scripts/` の変更を監視しないため、
  JavaScriptを直したときは `dx run` し直してください。QuickJSのバージョンとSHA-256は `src/core/manifest.ts` に固定されています。
  `src/core/manifest.ts` のSHA-256はdx-cli側で実測して固定した値です。
- `dx dev` のファイル監視は `fs.watch` を使用しており、一部のファイルシステム(特にネットワークドライブ等)
  では変更検知が不安定になることがあります。問題がある場合は `dx build && dx run` を手動実行してください。
- `dx test` はDxLib本体にリンクしないため、DxLibのAPIを直接呼ぶコードのテストには使えません。
  ロジック層を分離してテスト可能な形に保つことを推奨します。
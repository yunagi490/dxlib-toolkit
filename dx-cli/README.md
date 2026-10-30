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
brew tap YOUR_GITHUB_USERNAME/dxlib-toolkit
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

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `dx create <name> [--mode=windows\|native\|stub]` | 新規プロジェクトを作成。DxLib本体の取得・配置・`.vscode`生成まで一括実行 |
| `dx dev` | 開発モード。`src/**/*.{cpp,h,hpp}` を監視し、変更があれば自動で再ビルド&再起動 |
| `dx build [--release]` | ビルド(デフォルトはdebug)。`--release`で最適化ビルド |
| `dx run` | ビルドして実行 |
| `dx test` | `tests/` 配下の `*.cpp` を独立ビルド&実行。exit codeのみで成否判定(フレームワーク不使用) |
| `dx clean` | `build/` を削除 |
| `dx update [--vscode-only] [--force]` | DxLib本体と`.vscode`設定を最新化。**`src/`配下のユーザーコードは一切変更しません** |
| `dx doctor` | 環境診断(g++/デバッガ/DxLibキャッシュ/プロジェクト設定の状態を一覧表示) |
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

## プロジェクト構成 (dx create後)

```
MyGame/
├── dx.config.json         # プロジェクト設定(name, dxlibMode, cppStandard等)
├── src/
│   ├── main.cpp            # エントリポイント。SceneManagerでTitleSceneを起動
│   ├── engine/
│   │   ├── IScene.h         # シーン共通インターフェース(Init/Update/Draw/End)
│   │   ├── SceneManager.h/.cpp
│   └── scenes/
│       └── TitleScene.h/.cpp
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
- `dx dev` のファイル監視は `fs.watch` を使用しており、一部のファイルシステム(特にネットワークドライブ等)
  では変更検知が不安定になることがあります。問題がある場合は `dx build && dx run` を手動実行してください。
- `dx test` はDxLib本体にリンクしないため、DxLibのAPIを直接呼ぶコードのテストには使えません。
  ロジック層を分離してテスト可能な形に保つことを推奨します。
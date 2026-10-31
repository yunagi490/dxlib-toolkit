# dxlib-toolkit

[DxLib](https://dxlib.xsrv.jp/)(gcc/MinGW版)を使ったゲーム開発を効率化するツール集です。
2つの独立したツールを同じリポジトリにまとめています。

| ツール                                 | 対象                                | できること                                                                              |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| [`dx-cli`](./dx-cli)                   | Windows / Mac / Linux (Node.js 18以上) | `dx create`/`dev`/`build`/`run`/`test`/`add`/`update`/`doctor`/`toolchain` 等、Vite/Nuxtライクな開発体験一式。取得物の検証、MinGW-w64の取得、JavaScript(QuickJS)のシーンにも対応 |
| [`dxlib-setup-kit`](./dxlib-setup-kit) | Windows(vbs) / Mac・Linux(sh)       | Node.js不要。ワンショットで環境構築だけ行う軽量スクリプト                               |

どちらも DxLib本体・[dxlib-for-linux](https://github.com/dragoon2014/dxlib-for-linux)のダウンロード/clone先キャッシュ
(`~/.dxlib-setup/cache`、Windowsは`%USERPROFILE%\.dxlib-setup\cache`)を共有するため、
片方で取得済みのファイルはもう片方でも再利用されます。

## どっちを使えばいい？

- **Node.js 18以上が使える/使ってもいい環境** → `dx-cli` を推奨。`dx dev`での自動ビルド&再起動、`dx add scene`での雛形生成、
  `dx test`でのテスト実行など、継続的な開発に向いた機能が揃っています。
  また、DxLibなどの取得物をSHA-256で検証し、DxLibと一致するMinGW-w64の取得(任意)や、
  ライブラリとg++の食い違いの警告にも対応しています。
- **Node.jsを入れたくない/ワンショットの環境構築だけで十分** → `dxlib-setup-kit` の vbs/sh を使ってください。
  (ダウンロードの検証やMinGW-w64の取得は行いません。詳しくは [`dxlib-setup-kit/README.md`](./dxlib-setup-kit/README.md))

## はじめかた(dx-cli)

```bash
dx create MyGame                 # Windowsではwindowsモード。g++が無ければ取得の確認が出ます
cd MyGame
dx dev                           # 自動ビルド&再起動

# JavaScriptでシーンを書きたい場合(windowsモードのみ)
dx create MyGame --mode=windows --script
```

各コマンドの詳細は [`dx-cli/README.md`](./dx-cli/README.md) を参照してください。

## 取得物について

DxLib本体・MinGW-w64・QuickJS・dxlib-for-linux は、いずれも**このリポジトリには含まれていません**。
実行時に各配布元から直接取得します(バージョンとSHA-256は `dx-cli/src/core/manifest.ts` に固定)。
各ライブラリの著作権・利用許諾は、それぞれの配布元の規約に従います。

## インストール

### dx-cli (Mac/Linux, Homebrew)

```bash
brew tap yunagi490/dxlib-toolkit
brew install dx-cli
dx help
```

(tap用リポジトリ・公開手順は [`PUBLISHING.md`](./PUBLISHING.md) を参照。
このモノレポとは別に `homebrew-dxlib-toolkit` という専用リポジトリが必要です。)

### dx-cli (Windows / yarnから直接)

```powershell
yarn global add file:./dx-cli
dx help
```

### dxlib-setup-kit (vbs/sh)

```bash
# Windows
cscript dxlib-setup-kit\windows\dxlib-setup.vbs

# Mac/Linux
chmod +x dxlib-setup-kit/unix/dxlib-setup.sh
./dxlib-setup-kit/unix/dxlib-setup.sh
```

詳細は各ツールのREADMEを参照してください。

## ライセンス

MIT (詳細は [LICENSE](./LICENSE) を参照)

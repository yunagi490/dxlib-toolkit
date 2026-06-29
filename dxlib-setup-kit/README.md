# dxlib-setup-kit

DxLib(gcc/MinGW版) + VSCode の開発環境を一括構築するセットアップスクリプト集。

- **Windows**: `windows/dxlib-setup.vbs`
- **Mac/Linux**: `unix/dxlib-setup.sh`

新規プロジェクトでも、既存プロジェクトに後付けでも動作します。

---

## 使い方

### Windows

1. このフォルダ一式（`windows/`, `unix/`, `templates/`）をまとめてプロジェクトのルート、
   もしくは適当な場所に配置する。
2. プロジェクトフォルダで `dxlib-setup.vbs` をダブルクリック、または:
   ```cmd
   cscript windows\dxlib-setup.vbs
   ```
3. 必要なら以下のオプションを付ける:
   - `/force` : `.vscode` 等を確認なしで上書き(自動でバックアップは作成されます)

スクリプトが行うこと:
- `g++.exe` (MinGW) の検出。無ければ Chocolatey 経由のインストールを提案
- DxLib「Windows版 Gnu C++(MinGW)用」zip のダウンロード(キャッシュ優先)
- `lib\DxLib\` への展開・配置
- `.vscode\tasks.json` / `c_cpp_properties.json` / `launch.json` の生成
- `src\main.cpp` サンプルの生成(既存の.cppがある場合はスキップ)

### Mac / Linux

```bash
chmod +x unix/dxlib-setup.sh
./unix/dxlib-setup.sh
```

オプション:
- `--mode=native` : [dxlib-for-linux](https://github.com/dragoon2014/dxlib-for-linux) (dra様作)を実機ビルドし、
  実際に実行可能な状態にする。Linux + X11環境が必要。
- `--mode=stub` : Windows版のヘッダのみ配置し、構文チェック/IntelliSenseだけ通す。実行は不可。
  macOSではこちらが自動選択されます。
- `--force` : `.vscode` 等を確認なしで上書き(自動でバックアップは作成されます)

引数を省略すると、Linuxでは対話式でモードを選べます。

---

## native / stub モードの違い

| | native | stub |
|---|---|---|
| 対象 | Linux (X11必須) | Windows/Mac/Linuxどこでも |
| 実体 | dxlib-for-linux(dra様作、コミュニティ実装) | DxLib公式Windows版ヘッダ |
| 実行可否 | 可能 | 不可(構文チェックのみ) |
| 用途 | 実際に動かしながら開発したい場合 | Windows実機が無い環境でコードだけ書きたい場合 |

`dxlib-for-linux` は **公式のDxLib Linux版ではなく、コミュニティによる別実装(API互換)** です。
内部実装は別物のため、公式Windows版と完全に同一の挙動・対応関数とは限りません。
重要な機能を使う前に、リポジトリのドキュメントで対応状況を確認することをおすすめします。
https://github.com/dragoon2014/dxlib-for-linux

---

## キャッシュについて

ダウンロードしたDxLib zipや `dxlib-for-linux` のソースは、ユーザーホーム以下にキャッシュされ、
複数プロジェクトで再利用されます。

- Windows: `%USERPROFILE%\.dxlib-setup\cache`
- Mac/Linux: `~/.dxlib-setup/cache`

別バージョンを使いたい場合や壊れた場合は、このフォルダの中身を削除してから再実行してください。

---

## 既知の制約・トラブルシュート

### 「ダウンロードページからzipリンクを自動抽出できませんでした」と出る場合

DxLib公式サイト(https://dxlib.xsrv.jp/dxdload.html)のページ構造が変わった場合、
自動でzipのURLを取得できないことがあります。この場合スクリプトは:

1. ダウンロードページとキャッシュフォルダを自動で開きます(Windows/Mac/Linux共通)。
2. 該当ページから「DXライブラリ Windows版 Gnu C++( MinGW )用」を手動でダウンロードし、
   キャッシュフォルダに保存してください。
3. 再度スクリプトを実行すると、キャッシュ済みのzipを優先して使用します。

### MinGWのバージョンとDxLibのバージョン別フォルダが合わない

DxLibのgcc用zipには、コンパイラバージョン別のフォルダ(`8_2_0`, `9_2_0`など)が複数入っています。
スクリプトは `g++ -dumpversion` の結果と最も近いものを自動選択しますが、
リンクエラーが出る場合は `lib\DxLib`(Windows) / `lib/DxLib`(Mac/Linux) の中身を、
手動で別バージョンのものに入れ替えてみてください。
(DxLib公式の経験則として、バージョンが多少違っても動作することが多いとされています)

### `.vscode` が既存プロジェクトに既にある

上書き前に自動で `.vscode.bak_YYYYMMDD_HHMMSS` のようなバックアップを作成します。
不要になったら手動で削除してください。

### native モードでビルドが失敗する

依存パッケージが不足している可能性があります。スクリプトが提示する
`apt` / `dnf` / `pacman` コマンドを使って手動インストールしてから再実行してください。

---

## ディレクトリ構成(セットアップ後)

```
your-project/
├── .vscode/
│   ├── tasks.json
│   ├── c_cpp_properties.json
│   └── launch.json          (stubモードでは生成されません)
├── lib/DxLib/                 (ヘッダ・ライブラリ。.gitignore対象)
├── src/
│   └── main.cpp              (新規プロジェクトの場合のみ生成)
├── build/                     (ビルド出力先。.gitignore対象)
├── .gitignore
└── .dxlib-setup.json          (将来の再実行用設定、現バージョンでは未使用の予約フィールド)
```

---

## 注意事項

- DxLib本体・dxlib-for-linuxはそれぞれ別の配布者によるものです。本スクリプトはあくまで
  ダウンロード・配置・VSCode設定の自動化を行うだけで、ライブラリ本体の著作権・利用許諾は
  各配布元の規約に従います。
- 自動ダウンロード機能は配布元サイトの構造変更により動作しなくなる可能性があります。
  その際は上記トラブルシュートに従って手動DLしてください。

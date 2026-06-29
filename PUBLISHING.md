# 公開手順 (GitHub + Homebrew tap)

このリポジトリ(`dxlib-toolkit`)と、Homebrew tap用の別リポジトリ(`homebrew-dxlib-toolkit`)を
GitHubに公開し、`brew install dx-cli` で誰でも(自分でも)インストールできるようにするまでの手順です。

**この手順はWindows 10 + PowerShell 7 + Git for Windows を前提に書いています。**
`brew`コマンド自体はMac/Linux専用なので、公開(push)作業はWindowsで行い、
最終的な`brew install`での動作確認はMac/Linux環境(別マシン、VM、WSL等)で行ってください。
手順5・6はMac/Linux側での作業です。

以下、`YOUR_GITHUB_USERNAME` は実際のGitHubユーザー名に読み替えてください。
このプレースホルダーは以下のファイルに登場するので、置き換えが必要です:

- `dxlib-toolkit\README.md`
- `dxlib-toolkit\dx-cli\README.md`
- `dxlib-toolkit\dx-cli\package.json` (`repository`, `homepage`, `bugs`)
- `homebrew-dxlib-toolkit\README.md`
- `homebrew-dxlib-toolkit\Formula\dx-cli.rb` (`homepage`, `url`)

また、`dxlib-toolkit\LICENSE` 内の `YOUR_NAME_OR_HANDLE` も、著作者として表示したい名前や
ハンドルネームに置き換えてください(これは上記の一括置換スクリプトの対象には含まれていないので、
手動で編集してください)。

## 0. 事前準備: プレースホルダーの一括置換 (PowerShell 7)

`dxlib-toolkit` と `homebrew-dxlib-toolkit` が同じ親フォルダに並んでいる前提です。

```powershell
$username = "実際のGitHubユーザー名"

# dxlib-toolkit 側
Get-ChildItem -Path .\dxlib-toolkit -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\dist\\|\\node_modules\\' } |
    Select-String -Pattern "YOUR_GITHUB_USERNAME" -List |
    Select-Object -ExpandProperty Path |
    ForEach-Object {
        (Get-Content -Raw -LiteralPath $_) -replace "YOUR_GITHUB_USERNAME", $username |
            Set-Content -NoNewline -LiteralPath $_
    }

# homebrew-dxlib-toolkit 側
Get-ChildItem -Path .\homebrew-dxlib-toolkit -Recurse -File |
    Select-String -Pattern "YOUR_GITHUB_USERNAME" -List |
    Select-Object -ExpandProperty Path |
    ForEach-Object {
        (Get-Content -Raw -LiteralPath $_) -replace "YOUR_GITHUB_USERNAME", $username |
            Set-Content -NoNewline -LiteralPath $_
    }
```

置換できたか確認:

```powershell
Get-ChildItem -Path .\dxlib-toolkit,.\homebrew-dxlib-toolkit -Recurse -File |
    Select-String -Pattern "YOUR_GITHUB_USERNAME"
# 何も出力されなければ置換完了
```

`-replace`に正規表現の特殊文字は含まれないので素朴な文字列置換で問題ありません。
`Set-Content -NoNewline`は、置換時に余分な改行が末尾に追加されるのを防ぐためのものです
(念のため、置換後に`git diff`で意図しない改行コード変化(CRLF/LF)が起きていないか確認してください)。

> **注意**: この`PUBLISHING.md`自体にも説明用に`YOUR_GITHUB_USERNAME`という文字列が
> 複数回登場します。上記スクリプトをこのファイルにも適用すると、説明文中のプレースホルダーまで
> 実際のユーザー名に書き換わってしまい、ドキュメントとして読みづらくなります(動作上の問題は
> ありませんが、見た目が気になる場合は対象から`PUBLISHING.md`を除外してください)。
> 例: `Where-Object { $_.Name -ne "PUBLISHING.md" }` を `Get-ChildItem`の後に挟む。

---

## 1. メインリポジトリ(dxlib-toolkit)をGitHubに公開する

```powershell
cd .\dxlib-toolkit

git init

# dxlib-setup.sh と dist/bin/dx.js はLinux/Mac上での実行権限(755)を保持させたい。
# Windows上のgitはこのビットを直接扱えないため、git add前に明示しておく。
# (注: --chmod は git 2.9+ で利用可能。Git for Windows最新版なら問題ありません)
git add .
git update-index --chmod=+x dxlib-setup-kit/unix/dxlib-setup.sh
git update-index --chmod=+x dx-cli/dist/bin/dx.js

git commit -m "Initial commit: dx-cli + dxlib-setup-kit"

# GitHub上で空のリポジトリ "dxlib-toolkit" を先に作成しておく(README/LICENSEは追加しない)
git remote add origin https://github.com/$username/dxlib-toolkit.git
git branch -M main
git push -u origin main
```

push後、GitHub上のファイル一覧で `dxlib-setup-kit/unix/dxlib-setup.sh` と
`dx-cli/dist/bin/dx.js` の実行権限がついているか確認してください
(GitHubのファイル一覧では確認しづらいので、`git clone`し直した後に
`ls -la` で確認するのが確実です)。`dx-cli/dist/bin/dx.js`の実行権限が
無いと、Homebrew経由でのシンボリックリンク実行(`bin.install_symlink`)が
失敗する可能性があるため、特に重要です。

> **補足**: `git update-index --chmod=+x` は、Windows(NTFS)のファイルシステム自体に
> 実行権限という概念が無いことを回避するための特殊操作です。実際のファイルの
> 権限ビットを変更するのではなく、gitの管理データ(インデックス)上で
> 「このファイルは755相当として記録する」と直接指定しています。
> そのためWindows上で実行しても安全に機能し、Linux/Macでcloneした際に
> 正しく実行権限付きで復元されます。

## 2. リリースタグを打つ

Homebrewのformulaはタグ付きのtarballをダウンロードします。`dx-cli\package.json`の`version`と
タグ名を一致させておくと管理が楽です(今回は`0.1.0`)。

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub上で「Releases」→「Draft a new release」からこのタグを選び、公開しておくとなお親切です
(必須ではありません。タグさえあればアーカイブtarballは自動生成されます)。

## 3. リリースtarballのsha256を計算する (PowerShell 7)

Homebrew formulaには、ダウンロードするtarballの正しいsha256ハッシュを書く必要があります。
プレースホルダー(`REPLACE_WITH_REAL_SHA256`)のままでは動きません。

```powershell
Invoke-WebRequest `
    -Uri "https://github.com/$username/dxlib-toolkit/archive/refs/tags/v0.1.0.tar.gz" `
    -OutFile "$env:TEMP\dxlib-toolkit-0.1.0.tar.gz"

Get-FileHash -Algorithm SHA256 "$env:TEMP\dxlib-toolkit-0.1.0.tar.gz"
```

`Hash`列に出力された64文字の値をコピーしておきます(大文字で出ますが、Homebrew formulaでは
小文字・大文字どちらでも動作します。Homebrew公式は小文字表記が慣例なので、見た目を揃えるなら
`.Hash.ToLower()`を末尾に付けても構いません)。

## 4. tapリポジトリ(homebrew-dxlib-toolkit)をGitHubに公開する

`homebrew-dxlib-toolkit\Formula\dx-cli.rb` の `sha256` を、3.で得た値に書き換えてから:

```powershell
cd ..\homebrew-dxlib-toolkit

git init
git add .
git commit -m "Add dx-cli formula"

# GitHub上で空のリポジトリ "homebrew-dxlib-toolkit" を先に作成しておく
# (リポジトリ名は必ず "homebrew-" プレフィックス + tap名にすること。
#  これでないと `brew tap user/dxlib-toolkit` のような短縮形が使えません)
git remote add origin https://github.com/$username/homebrew-dxlib-toolkit.git
git branch -M main
git push -u origin main
```

---

## 5. 動作確認 (Mac/Linux側での作業)

```bash
brew tap YOUR_GITHUB_USERNAME/dxlib-toolkit
brew install dx-cli
dx help
```

`brew audit`で公式の作法チェックもできます(必須ではありませんが推奨):

```bash
brew audit --strict --online dx-cli
```

## 6. (任意) Formulaのテストを単体で走らせる (Mac/Linux側)

```bash
brew test dx-cli
```

`Formula/dx-cli.rb`内の`test do...end`ブロック(`dx help`の出力に"DxLib"が含まれるか)が実行されます。

---

## src/を編集した後の再リリース手順(まとめ、PowerShell 7)

```powershell
# 1. dx-cli\src\ を編集

# 2. distを再生成
cd .\dxlib-toolkit\dx-cli
yarn build

# 3. package.jsonのversionを上げる (例: 0.1.0 -> 0.1.1。手動でファイルを編集してください)

# 4. dist/の差分も含めてコミット
cd ..
git add .
# yarn buildでdist/bin/dx.jsが再生成されるため、実行権限を再設定しておく
git update-index --chmod=+x dx-cli/dist/bin/dx.js
git commit -m "Release v0.1.1"

# 5. タグを打ってpush
git tag v0.1.1
git push origin main v0.1.1

# 6. 新tarballのsha256を再計算 (手順3と同様の Invoke-WebRequest + Get-FileHash)
Invoke-WebRequest `
    -Uri "https://github.com/$username/dxlib-toolkit/archive/refs/tags/v0.1.1.tar.gz" `
    -OutFile "$env:TEMP\dxlib-toolkit-0.1.1.tar.gz"
Get-FileHash -Algorithm SHA256 "$env:TEMP\dxlib-toolkit-0.1.1.tar.gz"

# 7. homebrew-dxlib-toolkit\Formula\dx-cli.rb の url のバージョンと sha256 を更新してpush
cd ..\homebrew-dxlib-toolkit
git add .
git commit -m "Update dx-cli to v0.1.1"
git push

# 8. (Mac/Linux側) brew upgrade dx-cli で確認
```

---

## Windows上でのGit改行コード設定について

Git for Windowsはデフォルトで `core.autocrlf=true` になっていることが多く、
テキストファイルがチェックアウト時にCRLFに変換されます。`dx-cli\dist\bin\dx.js`等の
Node.jsスクリプトはLF/CRLFどちらでも動作しますが、`dxlib-setup-kit\unix\dxlib-setup.sh`
(シェルスクリプト)はCRLFが混入すると`bash`実行時にエラーになることがあります。

このリポジトリには対策済みの `dxlib-toolkit\.gitattributes` を同梱済みです
(`*.sh`はLF固定、`*.vbs`/`*.bat`はCRLF固定、その他のテキストファイルはLF固定)。
手順1で`git add .`する際に一緒にcommitされるので、追加の作業は不要です。

既に別のリポジトリで作業していてCRLFのまま一部ファイルがコミットされてしまっている場合は、
`.gitattributes`をcommitした後に以下で正規化できます:

```powershell
git add --renormalize .
git commit -m "Normalize line endings"
```

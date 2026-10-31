# 公開手順 (GitHub + Homebrew tap)

このリポジトリ(`dxlib-toolkit`)と、Homebrew tap用の別リポジトリ(`homebrew-dxlib-toolkit`)を
GitHubに公開し、`brew install dx-cli` で誰でも(自分でも)インストールできるようにするまでの手順です。

**この手順はWindows 10 + PowerShell 7 + Git for Windows を前提に書いています。**
`brew`コマンド自体はMac/Linux専用なので、公開(push)作業はWindowsで行い、
最終的な`brew install`での動作確認はMac/Linux環境(別マシン、VM、WSL等)で行ってください。
手順5・6はMac/Linux側での作業です。

以下、`yunagi490` はこのリポジトリの公開先のGitHubユーザー名です。
**このリポジトリ内のユーザー名・LICENSEの著作者名は、すでに `yunagi490` に置換済みです**(`README.md`、`dx-cli/README.md`、
`dx-cli/package.json` の `repository`/`homepage`/`bugs`、`LICENSE`)。通常は置換作業は不要です。

## 0. (フォークして別のユーザー名で公開する場合のみ)ユーザー名の置換

自分のGitHubアカウントにフォークして公開する場合だけ、`yunagi490` を自分のユーザー名に置換します。
`dxlib-toolkit` と `homebrew-dxlib-toolkit` が同じ親フォルダに並んでいる前提です。

```powershell
$username = "実際のGitHubユーザー名"

# 置換前に、対象のファイルを確認する(このPUBLISHING.mdと .git、dist、node_modules は除く)
Get-ChildItem -Path .\dxlib-toolkit,.\homebrew-dxlib-toolkit -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.git\\|\\dist\\|\\node_modules\\' -and $_.Name -ne "PUBLISHING.md" } |
    Select-String -Pattern "yunagi490" -List |
    Select-Object -ExpandProperty Path

# 確認できたら置換する
Get-ChildItem -Path .\dxlib-toolkit,.\homebrew-dxlib-toolkit -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.git\\|\\dist\\|\\node_modules\\' -and $_.Name -ne "PUBLISHING.md" } |
    Select-String -Pattern "yunagi490" -List |
    Select-Object -ExpandProperty Path |
    ForEach-Object {
        (Get-Content -Raw -LiteralPath $_) -replace "yunagi490", $username |
            Set-Content -NoNewline -LiteralPath $_
    }
```

`LICENSE` の著作者名(`Copyright (c) 2026 ...`)も、上記の置換で一緒に書き換わります。別の名前にしたい場合は手動で編集してください。
置換後は `git diff` で、意図しない改行コード(CRLF/LF)の変化が起きていないか確認してください。

---

## 1. メインリポジトリ(dxlib-toolkit)をGitHubに公開する

> このリポジトリはすでにGitHubで公開されています。**新しいリポジトリとして初めて公開する場合だけ**この手順を使い、
> 通常のリリースは「2. リリース」から進めてください。

```powershell
cd .\dxlib-toolkit

git init

# dxlib-setup.sh と dx-cli/dist/bin/dx.js はLinux/Mac上での実行権限(755)を保持させたい。
# Windows上のgitはこのビットを直接扱えないため、git add後に明示しておく。
git add .
git update-index --chmod=+x dxlib-setup-kit/unix/dxlib-setup.sh
git update-index
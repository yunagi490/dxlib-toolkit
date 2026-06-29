' ============================================================================
'  dxlib-setup.vbs
'  DxLib(gcc/MinGW版) + VSCode 環境を一括構築するセットアップスクリプト
'
'  使い方:
'    1. このファイルをプロジェクトフォルダ(あるいは作りたい場所)に置く
'    2. ダブルクリック、または以下のようにコマンドラインから実行
'         cscript dxlib-setup.vbs
'         cscript dxlib-setup.vbs /force           (.vscode等を確認なしで上書き)
'
'  新規プロジェクト/既存プロジェクトのどちらに対しても、自動判定して動作します
'  (src\に既存の.cppがあればサンプル生成をスキップする、等)。
'
'  このスクリプトが行うこと:
'    - MinGW(g++.exe) の検出。無ければ Chocolatey 経由でのインストールを提案
'    - DxLib Windows版 Gnu C++(MinGW)用 zip のダウンロード(キャッシュ済みなら再利用)
'    - zip をプロジェクト内 lib\DxLib\ に展開
'    - .vscode\tasks.json / c_cpp_properties.json / launch.json を生成
'    - 新規の場合は src\main.cpp のサンプルを生成
'
'  キャッシュ:
'    %USERPROFILE%\.dxlib-setup\cache\ にDxLib zipを保存し、複数プロジェクトで再利用します。
' ============================================================================

Option Explicit

Dim fso, shell
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' ----------------------------------------------------------------------------
' 設定値
' ----------------------------------------------------------------------------
Const DXLIB_DOWNLOAD_PAGE = "https://dxlib.xsrv.jp/dxdload.html"
Const DXLIB_BASE_URL = "https://dxlib.xsrv.jp/"
Const LOG_PREFIX = "[dxlib-setup] "

Dim scriptDir, projectDir, cacheDir, configPath
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = scriptDir
cacheDir = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.dxlib-setup\cache"
configPath = projectDir & "\.dxlib-setup.json"

Dim forceOverwrite
forceOverwrite = (InStr(LCase(ArgsToString()), "/force") > 0)

' ----------------------------------------------------------------------------
' メイン処理
' ----------------------------------------------------------------------------
Sub Main()
    LogLine "=========================================="
    LogLine " DxLib (gcc/MinGW版) セットアップ開始"
    LogLine "=========================================="
    LogLine "プロジェクトフォルダ: " & projectDir

    EnsureFolder cacheDir

    ' 1. MinGW(g++)検出
    Dim gppPath, gdbPath
    gppPath = FindGpp()
    If gppPath = "" Then
        LogLine "g++.exe が見つかりませんでした。"
        If HasChocolatey() Then
            If Confirm("Chocolatey経由で mingw をインストールしますか？ (管理者権限が必要です)") Then
                InstallMingwViaChocolatey()
                gppPath = FindGpp()
            End If
        End If

        If gppPath = "" Then
            LogLine "----------------------------------------------------------------"
            LogLine " MinGW が見つからないため、手動インストールが必要です。"
            LogLine " 案内: https://osdn.net/projects/mingw/ (MinGW)"
            LogLine "    もしくは https://winlibs.com/ (MinGW-w64 最新ビルド)"
            LogLine " インストール後、g++.exe をPATHに追加してから再実行してください。"
            LogLine "----------------------------------------------------------------"
            WScript.Quit 1
        End If
    End If
    LogLine "g++ を検出: " & gppPath

    gdbPath = FindSiblingExe(gppPath, "gdb.exe")

    ' 2. DxLib(gcc版)zipの確保
    Dim dxlibZipPath
    dxlibZipPath = EnsureDxLibZip()
    If dxlibZipPath = "" Then
        LogLine "DxLib zipの取得に失敗しました。手動でダウンロードしてください:"
        LogLine "  " & DXLIB_DOWNLOAD_PAGE
        WScript.Quit 1
    End If

    ' 3. 展開
    Dim dxlibDir
    dxlibDir = projectDir & "\lib\DxLib"
    ExtractDxLibZip dxlibZipPath, dxlibDir, gppPath

    ' 4. .vscode 生成
    SetupVSCodeFiles dxlibDir, gppPath, gdbPath

    ' 5. 新規プロジェクトならサンプルmain.cpp生成
    EnsureSampleSource()

    ' 6. .gitignore の用意（build/とlib/は重いので無視推奨）
    EnsureGitignore()

    LogLine "=========================================="
    LogLine " セットアップ完了！"
    LogLine " VSCodeでこのフォルダを開き、"
    LogLine " Ctrl+Shift+B でビルドできます。"
    LogLine "=========================================="
End Sub

' ----------------------------------------------------------------------------
' MinGW(g++) 検出
' ----------------------------------------------------------------------------
Function FindGpp()
    Dim result
    result = ""

    ' PATH上から where コマンドで探す
    Dim whereOutput
    whereOutput = RunCommandCaptureOutput("where g++.exe")
    If whereOutput <> "" Then
        Dim lines, i
        lines = Split(whereOutput, vbCrLf)
        For i = 0 To UBound(lines)
            If Trim(lines(i)) <> "" And fso.FileExists(Trim(lines(i))) Then
                result = Trim(lines(i))
                Exit Function
            End If
        Next
    End If

    ' よくあるインストール先を直接確認
    Dim candidates, c
    candidates = Array( _
        "C:\MinGW\bin\g++.exe", _
        "C:\msys64\mingw64\bin\g++.exe", _
        "C:\msys64\mingw32\bin\g++.exe", _
        "C:\ProgramData\chocolatey\lib\mingw\tools\install\mingw64\bin\g++.exe", _
        "C:\ProgramData\mingw64\mingw64\bin\g++.exe", _
        "C:\Program Files\mingw-w64\bin\g++.exe" _
    )
    For Each c In candidates
        If fso.FileExists(c) Then
            FindGpp = c
            Exit Function
        End If
    Next

    FindGpp = result
End Function

Function FindSiblingExe(basedOnExePath, exeName)
    Dim dir
    dir = fso.GetParentFolderName(basedOnExePath)
    If fso.FileExists(dir & "\" & exeName) Then
        FindSiblingExe = dir & "\" & exeName
    Else
        FindSiblingExe = dir & "\" & exeName ' 無くてもパスだけ返す(launch.json用の推測値)
    End If
End Function

Function HasChocolatey()
    Dim out
    out = RunCommandCaptureOutput("where choco.exe")
    HasChocolatey = (Trim(out) <> "")
End Function

Sub InstallMingwViaChocolatey()
    LogLine "Chocolatey経由でMinGWをインストールします..."
    ' UAC昇格が必要なため、PowerShellのStart-Processで -Verb RunAsを使う
    Dim cmd
    cmd = "powershell -Command ""Start-Process choco -ArgumentList 'install mingw -y' -Verb RunAs -Wait"""
    shell.Run cmd, 1, True
    LogLine "インストールコマンドを実行しました。完了まで少し待ってから続行します。"
    WScript.Sleep 3000
End Sub

' ----------------------------------------------------------------------------
' DxLib zip の取得(キャッシュ優先 → なければダウンロード)
' ----------------------------------------------------------------------------
Function EnsureDxLibZip()
    Dim existing
    existing = FindCachedZip()
    If existing <> "" Then
        LogLine "キャッシュ済みのDxLib zipを使用します: " & existing
        EnsureDxLibZip = existing
        Exit Function
    End If

    LogLine "DxLibのダウンロードリンクを取得しています..."
    Dim pageHtml
    pageHtml = HttpGetText(DXLIB_DOWNLOAD_PAGE)
    If pageHtml = "" Then
        EnsureDxLibZip = ""
        Exit Function
    End If

    Dim zipUrl
    zipUrl = ExtractMinGwZipUrl(pageHtml)

    If zipUrl = "" Then
        LogLine "ダウンロードページからzipリンクを自動抽出できませんでした。"
        LogLine "お手数ですが、以下のページから「DXライブラリ Windows版 Gnu C++( MinGW )用」を"
        LogLine "手動でダウンロードし、次のフォルダに保存してから再実行してください:"
        LogLine "  " & cacheDir
        LogLine "ページ: " & DXLIB_DOWNLOAD_PAGE
        shell.Run "explorer.exe """ & DXLIB_DOWNLOAD_PAGE & """", 1, False
        shell.Run "explorer.exe """ & cacheDir & """", 1, False
        EnsureDxLibZip = ""
        Exit Function
    End If

    LogLine "ダウンロードURL: " & zipUrl
    Dim destZip
    destZip = cacheDir & "\dxlib_gcc_" & DateNowStamp() & ".zip"
    If HttpDownloadFile(zipUrl, destZip) Then
        EnsureDxLibZip = destZip
    Else
        EnsureDxLibZip = ""
    End If
End Function

Function FindCachedZip()
    Dim f, found
    found = ""
    If fso.FolderExists(cacheDir) Then
        Dim folder, files
        Set folder = fso.GetFolder(cacheDir)
        Set files = folder.Files
        Dim latestDate
        latestDate = 0
        For Each f In files
            If LCase(fso.GetExtensionName(f.Name)) = "zip" And InStr(LCase(f.Name), "dxlib") > 0 Then
                If CDbl(f.DateLastModified) > latestDate Then
                    latestDate = CDbl(f.DateLastModified)
                    found = f.Path
                End If
            End If
        Next
    End If
    FindCachedZip = found
End Function

' ダウンロードページのHTMLから「Gnu C++(MinGW)用」zipへのURLを抽出する。
' サイト構造の変化に備えて複数パターンを試す。
Function ExtractMinGwZipUrl(html)
    Dim url
    url = ""

    ' パターン1: <a href="...zip">の中に "Gnu" や "MinGW" を含む近傍テキストがあるものを探す
    Dim re, m
    Set re = New RegExp
    re.IgnoreCase = True
    re.Global = True
    re.Pattern = "<a[^>]+href=[""']([^""']+\.zip)[""'][^>]*>([^<]*)</a>"

    Dim regexResult
    Set regexResult = re.Execute(html)

    For Each m In regexResult
        Dim hrefVal, textVal
        hrefVal = m.SubMatches(0)
        textVal = m.SubMatches(1)
        If (InStr(LCase(textVal), "mingw") > 0 Or InStr(textVal, "Gnu") > 0 Or InStr(textVal, "ＧｎｕＣ") > 0) _
           And InStr(LCase(textVal), "android") = 0 And InStr(LCase(textVal), "ios") = 0 Then
            url = hrefVal
            Exit For
        End If
    Next

    ' パターン2: 単純にファイル名にGCCっぽい文字列を含むzipを探す
    If url = "" Then
        re.Pattern = "href=[""']([^""']*[Gg][Cc][Cc][^""']*\.zip)[""']"
        Set regexResult = re.Execute(html)
        If regexResult.Count > 0 Then
            url = regexResult(0).SubMatches(0)
        End If
    End If

    ' パターン3: onclick="location.href='...zip'" のようなJS埋め込み型を拾う
    If url = "" Then
        re.Pattern = "(?:href|location\.href|location)\s*=?\s*[""']([^""']+\.zip)[""']"
        Set regexResult = re.Execute(html)
        For Each m In regexResult
            If InStr(LCase(m.SubMatches(0)), "android") = 0 And InStr(LCase(m.SubMatches(0)), "ios") = 0 Then
                url = m.SubMatches(0)
                Exit For
            End If
        Next
    End If

    If url = "" Then
        ExtractMinGwZipUrl = ""
        Exit Function
    End If

    ' 相対URLなら絶対URLに変換
    If InStr(url, "http") <> 1 Then
        If Left(url, 1) = "/" Then
            url = "https://dxlib.xsrv.jp" & url
        Else
            url = DXLIB_BASE_URL & url
        End If
    End If

    ExtractMinGwZipUrl = url
End Function

' ----------------------------------------------------------------------------
' HTTP処理
' ----------------------------------------------------------------------------
Function HttpGetText(url)
    On Error Resume Next
    Dim req
    Set req = CreateObject("MSXML2.XMLHTTP")
    req.Open "GET", url, False
    req.SetRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dxlib-setup-script"
    req.Send
    If Err.Number <> 0 Then
        LogLine "HTTP取得エラー: " & Err.Description
        HttpGetText = ""
        On Error Goto 0
        Exit Function
    End If
    If req.Status = 200 Then
        HttpGetText = req.ResponseText
    Else
        LogLine "HTTPステータス異常: " & req.Status
        HttpGetText = ""
    End If
    On Error Goto 0
End Function

Function HttpDownloadFile(url, destPath)
    On Error Resume Next
    Dim req
    Set req = CreateObject("MSXML2.XMLHTTP")
    req.Open "GET", url, False
    req.SetRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dxlib-setup-script"
    req.Send
    If Err.Number <> 0 Then
        LogLine "ダウンロードエラー: " & Err.Description
        HttpDownloadFile = False
        On Error Goto 0
        Exit Function
    End If

    If req.Status <> 200 Then
        LogLine "ダウンロード失敗 (HTTP " & req.Status & ")"
        HttpDownloadFile = False
        On Error Goto 0
        Exit Function
    End If

    Dim stream
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1 ' adTypeBinary
    stream.Open
    stream.Write req.ResponseBody
    stream.SaveToFile destPath, 2 ' adSaveCreateOverWrite
    stream.Close

    If Err.Number <> 0 Then
        LogLine "保存エラー: " & Err.Description
        HttpDownloadFile = False
    Else
        LogLine "ダウンロード完了: " & destPath
        HttpDownloadFile = True
    End If
    On Error Goto 0
End Function

' ----------------------------------------------------------------------------
' zip展開 (Shell.Application の NameSpace().CopyHere を使用)
' ----------------------------------------------------------------------------
Sub ExtractDxLibZip(zipPath, destDir, gppPath)
    Dim tmpExtractDir
    tmpExtractDir = shell.ExpandEnvironmentStrings("%TEMP%") & "\dxlib_extract_" & DateNowStamp()
    EnsureFolder tmpExtractDir

    LogLine "zipを展開中: " & zipPath
    Dim shellApp, zipNs, destNs
    Set shellApp = CreateObject("Shell.Application")
    Set zipNs = shellApp.NameSpace(zipPath)
    Set destNs = shellApp.NameSpace(tmpExtractDir)
    destNs.CopyHere zipNs.Items, 1044 ' 4(進捗ダイアログ非表示)+16(確認なしで上書き)+1024(エラーダイアログ非表示)

    ' 展開完了待ち(CopyHereは非同期のため、項目数が安定するまでポーリングする)
    Dim waitCount, lastCount, stableCount, currentCount
    waitCount = 0
    lastCount = -1
    stableCount = 0
    Do
        WScript.Sleep 500
        currentCount = CountItemsRecursive(tmpExtractDir)
        If currentCount = lastCount And currentCount > 0 Then
            stableCount = stableCount + 1
        Else
            stableCount = 0
        End If
        lastCount = currentCount
        waitCount = waitCount + 1
        ' 同じ件数が3回連続(=1.5秒間変化なし)で完了と判断、最大60秒待機
    Loop While stableCount < 3 And waitCount < 120

    ' 「プロジェクトに追加すべきファイル_GCC(MinGW)用」フォルダを探索
    Dim gccFolder
    gccFolder = FindFolderRecursive(tmpExtractDir, "GCC")
    If gccFolder = "" Then
        gccFolder = FindFolderRecursive(tmpExtractDir, "MinGW")
    End If

    If gccFolder = "" Then
        LogLine "警告: zip内にGCC(MinGW)用フォルダが見つかりませんでした。手動確認してください: " & tmpExtractDir
        Exit Sub
    End If

    ' コンパイラバージョン別サブフォルダ(例: 8_2_0)を選ぶ。
    ' g++のバージョンに最も近いものを優先、無ければ最初に見つかったものを使う。
    Dim versionFolder
    versionFolder = PickBestVersionFolder(gccFolder, gppPath)

    If versionFolder = "" Then
        LogLine "警告: コンパイラバージョン別フォルダが見つかりませんでした: " & gccFolder
        Exit Sub
    End If

    LogLine "使用するDxLibビルド: " & versionFolder

    EnsureFolder destDir
    CopyFolderContents versionFolder, destDir

    ' 後始末
    On Error Resume Next
    fso.DeleteFolder tmpExtractDir, True
    On Error Goto 0

    LogLine "DxLibを配置しました: " & destDir
End Sub

Function CountItemsRecursive(rootDir)
    Dim folder, count, sf
    On Error Resume Next
    Set folder = fso.GetFolder(rootDir)
    count = folder.Files.Count
    For Each sf In folder.SubFolders
        count = count + CountItemsRecursive(sf.Path)
    Next
    On Error Goto 0
    CountItemsRecursive = count
End Function

Function FindFolderRecursive(rootDir, keyword)
    Dim result
    result = ""
    Dim folder, sub1, sub2
    Set folder = fso.GetFolder(rootDir)

    If InStr(folder.Name, keyword) > 0 Then
        FindFolderRecursive = folder.Path
        Exit Function
    End If

    For Each sub1 In folder.SubFolders
        If InStr(sub1.Name, keyword) > 0 Then
            FindFolderRecursive = sub1.Path
            Exit Function
        End If
        For Each sub2 In sub1.SubFolders
            If InStr(sub2.Name, keyword) > 0 Then
                FindFolderRecursive = sub2.Path
                Exit Function
            End If
        Next
    Next

    FindFolderRecursive = result
End Function

Function PickBestVersionFolder(gccFolder, gppPath)
    Dim folder, sf, best, bestScore, gppVersion, gppMajor
    Set folder = fso.GetFolder(gccFolder)
    best = ""
    bestScore = -1

    gppVersion = GetGppVersionString(gppPath) ' 例: "13.2.0"
    gppMajor = ""
    If gppVersion <> "" Then
        Dim verParts
        verParts = Split(gppVersion, ".")
        gppMajor = verParts(0)
    End If

    For Each sf In folder.SubFolders
        ' フォルダ名は "8_2_0" のような形式 (アンダースコア区切り)
        If best = "" Then best = sf.Path ' フォールバック(最初に見つけたもの)

        Dim folderMajor, nameParts
        nameParts = Split(sf.Name, "_")
        folderMajor = nameParts(0)

        If gppMajor <> "" And folderMajor = gppMajor Then
            ' メジャーバージョンが完全一致するものを優先採用
            best = sf.Path
            bestScore = 1
        End If
    Next

    PickBestVersionFolder = best
End Function

Function GetGppVersionString(gppPath)
    Dim out
    out = RunCommandCaptureOutput(""""& gppPath & """ -dumpversion")
    GetGppVersionString = Trim(out)
End Function

Sub CopyFolderContents(srcDir, destDir)
    EnsureFolder destDir
    Dim srcFolder, f, sf
    Set srcFolder = fso.GetFolder(srcDir)
    For Each f In srcFolder.Files
        fso.CopyFile f.Path, destDir & "\" & f.Name, True
    Next
    For Each sf In srcFolder.SubFolders
        CopyFolderContents sf.Path, destDir & "\" & sf.Name
    Next
End Sub

' ----------------------------------------------------------------------------
' .vscode生成
' ----------------------------------------------------------------------------
Sub SetupVSCodeFiles(dxlibDir, gppPath, gdbPath)
    Dim vscodeDir
    vscodeDir = projectDir & "\.vscode"

    If fso.FolderExists(vscodeDir) And Not forceOverwrite Then
        If Confirm(".vscode フォルダが既に存在します。バックアップを取って上書きしますか？") Then
            BackupFolder vscodeDir
        Else
            LogLine ".vscode の生成をスキップしました。"
            Exit Sub
        End If
    End If

    EnsureFolder vscodeDir

    ' テンプレートはこのスクリプトと同じ場所に templates\vscode\ として配置されている前提
    Dim templateDir
    templateDir = scriptDir & "\templates\vscode"

    WriteReplacedFile templateDir & "\tasks.windows.json", vscodeDir & "\tasks.json", _
        Array("__GPP_PATH__", "__DXLIB_DIR__"), Array(EscapeJsonPath(gppPath), EscapeJsonPath(dxlibDir))

    WriteReplacedFile templateDir & "\c_cpp_properties.windows.json", vscodeDir & "\c_cpp_properties.json", _
        Array("__GPP_PATH__", "__DXLIB_DIR__"), Array(EscapeJsonPath(gppPath), EscapeJsonPath(dxlibDir))

    WriteReplacedFile templateDir & "\launch.windows.json", vscodeDir & "\launch.json", _
        Array("__GDB_PATH__"), Array(EscapeJsonPath(gdbPath))

    LogLine ".vscode の設定ファイルを生成しました。"
End Sub

Function EscapeJsonPath(p)
    EscapeJsonPath = Replace(p, "\", "\\")
End Function

Sub WriteReplacedFile(templatePath, destPath, placeholders, values)
    If Not fso.FileExists(templatePath) Then
        LogLine "警告: テンプレートが見つかりません: " & templatePath
        Exit Sub
    End If

    Dim content
    content = ReadFileText(templatePath)

    Dim i
    For i = 0 To UBound(placeholders)
        content = Replace(content, placeholders(i), values(i))
    Next

    WriteFileText destPath, content
End Sub

' ----------------------------------------------------------------------------
' サンプルソース・.gitignore
' ----------------------------------------------------------------------------
Sub EnsureSampleSource()
    Dim srcDir
    srcDir = projectDir & "\src"

    If fso.FolderExists(srcDir) Then
        Dim hasExistingCpp
        hasExistingCpp = False
        Dim f
        For Each f In fso.GetFolder(srcDir).Files
            If LCase(fso.GetExtensionName(f.Name)) = "cpp" Then
                hasExistingCpp = True
                Exit For
            End If
        Next
        If hasExistingCpp Then
            LogLine "既存の .cpp ファイルが src\ にあるため、サンプル生成をスキップします。"
            Exit Sub
        End If
    End If

    EnsureFolder srcDir
    Dim templatePath
    templatePath = scriptDir & "\templates\main.cpp.template"
    If fso.FileExists(templatePath) Then
        fso.CopyFile templatePath, srcDir & "\main.cpp", False
        LogLine "サンプル src\main.cpp を生成しました。"
    End If
End Sub

Sub EnsureGitignore()
    Dim path
    path = projectDir & "\.gitignore"
    Dim lines
    lines = "build/" & vbCrLf & "lib/DxLib/" & vbCrLf & ".dxlib-setup.json" & vbCrLf

    If fso.FileExists(path) Then
        Dim existing
        existing = ReadFileText(path)
        If InStr(existing, "lib/DxLib") = 0 Then
            WriteFileText path, existing & vbCrLf & lines
        End If
    Else
        WriteFileText path, lines
    End If
End Sub

' ----------------------------------------------------------------------------
' 共通ユーティリティ
' ----------------------------------------------------------------------------
Sub EnsureFolder(path)
    Dim parts, current, i
    parts = Split(path, "\")
    current = parts(0)
    For i = 1 To UBound(parts)
        current = current & "\" & parts(i)
        If Not fso.FolderExists(current) Then
            fso.CreateFolder current
        End If
    Next
End Sub

Sub BackupFolder(path)
    Dim backupPath
    backupPath = path & ".bak_" & DateNowStamp()
    fso.CopyFolder path, backupPath
    LogLine "バックアップ作成: " & backupPath
End Sub

Function ReadFileText(path)
    Dim stream
    Set stream = fso.OpenTextFile(path, 1, False, -1) ' -1 = TristateUseDefault(Unicode判定)
    ReadFileText = stream.ReadAll
    stream.Close
End Function

Sub WriteFileText(path, content)
    Dim stream
    Set stream = fso.CreateTextFile(path, True, False)
    stream.Write content
    stream.Close
End Sub

Function RunCommandCaptureOutput(cmd)
    Dim execObj, output
    On Error Resume Next
    Set execObj = shell.Exec("%comspec% /c " & cmd)
    Do While execObj.Status = 0
        WScript.Sleep 100
    Loop
    output = execObj.StdOut.ReadAll()
    If Err.Number <> 0 Then
        output = ""
    End If
    On Error Goto 0
    RunCommandCaptureOutput = output
End Function

Function Confirm(message)
    Dim result
    result = MsgBox(message, vbYesNo + vbQuestion, "dxlib-setup")
    Confirm = (result = vbYes)
End Function

Sub LogLine(msg)
    WScript.Echo LOG_PREFIX & msg
End Sub

Function DateNowStamp()
    DateNowStamp = Year(Now) & Right("0" & Month(Now),2) & Right("0" & Day(Now),2) & "_" & _
                   Right("0" & Hour(Now),2) & Right("0" & Minute(Now),2) & Right("0" & Second(Now),2)
End Function

Function ArgsToString()
    Dim s, i
    s = ""
    For i = 0 To WScript.Arguments.Count - 1
        s = s & WScript.Arguments(i) & " "
    Next
    ArgsToString = s
End Function

' ----------------------------------------------------------------------------
Main()

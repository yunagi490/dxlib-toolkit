#!/usr/bin/env bash
#
# dxlib-setup.sh
# DxLib + VSCode 環境を Mac/Linux に一括構築するセットアップスクリプト
#
# 使い方:
#   ./dxlib-setup.sh                  # 対話式でモード選択
#   ./dxlib-setup.sh --mode=native    # dxlib-for-linux(dra版)を実機ビルド(Linux/X11必須、実行可能)
#   ./dxlib-setup.sh --mode=stub      # Windows版ヘッダのみ配置(構文チェック専用、実行不可)
#   ./dxlib-setup.sh --force          # .vscode等を確認なしで上書き
#
# キャッシュ:
#   ~/.dxlib-setup/cache/ にダウンロード・clone物を保存し、複数プロジェクトで再利用します。
#
set -u

# ----------------------------------------------------------------------------
# 設定値
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(pwd)"
CACHE_DIR="${HOME}/.dxlib-setup/cache"
DXLIB_DOWNLOAD_PAGE="https://dxlib.xsrv.jp/dxdload.html"
DXLIB_FOR_LINUX_REPO="https://github.com/dragoon2014/dxlib-for-linux.git"
LOG_PREFIX="[dxlib-setup]"

MODE=""
FORCE=0

for arg in "$@"; do
    case "$arg" in
        --mode=native) MODE="native" ;;
        --mode=stub) MODE="stub" ;;
        --force) FORCE=1 ;;
        --help|-h)
            grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "${LOG_PREFIX} 不明な引数: $arg (--help で使い方を確認してください)"
            ;;
    esac
done

log() {
    echo "${LOG_PREFIX} $*"
}

die() {
    log "エラー: $*"
    exit 1
}

confirm() {
    local prompt="$1"
    read -r -p "${LOG_PREFIX} ${prompt} [y/N]: " ans
    case "$ans" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

detect_os() {
    case "$(uname -s)" in
        Darwin) echo "macos" ;;
        Linux) echo "linux" ;;
        *) echo "unknown" ;;
    esac
}

detect_pkg_manager() {
    if command -v brew >/dev/null 2>&1; then
        echo "brew"
    elif command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    elif command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v pacman >/dev/null 2>&1; then
        echo "pacman"
    else
        echo "none"
    fi
}

OS_NAME="$(detect_os)"
PKG_MGR="$(detect_pkg_manager)"

# ----------------------------------------------------------------------------
# モード選択(未指定なら対話)
# ----------------------------------------------------------------------------
choose_mode() {
    if [ -n "$MODE" ]; then
        return
    fi

    if [ "$OS_NAME" = "macos" ]; then
        log "macOSではX11ベースのdxlib-for-linuxは動作しないため、stubモード(構文チェックのみ)を使用します。"
        MODE="stub"
        return
    fi

    echo ""
    echo "  どちらのモードでセットアップしますか？"
    echo "    1) native - dxlib-for-linux(dra版)を実機ビルド。実行可能だがX11/Linux環境が必要"
    echo "    2) stub   - Windows版DxLibヘッダのみ配置。構文チェック/IntelliSenseのみ、実行不可"
    echo ""
    read -r -p "  番号を選んでください [1/2]: " choice
    case "$choice" in
        1) MODE="native" ;;
        2) MODE="stub" ;;
        *) die "1か2を入力してください。" ;;
    esac
}

# ----------------------------------------------------------------------------
# native モード: dxlib-for-linux のビルド
# ----------------------------------------------------------------------------
NATIVE_DEPS_APT="git g++ unzip make wget libtiff-dev libopenal-dev libvorbis-dev libopusfile-dev libtheora-dev libpng-dev libegl-dev libgles-dev libx11-dev"
NATIVE_DEPS_DNF="git gcc-c++ unzip make wget libtiff-devel openal-soft-devel libvorbis-devel opusfile-devel libtheora-devel libpng-devel mesa-libEGL-devel mesa-libGLES-devel libX11-devel"
NATIVE_DEPS_PACMAN="git gcc unzip make wget libtiff openal libvorbis opusfile libtheora libpng libglvnd libx11"

ensure_native_deps() {
    log "dxlib-for-linux の依存パッケージを確認しています..."
    case "$PKG_MGR" in
        apt)
            if confirm "apt経由で依存パッケージをインストールしますか？ (sudoが必要です)"; then
                sudo apt-get update && sudo apt-get install -y $NATIVE_DEPS_APT
            else
                log "依存パッケージのインストールをスキップしました。ビルドが失敗する可能性があります。"
            fi
            ;;
        dnf)
            if confirm "dnf経由で依存パッケージをインストールしますか？ (sudoが必要です)"; then
                sudo dnf install -y $NATIVE_DEPS_DNF
            else
                log "依存パッケージのインストールをスキップしました。"
            fi
            ;;
        pacman)
            if confirm "pacman経由で依存パッケージをインストールしますか？ (sudoが必要です)"; then
                sudo pacman -Sy --noconfirm $NATIVE_DEPS_PACMAN
            else
                log "依存パッケージのインストールをスキップしました。"
            fi
            ;;
        *)
            log "対応するパッケージマネージャが見つかりませんでした。"
            log "git g++ unzip make wget と各種開発用ライブラリ(libtiff, openal, vorbis, opusfile, theora, png, EGL, GLES, X11)を手動でインストールしてください。"
            ;;
    esac
}

build_native_dxlib() {
    local dxlib_src_dir="${CACHE_DIR}/dxlib-for-linux"

    if [ -d "${dxlib_src_dir}/.git" ]; then
        log "既存のdxlib-for-linuxリポジトリを更新します: ${dxlib_src_dir}"
        (cd "$dxlib_src_dir" && git pull --ff-only) || log "更新に失敗しましたが、既存のものを使用します。"
    else
        log "dxlib-for-linux を clone します..."
        mkdir -p "$CACHE_DIR"
        git clone "$DXLIB_FOR_LINUX_REPO" "$dxlib_src_dir" || die "cloneに失敗しました。"
    fi

    log "ビルド中 (make patch && make -j$(nproc_safe))..."
    (
        cd "$dxlib_src_dir" || exit 1
        make patch || exit 1
        make -j"$(nproc_safe)" || exit 1
    ) || die "dxlib-for-linux のビルドに失敗しました。依存パッケージが揃っているか確認してください。"

    DXLIB_NATIVE_SRC_DIR="$dxlib_src_dir"
}

nproc_safe() {
    if command -v nproc >/dev/null 2>&1; then
        nproc
    elif command -v sysctl >/dev/null 2>&1; then
        sysctl -n hw.ncpu
    else
        echo 2
    fi
}

setup_native_project_lib() {
    local dest_dir="${PROJECT_DIR}/lib/DxLib"
    mkdir -p "${dest_dir}/include" "${dest_dir}/lib"

    # dxlib-for-linux のリポジトリ構成は include/ と 生成物(libDxLib.a等)を持つ想定。
    # 実際の出力先はビルド成果物を探索してコピーする。
    log "ヘッダとライブラリをプロジェクトにコピーしています..."

    if [ -d "${DXLIB_NATIVE_SRC_DIR}/include" ]; then
        cp -r "${DXLIB_NATIVE_SRC_DIR}/include/." "${dest_dir}/include/"
    else
        find "${DXLIB_NATIVE_SRC_DIR}" -maxdepth 3 -name "DxLib.h" -exec dirname {} \; | head -n1 | xargs -I{} cp -r {}/. "${dest_dir}/include/" 2>/dev/null
    fi

    find "${DXLIB_NATIVE_SRC_DIR}" -maxdepth 4 -name "*.a" -exec cp {} "${dest_dir}/lib/" \; 2>/dev/null
    find "${DXLIB_NATIVE_SRC_DIR}" -maxdepth 4 -name "*.so" -exec cp {} "${dest_dir}/lib/" \; 2>/dev/null

    if [ ! -f "${dest_dir}/include/DxLib.h" ]; then
        log "警告: DxLib.h の自動配置に失敗しました。手動で確認してください: ${DXLIB_NATIVE_SRC_DIR}"
    fi

    DXLIB_DIR="$dest_dir"
}

# ----------------------------------------------------------------------------
# stub モード: Windows版ヘッダのみ取得
# ----------------------------------------------------------------------------
find_cached_windows_zip() {
    find "$CACHE_DIR" -maxdepth 1 -iname "dxlib*.zip" -newer "$CACHE_DIR" 2>/dev/null | head -n1
    find "$CACHE_DIR" -maxdepth 1 -iname "dxlib*.zip" 2>/dev/null | sort | tail -n1
}

download_windows_zip() {
    mkdir -p "$CACHE_DIR"

    local cached
    cached="$(find "$CACHE_DIR" -maxdepth 1 -iname "dxlib*.zip" 2>/dev/null | sort | tail -n1)"
    if [ -n "$cached" ] && [ -f "$cached" ]; then
        log "キャッシュ済みのDxLib zipを使用します: $cached"
        echo "$cached"
        return 0
    fi

    log "DxLibのダウンロードページを取得しています..."
    local html
    html="$(curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) dxlib-setup-script" "$DXLIB_DOWNLOAD_PAGE" 2>/dev/null)"

    if [ -z "$html" ]; then
        log "ページの取得に失敗しました。"
        echo ""
        return 1
    fi

    local zip_url
    zip_url="$(echo "$html" | grep -oE 'href="[^"]+\.zip"' | grep -iE 'gcc|mingw' | grep -ivE 'android|ios' | head -n1 | sed -E 's/href="([^"]+)"/\1/')"

    if [ -z "$zip_url" ]; then
        log "ダウンロードページからzipリンクを自動抽出できませんでした。"
        log "以下のページから「DXライブラリ Windows版 Gnu C++( MinGW )用」を手動でダウンロードし、"
        log "次のフォルダに保存してから再実行してください: ${CACHE_DIR}"
        log "ページ: ${DXLIB_DOWNLOAD_PAGE}"
        if [ "$OS_NAME" = "macos" ]; then
            open "$DXLIB_DOWNLOAD_PAGE" 2>/dev/null
            open "$CACHE_DIR" 2>/dev/null
        elif command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$DXLIB_DOWNLOAD_PAGE" 2>/dev/null
            xdg-open "$CACHE_DIR" 2>/dev/null
        fi
        echo ""
        return 1
    fi

    case "$zip_url" in
        http*) : ;;
        /*) zip_url="https://dxlib.xsrv.jp${zip_url}" ;;
        *) zip_url="https://dxlib.xsrv.jp/${zip_url}" ;;
    esac

    local dest="${CACHE_DIR}/dxlib_gcc_$(date +%Y%m%d_%H%M%S).zip"
    log "ダウンロード中: $zip_url"
    if curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) dxlib-setup-script" -o "$dest" "$zip_url"; then
        log "ダウンロード完了: $dest"
        echo "$dest"
        return 0
    else
        log "ダウンロードに失敗しました。"
        echo ""
        return 1
    fi
}

setup_stub_project_lib() {
    local zip_path
    zip_path="$(download_windows_zip)"

    if [ -z "$zip_path" ] || [ ! -f "$zip_path" ]; then
        die "DxLib zipの取得に失敗しました。"
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    log "zipを展開中..."
    unzip -q -o "$zip_path" -d "$tmp_dir" || die "unzipに失敗しました。"

    local gcc_folder
    gcc_folder="$(find "$tmp_dir" -type d -iname "*GCC*" | head -n1)"
    if [ -z "$gcc_folder" ]; then
        gcc_folder="$(find "$tmp_dir" -type d -iname "*MinGW*" | head -n1)"
    fi

    if [ -z "$gcc_folder" ]; then
        die "zip内にGCC(MinGW)用フォルダが見つかりませんでした。手動確認してください: ${tmp_dir}"
    fi

    # コンパイラバージョン別サブフォルダの中から最初に見つかったものを使う
    local version_folder
    version_folder="$(find "$gcc_folder" -maxdepth 1 -type d ! -path "$gcc_folder" | sort | head -n1)"

    if [ -z "$version_folder" ]; then
        version_folder="$gcc_folder"
    fi

    log "使用するDxLibヘッダ: $version_folder"

    local dest_dir="${PROJECT_DIR}/lib/DxLib"
    mkdir -p "$dest_dir"
    cp -r "${version_folder}/." "${dest_dir}/"

    rm -rf "$tmp_dir"

    DXLIB_DIR="$dest_dir"
}

# ----------------------------------------------------------------------------
# コンパイラ検出
# ----------------------------------------------------------------------------
find_gpp() {
    command -v g++ 2>/dev/null
}

find_debugger() {
    if command -v lldb >/dev/null 2>&1; then
        echo "lldb"
    elif command -v gdb >/dev/null 2>&1; then
        echo "gdb"
    else
        echo ""
    fi
}

ensure_gpp() {
    local gpp
    gpp="$(find_gpp)"
    if [ -n "$gpp" ]; then
        echo "$gpp"
        return 0
    fi

    log "g++ が見つかりませんでした。"
    case "$PKG_MGR" in
        brew)
            if confirm "Homebrew経由でgccをインストールしますか？"; then
                brew install gcc
                gpp="$(find_gpp)"
            fi
            ;;
        apt)
            if confirm "apt経由でg++をインストールしますか？ (sudoが必要です)"; then
                sudo apt-get update && sudo apt-get install -y g++
                gpp="$(find_gpp)"
            fi
            ;;
        dnf)
            if confirm "dnf経由でg++をインストールしますか？ (sudoが必要です)"; then
                sudo dnf install -y gcc-c++
                gpp="$(find_gpp)"
            fi
            ;;
        pacman)
            if confirm "pacman経由でgccをインストールしますか？ (sudoが必要です)"; then
                sudo pacman -Sy --noconfirm gcc
                gpp="$(find_gpp)"
            fi
            ;;
    esac

    if [ -z "$gpp" ]; then
        die "g++ の導入ができませんでした。手動でインストールしてから再実行してください。"
    fi

    echo "$gpp"
}

# ----------------------------------------------------------------------------
# .vscode 生成
# ----------------------------------------------------------------------------
backup_if_exists() {
    local path="$1"
    if [ -e "$path" ]; then
        if [ "$FORCE" -eq 1 ]; then
            mv "$path" "${path}.bak_$(date +%Y%m%d_%H%M%S)"
            return 0
        fi
        if confirm "$(basename "$path") が既に存在します。バックアップを取って上書きしますか？"; then
            mv "$path" "${path}.bak_$(date +%Y%m%d_%H%M%S)"
            return 0
        else
            return 1
        fi
    fi
    return 0
}

render_template() {
    # render_template <template_path> <dest_path> <key1> <val1> [<key2> <val2> ...]
    local template="$1"; shift
    local dest="$1"; shift

    if [ ! -f "$template" ]; then
        log "警告: テンプレートが見つかりません: $template"
        return 1
    fi

    local content
    content="$(cat "$template")"

    while [ "$#" -ge 2 ]; do
        local key="$1" val="$2"
        # sedの区切り文字に / を使うとパスと衝突するため | を使用し、| 自体はエスケープ
        val="$(printf '%s' "$val" | sed 's/[\&|]/\\&/g')"
        content="$(printf '%s' "$content" | sed "s|${key}|${val}|g")"
        shift 2
    done

    printf '%s\n' "$content" > "$dest"
}

setup_vscode_files() {
    local vscode_dir="${PROJECT_DIR}/.vscode"
    local template_dir="${SCRIPT_DIR}/templates/vscode"

    mkdir -p "$vscode_dir" || true
    if ! backup_if_exists "$vscode_dir"; then
        log ".vscode の生成をスキップしました。"
        return
    fi
    mkdir -p "$vscode_dir"

    local gpp="$1"
    local debugger="$2"

    local intellisense_mode="linux-gcc-x64"
    if [ "$OS_NAME" = "macos" ]; then
        if [ "$(uname -m)" = "arm64" ]; then
            intellisense_mode="macos-clang-arm64"
        else
            intellisense_mode="macos-clang-x64"
        fi
    fi

    if [ "$MODE" = "native" ]; then
        render_template "${template_dir}/tasks.unix.native.json" "${vscode_dir}/tasks.json" \
            "__GPP_PATH__" "$gpp" "__DXLIB_DIR__" "$DXLIB_DIR"
        render_template "${template_dir}/c_cpp_properties.unix.native.json" "${vscode_dir}/c_cpp_properties.json" \
            "__GPP_PATH__" "$gpp" "__DXLIB_DIR__" "$DXLIB_DIR"

        if [ -n "$debugger" ]; then
            local mi_mode="$debugger"
            local debugger_label="$debugger"
            local debugger_path
            debugger_path="$(command -v "$debugger")"
            render_template "${template_dir}/launch.unix.native.json" "${vscode_dir}/launch.json" \
                "__MI_MODE__" "$mi_mode" "__DEBUGGER_LABEL__" "$debugger_label" "__DEBUGGER_PATH__" "$debugger_path"
        else
            log "デバッガ(lldb/gdb)が見つからないため launch.json の生成をスキップしました。"
        fi
    else
        render_template "${template_dir}/tasks.unix.stub.json" "${vscode_dir}/tasks.json" \
            "__GPP_PATH__" "$gpp" "__DXLIB_DIR__" "$DXLIB_DIR"
        render_template "${template_dir}/c_cpp_properties.unix.stub.json" "${vscode_dir}/c_cpp_properties.json" \
            "__GPP_PATH__" "$gpp" "__DXLIB_DIR__" "$DXLIB_DIR" "__INTELLISENSE_MODE__" "$intellisense_mode"
        log "stubモードのため launch.json(実行用)は生成しません。実機実行はWindows環境かnativeモードをご利用ください。"
    fi

    log ".vscode の設定ファイルを生成しました。"
}

# ----------------------------------------------------------------------------
# サンプルソース・.gitignore
# ----------------------------------------------------------------------------
ensure_sample_source() {
    local src_dir="${PROJECT_DIR}/src"

    if [ -d "$src_dir" ] && find "$src_dir" -maxdepth 1 -iname "*.cpp" | grep -q .; then
        log "既存の .cpp ファイルが src/ にあるため、サンプル生成をスキップします。"
        return
    fi

    mkdir -p "$src_dir"
    local template="${SCRIPT_DIR}/templates/main.cpp.template"
    if [ -f "$template" ]; then
        cp "$template" "${src_dir}/main.cpp"
        log "サンプル src/main.cpp を生成しました。"
    fi
}

ensure_gitignore() {
    local path="${PROJECT_DIR}/.gitignore"
    local lines="build/
lib/DxLib/
.dxlib-setup.json"

    if [ -f "$path" ]; then
        if ! grep -q "lib/DxLib" "$path" 2>/dev/null; then
            printf '\n%s\n' "$lines" >> "$path"
        fi
    else
        printf '%s\n' "$lines" > "$path"
    fi
}

# ----------------------------------------------------------------------------
# メイン処理
# ----------------------------------------------------------------------------
main() {
    log "=========================================="
    log " DxLib セットアップ開始 (OS: ${OS_NAME})"
    log "=========================================="
    log "プロジェクトフォルダ: ${PROJECT_DIR}"

    mkdir -p "$CACHE_DIR"

    choose_mode
    log "選択モード: ${MODE}"

    local gpp
    gpp="$(ensure_gpp)"
    log "g++ を検出: ${gpp}"

    local debugger
    debugger="$(find_debugger)"

    DXLIB_DIR=""
    if [ "$MODE" = "native" ]; then
        ensure_native_deps
        build_native_dxlib
        setup_native_project_lib
    else
        setup_stub_project_lib
    fi

    setup_vscode_files "$gpp" "$debugger"
    ensure_sample_source
    ensure_gitignore

    log "=========================================="
    log " セットアップ完了！"
    log " VSCodeでこのフォルダを開き、"
    log " Cmd/Ctrl+Shift+B でビルドできます。"
    if [ "$MODE" = "stub" ]; then
        log " (stubモードのため実行はできません。構文チェックのみ可能です)"
    fi
    log "=========================================="
}

main

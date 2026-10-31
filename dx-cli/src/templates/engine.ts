// dx-cli が `dx create` 時に生成するエンジン部分のテンプレート文字列群。

export function isSceneHeader(): string {
  return `#pragma once

// シーンが実装すべき共通インターフェース。
// dx add scene <Name> で生成される派生クラスはこれを継承します。
class IScene
{
public:
    virtual ~IScene() = default;

    // シーン開始時に1度だけ呼ばれる
    virtual void Init() = 0;

    // 毎フレーム呼ばれる更新処理。経過時間(秒)を受け取る。
    virtual void Update(double deltaTime) = 0;

    // 毎フレーム呼ばれる描画処理
    virtual void Draw() = 0;

    // シーン終了時に1度だけ呼ばれる(リソース解放等)
    virtual void End() = 0;
};
`;
}

export function sceneManagerHeader(): string {
  return `#pragma once

#include <memory>
#include "IScene.h"

// シーンの切り替え・更新・描画を一元管理するマネージャ。
// SceneManager::Get().ChangeScene(std::make_unique<TitleScene>()); のように使う。
class SceneManager
{
public:
    static SceneManager& Get();

    void ChangeScene(std::unique_ptr<IScene> nextScene);
    void Update(double deltaTime);
    void Draw();

    bool HasScene() const { return currentScene_ != nullptr; }

private:
    SceneManager() = default;
    std::unique_ptr<IScene> currentScene_;
    std::unique_ptr<IScene> pendingScene_;
};
`;
}

export function sceneManagerSource(): string {
  return `#include "SceneManager.h"

SceneManager& SceneManager::Get()
{
    static SceneManager instance;
    return instance;
}

void SceneManager::ChangeScene(std::unique_ptr<IScene> nextScene)
{
    // 描画/更新中の差し替えを安全に行うため、次フレーム冒頭まで保留する
    pendingScene_ = std::move(nextScene);
}

void SceneManager::Update(double deltaTime)
{
    if (pendingScene_)
    {
        if (currentScene_)
        {
            currentScene_->End();
        }
        currentScene_ = std::move(pendingScene_);
        currentScene_->Init();
    }

    if (currentScene_)
    {
        currentScene_->Update(deltaTime);
    }
}

void SceneManager::Draw()
{
    if (currentScene_)
    {
        currentScene_->Draw();
    }
}
`;
}

export function titleSceneHeader(): string {
  return `#pragma once

#include "engine/IScene.h"

// dx create で生成される最初のシーン。
class TitleScene : public IScene
{
public:
    void Init() override;
    void Update(double deltaTime) override;
    void Draw() override;
    void End() override;

private:
    double elapsed_ = 0.0;
};
`;
}

export function titleSceneSource(): string {
  return `#include "TitleScene.h"
#include "DxLib.h"

void TitleScene::Init()
{
    elapsed_ = 0.0;
}

void TitleScene::Update(double deltaTime)
{
    elapsed_ += deltaTime;
}

void TitleScene::Draw()
{
    DrawBox(270, 190, 370, 290, GetColor(255, 255, 255), TRUE);
    DrawFormatString(10, 10, GetColor(255, 255, 255), "TitleScene (elapsed: %.1fs) - ESCで終了", elapsed_);
}

void TitleScene::End()
{
}
`;
}

export function mainCpp(script = false): string {
  const sceneInclude = script ? '#include "engine/ScriptScene.h"' : '#include "scenes/TitleScene.h"';
  const firstScene = script
    ? 'std::make_unique<ScriptScene>("scripts/title.js")'
    : "std::make_unique<TitleScene>()";
  return `// dx-cli によって生成されたエントリポイント。
// シーンの追加は "dx add scene <Name>" を使ってください。

#include "DxLib.h"
#include "engine/SceneManager.h"
${sceneInclude}
#include <memory>
#include <chrono>

#if defined(_WIN32)
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow)
#else
int main()
#endif
{
#if defined(_WIN32)
    // ソースはUTF-8(-fexec-charset=UTF-8)でコンパイルされるため、DxLibの文字コードもUTF-8にする。
    // 未指定だとShift-JIS扱いになり、日本語が文字化けする。DxLib_Init より前に呼ぶ必要がある。
    SetUseCharCodeFormat(DX_CHARCODEFORMAT_UTF8);
#endif
    ChangeWindowMode(TRUE);
    SetGraphMode(640, 480, 32);

    if (DxLib_Init() == -1)
    {
        return -1;
    }

    SetDrawScreen(DX_SCREEN_BACK);

    SceneManager::Get().ChangeScene(${firstScene});

    auto lastTime = std::chrono::steady_clock::now();

    while (ProcessMessage() == 0)
    {
        const auto now = std::chrono::steady_clock::now();
        const double deltaTime = std::chrono::duration<double>(now - lastTime).count();
        lastTime = now;

        ClearDrawScreen();

        SceneManager::Get().Update(deltaTime);
        SceneManager::Get().Draw();

        ScreenFlip();

        if (CheckHitKey(KEY_INPUT_ESCAPE) == 1)
        {
            break;
        }
    }

    DxLib_End();
    return 0;
}
`;
}
// ----------------------------------------------------------------------------
// スクリプト層(dx create --script)。QuickJSでJavaScriptのシーンを動かす。
// ----------------------------------------------------------------------------

export function scriptSceneHeader(): string {
  return `#pragma once

#include <string>
#include "IScene.h"

struct JSRuntime;
struct JSContext;

// JavaScriptファイルでシーンを書くためのシーン。スクリプト側のグローバル関数
//   init() / update(dt) / draw()
// を(定義されていれば)呼び出す。スクリプトから使えるAPIは ScriptScene.cpp を参照。
class ScriptScene : public IScene
{
public:
    explicit ScriptScene(std::string scriptPath);
    ~ScriptScene() override;

    void Init() override;
    void Update(double deltaTime) override;
    void Draw() override;
    void End() override;

private:
    // 未定義のグローバル関数は何もせず成功扱い。例外が起きたら lastError_ に記録して false を返す。
    bool CallGlobal(const char* name, bool withDelta, double delta);
    void RecordException();
    void Shutdown();

    std::string scriptPath_;
    std::string lastError_;
    JSRuntime* rt_ = nullptr;
    JSContext* ctx_ = nullptr;
};
`;
}

export function scriptSceneSource(): string {
  return `#include "ScriptScene.h"
#include "DxLib.h"
#include "../../lib/quickjs/quickjs.h"
#include <fstream>
#include <sstream>
#include <utility>

namespace
{
    // 省略可能なRGB引数(argv[start..start+2])を読む。無ければ白。
    unsigned int ReadColor(JSContext* ctx, int argc, JSValueConst* argv, int start)
    {
        int32_t r = 255, g = 255, b = 255;
        if (argc >= start + 3)
        {
            JS_ToInt32(ctx, &r, argv[start]);
            JS_ToInt32(ctx, &g, argv[start + 1]);
            JS_ToInt32(ctx, &b, argv[start + 2]);
        }
        return GetColor(r, g, b);
    }

    // drawText(x, y, text [, r, g, b])
    JSValue JsDrawText(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv)
    {
        if (argc < 3) return JS_UNDEFINED;
        int32_t x = 0, y = 0;
        JS_ToInt32(ctx, &x, argv[0]);
        JS_ToInt32(ctx, &y, argv[1]);
        const char* text = JS_ToCString(ctx, argv[2]);
        if (text)
        {
            DrawString(x, y, text, ReadColor(ctx, argc, argv, 3));
            JS_FreeCString(ctx, text);
        }
        return JS_UNDEFINED;
    }

    // drawBox(x1, y1, x2, y2 [, r, g, b])  塗りつぶしの四角形
    JSValue JsDrawBox(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv)
    {
        if (argc < 4) return JS_UNDEFINED;
        int32_t v[4] = { 0, 0, 0, 0 };
        for (int i = 0; i < 4; ++i) JS_ToInt32(ctx, &v[i], argv[i]);
        DrawBox(v[0], v[1], v[2], v[3], ReadColor(ctx, argc, argv, 4), TRUE);
        return JS_UNDEFINED;
    }

    // isKeyDown(keyCode)  DxLibのKEY_INPUT_*の値を渡す。例: isKeyDown(1) はESC
    JSValue JsIsKeyDown(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv)
    {
        int32_t key = 0;
        if (argc >= 1) JS_ToInt32(ctx, &key, argv[0]);
        return JS_NewBool(ctx, CheckHitKey(key) == 1);
    }

    void Register(JSContext* ctx, const char* name, JSCFunction* fn, int length)
    {
        JSValue global = JS_GetGlobalObject(ctx);
        JS_SetPropertyStr(ctx, global, name, JS_NewCFunction(ctx, fn, name, length));
        JS_FreeValue(ctx, global);
    }
}

ScriptScene::ScriptScene(std::string scriptPath)
    : scriptPath_(std::move(scriptPath))
{
}

ScriptScene::~ScriptScene()
{
    Shutdown();
}

void ScriptScene::Init()
{
    lastError_.clear();

    std::ifstream file(scriptPath_, std::ios::binary);
    if (!file)
    {
        lastError_ = "script not found: " + scriptPath_;
        return;
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    const std::string source = buffer.str();

    rt_ = JS_NewRuntime();
    ctx_ = JS_NewContext(rt_);

    Register(ctx_, "drawText", JsDrawText, 3);
    Register(ctx_, "drawBox", JsDrawBox, 4);
    Register(ctx_, "isKeyDown", JsIsKeyDown, 1);

    JSValue result = JS_Eval(ctx_, source.c_str(), source.size(), scriptPath_.c_str(), JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(result))
    {
        RecordException();
        return;
    }
    JS_FreeValue(ctx_, result);

    CallGlobal("init", false, 0.0);
}

void ScriptScene::Update(double deltaTime)
{
    if (!ctx_ || !lastError_.empty()) return;
    CallGlobal("update", true, deltaTime);
}

void ScriptScene::Draw()
{
    if (ctx_ && lastError_.empty())
    {
        CallGlobal("draw", false, 0.0);
    }
    // スクリプトのエラーは(ウィンドウアプリなのでコンソールが無いため)画面に表示する
    if (!lastError_.empty())
    {
        DrawString(10, 10, lastError_.c_str(), GetColor(255, 80, 80));
    }
}

void ScriptScene::End()
{
    Shutdown();
}

bool ScriptScene::CallGlobal(const char* name, bool withDelta, double delta)
{
    JSValue global = JS_GetGlobalObject(ctx_);
    JSValue func = JS_GetPropertyStr(ctx_, global, name);
    JS_FreeValue(ctx_, global);

    if (!JS_IsFunction(ctx_, func))
    {
        JS_FreeValue(ctx_, func);
        return true;
    }

    JSValue arg = JS_NewFloat64(ctx_, delta);
    JSValue result = withDelta ? JS_Call(ctx_, func, JS_UNDEFINED, 1, &arg) : JS_Call(ctx_, func, JS_UNDEFINED, 0, nullptr);
    JS_FreeValue(ctx_, arg);
    JS_FreeValue(ctx_, func);

    if (JS_IsException(result))
    {
        RecordException();
        return false;
    }
    JS_FreeValue(ctx_, result);
    return true;
}

void ScriptScene::RecordException()
{
    JSValue exception = JS_GetException(ctx_);
    const char* message = JS_ToCString(ctx_, exception);
    lastError_ = message ? message : "script error";
    if (message) JS_FreeCString(ctx_, message);
    JS_FreeValue(ctx_, exception);
}

void ScriptScene::Shutdown()
{
    if (ctx_)
    {
        JS_FreeContext(ctx_);
        ctx_ = nullptr;
    }
    if (rt_)
    {
        JS_FreeRuntime(rt_);
        rt_ = nullptr;
    }
}
`;
}

export function titleScript(): string {
  return `// dx-cli が生成したスクリプトシーン。保存したら \`dx run\` し直すと反映されます。
// 使えるAPI:
//   drawText(x, y, text [, r, g, b])     文字を描く
//   drawBox(x1, y1, x2, y2 [, r, g, b])  塗りつぶしの四角形を描く
//   isKeyDown(keyCode)                    キーが押されているか(DxLibのKEY_INPUT_*の値)
// 関数 init() / update(dt) / draw() は、定義されていれば呼ばれます(dt は秒)。

let elapsed = 0;

function update(dt) {
  elapsed += dt;
}

function draw() {
  drawBox(270, 190, 370, 290, 255, 255, 255);
  drawText(10, 10, "TitleScene (script) elapsed: " + elapsed.toFixed(1) + "s - ESCで終了");
}
`;
}
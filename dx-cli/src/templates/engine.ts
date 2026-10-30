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

export function mainCpp(): string {
  return `// dx-cli によって生成されたエントリポイント。
// シーンの追加は "dx add scene <Name>" を使ってください。

#include "DxLib.h"
#include "engine/SceneManager.h"
#include "scenes/TitleScene.h"
#include <memory>
#include <chrono>

#if defined(_WIN32)
    // ソースはUTF-8(-fexec-charset=UTF-8)でコンパイルされるため、DxLibの文字コードもUTF-8にする。
    // 未指定だとShift-JIS扱いになり、日本語が文字化けする。DxLib_Init より前に呼ぶ必要がある。
    #if defined(_WIN32)
    SetUseCharCodeFormat(DX_CHARCODEFORMAT_UTF8);
    #endif
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow)
#else
int main()
#endif
{
    ChangeWindowMode(TRUE);
    SetGraphMode(640, 480, 32);

    if (DxLib_Init() == -1)
    {
        return -1;
    }

    SetDrawScreen(DX_SCREEN_BACK);

    SceneManager::Get().ChangeScene(std::make_unique<TitleScene>());

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

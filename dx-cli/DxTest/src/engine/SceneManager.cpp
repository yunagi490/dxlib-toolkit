#include "SceneManager.h"

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

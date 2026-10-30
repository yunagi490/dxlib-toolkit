#pragma once

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

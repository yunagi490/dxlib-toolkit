#pragma once

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

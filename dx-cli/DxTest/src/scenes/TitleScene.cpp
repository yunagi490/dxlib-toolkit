#include "TitleScene.h"
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

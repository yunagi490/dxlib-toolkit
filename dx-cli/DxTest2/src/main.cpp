// dx-cli によって生成されたエントリポイント。
// シーンの追加は "dx add scene <Name>" を使ってください。

#include "DxLib.h"
#include "engine/SceneManager.h"
#include "scenes/TitleScene.h"
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

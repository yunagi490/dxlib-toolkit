#pragma once

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

// dx test のサンプルテストです。
// tests/ 以下に *.cpp を追加すると、dx test が自動でビルド&実行します。
// 各ファイルは独立した実行ファイルとしてビルドされ、exit code 0 なら成功、
// 0以外なら失敗として扱われます(DxLib本体へのリンクは行われません)。

#include "dx_test.h"

int main()
{
    int a = 1 + 1;
    DX_CHECK(a == 2, "1 + 1 should equal 2");

    DX_PASS();
}

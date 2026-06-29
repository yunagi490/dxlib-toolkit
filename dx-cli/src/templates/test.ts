export function dxTestHeader(): string {
  return `#pragma once

// dx test 用の最小アサートマクロ。
// 外部フレームワーク(doctest/Catch2等)を使わず、
// 「失敗したらメッセージを出してexit(1)、最後まで通ればexit(0)」という
// 単純なexit codeベースの判定にしています。
//
// 使い方:
//   DX_CHECK(a == b, "a should equal b");
//   1ファイル = 1テスト実行ファイルとしてビルドされ、dx test が全件まとめて実行します。

#include <cstdio>
#include <cstdlib>

#define DX_CHECK(cond, message)                                                 \\
    do                                                                          \\
    {                                                                           \\
        if (!(cond))                                                            \\
        {                                                                       \\
            std::fprintf(stderr, "[FAIL] %s:%d  %s\\n", __FILE__, __LINE__, message); \\
            std::exit(1);                                                       \\
        }                                                                       \\
    } while (0)

#define DX_PASS()                                                               \\
    do                                                                          \\
    {                                                                           \\
        std::printf("[PASS] %s\\n", __FILE__);                                  \\
        std::exit(0);                                                           \\
    } while (0)
`;
}

export function exampleTestSource(): string {
  return `// dx test のサンプルテストです。
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
`;
}

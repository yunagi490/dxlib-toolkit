#pragma once

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

#define DX_CHECK(cond, message)                                                 \
    do                                                                          \
    {                                                                           \
        if (!(cond))                                                            \
        {                                                                       \
            std::fprintf(stderr, "[FAIL] %s:%d  %s\n", __FILE__, __LINE__, message); \
            std::exit(1);                                                       \
        }                                                                       \
    } while (0)

#define DX_PASS()                                                               \
    do                                                                          \
    {                                                                           \
        std::printf("[PASS] %s\n", __FILE__);                                  \
        std::exit(0);                                                           \
    } while (0)

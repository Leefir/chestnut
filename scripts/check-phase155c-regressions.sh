#!/usr/bin/env bash
# phase155C 回归门禁（pre-commit 或 CI）

set -e

# 禁：if (!deps) throw 类冗余检查
if grep -rnE "if\s*\(\s*!\s*(deps|this\.options\.dependencies)\s*\)" src/core/runtime.ts src/core/motion/runtime.ts; then
  echo "❌ 禁止 deps 冗余运行时检查（TS 已保证必传）"
  exit 1
fi

# 禁：as NodeFileSystem 下行强转
if grep -rnE "as NodeFileSystem|as unknown as NodeFileSystem" src/core/runtime.ts src/core/motion/runtime.ts src/assembly/assemble.ts; then
  echo "❌ 禁止 as NodeFileSystem cast；若需 NodeFileSystem 特有方法请用 instanceof guard 或把方法提升到 FileSystem 接口"
  exit 1
fi

echo "✅ phase155C 回归门禁通过"

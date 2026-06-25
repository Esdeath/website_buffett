#!/usr/bin/env python3
# 把多个(字符集互不相交的)字体子集合并为一个 TTF。
# 用法: python3 merge-fonts.py <out.ttf> <in0.ttf> <in1.ttf> ...
# 供 build-og-font.mjs 调用:Google 动态子集接口有 URL 长度上限,需分批取回,
# 再在此合并成单一字体,OG 渲染时 canvaskit 无需跨字体回退。
import sys
from fontTools.merge import Merger

out = sys.argv[1]
inputs = sys.argv[2:]
if not inputs:
    print("merge-fonts: 缺少输入字体", file=sys.stderr)
    sys.exit(1)

font = Merger().merge(inputs) if len(inputs) > 1 else __import__("fontTools.ttLib", fromlist=["TTFont"]).TTFont(inputs[0])
font.save(out)
print(f"merge-fonts: 合并 {len(inputs)} 个子集 -> {out}")

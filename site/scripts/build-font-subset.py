#!/usr/bin/env python3
"""按本站实际用字，把 LXGW 文楷 TC 子集化成自托管 woff2。

移植自 website_duan/scripts/build-font-subset.py：三站正文统一用文楷，
@font-face 声明在共享的 src/styles/ink.css，指向 /fonts/lxgw-wenkai-tc-subset.woff2。
在 site/ 目录下运行。

背景：原先正文阅读字体走 Google Fonts，<head> 里那个 <link rel="stylesheet">
是阻塞渲染的第三方请求（实测 138KB / 2.7s），而且 fonts.googleapis.com 在大陆
不稳定，首屏可能一直等到样式表超时。改成自托管子集后，首屏不再依赖第三方。

用法（uv 会临时装好依赖，不污染系统 Python）：

    uv run --with fonttools --with brotli scripts/build-font-subset.py   # 在 site/ 下运行

原始字体不在仓库里，脚本会按需下载到 .fontsrc/（已 gitignore）。
新增文章若引入了当前子集之外的生僻字，重跑本脚本即可。
"""

from __future__ import annotations

import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FONT_VERSION = "v1.522"
FONT_FILE = "LXGWWenKaiTC-Regular.ttf"
FONT_URL = (
    f"https://github.com/lxgw/LxgwWenkaiTC/releases/download/{FONT_VERSION}/{FONT_FILE}"
)
SRC_DIR = ROOT / ".fontsrc"
OUT = ROOT / "public" / "fonts" / "lxgw-wenkai-tc-subset.woff2"

# 扫描这些位置里出现的字符：正文（仓库根的 buffett/）+ 界面文案（src/ 里的组件、页面、SEO 文案）
SCAN_DIRS = [
    (ROOT.parent / "buffett", {".md"}),
    (ROOT / "src", {".astro", ".ts", ".mjs", ".css", ".md"}),
]
SCAN_FILES = [ROOT / "astro.config.mjs"]

# 内容里不一定出现、但排版随时会用到的基础字符
BASELINE = (
    set(chr(c) for c in range(0x20, 0x7F))          # ASCII 可打印
    | set(chr(c) for c in range(0x2010, 0x205F))    # 破折号、引号、省略号等通用标点
    | set(chr(c) for c in range(0x3000, 0x3040))    # CJK 标点、、。〈〉《》「」『』
    | set(chr(c) for c in range(0xFF01, 0xFF61))    # 全角形式
    | set("　°±×÷≈≠≤≥→←↑↓※○●◆■□△▲·—…“”‘’￥€$%‰№")
)


def collect_chars() -> set[str]:
    chars: set[str] = set(BASELINE)
    files: list[Path] = list(SCAN_FILES)

    for directory, suffixes in SCAN_DIRS:
        if not directory.exists():
            continue
        files.extend(p for p in directory.rglob("*") if p.suffix in suffixes)

    for path in files:
        try:
            chars |= set(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, OSError) as exc:
            print(f"  跳过 {path.relative_to(ROOT)}: {exc}", file=sys.stderr)

    # 控制字符对字体没意义
    return {c for c in chars if c.isprintable() or c == "　"}


def ensure_source() -> Path:
    src = SRC_DIR / FONT_FILE
    if src.exists():
        print(f"复用已下载的原始字体 {src.relative_to(ROOT)}")
        return src

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    print(f"下载 {FONT_URL}")
    urllib.request.urlretrieve(FONT_URL, src)
    print(f"  → {src.stat().st_size:,} B")
    return src


def main() -> int:
    src = ensure_source()
    chars = collect_chars()
    cjk = {c for c in chars if "一" <= c <= "鿿"}
    print(f"扫描到 {len(chars):,} 个独立字符，其中汉字 {len(cjk):,} 个")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    text_file = SRC_DIR / "charset.txt"
    text_file.write_text("".join(sorted(chars)), encoding="utf-8")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(src),
            f"--text-file={text_file}",
            f"--output-file={OUT}",
            "--flavor=woff2",
            # 保留 CSS 里 font-feature-settings 用到的 kern/liga，以及中文排版需要的
            # 标点压缩与竖排相关特性
            "--layout-features=kern,liga,clig,ccmp,locl,mark,mkmk,halt,vhal,vert,vrt2,palt",
            "--no-hinting",
            "--desubroutinize",
            "--drop-tables+=DSIG",
            # 保留字体名，便于识别来源与版本
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
        ],
        check=True,
    )

    size = OUT.stat().st_size
    print(f"\n输出 {OUT.relative_to(ROOT)}")
    print(f"  {size:,} B ({size / 1024:.0f} KB)")
    print(f"  原始 {src.stat().st_size:,} B → 压缩到 {size / src.stat().st_size:.1%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

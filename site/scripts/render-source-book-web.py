#!/usr/bin/env python3
"""Export the complete, unabridged source-book model to standalone HTML and EPUB 3.

The model is produced by export-source-book.mjs.  Every original-text fragment is
checked before and after serialization; only markup and identifiers are adapted.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import mimetypes
import posixpath
import re
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

from lxml import etree, html

ROOT = Path(__file__).resolve().parents[2]
XHTML = "http://www.w3.org/1999/xhtml"
EPUB = "http://www.idpf.org/2007/ops"
OPF = "http://www.idpf.org/2007/opf"
DC = "http://purl.org/dc/elements/1.1/"
NCX = "http://www.daisy.org/z3986/2005/ncx/"
XML = "http://www.w3.org/XML/1998/namespace"
CONTAINER = "urn:oasis:names:tc:opendocument:xmlns:container"

CSS = """
:root{color-scheme:light;--ink:#272b29;--muted:#6d746d;--paper:#f4f2eb;--leaf:#fffef9;--line:#d9ded5;--green:#355b45}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}
body{margin:0;color:var(--ink);background:var(--paper);font-family:"Songti SC","Noto Serif CJK SC","Source Han Serif SC",STSong,SimSun,serif;font-size:18px;line-height:1.95;overflow-wrap:break-word}
a{color:var(--green);text-underline-offset:.2em}a:hover{color:#132f1f}
h1,h2,h3,h4,h5,h6{line-height:1.5;text-wrap:balance}h1{font-size:clamp(34px,5vw,64px);font-weight:600;letter-spacing:.08em}h2{font-size:30px}h3{font-size:25px}h4{font-size:21px}
.ui,.eyebrow,.source,.toc,.reading-nav{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.16em;color:var(--green);margin:0 0 16px}
.cover{max-width:1060px;min-height:85vh;padding:100px 44px 76px;margin:auto;display:flex;flex-direction:column;justify-content:center}
.cover-rule{width:60px;height:3px;background:var(--green);margin:0 0 44px}.cover h1{max-width:850px;margin:0 0 30px}.subtitle{max-width:650px;color:var(--muted);font-size:20px;text-wrap:balance}.cover-stats{padding:28px 0;margin:36px 0 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:14px;line-height:2.1;color:var(--muted)}.cover-actions{margin-top:30px;font-size:15px}.cover-actions a{margin-right:26px}
.reading-shell{width:min(1440px,calc(100% - 64px));margin:auto;display:grid;grid-template-columns:260px minmax(0,820px);gap:68px;align-items:start;justify-content:center}
.toc{font-size:13px;line-height:1.8;position:sticky;top:24px;max-height:calc(100vh - 48px);overflow:auto;padding:20px 18px 40px 0;scrollbar-width:thin}
.toc h2{font-size:20px;margin:0 0 24px}.toc ol{padding:0;list-style:none;margin:0}.toc>ol>li{margin:0 0 26px}.toc ol ol{margin:8px 0 0 12px}.toc li li{margin:5px 0}.toc ol ol ol{font-size:12px;margin:4px 0 12px 12px}.toc a{color:var(--muted);text-decoration:none}.toc .toc-part{font-weight:600;color:var(--green)}.toc .toc-chapter{color:var(--ink)}
.book-body{min-width:0;background:var(--leaf);padding:0 52px 90px;border:1px solid var(--line)}
.editorial-note{padding:42px 0 52px;border-bottom:1px solid var(--line);font-size:15px;color:var(--muted)}.editorial-note h2{font-size:22px;color:var(--ink)}.editorial-note p{white-space:pre-line}
.part{padding:88px 0 54px;border-bottom:1px solid var(--line)}.part h2{font-size:36px;margin:0 0 20px}.part ol{padding-left:1.4em;font-size:16px}.part a{text-decoration:none}
.chapter{padding-top:76px}.chapter-header{padding-bottom:30px;border-bottom:2px solid var(--green)}.chapter-header h2{margin:0 0 18px}.introduction{font-size:16px;color:var(--muted);white-space:pre-line}
.book-section{padding-top:52px}.section-heading{padding-bottom:16px;border-bottom:1px solid var(--line)}.section-heading h3{margin:0}.section-count{font-size:12px;color:var(--muted);margin:10px 0 0}.entry{padding:38px 0 42px;border-bottom:1px solid var(--line);scroll-margin-top:26px}.entry-header{margin-bottom:26px}.entry-title{font-size:19px;margin:0 0 10px;line-height:1.6}.source{font-size:12px;color:var(--muted);line-height:1.9;margin:0}.source a{color:inherit}.raw p{margin:1em 0}.raw h1,.raw h2,.raw h3,.raw h4,.raw h5,.raw h6{font-size:1.08em;margin:1.5em 0 .65em;font-weight:700;letter-spacing:0}.raw blockquote{margin:1.2em 0;padding:0 0 0 1.2em;border-left:2px solid var(--line);color:#4d554e}.raw img{display:block;max-width:100%;height:auto;margin:1.4em auto}.raw table{border-collapse:collapse;width:100%;margin:1.5em 0;font-size:.8em;line-height:1.65}.raw th,.raw td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.raw th{background:#edf0e9;font-weight:600}.raw pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;padding:14px;background:#f1f1e9}.raw code{font-size:.85em}.raw ul,.raw ol{padding-left:1.55em}.raw hr{border:0;border-top:1px solid var(--line);margin:2em 0}.raw a{overflow-wrap:anywhere}.raw .footnotes{font-size:.85em}
.reading-nav{display:flex;justify-content:space-between;gap:24px;padding:30px 0;font-size:13px}.back-top{position:fixed;bottom:22px;right:22px;background:var(--green);color:white;padding:9px 16px;text-decoration:none;border-radius:3px;font-size:12px}.back-top:hover{color:white;background:#234130}
.reading-nav{flex-wrap:wrap}.reading-route,.reading-stage,.version-note{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:12px;color:var(--muted);line-height:1.8}.reading-stage{color:var(--green);margin:0 0 9px}.reading-route{margin:20px 0 0}.further-reading{margin-top:60px;padding-top:28px;border-top:2px solid var(--green)}.further-reading>h3{margin:0 0 12px}.further-topic{border-bottom:1px solid var(--line)}.further-topic>summary{padding:22px 0;cursor:pointer;color:var(--green);font-size:17px;line-height:1.6}.further-topic>summary span{display:block;padding-left:1.2em;font-family:sans-serif;color:var(--muted);font-size:12px;margin-top:5px}.further-topic .book-section{padding-top:0}.further-topic .entry:first-child{padding-top:16px}.method-notes{padding-left:1.4em}.method-notes li{margin:.5em 0}
@media(max-width:1000px){.reading-shell{width:min(820px,calc(100% - 36px));display:block}.toc{position:static;max-height:none;columns:2;column-gap:28px;padding-bottom:40px}.toc>ol>li{break-inside:avoid}.toc h2{column-span:all}.book-body{padding:0 40px 70px}.cover{padding:80px 40px 64px;min-height:70vh}}
@media(max-width:600px){body{font-size:17px}.cover{padding:64px 24px 44px;min-height:70vh}.cover h1{font-size:36px}.cover h1>span{display:block}.subtitle{font-size:17px}.reading-shell{width:100%;padding:0 16px}.toc{columns:1;padding:26px 8px 36px;font-size:14px}.toc ol ol ol{font-size:13px}.book-body{padding:0 21px 48px}.part{padding-top:64px}.part h2{font-size:28px}.chapter{padding-top:54px}.chapter-header h2{font-size:25px}.section-heading h3{font-size:22px}.raw th,.raw td{padding:5px 6px}.source{font-size:11px}.back-top{right:14px;bottom:14px;padding:6px 12px}}
@media print{body{background:white;font-size:11pt}.cover{min-height:90vh}.reading-shell{display:block;width:100%}.toc{position:static;max-height:none;columns:2}.book-body{padding:0;border:0}.part,.chapter{break-before:page}.entry-header,h1,h2,h3,h4{break-after:avoid}.back-top,.cover-actions{display:none}}
"""

EPUB_CSS = """
@charset "UTF-8";
body{font-family:"Songti SC","Noto Serif CJK SC",STSong,SimSun,serif;line-height:1.85;margin:5%;color:#252a26;overflow-wrap:break-word}
a{color:#355b45;text-decoration:underline}h1,h2,h3,h4,h5,h6{line-height:1.5;page-break-after:avoid;break-after:avoid}
h1{font-size:1.8em;font-weight:600}h2{font-size:1.45em}h3{font-size:1.25em}.eyebrow{font-size:.7em;letter-spacing:.1em;color:#355b45;margin-top:2em}.cover{padding-top:16%;text-align:center}.cover h1{font-size:2.3em;letter-spacing:.08em}.subtitle{font-size:1.1em;color:#687268;margin:2em 0}.cover-stats{font-size:.8em;border-top:1px solid #cad2c9;border-bottom:1px solid #cad2c9;padding:1.4em 0;margin-top:3em}.editorial-note{margin-top:3em;font-size:.9em}.editorial-note p,.introduction{white-space:pre-line}.introduction{color:#59665b}.part,.chapter-header{padding-top:12%}.part h1{margin-bottom:2em}.part ol,.chapter-header ol{padding-left:1.3em}.toc ol{padding-left:1.4em}.toc li{margin:.5em 0}.toc a{text-decoration:none}
.section-heading{border-bottom:2px solid #355b45;padding-bottom:1em;margin-bottom:2em}.section-count{font-size:.7em;color:#687268}.entry{margin:0 0 2.8em;padding:1.5em 0 2em;border-bottom:1px solid #d9ded5}.entry-header{page-break-inside:avoid;break-inside:avoid;margin-bottom:1.5em}.entry-title{font-size:1.04em;margin:0 0 .7em}.source{font-family:sans-serif;font-size:.7em;line-height:1.7;color:#687268}.source a{color:inherit}.raw p{margin:1em 0}.raw h1,.raw h2,.raw h3,.raw h4,.raw h5,.raw h6{font-size:1.08em;margin:1.5em 0 .7em}.raw blockquote{margin:1.2em 0;padding-left:1em;border-left:2px solid #cad2c9}.raw img{max-width:100%;height:auto;display:block;margin:1em auto}.raw table{border-collapse:collapse;width:100%;font-size:.78em;line-height:1.6;margin:1.5em 0}.raw th,.raw td{border:1px solid #c7cfc5;padding:.45em;text-align:left;vertical-align:top;overflow-wrap:anywhere}.raw th{background:#edf0e9}.raw pre{white-space:pre-wrap;font-size:.8em}.raw code{font-size:.85em}.raw ul,.raw ol{padding-left:1.4em}.raw hr{border:0;border-top:1px solid #cad2c9;margin:2em 0}.raw .footnotes{font-size:.8em}.reading-nav{margin-top:2em;font-size:.8em}
.reading-route,.reading-stage,.version-note{font-family:sans-serif;font-size:.75em;line-height:1.7;color:#687268}.reading-stage{color:#355b45}.reading-nav a{display:block;margin:.7em 0}.method-notes{padding-left:1.3em}
"""


def esc(value):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def identifier(value):
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(value)).strip("-")
    return value if value and value[0].isalpha() else "id-" + value


def display_title(value):
    # Outline titles already carry Chinese chapter/part numbers. The export
    # places their number separately, so avoid printing the number twice.
    return re.sub(r"^第[一二三四五六七八九十百零〇\d]+[篇章][\s　:：·、.]*", "", str(value))


def text_content(element):
    return "".join(element.itertext())


def fragment(markup):
    return html.fragment_fromstring(markup or "", create_parent="div")


def xml_bytes(element):
    return etree.tostring(element, encoding="UTF-8", xml_declaration=True, pretty_print=False)


def new_xhtml(title, body_markup, style_href="../styles/book.css", body_class=None, prefix=""):
    root = etree.Element(f"{{{XHTML}}}html", nsmap={None: XHTML, "epub": EPUB})
    root.set("lang", "zh-CN")
    root.set(f"{{{XML}}}lang", "zh-CN")
    if prefix:
        root.set(f"{{{EPUB}}}prefix", prefix)
    head = etree.SubElement(root, f"{{{XHTML}}}head")
    etree.SubElement(head, f"{{{XHTML}}}meta", {"charset": "utf-8"})
    etree.SubElement(head, f"{{{XHTML}}}title").text = title
    etree.SubElement(head, f"{{{XHTML}}}link", {"rel": "stylesheet", "type": "text/css", "href": style_href})
    body = etree.SubElement(root, f"{{{XHTML}}}body")
    if body_class:
        body.set("class", body_class)
    wrapper = fragment(body_markup)
    body.text = wrapper.text
    for element in wrapper:
        body.append(element)
    for element in body.iter():
        if isinstance(element.tag, str) and not element.tag.startswith("{"):
            element.tag = f"{{{XHTML}}}{element.tag}"
    return xml_bytes(root)


class BookExporter:
    def __init__(self, model):
        self.book = model
        self.assets = {a["href"]: a for a in model.get("assets", [])}
        self.data_images = {}
        self.sections = []
        self.entries = []
        self.section_files = {}
        self.entry_section = {}
        self.part_order = {}
        self.chapter_order = {}
        self.section_order = {}
        self.chapter_parts = {}
        self.chapters = []
        self.entry_files = {}
        ci = 0
        for pi, part in enumerate(model["parts"], 1):
            self.part_order[part["id"]] = pi
            for chapter in part["chapters"]:
                ci += 1
                self.chapters.append(chapter)
                self.chapter_parts[chapter["id"]] = part
                self.chapter_order[chapter["id"]] = ci
                for si, section in enumerate(chapter["sections"], 1):
                    sid = self.sid(chapter, section)
                    self.section_order[sid] = si
                    self.section_files[sid] = f"text/{identifier(sid)}.xhtml"
                    self.sections.append((part, chapter, section))
                    for entry in section["entries"]:
                        self.entries.append(entry)
                        self.entry_section[entry["id"]] = sid
                        phase = "further" if self.edited_chapter(chapter) and entry.get("readingRole") != "core" else "main"
                        self.entry_files[entry["id"]] = self.section_file(chapter, section, phase)
        ids = [e["id"] for e in self.entries]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate model entry IDs")
        expected = model.get("stats", {}).get("entryCount")
        if expected is not None and expected != len(ids):
            raise ValueError(f"Expected {expected} entries, got {len(ids)}")
        self.reading_entries = [entry for chapter in self.chapters for section, phase in self.chapter_sequence(chapter) for entry in self.phase_entries(chapter, section, phase)]
        if Counter(e["id"] for e in self.reading_entries) != Counter(ids):
            raise ValueError("Reading sequence loses or repeats model entries")
        self.raw_fragments = {}
        self.original_text = {}
        self.original_id_maps = {}
        self.source_anchor_map = {}
        self.prepare_fragments()

    @staticmethod
    def sid(chapter, section):
        return f"section-{chapter['id']}-{section['id']}"

    def is_appendix(self, chapter):
        return self.chapter_parts[chapter["id"]].get("kind") == "appendix"

    def edited_chapter(self, chapter):
        return not self.is_appendix(chapter) and any(e.get("readingRole") for s in chapter["sections"] for e in s["entries"])

    def phase_entries(self, chapter, section, phase="main"):
        if not self.edited_chapter(chapter):
            return section["entries"] if phase == "main" else []
        return [e for e in section["entries"] if (e.get("readingRole") == "core") == (phase == "main")]

    def chapter_sequence(self, chapter):
        result = [(s, "main") for s in chapter["sections"]]
        if self.edited_chapter(chapter):
            result.extend((s, "further") for s in chapter["sections"] if self.phase_entries(chapter, s, "further"))
        return result

    def section_anchor(self, chapter, section, phase="main"):
        return self.sid(chapter, section) + ("-further" if phase == "further" else "")

    def section_file(self, chapter, section, phase="main"):
        return "text/" + identifier(self.section_anchor(chapter, section, phase)) + ".xhtml"

    def section_href(self, chapter, section, epub=False, phase="main"):
        return posixpath.basename(self.section_file(chapter, section, phase)) if epub else "#" + self.section_anchor(chapter, section, phase)

    def entry_href(self, entry_id, epub=False):
        return (posixpath.basename(self.entry_files[entry_id]) if epub else "") + "#" + identifier("entry-" + entry_id)

    def part_label(self, part):
        title = display_title(part["title"])
        return title if part.get("kind") == "appendix" else f'第 {self.part_order[part["id"]]} 篇　{title}'

    def chapter_label(self, chapter):
        title = display_title(chapter["title"])
        return title if self.is_appendix(chapter) else f'第 {self.chapter_order[chapter["id"]]} 章　{title}'

    def prepare_fragments(self):
        for entry in self.entries:
            root = fragment(entry["html"])
            self.original_text[entry["id"]] = text_content(root)
            prefix = identifier("entry-" + entry["id"])
            seen = Counter()
            mapping = {}
            for element in root.iter():
                if not isinstance(element.tag, str):
                    continue
                old_id = element.get("id") or (element.get("name") if element.tag == "a" else None)
                if old_id is not None:
                    unique = f"{prefix}--{identifier(old_id)}"
                    seen[unique] += 1
                    if seen[unique] > 1:
                        unique += f"--{seen[unique]}"
                    element.set("id", unique)
                    mapping.setdefault(old_id, unique)
                    source_key = (entry["source"]["url"].split("#")[0], old_id)
                    self.source_anchor_map.setdefault(source_key, (entry["id"], unique))
                if element.tag == "a":
                    element.attrib.pop("name", None)
            self.original_id_maps[entry["id"]] = mapping
            self.raw_fragments[entry["id"]] = root

    def image_uri(self, href, epub):
        item = self.assets.get(href)
        if item is None:
            if href.startswith(("https://", "http://", "data:")):
                if href.startswith("data:"):
                    return href
                raise ValueError(f"Image not embedded in model: {href}")
            raise ValueError(f"Unknown image: {href}")
        if epub:
            return "../" + item["href"]
        if href not in self.data_images:
            media_type = item.get("mediaType") or mimetypes.guess_type(item["path"])[0]
            self.data_images[href] = f"data:{media_type};base64," + base64.b64encode(Path(item["path"]).read_bytes()).decode("ascii")
        return self.data_images[href]

    def transformed_fragment(self, entry, epub=False):
        root = copy.deepcopy(self.raw_fragments[entry["id"]])
        mapping = self.original_id_maps[entry["id"]]
        source_url = entry["source"]["url"].split("#")[0]
        supported = set("a abbr address area article aside audio b bdi bdo blockquote br button caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select small source span strong style sub summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr".split())
        global_attrs = {"id", "class", "title", "lang", "dir", "style", "role"}
        by_tag = {
            "a": {"href", "rel", "type", "hreflang"}, "img": {"src", "alt", "width", "height"},
            "ol": {"start", "type", "reversed"}, "li": {"value"},
            "td": {"colspan", "rowspan", "headers"}, "th": {"colspan", "rowspan", "headers", "scope", "abbr"},
            "col": {"span"}, "colgroup": {"span"}, "time": {"datetime"},
            "blockquote": {"cite"}, "q": {"cite"}, "ins": {"cite", "datetime"}, "del": {"cite", "datetime"},
            "input": {"type", "checked", "disabled", "value"}, "details": {"open"},
        }
        for element in root.iter():
            if not isinstance(element.tag, str):
                continue
            if element.tag == "img":
                element.set("src", self.image_uri(element.get("src", ""), epub))
                if "alt" not in element.attrib:
                    element.set("alt", "")
            href = element.get("href")
            if href and href.startswith("#"):
                anchor = unquote(href[1:])
                if anchor in mapping:
                    element.set("href", "#" + mapping[anchor])
                elif (source_url, anchor) in self.source_anchor_map:
                    entry_id, target = self.source_anchor_map[(source_url, anchor)]
                    filename = posixpath.basename(self.entry_files[entry_id]) + "#" if epub else "#"
                    element.set("href", filename + target)
                else:
                    element.set("href", source_url + "#" + anchor)
            for attr in ("aria-labelledby", "aria-describedby", "headers"):
                if element.get(attr):
                    element.set(attr, " ".join(mapping.get(a, a) for a in element.get(attr).split()))
            if epub:
                if element.tag not in supported:
                    element.tag = "span" if element.tag == "font" else "div"
                if "align" in element.attrib:
                    alignment = element.get("align")
                    if alignment in ("left", "center", "right", "justify"):
                        element.set("style", element.get("style", "").rstrip(";") + f";text-align:{alignment};")
                for attr in list(element.attrib):
                    if attr not in global_attrs and attr not in by_tag.get(element.tag, set()) and not attr.startswith("aria-"):
                        del element.attrib[attr]
        if text_content(root) != self.original_text[entry["id"]]:
            raise ValueError(f"Original text changed while transforming {entry['id']}")
        serialized = (esc(root.text) if root.text else "") + "".join(etree.tostring(n, encoding="unicode", method="xml" if epub else "html", with_tail=True) for n in root)
        if text_content(fragment(serialized)) != self.original_text[entry["id"]]:
            raise ValueError(f"Original text changed while serializing {entry['id']}")
        return serialized

    def stats_line(self):
        stats = self.book.get("stats", {})
        sources = stats.get("sourceCount", len({e["source"]["url"].split("#")[0] for e in self.entries}))
        chars = stats.get("characterCount", 0)
        parts = [p for p in self.book["parts"] if p.get("kind") != "appendix"]
        chapters = [c for c in self.chapters if not self.is_appendix(c)]
        section_count = sum(len(c["sections"]) for c in chapters)
        line = f"{sources:,} 篇原文 · {len(self.entries):,} 则材料 · {len(parts)} 篇正文 · {len(chapters)} 章 · {section_count} 节"
        core_count = sum(e.get("readingRole") == "core" for e in self.entries)
        if core_count:
            line += f"<br />主线 {core_count:,} 则 · 其余材料收入同题延伸与附录"
        return line + (f"<br />原文共 {chars:,} 字符 · 按主题与阅读次序编排" if chars else "")

    def cover_markup(self, epub=False):
        actions = "" if epub else '<p class="cover-actions ui"><a href="#toc">查看完整目录 ↓</a><a href="#editorial-note">编排说明</a></p>'
        title = esc(self.book["title"])
        subtitle = self.book.get("subtitle", "从投资基础到商业判断，从资本配置到人生选择")
        subtitle_markup = esc(subtitle)
        if not epub:
            if self.book["title"] == "巴菲特原文主题全编":
                title = '<span>巴菲特</span><span>原文主题全编</span>'
            before, colon, after = subtitle.partition("：")
            if colon:
                subtitle_markup = f'<span style="display:block">{esc(before + colon)}</span><span style="display:block">{esc(after)}</span>'
        return f'<header class="cover" id="cover"><div class="cover-rule"></div><p class="eyebrow">巴菲特知识库 · 原文主题书系</p><h1>{title}</h1><p class="subtitle">{subtitle_markup}</p><p class="cover-stats ui">{self.stats_line()}</p>{actions}</header>'

    def editorial_markup(self):
        note = self.book.get("editorialNote", "按主题重新编排原文。正文保持原文，标题、目录、导读与出处为编排信息。")
        if isinstance(note, list):
            note = "\n\n".join(str(s) for s in note)
        methods = self.book.get("methodNotes") or []
        methods_markup = '<ul class="method-notes">' + ''.join(f'<li>{esc(s)}</li>' for s in methods) + '</ul>' if methods else ''
        revision = f'<p class="version-note">编排版本：{esc(self.book["revision"])}</p>' if self.book.get("revision") else ''
        return f'<section class="editorial-note" id="editorial-note"><p class="eyebrow">阅读之前</p><h2>编排与版本说明</h2><p>{esc(note)}</p>{methods_markup}{revision}</section>'

    def entry_markup(self, entry, epub=False):
        source = entry["source"]
        year = f"{source['year']} · " if source.get("year") else ""
        category = f"{source['category']} · " if source.get("category") else ""
        location = f"原文件第 {source['startLine']}–{source['endLine']} 行" if source.get("startLine") else ""
        title = f'<h4 class="entry-title">{esc(entry["title"])}</h4>' if entry.get("showTitle", True) else ''
        stage = f'<p class="reading-stage">{esc(entry["readingStage"])}</p>' if entry.get("readingStage") else ''
        duplicate = ''
        if entry.get("duplicateOf"):
            target = entry["duplicateOf"]
            duplicate = f'<p class="version-note">同题另本照录；<a href="{esc(self.entry_href(target, epub))}">参见另一版本</a>。</p>'
        return f'<article class="entry" id="{identifier("entry-"+entry["id"])}" data-entry-id="{esc(entry["id"])}"><header class="entry-header">{stage}{title}<p class="source">{esc(year + category)}<a href="{esc(source["url"])}">{esc(source["title"])}</a>{"<br />" + esc(location) if location else ""}</p>{duplicate}</header><div class="raw">{self.transformed_fragment(entry,epub)}</div></article>'

    def toc_markup(self, epub=False):
        chunks = ['<nav class="toc" id="toc" aria-labelledby="toc-title"><h2 id="toc-title">全书目录</h2><ol>']
        for part in self.book["parts"]:
            phref = f"text/part-{identifier(part['id'])}.xhtml" if epub else f"#part-{identifier(part['id'])}"
            chunks.append(f'<li><a class="toc-part" href="{phref}">{esc(self.part_label(part))}</a><ol>')
            for chapter in part["chapters"]:
                chref = f"text/chapter-{identifier(chapter['id'])}.xhtml" if epub else f"#chapter-{identifier(chapter['id'])}"
                chunks.append(f'<li><a class="toc-chapter" href="{chref}">{esc(self.chapter_label(chapter))}</a><ol>')
                for section in chapter["sections"]:
                    sid = self.sid(chapter, section)
                    shref = self.section_files[sid] if epub else f"#{sid}"
                    chunks.append(f'<li><a href="{shref}">{esc(section["title"])}</a></li>')
                chunks.append('</ol></li>')
            chunks.append('</ol></li>')
        chunks.append('</ol></nav>')
        return "".join(chunks)

    def part_markup(self, part, epub=False):
        links = "".join(f'<li><a href="{("chapter-" + identifier(c["id"]) + ".xhtml") if epub else ("#chapter-" + identifier(c["id"]))}">{esc(self.chapter_label(c))}</a></li>' for c in part["chapters"])
        heading = "h1" if epub else "h2"
        label = '' if part.get("kind") == "appendix" else f'<p class="eyebrow">第 {self.part_order[part["id"]]} 篇</p>'
        intro = f'<p class="introduction">{esc(part["introduction"])}</p>' if part.get("introduction") else ''
        return f'<section class="part" id="part-{identifier(part["id"])}">{label}<{heading}>{esc(display_title(part["title"]))}</{heading}>{intro}<ol>{links}</ol></section>'

    def chapter_header(self, chapter, epub=False):
        heading = "h1" if epub else "h2"
        links = ""
        if epub:
            links = "<ol>" + "".join(f'<li><a href="{posixpath.basename(self.section_files[self.sid(chapter,s)])}">{esc(s["title"])}</a></li>' for s in chapter["sections"]) + "</ol>"
        further = [s for s in chapter["sections"] if self.phase_entries(chapter, s, "further")]
        if further:
            href = self.section_href(chapter, further[0], True, "further") if epub else f'#further-chapter-{identifier(chapter["id"])}'
            links += f'<p class="reading-route">先循各节主线阅读，再查阅<a href="{href}">本章同题延伸</a>。</p>'
        label = '' if self.is_appendix(chapter) else f'<p class="eyebrow">第 {self.chapter_order[chapter["id"]]} 章</p>'
        return f'<header class="chapter-header">{label}<{heading}>{esc(display_title(chapter["title"]))}</{heading}><p class="introduction">{esc(chapter.get("introduction", ""))}</p>{links}</header>'

    def reading_nav(self, chapter, section, epub=False, phase="main"):
        links = []
        if phase == "further":
            links.append((self.section_href(chapter, section, epub), "返回本节主线"))
            further = [s for s in chapter["sections"] if self.phase_entries(chapter, s, "further")]
            index = further.index(section)
            if index + 1 < len(further):
                links.append((self.section_href(chapter, further[index + 1], epub, "further"), "查阅下一题延伸"))
        elif self.phase_entries(chapter, section, "further"):
            links.append((self.section_href(chapter, section, epub, "further"), "查阅本题延伸"))
        index = chapter["sections"].index(section)
        next_chapter = chapter
        if phase == "main" and index + 1 < len(chapter["sections"]):
            next_section = chapter["sections"][index + 1]
            next_label = "继续下一节主线" if self.edited_chapter(chapter) else "继续下一节"
        else:
            ci = self.chapters.index(chapter)
            next_chapter = self.chapters[ci + 1] if ci + 1 < len(self.chapters) else None
            next_section = next_chapter["sections"][0] if next_chapter and next_chapter["sections"] else None
            next_label = "进入附录" if next_chapter and self.is_appendix(next_chapter) else "继续下一章主线"
        if next_section:
            links.append((self.section_href(next_chapter, next_section, epub), next_label))
        links.append(("../nav.xhtml" if epub else "#toc", "返回全书目录"))
        return '<nav class="reading-nav" aria-label="阅读导航">' + ''.join(f'<a href="{esc(href)}">{esc(label)}</a>' for href, label in links) + '</nav>'

    def section_markup(self, chapter, section, epub=False, phase="main", show_heading=True):
        sid = self.sid(chapter, section)
        anchor = self.section_anchor(chapter, section, phase)
        entries = self.phase_entries(chapter, section, phase)
        heading = "h1" if epub else "h3"
        label = f'{self.chapter_label(chapter)} · 第 {self.section_order[sid]} 节' if self.is_appendix(chapter) else f'第 {self.chapter_order[chapter["id"]]} 章 · 第 {self.section_order[sid]} 节'
        if phase == "further":
            label += " · 本章同题延伸"
            description = f"本题延伸 {len(entries):,} 则 · 保留完整原文"
        elif self.edited_chapter(chapter):
            description = f"主线 {len(entries):,} 则 · 按理解层次阅读"
        else:
            description = f"本节 {len(entries):,} 则原文材料"
        header = f'<header class="section-heading"><p class="eyebrow">{esc(label)}</p><{heading}>{esc(section["title"])}</{heading}><p class="section-count ui">{description}</p></header>' if show_heading else ''
        return f'<section class="book-section" id="{anchor}">' + header + "".join(self.entry_markup(e, epub) for e in entries) + self.reading_nav(chapter, section, epub, phase) + "</section>"

    def build_html(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp.html")
        with tmp.open("w", encoding="utf-8") as out:
            out.write(f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="巴菲特原文主题全编：按主题循序阅读，正文保持原文。"><title>{esc(self.book["title"])}</title><style>{CSS}</style></head><body>')
            out.write(self.cover_markup())
            out.write('<div class="reading-shell">' + self.toc_markup() + '<main class="book-body">' + self.editorial_markup())
            for part in self.book["parts"]:
                out.write(self.part_markup(part))
                for chapter in part["chapters"]:
                    out.write(f'<article class="chapter" id="chapter-{identifier(chapter["id"])}">' + self.chapter_header(chapter))
                    for section in chapter["sections"]:
                        out.write(self.section_markup(chapter, section))
                    further = [s for s in chapter["sections"] if self.phase_entries(chapter, s, "further")]
                    if further:
                        out.write(f'<section class="further-reading" id="further-chapter-{identifier(chapter["id"])}"><h3>本章同题延伸</h3><p class="reading-route">按主题展开阅读。每则材料保留原文，可随时返回本节主线。</p>')
                        for section in further:
                            count = len(self.phase_entries(chapter, section, "further"))
                            out.write(f'<details class="further-topic"><summary>{esc(section["title"])}<span>{count:,} 则同题原文</span></summary>')
                            out.write(self.section_markup(chapter, section, phase="further", show_heading=False))
                            out.write('</details>')
                        out.write('</section>')
                    out.write('</article>')
            out.write('''</main></div><a class="back-top ui" href="#toc">目录 ↑</a><script>
function revealAnchor(hash=location.hash){
  let target;try{target=document.getElementById(decodeURIComponent(hash.slice(1)))}catch{return}
  if(!target)return;let opened=false;
  for(let parent=target;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS'&&!parent.open){parent.open=true;opened=true}}
  if(opened)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
}
window.addEventListener('hashchange',()=>revealAnchor());
document.addEventListener('click',event=>{const link=event.target.closest?.('a[href^="#"]');if(link)revealAnchor(link.getAttribute('href'))});
revealAnchor();
</script></body></html>''')
        self.validate_html(tmp)
        tmp.replace(path)
        return {"path": str(path), "bytes": path.stat().st_size, "entries": len(self.entries), "textVerified": True}

    def validate_html(self, path):
        tree = html.parse(str(path))
        ids = tree.xpath('//*[@id]/@id')
        dupes = [key for key, count in Counter(ids).items() if count > 1]
        if dupes:
            raise ValueError(f"Duplicate HTML IDs: {dupes[:10]}")
        idset = set(ids)
        for href in tree.xpath('//a[starts-with(@href,"#")]/@href'):
            if unquote(href[1:]) not in idset:
                raise ValueError(f"Broken HTML fragment: {href}")
        found = tree.xpath('//*[@data-entry-id]')
        if [e.get("data-entry-id") for e in found] != [e["id"] for e in self.reading_entries]:
            raise ValueError("HTML reading order, entry count, or unique coverage mismatch")
        for element in found:
            raw = element.find("div[@class='raw']")
            if text_content(raw) != self.original_text[element.get("data-entry-id")]:
                raise ValueError(f"HTML text mismatch: {element.get('data-entry-id')}")
        if any(not src.startswith("data:image/") for src in tree.xpath('//img/@src')):
            raise ValueError("HTML contains a nonembedded image")

    def build_epub(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        files = {"EPUB/styles/book.css": EPUB_CSS.encode("utf-8")}
        spine = []
        manifest = []

        def add(name, data, media_type, properties=None, linear=True):
            files["EPUB/" + name] = data
            item_id = "item-" + identifier(name)
            manifest.append((item_id, name, media_type, properties))
            if linear:
                spine.append(item_id)
            return item_id

        manifest.append(("book-css", "styles/book.css", "text/css", None))
        add("text/cover.xhtml", new_xhtml(self.book["title"], self.cover_markup(True) + self.editorial_markup()), "application/xhtml+xml")
        navdata = new_xhtml("全书目录", self.toc_markup(True), "styles/book.css")
        navroot = etree.fromstring(navdata)
        navroot.find(f".//{{{XHTML}}}nav").set(f"{{{EPUB}}}type", "toc")
        navbody = navroot.find(f"{{{XHTML}}}body")
        landmarks = etree.SubElement(navbody, f"{{{XHTML}}}nav", {f"{{{EPUB}}}type": "landmarks", "hidden": "hidden"})
        etree.SubElement(landmarks, f"{{{XHTML}}}h2").text = "阅读入口"
        landlist = etree.SubElement(landmarks, f"{{{XHTML}}}ol")
        for kind, href, label in (("cover", "text/cover.xhtml", "封面"), ("toc", "nav.xhtml", "目录"), ("bodymatter", self.section_files[self.sid(*self.sections[0][1:])], "正文")):
            item = etree.SubElement(landlist, f"{{{XHTML}}}li")
            etree.SubElement(item, f"{{{XHTML}}}a", {f"{{{EPUB}}}type": kind, "href": href}).text = label
        add("nav.xhtml", xml_bytes(navroot), "application/xhtml+xml", "nav")
        for part in self.book["parts"]:
            add(f'text/part-{identifier(part["id"])}.xhtml', new_xhtml(part["title"], self.part_markup(part, True)), "application/xhtml+xml")
            for chapter in part["chapters"]:
                add(f'text/chapter-{identifier(chapter["id"])}.xhtml', new_xhtml(chapter["title"], self.chapter_header(chapter, True)), "application/xhtml+xml")
                first_further = True
                for section, phase in self.chapter_sequence(chapter):
                    markup = self.section_markup(chapter, section, True, phase)
                    title = section["title"]
                    if phase == "further":
                        title = "同题延伸 · " + title
                        if first_further:
                            links = ''.join(f'<li><a href="{self.section_href(chapter, s, True, "further")}">{esc(s["title"])}</a></li>' for s in chapter["sections"] if self.phase_entries(chapter, s, "further"))
                            markup = f'<header><h1>本章同题延伸</h1><p class="reading-route">按主题查阅其余完整原文。</p><ol>{links}</ol></header>' + markup
                            first_further = False
                    add(self.section_file(chapter, section, phase), new_xhtml(title, markup), "application/xhtml+xml")
        for href, asset in self.assets.items():
            media = asset.get("mediaType") or mimetypes.guess_type(asset["path"])[0]
            if media not in ("image/jpeg", "image/png", "image/gif", "image/svg+xml"):
                raise ValueError(f"EPUB requires a core image format: {href} ({media})")
            add(href, Path(asset["path"]).read_bytes(), media, linear=False)

        digest = hashlib.sha256("".join(e.get("hash", e["id"]) for e in self.entries).encode()).hexdigest()
        uid = "urn:sha256:" + digest
        ncx = etree.Element(f"{{{NCX}}}ncx", nsmap={None: NCX}, version="2005-1")
        head = etree.SubElement(ncx, f"{{{NCX}}}head")
        for name, content in (("dtb:uid", uid), ("dtb:depth", "3"), ("dtb:totalPageCount", "0"), ("dtb:maxPageNumber", "0")):
            etree.SubElement(head, f"{{{NCX}}}meta", name=name, content=content)
        etree.SubElement(etree.SubElement(ncx, f"{{{NCX}}}docTitle"), f"{{{NCX}}}text").text = self.book["title"]
        navmap = etree.SubElement(ncx, f"{{{NCX}}}navMap")
        order = 0

        def point(parent, label, href):
            nonlocal order
            order += 1
            p = etree.SubElement(parent, f"{{{NCX}}}navPoint", id=f"nav-{order}", playOrder=str(order))
            etree.SubElement(etree.SubElement(p, f"{{{NCX}}}navLabel"), f"{{{NCX}}}text").text = label
            etree.SubElement(p, f"{{{NCX}}}content", src=href)
            return p

        for part in self.book["parts"]:
            p = point(navmap, self.part_label(part), f'text/part-{identifier(part["id"])}.xhtml')
            for chapter in part["chapters"]:
                c = point(p, self.chapter_label(chapter), f'text/chapter-{identifier(chapter["id"])}.xhtml')
                for section in chapter["sections"]:
                    point(c, section["title"], self.section_files[self.sid(chapter, section)])
        ncx_id = add("toc.ncx", xml_bytes(ncx), "application/x-dtbncx+xml", linear=False)
        package = etree.Element(f"{{{OPF}}}package", nsmap={None: OPF, "dc": DC}, version="3.0", attrib={"unique-identifier": "book-id"})
        metadata = etree.SubElement(package, f"{{{OPF}}}metadata")
        etree.SubElement(metadata, f"{{{DC}}}identifier", id="book-id").text = uid
        etree.SubElement(metadata, f"{{{DC}}}title").text = self.book["title"]
        etree.SubElement(metadata, f"{{{DC}}}language").text = "zh-CN"
        etree.SubElement(metadata, f"{{{DC}}}creator").text = "沃伦·巴菲特、查理·芒格及原文发言者"
        etree.SubElement(metadata, f"{{{DC}}}publisher").text = "巴菲特知识库"
        etree.SubElement(metadata, f"{{{DC}}}description").text = self.book.get("subtitle", "完整原文，按主题章节编排。")
        etree.SubElement(metadata, f"{{{OPF}}}meta", property="dcterms:modified").text = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        manifest_el = etree.SubElement(package, f"{{{OPF}}}manifest")
        for item_id, name, media, properties in manifest:
            attributes = {"id": item_id, "href": name, "media-type": media}
            if properties:
                attributes["properties"] = properties
            etree.SubElement(manifest_el, f"{{{OPF}}}item", attributes)
        spine_el = etree.SubElement(package, f"{{{OPF}}}spine", toc=ncx_id)
        for item_id in spine:
            etree.SubElement(spine_el, f"{{{OPF}}}itemref", idref=item_id)
        files["EPUB/package.opf"] = xml_bytes(package)
        container = etree.Element(f"{{{CONTAINER}}}container", nsmap={None: CONTAINER}, version="1.0")
        rootfiles = etree.SubElement(container, f"{{{CONTAINER}}}rootfiles")
        etree.SubElement(rootfiles, f"{{{CONTAINER}}}rootfile", {"full-path": "EPUB/package.opf", "media-type": "application/oebps-package+xml"})
        files["META-INF/container.xml"] = xml_bytes(container)
        self.validate_epub_files(files, len(spine))
        tmp = path.with_suffix(".tmp.epub")
        with zipfile.ZipFile(tmp, "w") as archive:
            for name, data in [("mimetype", b"application/epub+zip"), *files.items()]:
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                archive.writestr(info, data)
        with zipfile.ZipFile(tmp) as archive:
            if archive.testzip() is not None or archive.infolist()[0].filename != "mimetype" or archive.infolist()[0].compress_type != zipfile.ZIP_STORED:
                raise ValueError("EPUB ZIP integrity failed")
        tmp.replace(path)
        return {"path": str(path), "bytes": path.stat().st_size, "entries": len(self.entries), "readingDocuments": len(spine), "navigationDepth": 3, "textVerified": True, "allInternalLinksVerified": True}

    def validate_epub_files(self, files, spine_count):
        parsed = {}
        all_ids = {}
        for name, data in files.items():
            if name.endswith((".xml", ".xhtml", ".ncx", ".opf")):
                root = etree.fromstring(data)
                parsed[name] = root
                ids = root.xpath('//@id')
                if len(ids) != len(set(ids)):
                    raise ValueError(f"Duplicate EPUB document IDs: {name}")
                all_ids[name] = set(ids)
        count = 0
        found_ids = []
        for name, root in parsed.items():
            for node in root.xpath('//*[@data-entry-id]'):
                entry_id = node.get("data-entry-id")
                found_ids.append(entry_id)
                raw = node.find(f"{{{XHTML}}}div[@class='raw']")
                if text_content(raw) != self.original_text[entry_id]:
                    raise ValueError(f"EPUB original text mismatch: {entry_id}")
                count += 1
            for value in root.xpath('//@href | //@src'):
                target = urlsplit(value)
                if target.scheme or value.startswith("//"):
                    continue
                resource = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(target.path))) if target.path else name
                if resource not in files:
                    raise ValueError(f"Missing EPUB resource: {name} -> {value} ({resource})")
                if target.fragment and unquote(target.fragment) not in all_ids.get(resource, set()):
                    raise ValueError(f"Missing EPUB anchor: {name} -> {value}")
        if count != len(self.entries):
            raise ValueError(f"EPUB has {count} entries, expected {len(self.entries)}")
        if Counter(found_ids) != Counter(e["id"] for e in self.entries):
            raise ValueError("EPUB entries lost or duplicated")
        package = parsed["EPUB/package.opf"]
        item_ids = set(package.xpath('//opf:manifest/opf:item/@id', namespaces={"opf": OPF}))
        refs = package.xpath('//opf:spine/opf:itemref/@idref', namespaces={"opf": OPF})
        if len(refs) != spine_count or any(ref not in item_ids for ref in refs):
            raise ValueError("Invalid EPUB spine")
        manifest_files = {i.get("id"): "EPUB/" + i.get("href") for i in package.xpath('//opf:manifest/opf:item', namespaces={"opf": OPF})}
        ordered_ids = [entry_id for ref in refs for entry_id in parsed[manifest_files[ref]].xpath('//*[@data-entry-id]/@data-entry-id')]
        if ordered_ids != [e["id"] for e in self.reading_entries]:
            raise ValueError("EPUB spine does not follow the two-pass chapter reading order")
        toc = parsed["EPUB/nav.xhtml"].find(f".//{{{XHTML}}}nav")
        nav_entries = toc.findall(f".//{{{XHTML}}}a")
        if len(nav_entries) != len(self.book["parts"]) + len(self.chapter_order) + len(self.sections):
            raise ValueError("EPUB table of contents incomplete")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--format", default="html,epub", help="html, epub, or html,epub")
    args = parser.parse_args()
    formats = set(args.format.split(","))
    if not formats <= {"html", "epub"}:
        parser.error("--format must contain html and/or epub")
    model = json.loads(args.model.read_text(encoding="utf-8"))
    exporter = BookExporter(model)
    results = {}
    if "html" in formats:
        results["html"] = exporter.build_html(ROOT / "output/html/buffett-yuanwen.html")
    if "epub" in formats:
        results["epub"] = exporter.build_epub(ROOT / "output/epub/buffett-yuanwen.epub")
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

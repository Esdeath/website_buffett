#!/usr/bin/env python3
"""Render the explicitly edited Q&A edition; put every citation at the end."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import posixpath
import re
import shutil
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

from lxml import etree
from lxml import html as lhtml
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak, Flowable, CondPageBreak

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tmp/pdfs/buffett-jingbian'
OUTPUT = ROOT / 'output'
ESC = html.escape
XHTML = 'http://www.w3.org/1999/xhtml'
EPUB = 'http://www.idpf.org/2007/ops'
OPF = 'http://www.idpf.org/2007/opf'
DC = 'http://purl.org/dc/elements/1.1/'
FONT, BOLD, FALLBACK = 'EditedSongti', 'EditedSongtiBold', 'EditedUnicode'
INK, ACCENT, MUTED = '#20262b', '#28445b', '#66717a'
CSS = '''
:root{color-scheme:light;--ink:#20262b;--muted:#66717a;--accent:#28445b;--line:#dde3e7}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;color:var(--ink);background:#fff;font:18px/1.9 "Songti SC","Noto Serif CJK SC","SimSun",serif}a{color:var(--accent);text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:5px}
.cover{max-width:1000px;margin:0 auto;padding:96px 36px 72px}.cover h1{margin:0;font-size:clamp(34px,4.7vw,54px);line-height:1.5;font-weight:600}.cover h1 span{display:inline-block}.cover .subtitle{font-size:23px;margin:24px 0}.cover .edition{font:15px/1.8 -apple-system,"PingFang SC",sans-serif;color:var(--muted);margin:22px 0}.cover .note{max-width:710px;font-size:15px;color:var(--muted);line-height:1.85;margin-top:40px}.cover .open{display:inline-block;font:15px -apple-system,"PingFang SC",sans-serif;margin-top:18px}
.shell{display:grid;grid-template-columns:246px minmax(0,740px);gap:54px;max-width:1120px;padding:0 28px;margin:auto}.contents{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;font:13px/1.65 -apple-system,"PingFang SC",sans-serif;padding:6px 10px 32px 0}.contents summary{font-size:18px;font-weight:600;cursor:pointer;margin-bottom:24px}.contents ol{list-style:none;padding:0;margin:0}.contents>ol>li{margin:0 0 22px}.contents .part-title{font-weight:600;color:var(--accent);display:block;margin-bottom:9px}.contents ol ol li{margin:8px 0}.contents a{color:inherit;text-decoration:none}.contents a:hover{text-decoration:underline}.contents .source-link{padding-top:10px;border-top:1px solid var(--line)}
main{min-width:0}.chapter{padding:0 0 48px;scroll-margin-top:28px}.chapter+.chapter{border-top:1px solid var(--line);padding-top:42px}.part-name{font:13px/1.6 -apple-system,"PingFang SC",sans-serif;color:var(--muted);margin:0 0 18px}.chapter h2{font-size:30px;line-height:1.5;margin:0 0 26px;font-weight:600}.chapter .intro{color:#4e5d67;font-size:17px;margin:0 0 32px}.question{margin:0 0 32px}.question h3{font-size:22px;line-height:1.6;margin:0 0 14px;font-weight:600;break-after:avoid}.question p{margin:0 0 13px;text-align:justify;overflow-wrap:anywhere}.question p:last-child{margin-bottom:0}.chapter-next{font:14px/1.8 -apple-system,"PingFang SC",sans-serif;padding:20px 0 0;display:flex;justify-content:space-between;gap:18px}.chapter-next a{text-decoration:none}
.sources{border-top:2px solid var(--accent);padding:42px 0 80px;font-size:14px;line-height:1.8}.sources h2{font-size:29px;margin:0 0 18px}.sources h3{font-size:20px;margin:36px 0 20px}.sources dl{margin:0}.sources dt{font-size:15px;font-weight:600;margin:22px 0 6px}.sources dd{margin:0 0 6px 0;color:var(--muted)}.sources a{overflow-wrap:anywhere}.back-toc{position:fixed;right:18px;bottom:18px;background:#fff;color:var(--accent);border:1px solid var(--line);padding:5px 12px;font:13px/1.8 -apple-system,"PingFang SC",sans-serif;text-decoration:none}
@media(max-width:850px){.shell{display:block;max-width:780px;padding:0 28px}.contents{position:static;max-height:none;padding:22px 0 30px;border-top:1px solid var(--line);margin-bottom:36px}.contents>ol{columns:2;column-gap:26px}.contents>ol>li{break-inside:avoid}.cover{padding:60px 28px 40px}.chapter h2{font-size:28px}}
@media(max-width:520px){body{font-size:17px;line-height:1.85}.cover{padding:44px 23px 32px}.cover h1{font-size:33px}.cover h1 span{display:block}.cover .subtitle{font-size:19px;margin:20px 0}.cover .note{font-size:14px;margin-top:26px}.shell{padding:0 23px}.contents>ol{columns:1}.contents{font-size:14px}.chapter h2{font-size:27px}.question h3{font-size:21px}.question{margin-bottom:28px}.chapter-next{display:block}.chapter-next a{display:block;margin:12px 0}.back-toc{right:10px;bottom:10px}}
@media print{.contents{position:static;max-height:none}.shell{display:block}.back-toc,.chapter-next,.open{display:none}.cover,.chapter,.sources{break-before:page}.question h3{break-after:avoid}body{font-size:11pt}}
'''
EPUB_CSS = '''
body{font-family:serif;line-height:1.75;margin:5%;color:#20262b}h1,h2,h3{line-height:1.5;page-break-after:avoid}h1{font-size:1.8em}h2{font-size:1.55em}h3{font-size:1.2em;margin:1.7em 0 .7em}p{margin:.7em 0;text-align:justify;orphans:2;widows:2}.cover{padding-top:15%;text-align:center}.cover h1 span{display:block}.cover p{text-align:center}.cover .note{font-size:.85em;margin-top:3em;text-align:justify}.subtitle{font-size:1.1em}.edition,.part-name{font-size:.85em;color:#66717a}.intro{color:#4e5d67}.sources{font-size:.85em}.sources dt{font-weight:bold;margin-top:1.2em}.sources dd{margin:.4em 0}.contents ol{padding-left:1.2em}.contents li{margin:.6em 0}a{color:#28445b}
'''


def compact(text):
    return re.sub(r'\s+', '', text)


def chapters_of(book):
    return [c for p in book['parts'] for c in p['chapters']]


def chapter_label(chapter):
    return f'第{chapter["number"]}章 {chapter["title"]}'


def cover_markup(book, epub=False):
    title = '<span>巴菲特与芒格</span><span>投资问答</span>'
    return f'''<header class="cover" id="cover"><h1>{title}</h1><p class="subtitle">{ESC(book['subtitle'])}</p><p class="edition">{ESC(book['edition'])} · {book['stats']['chapterCount']} 章 · {book['stats']['questionCount']} 问</p><p class="note">{ESC(book['editingNote'])}</p>{'' if epub else '<a class="open" href="#toc">查看目录</a>'}</header>'''


def toc_markup(book, epub=False):
    chunks = ['<nav class="contents" id="toc"><h2>目录</h2><ol>'] if epub else ['<details class="contents" id="toc" open="open"><summary>目录</summary><ol>']
    for part in book['parts']:
        chunks.append(f'<li><span class="part-title">{ESC(part["title"])}</span><ol>')
        for c in part['chapters']:
            href = f'text/{c["id"]}.xhtml' if epub else '#chapter-' + c['id']
            chunks.append(f'<li><a href="{href}">{ESC(chapter_label(c))}</a></li>')
        chunks.append('</ol></li>')
    href = 'text/sources.xhtml' if epub else '#sources'
    chunks.append(f'<li class="source-link"><a href="{href}">资料来源</a></li></ol>')
    chunks.append('</nav>' if epub else '</details>')
    return ''.join(chunks)


def chapter_markup(chapter, part, next_chapter=None, epub=False):
    chunks = [f'<section class="chapter" id="chapter-{chapter["id"]}"><p class="part-name">{ESC(part["title"])}</p><h2>{ESC(chapter_label(chapter))}</h2>']
    if chapter['introduction']:
        chunks.append(f'<p class="intro">{ESC(chapter["introduction"])}</p>')
    aliases = set()
    for q in chapter['questions']:
        for sid in q['sectionIds']:
            if sid not in aliases:
                chunks.append(f'<span id="section-{chapter["id"]}-{sid}"></span>')
                aliases.add(sid)
        chunks.append(f'<section class="question" id="{q["id"]}"><h3>{ESC(q["question"])}</h3>')
        chunks.extend(f'<p>{ESC(p)}</p>' for p in q['paragraphs'])
        chunks.append('</section>')
    if not epub:
        chunks.append('<nav class="chapter-next"><a href="#toc">返回目录</a>')
        if next_chapter:
            chunks.append(f'<a href="#chapter-{next_chapter["id"]}">继续阅读：{ESC(next_chapter["title"])}</a>')
        else:
            chunks.append('<a href="#sources">资料来源</a>')
        chunks.append('</nav>')
    chunks.append('</section>')
    return ''.join(chunks)


def unique_sources(question):
    # Multiple passages from the same original are identified together at the back.
    groups = {}
    for s in question['sources']:
        groups.setdefault(s['url'], {'title': s['title'], 'url': s['url'], 'entries': []})['entries'].append(s['entryTitle'])
    return list(groups.values())


def sources_markup(book, epub=False):
    chunks = ['<section class="sources" id="sources"><h2>资料来源</h2><p>按章节与问题列出整理依据。回答经过归并与改写，所列资料共同支持相应问答。</p>']
    for c in chapters_of(book):
        chunks.append(f'<section id="sources-{c["id"]}"><h3>{ESC(chapter_label(c))}</h3><dl>')
        for q in c['questions']:
            chunks.append(f'<dt>{ESC(q["question"])}</dt>')
            for s in unique_sources(q):
                entries = '；'.join(dict.fromkeys(s['entries']))
                chunks.append(f'<dd><a href="{ESC(s["url"])}">{ESC(s["title"])}</a>：{ESC(entries)}</dd>')
        chunks.append('</dl></section>')
    chunks.append('</section>')
    return ''.join(chunks)


def validate_html(path, book):
    root = lhtml.fromstring(path.read_bytes())
    questions = root.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " question ")]')
    expected = [q for c in chapters_of(book) for q in c['questions']]
    assert [e.get('id') for e in questions] == [q['id'] for q in expected]
    for el, q in zip(questions, expected):
        assert el.find('h3').text_content() == q['question']
        assert [p.text_content() for p in el.findall('p')] == q['paragraphs']
        assert not el.xpath('.//a|.//sup'), '正文不应有来源标注'
    ids = root.xpath('//*[@id]/@id')
    assert len(ids) == len(set(ids)), 'HTML 重复锚点'
    for href in root.xpath('//@href'):
        if href.startswith('#'):
            assert unquote(href[1:]) in ids, href
    ext = root.xpath('//a[starts-with(@href,"http")]')
    assert all(any('sources' in p.get('class', '').split() for p in el.iterancestors()) for el in ext)
    return {'questions': len(questions), 'sourceLinks': len(ext), 'bodyCitations': 0, 'internalLinks': 'PASS', 'text': 'PASS'}


def render_html(book, path):
    chapters = chapters_of(book)
    content = [f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{ESC(book["title"])} · {ESC(book["edition"])}</title><style>{CSS}</style></head><body>', cover_markup(book), '<div class="shell">', toc_markup(book), '<main>']
    for part in book['parts']:
        for c in part['chapters']:
            i = chapters.index(c)
            content.append(chapter_markup(c, part, chapters[i + 1] if i + 1 < len(chapters) else None))
    content.extend([sources_markup(book), '</main></div><a class="back-toc" href="#toc">目录</a><script>const toc=document.getElementById("toc");if(matchMedia("(max-width:850px)").matches)toc.open=false;document.querySelectorAll(\'a[href="#toc"]\').forEach(a=>a.addEventListener("click",()=>toc.open=true));</script></body></html>'])
    path.write_text(''.join(content))
    return validate_html(path, book)


def xhtml(title, body, css='../styles/book.css'):
    doc = f'<html xmlns="{XHTML}" xmlns:epub="{EPUB}" lang="zh-CN" xml:lang="zh-CN"><head><title>{ESC(title)}</title><meta charset="utf-8"/><link href="{css}" rel="stylesheet" type="text/css"/></head><body>{body}</body></html>'
    return etree.tostring(etree.fromstring(doc.encode()), xml_declaration=True, encoding='UTF-8')


def validate_epub(path, book):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        assert archive.namelist()[0] == 'mimetype'
        assert archive.read('mimetype') == b'application/epub+zip'
        roots, ids = {}, {}
        for name in names:
            if name.endswith(('.xml', '.xhtml', '.opf', '.ncx')):
                roots[name] = etree.fromstring(archive.read(name))
                all_ids = roots[name].xpath('//@id')
                assert len(all_ids) == len(set(all_ids)), name
                ids[name] = set(all_ids)
        for name, root in roots.items():
            for href in root.xpath('//@href|//@src'):
                bits = urlsplit(href)
                if bits.scheme or not bits.path and not bits.fragment:
                    continue
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(bits.path))) if bits.path else name
                assert target in names, (name, href)
                if bits.fragment:
                    assert unquote(bits.fragment) in ids.get(target, set()), (name, href)
        opf = roots['EPUB/package.opf']
        manifest = {el.get('id'): el.get('href') for el in opf.findall(f'{{{OPF}}}manifest/{{{OPF}}}item')}
        spine = [manifest[el.get('idref')] for el in opf.findall(f'{{{OPF}}}spine/{{{OPF}}}itemref')]
        assert spine == ['text/cover.xhtml', 'nav.xhtml'] + [f'text/{c["id"]}.xhtml' for c in chapters_of(book)] + ['text/sources.xhtml']
        actual = []
        for c in chapters_of(book):
            root = roots[f'EPUB/text/{c["id"]}.xhtml']
            for el in root.xpath('//*[@class="question"]'):
                actual.append((el.get('id'), el.find(f'{{{XHTML}}}h3').text, [p.text for p in el.findall(f'{{{XHTML}}}p')]))
                assert not el.xpath('.//*[local-name()="a" or local-name()="sup"]')
        expected = [(q['id'], q['question'], q['paragraphs']) for c in chapters_of(book) for q in c['questions']]
        assert actual == expected
        return {'questions': len(actual), 'readingDocuments': len(spine), 'xml': 'PASS', 'links': 'PASS', 'order': 'PASS', 'text': 'PASS'}


def render_epub(book, path):
    files = {'EPUB/styles/book.css': EPUB_CSS.encode()}
    files['EPUB/text/cover.xhtml'] = xhtml(book['title'], cover_markup(book, True))
    nav = etree.fromstring(xhtml('目录', toc_markup(book, True), 'styles/book.css'))
    nav.find(f'.//{{{XHTML}}}nav').set(f'{{{EPUB}}}type', 'toc')
    files['EPUB/nav.xhtml'] = etree.tostring(nav, xml_declaration=True, encoding='UTF-8')
    for part in book['parts']:
        for c in part['chapters']:
            files[f'EPUB/text/{c["id"]}.xhtml'] = xhtml(chapter_label(c), chapter_markup(c, part, epub=True))
    files['EPUB/text/sources.xhtml'] = xhtml('资料来源', sources_markup(book, True))
    package = etree.Element(f'{{{OPF}}}package', nsmap={None: OPF}, version='3.0', attrib={'unique-identifier': 'book-id'})
    metadata = etree.SubElement(package, f'{{{OPF}}}metadata', nsmap={'dc': DC})
    etree.SubElement(metadata, f'{{{DC}}}identifier', id='book-id').text = 'urn:buffett-kb:' + book['revision']
    etree.SubElement(metadata, f'{{{DC}}}title').text = book['title'] + ' · ' + book['edition']
    etree.SubElement(metadata, f'{{{DC}}}language').text = 'zh-CN'
    etree.SubElement(metadata, f'{{{DC}}}creator').text = '巴菲特知识库 整理'
    etree.SubElement(metadata, f'{{{DC}}}description').text = book['editingNote']
    etree.SubElement(metadata, f'{{{OPF}}}meta', property='dcterms:modified').text = '2026-09-21T00:00:00Z'
    manifest = etree.SubElement(package, f'{{{OPF}}}manifest')
    item_ids = {}
    for index, name in enumerate(files):
        key = f'item-{index}'
        item_ids[name] = key
        attrs = {'id': key, 'href': name.removeprefix('EPUB/'), 'media-type': 'text/css' if name.endswith('.css') else 'application/xhtml+xml'}
        if name.endswith('/nav.xhtml'):
            attrs['properties'] = 'nav'
        etree.SubElement(manifest, f'{{{OPF}}}item', **attrs)
    spine = etree.SubElement(package, f'{{{OPF}}}spine')
    order = ['EPUB/text/cover.xhtml', 'EPUB/nav.xhtml'] + [f'EPUB/text/{c["id"]}.xhtml' for c in chapters_of(book)] + ['EPUB/text/sources.xhtml']
    for name in order:
        etree.SubElement(spine, f'{{{OPF}}}itemref', idref=item_ids[name])
    files['EPUB/package.opf'] = etree.tostring(package, xml_declaration=True, encoding='UTF-8')
    files['META-INF/container.xml'] = b'<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('mimetype', b'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        for name, data in files.items():
            archive.writestr(name, data)
    return validate_epub(path, book)


def register_fonts():
    path = os.environ.get('SOURCE_BOOK_FONT', '/System/Library/Fonts/Supplemental/Songti.ttc')
    pdfmetrics.registerFont(TTFont(FONT, path, subfontIndex=6))
    pdfmetrics.registerFont(TTFont(BOLD, path, subfontIndex=1))
    pdfmetrics.registerFont(TTFont(FALLBACK, '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=FONT, boldItalic=BOLD)


def pdf_text(text, bold=False):
    face = pdfmetrics.getFont(BOLD if bold else FONT).face
    fallback = pdfmetrics.getFont(FALLBACK).face
    result = []
    for char in text:
        if ord(char) in face.charToGlyph:
            result.append(ESC(char))
        elif ord(char) in fallback.charToGlyph:
            result.append(f'<font name="{FALLBACK}">{ESC(char)}</font>')
        else:
            raise ValueError(f'没有字体字形：{char} U+{ord(char):04X}')
    return ''.join(result)


def pdf_styles():
    shared = dict(fontName=FONT, wordWrap='CJK', allowWidows=0, allowOrphans=0, textColor=colors.HexColor(INK))
    specs = {
        'cover': dict(fontName=BOLD, fontSize=25, leading=37, alignment=TA_CENTER, spaceAfter=18),
        'subtitle': dict(fontSize=13, leading=22, alignment=TA_CENTER, textColor=colors.HexColor(ACCENT), spaceAfter=18),
        'center': dict(fontSize=10, leading=17, alignment=TA_CENTER, textColor=colors.HexColor(MUTED), spaceAfter=12),
        'note': dict(fontSize=9, leading=15, textColor=colors.HexColor(MUTED), spaceAfter=12),
        'chapter': dict(fontName=BOLD, fontSize=20, leading=29, keepWithNext=True, spaceAfter=19),
        'part': dict(fontSize=9, leading=15, textColor=colors.HexColor(MUTED), keepWithNext=True, spaceAfter=9),
        'intro': dict(fontSize=10, leading=17, textColor=colors.HexColor(MUTED), spaceAfter=18),
        'question': dict(fontName=BOLD, fontSize=12.2, leading=19, keepWithNext=True, spaceBefore=12, spaceAfter=9),
        'body': dict(fontSize=10.5, leading=17.5, alignment=TA_JUSTIFY, spaceAfter=8),
        'sourceQ': dict(fontName=BOLD, fontSize=9.5, leading=15, keepWithNext=True, spaceBefore=10, spaceAfter=5),
        'source': dict(fontSize=9, leading=14.5, spaceAfter=5),
        'toc': dict(fontSize=10.5, leading=17, spaceAfter=0),
    }
    return {key: ParagraphStyle(key, **(shared | spec)) for key, spec in specs.items()}


class TocCanvas(Canvas):
    def __init__(self, *args, destinations=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.destinations = destinations
        self.forms = {}

    def save(self):
        for form, anchor in self.forms.items():
            self.beginForm(form, 0, 0, 32, 18)
            self.setFont(FONT, 9.5)
            self.setFillColor(colors.HexColor(MUTED))
            self.drawRightString(30, 3, str(self.destinations[anchor]))
            self.endForm()
        super().save()


class TocRow(Flowable):
    def __init__(self, label, anchor, styles):
        super().__init__()
        self.anchor = anchor
        self.p = Paragraph(f'<link href="#{anchor}">{pdf_text(label)}</link>', styles['toc'])

    def wrap(self, width, height):
        self.width = width
        _, ph = self.p.wrap(width - 40, height)
        self.height = ph + 8
        return width, self.height

    def draw(self):
        self.p.drawOn(self.canv, 0, self.height - self.p.height)
        name = 'toc-' + self.anchor
        self.canv.forms[name] = self.anchor
        self.canv.saveState()
        self.canv.translate(self.width - 32, self.height - 14)
        self.canv.doForm(name)
        self.canv.restoreState()


class BookDoc(BaseDocTemplate):
    def __init__(self, path, book):
        super().__init__(str(path), pagesize=A5, leftMargin=17 * mm, rightMargin=17 * mm,
                         topMargin=17 * mm, bottomMargin=18 * mm, title=book['title'] + ' · ' + book['edition'],
                         author='巴菲特知识库 整理', subject=book['subtitle'], lang='zh-CN', pageCompression=1)
        self.destinations = {}
        self.heading = ''
        self.question_pages = {}
        self.chapter_pages = {}
        self.addPageTemplates(PageTemplate(id='book', frames=Frame(17 * mm, 18 * mm, A5[0] - 34 * mm, A5[1] - 35 * mm,
                                                                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0), onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        if doc.page <= 1:
            return
        canvas.saveState()
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(17 * mm, A5[1] - 11 * mm, '巴菲特与芒格投资问答')
        canvas.drawCentredString(A5[0] / 2, 10 * mm, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if getattr(flowable, 'anchor', None) and isinstance(flowable, Paragraph):
            self.canv.bookmarkPage(flowable.anchor)
            self.destinations[flowable.anchor] = self.page
            if getattr(flowable, 'outline_title', None):
                self.canv.addOutlineEntry(flowable.outline_title, flowable.anchor, level=0)
                self.heading = flowable.outline_title
                self.chapter_pages[flowable.anchor] = self.page
            if getattr(flowable, 'question_id', None):
                self.question_pages[flowable.question_id] = self.page


def pdf_heading(text, style, anchor=None, outline=False, question=False):
    p = Paragraph(pdf_text(text, style.fontName == BOLD), style)
    if anchor:
        p.anchor = anchor
    if outline:
        p.outline_title = text
    if question:
        p.question_id = anchor
    return p


def render_pdf(book, path):
    register_fonts()
    styles = pdf_styles()
    doc = BookDoc(path, book)
    story = [Spacer(1, 32 * mm), Paragraph('巴菲特与芒格<br/>投资问答', styles['cover']),
             Paragraph(pdf_text(book['subtitle']), styles['subtitle']),
             Paragraph(pdf_text(f'{book["edition"]} · {book["stats"]["chapterCount"]} 章 · {book["stats"]["questionCount"]} 问'), styles['center']),
             Spacer(1, 17 * mm), Paragraph('巴菲特知识库 整理', styles['center']),
             Spacer(1, 12 * mm), Paragraph(pdf_text(book['editingNote']), styles['note']), PageBreak(),
             pdf_heading('目录', styles['chapter'], 'toc')]
    for part in book['parts']:
        story.append(CondPageBreak(75))
        story.append(Paragraph(pdf_text(part['title']), styles['part']))
        for c in part['chapters']:
            story.append(TocRow(chapter_label(c), c['id'], styles))
        story.append(Spacer(1, 9))
    story.append(TocRow('资料来源', 'sources', styles))
    for part in book['parts']:
        for c in part['chapters']:
            story.extend([PageBreak(), Paragraph(pdf_text(part['title']), styles['part']),
                          pdf_heading(chapter_label(c), styles['chapter'], c['id'], outline=True)])
            if c['introduction']:
                story.append(Paragraph(pdf_text(c['introduction']), styles['intro']))
            for q in c['questions']:
                story.append(pdf_heading(q['question'], styles['question'], q['id'], question=True))
                story.extend(Paragraph(pdf_text(p), styles['body']) for p in q['paragraphs'])
    story.extend([PageBreak(), pdf_heading('资料来源', styles['chapter'], 'sources', outline=True),
                  Paragraph('按章节与问题列出整理依据。回答经过归并与改写，所列资料共同支持相应问答。', styles['source'])])
    for c in chapters_of(book):
        story.append(CondPageBreak(80))
        story.append(pdf_heading(chapter_label(c), styles['question']))
        for q in c['questions']:
            story.append(Paragraph(f'<link href="#{q["id"]}">{pdf_text(q["question"], True)}</link>', styles['sourceQ']))
            for s in unique_sources(q):
                entries = '；'.join(dict.fromkeys(s['entries']))
                story.append(Paragraph(f'<link href="{ESC(s["url"])}" color="{ACCENT}">{pdf_text(s["title"])}</link>：{pdf_text(entries)}', styles['source']))
    doc.build(story, canvasmaker=lambda *a, **kw: TocCanvas(*a, destinations=doc.destinations, **kw))
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    headers = {chapter_label(c) for c in chapters_of(book)} | {'资料来源', '巴菲特与芒格投资问答'}
    page_text = []
    for number, page in enumerate(reader.pages, 1):
        lines = page.extract_text().splitlines()
        # onPage paints the running header and folio before the body. Remove only
        # those two known fields so a paragraph split across pages stays adjacent.
        if number > 1 and lines and lines[0].strip() in headers:
            lines.pop(0)
            assert lines and lines[0].strip() == str(number), (number, lines[:2])
            lines.pop(0)
        page_text.append(compact(''.join(lines)))
    qs = [q for c in chapters_of(book) for q in c['questions']]
    for i, q in enumerate(qs):
        start = doc.question_pages[q['id']] - 1
        end = doc.question_pages[qs[i + 1]['id']] if i + 1 < len(qs) else doc.destinations['sources']
        text = ''.join(page_text[start:end])
        for piece in [q['question'], *q['paragraphs']]:
            assert compact(piece) in text, f'PDF文字遗漏：{q["id"]} {piece[:25]}'
    assert all('\ufffd' not in t for t in page_text)
    assert len(reader.outline) == len(chapters_of(book)) + 1
    for outline in reader.outline:
        reader.get_destination_page_number(outline)
    source_start = doc.destinations['sources']
    for n, page in enumerate(reader.pages, 1):
        for ref in page.get('/Annots', []):
            annotation = ref.get_object()
            if annotation.get('/A', {}).get('/S') == '/URI':
                assert n >= source_start, '正文出现外部来源链接'
    result = {'pages': len(reader.pages), 'questions': len(qs), 'paragraphs': sum(len(q['paragraphs']) for q in qs),
              'text': 'PASS', 'bookmarks': len(reader.outline), 'sourceStartPage': source_start,
              'chapterPages': doc.chapter_pages, 'questionPages': doc.question_pages}
    (WORK / 'pdf-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default=str(ROOT / 'buffett/books/buffett-jingbian/book.json'))
    parser.add_argument('--format', default='html,epub,pdf')
    parser.add_argument('--publish-current', action='store_true')
    args = parser.parse_args()
    book = json.loads(Path(args.model).read_text())
    WORK.mkdir(parents=True, exist_ok=True)
    results = {'revision': book['revision'], 'stats': book['stats']}
    for fmt in args.format.split(','):
        if fmt not in ('html', 'epub', 'pdf'):
            raise ValueError(fmt)
        directory = OUTPUT / fmt
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f'buffett-jingbian.{fmt}'
        results[fmt] = globals()[f'render_{fmt}'](book, destination)
        results[fmt]['bytes'] = destination.stat().st_size
        results[fmt]['sha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
        if args.publish_current:
            current = directory / f'buffett-yuanwen.{fmt}'
            archive = directory / f'buffett-yuanwen-quanbian.{fmt}'
            if current.exists() and not archive.exists():
                shutil.copy2(current, archive)
            shutil.copy2(destination, current)
        print(f'✓ {destination}: {destination.stat().st_size:,} bytes')
    (OUTPUT / 'editorial').mkdir(exist_ok=True)
    (OUTPUT / 'editorial/buffett-jingbian-validation.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(json.dumps(book['stats'], ensure_ascii=False))


if __name__ == '__main__':
    main()

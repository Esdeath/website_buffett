#!/usr/bin/env python3
"""Typeset the complete thematic source book without rewriting its visible text.

Usage: python render-source-book-pdf.py book.json output.pdf [--sample N]
The JSON is produced by the source-book export command. Songti fonts are embedded,
all source HTML is traversed, and TOC page numbers resolve in one rendering pass.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import html
import json
import os
import re
import time
from pathlib import Path

from lxml import etree
from lxml import html as lhtml
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Flowable, Frame, HRFlowable, Image,
    LongTable, PageBreak, PageTemplate, Paragraph, Spacer, TableStyle,
)

PAGE_W, PAGE_H = A4
MARGIN = 21 * mm
BODY_W = PAGE_W - 2 * MARGIN
BODY_H = PAGE_H - 39 * mm
REGULAR = 'SourceBookSongti'
BOLD = 'SourceBookSongtiBold'
FALLBACK = 'SourceBookUnicode'
INK = colors.HexColor('#292724')
MUTED = colors.HexColor('#777168')
ACCENT = colors.HexColor('#984334')
RULE = colors.HexColor('#DCD5CD')
SOFT = colors.HexColor('#F7F4EF')


def normalize(value: str) -> str:
    return re.sub(r'\s+', '', value)


def register_fonts() -> None:
    path = os.environ.get('SOURCE_BOOK_FONT', '/System/Library/Fonts/Supplemental/Songti.ttc')
    pdfmetrics.registerFont(TTFont(REGULAR, path, subfontIndex=int(os.environ.get('SOURCE_BOOK_FONT_INDEX', '6'))))
    pdfmetrics.registerFont(TTFont(BOLD, path, subfontIndex=int(os.environ.get('SOURCE_BOOK_BOLD_INDEX', '1'))))
    pdfmetrics.registerFont(TTFont(FALLBACK, '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
    # Stray variation selectors in the source are invisible formatting characters.
    # Embed a zero-width blank for them so PDF extraction retains the original codepoint.
    for name in (REGULAR, BOLD, FALLBACK):
        face = pdfmetrics.getFont(name).face
        for codepoint in range(0xFE00, 0xFE10):
            face.charToGlyph[codepoint] = face.charToGlyph[0x20]
            face.charWidths[codepoint] = 0
    pdfmetrics.registerFontFamily(REGULAR, normal=REGULAR, bold=BOLD, italic=REGULAR, boldItalic=BOLD)
    pdfmetrics.registerFontFamily(BOLD, normal=BOLD, bold=BOLD, italic=BOLD, boldItalic=BOLD)


def make_styles() -> dict:
    common = dict(wordWrap='CJK', splitLongWords=True, allowWidows=0, allowOrphans=0, textColor=INK)
    definitions = {
        'title': dict(fontName=BOLD, fontSize=30, leading=43, alignment=TA_CENTER, spaceAfter=13 * mm),
        'subtitle': dict(fontName=REGULAR, fontSize=14, leading=23, alignment=TA_CENTER, textColor=ACCENT, spaceAfter=10 * mm),
        'center': dict(fontName=REGULAR, fontSize=10, leading=18, alignment=TA_CENTER, textColor=MUTED, spaceAfter=5 * mm),
        'front': dict(fontName=REGULAR, fontSize=10.5, leading=18.5, spaceAfter=5 * mm),
        'tocTitle': dict(fontName=BOLD, fontSize=22, leading=31, spaceAfter=8 * mm),
        'part': dict(fontName=BOLD, fontSize=26, leading=37, spaceAfter=10 * mm),
        'chapter': dict(fontName=BOLD, fontSize=22, leading=32, spaceAfter=6 * mm, keepWithNext=True),
        'section': dict(fontName=BOLD, fontSize=16, leading=24, spaceAfter=7 * mm, keepWithNext=True),
        'label': dict(fontName=BOLD, fontSize=9, leading=15, textColor=ACCENT, spaceAfter=3 * mm, keepWithNext=True),
        'entry': dict(fontName=BOLD, fontSize=12.8, leading=20, spaceAfter=3 * mm, keepWithNext=True),
        'meta': dict(fontName=REGULAR, fontSize=8.1, leading=13, textColor=MUTED, spaceAfter=5 * mm, keepWithNext=True),
        'navigation': dict(fontName=REGULAR, fontSize=8.8, leading=15, textColor=ACCENT,
                           spaceBefore=3 * mm, spaceAfter=7 * mm),
        'body': dict(fontName=REGULAR, fontSize=10.4, leading=17.8, alignment=TA_JUSTIFY, spaceAfter=3.4 * mm),
        'quote': dict(fontName=REGULAR, fontSize=10.4, leading=17.8, leftIndent=5 * mm, rightIndent=3 * mm, spaceAfter=3.4 * mm),
        'heading': dict(fontName=BOLD, fontSize=11.4, leading=18.5, spaceBefore=3 * mm, spaceAfter=3 * mm, keepWithNext=True),
        'caption': dict(fontName=REGULAR, fontSize=8.5, leading=13.5, textColor=MUTED, alignment=TA_CENTER, spaceAfter=4 * mm),
        'cell': dict(fontName=REGULAR, fontSize=8.4, leading=12.4, spaceAfter=0),
        'pre': dict(fontName=REGULAR, fontSize=9.2, leading=14.5, spaceAfter=3.4 * mm),
    }
    result = {}
    for name, options in definitions.items():
        result[name] = ParagraphStyle(name, **(common | options))
    return result


class DeferredTocCanvas(Canvas):
    """Fill page-number XObjects after every target page has been composed."""
    def __init__(self, *args, toc_pages=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.toc_pages = toc_pages if toc_pages is not None else {}
        self.toc_forms = {}

    def save(self):
        for name, key in self.toc_forms.items():
            self.beginForm(name, 0, 0, 40, 20)
            self.setFillColor(MUTED)
            self.setFont(REGULAR, 9)
            self.drawRightString(39, 3, str(self.toc_pages[key]))
            self.endForm()
        super().save()


class TocRow(Flowable):
    def __init__(self, text, key, level, styles):
        super().__init__()
        self.key = key
        self.level = level
        self.width = BODY_W
        self.height = [29, 24, 19][level]
        self.spaceBefore = 7 if level == 0 else 0
        self.keepWithNext = level < 2
        style = ParagraphStyle('tocrow', parent=styles['body'], fontName=BOLD if level < 2 else REGULAR,
                               fontSize=[12, 10.5, 9.2][level], leading=14, spaceAfter=0,
                               textColor=INK if level < 2 else MUTED)
        self.p = Paragraph(f'<link href="#{key}">{html.escape(text)}</link>', style)

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        _, ph = self.p.wrap(availWidth - 45 - self.level * 12, availHeight)
        self.height = max(self.height, ph + 5)
        return self.width, self.height

    def draw(self):
        self.p.drawOn(self.canv, self.level * 12, self.height - self.p.height)
        form = f'toc-number-{self.key}'
        self.canv.toc_forms[form] = self.key
        self.canv.saveState()
        self.canv.translate(self.width - 40, self.height - 15)
        self.canv.doForm(form)
        self.canv.restoreState()


class SourceBookDoc(BaseDocTemplate):
    def __init__(self, output, model, qa):
        super().__init__(str(output), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=19 * mm, bottomMargin=20 * mm, pageCompression=1,
                         title=model['title'], author='巴菲特知识库', subject=model.get('subtitle', ''),
                         creator='巴菲特知识库 · ReportLab', lang='zh-CN')
        self.model, self.qa = model, qa
        self.heading = ''
        self.toc_pages = {}
        frame = Frame(MARGIN, 20 * mm, BODY_W, BODY_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='book', frames=[frame], onPageEnd=self.page_end))

    def page_end(self, canvas, doc):
        if self.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.35)
        canvas.line(MARGIN, PAGE_H - 12.5 * mm, PAGE_W - MARGIN, PAGE_H - 12.5 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(REGULAR, 7.5)
        canvas.drawString(MARGIN, PAGE_H - 10.2 * mm, self.model['title'])
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 10.2 * mm, self.heading)
        canvas.drawCentredString(PAGE_W / 2, 10 * mm, str(self.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        anchor = getattr(flowable, '_anchor_key', None)
        if anchor:
            self.canv.bookmarkPage(anchor)
        key = getattr(flowable, '_outline_key', None)
        if key:
            level = flowable._outline_level
            self.toc_pages[key] = self.page
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable._outline_text, key, level=level, closed=level < 2)
            if level == 1:
                self.heading = flowable._outline_text
            self.qa['headings'].append(dict(key=key, title=flowable._outline_text, level=level, page=self.page))
        entry_id = getattr(flowable, '_entry_id', None)
        if entry_id:
            self.canv.bookmarkPage('entry-' + entry_id)
            self.qa['entries'][entry_id]['page'] = self.page
        if getattr(flowable, '_is_source_table', False):
            self.qa['tablePages'].add(self.page)
        if getattr(flowable, '_is_source_image', False):
            self.qa['imagePages'].add(self.page)
        if self.page % 200 == 0 and self.qa.get('lastProgressPage') != self.page:
            self.qa['lastProgressPage'] = self.page
            print(f'Composed {self.page} pages', flush=True)


def heading(text, style, key, level):
    p = Paragraph(html.escape(text), style)
    p._outline_key = key
    p._outline_level = level
    p._outline_text = text
    return p


class HtmlFlowables:
    def __init__(self, styles, assets, qa):
        self.styles, self.qa = styles, qa
        self.assets = {}
        for asset in assets:
            self.assets[asset['href']] = Path(asset['path'])
        self.coverage = pdfmetrics.getFont(REGULAR).face.charWidths
        self.fallback_coverage = pdfmetrics.getFont(FALLBACK).face.charWidths
        self.unknown_chars = collections.Counter()
        self.emitted_text = []
        self.missing_images = []

    def text(self, value):
        """Escape text, retaining uncommon original glyphs through a second font."""
        value = value or ''
        self.emitted_text.append(value)
        out = []
        run = []
        fallback_run = []
        def flush_regular():
            if run:
                out.append(html.escape(''.join(run))); run.clear()
        def flush_fallback():
            if fallback_run:
                out.append(f'<font name="{FALLBACK}">{html.escape("".join(fallback_run))}</font>'); fallback_run.clear()
        for ch in value:
            if ch.isspace() or ord(ch) in self.coverage:
                flush_fallback(); run.append(ch)
            else:
                flush_regular(); fallback_run.append(ch)
                if ord(ch) not in self.fallback_coverage:
                    self.unknown_chars[ch] += 1
        flush_regular(); flush_fallback()
        return ''.join(out)

    def inline(self, node):
        if not isinstance(node.tag, str):
            return ''
        tag = node.tag.lower()
        if tag in ('script', 'style'):
            return ''
        if tag == 'img':
            return ''
        if tag == 'br':
            return '<br/>'
        content = self.text(node.text)
        for child in node:
            content += self.inline(child) + self.text(child.tail)
        if tag in ('strong', 'b'):
            return '<b>' + content + '</b>'
        if tag in ('em', 'i'):
            return '<i>' + content + '</i>'
        if tag in ('del', 's', 'strike'):
            return '<strike>' + content + '</strike>'
        if tag in ('sup', 'sub', 'u'):
            return f'<{tag}>' + content + f'</{tag}>'
        if tag == 'a' and node.get('href'):
            url = node.get('href')
            if url.startswith(('https://', 'http://', 'mailto:')):
                return f'<link href="{html.escape(url, quote=True)}" color="#984334">{content}</link>'
        return content

    def image(self, node):
        source = node.get('src', '')
        path = self.assets.get(source)
        if path is None or not path.exists():
            self.missing_images.append(source)
            return [Paragraph(f'图像：{html.escape(node.get("alt", ""))}（{html.escape(source)}）', self.styles['caption'])]
        with PILImage.open(path) as img:
            width, height = img.size
        scale = min(BODY_W / width, (BODY_H - 35 * mm) / height, 1.0)
        result = Image(str(path), width=width * scale, height=height * scale, lazy=2)
        result.hAlign = 'CENTER'
        result._is_source_image = True
        return [Spacer(1, 2 * mm), result, Spacer(1, 4 * mm)]

    def table(self, node):
        rows = node.xpath('./tr|./thead/tr|./tbody/tr|./tfoot/tr')
        if not rows:
            return []
        grid = []
        commands = []
        occupied = {}
        max_columns = 0
        for ri, row in enumerate(rows):
            cells = []
            ci = 0
            for cell in row:
                if not isinstance(cell.tag, str) or cell.tag.lower() not in ('td', 'th'):
                    continue
                while (ri, ci) in occupied:
                    cells.append(''); ci += 1
                try:
                    colspan, rowspan = max(1, int(cell.get('colspan', 1))), max(1, int(cell.get('rowspan', 1)))
                except ValueError:
                    colspan, rowspan = 1, 1
                value = self.inline(cell)
                if cell.tag.lower() == 'th':
                    value = '<b>' + value + '</b>'
                cells.append(value or ' ')
                for skip in range(1, colspan):
                    cells.append('')
                if colspan > 1 or rowspan > 1:
                    commands.append(('SPAN', (ci, ri), (ci + colspan - 1, ri + rowspan - 1)))
                    for yy in range(ri + 1, ri + rowspan):
                        for xx in range(ci, ci + colspan):
                            occupied[(yy, xx)] = True
                ci += colspan
            max_columns = max(max_columns, len(cells))
            grid.append(cells)
        for row in grid:
            row.extend([''] * (max_columns - len(row)))
        font_size = 8.4 if max_columns <= 7 else max(6.4, 10 - max_columns * .28)
        cell_style = ParagraphStyle('cell-sized', parent=self.styles['cell'], fontSize=font_size, leading=font_size * 1.48)
        data = [[Paragraph(value, cell_style) for value in row] for row in grid]
        widths = [BODY_W / max_columns] * max_columns
        if max_columns in (3, 4, 5):
            widths = [BODY_W * .34] + [BODY_W * .66 / (max_columns - 1)] * (max_columns - 1)
        head_rows = len(node.xpath('./thead/tr'))
        table = LongTable(data, colWidths=widths, repeatRows=head_rows, splitByRow=1, splitInRow=1,
                          hAlign='LEFT', spaceBefore=3 * mm, spaceAfter=5 * mm)
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, 0), (-1, -1), .25, RULE),
            ('BACKGROUND', (0, 0), (-1, max(0, head_rows - 1)), SOFT),
        ] + commands))
        table._is_source_table = True
        return [table]

    def blocks(self, node, style='body', depth=0):
        result = []
        if node.text and node.text.strip():
            result.append(Paragraph(self.text(node.text), self.styles[style]))
        for child in node:
            if not isinstance(child.tag, str):
                continue
            tag = child.tag.lower()
            if tag in ('script', 'style'):
                continue
            if tag == 'table':
                result.extend(self.table(child))
            elif tag == 'img':
                result.extend(self.image(child))
            elif tag in ('ul', 'ol'):
                start = int(child.get('start', '1'))
                for index, li in enumerate(child):
                    if not isinstance(li.tag, str):
                        continue
                    marker = f'{start + index}.' if tag == 'ol' else '•'
                    li_style = ParagraphStyle('list-item', parent=self.styles[style], leftIndent=(depth + 1) * 5 * mm,
                                              firstLineIndent=-3.8 * mm)
                    if any(isinstance(n.tag, str) and n.tag.lower() in ('p', 'ul', 'ol', 'table') for n in li):
                        if li.text and li.text.strip():
                            result.append(Paragraph(marker + '　' + self.text(li.text), li_style))
                            saved = li.text; li.text = None
                            result.extend(self.blocks(li, style, depth + 1)); li.text = saved
                        else:
                            loose_items = self.blocks(li, style, depth + 1)
                            # A loose Markdown list wraps each item in <p>; retain its
                            # generated list number just as for a compact <li> item.
                            for block_index, block in enumerate(loose_items):
                                if isinstance(block, Paragraph):
                                    bullet_style = ParagraphStyle('loose-list-item', parent=li_style,
                                                                  firstLineIndent=0,
                                                                  bulletIndent=depth * 5 * mm,
                                                                  bulletFontName=REGULAR,
                                                                  bulletFontSize=li_style.fontSize)
                                    loose_items[block_index] = Paragraph(block.text, bullet_style, bulletText=marker)
                                    break
                            result.extend(loose_items)
                    else:
                        result.append(Paragraph(marker + '　' + self.inline(li), li_style))
            elif tag == 'blockquote':
                result.extend(self.blocks(child, 'quote', depth))
            elif tag in ('div', 'section', 'article', 'figure', 'center', 'details'):
                result.extend(self.blocks(child, style, depth))
            elif tag == 'hr':
                result.append(HRFlowable(width='100%', thickness=.4, color=RULE, spaceBefore=3 * mm, spaceAfter=4 * mm))
            elif tag in ('p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'figcaption', 'summary'):
                target_style = 'heading' if tag.startswith('h') and len(tag) == 2 else ('pre' if tag == 'pre' else ('caption' if tag == 'figcaption' else style))
                value = self.inline(child)
                if tag == 'pre':
                    value = value.replace('\n', '<br/>')
                if value.strip():
                    result.append(Paragraph(value, self.styles[target_style]))
                for img in child.iter('img'):
                    result.extend(self.image(img))
            else:
                value = self.inline(child)
                if value.strip():
                    result.append(Paragraph(value, self.styles[style]))
                for img in child.iter('img'):
                    result.extend(self.image(img))
            if child.tail and child.tail.strip():
                result.append(Paragraph(self.text(child.tail), self.styles[style]))
        return result

    def render_entry(self, entry):
        root = lhtml.fragment_fromstring(entry['html'], create_parent='div')
        expected = ''.join(root.itertext())
        self.emitted_text = []
        result = self.blocks(root)
        actual = ''.join(self.emitted_text)
        if normalize(expected) != normalize(actual):
            raise ValueError(f'Visible-text traversal mismatch: {entry["id"]}')
        self.qa['entries'][entry['id']] = {'characters': len(normalize(expected)), 'visibleTextHash': hashlib.sha256(normalize(expected).encode()).hexdigest(), 'sourceHash': entry['hash']}
        return result


def section_layers(section, is_appendix=False, sample=None):
    """Keep every original entry in exactly one presentation layer."""
    if is_appendix:
        entries = section['entries']
        return {'appendix': entries[:sample] if sample else entries}
    core, further = [], []
    for entry in section['entries']:
        # Old models have no reading role and retain their original linear order.
        target = core if entry.get('readingRole', 'core') == 'core' else further
        target.append(entry)
    return {name: entries[:sample] if sample else entries
            for name, entries in [('core', core), ('further', further)]}


def make_story(model, styles, converter, sample=None):
    layouts = {}
    selected_ids = []
    main_sections = []
    appendix_sections = []
    for part in model['parts']:
        is_appendix = part.get('kind') == 'appendix'
        for chapter in part['chapters']:
            layouts[chapter['id']] = []
            for si, section in enumerate(chapter['sections'], 1):
                layers = section_layers(section, is_appendix, sample)
                layouts[chapter['id']].append((si, section, layers))
                selected_ids.extend(entry['id'] for entries in layers.values() for entry in entries)
                (appendix_sections if is_appendix else main_sections).append((chapter['id'], section['id']))
    if len(selected_ids) != len(set(selected_ids)):
        raise ValueError('An original entry occurs more than once in the PDF model')
    selected = set(selected_ids)
    next_core = {}
    for index, (chapter_id, section_id) in enumerate(main_sections):
        if index + 1 < len(main_sections):
            next_chapter, next_section = main_sections[index + 1]
            next_core[section_id] = ('section-' + next_section,
                                     '继续下一节主线' if next_chapter == chapter_id else '继续下一章主线')
        elif appendix_sections:
            next_core[section_id] = ('section-' + appendix_sections[0][1], '前往原始资料附录')

    story = [Spacer(1, 53 * mm), Paragraph(html.escape(model['title']), styles['title']),
             Paragraph(html.escape(model.get('subtitle', '按主题编排 · 原文完整保留')), styles['subtitle']),
             Spacer(1, 18 * mm), HRFlowable(width=56 * mm, thickness=1, color=ACCENT, hAlign='CENTER'),
             Spacer(1, 16 * mm), Paragraph('巴菲特知识库', styles['center'])]
    stats = model.get('stats', {})
    main_parts = [part for part in model['parts'] if part.get('kind') != 'appendix']
    appendix_parts = [part for part in model['parts'] if part.get('kind') == 'appendix']
    chapter_count = sum(len(part['chapters']) for part in main_parts)
    section_count = sum(len(chapter['sections']) for part in main_parts for chapter in part['chapters'])
    scope = f'{len(main_parts)} 篇正文 · {chapter_count} 章 · {section_count} 节'
    if appendix_parts:
        scope += f'<br/>另附 {len(appendix_sections)} 类原始资料'
    story.append(Paragraph(scope + '<br/>'
                           f'{stats.get("sourceCount", 0):,} 篇原始资料 · {stats.get("entryCount", 0):,} 则原文材料', styles['center']))
    if model.get('revision'):
        revision = str(model['revision'])
        edition = re.fullmatch(r'(\d{4}-\d{2}-\d{2})-reading-edition', revision)
        revision_label = f'阅读重编版 · {edition.group(1)}' if edition else revision
        story.append(Paragraph(html.escape(revision_label), styles['center']))
    story.extend([PageBreak(), Paragraph('编排说明', styles['tocTitle'])])
    notes = model.get('editorialNote', '')
    if isinstance(notes, list):
        notes = '\n\n'.join(str(x) for x in notes)
    for note in str(notes).split('\n\n'):
        if note.strip():
            story.append(Paragraph(html.escape(note), styles['front']))
    story.append(Paragraph('本版为可搜索中文 PDF。篇、章、节均有可点击目录和阅读器书签；章末同题延伸与附录也可由目录直接定位。正文保留原始段落、表格和图像，每则材料附原文出处与行号。', styles['front']))
    story.append(Paragraph('怎样阅读这本书', styles['section']))
    method_notes = model.get('methodNotes', [])
    if isinstance(method_notes, str):
        method_notes = [method_notes]
    for note in method_notes:
        if str(note).strip():
            story.append(Paragraph(html.escape(str(note)), styles['front']))
    story.append(Paragraph('顺读主线时，请先阅读每章各节集中排列的核心原文。每节末的“继续下一节主线”或“继续下一章主线”可直接前往下一步；需要深入追索时，再进入本章末按主题编排的“同题延伸”。附录单独保存会务、表格及其他原始资料。每则原文仅排入一处，主线和延伸的区分不会删去正文。', styles['front']))
    toc_title = Paragraph('目录', styles['tocTitle'])
    toc_title._anchor_key = 'book-toc'
    story.extend([PageBreak(), toc_title])
    for part in model['parts']:
        story.append(TocRow(part['title'], 'part-' + part['id'], 0, styles))
        for chapter in part['chapters']:
            story.append(TocRow(chapter['title'], 'chapter-' + chapter['id'], 1, styles))
            for si, section, layers in layouts[chapter['id']]:
                story.append(TocRow(f'{si}. {section["title"]}', 'section-' + section['id'], 2, styles))
            extensions = [(si, section, layers) for si, section, layers in layouts[chapter['id']]
                          if layers.get('further')]
            if extensions:
                story.append(TocRow('本章同题延伸', 'further-' + chapter['id'], 2, styles))
                for si, section, layers in extensions:
                    story.append(TocRow(f'延伸 {si}. {section["title"]}', 'further-section-' + section['id'], 2, styles))

    emitted = []
    converter.qa['readingRoles'] = collections.Counter()
    converter.qa['navigationLinks'] = []

    def navigation(links):
        links = links + [('book-toc', '返回目录')]
        converter.qa['navigationLinks'].extend({'target': key, 'label': label} for key, label in links)
        text = '　 · 　'.join(f'<link href="#{html.escape(key, quote=True)}">{html.escape(label)}</link>'
                             for key, label in links)
        story.append(Paragraph(text, styles['navigation']))

    def emit_entry(entry, role):
        entry_id = entry['id']
        if entry_id in converter.qa['entries']:
            raise ValueError(f'Original entry emitted more than once: {entry_id}')
        body = converter.render_entry(entry)
        emitted.append(entry_id)
        converter.qa['readingRoles'][role] += 1
        converter.qa['entries'][entry_id]['readingRole'] = role
        story.append(CondPageBreak(35 * mm))
        if role == 'core' and entry.get('readingStage'):
            story.append(Paragraph(html.escape(entry['readingStage']), styles['label']))
        marker = None
        if entry.get('showTitle', True):
            marker = Paragraph(html.escape(entry['title']), styles['entry'])
            story.append(marker)
        source = entry['source']
        locator = f'原文第 {source["startLine"]}—{source["endLine"]} 行'
        url = source.get('url', '')
        linked_title = html.escape(source['title'])
        if url.startswith(('https://', 'http://')):
            linked_title = f'<link href="{html.escape(url, quote=True)}" color="#777168">{linked_title}</link>'
        category = html.escape(str(source.get('category', '')))
        meta = Paragraph(f'{category} · {linked_title}<br/>{locator}', styles['meta'])
        # When the editorial wrapper is omitted, mark the source label; the raw
        # heading remains in body and is still checked by render_entry's hash.
        (marker if marker is not None else meta)._entry_id = entry_id
        story.append(meta)
        duplicate_id = entry.get('duplicateOf')
        if duplicate_id:
            note = '相关原文另有一个保留版本；本则仍按本来源完整收录。'
            if duplicate_id in selected:
                note = f'<link href="#entry-{html.escape(duplicate_id, quote=True)}" color="#984334">查看相关原文版本</link>。本则仍按本来源完整收录。'
            story.append(Paragraph(note, styles['meta']))
        story.extend(body)
        story.append(Spacer(1, 6 * mm))

    for part in model['parts']:
        is_appendix = part.get('kind') == 'appendix'
        story.extend([PageBreak(), Spacer(1, 25 * mm),
                      heading(part['title'], styles['part'], 'part-' + part['id'], 0)])
        if part.get('introduction'):
            story.append(Paragraph(html.escape(part['introduction']), styles['front']))
        for chapter in part['chapters']:
            story.append(Paragraph(html.escape(chapter['title']), styles['front']))
        for chapter in part['chapters']:
            story.extend([PageBreak(), heading(chapter['title'], styles['chapter'], 'chapter-' + chapter['id'], 1)])
            if chapter.get('introduction'):
                story.append(Paragraph(html.escape(chapter['introduction']), styles['front']))
            for si, section, layers in layouts[chapter['id']]:
                story.extend([CondPageBreak(45 * mm), Paragraph(f'第 {si} 节', styles['label']),
                              heading(section['title'], styles['section'], 'section-' + section['id'], 2)])
                role = 'appendix' if is_appendix else 'core'
                entries = layers[role]
                for entry in entries:
                    emit_entry(entry, role)
                if not entries and layers.get('further'):
                    story.append(Paragraph('本节原文集中收录于章末同题延伸。', styles['front']))
                links = []
                if section['id'] in next_core:
                    links.append(next_core[section['id']])
                if layers.get('further'):
                    links.append(('further-section-' + section['id'], '查看本题延伸'))
                navigation(links)
            extensions = [(si, section, layers) for si, section, layers in layouts[chapter['id']]
                          if layers.get('further')]
            if extensions:
                story.extend([PageBreak(), heading('本章同题延伸', styles['section'], 'further-' + chapter['id'], 2),
                              Paragraph('以下完整保留本章各主题的其他原文，按来源年代展开。可使用各节末的链接返回核心或继续下一段主线。', styles['front'])])
                for si, section, layers in extensions:
                    story.extend([CondPageBreak(45 * mm), Paragraph(f'同题延伸 · 第 {si} 节', styles['label']),
                                  heading('延伸 · ' + section['title'], styles['section'], 'further-section-' + section['id'], 2)])
                    navigation([('section-' + section['id'], '返回本节主线')]
                               + ([next_core[section['id']]] if section['id'] in next_core else []))
                    for entry in layers['further']:
                        emit_entry(entry, 'further')
                    navigation([('section-' + section['id'], '返回本节主线')]
                               + ([next_core[section['id']]] if section['id'] in next_core else []))
    if len(emitted) != len(selected_ids) or set(emitted) != selected:
        raise ValueError('PDF reading layers omitted or duplicated an original entry')
    converter.qa['entryCount'] = len(emitted)
    converter.qa['entryOrder'] = emitted
    return story


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sample', type=int)
    args = parser.parse_args()
    started = time.time()
    model = json.loads(args.model.read_text(encoding='utf-8'))
    register_fonts()
    styles = make_styles()
    qa = {'entries': {}, 'headings': [], 'tablePages': set(), 'imagePages': set()}
    converter = HtmlFlowables(styles, model.get('assets', []), qa)
    story = make_story(model, styles, converter, args.sample)
    if converter.missing_images:
        raise ValueError(f'Missing original images: {converter.missing_images}')
    if converter.unknown_chars:
        raise ValueError(f'Fonts lack original characters: {dict(converter.unknown_chars)}')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    doc = SourceBookDoc(args.output, model, qa)
    print(f'Typesetting {qa["entryCount"]} entries / {len(story)} blocks', flush=True)
    doc.build(story, canvasmaker=lambda *a, **kw: DeferredTocCanvas(*a, toc_pages=doc.toc_pages, **kw))
    qa['pageCount'] = doc.page
    qa['byteLength'] = args.output.stat().st_size
    qa['tablePages'] = sorted(qa['tablePages'])
    qa['imagePages'] = sorted(qa['imagePages'])
    qa['seconds'] = round(time.time() - started, 2)
    qa.pop('lastProgressPage', None)
    qa_path = args.model.parent / ('pdf-qa-sample.json' if args.sample else 'pdf-qa.json')
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: qa[key] for key in ['entryCount', 'pageCount', 'byteLength', 'seconds']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Render the structured Buffett Q&A book model as a typeset A5 PDF."""

from __future__ import annotations

import html
import json
import os
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents


PAGE_WIDTH, PAGE_HEIGHT = A5
DEFAULT_SONGTI_PATH = '/System/Library/Fonts/Supplemental/Songti.ttc'
FONT_REGULAR_PATH = Path(os.environ.get('QA_BOOK_FONT_REGULAR', DEFAULT_SONGTI_PATH))
FONT_BOLD_PATH = Path(os.environ.get('QA_BOOK_FONT_BOLD', str(FONT_REGULAR_PATH)))
FONT_REGULAR_INDEX = int(os.environ.get('QA_BOOK_FONT_REGULAR_INDEX', '6'))
FONT_BOLD_INDEX = int(os.environ.get('QA_BOOK_FONT_BOLD_INDEX', '1'))
FONT_REGULAR = 'QaBookSongti'
FONT_BOLD = 'QaBookSongtiBold'
INK = colors.HexColor('#2C2925')
MUTED = colors.HexColor('#716A62')
ACCENT = colors.HexColor('#9B4438')
LINE = colors.HexColor('#D9D0C5')
SOFT = colors.HexColor('#F7F1EB')


def register_fonts() -> None:
    if not FONT_REGULAR_PATH.exists() or not FONT_BOLD_PATH.exists():
        raise FileNotFoundError(
            '缺少中文字体。请通过 QA_BOOK_FONT_REGULAR 和 QA_BOOK_FONT_BOLD 指定 TTF/TTC 字体。'
        )
    pdfmetrics.registerFont(TTFont(
        FONT_REGULAR, str(FONT_REGULAR_PATH), subfontIndex=FONT_REGULAR_INDEX,
    ))
    pdfmetrics.registerFont(TTFont(
        FONT_BOLD, str(FONT_BOLD_PATH), subfontIndex=FONT_BOLD_INDEX,
    ))
    pdfmetrics.registerFontFamily(
        'QaBookSongtiFamily',
        normal=FONT_REGULAR,
        bold=FONT_BOLD,
        italic=FONT_REGULAR,
        boldItalic=FONT_BOLD,
    )


def inline_markdown(value: str) -> str:
    pieces: list[str] = []
    cursor = 0
    for match in re.finditer(r'\*\*([\s\S]+?)\*\*', value):
        pieces.append(html.escape(value[cursor:match.start()]))
        pieces.append(f'<b>{html.escape(match.group(1))}</b>')
        cursor = match.end()
    pieces.append(html.escape(value[cursor:]))
    return ''.join(pieces).replace('\n', '<br/>')


def link(url: str, label: str) -> str:
    return f'<link href="{html.escape(url, quote=True)}" color="#9B4438">{html.escape(label)}</link>'


def make_styles() -> dict[str, ParagraphStyle]:
    base = dict(
        wordWrap='CJK',
        splitLongWords=True,
        allowWidows=0,
        allowOrphans=0,
    )
    return {
        'Title': ParagraphStyle(
            'Title', **base, fontName=FONT_BOLD, fontSize=27, leading=36, textColor=INK,
            alignment=TA_CENTER, spaceAfter=8 * mm,
        ),
        'Subtitle': ParagraphStyle(
            'Subtitle', **base, fontName=FONT_REGULAR, fontSize=13, leading=21, textColor=ACCENT,
            alignment=TA_CENTER, spaceAfter=8 * mm,
        ),
        'CenterMeta': ParagraphStyle(
            'CenterMeta', **base, fontName=FONT_REGULAR, fontSize=9.5, leading=16, textColor=MUTED,
            alignment=TA_CENTER,
        ),
        'ContentsTitle': ParagraphStyle(
            'ContentsTitle', **base, fontName=FONT_BOLD, fontSize=22, leading=30, textColor=INK,
            spaceAfter=9 * mm,
        ),
        'Part': ParagraphStyle(
            'Part', **base, fontName=FONT_BOLD, fontSize=28, leading=38, textColor=INK,
            alignment=TA_CENTER, spaceAfter=12 * mm,
        ),
        'PartNumber': ParagraphStyle(
            'PartNumber', **base, fontName=FONT_BOLD, fontSize=10, leading=16,
            textColor=ACCENT, alignment=TA_CENTER, spaceAfter=6 * mm,
        ),
        'PartChapter': ParagraphStyle(
            'PartChapter', **base, fontName=FONT_REGULAR, fontSize=11, leading=19, alignment=TA_CENTER,
            textColor=MUTED, spaceAfter=2 * mm,
        ),
        'ChapterNumber': ParagraphStyle(
            'ChapterNumber', **base, fontName=FONT_BOLD, fontSize=9.5, leading=15,
            textColor=ACCENT, spaceAfter=3 * mm,
        ),
        'Chapter': ParagraphStyle(
            'Chapter', **base, fontName=FONT_BOLD, fontSize=21, leading=30, textColor=INK,
            spaceAfter=4 * mm, keepWithNext=True,
        ),
        'ChapterSubtitle': ParagraphStyle(
            'ChapterSubtitle', **base, fontName=FONT_REGULAR, fontSize=11.5, leading=19, textColor=MUTED,
            spaceAfter=8 * mm, keepWithNext=True,
        ),
        'EditorLabel': ParagraphStyle(
            'EditorLabel', **base, fontName=FONT_BOLD, fontSize=8.5, leading=13,
            textColor=ACCENT, spaceAfter=1.5 * mm, keepWithNext=True,
        ),
        'EditorText': ParagraphStyle(
            'EditorText', **base, fontName=FONT_REGULAR, fontSize=9.8, leading=16.5, textColor=INK, backColor=SOFT,
            borderColor=LINE, borderWidth=0.4, borderPadding=7, spaceAfter=9 * mm,
            alignment=TA_JUSTIFY,
        ),
        'MovementNumber': ParagraphStyle(
            'MovementNumber', **base, fontName=FONT_BOLD, fontSize=8.5, leading=13,
            textColor=ACCENT, spaceAfter=1 * mm, keepWithNext=True,
        ),
        'Movement': ParagraphStyle(
            'Movement', **base, fontName=FONT_BOLD, fontSize=15.5, leading=23, textColor=INK,
            spaceAfter=6 * mm, keepWithNext=True,
        ),
        'QuestionNumber': ParagraphStyle(
            'QuestionNumber', **base, fontName=FONT_BOLD, fontSize=8.2, leading=12,
            textColor=ACCENT, spaceAfter=1 * mm, keepWithNext=True,
        ),
        'Question': ParagraphStyle(
            'Question', **base, fontName=FONT_BOLD, fontSize=13.2, leading=20, textColor=INK,
            spaceAfter=4 * mm, keepWithNext=True,
        ),
        'SourceQuestionLabel': ParagraphStyle(
            'SourceQuestionLabel', **base, fontName=FONT_BOLD, fontSize=7.8,
            leading=12, textColor=MUTED, leftIndent=4 * mm, rightIndent=4 * mm,
            backColor=SOFT, borderColor=SOFT, borderWidth=0.1,
            borderPadding=(5, 7, 1, 7), keepWithNext=True,
        ),
        'SourceQuestion': ParagraphStyle(
            'SourceQuestion', **base, fontName=FONT_REGULAR, fontSize=9.4, leading=16, textColor=INK, leftIndent=4 * mm,
            rightIndent=4 * mm, backColor=SOFT, borderColor=SOFT,
            borderWidth=0.1, borderPadding=(1, 7, 7, 7), spaceAfter=6 * mm,
        ),
        'Answer': ParagraphStyle(
            'Answer', **base, fontName=FONT_REGULAR, fontSize=10.2, leading=17.2, textColor=INK, alignment=TA_JUSTIFY,
            spaceAfter=3.4 * mm,
        ),
        'SourceMeta': ParagraphStyle(
            'SourceMeta', **base, fontName=FONT_REGULAR, fontSize=7.6, leading=12.5, textColor=MUTED,
            borderColor=LINE, borderWidth=0.45, borderPadding=(5, 0, 0, 0),
            spaceBefore=3 * mm, spaceAfter=9 * mm,
        ),
        'Bridge': ParagraphStyle(
            'Bridge', **base, fontName=FONT_REGULAR, fontSize=9.6, leading=16, textColor=MUTED,
            borderColor=ACCENT, borderWidth=0.8, borderPadding=7,
            spaceBefore=8 * mm, spaceAfter=8 * mm,
        ),
        'ColophonTitle': ParagraphStyle(
            'ColophonTitle', **base, fontName=FONT_BOLD, fontSize=19, leading=28, textColor=INK,
            alignment=TA_CENTER, spaceAfter=10 * mm,
        ),
        'Colophon': ParagraphStyle(
            'Colophon', **base, fontName=FONT_REGULAR, fontSize=9.5, leading=17, textColor=MUTED,
            alignment=TA_CENTER, spaceAfter=4 * mm,
        ),
        'Toc0': ParagraphStyle(
            'Toc0', **base, fontName=FONT_BOLD, fontSize=11.5, leading=18,
            leftIndent=0, firstLineIndent=0, spaceBefore=4 * mm,
        ),
        'Toc1': ParagraphStyle(
            'Toc1', **base, fontName=FONT_REGULAR, fontSize=10, leading=16, leftIndent=5 * mm,
            firstLineIndent=0, spaceBefore=1.5 * mm,
        ),
        'Toc2': ParagraphStyle(
            'Toc2', **base, fontName=FONT_REGULAR, fontSize=8.5, leading=14, leftIndent=12 * mm,
            firstLineIndent=0, textColor=MUTED,
        ),
    }


class CoverPage(Flowable):
    def __init__(self, image_path: Path):
        super().__init__()
        self.image = ImageReader(str(image_path))
        self.width = PAGE_WIDTH
        self.height = PAGE_HEIGHT

    def wrap(self, available_width: float, available_height: float) -> tuple[float, float]:
        return available_width, available_height

    def draw(self) -> None:
        self.canv.drawImage(
            self.image,
            0,
            0,
            width=PAGE_WIDTH,
            height=PAGE_HEIGHT,
            preserveAspectRatio=False,
            mask='auto',
        )


class QaBookDocTemplate(BaseDocTemplate):
    def __init__(self, output_path: Path, model: dict):
        self.model = model
        self.current_chapter = ''
        self.current_short_title = ''
        super().__init__(
            str(output_path),
            pagesize=A5,
            leftMargin=17 * mm,
            rightMargin=17 * mm,
            topMargin=18 * mm,
            bottomMargin=19 * mm,
            title=model['title'],
            author='巴菲特知识库编辑部',
            subject=model['subtitle'],
            creator='巴菲特知识库',
            lang='zh-CN',
        )

        cover_frame = Frame(0, 0, PAGE_WIDTH, PAGE_HEIGHT, id='cover-frame',
                            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        front_frame = Frame(
            19 * mm, 18 * mm, PAGE_WIDTH - 38 * mm, PAGE_HEIGHT - 37 * mm,
            id='front-frame', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        body_frame = Frame(
            17 * mm, 18 * mm, PAGE_WIDTH - 34 * mm, PAGE_HEIGHT - 37 * mm,
            id='body-frame', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates([
            PageTemplate(id='cover', frames=[cover_frame], onPage=self._cover_page),
            PageTemplate(id='front', frames=[front_frame], onPage=self._front_page),
            PageTemplate(id='part', frames=[front_frame], onPage=self._front_page),
            PageTemplate(id='body', frames=[body_frame], onPageEnd=self._body_page_end),
        ])

    def beforeDocument(self) -> None:
        self.current_chapter = ''
        self.current_short_title = ''

    def _set_metadata(self, canvas) -> None:
        canvas.setTitle(self.model['title'])
        canvas.setAuthor('巴菲特知识库编辑部')
        canvas.setSubject(self.model['subtitle'])
        canvas.setCreator('巴菲特知识库 · ReportLab')
        canvas.setKeywords('沃伦·巴菲特, 查理·芒格, 投资, 伯克希尔, 问答录')

    def _cover_page(self, canvas, doc) -> None:
        self._set_metadata(canvas)

    def _front_page(self, canvas, doc) -> None:
        self._set_metadata(canvas)
        if doc.page <= 1:
            return
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_REGULAR, 7.5)
        canvas.drawCentredString(PAGE_WIDTH / 2, 9.5 * mm, str(doc.page - 1))
        canvas.restoreState()

    def _body_page_end(self, canvas, doc) -> None:
        self._set_metadata(canvas)
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.35)
        canvas.line(17 * mm, PAGE_HEIGHT - 12.5 * mm, PAGE_WIDTH - 17 * mm, PAGE_HEIGHT - 12.5 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT_REGULAR, 7.2)
        header = self.model['title'] if doc.page % 2 == 0 else (self.current_short_title or self.model['title'])
        if doc.page % 2 == 0:
            canvas.drawString(17 * mm, PAGE_HEIGHT - 10.5 * mm, header)
            canvas.drawString(17 * mm, 9.5 * mm, str(doc.page - 1))
        else:
            canvas.drawRightString(PAGE_WIDTH - 17 * mm, PAGE_HEIGHT - 10.5 * mm, header)
            canvas.drawRightString(PAGE_WIDTH - 17 * mm, 9.5 * mm, str(doc.page - 1))
        canvas.restoreState()

    def afterFlowable(self, flowable: Flowable) -> None:
        level = getattr(flowable, '_outline_level', None)
        if level is None:
            return
        key = flowable._outline_key
        text = flowable._outline_text
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=level < 2)
        if getattr(flowable, '_include_toc', True):
            self.notify('TOCEntry', (level, text, self.page - 1, key))
        if level == 1:
            self.current_chapter = text
            self.current_short_title = getattr(flowable, '_short_title', text)


def outline_heading(
    text: str,
    style: ParagraphStyle,
    level: int,
    key: str,
    *,
    short_title: str | None = None,
) -> Paragraph:
    paragraph = Paragraph(f'<a name="{html.escape(key, quote=True)}"/>{html.escape(text)}', style)
    paragraph._outline_level = level
    paragraph._outline_key = key
    paragraph._outline_text = text
    paragraph._short_title = short_title or text
    paragraph._include_toc = True
    return paragraph


def question_lead(question: dict, styles: dict[str, ParagraphStyle]) -> KeepTogether:
    heading = Paragraph(
        f'<a name="{html.escape(question["id"], quote=True)}"/>{html.escape(question["title"])}',
        styles['Question'],
    )
    return KeepTogether([
        Paragraph(f'第 {question["number"]} 问', styles['QuestionNumber']),
        heading,
        Paragraph('原始提问', styles['SourceQuestionLabel']),
        Paragraph(html.escape(question['sourceQuestion']), styles['SourceQuestion']),
    ])


def source_paragraph(question: dict, styles: dict[str, ParagraphStyle]) -> Paragraph:
    source = question['source']
    links = [link(source['internalUrl'], '站内中文原文')]
    if source.get('externalUrl'):
        links.append(link(source['externalUrl'], '英文核验来源'))
    location = f'<br/>{html.escape(source["locator"])}' if source.get('locator') else ''
    value = (
        f'<b>{source["year"]} · {html.escape(source["venue"])}</b> · '
        f'{" · ".join(links)}{location}<br/>'
        f'回答者：{html.escape(source["speakers"])} · 版本：{html.escape(source["status"])}'
    )
    return Paragraph(value, styles['SourceMeta'])


def build_story(model: dict, cover_path: Path, styles: dict[str, ParagraphStyle]) -> list[Flowable]:
    story: list[Flowable] = [
        CoverPage(cover_path),
        NextPageTemplate('front'),
        PageBreak(),
        Spacer(1, 36 * mm),
        Paragraph(html.escape(model['title']), styles['Title']),
        Paragraph(html.escape(model['subtitle']), styles['Subtitle']),
        Spacer(1, 12 * mm),
        Paragraph('巴菲特知识库编辑部 编选', styles['CenterMeta']),
        Spacer(1, 48 * mm),
        Paragraph('4 篇 · 10 章 · 50 节 · 300 问', styles['CenterMeta']),
        PageBreak(),
        Paragraph('目录', styles['ContentsTitle']),
    ]

    toc = TableOfContents()
    toc.levelStyles = [styles['Toc0'], styles['Toc1'], styles['Toc2']]
    toc.dotsMinLevel = 0
    story.extend([toc, Spacer(1, 8 * mm)])

    for part_index, part in enumerate(model['parts']):
        story.extend([NextPageTemplate('part'), PageBreak(), Spacer(1, 45 * mm)])
        story.append(Paragraph(f'第 {part["order"]} 篇', styles['PartNumber']))
        story.append(outline_heading(
            part['title'], styles['Part'], 0, part['id'], short_title=part['title'],
        ))
        story.append(Spacer(1, 7 * mm))
        for chapter in part['chapters']:
            story.append(Paragraph(
                f'第 {chapter["order"]} 章　{html.escape(chapter["title"])}',
                styles['PartChapter'],
            ))
        story.extend([NextPageTemplate('body'), PageBreak()])

        for chapter_index, chapter in enumerate(part['chapters']):
            if chapter_index > 0:
                story.append(PageBreak())
            story.append(Paragraph(f'第 {chapter["order"]} 章 · 30 问', styles['ChapterNumber']))
            story.append(outline_heading(
                chapter['title'], styles['Chapter'], 1, chapter['id'],
                short_title=chapter['shortTitle'],
            ))
            story.append(Paragraph(html.escape(chapter['subtitle']), styles['ChapterSubtitle']))
            story.append(Paragraph('编者导读', styles['EditorLabel']))
            story.append(Paragraph(html.escape(chapter['introduction']), styles['EditorText']))

            for movement in chapter['movements']:
                story.append(CondPageBreak(38 * mm))
                story.append(Paragraph(f'第 {movement["order"]} 节', styles['MovementNumber']))
                story.append(outline_heading(
                    movement['title'], styles['Movement'], 2,
                    f'{chapter["id"]}-{movement["id"]}',
                    short_title=chapter['shortTitle'],
                ))
                for question in movement['questions']:
                    story.append(CondPageBreak(43 * mm))
                    story.append(question_lead(question, styles))
                    for raw_paragraph in re.split(r'\r?\n\s*\r?\n', question['body'].strip()):
                        if raw_paragraph:
                            story.append(Paragraph(inline_markdown(raw_paragraph), styles['Answer']))
                    story.append(source_paragraph(question, styles))

            story.append(Paragraph(
                f'<b>编者过桥</b><br/>{html.escape(chapter["closing"])}',
                styles['Bridge'],
            ))

    story.extend([
        NextPageTemplate('front'),
        PageBreak(),
        Spacer(1, 36 * mm),
        Paragraph('版权与来源说明', styles['ColophonTitle']),
        Paragraph('巴菲特知识库编辑部编选。', styles['Colophon']),
        Paragraph(
            '本书所收回答来自公开的伯克希尔股东大会与访谈材料；中文内容为站内译稿与整理稿，英文材料仅用于核验与链接。',
            styles['Colophon'],
        ),
        Paragraph(link(f'{model["siteUrl"]}/books/buffett-wenda-lu/', f'{model["siteUrl"]}/books/buffett-wenda-lu/'), styles['Colophon']),
    ])
    return story


def render(model_path: Path, output_path: Path, cover_path: Path) -> None:
    register_fonts()
    model = json.loads(model_path.read_text(encoding='utf-8'))
    styles = make_styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = QaBookDocTemplate(output_path, model)
    story = build_story(model, cover_path, styles)
    doc.multiBuild(story, maxPasses=6)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit('usage: render-qa-book-pdf.py <book.json> <output.pdf> <cover.jpg>')
    render(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))


if __name__ == '__main__':
    main()

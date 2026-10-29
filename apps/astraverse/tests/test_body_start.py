import pytest
from fastapi import HTTPException
from astraverse.modules.resources.reading import body_start, chapter_position


def test_skips_toc_and_preface():
    front = '版权信息\n目录\n第一章 开始\n第二章 后来\n前言\n' + '这是前言。' * 50 + '\n'
    body = '第一章 开始\n' + '这是正式故事中的连续正文内容。' * 20 + '\n第二章 后来\n'
    assert body_start(front + body) == len(front)


def test_unknown_body_is_not_guessed():
    with pytest.raises(HTTPException) as exc:
        body_start('目录\n第一章 开始\n第二章 后来\n')
    assert exc.value.status_code == 409


def test_chapter_number_not_list_index():
    text = '目录\n第十章 开始\n第十二章 后来\n'
    start = len(text)
    text += '第十章 开始\n' + '这是连续正文内容。' * 30 + '\n第十二章 后来\n' + '这是后续正文。' * 30
    assert chapter_position(text, 10) == start
    with pytest.raises(HTTPException):
        chapter_position(text, 1)

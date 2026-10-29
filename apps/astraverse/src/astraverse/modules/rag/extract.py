import io
import re
import zipfile
from xml.etree import ElementTree as ET
from fastapi import HTTPException

MAX_TEXT=10_000_000


def sections_from_text(text):
    from astraverse.modules.resources.reading import chapters
    headings=chapters(text)
    headings += [{'title':m.group().lstrip('# ').strip(),'offset':m.start()} for m in re.finditer(r'(?m)^#{1,6}\s+[^\n]{1,120}$',text)]
    headings=sorted({h['offset']:h for h in headings}.values(),key=lambda h:h['offset'])
    if not headings or headings[0]['offset']>0:headings.insert(0,{'title':'正文','offset':0})
    return [{'title':h['title'],'text':text[h['offset']:headings[i+1]['offset'] if i+1<len(headings) else len(text)],'position':{'offset':h['offset'],'chapter':h['title']}} for i,h in enumerate(headings)]


def extract(raw,filename):
    extension=filename.rsplit('.',1)[-1].lower()
    if extension in ('txt','md','epub'):
        from astraverse.modules.resources.reading import extract as book_extract
        return sections_from_text(book_extract(raw,filename))
    try:
        if extension=='pdf':
            from pypdf import PdfReader
            reader=PdfReader(io.BytesIO(raw))
            if reader.is_encrypted:raise ValueError('暂不支持加密PDF')
            if len(reader.pages)>2000:raise ValueError('PDF最多2000页')
            sections=[];total=0
            for i,page in enumerate(reader.pages):
                text=page.extract_text() or '';total+=len(text)
                if total>MAX_TEXT:raise ValueError('正文超过一千万字')
                if text.strip():sections.append({'title':f'第{i+1}页','text':text,'position':{'page':i+1}})
            if not sections:raise ValueError('PDF未提取到文字，扫描文件请先OCR后重新导入')
            return sections
        if extension=='docx':
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if sum(i.file_size for i in archive.infolist())>40*1024*1024 or archive.getinfo('word/document.xml').file_size>20*1024*1024:raise ValueError('DOCX解压内容过大')
                root=ET.fromstring(archive.read('word/document.xml'))
            text='\n'.join(''.join(n.text or '' for n in paragraph.iter() if n.tag.endswith('}t')) for paragraph in root.iter() if paragraph.tag.endswith('}p'))
            if not text.strip():raise ValueError('DOCX没有可检索正文')
            if len(text)>MAX_TEXT:raise ValueError('正文超过一千万字')
            return sections_from_text(text)
        if extension in ('srt','vtt'):
            from astraverse.modules.resources.reading import decode
            text=decode(raw)
            stamp=r'(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}'
            pattern=re.compile(r'('+stamp+r')\s*-->\s*('+stamp+r')[^\n]*\n(.*?)(?=\n\s*\n|\Z)',re.S)
            def seconds(value):
                parts=value.replace(',','.').split(':')
                return sum(float(v)*60**i for i,v in enumerate(reversed(parts)))
            sections=[{'title':f'{m[1]} – {m[2]}','text':re.sub(r'<[^>]+>','',m[3]).strip(),'position':{'time':seconds(m[1]),'time_end':seconds(m[2])}} for m in pattern.finditer(text)]
            if not sections:raise ValueError('字幕没有有效时间轴或正文')
            return sections
    except HTTPException:raise
    except Exception as exc:raise HTTPException(422,str(exc)[:160] if isinstance(exc,ValueError) else '文件解析失败，请检查文件格式') from exc
    raise HTTPException(422,'支持TXT、Markdown、EPUB、文字PDF、DOCX和SRT/VTT字幕')


def chunks(sections):
    for section in sections:
        text=section['text'];start=0
        while start<len(text):
            end=min(len(text),start+900)
            if end<len(text):
                boundary=max(text.rfind(c,start+600,end) for c in ('\n','。','！','？','. '))
                if boundary>=start+600:end=boundary+1
            piece=text[start:end];left=len(piece)-len(piece.lstrip());content=piece.strip()
            if content:
                position={**section['position'],'offset':section['position'].get('offset',0)+start+left,'end':section['position'].get('offset',0)+end}
                yield content,section['title'],position
            if end==len(text):break
            start=max(start+1,end-100)

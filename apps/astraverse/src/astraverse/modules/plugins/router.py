"""Allowlisted local plugins; no downloaded code or arbitrary shell execution."""
from __future__ import annotations
import ast
import asyncio
import json
import math
import operator
import os
import platform
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from astraverse.core.paths import DATA_DIR
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

ROOT = DATA_DIR
CONFIG = ROOT / 'plugins.json'
WORKSPACE = ROOT / 'plugin-workspace'
router = APIRouter(prefix='/api/plugins', tags=['Plugins'])
CATALOG = [
    dict(id='clock',name='时间与日期',description='读取本机日期、时间和时区。',permissions=['读取系统时间'],tools=['clock.now']),
    dict(id='calculator',name='计算器',description='在本机计算四则运算、括号及有限次方。',permissions=['本地计算'],tools=['calculator.evaluate']),
    dict(id='notes',name='本地便签',description='保存和读取自己的便签；同名保存会覆盖。',permissions=['读写专用便签目录'],tools=['notes.list','notes.read','notes.save']),
    dict(id='workspace',name='工作文件夹',description='列出、读取专用文件夹内的文本，不访问其他目录。',permissions=['读取专用工作文件夹'],tools=['workspace.list','workspace.read']),
    dict(id='system',name='系统信息',description='读取操作系统、架构、Python 版本和专用目录磁盘空间。',permissions=['读取系统概况'],tools=['system.info']),
    dict(id='computer',name='电脑操作 · Computer Use',description='通过本机桥接器查看主屏幕、点击、输入、按键、滚动和打开网页；需要界面启动15分钟会话。',permissions=['读取主屏幕','控制鼠标键盘','打开网页'],tools=['computer.status','computer.screenshot','computer.click','computer.type','computer.key','computer.scroll','computer.open_url','computer.history']),
    dict(id='clipboard',name='系统剪贴板',description='读取或替换系统剪贴板文本。当前支持 macOS。',permissions=['读取剪贴板内容','替换剪贴板内容'],tools=['clipboard.read','clipboard.write']),
]
DEFAULT = {'clock':True,'calculator':True}
write_lock = asyncio.Lock()

class Settings(BaseModel):
    model_config=ConfigDict(extra='forbid')
    enabled: bool

class Invocation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    tool: str = Field(max_length=80)
    arguments: dict[str,Any] = Field(default_factory=dict)

class Empty(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Expression(Empty):
    expression: str = Field(min_length=1,max_length=200)

class FileName(Empty):
    name: str = Field(min_length=1,max_length=100,pattern=r'^[\w\- .\u4e00-\u9fff]+$')

class Note(FileName):
    text: str = Field(max_length=20000)

class Text(Empty):
    text: str = Field(max_length=20000)

SCHEMAS={'clock.now':Empty,'calculator.evaluate':Expression,'notes.list':Empty,'notes.read':FileName,'notes.save':Note,'workspace.list':Empty,'workspace.read':FileName,'system.info':Empty,'clipboard.read':Empty,'clipboard.write':Text}

from astraverse.modules.computer.service import SCHEMAS as COMPUTER_SCHEMAS
SCHEMAS.update(COMPUTER_SCHEMAS)

def settings():
    if not CONFIG.exists(): return dict(DEFAULT)
    try:
        data=json.loads(CONFIG.read_text())
        if not isinstance(data,dict) or any(type(v) is not bool for v in data.values()): raise ValueError()
        return {**DEFAULT,**data}
    except (ValueError,OSError): raise HTTPException(503,'插件配置不可读取，请检查本地 plugins.json')

def inventory():
    enabled=settings()
    return {'plugins':[{**p,'enabled':enabled.get(p['id'],False),'supported':p['id'] not in ('clipboard','computer') or platform.system()=='Darwin'} for p in CATALOG], 'workspace':str(WORKSPACE), 'installation':'bundled-only','tools':tool_catalog()}

@router.get('')
async def list_plugins(): return inventory()

@router.put('/{plugin_id}')
async def set_plugin(plugin_id:str, body:Settings):
    if plugin_id not in {p['id'] for p in CATALOG}: raise HTTPException(404,'未知插件')
    if body.enabled and plugin_id in ('clipboard','computer') and platform.system()!='Darwin': raise HTTPException(409,'当前系统不支持此插件')
    async with write_lock:
        data=settings();data[plugin_id]=body.enabled
        ROOT.mkdir(parents=True,exist_ok=True)
        fd,path=tempfile.mkstemp(dir=ROOT,prefix='.plugins-')
        try:
            with os.fdopen(fd,'w') as f: json.dump(data,f,ensure_ascii=False)
            os.replace(path,CONFIG)
        finally:
            if os.path.exists(path): os.unlink(path)
    if plugin_id=='computer' and not body.enabled:
        from astraverse.modules.computer.service import stop
        stop()
    return inventory()

def tool_catalog():
    enabled=settings()
    return [{'name':tool,'plugin':p['id'],'enabled':enabled.get(p['id'],False),'inputSchema':SCHEMAS[tool].model_json_schema()} for p in CATALOG for tool in p['tools']]

def location(name:str, notes=False):
    base=WORKSPACE / 'notes' if notes else WORKSPACE
    if base.is_symlink() or WORKSPACE.is_symlink(): raise HTTPException(403,'专用目录不能是符号链接')
    base.mkdir(parents=True,exist_ok=True)
    target=base/name
    if name in ('.','..') or target.is_symlink() or target.resolve().parent!=base.resolve(): raise HTTPException(403,'只允许访问专用目录中的普通文件')
    return target

def calculate(expression:str):
    operations={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Mod:operator.mod,ast.Pow:operator.pow}
    nodes=ast.parse(expression,mode='eval')
    if len(list(ast.walk(nodes)))>80: raise ValueError('表达式过于复杂')
    def visit(node):
        if isinstance(node,ast.Constant) and type(node.value) in (int,float): value=node.value
        elif isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)): value=visit(node.operand)*(1 if isinstance(node.op,ast.UAdd) else -1)
        elif isinstance(node,ast.BinOp) and type(node.op) in operations:
            left,right=visit(node.left),visit(node.right)
            if isinstance(node.op,ast.Pow) and abs(right)>12: raise ValueError('次方范围为 -12 至 12')
            value=operations[type(node.op)](left,right)
        else: raise ValueError('仅支持数字、括号和 + - * / % **')
        if not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>1e100: raise ValueError('结果超出范围')
        return value
    return visit(nodes.body)

async def invoke(tool:str, arguments:dict):
    plugin=next((p for p in CATALOG if tool in p['tools']),None)
    if not plugin: raise HTTPException(404,'未知插件工具')
    if not settings().get(plugin['id'],False): raise HTTPException(403,f'请先在设置中启用「{plugin["name"]}」插件')
    try: args=SCHEMAS[tool].model_validate(arguments)
    except ValueError: raise HTTPException(422,'插件参数不符合规范')
    try:
        if plugin['id']=='computer':
            from astraverse.modules.computer.service import invoke as computer_invoke
            return {'plugin':'computer','tool':tool,'result':await computer_invoke(tool,arguments)}
        if tool=='clock.now': result={'datetime':datetime.now().astimezone().isoformat(timespec='seconds')}
        elif tool=='calculator.evaluate': result={'expression':args.expression,'value':calculate(args.expression)}
        elif tool=='system.info':
            ROOT.mkdir(exist_ok=True);disk=shutil.disk_usage(ROOT)
            result={'os':platform.system(),'release':platform.release(),'architecture':platform.machine(),'python':platform.python_version(),'disk_free_bytes':disk.free}
        elif tool in ('workspace.list','notes.list'):
            base=location('_',tool.startswith('notes.')).parent
            result={'files':[{'name':p.name,'bytes':p.stat().st_size} for p in sorted(base.iterdir()) if p.is_file() and not p.is_symlink()][:200]}
        elif tool in ('notes.read','workspace.read'):
            path=location(args.name,tool.startswith('notes.'))
            if not path.is_file(): raise HTTPException(404,'文件不存在')
            if path.stat().st_size>65536: raise HTTPException(413,'仅支持读取 64KB 以内的 UTF-8 文本')
            result={'name':args.name,'text':path.read_text(encoding='utf-8')}
        elif tool=='notes.save':
            path=location(args.name,True)
            fd,temp=tempfile.mkstemp(dir=path.parent,prefix='.note-')
            try:
                with os.fdopen(fd,'w') as f:f.write(args.text)
                os.replace(temp,path)
            finally:
                if os.path.exists(temp):os.unlink(temp)
            result={'name':args.name,'saved':True}
        else:
            if platform.system()!='Darwin':raise HTTPException(409,'剪贴板插件仅支持 macOS')
            proc=await asyncio.create_subprocess_exec('/usr/bin/pbpaste' if tool=='clipboard.read' else '/usr/bin/pbcopy',stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
            try: output,_=await asyncio.wait_for(proc.communicate(args.text.encode() if tool=='clipboard.write' else None),timeout=3)
            except asyncio.TimeoutError:
                proc.kill();await proc.wait();raise HTTPException(504,'剪贴板访问超时')
            if proc.returncode:raise HTTPException(503,'剪贴板不可用')
            result={'text':output[:60000].decode('utf-8',errors='replace'),'truncated':len(output)>60000} if tool=='clipboard.read' else {'written':True}
        return {'plugin':plugin['id'],'tool':tool,'result':result}
    except HTTPException: raise
    except (ValueError,SyntaxError,ArithmeticError,UnicodeError): raise HTTPException(422,'无法处理该表达式或文本文件')
    except OSError: raise HTTPException(503,'无法访问插件的本地资源')

@router.post('/execute')
async def execute_plugin(body:Invocation):return await invoke(body.tool,body.arguments)

async def chat_command(message:str):
    """Explicit bounded commands only; no inferred writes or model-generated code."""
    msg=message.strip();tool=None;args={}
    if re.fullmatch(r'(现在)?(几点(了|钟)?|什么时间|今天几号|今天是什么日期)[？?]?',msg):tool='clock.now'
    elif msg.startswith(('计算 ','计算一下 ')):
        tool='calculator.evaluate';args={'expression':msg.split(' ',1)[1]}
    elif msg in ('查看系统信息','系统信息'):tool='system.info'
    elif msg in ('读取剪贴板','查看剪贴板'):tool='clipboard.read'
    elif msg.startswith('复制到剪贴板：'):tool='clipboard.write';args={'text':msg.split('：',1)[1]}
    elif msg in ('列出便签','查看便签列表'):tool='notes.list'
    elif msg.startswith('读取便签：'):tool='notes.read';args={'name':msg.split('：',1)[1].strip()}
    elif msg.startswith('保存便签：') and '\n' in msg:
        name,text=msg.split('：',1)[1].split('\n',1);tool='notes.save';args={'name':name.strip(),'text':text}
    elif msg in ('列出工作文件','查看工作文件夹'):tool='workspace.list'
    elif msg.startswith('读取工作文件：'):tool='workspace.read';args={'name':msg.split('：',1)[1].strip()}
    if not tool:return None
    try:
        result=await invoke(tool,args)
        value=result['result']
        reply=('现在是 '+value['datetime']+'。') if tool=='clock.now' else ('计算结果是 '+str(value['value'])+'。') if tool=='calculator.evaluate' else ('便签「'+value['name']+'」已保存。') if tool=='notes.save' else '已复制到剪贴板。' if tool=='clipboard.write' else ('目前的文件有：\n'+'\n'.join(p['name'] for p in value['files']) if value['files'] else '这里还没有文件。') if 'files' in value else value['text'] if 'text' in value else json.dumps(value,ensure_ascii=False,indent=2)
        return {'reply':reply or '内容为空。','plugin_result':result,'mode':'plugin'}
    except HTTPException as exc:return {'reply':str(exc.detail),'mode':'plugin','plugin_error':True}

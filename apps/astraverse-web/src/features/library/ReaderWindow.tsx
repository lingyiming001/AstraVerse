import { useEffect, useState } from 'react';
import BookPreview from './BookPreview';
import { readLocalResources } from './localResources';
import type { Resource } from './resources';
import './readerWindow.css';
import { useWorld } from '@/shared/state/workspaceStore';
import Stage from '@/features/stage/Stage';

function ResourceContent({resource}: {resource: Resource}) {
  const [text,setText] = useState('');
  const [error,setError] = useState('');
  useEffect(() => {
    if (resource.kind === 'character') useWorld.setState({modelUrl:resource.url || null,character:resource.characterIndex ?? 0,characterVisible:true});
    if (resource.kind === 'scene') useWorld.setState({sceneUrl:resource.url || null,world:resource.preset || 'lunar',sceneVisible:true,characterVisible:false});
    if (resource.kind !== 'lyrics' || !resource.url) return;
    const controller = new AbortController();
    void fetch(resource.url,{signal:controller.signal}).then(async r => {
      if (!r.ok) throw new Error('文件读取失败');
      const blob=await r.blob(); if(blob.size>5*1024*1024) throw new Error('文件超过5MB，请下载原文件查看');
      return blob.text();
    }).then(setText).catch(e => { if(!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  },[resource]);
  if(resource.kind === 'book') return <BookPreview resource={resource}/>;
  if(resource.kind === 'image') return <img src={resource.url} alt={resource.name} style={{maxWidth:'100%',maxHeight:'85dvh',objectFit:'contain'}}/>;
  if(resource.kind === 'video') return <video controls src={resource.url} style={{width:'100%',maxHeight:'85dvh'}}/>;
  if(resource.kind === 'music') return <audio controls src={resource.url} style={{width:'100%'}}/>;
  if(resource.kind === 'character' || resource.kind === 'scene') return <div style={{height:'85dvh',position:'relative'}}><Stage clean onSceneSelect={()=>{}}/></div>;
  return error ? <p role="alert">{error}</p> : <pre style={{whiteSpace:'pre-wrap'}}>{text || '正在读取…'}</pre>;
}

export default function ReaderWindow() {
  const [resource, setResource] = useState<Resource | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, objectUrl = '';
    const params = new URLSearchParams(location.search);
    const actor = params.get('agent');
    if (actor && /^[a-zA-Z0-9_-]{1,120}$/.test(actor)) useWorld.setState({actorId:actor});
    void readLocalResources().then(resources => {
      if (disposed) return;
      const saved = resources.find(r => r.id === params.get('book'));
      if (saved) {
        objectUrl = URL.createObjectURL(saved.blob);
        const {blob: _blob, ...metadata} = saved;
        setResource({...metadata, url:objectUrl + (saved.kind === 'character' && /\.zip$/i.test(saved.filename || '') ? '#live2d' : '')});
        document.title = `${saved.name} · 独立预览`;
        return;
      }
      const raw = params.get('file') || '';
      const kind = params.get('kind') || 'book';
      if (!['book','image','video','music','lyrics','character','scene'].includes(kind)) throw new Error('不支持的资源类型');
      const url = raw ? new URL(raw,location.origin) : null;
      if (url && (url.origin !== location.origin || !['blob:','http:','https:'].includes(url.protocol))) throw new Error('资源地址无效，请从列表重新打开。');
      if (!raw && kind !== 'scene' && kind !== 'character') throw new Error('文件不可用，请重新导入。');
      const preset=params.get('preset');
      setResource({id:params.get('book') || '',name:params.get('title') || '资源预览',filename:params.get('filename') || '',kind:kind as Resource['kind'],source:'upload',description:'',url:raw || undefined,preset: preset === 'lunar' || preset === 'aurora' || preset === 'sunset' ? preset : undefined,characterIndex:Number(params.get('characterIndex')) || 0});
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : '书籍打开失败'); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);
  return <div className="reader-window">
    <header><strong>{resource?.name || '独立预览窗口'}</strong><span>{resource?.kind === 'book' ? '朗读控制需要主页面保持运行' : '独立预览 · 播放由你控制'}</span></header>
    {error ? <p role="alert">{error}</p> : resource ? <ResourceContent resource={resource} /> : <p role="status">正在打开资源…</p>}
  </div>;
}

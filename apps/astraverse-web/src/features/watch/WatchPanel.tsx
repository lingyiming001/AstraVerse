import { useEffect, useRef, useState } from "react";
import { parseVideoUrl, type WatchSource } from "./source";
import { useWatch, type ViewingContext } from "./watchStore";
import { parseSubtitles, subtitleAt, type SubtitleCue } from "./subtitles";
import "./watch.css";
export default function WatchPanel({active,busy,onDiscuss,onPauseMusic}:{active:boolean;busy:boolean;onDiscuss:(text:string,view:ViewingContext)=>void;onPauseMusic:()=>void}) {
  const {open,resource}=useWatch();
  const [source,setSource]=useState<WatchSource|null>(null);
  const [link,setLink]=useState("");
  const [error,setError]=useState("");
  const [sharing,setSharing]=useState(false);
  const [question,setQuestion]=useState("这一幕你怎么看？");
  const [cues,setCues]=useState<SubtitleCue[]>([]);
  const [subtitleSource,setSubtitleSource]=useState<"platform"|"file"|null>(null);
  const [subtitleStatus,setSubtitleStatus]=useState("");
  const [subtitleTime,setSubtitleTime]=useState(0);
  const [subtitleExpanded,setSubtitleExpanded]=useState(false);
  const video=useRef<HTMLVideoElement>(null),shared=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null),ownedUrl=useRef<string|null>(null);
  const generation=useRef(0);
  const platformRequest=useRef<AbortController|null>(null);
  function stopShare(){generation.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(shared.current)shared.current.srcObject=null;setSharing(false);}
  function cleanup(){stopShare();video.current?.pause();if(ownedUrl.current){URL.revokeObjectURL(ownedUrl.current);ownedUrl.current=null;}useWatch.setState({context:null});}
  function choose(next:WatchSource){cleanup();setError("");setSource(next);setCues([]);setSubtitleSource(null);setSubtitleStatus("");setSubtitleTime(0);setSubtitleExpanded(next.kind==="bilibili");onPauseMusic();useWatch.setState({context:{title:next.title}});}
  useEffect(()=>{if(open&&resource?.url)choose({kind:"file",url:resource.url,title:resource.name.slice(0,180)});},[resource,open]);
  useEffect(()=>{if(!active||!open){stopShare();video.current?.pause();useWatch.setState({context:null});}},[active,open]);
  useEffect(()=>{
    if(!source||!active||!open)return;
    const subtitle=subtitleAt(cues,subtitleTime);
    useWatch.setState({context:{title:source.title,current_time:subtitleTime,...(subtitle?{subtitle,subtitle_source:subtitleSource||undefined}:{})}});
  },[source,active,open,cues,subtitleTime,subtitleSource]);
  useEffect(()=>{
    if(source?.kind!=="bilibili")return;
    if(!source.bvid){setSubtitleStatus("av 链接暂不支持自动读取字幕，请导入 SRT/VTT。");return;}
    const controller=new AbortController();
    platformRequest.current=controller;
    setSubtitleStatus("正在读取 B 站公开字幕…");
    fetch(`/api/watch/bilibili-subtitles?bvid=${encodeURIComponent(source.bvid)}&p=${source.part||1}`,{signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.detail||"平台字幕读取失败");return data;})
      .then((data:{status:string;reason?:string;language?:string;cues?:SubtitleCue[]})=>{
        if(controller.signal.aborted)return;
        if(data.status==="ready"&&data.cues?.length){setCues(data.cues);setSubtitleSource("platform");setSubtitleStatus(`已接入平台字幕${data.language?` · ${data.language}`:""} · ${data.cues.length} 条`);}
        else setSubtitleStatus(data.reason||"当前视频未提供公开字幕，可导入 SRT/VTT。");
      }).catch(error=>{if(!controller.signal.aborted)setSubtitleStatus(`平台字幕读取失败：${error.message}。可导入 SRT/VTT。`);});
    return ()=>{controller.abort();if(platformRequest.current===controller)platformRequest.current=null;};
  },[source]);
  useEffect(()=>()=>{generation.current++;stream.current?.getTracks().forEach(t=>t.stop());if(ownedUrl.current)URL.revokeObjectURL(ownedUrl.current);useWatch.setState({context:null});},[]);
  async function share(){
    const epoch=++generation.current;setError("");
    try{
      if(!navigator.mediaDevices?.getDisplayMedia)throw new Error("此浏览器不支持共享画面，请使用本地视频或支持标签页共享的浏览器");
      const media=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:"browser"},audio:false});
      if(epoch!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=media;
      if(shared.current){shared.current.srcObject=media;await shared.current.play();}
      media.getVideoTracks()[0]?.addEventListener("ended",()=>{if(stream.current===media)stopShare();},{once:true});
      setSharing(true);onPauseMusic();
    }catch(e){if(epoch===generation.current){stopShare();setError(e instanceof Error?e.message:"未能共享画面");}}
  }
  function discuss(){
    const media=sharing?shared.current:source?.kind==="file"||source?.kind==="direct"?video.current:null;
    setError("");
    const subtitle=subtitleAt(cues,subtitleTime);
    const base:ViewingContext={title:source?.title||"共享的视频标签页",current_time:subtitleTime,...(subtitle?{subtitle,subtitle_source:subtitleSource||undefined}:{})};
    if(!media||media.readyState<2||!media.videoWidth){
      if(subtitle){onDiscuss(question.trim()||"这一段字幕你怎么看？",base);return;}
      setError("请先播放本地视频、共享视频标签页，或接入当前时间附近的字幕，再与角色讨论。");return;
    }
    try{
      const canvas=document.createElement("canvas"),scale=Math.min(1,768/media.videoWidth,768/media.videoHeight);
      canvas.width=Math.max(1,Math.round(media.videoWidth*scale));canvas.height=Math.max(1,Math.round(media.videoHeight*scale));
      canvas.getContext("2d")!.drawImage(media,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL("image/jpeg",.72).split(",")[1];
      onDiscuss(question.trim()||"这一幕你怎么看？",{...base,...(!sharing?{current_time:media.currentTime}:{}),frame:{mime:"image/jpeg",data}});
    }catch{setError("此视频禁止跨站读取画面。请点“共享视频标签页”后再试。");}
  }
  if(!open)return null;
  const currentSubtitle=subtitleAt(cues,subtitleTime);
  function openLink(){try{choose(parseVideoUrl(link));}catch(e){setError((e as Error).message);}}
  return <section className="watch-panel" aria-label="视频陪看">
    <header className="watch-header">
      <div><span className="watch-eyebrow">WATCH TOGETHER</span><h2>视频陪看</h2><p>选一段视频，和角色边看边聊。</p></div>
      <button className="watch-end" onClick={()=>{cleanup();setSource(null);useWatch.setState({open:false,resource:null});}}>结束陪看</button>
    </header>

    <div className="watch-source" aria-label="选择视频来源">
      <div className="watch-section-heading"><span className="watch-step">01</span><strong>选择视频</strong><span>支持 B 站、视频直链及本地文件</span></div>
      <div className="watch-source-row">
        <form className="watch-link-form" onSubmit={e=>{e.preventDefault();openLink();}}>
          <input aria-label="视频或网页链接" value={link} onChange={e=>setLink(e.target.value)} placeholder="粘贴 B 站或视频链接" type="text" inputMode="url"/>
          <button type="submit">打开链接</button>
        </form>
        <span className="watch-or" aria-hidden="true">或</span>
        <label className="watch-file">选择本地视频<input aria-label="打开本地视频" type="file" accept="video/*,.mp4,.webm,.mkv,.mov,.m4v" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith("video/")&&!/\.(mp4|webm|mkv|mov|m4v|ogv)$/i.test(file.name)){setError("请选择视频文件");return;}const url=URL.createObjectURL(file);choose({kind:"file",url,title:file.name.slice(0,180)});ownedUrl.current=url;e.target.value="";}}/></label>
      </div>
    </div>

    <div className={`watch-player${sharing?" is-sharing":""}`}>
      {source&&active&&(source.kind==="file"||source.kind==="direct"?<video key={source.url} ref={video} src={source.url} controls playsInline preload="metadata" onPlay={onPauseMusic} onTimeUpdate={e=>setSubtitleTime(e.currentTarget.currentTime)} onError={()=>setError("视频无法播放。请检查链接、网络或编码；本地视频建议使用 MP4（H.264）或 WebM。")} />:<iframe key={source.url} title="陪看视频网页" src={source.url} allow="picture-in-picture; encrypted-media" allowFullScreen sandbox={source.kind==="bilibili"?undefined:"allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"} referrerPolicy="strict-origin-when-cross-origin"/>)}
      {!source&&!sharing&&<div className="watch-empty"><span className="watch-empty-mark" aria-hidden="true">▶</span><strong>视频将在这里播放</strong><span>打开链接或选择本地视频开始陪看</span></div>}
      <video ref={shared} muted playsInline className="watch-shared" aria-label="共享标签页预览"/>
      {currentSubtitle&&<div className="watch-subtitle" aria-live="polite">{currentSubtitle}</div>}
      {sharing&&<span className="watch-sharing-badge">正在共享标签页</span>}
    </div>

    <div className="watch-media-footer">
      <div className="watch-media-title"><span className={`watch-status-dot${source||sharing?" is-ready":""}`}/><span title={source?.title}>{source?.title|| (sharing?"共享的视频标签页":"等待选择视频")}</span>{source?.original&&<a href={source.original} target="_blank" rel="noopener noreferrer">原网页 ↗</a>}</div>
      <button className="watch-share" onClick={()=>sharing?stopShare():void share()}>{sharing?"停止共享":"共享视频标签页"}</button>
    </div>

    {source&&<details className="watch-subtitle-panel" open={subtitleExpanded} onToggle={e=>setSubtitleExpanded(e.currentTarget.open)}>
      <summary><span className="watch-step">02</span><strong>字幕与进度</strong><span className="watch-subtitle-summary">{cues.length?`已接入 ${cues.length} 条字幕`:"可选"}</span></summary>
      <div className="watch-subtitle-content">
        <p role="status">{subtitleStatus||"导入与视频对应的 SRT / VTT 字幕，让角色理解当前片段。"}</p>
        <div className="watch-subtitle-controls"><label className="watch-file watch-subtitle-file">导入 SRT / VTT<input aria-label="导入字幕文件" type="file" accept=".srt,.vtt,text/vtt" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{if(file.size>2_000_000)throw new Error("字幕文件不能超过 2 MB");const parsed=parseSubtitles(await file.text());platformRequest.current?.abort();setCues(parsed);setSubtitleSource("file");setSubtitleStatus(`已导入 ${parsed.length} 条字幕`);}catch(error){setSubtitleStatus((error as Error).message);}}}/></label>
          {source.kind==="bilibili"&&<label className="watch-time">播放器当前秒数<input aria-label="播放器当前秒数" type="number" min="0" step="1" value={Math.round(subtitleTime)} onChange={e=>setSubtitleTime(Math.max(0,Number(e.target.value)||0))}/></label>}
        </div>
        {source.kind==="bilibili"&&<p className="watch-helper">B 站播放器不会向此页面同步播放进度。讨论某一幕时，请填写播放器显示的时间。</p>}
      </div>
    </details>}

    <div className="watch-question">
      <div className="watch-section-heading"><span className="watch-step">{source?"03":"02"}</span><strong>和角色聊聊这一幕</strong></div>
      <label htmlFor="watch-question-input">想问角色什么？</label>
      <textarea id="watch-question-input" aria-label="陪看问题" value={question} maxLength={4000} rows={2} onChange={e=>setQuestion(e.target.value)} placeholder="例如：你觉得刚才那段怎么样？"/>
      <div className="watch-question-footer"><span>{sharing?"将发送当前共享画面":currentSubtitle?"将发送当前字幕与可读取的画面":"将发送当前可读取的画面"}</span><button className="watch-ask" disabled={busy||!active} onClick={discuss}>{busy?"角色正在回复…":"发送给角色"}</button></div>
    </div>

    {error&&<p className="watch-error" role="alert">{error}</p>}
    <details className="watch-help"><summary>播放与画面理解说明</summary><p>网页无法内嵌时，可在原网页播放并共享视频标签页。B 站短链接请先打开，再复制完整视频链接。画面讨论使用图片理解模型，可能产生费用；字幕只传当前时间附近的片段。没有画面时，角色仅依据当前字幕和你的描述回答，不读取音频或整段视频。</p></details>
  </section>;
}

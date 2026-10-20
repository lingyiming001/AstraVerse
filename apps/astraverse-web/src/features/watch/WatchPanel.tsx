import { useEffect, useRef, useState } from "react";
import { parseVideoUrl, type WatchSource } from "./source";
import { useWatch, type ViewingContext } from "./watchStore";
import "./watch.css";
export default function WatchPanel({active,busy,onDiscuss,onPauseMusic}:{active:boolean;busy:boolean;onDiscuss:(text:string,view:ViewingContext)=>void;onPauseMusic:()=>void}) {
  const {open,resource}=useWatch();
  const [source,setSource]=useState<WatchSource|null>(null);
  const [link,setLink]=useState("");
  const [error,setError]=useState("");
  const [sharing,setSharing]=useState(false);
  const [question,setQuestion]=useState("这一幕你怎么看？");
  const video=useRef<HTMLVideoElement>(null),shared=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null),ownedUrl=useRef<string|null>(null);
  const generation=useRef(0);
  function stopShare(){generation.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(shared.current)shared.current.srcObject=null;setSharing(false);}
  function cleanup(){stopShare();video.current?.pause();if(ownedUrl.current){URL.revokeObjectURL(ownedUrl.current);ownedUrl.current=null;}useWatch.setState({context:null});}
  function choose(next:WatchSource){cleanup();setError("");setSource(next);onPauseMusic();useWatch.setState({context:{title:next.title}});}
  useEffect(()=>{if(open&&resource?.url)choose({kind:"file",url:resource.url,title:resource.name.slice(0,180)});},[resource,open]);
  useEffect(()=>{if(!active||!open){stopShare();video.current?.pause();useWatch.setState({context:null});}else if(source){useWatch.setState({context:{title:source.title}});}},[active,open]);
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
    if(!media||media.readyState<2||!media.videoWidth){setError("请先播放本地视频，或共享正在播放视频的标签页，再聊当前画面。也可以直接在聊天框描述内容。");return;}
    try{
      const canvas=document.createElement("canvas"),scale=Math.min(1,768/media.videoWidth,768/media.videoHeight);
      canvas.width=Math.max(1,Math.round(media.videoWidth*scale));canvas.height=Math.max(1,Math.round(media.videoHeight*scale));
      canvas.getContext("2d")!.drawImage(media,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL("image/jpeg",.72).split(",")[1];
      onDiscuss(question.trim()||"这一幕你怎么看？",{title:source?.title||"共享的视频标签页",...(!sharing?{current_time:media.currentTime}:{}),frame:{mime:"image/jpeg",data}});
    }catch{setError("此视频禁止跨站读取画面。请点“共享视频标签页”后再试。");}
  }
  if(!open)return null;
  return <section className="watch-panel" aria-label="视频陪看">
    <header><div><h2>一起看视频</h2><p>视频在这里播放，角色在旁边陪你。</p></div><button onClick={()=>{cleanup();setSource(null);useWatch.setState({open:false,resource:null});}}>结束陪看</button></header>
    <div className="watch-inputs"><label className="watch-file">打开本地视频<input aria-label="打开本地视频" type="file" accept="video/*,.mp4,.webm,.mkv,.mov,.m4v" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith("video/")&&!/\.(mp4|webm|mkv|mov|m4v|ogv)$/i.test(file.name)){setError("请选择视频文件");return;}const url=URL.createObjectURL(file);choose({kind:"file",url,title:file.name.slice(0,180)});ownedUrl.current=url;e.target.value="";}}/></label>
      <input aria-label="视频或网页链接" value={link} onChange={e=>setLink(e.target.value)} placeholder="B站视频、视频直链或网页链接"/><button onClick={()=>{try{choose(parseVideoUrl(link));}catch(e){setError((e as Error).message);}}}>打开链接</button></div>
    {source&&active&&<div className="watch-player">{source.kind==="file"||source.kind==="direct"?<video key={source.url} ref={video} src={source.url} controls playsInline preload="metadata" onPlay={onPauseMusic} onTimeUpdate={e=>useWatch.setState({context:{title:source.title,current_time:e.currentTarget.currentTime}})} onError={()=>setError("视频无法播放。请检查链接、网络或编码；本地视频建议使用 MP4（H.264）或 WebM。")} />:<iframe key={source.url} title="陪看视频网页" src={source.url} allow="picture-in-picture; encrypted-media" allowFullScreen sandbox={source.kind==="bilibili"?undefined:"allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"} referrerPolicy="strict-origin-when-cross-origin"/>}</div>}
    {source&&<p>{source.title} {source.original&&<a href={source.original} target="_blank" rel="noopener noreferrer">在原网页打开 ↗</a>}</p>}
    {source&&(source.kind==="web"||source.kind==="bilibili")&&<p>登录、清晰度与播放限制由原站决定。网页无法内嵌时，请在原网页播放，再共享视频标签页。B站短链接请先在浏览器打开，复制完整视频链接。</p>}
    <video ref={shared} muted playsInline className={sharing?"watch-shared":"watch-capture"}/>
    <div className="watch-discuss"><button onClick={()=>sharing?stopShare():void share()}>{sharing?"停止共享画面":"共享视频标签页"}</button><input aria-label="陪看问题" value={question} maxLength={4000} onChange={e=>setQuestion(e.target.value)}/><button disabled={busy||!active} onClick={discuss}>{busy?"角色正在回复…":"聊聊当前画面"}</button></div>
    <p>先在模型设置中配置图片理解能力。每次点击“聊聊当前画面”只发送一张画面给当前角色的图片理解模型，可能产生模型费用；不持续上传，不读取音频。未发送画面时，角色只能依据你描述的内容聊天。</p>
    {error&&<p role="alert">{error}</p>}
  </section>;
}

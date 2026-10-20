import { useEffect, useRef, useState } from "react";
import { readResponse } from "@/shared/api/http";
import "./computer.css";
type Status={installed:boolean;platform:string;accessibility?:boolean;screen_recording?:boolean;active:boolean;expires_in:number;detail?:string};
type Frame={mime:string;data:string;width:number;height:number};
type Plan={plan_id?:string;reason:string;action:string;arguments:Record<string,unknown>};
const labels:Record<string,string>={click:"点击",type:"输入文字",key:"按键或快捷键",scroll:"滚动",open_url:"打开网页",done:"无需继续操作"};
export default function ComputerPanel({open,active,agentId,onClose}:{open:boolean;active:boolean;agentId:string;onClose:()=>void}){
  const [status,setStatus]=useState<Status|null>(null),[session,setSession]=useState("");
  const [frame,setFrame]=useState<Frame|null>(null),[plan,setPlan]=useState<Plan|null>(null);
  const [goal,setGoal]=useState("");
  const [tool,setTool]=useState("click"),[x,setX]=useState(50),[y,setY]=useState(50),[text,setText]=useState(""),[key,setKey]=useState("enter"),[command,setCommand]=useState(false),[amount,setAmount]=useState(-600),[url,setUrl]=useState("");
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const token=useRef(""),epoch=useRef(0),starting=useRef(false);
  async function refresh(){try{const next=await readResponse<Status>(await fetch('/api/computer/status'));setStatus(next);if(!next.active&&token.current){epoch.current++;setBusy(false);token.current="";setSession("");setFrame(null);setPlan(null);}}catch(e){setError((e as Error).message);}}
  async function post<T>(path:string,body?:object):Promise<T>{return readResponse<T>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));}
  async function run<T>(work:()=>Promise<T>):Promise<T|undefined>{const current=epoch.current;setBusy(true);setError("");setMessage("");try{const value=await work();if(current===epoch.current)return value;}catch(e){if(current===epoch.current)setError((e as Error).message);}finally{if(current===epoch.current)setBusy(false);}}
  async function stop(){epoch.current++;token.current="";starting.current=false;setSession("");setFrame(null);setPlan(null);setBusy(false);setMessage("电脑操作已停止，待执行步骤已取消。");try{await readResponse(await fetch('/api/computer/session',{method:'DELETE'}));await refresh();}catch(e){setError((e as Error).message);}}
  useEffect(()=>{if(open&&active)void refresh();else if(token.current||starting.current)void stop();},[open,active]);
  useEffect(()=>()=>{epoch.current++;if(token.current||starting.current)void fetch('/api/computer/session',{method:'DELETE',keepalive:true});token.current="";},[]);
  async function begin(){const generation=epoch.current;starting.current=true;const result=await run(async()=>{await readResponse(await fetch('/api/plugins/computer',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})}));return post<Status&{session:string}>('/api/computer/session');});if(generation===epoch.current)starting.current=false;if(result){token.current=result.session;setSession(result.session);setStatus(result);setMessage("本次会话有效15分钟。执行输入前有3秒时间切换到目标应用。");}}
  async function invoke(name:string,args:object={}){const result=await post<{result:Frame|{executed:boolean}}>('/api/plugins/execute',{tool:'computer.'+name,arguments:{session:token.current,...args}});return result.result;}
  async function screenshot(){const value=await run(()=>invoke('screenshot'));if(value){setFrame(value as Frame);setPlan(null);}}
  async function execute(){const args=tool==='click'?{x:x/100,y:y/100}:tool==='type'?{text}:tool==='key'?{key,modifiers:command?['cmd']:[]}:tool==='scroll'?{amount}:{url};setPlan(null);const result=await run(()=>invoke(tool,{...args,delay_seconds:3}));if(result)setMessage("该步骤已执行。请刷新屏幕确认结果。");}
  async function suggest(){setPlan(null);const value=await run(()=>post<Plan>('/api/computer/plan',{session:token.current,agent_id:agentId,goal}));if(value)setPlan(value);}
  async function executePlan(){if(!plan?.plan_id)return;const id=plan.plan_id;setPlan(null);const value=await run(()=>post('/api/computer/execute-plan',{session:token.current,plan_id:id}));if(value)setMessage("建议步骤已执行。请刷新屏幕或继续让角色建议下一步。");}
  if(!open)return null;
  return <section className="computer-panel" aria-label="电脑操作">
    <header><div><h2>电脑操作 · Computer Use</h2><p>查看主屏幕，控制鼠标键盘；随时停止。</p></div><div className="computer-buttons"><button onClick={()=>void refresh()}>刷新连接状态</button><button className="computer-stop" onClick={()=>void stop()}>立即停止</button><button onClick={()=>{void stop();onClose();}}>关闭面板</button></div></header>
    <p>{status?.installed?'本机桥接器已连接':'本机桥接器未就绪'} · 屏幕录制：{status?.screen_recording?'已授权':'未授权'} · 辅助功能：{status?.accessibility?'已授权':'未授权'}</p>
    {status?.detail&&<p>{status.detail}</p>}
    <p>首次使用需运行部署目录中的电脑操作安装脚本，并在 macOS 系统设置 → 隐私与安全性中授权屏幕录制和辅助功能。关闭面板、离开创作空间或停止会话会取消待执行步骤。</p>
    {!session&&<button disabled={busy||!status?.installed||!!status?.active} onClick={()=>void begin()}>启用本次电脑操作（15分钟）</button>}
    {status?.active&&!session&&<p>已有会话正在使用电脑。可先点击“立即停止”结束现有会话。</p>}
    {session&&<>
      <details><summary>接入本机工具客户端</summary><p>本次临时令牌可用于本机 MCP 插件工具调用，结束会话后立即失效。</p><button onClick={()=>{void navigator.clipboard.writeText(session).then(()=>setMessage("临时会话令牌已复制")).catch(()=>setError("剪贴板不可用，请检查浏览器权限"));}}>复制临时会话令牌</button></details>
      <div className="computer-buttons"><button disabled={busy} onClick={()=>void screenshot()}>查看屏幕</button><span>{busy?'正在处理；输入操作前预留3秒切换应用。':'本次电脑操作已启用'}</span></div>
      {frame&&<figure><img src={`data:${frame.mime};base64,${frame.data}`} alt="当前主屏幕快照，点击可选取操作位置" onClick={e=>{const box=e.currentTarget.getBoundingClientRect();setX(Math.max(0,Math.min(100,(e.clientX-box.left)/box.width*100)));setY(Math.max(0,Math.min(100,(e.clientY-box.top)/box.height*100)));setTool('click');setPlan(null);}}/><figcaption>点击快照仅选择坐标，再点击执行才会操作电脑；快照不会自动刷新或上传。</figcaption></figure>}
      <div className="computer-columns"><div><h3>手动操作</h3><label>操作类型<select value={tool} onChange={e=>setTool(e.target.value)}>{Object.entries(labels).filter(([id])=>id!=='done').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        {tool==='click'&&<div className="computer-buttons"><label>横向位置 %<input aria-label="点击横向位置" type="number" min="0" max="100" value={x} onChange={e=>setX(+e.target.value)}/></label><label>纵向位置 %<input aria-label="点击纵向位置" type="number" min="0" max="100" value={y} onChange={e=>setY(+e.target.value)}/></label></div>}
        {tool==='type'&&<label>输入内容<textarea maxLength={2000} value={text} onChange={e=>setText(e.target.value)} /></label>}
        {tool==='key'&&<><label>按键<select value={key} onChange={e=>setKey(e.target.value)}>{['enter','tab','escape','space','backspace','left','right','up','down','a','c','v','l','t','w'].map(value=><option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={command} onChange={e=>setCommand(e.target.checked)}/>同时按住 Command</label></>}
        {tool==='scroll'&&<label>滚动<select value={amount} onChange={e=>setAmount(+e.target.value)}><option value={-600}>向下600像素</option><option value={600}>向上600像素</option></select></label>}
        {tool==='open_url'&&<label>网页地址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label>}
        <button disabled={busy||(tool==='type'&&!text)||(tool==='open_url'&&!url)} onClick={()=>void execute()}>3秒后执行{labels[tool]}</button>
      </div><div><h3>让角色建议下一步</h3><label>这次要完成什么？<textarea maxLength={2000} value={goal} onChange={e=>{setGoal(e.target.value);setPlan(null);}} placeholder="例如：在浏览器里打开B站首页"/></label><p>点击建议会将当前主屏幕截图发给此角色的图片理解模型，可能产生推理费用；角色只提出一步建议。</p><button disabled={busy||!goal.trim()} onClick={()=>void suggest()}>查看屏幕并生成建议</button>
        {plan&&<div className="computer-plan"><strong>{labels[plan.action]}</strong><p>{plan.reason}</p>{Object.entries(plan.arguments).map(([name,value])=><p key={name}>{name}：{typeof value==='string'?value:JSON.stringify(value)}</p>)}{plan.plan_id&&<button disabled={busy} onClick={()=>void executePlan()}>3秒后执行这一步（建议60秒内有效）</button>}</div>}
      </div></div>
    </>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}

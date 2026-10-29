import { useEffect, useState } from "react";
export default function ResourceAccess({ id }: { id: string }) {
  const [agents, setAgents] = useState<{id:string;name:string}[]>([]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active=true;
    setReady(false);
    Promise.all([fetch("/api/agents").then(r=>r.json()),fetch("/api/library/access").then(r=>r.json())]).then(([a,p])=>{
      if(active){setAgents(a.profiles);setSelected(p[id] ?? null);setReady(true);}
    }).catch(()=>setNotice("权限加载失败，请重新打开"));
    return ()=>{active=false;};
  },[id]);
  async function save() {
    try {
      const response=await fetch(`/api/library/access/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({agents:selected})});
      if(!response.ok) throw new Error();
      setNotice("访问权限已保存");
    } catch {setNotice("保存失败，请重试");}
  }
  return <fieldset disabled={!ready} style={{border:"1px solid var(--border)",borderRadius:12,padding:16,marginBlock:16}}>
    <legend>角色访问权限</legend>
    <label><input type="checkbox" checked={selected===null} onChange={e=>setSelected(e.target.checked?null:[])} />所有角色共享（默认）</label>
    {selected!==null && <div style={{display:"grid",gap:8,marginBlock:12}}>{agents.map(a=><label key={a.id}><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(e.target.checked?[...selected,a.id]:selected.filter(x=>x!==a.id))} />{a.name}</label>)}</div>}
    <p>私有资源仅供所选角色在私聊中访问，不自动用于公开直播。未选择任何角色时，所有角色均不可访问。</p>
    <button onClick={()=>void save()}>保存访问权限</button><small role="status">{notice}</small>
  </fieldset>;
}

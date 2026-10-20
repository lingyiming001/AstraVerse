import { useWorld } from "@/shared/state/workspaceStore";
export async function characterCommand(tool:string,args:Record<string,unknown>,actorId=useWorld.getState().actorId) {
  const response=await fetch('/api/tools/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args,actor_id:actorId,client_id:useWorld.getState().clientId})});
  if(!response.ok)throw new Error('同步失败，当前修改仅在本地生效');
}

import ts from 'typescript';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL("../../..",import.meta.url));
const source=readFileSync(`${root}/apps/astraverse-web/src/features/scenes/sceneCatalog.ts`,'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {sceneDefinitions}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const out=`${root}/apps/astraverse-web/public/scenes`;mkdirSync(out,{recursive:true});
for(const scene of sceneDefinitions){
 let art='';
 const box=(x,y,w,h,c,r=3)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`;
 if(scene.kind==='bedroom') art=box(115,135,570,225,scene.night?'#9b97a3':'#e6e2d7')+box(155,160,100,105,scene.night?'#657693':'#afd3d7')+box(150,300,200,85,'#b99377')+box(150,280,200,75,'#f5eee4')+box(162,287,50,35,'#e4d5c1')+box(205,310,145,45,scene.accent)+box(480,265,165,18,'#9d7f61')+box(492,280,9,95,'#9d7f61')+box(620,280,9,95,'#9d7f61')+box(410,302,50,72,scene.accent);
 else if(scene.kind==='park'){
 art=box(320,145,160,300,'#dfcfb6')+box(80,310,640,45,'#dfcfb6');
 for(const [x,y] of [[155,180],[620,175],[110,290],[675,300]]) art+=box(x-7,y+25,14,90,'#8f785e')+`<circle cx="${x}" cy="${y}" r="55" fill="${scene.night?'#6e967d':'#82a786'}"/><circle cx="${x-20}" cy="${y-15}" r="37" fill="${scene.night?'#7eaa85':'#9bbb91'}"/>`;
 art+=box(190,300,110,18,'#ae9274')+box(190,327,110,12,'#ae9274')+box(200,338,9,36,'#647569')+box(280,338,9,36,'#647569');
 if(scene.night) for(let i=0;i<12;i++) art+=`<circle cx="${80+(i*83)%650}" cy="${140+(i*47)%240}" r="3" fill="#ffe7a7"/>`;
 }else{
 art=box(105,120,590,230,scene.night?'#c5ab98':'#e6e2d7')+box(295,145,250,105,'#476d60')+box(310,170,90,3,'#dae5ce')+box(310,196,180,3,'#dae5ce')+box(125,151,100,110,'#afd3d7');
 for(const [x,y] of [[180,295],[470,295],[180,365],[470,365]]) art+=box(x,y,130,16,'#b89b73')+box(x+10,y+15,7,46,'#9d856c')+box(x+112,y+15,7,46,'#9d856c')+box(x+40,y+30,55,25,scene.accent);
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480"><rect width="800" height="480" fill="${scene.sky}"/><path d="M60 290H740L790 460H10Z" fill="${scene.floor}"/>${art}<rect x="26" y="24" width="180" height="36" rx="18" fill="#ffffff" opacity=".8"/><text x="116" y="48" text-anchor="middle" fill="#3f574b" font-family="sans-serif" font-size="19">${scene.name}</text></svg>`;
 writeFileSync(`${out}/${scene.id}.svg`,svg);
 writeFileSync(`${out}/${scene.id}.scene.json`,JSON.stringify({format:'astraverse-scene-v1',...scene,source:'Kenney Furniture Kit / Nature Kit (CC0)'},null,2)+'\n');
}

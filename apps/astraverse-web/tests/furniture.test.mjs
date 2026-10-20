import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {VRMHumanoid} from '@pixiv/three-vrm';
const load = async (name, transform = source => source) => {
 const source=transform(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'));
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const {rigDirection}=await load('features/stage/rigPose.ts');
const {furnitureAnchor,furnitureIntent}=await load('features/scenes/furniture.ts');
const {sceneDefinitions,canOccupy}=await load('features/scenes/sceneCatalog.ts');
const {useWorld}=await load('shared/state/workspaceStore.ts', source => source.replace('"zustand"',JSON.stringify(new URL('../node_modules/zustand/esm/index.mjs',import.meta.url).href)));
for (const name of ['vrm-sample','vita','vivi']) test(`${name}: actual normalized rig keeps both hands below shoulders`,()=>{
 const data=readFileSync(new URL(`../public/models/${name}.vrm`,import.meta.url));
 const json=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
 const nodes=json.nodes.map(n=>{
  const o=new THREE.Object3D();
  if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);
  else {if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}
  return o;
 });
 json.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>nodes[i].add(nodes[c])));
 const scene=new THREE.Group();json.scenes[json.scene||0].nodes.forEach(n=>scene.add(nodes[n]));scene.updateMatrixWorld(true);
 const version=json.extensions.VRMC_vrm?'1':'0';
 const bones=version==='1'?Object.entries(json.extensions.VRMC_vrm.humanoid.humanBones).map(([bone,b])=>[bone,{node:nodes[b.node]}]):json.extensions.VRM.humanoid.humanBones.map(b=>[b.bone,{node:nodes[b.node]}]);
 const humanoid=new VRMHumanoid(Object.fromEntries(bones));scene.add(humanoid.normalizedHumanBonesRoot);
 if(version==='0')scene.rotation.y=Math.PI;
 for(const [side,z]of[['left',-1.24],['right',1.24]]){
  humanoid.getNormalizedBoneNode(side+'UpperArm').rotation.z=z*rigDirection(version);
 }
 scene.updateMatrixWorld(true);humanoid.update();scene.updateMatrixWorld(true);
 for(const side of ['left','right']){
  const shoulder=humanoid.getNormalizedBoneNode(side+'UpperArm').getWorldPosition(new THREE.Vector3());
  const wrist=humanoid.getNormalizedBoneNode(side+'Hand').getWorldPosition(new THREE.Vector3());
  assert.ok(wrist.y<shoulder.y-.2,`${side} hand ${wrist.y} shoulder ${shoulder.y}`);
 }
});
test('only rooms with the requested furniture provide anchors',()=>{
 for(const scene of sceneDefinitions){
  assert.equal(Boolean(furnitureAnchor(scene,'sleep')),scene.kind==='bedroom');
  assert.equal(Boolean(furnitureAnchor(scene,'study')),scene.kind!=='park');
  assert.ok(canOccupy(scene,0,0),'exit is on a walkable floor');
 }
 assert.equal(furnitureAnchor(undefined,'sleep'),null);
});
test('explicit commands only; negation and personal statements do not trigger furniture',()=>{
 for(const text of ['上床睡觉','到床上休息会','请到床上睡觉吧'])assert.equal(furnitureIntent(text),'sleep');
 for(const text of ['坐下学习','坐在桌前学习','在书桌前学习'])assert.equal(furnitureIntent(text),'study');
 for(const text of ['不要上床睡觉','我想上床睡觉','学习有什么好处'])assert.equal(furnitureIntent(text),null);
});
test('standing, switching scene/model and hiding the stage release furniture to the floor',()=>{
 for(const patch of [{action:'idle'},{action:'dance'},{sceneUrl:'/scenes/park-day.scene.json'},{modelUrl:'other.vrm'},{character:2},{sceneVisible:false},{characterVisible:false}]){
  useWorld.getState().set({sceneUrl:'/scenes/bedroom-day.scene.json',sceneVisible:true,characterVisible:true,modelUrl:null,character:0});
  useWorld.getState().set({furniture:{kind:'sleep',seatHeight:0},action:'sleep',position:[-2.7,.55,-1.9]});
  useWorld.getState().set(patch);
  assert.equal(useWorld.getState().furniture,null);
  assert.deepEqual(useWorld.getState().position,[0,0,0]);
 }
});

test('all chairs, desks and park benches have unique executable anchors',async()=>{
 const {sceneInteractions}=await load('features/scenes/furniture.ts');
 for(const scene of sceneDefinitions){
  const targets=sceneInteractions(scene);
  assert.equal(new Set(targets.map(t=>t.id)).size,targets.length);
  assert.equal(targets.filter(t=>t.kind==='sit').length,scene.kind==='school'?4:scene.kind==='park'?2:1);
  assert.equal(targets.filter(t=>t.kind==='study').length,scene.kind==='school'?4:scene.kind==='park'?0:1);
  for(const target of targets)assert.ok(target.position.every(Number.isFinite));
 }
});

test('primary activities are exclusive and character switches reset presentation',()=>{
 const s=()=>useWorld.getState();
 s().set({actorId:'actor-one',modelUrl:null,character:0});
 s().set({singing:true,action:'idle'});
 assert.equal(s().singing,true);assert.equal(s().walkMode,false);
 s().set({walkMode:true,movementMode:'run',walkTarget:[0,1.8]});
 assert.equal(s().singing,false);assert.equal(s().action,'idle');
 s().set({walking:true,running:true});
 s().set({action:'sleep'});
 assert.equal(s().walking,false);assert.equal(s().running,false);assert.equal(s().walkMode,false);assert.equal(s().walkTarget,null);
 s().set({headphones:true,expression:'sad',singing:true});
 s().set({actorId:'actor-two'});
 assert.equal(s().headphones,false);assert.equal(s().singing,false);assert.equal(s().expression,'neutral');assert.equal(s().action,'idle');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/scenes/sceneCatalog.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const { sceneDefinitions, builtinScenes, builtinScene, canOccupy } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('all six scenes are selectable, distinct, attributed and spawn safely',()=>{
  assert.equal(builtinScenes.length,6);
  assert.equal(new Set(builtinScenes.map(s=>s.id)).size,6);
  for(const scene of sceneDefinitions){
    const resource=builtinScenes.find(r=>r.name===scene.name);
    assert.equal(builtinScene(resource.url),scene);
    assert.ok(canOccupy(scene,0,0));
    assert.ok(resource.license.includes('CC0'));
    assert.ok(existsSync(new URL(`../public${resource.url}`,import.meta.url)));
    assert.ok(existsSync(new URL(`../public${resource.thumbnail}`,import.meta.url)));
  }
  assert.equal(builtinScene('blob:untrusted'),undefined);
});
test('every scene bounds movement and rejects invalid targets',()=>{
  for(const scene of sceneDefinitions){
    const [minX,maxX,minZ,maxZ]=scene.bounds;
    assert.equal(canOccupy(scene,minX,0),false);
    assert.equal(canOccupy(scene,maxX,0),false);
    assert.equal(canOccupy(scene,0,minZ),false);
    assert.equal(canOccupy(scene,0,maxZ),false);
    assert.equal(canOccupy(scene,Infinity,0),false);
    assert.equal(canOccupy(scene,0,NaN),false);
    for(const [a,b,c,d] of scene.obstacles){
      assert.equal(canOccupy(scene,(a+b)/2,(c+d)/2),false);
      assert.equal(canOccupy(scene,a-.1,(c+d)/2),false);
    }
  }
});
test('custom scenes use a bounded movement area',()=>{
  assert.ok(canOccupy(undefined,0,0));
  assert.equal(canOccupy(undefined,4,0),false);
});
test('downloaded props are self-contained GLBs with original licenses',()=>{
  for(const name of ['bed','desk','chair','bookcase','bench','tree-oak','tree-pine','bush']){
    const data=readFileSync(new URL(`../public/scenes/kenney/${name}.glb`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'glTF');
    assert.equal(data.readUInt32LE(8),data.length);
    const json=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
    assert.ok(json.meshes.length>0);
    for(const buffer of json.buffers || []) assert.ok(!buffer.uri || buffer.uri.startsWith('data:'));
    for(const image of json.images || []) assert.ok(!image.uri || image.uri.startsWith('data:'));
  }
  for(const name of ['FURNITURE','NATURE']) assert.match(readFileSync(new URL(`../public/scenes/kenney/${name}-LICENSE.txt`,import.meta.url),'utf8'),/CC0/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/features/chat/captionTimeline.ts',import.meta.url),'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('exact cue boundaries exclude gaps and malformed timestamps',()=>{
  const cues=[{start:0,end:1,text:'第一句'},{start:2,end:3,text:'第二句'}];
  assert.equal(exports.timedCaption(cues,0),'第一句');
  assert.equal(exports.timedCaption(cues,1),null);
  assert.equal(exports.timedCaption(cues,2),'第二句');
  assert.equal(exports.timedCaption(cues,NaN),null);
});
test('remaining twenty characters appear on the next page at boundary',()=>{
  const pages=['字'.repeat(40)+'\n'+'字'.repeat(40),'余'.repeat(20)];
  assert.equal(exports.captionPageAt(pages,79),0);
  assert.equal(exports.captionPageAt(pages,80),1);
  assert.equal(exports.captionPageAt(pages,100),1);
});

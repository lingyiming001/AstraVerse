import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/shared/preferences/resourceLimits.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {normalizeResourceLimit,validResourceLimit,resourceLimitBytes}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('missing legacy or invalid preferences keep the 50 MB default',()=>{
 for(const value of [undefined,null,'200',NaN,Infinity,0,-1,.5,2049]){
  assert.equal(validResourceLimit(value),false);
  assert.equal(normalizeResourceLimit(value),50);
 }
});
test('custom limits allow larger files and preserve the exact boundary',()=>{
 const fileSize=75*1024*1024;
 assert.ok(fileSize>resourceLimitBytes(50));
 assert.ok(fileSize<=resourceLimitBytes(100));
 assert.equal(resourceLimitBytes(100),104857600);
});
test('smallest and largest supported limits are valid integers',()=>{
 for(const limit of [1,50,200,2048]){
  assert.ok(validResourceLimit(limit));assert.equal(normalizeResourceLimit(limit),limit);
 }
});

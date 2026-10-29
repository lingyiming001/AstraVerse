import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const file=new URL('../src/features/watch/source.ts',import.meta.url);
const js=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseVideoUrl}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('Bilibili normalizes IDs, disables autoplay and preserves part',()=>{
 const source=parseVideoUrl('https://www.bilibili.com/video/BV1B7411m7LV/?p=2&autoplay=1');
 assert.equal(source.kind,'bilibili');const url=new URL(source.url);
 assert.equal(url.hostname,'player.bilibili.com');assert.equal(url.searchParams.get('autoplay'),'0');assert.equal(url.searchParams.get('p'),'2');
 assert.equal(parseVideoUrl('https://www.bilibili.com/video/av123').kind,'bilibili');
 assert.equal(parseVideoUrl('https://player.bilibili.com/player.html?bvid=BV1B7411m7LV').kind,'bilibili');
});
test('direct video URLs retain signed queries; arbitrary pages use web fallback',()=>{
 const url='https://example.com/movie.MP4?token=private';assert.equal(parseVideoUrl(url).url,url);assert.equal(parseVideoUrl(url).kind,'direct');
 assert.equal(parseVideoUrl('https://example.com/watch/123').kind,'web');
 assert.equal(parseVideoUrl('https://bilibili.com.evil.example/video/BV1B7411m7LV').kind,'web');
});
test('reject invalid, executable and credential-bearing URLs',()=>{
 for(const url of ['javascript:alert(1)','file:///tmp/a.mp4','data:text/html,hi','https://user:password@example.com/a.mp4','not a url','https://www.bilibili.com/video/bad','https://player.bilibili.com/player.html?bvid=bad'])assert.throws(()=>parseVideoUrl(url));
});
const subtitleFile=new URL('../src/features/watch/subtitles.ts',import.meta.url);
const subtitleJs=ts.transpileModule(await readFile(subtitleFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseSubtitles,subtitleAt}=await import('data:text/javascript;base64,'+Buffer.from(subtitleJs).toString('base64'));
test('SRT/VTT cues follow time and only expose nearby lines',()=>{
 const cues=parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n第一句\n\n2\n00:00:20,000 --> 00:00:22,000\n第二句');
 assert.equal(cues.length,2);
 assert.equal(subtitleAt(cues,2),'第一句');
 assert.equal(subtitleAt(cues,20),'第二句');
 assert.equal(subtitleAt(cues,100),'');
 assert.throws(()=>parseSubtitles('invalid subtitles'));
});

import { characterCommand } from "./controlCommands";
import { useWorld } from "@/shared/state/workspaceStore";
import { activeModelUrl, characterCapabilities } from "@/shared/state/characterCapabilities";
import { stopCharacterSpeech } from "@/features/chat/speech";
export const hummingMotion = {energy:0};
let current: {close:()=>void} | null = null;
let generation=0;
export function stopHumming() {
  ++generation;
  const previous=current;current=null;previous?.close();hummingMotion.energy=0;
  if (useWorld.getState().singing) useWorld.getState().set({singing:false});
}
/** Original wordless melody using formant-shaped synthesis; never pretends to be a vocal model. */
export async function startHumming(): Promise<boolean> {
  stopHumming();
  if (!characterCapabilities()?.canSing) return false;
  const token=generation, model=activeModelUrl();
  if (typeof AudioContext === "undefined") return false;
  let context:AudioContext;
  try {context=new AudioContext();} catch {return false;}
  const source=context.createOscillator(), gain=context.createGain();
  source.type="triangle";gain.gain.value=0;
  const vowel=context.createBiquadFilter();vowel.type="lowpass";vowel.frequency.value=900;vowel.Q.value=1.6;
  const volume=context.createGain(),analyser=context.createAnalyser();analyser.fftSize=512;
  const samples=new Float32Array(analyser.fftSize);
  volume.gain.value=useWorld.getState().volume/100;
  source.connect(vowel);vowel.connect(gain);gain.connect(volume);volume.connect(analyser);analyser.connect(context.destination);
  stopCharacterSpeech();
  useWorld.getState().set({singing:true,action:"idle",walkMode:false});
  void characterCommand("character.animate",{animation:"idle"}).catch(()=>{});
  const notes=[60,64,67,69,67,64,62,60,62,65,69,67,65,64,62,60];
  const start=context.currentTime+.08, beat=.55;
  notes.forEach((note,index)=>{
    const time=start+index*beat;
    source.frequency.setValueAtTime(440*2**((note-69)/12),time);
    gain.gain.setValueAtTime(.0001,time);
    gain.gain.linearRampToValueAtTime(.12,time+.08);
    gain.gain.exponentialRampToValueAtTime(.0001,time+beat*.9);
  });
  source.start(start);source.stop(start+notes.length*beat);
  let timer:ReturnType<typeof setInterval> | undefined;
  const unsubscribe=useWorld.subscribe(state=>{if(!state.singing || activeModelUrl()!==model)stopHumming();else volume.gain.setTargetAtTime(state.volume/100,context.currentTime,.05);});
  current={close:()=>{unsubscribe();if(timer)clearInterval(timer);void context.close().catch(()=>{});}};
  try {
    await context.resume();
    if(token!==generation || activeModelUrl()!==model || !useWorld.getState().singing){if(context.state!=="closed")void context.close();return false;}
    timer=setInterval(()=>{
      const phase=(context.currentTime-start)/beat;
      analyser.getFloatTimeDomainData(samples);
      hummingMotion.energy=Math.min(1,Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length)*25);
      if(phase>=notes.length)stopHumming();
    },30);
    return true;
  } catch { if(token===generation)stopHumming();return false; }
}

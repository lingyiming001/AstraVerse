import { useEffect, useRef } from 'react';
import { useAgents } from '@/features/agents/agentApi';
import { useBookReading } from '@/features/library/bookReading';
import { useSpeech } from '@/features/chat/speech';
import { readResponse } from '@/shared/api/http';
export function useMusicComments({enabled, agentId, trackId, title, description, audio, onComment}: {
  enabled:boolean; agentId:string; trackId:string; title:string; description:string;
  audio:React.RefObject<HTMLAudioElement | null>; onComment:(text:string)=>void;
}) {
  const recent = useRef<string[]>([]);
  const last = useRef(0);
  const callback = useRef(onComment); callback.current = onComment;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let disposed = false;
    const available = () => !disposed && !!audio.current && !audio.current.paused && !audio.current.ended && audio.current.currentTime > 20 && !useAgents.getState().busy[agentId] && !useBookReading.getState().readers[agentId]?.reading?.active && !['preparing','speaking'].includes(useSpeech.getState().phase);
    const schedule = () => { timer = setTimeout(() => void run(), 75000 + Math.random() * 105000); };
    const run = async () => {
      try {
        if (available() && Date.now() - last.current > 120000 && Math.random() < .65) {
          last.current = Date.now();
          const result = await readResponse<{text:string}>(await fetch('/api/music/comment', {method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({agent_id:agentId,title,description,recent:recent.current})}));
          if (available() && result.text) { recent.current = [...recent.current,result.text].slice(-3); callback.current(result.text); }
        }
      } catch { /* Optional ambience never interrupts music or raises a toast. */ }
      if (!disposed) schedule();
    };
    schedule();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [enabled,agentId,trackId,title,description,audio]);
}

import { useId } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useBookReading } from "./bookReading";
import "./readingTextPanel.css";

export default function ReadingTextPanel({ agentId, visible, onToggle }: { agentId: string; visible: boolean; onToggle: () => void }) {
  const view = useBookReading(s => s.readers[agentId]);
  const id = useId();
  const reading = view?.reading;
  if (!reading) return null;
  return <section className="reading-text-panel" aria-label="阅读内容">
    <div className="reading-text-toolbar">
      <BookOpen size={15} aria-hidden="true" />
      <div><strong title={reading.title}>《{reading.title}》</strong><small>{reading.completed ? "已读完" : reading.active ? "朗读中" : "已暂停"} · {reading.percent}%</small></div>
      <button type="button" aria-expanded={visible} aria-controls={id} onClick={onToggle}>
        {visible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{visible ? "隐藏原文" : "显示原文"}
      </button>
    </div>
    {visible && <div id={id} className="reading-text-content" role="region" aria-label="当前阅读片段" tabIndex={0}>
      <small>{reading.chapter}</small>
      <p>{view.text || (reading.completed ? "全书已读完。" : reading.active ? "正在准备阅读内容…" : "继续朗读后会显示阅读内容。")}</p>
    </div>}
  </section>;
}

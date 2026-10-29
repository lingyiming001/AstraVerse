import { useState } from "react";
import { useSpeech } from "./speech";
import "./stageCaptions.css";

export default function StageCaptions({ agentId }: { agentId: string }) {
  const [visible, setVisible] = useState(() => localStorage.getItem("astraverse:stage-captions") === "true");
  const speech = useSpeech();
  const text = ["preparing", "speaking"].includes(speech.phase) && speech.agentId === agentId ? speech.text : "";
  return <>
    <button className="stage-caption-toggle" aria-pressed={visible} onClick={() => setVisible(value => {
      localStorage.setItem("astraverse:stage-captions", String(!value));
      return !value;
    })}>{visible ? "隐藏字幕" : "显示字幕"}</button>
    {visible && text && <div className="stage-reading-caption" aria-label="当前朗读字幕">{text}</div>}
  </>;
}

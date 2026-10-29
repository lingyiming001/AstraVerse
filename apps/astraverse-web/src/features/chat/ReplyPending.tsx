import { useEffect, useState } from "react";

export default function ReplyPending({ name }: { name: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="reply-pending" role="status">
    <span className="reply-pending-dots" aria-hidden="true"><i /><i /><i /></span>
    <span>{seconds >= 20 ? "回复还在生成，请稍候…" : `${name}正在回复…`}</span>
    {seconds >= 5 && <small aria-hidden="true">{seconds}秒</small>}
  </div>;
}

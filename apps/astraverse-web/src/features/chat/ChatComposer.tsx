import { inputProblem } from "@/shared/contentPolicy";
import { useLayoutEffect, useRef } from "react";
import { ArrowUp, LoaderCircle, Square, Volume2, VolumeX } from "lucide-react";
import { stopCharacterSpeech, useSpeech } from "@/features/chat/speech";
interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  name: string;
  busy: boolean;
  loading: boolean;
  voice: boolean;
  onVoiceToggle: () => void;
}
export default function ChatComposer({
  value,
  onChange,
  onSend,
  name,
  busy,
  loading,
  voice,
  onVoiceToggle,
}: Props) {
  const problem = inputProblem(value);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const speech = useSpeech();
  useLayoutEffect(() => {
    const node = input.current;
    if (node) {
      node.style.height = "auto";
      node.style.height = `${Math.min(164, Math.max(72, node.scrollHeight))}px`;
    }
  }, [value]);
  const playing = speech.phase === "speaking",
    preparing = speech.phase === "preparing";
  return (
    <form
      className="composer-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!composing.current && !busy && !loading && !problem && value.trim()) onSend();
      }}
    >
      <label className="sr-only" htmlFor="character-chat-input">
        聊天消息
      </label>
      <textarea
        id="character-chat-input"
        ref={input}
        className="composer-input"
        rows={2}
        maxLength={4000}
        aria-invalid={!!problem}
        aria-describedby="composer-policy"
        placeholder={`把想说的话，慢慢告诉${name}…`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing &&
            !composing.current &&
            e.keyCode !== 229
          ) {
            e.preventDefault();
            if (!busy && !loading && !problem && value.trim()) onSend();
          }
        }}
      />
      <div className="composer-toolbar">
        <button
          type="button"
          className={`composer-voice ${voice ? "is-on" : ""}`}
          aria-pressed={voice}
          aria-label={voice ? "关闭角色语音回复" : "开启角色语音回复"}
          title="开启后自动朗读角色的新回复；使用语音模型或系统语音"
          onClick={onVoiceToggle}
        >
          {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
          <span>{voice ? "语音回复已开启" : "语音回复已关闭"}</span>
          <i aria-hidden="true" />
        </button>
        <div className="composer-actions">
          {(playing || preparing) && (
            <button
              type="button"
              className="composer-stop"
              aria-label="停止朗读"
              title="停止当前语音"
              onClick={stopCharacterSpeech}
            >
              {preparing ? (
                <LoaderCircle size={12} className="spin" />
              ) : (
                <Square size={11} />
              )}
              <span>{preparing ? "生成中" : "停止"}</span>
            </button>
          )}
          <button
            type="submit"
            className="send composer-send"
            disabled={busy || loading || !!problem || !value.trim()}
            aria-label={busy ? "等待角色回复" : "发送消息"}
            title="发送消息（Enter）"
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowUp size={18} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
      <div id="composer-policy" className={`composer-status${problem ? " has-error" : ""}`} aria-live="polite">
        {problem || (preparing
          ? "正在准备角色语音…"
          : playing
            ? `正在朗读 · ${speech.source === "model" ? "语音模型" : "系统语音"}`
            : speech.phase === "error"
              ? "语音未能播放，可重试或检查语音配置"
              : voice
                ? "下一条回复会为你朗读"
                : "自然聊天 · 请友善表达")}
        <span>
          {value.length > 3500 ? `${value.length}/4000` : "Shift + Enter 换行"}
        </span>
      </div>
    </form>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface ActionItem { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void; }
export default function ActionMenu({ label, items, text, icon }: { label: string; items: ActionItem[]; text?: string; icon?: ReactNode }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  function close(focus = false) { setPosition(null); if (focus) trigger.current?.focus(); }
  function open() {
    const box = trigger.current!.getBoundingClientRect();
    const height = items.length * 38 + 12;
    setPosition({ left: Math.max(8, Math.min(box.right - 192, window.innerWidth - 200)), top: Math.max(8, box.bottom + height + 8 < window.innerHeight ? box.bottom + 6 : box.top - height - 6) });
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) close(); };
    const scroll = (e: Event) => { if (!(e.target instanceof Node) || !menu.current?.contains(e.target)) close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", scroll); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", scroll); window.removeEventListener("scroll", scroll, true); };
  }, [position]);
  return <>
    <button ref={trigger} className={text ? "primary resource-import-menu" : "resource-menu-trigger"} aria-label={label} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined} onClick={() => position ? close(true) : open()} onKeyDown={e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } }}>
      {icon || <MoreHorizontal size={17} />}{text}
    </button>
    {position && createPortal(<div id={id} ref={menu} role="menu" className="product-action-menu" style={position} aria-label={label} onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") close();
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>{items.map(item => <button key={item.label} type="button" role="menuitem" className={item.danger ? "is-danger" : ""} onClick={() => { close(true); item.onSelect(); }}>{item.icon}<span>{item.label}</span></button>)}</div>, document.querySelector(".app") || document.body)}
  </>;
}

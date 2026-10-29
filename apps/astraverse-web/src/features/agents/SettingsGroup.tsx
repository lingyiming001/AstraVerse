import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Optional editors mount only when opened, so hidden panels do not poll APIs. */
export default function SettingsGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="agent-settings-group" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary><div><strong>{title}</strong>{hint && <span>{hint}</span>}</div><ChevronRight size={16} aria-hidden="true" /></summary>
    {open && <div className="agent-settings-group-body">{children}</div>}
  </details>;
}

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Native modal semantics provide focus containment and an inert background. */
export default function PanelDialog({ title, children, onClose, busy = false, danger = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-focus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>(".resource-table-scroll")?.focus();
    };
  }, []);
  return createPortal(<dialog ref={ref} className="product-dialog" role={danger ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={id}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={e => {
      if (busy || e.target !== e.currentTarget) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose();
    }}>
    <div className="product-dialog-heading"><h2 id={id}>{title}</h2><button aria-label="关闭对话框" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <div className="product-dialog-body">{children}</div>
  </dialog>, document.querySelector(".app") || document.body);
}

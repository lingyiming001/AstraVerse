import { useEffect, useRef } from "react";

const openedEvent = "astraverse:stage-panel-opened";

/** Dismiss transient stage controls without changing any character settings. */
export function useStageDisclosure() {
  const ref = useRef<HTMLDetailsElement>(null);
  const attached = useRef<HTMLDetailsElement | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (node === attached.current) return;
    cleanup.current?.();
    attached.current = node;
    cleanup.current = null;
    if (!node) return;
    node.open = false;
    const close = () => { node.open = false; };
    const outside = (event: Event) => {
      if (node.open && event.target instanceof Node && !node.contains(event.target)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && node.open) {
        const focused = node.contains(document.activeElement);
        close();
        if (focused) node.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    const peer = (event: Event) => {
      if ((event as CustomEvent).detail !== node) close();
    };
    const toggle = () => {
      if (node.open) document.dispatchEvent(new CustomEvent(openedEvent, { detail: node }));
    };
    node.addEventListener("toggle", toggle);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    document.addEventListener(openedEvent, peer);
    cleanup.current = () => {
      node.removeEventListener("toggle", toggle);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", key);
      document.removeEventListener(openedEvent, peer);
    };
  });
  useEffect(() => () => {
    cleanup.current?.();
    attached.current = null;
    cleanup.current = null;
  }, []);
  return ref;
}

// Small DOM helpers the views share. Every class comes from hackbuild-ui;
// the views carry no styles of their own.
import { strokeIcon } from "@virgilvox/hackbuild-ui/vanilla";

type Attrs = Record<string, string | number | boolean | null | undefined>;

/** An element with classes, attributes and children. A false or null attribute is left off. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = "", attrs: Attrs = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) e.setAttribute(k, v === true ? "" : String(v));
  e.append(...kids);
  return e;
}

/** A child of `host` with this class, made and appended when missing, so a Vue shell or a page can supply it. */
export function part(host: HTMLElement, cls: string, make: () => HTMLElement): HTMLElement {
  const found = [...host.children].find((c) => c.classList.contains(cls)) as HTMLElement | undefined;
  if (found) return found;
  const e = make();
  host.append(e);
  return e;
}

/** A 44 px icon button from the hackbuild-ui stroke set. */
export function iconButton(doc: Document, icon: string, label: string, attrs: Attrs = {}): HTMLButtonElement {
  const b = el(doc, "button", "hb-iconbtn", { type: "button", "aria-label": label, title: label, ...attrs });
  b.innerHTML = strokeIcon(icon, { size: 18 });
  return b;
}

/** A light button, or the one pink action when `go`. */
export function button(doc: Document, label: string, go = false, attrs: Attrs = {}): HTMLButtonElement {
  return el(doc, "button", go ? "hb-btn hb-btn-go" : "hb-btn", { type: "button", ...attrs }, [label]);
}

/** Text with a tone for hackbuild-ui's status line. */
export function statusLine(doc: Document, text: string, tone: "ok" | "warn" | "bad" | "info" | "busy"): HTMLElement {
  return el(doc, "p", `hb-status is-${tone === "bad" ? "err" : tone}`, {}, [text]);
}

/** An object URL that is revoked on the next call, so one thumbnail slot never leaks. */
export function urlSlot(): (blob: Blob | string | null | undefined) => string {
  let last: string | null = null;
  return (b) => {
    if (last) URL.revokeObjectURL(last);
    last = null;
    if (!b) return "";
    if (typeof b === "string") return b;
    last = URL.createObjectURL(b);
    return last;
  };
}

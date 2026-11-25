// The "how this works" fold of a package page, rendered from the package's
// how.ts in the markup of the hackbuild-ui HbHow component (hb-fold, hb-how
// and hb-codeblock classes; copy and wrap from the vanilla entry). A page
// whose html already carries a fold from the page builder keeps that one.
import { codeBlock } from "@virgilvox/hackbuild-ui/vanilla";
import type { How } from "../../packages/organic/how";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function block(code: string, lang: string, label: string, wrap: boolean): HTMLElement {
  const box = el("div", "hb-codeblock");
  const head = el("div", "hb-codeblock-head");
  head.append(el("span", "hb-codeblock-lang", lang));
  if (!wrap) {
    const w = el("button", "hb-codeblock-btn", "wrap");
    w.type = "button";
    w.dataset.wrap = "";
    w.setAttribute("aria-pressed", "false");
    head.append(w);
  }
  const copy = el("button", "hb-codeblock-btn");
  copy.type = "button";
  copy.dataset.copy = "";
  const l = el("span", "", "copy");
  l.dataset.label = "";
  l.setAttribute("aria-live", "polite");
  copy.append(l);
  head.append(copy);
  const pre = el("pre");
  pre.setAttribute("aria-label", label);
  pre.append(el("code", "", code));
  box.append(head, pre);
  codeBlock(box, { wrap });
  return box;
}

/** Appends the fold to `parent` (default the page main) unless one is there. */
export function mountHow(how: How, parent: HTMLElement | null = document.querySelector("main")): HTMLDetailsElement | null {
  if (!parent || document.querySelector(".hb-how")) return null;
  const fold = el("details", "hb-fold hb-how");
  const sum = el("summary");
  sum.append(el("span", "hb-fold-sum", "how this works"));
  const body = el("div");

  const text = el("div");
  for (const p of how.how) text.append(el("p", "", p));

  const pkgs = el("div", "hb-how-pkgs");
  pkgs.append(el("span", "hb-how-k", "packages"));
  for (const p of how.packages) pkgs.append(el("code", "hb-code", p));

  const install = el("div", "hb-how-install");
  install.append(el("span", "hb-how-k", "install"), block(how.install, "sh", "install line", true));
  install.append(el("p", "hb-how-note", how.today ? "not on npm yet. the line below works today." : "not on npm yet."));
  if (how.today) install.append(block(how.today, "sh", "install line that works today", true));

  const code = el("div", "hb-how-code");
  code.append(el("span", "hb-how-k", "code"), block(how.code, how.lang ?? "ts", "minimal code", false));

  body.append(text, pkgs, install, code);
  if (how.links.source) {
    const links = el("div", "hb-how-links");
    const a = el("a", "hb-link", "source");
    a.href = how.links.source;
    links.append(a);
    body.append(links);
  }
  fold.append(sum, body);
  parent.append(fold);
  return fold;
}

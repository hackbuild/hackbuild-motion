// The page shell of the view demos: the stage and rack layout of
// hackbuild-ui (one 52 px bar, the stage that fills, the 380 px rack of
// tabs) built over the page the site builder wrote. The builder's header
// becomes the bar, its "how this works" fold goes into the rack's detail
// fold, and the status and readout lines move into the first tab.
import { stageRack, type LayoutHandle, type RackTab } from "@virgilvox/hackbuild-ui/vanilla";

export interface StageRackPage {
  root: HTMLElement;
  /** The `.hb-lay-stage` section, for a view to mount into. */
  stage: HTMLElement;
  panes: Record<string, HTMLElement>;
  layout: LayoutHandle;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export function stageRackPage(tabs: RackTab[], rackLabel: string, note = ""): StageRackPage {
  const root = make("div", "hb-lay hb is-stage-rack", { "data-layout": "stage-rack" });
  const bar = make("div", "hb-lay-bar", { "data-ux": "bar" });
  const header = document.querySelector(".hb-header");
  if (header) bar.append(header);
  const body = make("div", "hb-lay-body");
  const stage = make("section", "hb-lay-stage");
  const rack = make("aside", "hb-rack", { "aria-label": rackLabel, "data-ux": "rack" });
  const strip = make("nav", "hb-tabs", { role: "tablist", "aria-label": `${rackLabel} tabs` });
  rack.append(strip);
  const panes: Record<string, HTMLElement> = {};
  tabs.forEach((t, i) => {
    const b = make("button", "hb-tab", { type: "button", role: "tab", "data-value": t.id, id: `tab-${t.id}`, "aria-controls": `pane-${t.id}`, "aria-selected": String(i === 0) });
    b.textContent = t.label;
    strip.append(b);
    const pane = make("section", "hb-rack-pane", { role: "tabpanel", id: `pane-${t.id}`, "aria-labelledby": `tab-${t.id}` });
    pane.hidden = i > 0;
    panes[t.id] = pane;
    rack.append(pane);
  });
  const first = panes[tabs[0]!.id]!;
  if (note) {
    const p = make("p", "hb-fixture");
    const b = make("b");
    b.textContent = "sample";
    p.append(b, document.createTextNode(note));
    first.append(p);
  }
  for (const id of ["status", "readout"]) {
    const e = document.getElementById(id);
    if (e) first.append(e);
  }
  const how = document.querySelector(".hb-how");
  if (how) {
    const detail = make("details", "hb-rack-detail", { "data-ux": "detail" });
    const sum = make("summary");
    sum.textContent = "how this works";
    const inner = make("div", "hb-how");
    inner.append(...[...how.children].filter((c) => c.tagName !== "SUMMARY"));
    detail.append(sum, inner);
    rack.append(detail);
  }
  body.append(stage, rack);
  root.append(bar, body);
  document.body.replaceChildren(root, ...[...document.body.querySelectorAll("script")]);
  const layout = stageRack(root);
  return { root, stage, panes, layout };
}

/** Label and value rows, as hackbuild-ui kv rows. */
export function kvRows(host: HTMLElement, rows: Record<string, string | number>): void {
  host.replaceChildren(
    ...Object.entries(rows).map(([k, v]) => {
      const d = make("div", "hb-kv");
      const label = make("span", "hb-label");
      label.textContent = k;
      const b = make("span", "hb-readout");
      b.textContent = String(v);
      d.append(label, b);
      return d;
    }),
  );
}

/** An instrument panel with a head, for a rack pane. */
export function panel(host: HTMLElement, heading: string): HTMLElement {
  const p = make("section", "hb-panel");
  const h = make("div", "hb-panel-hd-inst");
  h.textContent = heading;
  p.append(h);
  host.append(p);
  return p;
}

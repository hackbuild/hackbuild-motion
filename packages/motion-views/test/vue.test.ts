import { describe, expect, it } from "vitest";
import { AvatarDrop, CharacterStage, ClipStrip } from "../src/vue.js";
import { defineMotionViews } from "../src/vanilla.js";

describe("entries", () => {
  it("define the vue components with the view events", () => {
    expect(CharacterStage.name).toBe("CharacterStage");
    expect(CharacterStage.emits).toEqual(["loaded", "failed", "doing", "verb", "framing"]);
    expect(AvatarDrop.emits).toEqual(["picked", "checked", "failed", "use"]);
    expect(ClipStrip.emits).toEqual(["pick", "play", "stop", "thumb"]);
  });
  it("import with no side effect: no custom element is defined until asked", () => {
    expect(typeof defineMotionViews).toBe("function");
    expect(typeof (globalThis as { customElements?: unknown }).customElements).toBe("undefined");
  });
});

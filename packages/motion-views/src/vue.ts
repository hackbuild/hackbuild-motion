// The views as Vue 3 components, written as render functions so the
// package needs no SFC compiler. Each mounts the same vanilla view the
// custom elements use and hands its events on as Vue events.
import { type PropType, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { type CharacterStageEvent, type CharacterStageHandle, type CharacterStageOptions, type Framing, type Verb, DEFAULT_VERBS, characterStage } from "./character-stage.js";
import { type AvatarDropEvent, type AvatarDropHandle, type AvatarDropOptions, avatarDrop } from "./avatar-drop.js";
import { type ClipStripEvent, type ClipStripHandle, type StripItem, clipStrip } from "./clip-strip.js";

/** The character stage. Use it as the stage of HbStageRack; the inset slot sits top left. */
export const CharacterStage = defineComponent({
  name: "CharacterStage",
  props: {
    name: { type: String, default: undefined },
    src: { type: String, default: undefined },
    framing: { type: String as PropType<Framing>, default: "bust" },
    verbs: { type: Array as PropType<readonly Verb[]>, default: () => DEFAULT_VERBS },
    drop: { type: Boolean, default: true },
    /** Stage options: the vrm hook, lights, follow, hello. */
    options: { type: Object as PropType<CharacterStageOptions>, default: () => ({}) },
  },
  emits: ["loaded", "failed", "doing", "verb", "framing"],
  setup(props, { emit, slots, expose }) {
    const root = ref<HTMLElement | null>(null);
    const handle = shallowRef<CharacterStageHandle | null>(null);
    let off: (() => void) | null = null;
    onMounted(() => {
      const o: CharacterStageOptions = { ...props.options, framing: props.framing, verbs: props.verbs, drop: props.drop };
      if (props.name) o.name = props.name;
      if (props.src) o.src = props.src;
      handle.value = characterStage(root.value!, o);
      off = handle.value.on((e: CharacterStageEvent) => emit(e.type, e));
    });
    watch(
      () => props.src,
      (src) => {
        if (src) void handle.value?.show(src);
        else handle.value?.showPlaceholder();
      },
    );
    watch(
      () => props.framing,
      (f) => handle.value?.frame(f),
    );
    watch(
      () => props.verbs,
      (v) => handle.value?.setVerbs(v),
    );
    onBeforeUnmount(() => {
      off?.();
      handle.value?.dispose();
    });
    expose({ handle });
    return () =>
      h("section", { ref: root, class: "hb-lay-stage" }, [
        h("div", { class: "hb-lay-subject" }),
        h("div", { class: "hb-lay-inset" }, slots.inset?.()),
        h("div", { class: "hb-lay-verbs", role: "toolbar", "aria-label": "what he does" }),
      ]);
  },
});

/** The avatar drop card: zone, still, size, licence and rig check. */
export const AvatarDrop = defineComponent({
  name: "AvatarDrop",
  props: {
    go: { type: Boolean, default: false },
    label: { type: String, default: undefined },
    options: { type: Object as PropType<AvatarDropOptions>, default: () => ({}) },
  },
  emits: ["picked", "checked", "failed", "use"],
  setup(props, { emit, expose }) {
    const root = ref<HTMLElement | null>(null);
    const handle = shallowRef<AvatarDropHandle | null>(null);
    let off: (() => void) | null = null;
    onMounted(() => {
      const o: AvatarDropOptions = { ...props.options, go: props.go };
      if (props.label) o.label = props.label;
      handle.value = avatarDrop(root.value!, o);
      off = handle.value.on((e: AvatarDropEvent) => emit(e.type, e));
    });
    onBeforeUnmount(() => {
      off?.();
      handle.value?.dispose();
    });
    expose({ handle });
    return () => h("div", { ref: root });
  },
});

/** The clip strip: stills to pick from and one play button. */
export const ClipStrip = defineComponent({
  name: "ClipStrip",
  props: {
    items: { type: Array as PropType<readonly StripItem[]>, default: () => [] },
    current: { type: String as PropType<string | null>, default: null },
    playing: { type: Boolean, default: false },
    go: { type: Boolean, default: true },
    label: { type: String, default: "clips" },
  },
  emits: ["pick", "play", "stop", "thumb"],
  setup(props, { emit, expose }) {
    // the strip and its play button join the parent row
    const root = ref<HTMLElement | null>(null);
    const handle = shallowRef<ClipStripHandle | null>(null);
    let off: (() => void) | null = null;
    onMounted(() => {
      handle.value = clipStrip(root.value!, { items: props.items, current: props.current, go: props.go, label: props.label });
      off = handle.value.on((e: ClipStripEvent) => emit(e.type, e));
    });
    watch(
      () => props.items,
      (items) => handle.value?.setItems(items, props.current),
    );
    watch(
      () => props.current,
      (id) => id && handle.value?.pick(id),
    );
    watch(
      () => props.playing,
      (on) => handle.value?.setPlaying(on),
    );
    onBeforeUnmount(() => {
      off?.();
      handle.value?.dispose();
    });
    expose({ handle });
    return () => h("div", { ref: root, style: "display:contents" });
  },
});

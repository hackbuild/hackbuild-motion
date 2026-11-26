# vue

## Variables

### AvatarDrop

```ts
const AvatarDrop: DefineComponent<ExtractPropTypes<{
  go: {
     default: boolean;
     type: BooleanConstructor;
  };
  label: {
     default: undefined;
     type: StringConstructor;
  };
  options: {
     default: () => object;
     type: PropType<AvatarDropOptions>;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("failed" | "picked" | "checked" | "use")[], "failed" | "picked" | "checked" | "use", PublicProps, ToResolvedProps<ExtractPropTypes<{
  go: {
     default: boolean;
     type: BooleanConstructor;
  };
  label: {
     default: undefined;
     type: StringConstructor;
  };
  options: {
     default: () => object;
     type: PropType<AvatarDropOptions>;
  };
}>, ("failed" | "picked" | "checked" | "use")[]>, {
  go: boolean;
  label: string;
  options: AvatarDropOptions;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

The avatar drop card: zone, still, size, licence and rig check.

***

### CharacterStage

```ts
const CharacterStage: DefineComponent<ExtractPropTypes<{
  drop: {
     default: boolean;
     type: BooleanConstructor;
  };
  framing: {
     default: string;
     type: PropType<Framing>;
  };
  name: {
     default: undefined;
     type: StringConstructor;
  };
  options: {
     default: () => object;
     type: PropType<CharacterStageOptions>;
  };
  src: {
     default: undefined;
     type: StringConstructor;
  };
  verbs: {
     default: () => readonly Verb[];
     type: PropType<readonly Verb[]>;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("loaded" | "failed" | "doing" | "verb" | "framing")[], "loaded" | "failed" | "doing" | "verb" | "framing", PublicProps, ToResolvedProps<ExtractPropTypes<{
  drop: {
     default: boolean;
     type: BooleanConstructor;
  };
  framing: {
     default: string;
     type: PropType<Framing>;
  };
  name: {
     default: undefined;
     type: StringConstructor;
  };
  options: {
     default: () => object;
     type: PropType<CharacterStageOptions>;
  };
  src: {
     default: undefined;
     type: StringConstructor;
  };
  verbs: {
     default: () => readonly Verb[];
     type: PropType<readonly Verb[]>;
  };
}>, ("loaded" | "failed" | "doing" | "verb" | "framing")[]>, {
  drop: boolean;
  framing: Framing;
  name: string;
  options: CharacterStageOptions;
  src: string;
  verbs: readonly Verb[];
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

The character stage. Use it as the stage of HbStageRack; the inset slot sits top left.

***

### ClipStrip

```ts
const ClipStrip: DefineComponent<ExtractPropTypes<{
  current: {
     default: null;
     type: PropType<string | null>;
  };
  go: {
     default: boolean;
     type: BooleanConstructor;
  };
  items: {
     default: () => never[];
     type: PropType<readonly StripItem[]>;
  };
  label: {
     default: string;
     type: StringConstructor;
  };
  playing: {
     default: boolean;
     type: BooleanConstructor;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("play" | "pick" | "stop" | "thumb")[], "play" | "pick" | "stop" | "thumb", PublicProps, ToResolvedProps<ExtractPropTypes<{
  current: {
     default: null;
     type: PropType<string | null>;
  };
  go: {
     default: boolean;
     type: BooleanConstructor;
  };
  items: {
     default: () => never[];
     type: PropType<readonly StripItem[]>;
  };
  label: {
     default: string;
     type: StringConstructor;
  };
  playing: {
     default: boolean;
     type: BooleanConstructor;
  };
}>, ("play" | "pick" | "stop" | "thumb")[]>, {
  current: string | null;
  go: boolean;
  items: readonly StripItem[];
  label: string;
  playing: boolean;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

The clip strip: stills to pick from and one play button.

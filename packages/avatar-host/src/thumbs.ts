// @hackbuild/avatar-host/thumbs: clip and avatar previews drawn in the
// background. `clipThumbs` poses one clay figure (the built in placeholder
// body by default) at each clip's most telling frame; `avatarThumbs` loads
// each character and draws it at rest. Both run on the pacing queue of
// thumb-queue.ts and hand back PNG Blobs through `save`.
import { type AvatarPortraitOptions, type AvatarThumbJob, AvatarPortrait, type ClipPortraitOptions, type ClipThumbJob, ClipPortrait } from "./portrait.js";
import { ThumbQueue, type ThumbQueueOptions } from "./thumb-queue.js";

export * from "./thumb-queue.js";
export * from "./portrait.js";

/** Queue and portrait options of `clipThumbs`. */
export type ClipThumbOptions = Omit<ThumbQueueOptions<ClipThumbJob>, "renderer"> & { portrait?: ClipPortraitOptions };
/** Queue and portrait options of `avatarThumbs`. */
export type AvatarThumbOptions = Omit<ThumbQueueOptions<AvatarThumbJob>, "renderer"> & { portrait?: AvatarPortraitOptions };

/** A queue of clip previews on one clay figure, 192 px square by default. */
export function clipThumbs(opts: ClipThumbOptions): ThumbQueue<ClipThumbJob> {
  return new ThumbQueue({ ...opts, renderer: () => ClipPortrait.create(opts.portrait) });
}

/** A queue of avatar previews, 240 by 320 px by default. */
export function avatarThumbs(opts: AvatarThumbOptions): ThumbQueue<AvatarThumbJob> {
  return new ThumbQueue({ ...opts, renderer: async () => AvatarPortrait.create(opts.portrait) });
}

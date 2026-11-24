// @hackbuild/environment: brightly lit scenes around a character. This
// entry holds the parts with no three.js: layouts and presets as data, the
// files each needs, the missing file error, and the light math (light
// directions, the brightest azimuth of an HDRI, probe normalizing). `/three`
// builds the rig, assembles kit sets and loads a scene.
export * from "./layout.js";
export * from "./layouts.js";

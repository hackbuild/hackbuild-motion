// The four scenes as data. The studio needs no file: it lights from the
// three.js room environment (MIT, in code) and stands on a grey floor that
// fades into a flat backdrop. The room, cafe and outdoors layouts draw from
// the Kenney Furniture and Nature kits (CC0, vendor) under Poly Haven HDRIs
// (CC0, vendor); the package bundles none of those files, the caller's
// resolver supplies them. Light figures were set by screenshot on a VRM in
// earlier work (vendor).
import type { EnvironmentLayout, EnvironmentPreset } from "./layout.js";

const K = "kenney-furniture/";
const N = "kenney-nature/";

/** The studio: room environment light, a grey floor and a flat backdrop; needs no file. */
export const studio: EnvironmentLayout = {
  scale: 1,
  keyAzimuth: 30,
  keyElevation: 40,
  key: { intensity: 2.2, color: "#fff6ec" },
  rim: { intensity: 1.2, color: "#cfdcff" },
  probe: { intensity: 0.25, saturation: 1 },
  exposure: 1,
  envIntensity: 0.35,
  backdrop: { color: "#2b2d31" },
  ground: { radius: 12, color: "#5c5f66" },
  fog: { color: "#2b2d31", near: 5, far: 14 },
  items: [],
};

/** A furnished room from the Kenney Furniture kit under an indoor HDRI. */
export const room: EnvironmentLayout = {
  scale: 2.1,
  keyAzimuth: 35,
  keyElevation: 40,
  key: { intensity: 2.2, color: "#fff3e2" },
  rim: { intensity: 1.0, color: "#d6e2ff" },
  probe: { intensity: 0.25, saturation: 0.5 },
  exposure: 1,
  envIntensity: 0.35,
  backdrop: { blur: 0.5, intensity: 0.6 },
  items: [
    // tiles are 0.05 thick, sunk so their top is the floor
    { model: `${K}floorFull.glb`, at: [-1.5, -0.05, -0.2], grid: [3, 3] },
    { model: `${K}wall.glb`, at: [-1.5, 0, -1.2] },
    { model: `${K}wallWindow.glb`, at: [-0.5, 0, -1.2] },
    { model: `${K}wall.glb`, at: [0.5, 0, -1.2] },
    { model: `${K}wall.glb`, at: [-1.5, 0, -0.2], rot: 90 },
    { model: `${K}wall.glb`, at: [-1.5, 0, 0.8], rot: 90 },
    { model: `${K}wall.glb`, at: [1.5, 0, -1.2], rot: -90 },
    { model: `${K}wallWindow.glb`, at: [1.5, 0, -0.2], rot: -90 },
    { model: `${K}rugRectangle.glb`, at: [-0.785, -0.005, 0.46] },
    { model: `${K}loungeSofa.glb`, at: [-0.49, 0, -0.78] },
    { model: `${K}pillowBlue.glb`, at: [-0.4, 0.2, -0.9] },
    { model: `${K}bookcaseOpen.glb`, at: [-1.45, 0, -0.95] },
    { model: `${K}books.glb`, at: [-1.4, 0.45, -1.05] },
    { model: `${K}lampSquareFloor.glb`, at: [-0.8, 0, -0.95] },
    { model: `${K}pottedPlant.glb`, at: [0.7, 0, -0.95] },
    { model: `${K}loungeChair.glb`, at: [1.05, 0, -0.2], rot: -90 },
    { model: `${K}sideTable.glb`, at: [1.1, 0, -0.75], rot: -90 },
    { model: `${K}lampRoundTable.glb`, at: [1.18, 0.3, -0.65] },
    { model: `${K}plantSmall2.glb`, at: [-1.3, 0, 0.4] },
  ],
};

/** A cafe corner from the Kenney Furniture kit under a cafe HDRI. */
export const cafe: EnvironmentLayout = {
  scale: 2.1,
  keyAzimuth: -30,
  keyElevation: 42,
  key: { intensity: 2.2, color: "#ffeedd" },
  rim: { intensity: 1.0, color: "#ffe2c4" },
  probe: { intensity: 0.25, saturation: 0.45 },
  exposure: 1,
  envIntensity: 0.35,
  backdrop: { blur: 0.45, intensity: 0.6 },
  items: [
    // tiles are 0.05 thick, sunk so their top is the floor
    { model: `${K}floorFull.glb`, at: [-1.5, -0.05, -0.2], grid: [3, 3] },
    { model: `${K}wallWindow.glb`, at: [-1.5, 0, -1.2] },
    { model: `${K}wallWindow.glb`, at: [-0.5, 0, -1.2] },
    { model: `${K}wallWindow.glb`, at: [0.5, 0, -1.2] },
    { model: `${K}wall.glb`, at: [-1.5, 0, -0.2], rot: 90 },
    { model: `${K}wall.glb`, at: [-1.5, 0, 0.8], rot: 90 },
    { model: `${K}wall.glb`, at: [1.5, 0, -1.2], rot: -90 },
    { model: `${K}wall.glb`, at: [1.5, 0, -0.2], rot: -90 },
    { model: `${K}kitchenCabinet.glb`, at: [-0.86, 0, -0.75] },
    { model: `${K}kitchenCabinet.glb`, at: [-0.43, 0, -0.75] },
    { model: `${K}kitchenCabinetDrawer.glb`, at: [0, 0, -0.75] },
    { model: `${K}kitchenCabinet.glb`, at: [0.43, 0, -0.75] },
    { model: `${K}kitchenCoffeeMachine.glb`, at: [-0.7, 0.45, -0.8] },
    { model: `${K}kitchenBlender.glb`, at: [0.45, 0.45, -0.85] },
    { model: `${K}toaster.glb`, at: [0.15, 0.45, -0.85] },
    { model: `${K}stoolBar.glb`, at: [-1.2, 0, -0.5] },
    { model: `${K}stoolBar.glb`, at: [0.95, 0, -0.5] },
    { model: `${K}table.glb`, at: [-1.45, 0, 0.55], rot: 90 },
    { model: `${K}chairCushion.glb`, at: [-1.0, 0, 0.1], rot: -90 },
    { model: `${K}chairCushion.glb`, at: [-1.0, 0, 0.5], rot: -90 },
    { model: `${K}table.glb`, at: [1.45, 0, -0.29], rot: -90 },
    { model: `${K}chairCushion.glb`, at: [1.0, 0, 0.3], rot: 90 },
    { model: `${K}pottedPlant.glb`, at: [-1.4, 0, -0.95] },
    { model: `${K}pottedPlant.glb`, at: [1.25, 0, -0.95] },
  ],
};

/** An open scene of Kenney Nature kit models on a ground disk under a sky HDRI. */
export const outdoors: EnvironmentLayout = {
  scale: 3,
  keyAzimuth: 40,
  keyElevation: 45,
  key: { intensity: 2.2, color: "#fff4e0" },
  rim: { intensity: 1.0, color: "#cfe0ff" },
  probe: { intensity: 0.25, saturation: 0.6 },
  exposure: 1,
  envIntensity: 0.35,
  backdrop: { blur: 0, intensity: 0.6 },
  ground: { radius: 90, color: "#6f8f45" },
  fog: { color: "#b9c6cf", near: 30, far: 85 },
  items: [
    { model: `${N}tree_oak.glb`, at: [-2.2, 0, -2.6], rot: 20, scale: 1.4 },
    { model: `${N}tree_default.glb`, at: [1.8, 0, -3.4], rot: 70, scale: 1.3 },
    { model: `${N}tree_detailed.glb`, at: [-0.4, 0, -5], rot: 140, scale: 1.4 },
    { model: `${N}tree_pineTallA_detailed.glb`, at: [3.6, 0, -2], scale: 1.5 },
    { model: `${N}tree_pineTallB_detailed.glb`, at: [-4, 0, -1], scale: 1.6 },
    { model: `${N}tree_fat.glb`, at: [-3.2, 0, 1.4], rot: 200, scale: 1.3 },
    { model: `${N}tree_oak.glb`, at: [3.4, 0, 1.2], rot: 300, scale: 1.2 },
    { model: `${N}tree_pineRoundC.glb`, at: [5, 0, -5], scale: 1.6 },
    { model: `${N}tree_pineRoundA.glb`, at: [-5.5, 0, -4.5], scale: 1.7 },
    { model: `${N}rock_largeA.glb`, at: [-1.1, 0, -1.1], rot: 30 },
    { model: `${N}stone_tallB.glb`, at: [1.3, 0, -1.6], rot: 10, scale: 0.6 },
    { model: `${N}stump_round.glb`, at: [0.9, 0, -0.7] },
    { model: `${N}log.glb`, at: [-1.6, 0, 0.1], rot: 75 },
    { model: `${N}plant_bushLarge.glb`, at: [-0.6, 0, -1.6] },
    { model: `${N}plant_bush.glb`, at: [0.4, 0, -1.3] },
    { model: `${N}plant_bushDetailed.glb`, at: [1.6, 0, -0.4] },
    { model: `${N}grass_large.glb`, at: [-0.7, 0, -0.5] },
    { model: `${N}grass_leafs.glb`, at: [1.2, 0, 0.2] },
    { model: `${N}flower_redA.glb`, at: [-0.45, 0, -0.3], scale: 0.6 },
    { model: `${N}flower_yellowB.glb`, at: [0.5, 0, -0.45], scale: 0.6 },
    { model: `${N}mushroom_redGroup.glb`, at: [0.95, 0, -0.95], scale: 0.7 },
    { model: `${N}tent_detailedOpen.glb`, at: [-2.6, 0, -1.2], rot: 35 },
    { model: `${N}campfire_stones.glb`, at: [-1.7, 0, -0.6] },
  ],
};

const POLY_HAVEN = "Poly Haven";

/** One preset per layout, with the files each needs and their licences. */
export const PRESETS: readonly EnvironmentPreset[] = [
  { id: "studio", label: "studio", layout: studio, hdri: null, kitLicence: null },
  { id: "room", label: "room", layout: room, hdri: { file: "hdri/lythwood_room_1k.hdr", licence: "CC0", source: POLY_HAVEN }, kitLicence: "CC0" },
  { id: "cafe", label: "cafe", layout: cafe, hdri: { file: "hdri/comfy_cafe_1k.hdr", licence: "CC0", source: POLY_HAVEN }, kitLicence: "CC0" },
  {
    id: "outdoors",
    label: "outdoors",
    layout: outdoors,
    hdri: { file: "hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr", licence: "CC0", source: POLY_HAVEN },
    kitLicence: "CC0",
  },
];

/** A preset by id, or undefined. */
export const presetOf = (id: string): EnvironmentPreset | undefined => PRESETS.find((p) => p.id === id);

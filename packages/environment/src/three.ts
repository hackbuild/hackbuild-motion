// three.js side of @hackbuild/environment: the light rig, the ground disk,
// the merged set, HDRI loading and the light probe, and `loadEnvironment`,
// which loads a scene fully before `attach()` puts it in, so the previous
// scene stays on screen until the next is ready.
import {
  type BufferGeometry,
  CircleGeometry,
  Color,
  CubeCamera,
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  Fog,
  Group,
  HalfFloatType,
  type Light,
  type LightProbe,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoToneMapping,
  Object3D,
  PMREMGenerator,
  Quaternion,
  RGBAFormat,
  Scene,
  type Texture,
  type ToneMapping,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type EnvironmentLayout, type EnvironmentPreset, type LayoutItem, MissingFileError, brightestAzimuth, direction, normalizeProbe } from "./layout.js";
import { presetOf } from "./layouts.js";

/** What the caller gives for a file path: a URL, or the bytes. */
export type FileSource = string | URL | ArrayBuffer | Blob;
/** Finds a file a layout needs; rejects or returns null when it is not there. */
export type Resolve = (file: string) => Promise<FileSource | null> | FileSource | null;

/** Light distance from the spot, meters (vendor). */
const DISTANCE = 6;
/** Half width of the key light's shadow camera, meters (vendor). */
export const SHADOW_EXTENT = 1.6;
/** Key light shadow map side, pixels (vendor). */
export const SHADOW_MAP = 1024;

const vec = (a: [number, number, number]) => new Vector3(...a);

/** The key light with a shadow over the character's spot, and a rim light from behind the other side. */
export function buildRig(layout: EnvironmentLayout): Group {
  const rig = new Group();
  rig.name = "environment-lights";
  const target = new Object3D();
  target.position.set(0, 0.9, 0);
  rig.add(target);
  const key = new DirectionalLight(layout.key.color, layout.key.intensity);
  key.name = "environment-key";
  key.position.copy(vec(direction(layout.keyAzimuth, layout.keyElevation)).multiplyScalar(DISTANCE)).add(target.position);
  key.target = target;
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -SHADOW_EXTENT;
  cam.right = cam.top = SHADOW_EXTENT;
  cam.near = 0.5;
  cam.far = DISTANCE * 2;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  const rim = new DirectionalLight(layout.rim.color, layout.rim.intensity);
  rim.name = "environment-rim";
  rim.position.copy(vec(direction(layout.keyAzimuth + 180 - 40, 35)).multiplyScalar(DISTANCE)).add(target.position);
  rim.target = target;
  rig.add(key, rim);
  return rig;
}

/** The floor disk for open scenes; it takes the shadow. */
export function buildGround(ground: NonNullable<EnvironmentLayout["ground"]>): Mesh {
  const mesh = new Mesh(new CircleGeometry(ground.radius, 64), new MeshStandardMaterial({ color: ground.color, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = "environment-ground";
  return mesh;
}

// kits export flat colors with metalness 1, which turns them into tinted
// mirrors of the HDRI; stylized kits are meant to be matte
function dielectric(m: Material): Material {
  const s = m as MeshStandardMaterial;
  if (s.isMeshStandardMaterial && !s.metalnessMap) s.metalness = 0;
  return m;
}

// a copy with only what the material reads, non indexed, so geometries from
// different files always merge
function prepare(source: BufferGeometry, material: Material): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  const textured = !!(material as MeshStandardMaterial).map;
  for (const name of Object.keys(g.attributes)) {
    if (name === "position" || name === "normal" || (name === "uv" && textured)) continue;
    g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// kits repeat the same few materials across files as separate objects;
// ones that render the same share a key
function materialKey(m: Material): string {
  const s = m as MeshStandardMaterial;
  return [m.type, s.color?.getHexString(), s.emissive?.getHexString(), s.map?.uuid ?? "", s.roughness, s.metalness, m.transparent, m.opacity, m.side].join("|");
}

/**
 * Builds a set from kit models and flattens it: every mesh is baked into
 * world space and merged with the others of the same look, so a room of
 * fifty props draws in a couple of dozen calls. `load` gives each model
 * once; a model it cannot give rejects with `MissingFileError`. Source
 * geometries are disposed; materials and maps live on in the merged meshes.
 */
export async function assemble(items: readonly LayoutItem[], scale: number, load: (file: string) => Promise<Object3D>): Promise<Group> {
  const files = [...new Set(items.map((i) => i.model))];
  const loaded = new Map<string, Object3D>();
  await Promise.all(
    files.map(async (f) => {
      let m: Object3D | null = null;
      try {
        m = await load(f);
      } catch {
        m = null;
      }
      if (!m) throw new MissingFileError(f);
      loaded.set(f, m);
    }),
  );
  const parts = new Map<string, { material: Material; geometries: BufferGeometry[] }>();
  const place = new Matrix4();
  const world = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const item of items) {
    const model = loaded.get(item.model)!;
    model.updateMatrixWorld(true);
    const [nx, nz] = item.grid ?? [1, 1];
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        const s = scale * (item.scale ?? 1);
        place.compose(new Vector3((item.at[0] + ix) * scale, item.at[1] * scale, (item.at[2] + iz) * scale), q.setFromAxisAngle(up, ((item.rot ?? 0) * Math.PI) / 180), new Vector3(s, s, s));
        model.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          const material = dielectric(Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material);
          const geometry = prepare(mesh.geometry, material);
          geometry.applyMatrix4(world.multiplyMatrices(place, mesh.matrixWorld));
          const key = materialKey(material);
          let part = parts.get(key);
          if (!part) parts.set(key, (part = { material, geometries: [] }));
          part.geometries.push(geometry);
        });
      }
  }
  const group = new Group();
  group.name = "environment-set";
  for (const { material, geometries } of parts.values()) {
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  for (const m of loaded.values()) m.traverse((o) => (o as Mesh).isMesh && (o as Mesh).geometry.dispose());
  return group;
}

async function bytesOf(src: FileSource): Promise<ArrayBuffer> {
  if (src instanceof ArrayBuffer) return src;
  if (typeof Blob !== "undefined" && src instanceof Blob) return src.arrayBuffer();
  const res = await fetch(src as string | URL);
  if (!res.ok) throw new Error(`fetch failed with ${res.status}`);
  return res.arrayBuffer();
}

async function resolved(resolve: Resolve, file: string): Promise<ArrayBuffer> {
  try {
    const src = await resolve(file);
    if (src == null) throw new MissingFileError(file);
    return await bytesOf(src);
  } catch {
    throw new MissingFileError(file);
  }
}

/** Kit models through GLTFLoader from what `resolve` gives. */
export function modelLoader(resolve: Resolve): (file: string) => Promise<Object3D> {
  const loader = new GLTFLoader();
  return async (file) => (await loader.parseAsync(await resolved(resolve, file), "")).scene;
}

/** An HDRI as a float equirect texture. */
export async function loadHdri(resolve: Resolve, file: string): Promise<DataTexture> {
  const bytes = await resolved(resolve, file);
  const loader = new HDRLoader().setDataType(FloatType);
  const parsed = loader.parse(bytes) as { data: Float32Array; width: number; height: number };
  const tex = new DataTexture(parsed.data, parsed.width, parsed.height, RGBAFormat, FloatType);
  tex.colorSpace = "srgb-linear";
  tex.mapping = EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders `source` into a 32 px cube and reads spherical harmonics from it,
 * normalized to an average radiance of 1 and pulled toward grey by
 * `saturation`; `mean` is the original average.
 */
export async function probeFrom(renderer: WebGLRenderer, source: Scene, intensity: number, saturation: number): Promise<{ probe: LightProbe; mean: number }> {
  const target = new WebGLCubeRenderTarget(32, { type: HalfFloatType });
  try {
    new CubeCamera(0.1, 100, target).update(renderer, source);
    const probe = await LightProbeGenerator.fromCubeRenderTarget(renderer, target);
    const cs = probe.sh.coefficients.map((c) => [c.x, c.y, c.z] as [number, number, number]);
    const mean = normalizeProbe(cs, saturation);
    probe.sh.coefficients.forEach((c, i) => c.set(...cs[i]!));
    probe.intensity = intensity;
    return { probe, mean };
  } finally {
    target.dispose();
  }
}

/** A loaded scene, held off screen until `attach()`. */
export interface LoadedEnvironment {
  readonly id: string;
  /** The key light casts a shadow; the stage decides what casts one. */
  readonly shadows: boolean;
  /** Puts it in the scene in one step; separate from loading so a stale load never touches what shows. */
  attach(): void;
  /** Takes it out, clears only what is still its own, restores tone mapping and exposure, frees it. */
  dispose(): void;
}

/** Options of `loadEnvironment`: where the files come from and how kit models load. */
export interface EnvironmentOptions {
  /** Gives the files a preset needs; the studio needs none. */
  resolve?: Resolve;
  /** Loads kit models; default `modelLoader(resolve)`. */
  models?: (file: string) => Promise<Object3D>;
}

/**
 * Loads a preset (or a preset id) fully without touching the scene. The
 * character's spot is the origin; nothing here moves the character or the
 * camera. A file the resolver cannot give rejects with `MissingFileError`.
 */
export async function loadEnvironment(preset: EnvironmentPreset | string, scene: Scene, renderer: WebGLRenderer, opts: EnvironmentOptions = {}): Promise<LoadedEnvironment> {
  const p = typeof preset === "string" ? presetOf(preset) : preset;
  if (!p) throw new Error(`environment: no scene named ${String(preset)}.`);
  const { layout } = p;
  const resolve: Resolve = opts.resolve ?? (() => null);
  const [hdri, set] = await Promise.all([
    p.hdri ? loadHdri(resolve, p.hdri.file) : null,
    layout.items.length ? assemble(layout.items, layout.scale, opts.models ?? modelLoader(resolve)) : null,
  ]);
  // turn the HDRI so its brightest point sits behind the key light
  const img = hdri?.image as { width: number; height: number; data: Float32Array } | undefined;
  const turn = img ? (layout.keyAzimuth * Math.PI) / 180 - brightestAzimuth(img.data, img.width, img.height) : 0;
  const pmrem = new PMREMGenerator(renderer);
  const room = hdri ? null : new RoomEnvironment();
  const probeSource = room ?? new Scene();
  let envMap: WebGLRenderTarget;
  let probe: LightProbe;
  let mean: number;
  try {
    if (hdri) {
      probeSource.background = hdri;
      probeSource.backgroundRotation.y = turn;
      envMap = pmrem.fromEquirectangular(hdri);
    } else envMap = pmrem.fromScene(probeSource, 0.04);
    ({ probe, mean } = await probeFrom(renderer, probeSource, layout.probe.intensity, layout.probe.saturation));
  } finally {
    pmrem.dispose();
    room?.dispose();
  }
  const root = new Group();
  root.name = `environment:${p.id}`;
  root.add(buildRig(layout), probe);
  if (layout.ground) root.add(buildGround(layout.ground));
  if (set) root.add(set);
  const backdrop: Color | Texture | null = "color" in layout.backdrop ? new Color(layout.backdrop.color) : layout.backdrop.blur > 0 ? envMap.texture : hdri;
  const fog = layout.fog ? new Fog(layout.fog.color, layout.fog.near, layout.fog.far) : null;
  let saved: { toneMapping: ToneMapping; exposure: number } | null = null;
  return {
    id: p.id,
    shadows: true,
    attach() {
      scene.add(root);
      scene.environment = envMap.texture;
      scene.environmentIntensity = layout.envIntensity / mean;
      scene.environmentRotation.set(0, turn, 0);
      scene.background = backdrop;
      scene.backgroundRotation.set(0, turn, 0);
      scene.backgroundBlurriness = "blur" in layout.backdrop ? layout.backdrop.blur : 0;
      scene.backgroundIntensity = "intensity" in layout.backdrop ? layout.backdrop.intensity / mean : 1;
      scene.fog = fog;
      saved ??= { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
      renderer.toneMapping = NeutralToneMapping;
      renderer.toneMappingExposure = layout.exposure;
    },
    dispose() {
      scene.remove(root);
      // cleared only when still this one's: the next scene attaches first
      if (scene.environment === envMap.texture) scene.environment = null;
      if (scene.background === backdrop) scene.background = null;
      if (fog && scene.fog === fog) scene.fog = null;
      // restore what was there before attach; swap by disposing the old scene first
      if (saved) {
        renderer.toneMapping = saved.toneMapping ?? NoToneMapping;
        renderer.toneMappingExposure = saved.exposure;
        saved = null;
      }
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          for (const m of ([] as Material[]).concat(mesh.material)) {
            (m as MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
        if ((o as Light).isLight) (o as Light).dispose();
      });
      envMap.dispose();
      hdri?.dispose();
    },
  };
}

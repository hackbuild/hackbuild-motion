import { load } from "@hackbuild/avatar";
import { loadAvatar } from "@hackbuild/avatar/three";
import { vrmHook } from "@hackbuild/avatar/vrm";
import * as THREE from "three";

await load(); // the rig wasm that maps bone names
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene().add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0, 1.4, 3.2);
const input = Object.assign(document.createElement("input"), { type: "file", accept: ".vrm,.glb,.gltf,.fbx" });
document.body.append(input, renderer.domElement);

// you pick the model file; it keeps its own licence
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;
  const avatar = await loadAvatar(file, { name: file.name, vrm: vrmHook() });
  console.log(avatar.format, avatar.dialect, avatar.warnings);
  scene.add(avatar.root);
  renderer.setAnimationLoop(() => (avatar.update(1 / 60), renderer.render(scene, camera)));
};

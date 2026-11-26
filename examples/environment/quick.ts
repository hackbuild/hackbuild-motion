import * as THREE from "three";
import { missingFor, presetOf } from "@hackbuild/environment";
import { loadEnvironment } from "@hackbuild/environment/three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 3.5);

// a stand in for your character: a capsule at the origin, facing +Z
scene.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1), new THREE.MeshStandardMaterial()).translateY(0.8));

// the studio needs no file; room, cafe and outdoors list the files they need
console.log("room needs", missingFor(presetOf("room")!, () => false));
const env = await loadEnvironment("studio", scene, renderer);
env.attach();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

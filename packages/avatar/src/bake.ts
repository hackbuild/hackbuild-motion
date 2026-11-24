// Units baked into the model itself, so nothing above it carries a scale.
// Spring bones, hip travel and stage framing work in world units and assume
// an unscaled root. Every transform in the tree becomes S * M * S^-1, which
// for a uniform S only scales translations: node positions, vertex and morph
// positions, and the translation column of each skin's bind matrices.
import { type BufferGeometry, Matrix4, type Object3D, type Skeleton, type SkinnedMesh } from "three";

function scaleTranslation(m: Matrix4, s: number): void {
  m.elements[12]! *= s;
  m.elements[13]! *= s;
  m.elements[14]! *= s;
}

/** Scales `root` and everything under it by `s` in place; the root keeps scale 1. */
export function bakeScale(root: Object3D, s: number): void {
  if (Math.abs(s - 1) < 1e-6) return;
  const geometries = new Set<BufferGeometry>();
  const skeletons = new Set<Skeleton>();
  root.traverse((o) => {
    o.position.multiplyScalar(s);
    const mesh = o as SkinnedMesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    if (mesh.isSkinnedMesh) {
      scaleTranslation(mesh.bindMatrix, s);
      scaleTranslation(mesh.bindMatrixInverse, s);
      skeletons.add(mesh.skeleton);
    }
  });
  for (const sk of skeletons) for (const m of sk.boneInverses) scaleTranslation(m, s);
  const S = new Matrix4().makeScale(s, s, s);
  for (const g of geometries) {
    g.attributes.position?.applyMatrix4(S);
    for (const a of g.morphAttributes.position ?? []) a.applyMatrix4(S);
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
  root.updateMatrixWorld(true);
}

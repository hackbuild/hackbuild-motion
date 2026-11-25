// A still of a loaded avatar for the drop card: one small renderer per
// card, made on the first still, the body seen a little from its left and
// above as the clip thumbnails see their figure, so the two read alike.
import { Box3, DirectionalLight, HemisphereLight, type Object3D, OrthographicCamera, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from "three";

export class Still {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly canvas: HTMLCanvasElement;

  constructor(
    doc: Document,
    readonly width = 120,
    readonly height = 160,
  ) {
    this.canvas = doc.createElement("canvas");
    const key = new DirectionalLight(0xffffff, 2.6);
    key.position.set(1.6, 2.6, 2.4);
    const rim = new DirectionalLight(0xffffff, 1.4);
    rim.position.set(-2, 1.4, -2);
    this.scene.add(key, rim, new HemisphereLight(0xffffff, 0x303038, 1.3));
  }

  /** Draws `root` as a PNG, or null when there is no webgl here. `root` is put back where it was. */
  async draw(root: Object3D): Promise<Blob | null> {
    if (!this.renderer) {
      try {
        this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      } catch {
        return null;
      }
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
    }
    const parent = root.parent;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const c = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const aspect = this.width / this.height;
    const half = Math.max(size.y / 2, size.x / 2 / aspect) * 1.08;
    const cam = this.camera;
    Object.assign(cam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, near: 0.01, far: 100 });
    const d = Math.max(size.x, size.y, size.z) * 3 + 1;
    cam.position.set(c.x + Math.sin(0.42) * d, c.y + Math.sin(0.17) * d, c.z + Math.cos(0.42) * d);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    this.renderer.render(this.scene, cam);
    if (parent) parent.add(root);
    else this.scene.remove(root);
    return new Promise((ok) => this.canvas.toBlob(ok, "image/png"));
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}

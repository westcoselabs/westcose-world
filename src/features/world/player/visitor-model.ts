import {
  AnimationAction, AnimationMixer, Bone, Group, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial, MeshToonMaterial,
  Object3D, type Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** The textured, rigged visitor ("the Local"); see docs/design/character-v1/README.md. */
export const VISITOR_MODEL_URL = "/world/models/visitor.glb";

/** Clip names written by the retarget/pack step; every clip runs on the one skeleton. */
const CLIPS = ["Idle", "Jog", "Run", "Swim", "Tread"] as const;
type Clip = typeof CLIPS[number];
/** Ground speed (m/s) each locomotion clip's feet were measured to travel at timeScale 1. */
const NATURAL_SPEED = { Jog: 4.5, Run: 8 } as const;
/** How far the feet origin sits below the water surface: treading is upright, swimming lies flat. */
const TREAD_DEPTH = 1.32;
const SWIM_DEPTH = 0.42;

export interface VisitorPose {
  /** Smoothed ground speed in m/s. */
  speed: number;
  swimming: boolean;
  reducedMotion: boolean;
}

const smoothstep = (edge0: number, edge1: number, x: number) => MathUtils.smoothstep(x, edge0, edge1);

export class VisitorModel {
  readonly root = new Group();
  /** Spine bone the back-strapped board rides on. */
  spine: Bone | null = null;
  private mixer: AnimationMixer | null = null;
  private actions = new Map<Clip, AnimationAction>();
  private weights = new Map<Clip, number>(CLIPS.map(clip => [clip, clip === "Idle" ? 1 : 0]));
  private water = 0;
  private disposed = false;

  constructor() {
    this.root.name = "visitor-model";
    // glTF characters face +Z; the walker group's forward is -Z.
    this.root.rotation.y = Math.PI;
  }

  /** Resolves true once the model is in place, false if it failed (the box walker stays). */
  async load(url = VISITOR_MODEL_URL): Promise<boolean> {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (this.disposed) { disposeTree(gltf.scene); return false; }
      gltf.scene.traverse(object => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        const source = mesh.material as MeshStandardMaterial;
        // The world's flat toon shading, keeping the painted texture.
        mesh.material = new MeshToonMaterial({ map: source.map, name: "visitor" });
        source.dispose();
        mesh.castShadow = true;
        // Animated bounds drift from the bind box; never cull the player.
        mesh.frustumCulled = false;
      });
      this.spine = gltf.scene.getObjectByName("Spine02") as Bone | null;
      this.root.add(gltf.scene);
      this.mixer = new AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) {
        if (!(CLIPS as readonly string[]).includes(clip.name)) continue;
        const action = this.mixer.clipAction(clip);
        action.setLoop(LoopRepeat, Infinity);
        action.setEffectiveWeight(this.weights.get(clip.name as Clip) ?? 0);
        action.play();
        this.actions.set(clip.name as Clip, action);
      }
      return this.actions.size === CLIPS.length;
    } catch (error) {
      console.warn("[visitor] model unavailable, keeping the box walker", error);
      return false;
    }
  }

  get loaded() { return this.mixer !== null; }

  /** Depth of the feet origin below the support surface for the current water blend. */
  get waterDepth() {
    const swim = this.weights.get("Swim") ?? 0, tread = this.weights.get("Tread") ?? 0, total = swim + tread;
    return total > 0 ? this.water * (swim * SWIM_DEPTH + tread * TREAD_DEPTH) / total : this.water * TREAD_DEPTH;
  }

  update(dt: number, pose: VisitorPose) {
    if (!this.mixer) return;
    this.water = MathUtils.damp(this.water, pose.swimming ? 1 : 0, 6, dt);
    const moving = smoothstep(0.15, 2.4, pose.speed);
    const running = smoothstep(5.4, 7.6, pose.speed);
    const stroking = smoothstep(0.2, 1.8, pose.speed);
    const land = 1 - this.water;
    const target: Record<Clip, number> = {
      Idle: land * (1 - moving),
      Jog: land * moving * (1 - running),
      Run: land * moving * running,
      Tread: this.water * (1 - stroking),
      Swim: this.water * stroking,
    };
    for (const clip of CLIPS) {
      const weight = MathUtils.damp(this.weights.get(clip) ?? 0, target[clip], 10, dt);
      this.weights.set(clip, weight);
      this.actions.get(clip)?.setEffectiveWeight(weight);
    }
    // Locomotion clips play at the visitor's real speed so planted feet don't skate.
    this.actions.get("Jog")?.setEffectiveTimeScale(MathUtils.clamp(pose.speed / NATURAL_SPEED.Jog, 0.6, 1.4));
    this.actions.get("Run")?.setEffectiveTimeScale(MathUtils.clamp(pose.speed / NATURAL_SPEED.Run, 0.7, 1.3));
    this.actions.get("Swim")?.setEffectiveTimeScale(MathUtils.clamp(pose.speed / 2.5, 0.6, 1.2));
    // Reduced motion keeps the clips but slows the idle sway.
    this.actions.get("Idle")?.setEffectiveTimeScale(pose.reducedMotion ? 0.5 : 1);
    this.mixer.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.mixer) this.mixer.uncacheRoot(this.mixer.getRoot());
    disposeTree(this.root);
    this.root.removeFromParent();
  }
}

function disposeTree(root: Object3D) {
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const map = (material as MeshToonMaterial).map as Texture | null;
      map?.dispose();
      material.dispose();
    }
  });
}

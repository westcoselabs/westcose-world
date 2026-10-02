'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { WorldRuntimeState } from '../runtime/types';
import { PierPressureScene } from './scene';
import type { FishingSfx } from './sfx';
import type { TideResult } from './tide';

interface Props {
  runtime: WorldRuntimeState;
  sfx: FishingSfx;
  /** Called once per tide, a beat after it ends. */
  onFinish: (result: TideResult) => void;
}

/** Pier Pressure inside the world canvas. The scene owns the camera only while a tide is on;
 * Gary idles on his post at the end of the pier either way. */
export default function FishingController({ runtime, sfx, onFinish }: Props) {
  const scene = useMemo(() => new PierPressureScene(runtime), [runtime]);
  useEffect(() => { scene.connect(sfx, onFinish); }, [scene, sfx, onFinish]);
  useEffect(() => scene.listen(), [scene]);
  useEffect(() => () => scene.dispose(), [scene]);
  useFrame((frame, delta) => scene.update(frame.camera, delta));
  return <primitive object={scene.root} />;
}

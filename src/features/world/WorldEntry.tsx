'use client';

import dynamic from 'next/dynamic';
import { Component, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Map, MoveUpRight } from 'lucide-react';
import { DESTINATIONS } from '@/content/registry';

const WorldRuntime = dynamic(() => import('./WorldRuntime'), {
  ssr: false,
  loading: () => <div className="runtime-loading"><span className="loading-line"/><span>Shaping your planet…</span><small>Preparing your place in the world</small></div>,
});

class WorldErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback reason="The world couldn’t load on this device." /> : this.props.children; }
}

function Fallback({ reason }: { reason: string }) {
  return <main className="fallback-world"><div className="fallback-coast" aria-hidden="true"/><header className="world-header"><div className="site-name">WESTCOSE <span>WORLD</span></div><span className="version-label">A SMALL PLANET</span></header><section className="fallback-content"><div className="eyebrow">WELCOME TO WESTCOSE</div><h1>A place for<br/>what’s next.</h1><p>{reason}</p><p>You can still visit every destination below.</p><nav aria-label="World destinations">{DESTINATIONS.map(d => <Link key={d.id} href={d.href}><span>{d.number}</span>{d.label}<ArrowUpRight size={18}/></Link>)}</nav><button className="text-button" onClick={() => window.location.reload()}>Try loading again <MoveUpRight size={15}/></button></section></main>;
}

type Capability = 'checking' | 'ready' | 'unsupported';
let rendererCapability: 'ready' | 'unsupported' | null = null;

function capabilitySnapshot(): Capability {
  return rendererCapability ?? 'checking';
}

// Browser capability is an external store. Probe only after subscription/commit;
// server rendering and render functions never create a graphics context.
function subscribeCapability(onChange: () => void) {
  const pointer = window.matchMedia('(pointer: coarse)');
  const update = () => {
    if (rendererCapability !== null) {
      onChange();
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      rendererCapability = gl ? 'ready' : 'unsupported';
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { rendererCapability = 'unsupported'; }
    onChange();
  };
  update();
  window.addEventListener('resize', update);
  pointer.addEventListener('change', update);
  return () => {
    window.removeEventListener('resize', update);
    pointer.removeEventListener('change', update);
  };
}

const serverCapabilitySnapshot = (): Capability => 'checking';

export default function WorldEntry() {
  const capability = useSyncExternalStore(subscribeCapability, capabilitySnapshot, serverCapabilitySnapshot);
  if (capability === 'unsupported') return <Fallback reason="This browser couldn’t start the 3D renderer. The whole directory is still open."/>;
  if (capability === 'checking') return <main className="runtime-loading"><Map size={24}/><span>Finding the coast…</span><nav className="loading-links">{DESTINATIONS.map(d => <Link key={d.id} href={d.href}>{d.label}</Link>)}</nav></main>;
  return <WorldErrorBoundary><WorldRuntime/></WorldErrorBoundary>;
}

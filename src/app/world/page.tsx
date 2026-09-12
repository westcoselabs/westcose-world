import type { Metadata } from 'next';
import WorldEntry from '@/features/world/WorldEntry';
import { DESTINATIONS } from '@/content/registry';

export const metadata: Metadata = { title: 'Explore the planet' };

export default function WorldPage() {
  return <>
    <WorldEntry />
    <noscript><main className="content-page"><h1>WestCose World</h1><p>A small planet to explore. JavaScript is needed for the 3D world; these destinations work without it.</p><nav>{DESTINATIONS.map(d => <p key={d.id}><a href={d.href}>{d.label}</a></p>)}</nav></main></noscript>
  </>;
}

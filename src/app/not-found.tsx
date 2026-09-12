import Link from 'next/link';
export default function NotFound() { return <main className="content-page"><div className="eyebrow">OFF THE MAP / 404</div><h1>This place isn’t here.</h1><p>Head back to the coast.</p><Link className="button dark" href="/world" prefetch={false}>Back to world</Link></main>; }

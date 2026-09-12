import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { CONTENT, DESTINATIONS, type ContentId } from '@/content/registry';

export function ContentPage({ id }: { id: ContentId }) {
  const content = CONTENT[id];
  return <main className="content-page">
    <header className="content-header"><Link className="site-name" href="/world" prefetch={false}>WESTCOSE <span>WORLD</span></Link><Link className="button small" href="/world" prefetch={false}><ArrowLeft size={16} /> Back to world</Link></header>
    <div className="content-layout">
      <aside><span className="micro">THE DIRECTORY</span><nav aria-label="Portfolio">{DESTINATIONS.map(d => <Link key={d.id} href={d.href} aria-current={d.id === id ? 'page' : undefined}><span>{d.number}</span>{d.label}<ArrowUpRight size={15}/></Link>)}</nav><p>Take the direct route.<br/>Or take a walk.</p></aside>
      <article><div className="eyebrow">{content.eyebrow}</div><h1>{content.title}</h1><p className="content-summary">{content.summary}</p><span className="status-label"><span />{content.status}</span><div className={`content-illustration illustration-${id}`} aria-hidden="true"><span>{id === 'fightclub' ? 'FIGHT\nCLUB' : id === 'world' ? 'A PLACE\nFOR IDEAS.' : id === 'services' ? 'WORK IN\nPROGRESS.' : id === 'contact' ? 'SAY\nHELLO.' : 'MADE TO\nEXPLORE.'}</span><small>WESTCOSE WORLD / FIRST PLAYABLE</small></div>{content.paragraphs.map(p => <p key={p}>{p}</p>)}{id === 'fightclub' && <div className="notice">Game unavailable · The FightClub build or launch URL has not been connected.</div>}<Link className="button dark" href="/world" prefetch={false}><ArrowLeft size={17}/> Back to world</Link></article>
    </div><footer className="content-footer">WestCose World <span>A place for what’s next.</span></footer>
  </main>;
}

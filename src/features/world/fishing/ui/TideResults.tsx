'use client';

import { ArrowRight, RotateCcw, X } from 'lucide-react';
import Modal from '../../ui/Modal';
import { catchName, formatClams, formatWeight } from '../format';
import type { TideOutcome } from '../progress';
import type { TideResult } from '../tide';

export type TideResultsAction = 'again' | 'tackle' | 'explore';

/** The Tide Report: a front page for the tide, what made the cooler, and what was new. */
export default function TideResults({ result, outcome, onAction }: { result: TideResult; outcome: TideOutcome | null; onAction: (action: TideResultsAction) => void }) {
  const s = result.stats;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return <Modal title="Tide Report" onClose={() => onAction('explore')} className="snowboard-results fishing-results">
    <span className="results-eyebrow">THE PIER PRESSURE GAZETTE · {date.toUpperCase()}</span>
    <h2 className="gazette-headline">{result.headline}</h2>
    <div className="results-headline">
      <strong className="gazette-total" data-testid="tide-clams">{formatClams(result.clams)} clams</strong>
      {outcome?.newBest && <span className="results-best">NEW BEST TIDE</span>}
      {outcome?.newChain && <span className="results-best">LONGEST CHAIN</span>}
    </div>
    <p className="results-summary">{result.cooler.length ? `${result.cooler.length} in the cooler, from ${s.casts} casts. Best chain ×${result.bestChain}.` : 'The cooler is empty. The view was nice, though.'}{s.gary ? ` Gary stole ${s.gary}.` : ''}</p>
    {result.cooler.length > 0 && <ul className="gazette-cooler">
      {result.cooler.map(c => <li key={c.id}><span>{catchName(c.species, c.variant)}{c.daily && <em>DAILY ×3</em>}</span><small>{formatWeight(c.weight)}</small><b>{formatClams(c.clams)}</b></li>)}
    </ul>}
    <dl className="results-breakdown">
      <div><dt>Landed</dt><dd>{s.landed}</dd></div>
      <div><dt>Perfect hooksets</dt><dd>{s.perfects}</dd></div>
      <div><dt>Bows</dt><dd>{s.bows}/{s.bows + s.missedBows}</dd></div>
      <div><dt>Snapped</dt><dd>{s.snaps}</dd></div>
      <div><dt>Spat</dt><dd>{s.spits}</dd></div>
      <div><dt>Ambushes</dt><dd>{s.ambushes}</dd></div>
    </dl>
    {outcome && (outcome.newSpecies.length > 0 || outcome.newVariants.length > 0 || outcome.dailyDone) && <ul className="results-challenges">
      {outcome.newSpecies.map(id => <li key={id} className="is-done">New in the Fish-o-dex: {catchName(id)}</li>)}
      {outcome.newVariants.map(v => <li key={`${v.species}:${v.variant}`} className="is-done">New variant: {catchName(v.species, v.variant)}</li>)}
      {outcome.dailyDone && <li className="is-done">Caught the Catch of the Day</li>}
    </ul>}
    <div className="results-actions">
      <button type="button" className="results-primary" data-testid="tide-again" onClick={() => onAction('again')}>Another tide<RotateCcw size={15} /></button>
      <button type="button" data-testid="tide-tackle" onClick={() => onAction('tackle')}>Tackle Box<ArrowRight size={15} /></button>
      <button type="button" data-testid="tide-leave" onClick={() => onAction('explore')}>Leave the pier<X size={15} /></button>
    </div>
    <small className="results-note">Records and clams stay on this device.</small>
  </Modal>;
}

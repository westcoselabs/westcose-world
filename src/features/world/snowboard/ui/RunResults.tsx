'use client';

import { Compass, ListOrdered, RotateCcw, Star, Ticket } from 'lucide-react';
import { MOUNTAIN_FINISH_AREAS } from '../../data/mountain-layout';
import { skiRunById } from '../../data/ski-runs';
import Modal from '../../ui/Modal';
import type { RecordOutcome } from '../progress';
import { formatPoints, formatTime, MEDAL_LABEL, MEDALS, RUN_RULES, type RunResult } from '../scoring';
import DifficultyBadge from './DifficultyBadge';

export type ResultsAction = 'again' | 'runs' | 'resort' | 'explore';

/** Score breakdown, medal, records and challenges after a finished run. */
export default function RunResults({ result, outcome, onAction }: { result: RunResult; outcome: RecordOutcome | null; onAction: (action: ResultsAction) => void }) {
  const run = skiRunById(result.runId), rules = RUN_RULES[result.runId];
  const next = MEDALS.slice(MEDALS.indexOf(result.medal) + 1)[0] as Exclude<RunResult['medal'], 'bronze'> | undefined;
  const lines: [string, number][] = [
    ['Tricks', result.totals.tricks], ['Carving', result.totals.carving], ['Gates', result.totals.gates], ['Tokens', result.totals.tokens],
    ['Near misses', result.totals.nearMisses], ['Time bonus', result.totals.timeBonus], ['All tokens', result.totals.tokenBonus],
  ];
  return <Modal title="Run results" onClose={() => onAction('resort')} className="snowboard-results">
    <span className="results-eyebrow"><DifficultyBadge difficulty={run.difficulty} size="small" />{run.name} · {run.rating}</span>
    <div className="results-headline">
      <span className={`results-medal medal-${result.medal}`}>{MEDAL_LABEL[result.medal]}</span>
      <h2 data-testid="results-score">{formatPoints(result.score)}</h2>
      {outcome?.newBest && <span className="results-best">NEW BEST</span>}
    </div>
    <p className="results-summary">
      {formatTime(result.time)} · par {formatTime(result.par)}{outcome?.newTime && ' · best time'}
      {result.stats.bestTrick && <> · best trick {result.stats.bestTrick.name} ({formatPoints(result.stats.bestTrick.points)})</>}
      {next ? <> · {MEDAL_LABEL[next]} at {formatPoints(rules.medals[next])}</> : <> · top medal</>}
    </p>
    <dl className="results-breakdown">
      {lines.filter(([, points]) => points > 0).map(([label, points]) => <div key={label}><dt>{label}</dt><dd>{formatPoints(points)}</dd></div>)}
      <div><dt>Tokens</dt><dd>{result.stats.tokens}/{result.tokenTotal}</dd></div>
      {result.gateTotal > 0 && <div><dt>Gates</dt><dd>{result.stats.gatesPassed}/{result.gateTotal}</dd></div>}
      <div><dt>Crashes</dt><dd>{result.stats.crashes}</dd></div>
    </dl>
    <ul className="results-challenges">
      {rules.challenges.map((challenge, i) => <li key={challenge.label} className={result.challenges[i] ? 'is-done' : ''}>
        <Star size={14} aria-hidden="true" /><span>{challenge.label}</span>{outcome?.newStars[i] && <em>New</em>}
        <span className="sr-only">{result.challenges[i] ? 'completed' : 'not completed'}</span>
      </li>)}
    </ul>
    <div className="results-actions">
      <button className="results-primary" data-testid="ride-again" onClick={() => onAction('again')}>Ride again<RotateCcw size={15} /></button>
      <button onClick={() => onAction('runs')}>Other runs<ListOrdered size={15} /></button>
      <button data-testid="back-to-resort" onClick={() => onAction('resort')}>Back to resort<Ticket size={15} /></button>
      <button data-testid="explore-from-here" onClick={() => onAction('explore')}>Explore from {MOUNTAIN_FINISH_AREAS[run.finish].name}<Compass size={15} /></button>
    </div>
    <span className="results-note">Records stay on this device.</span>
  </Modal>;
}

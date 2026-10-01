'use client';

import { Check, LogOut, RotateCcw, Wind } from 'lucide-react';
import Modal from '../../ui/Modal';
import type { SkateGameResult, SkateLetterId } from '../../runtime/skate-session';
import type { SkateRecordOutcome } from '../progress';
import { formatClock, formatPoints } from './SkateHud';

export type SkateResultsAction = 'again' | 'skate' | 'off';
const LETTERS: readonly SkateLetterId[] = ['S', 'K', 'A', 'T', 'E'];

/** The end of a game of S.K.A.T.E.: letters, time, score and device records. */
export default function SkateResults({ result, outcome, onAction }: { result: SkateGameResult; outcome: SkateRecordOutcome | null; onAction: (action: SkateResultsAction) => void }) {
  const best = outcome?.progress, got = new Set(result.got);
  return <Modal title="Game of S.K.A.T.E. results" onClose={() => onAction('skate')} className="snowboard-results skate-results">
    <span className="results-eyebrow">WestCose Skate Park · Game of S.K.A.T.E.</span>
    <div className="results-headline">
      <h2 data-testid="skate-results-headline">{result.complete ? 'S.K.A.T.E.!' : 'Time’s up'}</h2>
      {outcome?.newBestTime && <span className="results-best">NEW BEST TIME</span>}
      {!outcome?.newBestTime && outcome?.newBestScore && <span className="results-best">NEW HIGH SCORE</span>}
    </div>
    <p className="skate-results-letters" aria-label={`${result.letters} of 5 letters`}>
      {LETTERS.map(id => <span key={id} className={got.has(id) ? 'is-got' : ''}>{id}{got.has(id) && <Check size={11} aria-hidden="true" />}</span>)}
    </p>
    <dl className="results-breakdown">
      <div><dt>Letters</dt><dd>{result.letters}/5</dd></div>
      <div><dt>Time</dt><dd>{result.complete ? formatClock(result.time) : '2:00'}</dd></div>
      <div><dt>Score</dt><dd data-testid="skate-results-score">{formatPoints(result.score)}</dd></div>
      <div><dt>Best combo</dt><dd>{formatPoints(result.bestCombo)}</dd></div>
      {best && <div><dt>Best time</dt><dd>{best.bestTime === null ? '—' : formatClock(best.bestTime)}</dd></div>}
      {best && <div><dt>High score</dt><dd>{formatPoints(best.bestScore)}</dd></div>}
    </dl>
    <p className="results-summary">{result.complete ? 'Every letter collected. Try it faster, or chase a bigger combo.' : 'Each letter asks for a skill: an ollie, vert air in the Deep End, a ledge grind, the whole Snake Run and an air out of the South Quarter.'}</p>
    <div className="results-actions">
      <button className="results-primary" data-testid="skate-play-again" onClick={() => onAction('again')}>Play again<RotateCcw size={15} /></button>
      <button data-testid="skate-keep-skating" onClick={() => onAction('skate')}>Keep skating<Wind size={15} /></button>
      <button data-testid="skate-board-off" onClick={() => onAction('off')}>Board off<LogOut size={15} /></button>
    </div>
    <span className="results-note">Records stay on this device.</span>
  </Modal>;
}

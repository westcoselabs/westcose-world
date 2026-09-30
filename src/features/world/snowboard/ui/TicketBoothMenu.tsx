'use client';

import { ArrowRight, Star } from 'lucide-react';
import { MOUNTAIN_FINISH_AREAS } from '../../data/mountain-layout';
import { SKI_RUNS, type SkiRunId } from '../../data/ski-runs';
import Modal from '../../ui/Modal';
import type { SnowboardProgress } from '../progress';
import { formatPoints, formatTime, MEDAL_LABEL, RUN_RULES } from '../scoring';
import DifficultyBadge, { DIFFICULTY_TEXT } from './DifficultyBadge';

/** The lift-ticket booth: pick a run, see records, learn the controls. */
export default function TicketBoothMenu({ progress, onRide, onClose }: { progress: SnowboardProgress; onRide: (id: SkiRunId) => void; onClose: () => void }) {
  return <Modal title="Lift tickets" onClose={onClose} className="snowboard-tickets">
    <span className="tickets-eyebrow">LIFT TICKETS · SUMMIT 78 M · FOUR RUNS</span>
    <h2>Pick a run.</h2>
    <p className="tickets-intro">The lift drops you at the summit. Carve, jump and chain tricks for points, then ride the run out to its finish.</p>
    <ol className="tickets-runs">
      {SKI_RUNS.map(run => {
        const record = progress[run.id], rules = RUN_RULES[run.id];
        return <li key={run.id}>
          <button className="ticket-run" data-testid={`ride-${run.id}`} onClick={() => onRide(run.id)} aria-label={`Ride ${run.name}, ${run.rating}, ${DIFFICULTY_TEXT[run.difficulty]}`}>
            <DifficultyBadge difficulty={run.difficulty} />
            <span className="ticket-main">
              <strong>{run.name}</strong>
              <small>{run.rating} · {DIFFICULTY_TEXT[run.difficulty]}</small>
              <span className="ticket-facts">{Math.round(run.length)} m · {Math.round(run.drop)} m drop · par {formatTime(run.par)} · to {MOUNTAIN_FINISH_AREAS[run.finish].name}</span>
              <span className="ticket-record">
                {record.rides > 0 ? <>Best {formatPoints(record.best)}{record.medal && <em className={`medal medal-${record.medal}`}>{MEDAL_LABEL[record.medal]}</em>}</> : <>Not ridden · gold at {formatPoints(rules.medals.gold)}</>}
                <span className="ticket-stars" aria-label={`${record.stars.filter(Boolean).length} of 3 challenges`}>
                  {record.stars.map((done, i) => <Star key={i} size={12} className={done ? 'is-earned' : ''} aria-hidden="true" />)}
                </span>
              </span>
            </span>
            <span className="ticket-go">Ride<ArrowRight size={15} /></span>
          </button>
        </li>;
      })}
    </ol>
    <details className="tickets-controls">
      <summary>Controls</summary>
      <dl>
        <dt>A / D or ← / →</dt><dd>Carve. In the air: spin</dd>
        <dt>W or ↑</dt><dd>Tuck for speed. In the air: front flip</dd>
        <dt>S or ↓</dt><dd>Brake. In the air: back flip</dd>
        <dt>Space</dt><dd>Hold to crouch, release to ollie. Pop right at a lip</dd>
        <dt>J / K / L</dt><dd>Grab in the air: indy, melon, method</dd>
        <dt>R · Esc</dt><dd>Restart the run · pause</dd>
        <dt>Touch</dt><dd>Drag the pad to steer, up to tuck, down to brake. Hold Jump, release to ollie. Hold Grab in the air</dd>
      </dl>
      <p>Land tricks within three seconds of each other to build a combo and raise the multiplier. Crashing loses the open combo.</p>
    </details>
  </Modal>;
}

'use client';

import { ArrowRight, Check } from 'lucide-react';
import Modal from '../../ui/Modal';
import { catchName, formatClams, formatWeight } from '../format';
import { dexCompletion, type FishingProgress } from '../progress';
import { ALL_CATCHES, TOP_TIER, VARIANT_IDS, VARIANTS } from '../species';
import { MAX_LEVEL, UPGRADE_IDS, UPGRADES, upgradeCost, wormsFor, type UpgradeId } from '../tackle';
import type { DailyCatch } from '../tide';

/** The bait cart at the end of the pier: start a tide, spend clams in the Tackle Box, page
 * through the Fish-o-dex, and switch sound on or off. */
export default function TackleMenu({ progress, daily, dailyDone, sound, onStart, onBuy, onSound, onClose }: {
  progress: FishingProgress; daily: DailyCatch; dailyDone: boolean; sound: boolean;
  onStart: () => void; onBuy: (id: UpgradeId) => void; onSound: (on: boolean) => void; onClose: () => void;
}) {
  const sunKnown = !!progress.dex.sun;
  const completion = Math.round(dexCompletion(progress) * 100);
  return <Modal title="Pier Pressure" onClose={onClose} className="snowboard-tickets fishing-tackle">
    <span className="tickets-eyebrow">PIER PRESSURE · BAIT &amp; TACKLE · END OF THE PIER</span>
    <h2>There’s always a bigger fish.</h2>
    <p className="tickets-intro">Land a fish, then keep it or hook it back on as live bait for something one step up the food chain. Sardines, sharks, whales and worse. Snap the line and the whole chain is gone. Hesitate and Gary takes it.</p>
    <div className="tackle-start">
      <button type="button" className="tackle-go" data-testid="start-tide" onClick={onStart}>{progress.tides ? 'Start a tide' : 'Start your first tide'}<ArrowRight size={16} /></button>
      <span><b>{wormsFor(progress.upgrades)}</b> worms a tide · <b data-testid="tackle-clams">{formatClams(progress.clams)}</b> clams to spend</span>
    </div>
    <p className="tackle-daily"><span>CATCH OF THE DAY</span><strong>{catchName(daily.species, daily.variant)}</strong> pays triple.{dailyDone && <em><Check size={12} />Caught today</em>}</p>

    <section className="tackle-box" aria-label="Tackle Box">
      <h3>Tackle Box</h3>
      <ul>
        {UPGRADE_IDS.map(id => {
          const level = progress.upgrades[id], cost = upgradeCost(level), track = UPGRADES[id];
          return <li key={id}>
            <span className="tackle-name"><strong>{track.name}</strong><small>{track.levels[level]}{level < MAX_LEVEL ? ` → ${track.levels[level + 1]}` : ''}</small></span>
            <span className="tackle-pips" aria-label={`Level ${level} of ${MAX_LEVEL}`}>{Array.from({ length: MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'is-owned' : ''} />)}</span>
            <span className="tackle-effect">{track.effect}</span>
            <button type="button" data-testid={`buy-${id}`} disabled={cost === null || progress.clams < cost} onClick={() => onBuy(id)}>{cost === null ? 'Maxed' : `${formatClams(cost)} clams`}</button>
          </li>;
        })}
      </ul>
    </section>

    <dl className="tackle-records">
      <div><dt>Best tide</dt><dd>{formatClams(progress.bestTide)} clams</dd></div>
      <div><dt>Longest chain</dt><dd>×{progress.bestChain}</dd></div>
      <div><dt>Biggest catch</dt><dd>{progress.biggest ? `${catchName(progress.biggest.species, 'normal', sunKnown)}, ${formatWeight(progress.biggest.weight)}` : '—'}</dd></div>
      <div><dt>Tides fished</dt><dd>{progress.tides}</dd></div>
      <div><dt>Stolen by Gary</dt><dd>{progress.garyThefts}</dd></div>
    </dl>

    <details className="tickets-controls tackle-dex">
      <summary>Fish-o-dex · {completion}% complete</summary>
      <ul>
        {ALL_CATCHES.map(species => {
          const entry = progress.dex[species.id], seen = !!entry;
          const hidden = !seen && species.tier === TOP_TIER;
          return <li key={species.id} className={seen ? 'is-seen' : ''}>
            <strong>{seen ? species.name : hidden ? '???' : '? ? ?'}</strong>
            <small>{species.tier < 0 ? 'Junk' : seen ? `${entry.caught} landed · best ${formatWeight(entry.best)}` : 'Not yet landed'}</small>
            {species.tier >= 0 && <span className="dex-variants" aria-label={`${entry?.variants.length ?? 0} of ${VARIANT_IDS.length} variants`}>
              {VARIANT_IDS.map(v => <i key={v} title={VARIANTS[v].name || 'Normal'} className={entry?.variants.includes(v) ? `is-found dex-${v}` : `dex-${v}`} />)}
            </span>}
          </li>;
        })}
      </ul>
    </details>

    <label className="note-effects tackle-sound"><span>Sound effects</span><input type="checkbox" data-testid="fishing-sound" checked={sound} onChange={event => onSound(event.target.checked)} /></label>
    <details className="tickets-controls">
      <summary>How to fish</summary>
      <dl>
        <dt>Space</dt><dd>Hold to charge a cast, let go in the gold band. Tap on the CHOMP to strike. Hold to reel</dd>
        <dt>A / D or ← / →</dt><dd>Aim the cast. In a fight: steer against a bolt</dd>
        <dt>S or ↓</dt><dd>Bow to a jumping fish, right as it peaks</dd>
        <dt>E · Space</dt><dd>Keep the catch · bait it for something bigger</dd>
        <dt>Esc</dt><dd>Pause; quitting keeps what is in your cooler</dd>
        <dt>Touch</dt><dd>Hold the round button to cast and reel, tap it to strike. Drag the pad to aim and steer, pull it down to bow</dd>
      </dl>
      <p>Let go of the reel when a fish runs or dives, or the line snaps. Too slack for too long and it spits the hook. Tells give each move away: read them.</p>
    </details>
  </Modal>;
}

/** The Tackle Box: five upgrade tracks bought with clams, and what they do to a tide. */
import type { Gear } from './fight';
import { FISHING as T } from './tuning';

export type UpgradeId = 'line' | 'reel' | 'rod' | 'bucket' | 'charm';
export type Upgrades = Record<UpgradeId, number>;
export const UPGRADE_IDS: readonly UpgradeId[] = ['line', 'reel', 'rod', 'bucket', 'charm'];
export const MAX_LEVEL = 3;
/** Clams for the first, second and third level of any track. */
export const UPGRADE_COSTS: readonly number[] = [150, 600, 2400];
export const NO_UPGRADES: Readonly<Upgrades> = { line: 0, reel: 0, rod: 0, bucket: 0, charm: 0 };

export const UPGRADES: Record<UpgradeId, { name: string; effect: string; levels: readonly string[] }> = {
  line: { name: 'Line', effect: 'Snap limit +12% a level', levels: ['Mono', 'Braid', 'Steel Leader', 'Grandma’s Knitting Yarn'] },
  reel: { name: 'Reel', effect: 'Reels 12% faster a level', levels: ['Rusty Reel', 'Smooth Reel', 'Turbo Reel', 'Industrial Winch'] },
  rod: { name: 'Rod', effect: 'Tires fish 12% faster a level', levels: ['Stick', 'Graphite', 'Carbon', 'Pool Noodle of Destiny'] },
  bucket: { name: 'Bait Bucket', effect: 'One more worm a tide a level', levels: ['Coffee Can', 'Bait Bucket', 'Big Bucket', 'Worm Hotel'] },
  charm: { name: 'Lucky Charm', effect: 'Rarer variants, and a wider perfect hookset', levels: ['Nothing', 'Rabbit’s Foot', 'Four-Leaf Clover', 'Gary’s Feather'] },
};

export const upgradeCost = (level: number) => level < MAX_LEVEL ? UPGRADE_COSTS[level] : null;
export const gearFor = (u: Upgrades): Gear => ({ snapAt: 1 + .12 * u.line, reelSpeed: T.fight.reelSpeed * (1 + .12 * u.reel), drain: 1 + .12 * u.rod });
export const wormsFor = (u: Upgrades) => T.worms + u.bucket;
/** Multiplies every variant's chance. */
export const luckFor = (u: Upgrades) => 1.35 ** u.charm;
/** Seconds after the CHOMP that still count as a perfect hookset. */
export const perfectFor = (u: Upgrades) => T.bite.perfect + .02 * u.charm;

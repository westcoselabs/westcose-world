/** Numbers and names for Pier Pressure's HUD, menu and Tide Report. */
import { speciesById, TIERS, TOP_TIER, VARIANTS, type VariantId } from './species';

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const formatClams = (clams: number) => whole.format(Math.round(clams));

/** Pounds, readable from a sardine to the Sun: astronomical weights spelled out in full. */
export function formatWeight(pounds: number) {
  if (pounds < 10) return `${pounds.toFixed(1)} lb`;
  if (pounds < 1e15) return `${whole.format(pounds)} lb`;
  const [mantissa, exponent] = pounds.toExponential(3).split('e');
  const digits = mantissa.replace('.', ''), zeros = Number(exponent) - (digits.length - 1);
  return `${group(digits + '0'.repeat(Math.max(0, zeros)))} lb`;
}

export const tierName = (tier: number) => TIERS[Math.max(0, Math.min(TOP_TIER, tier))].name;

/** "Shiny Mackerel"; the top of the chain stays "???" until it has been landed once. */
export function catchName(id: string, variant: VariantId = 'normal', known = true) {
  const species = speciesById(id);
  if (species.tier === TOP_TIER && !known) return '???';
  const prefix = VARIANTS[variant].name;
  return prefix ? `${prefix} ${species.name}` : species.name;
}

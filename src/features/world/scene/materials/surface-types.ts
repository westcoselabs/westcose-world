/** Stable material IDs travel with the merged geometry, so the kit keeps its batching. */
export const SURFACE = { plaster: 0, timber: 1, metal: 2, paving: 3, asphalt: 4, gravel: 5, sand: 6, scrub: 7 } as const;
const timber = new Set(['#a78a68','#c4ac87','#b6a68b','#b5a58b','#968574','#80715e','#bcab8a','#aa9678','#a08f73','#93816c','#776c5d']);
const metal = new Set(['#242c2e','#647778','#5b7e8a','#a66a45','#425f65']);
export function architecturalSurface(color: string) {
  return timber.has(color.toLowerCase()) ? SURFACE.timber : metal.has(color.toLowerCase()) ? SURFACE.metal : SURFACE.plaster;
}
export function groundSurface(color: string) {
  if (color === '#647778') return SURFACE.asphalt;
  if (['#968574','#93816C'].includes(color)) return SURFACE.timber;
  if (['#C4A97C','#CEB586','#AD9775'].includes(color)) return SURFACE.sand;
  if (['#A99B80','#ABA38E'].includes(color)) return SURFACE.gravel;
  return SURFACE.paving;
}

export type CoastalSpecies = 'oak' | 'cypress';
export type CoastalRegion = {
  id: string; name: string; center: readonly [number, number];
  reach: readonly [number, number]; trees: number;
  species: CoastalSpecies | 'mixed'; wind: number; seed: number;
};

/** Centers use the town chart; reaches and all planting gaps are physical metres. */
export const COASTAL_REGIONS: readonly CoastalRegion[] = [
  { id: 'east-bluff', name: 'East Bluff', center: [59, 0], reach: [10, 8], trees: 12, species: 'cypress', wind: 0.5, seed: 201 },
  { id: 'east-wood', name: 'East Oak Wood', center: [67, 22], reach: [12, 9], trees: 14, species: 'oak', wind: 0.7, seed: 227 },
  { id: 'lantern-ridge', name: 'Lantern Ridge', center: [88, 12], reach: [12, 9], trees: 14, species: 'mixed', wind: 0.9, seed: 263 },
  { id: 'outer-headland', name: 'Outer Headland', center: [94, -5], reach: [11, 7], trees: 12, species: 'cypress', wind: 0.7, seed: 293 },
  { id: 'far-wood', name: 'Far Oak Wood', center: [110, 31], reach: [12, 9], trees: 14, species: 'oak', wind: 1.2, seed: 331 },
  { id: 'far-cypress', name: 'Salt Cypress Grove', center: [-108, 2], reach: [13, 8], trees: 14, species: 'cypress', wind: 1.1, seed: 367 },
  { id: 'west-headland', name: 'West Headland', center: [-87, -5], reach: [12, 8], trees: 12, species: 'mixed', wind: 0.4, seed: 409 },
  { id: 'west-wood', name: 'West Oak Wood', center: [-77, 20], reach: [12, 10], trees: 14, species: 'oak', wind: 0.6, seed: 443 },
  { id: 'inland-cypress', name: 'Inland Cypress Grove', center: [-57, 8], reach: [10, 8], trees: 12, species: 'cypress', wind: 0.3, seed: 479 },
  { id: 'west-ridge', name: 'West Ridge', center: [-55, 36], reach: [11, 7], trees: 10, species: 'oak', wind: 0.9, seed: 509 },
  { id: 'high-north', name: 'High North Grove', center: [35, 46], reach: [9, 7], trees: 10, species: 'mixed', wind: 1.5, seed: 547 },
  { id: 'north-saddle', name: 'North Saddle', center: [-6, 45], reach: [10, 7], trees: 8, species: 'oak', wind: 1.2, seed: 577 },
  { id: 'east-fringe', name: 'Works Fringe', center: [50, 34], reach: [8, 7], trees: 8, species: 'mixed', wind: 0.8, seed: 613 },
  { id: 'west-fringe', name: 'West Town Fringe', center: [-43, 3], reach: [8, 5], trees: 6, species: 'mixed', wind: 0.3, seed: 647 },
  // Interlocking middle-slope groves join the headland and ridge planting ribbons.
  // Appended regions preserve the original grove anchors and their walking clearances.
  { id: 'far-middle', name: 'Far Slope Grove', center: [111, 16], reach: [12, 8], trees: 14, species: 'mixed', wind: 0.55, seed: 683 },
  { id: 'salt-wood-link', name: 'Salt Wood Hollow', center: [-102, 21], reach: [11, 9], trees: 14, species: 'oak', wind: 1.05, seed: 719 },
  { id: 'western-middle', name: 'West Slope Grove', center: [-61, 22], reach: [11, 8], trees: 12, species: 'mixed', wind: 0.72, seed: 751 },
  { id: 'western-lower', name: 'West Lower Grove', center: [-81, 7], reach: [11, 8], trees: 12, species: 'mixed', wind: 0.4, seed: 787 },
  { id: 'eastern-middle', name: 'East Ridge Hollow', center: [78, 31], reach: [11, 8], trees: 12, species: 'oak', wind: 1.0, seed: 823 },
  { id: 'eastern-lower', name: 'East Lower Grove', center: [72, 8], reach: [10, 7], trees: 12, species: 'mixed', wind: 0.48, seed: 859 },
];

export const COASTAL_TRAILS = [
  { id: 'east-headland-walk', width: 1.25, points: [[49, -2], [61, -5], [75, -3], [90, -5], [107, -4]] },
  { id: 'west-headland-walk', width: 1.25, points: [[-111, -3], [-96, -6], [-80, -5], [-64, -3], [-49, -1]] },
  { id: 'ridge-walk', width: 1.1, points: [[49, 33], [66, 40], [88, 43], [107, 41], [-104, 42]] },
] as const;

export const COASTAL_LOOKOUTS = [
  { id: 'east-lookout', center: [81, -7.1], yaw: 0.18 },
  { id: 'west-lookout', center: [-87, -8.1], yaw: -0.2 },
  { id: 'ridge-lookout', center: [106, 39.2], yaw: 2.6 },
] as const;

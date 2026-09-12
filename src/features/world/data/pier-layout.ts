import { Vector3 } from 'three';
import { MAP_RADIUS, mapFrame, mapMetric, mapPoint } from './world-map';

/** Widths are physical surface metres on the authored periodic map. */
export const PIER_LAYOUT = {
  radius:MAP_RADIUS,
  entrance:[0,-30] as const,
  neckEnd:[0,-40] as const,
  width:3.8,
  elevation:1.5,
  head:{center:[0,-43] as const,width:8,depth:8},
  approach:{start:[0,-16] as const,end:[0,-30] as const,startElevation:.1},
  railStartZ:-17,
  railHeight:1.12,
  boardThickness:.18,
  plankPitch:.24,
  pileBottom:-3.2,
} as const;

export type PierPart='approach'|'walkway'|'head';
export type PierSurface={height:number;part:PierPart};
export type PierEdge={id:string;start:readonly [across:number,z:number];end:readonly [across:number,z:number]};

/** The broad fishing head overlaps the final metre of the narrow neck. */
export function pierPartAtZ(z:number):PierPart|null {
  const {head,approach,neckEnd}=PIER_LAYOUT;
  if(z<=head.center[1]+head.depth/2+1e-8&&z>=head.center[1]-head.depth/2-1e-8)return 'head';
  if(z<=approach.start[1]+1e-8&&z>=neckEnd[1]-1e-8)return z>approach.end[1]?'approach':'walkway';
  return null;
}

/** Physical deck width at a chart coordinate, including the widened head overlap. */
export function pierWidthAtZ(z:number) {
  return pierPartAtZ(z)==='head'?PIER_LAYOUT.head.width:PIER_LAYOUT.width;
}

export function pierHeightAtZ(z:number):number {
  const {start,end,startElevation}=PIER_LAYOUT.approach;
  const t=Math.max(0,Math.min(1,(start[1]-z)/(start[1]-end[1])));
  return startElevation+(PIER_LAYOUT.elevation-startElevation)*t*t*(3-2*t);
}

function chartScaleAt(z:number) {
  // Map x is a direct east-west tangent coordinate. Its physical scale grows
  // only with deck elevation; it does not inherit the old geographic-latitude
  // cosine, which distorted the compact pier after the map migration.
  return mapMetric(0, pierHeightAtZ(z)).x;
}

export function pierAcrossAt(x:number,z:number) {
  return (x-PIER_LAYOUT.entrance[0])*chartScaleAt(z);
}

/** Converts a physical width offset back into the sphere authoring chart. */
export function pierChartAt(across:number,z:number) {
  return {x:PIER_LAYOUT.entrance[0]+across/chartScaleAt(z),z};
}

/** Exact radial deck top used by movement support and the visible planks. */
export function pierSurfaceAt(x:number,z:number):PierSurface|null {
  const {head,width}=PIER_LAYOUT;
  const across=Math.abs(pierAcrossAt(x,z));
  const part=pierPartAtZ(z);
  if(part==='head'&&across<=head.width/2+1e-8)
    return {height:PIER_LAYOUT.elevation,part:'head'};
  if((part==='approach'||part==='walkway')&&across<=width/2+1e-8)
    return {height:pierHeightAtZ(z),part};
  return null;
}

export function pierPointAt(across:number,z:number,elevation=pierHeightAtZ(z)):Vector3 {
  const chart=pierChartAt(across,z);
  return mapPoint(chart.x,z,elevation);
}

export function pierFrameAt(across:number,z:number,elevation=pierHeightAtZ(z)) {
  const chart=pierChartAt(across,z);
  const frame=mapFrame(chart.x,z,elevation);
  return {position:frame.position,up:frame.up,east:frame.east,south:frame.north.clone().negate(),quaternion:frame.quaternion,matrix:frame.matrix};
}

/** Only the land entrance is open. No guard crosses the neck/head join. */
const headLandwardEdge=PIER_LAYOUT.head.center[1]+PIER_LAYOUT.head.depth/2;
export const PIER_EDGES:readonly PierEdge[] = [
  {id:'west-walk',start:[-PIER_LAYOUT.width/2,PIER_LAYOUT.railStartZ],end:[-PIER_LAYOUT.width/2,headLandwardEdge]},
  {id:'east-walk',start:[PIER_LAYOUT.width/2,PIER_LAYOUT.railStartZ],end:[PIER_LAYOUT.width/2,headLandwardEdge]},
  {id:'west-shoulder',start:[-PIER_LAYOUT.width/2,headLandwardEdge],end:[-PIER_LAYOUT.head.width/2,headLandwardEdge]},
  {id:'east-shoulder',start:[PIER_LAYOUT.width/2,headLandwardEdge],end:[PIER_LAYOUT.head.width/2,headLandwardEdge]},
  {id:'west-head',start:[-PIER_LAYOUT.head.width/2,headLandwardEdge],end:[-PIER_LAYOUT.head.width/2,PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2]},
  {id:'east-head',start:[PIER_LAYOUT.head.width/2,headLandwardEdge],end:[PIER_LAYOUT.head.width/2,PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2]},
  {id:'seaward-head',start:[-PIER_LAYOUT.head.width/2,PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2],end:[PIER_LAYOUT.head.width/2,PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2]},
];

export const PIER_SUPPORT_ROWS = [-17.5,-20.5,-23.5,-26.5,-29.5,-32.5,-35.5,-38.5,-41.5,-44.5,-46.5] as const;

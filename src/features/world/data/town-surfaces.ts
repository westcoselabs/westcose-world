import { TOWN_AREAS, TOWN_ROUTES } from './town-layout';
import type { TownRoute } from './town-types';
import { pierSurfaceAt } from './pier-layout';
import { MAP_RADIUS, mapCoordinates, mapMetric } from './world-map';
import { massifHeightAt, mountainBaseAt, mountainBlendAt, mountainCoastDistance, mountainFinishAreaAt, mountainResortPlatesAt, mountainRunPlateWeightAt, mountainRunPlatesAt, mountainSnowAt } from './mountain-layout';
import { existingIslandTerrainAt } from './island-terrain';
import { RUN_FEATHER, runWidthAt, skiCarveAt, skiRunSampleAt } from './ski-runs';
import { CAVE_FLOOR, caveBlendAt, skateBlendAt, skateHeightAt, skateStairSurfaceAt } from './concept-landmarks';
import { inPeninsulaRegion, peninsulaBlendAt, peninsulaHeightAt, peninsulaFoundationAt, coastDistance, PENINSULA_SAND } from './peninsula-layout';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const townCoordinates=mapCoordinates;
// Compatibility metadata; the actual stair support is authored by the route below.
export const TOWN_STEPS={lon:-24/MAP_RADIUS,startLat:0,endLat:11/MAP_RADIUS,width:3,count:12,rise:.19,treadAngle:11/MAP_RADIUS/12,baseHeight:.22};
export const COVE_STEPS={start:[-20,-16] as const,end:[-18,-20] as const,width:2.4,count:0,top:.15,rise:0};

/** Frozen town substrate + mountain island, with the ski runs carved between flat
 * run plates and the resort foundations applied last. The peninsula replacement is
 * still a bounded blend, not a smoothing pass on the former headland mound. */
export function naturalTerrainAt(x:number,z:number):number {
 const plated=mountainRunPlatesAt(x,z,mountainBaseAt(x,z)),carved=skiCarveAt(x,z,plated),plate=mountainRunPlateWeightAt(x,z);
 // Run plates stay level over any carving; a second plate pass would not be idempotent.
 let height=plate>0?carved+(plated-carved)*plate:carved;
 height=mountainResortPlatesAt(x,z,height);
 const blend=peninsulaBlendAt(x,z);
 return blend===0?height:height+(peninsulaHeightAt(x,z)-height)*blend;
}
/** Cheap exact test for the flat -3m open-sea floor, where no land layer applies. */
export const OPEN_SEA_FLOOR=-3;
export function terrainIsOpenSea(x:number,z:number):boolean{
 if(z>=52)return mountainCoastDistance(x,z)<-3;
 if(z>=40||inPeninsulaRegion(x,z))return false;
 return existingIslandTerrainAt(x,z)<=OPEN_SEA_FLOOR+1e-9;
}
export function substrateAt(x:number,z:number):number {
 let height=naturalTerrainAt(x,z);
 const skate=skateHeightAt(x,z),skateBlend=skateBlendAt(x,z);
 if(skate!==undefined)height+=(skate-height)*skateBlend;
 // This is the upper outdoor surface. The cave is a separate lower support,
 // never a radial trench through the lighthouse foundation.
 return height;
}
type Segment={route:TownRoute;ax:number;az:number;dx:number;dz:number;length:number;offset:number;total:number;minX:number;maxX:number;minZ:number;maxZ:number};
const makeSegments=(routes:TownRoute[]):Segment[]=>routes.flatMap(route=>{
 const lengths=route.points.slice(1).map((p,i)=>Math.hypot(p[0]-route.points[i][0],p[1]-route.points[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);let offset=0;
 return lengths.map((length,i)=>{const a=route.points[i],b=route.points[i+1],pad=(route.width/2+(route.sidewalk||0)+1)/.45;
  const s={route,ax:a[0],az:a[1],dx:b[0]-a[0],dz:b[1]-a[1],length,offset,total,minX:Math.min(a[0],b[0])-pad,maxX:Math.max(a[0],b[0])+pad,minZ:Math.min(a[1],b[1])-pad,maxZ:Math.max(a[1],b[1])+pad};offset+=length;return s;
 });
});
const segments=makeSegments(TOWN_ROUTES);
// The short prefix within the protected town keeps its exact old support/shoulders.
// The obsolete coastal detour is never evaluated inside the rebuilt peninsula.
const outsideSegments=makeSegments(TOWN_ROUTES.map(route=>route.id==='lighthouse-trail'?{...route,
 points:[[20,4],[23,0],[24.5,-10],[25.5,-14],[23,-21],[19,-23],[18.5,-29],[20,-33],[24,-36],[29,-38],[32.8,-35],[32.8,-27]],
 elevations:[.2,.2,.2,.2,.1,-.05,-.1,-.1,.8,3.6,6.2,7.8],
}:route));
// Curved pistes contain hundreds of authored samples. Query only local segments,
// preserving their original order so unrelated town support remains bit-identical.
// Numeric cell keys avoid building a string for every terrain query.
const segmentKey=(x:number,z:number)=>x+128+(z+256)*512;
function segmentIndex(items:Segment[]){
 const cells=new Map<number,Segment[]>();
 for(const s of items)for(let x=Math.floor(s.minX/8);x<=Math.floor(s.maxX/8);x++)for(let z=Math.floor(s.minZ/8);z<=Math.floor(s.maxZ/8);z++){
  const key=segmentKey(x,z),bucket=cells.get(key);if(bucket)bucket.push(s);else cells.set(key,[s]);
 }
 return cells;
}
const localIndex=segmentIndex(segments),outsideIndex=segmentIndex(outsideSegments);
const NO_SEGMENTS:Segment[]=[];
function nearbySegments(x:number,z:number){return (inPeninsulaRegion(x,z)?localIndex:outsideIndex).get(segmentKey(Math.floor(x/8),Math.floor(z/8)))??NO_SEGMENTS;}
function closest(s:Segment,x:number,z:number,height:number){
 const metric=mapMetric(x,height),dx=s.dx*metric.x,dz=s.dz*metric.z;
 const t=clamp(((x-s.ax)*metric.x*dx+(z-s.az)*metric.z*dz)/(dx*dx+dz*dz));
 return {distance:Math.hypot((x-s.ax-s.dx*t)*metric.x,(z-s.az-s.dz*t)*metric.z),progress:(s.offset+t*s.length)/s.total};
}
export function routeElevation(route:TownRoute,x:number,z:number,progress:number,substrateHeight?:number){
 if(route.id==='beach-east'&&inPeninsulaRegion(x,z)&&x>23){
  const beach=substrateAt(x,z)+.025;
  return beach+(CAVE_FLOOR+.025-beach)*smooth(23,25,x);
 }
 if(route.elevations){
  const lengths=route.points.slice(1).map((p,i)=>Math.hypot(p[0]-route.points[i][0],p[1]-route.points[i][1]));
  let along=progress*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
   if(along<=lengths[i]||i===lengths.length-1)return route.elevations[i]+(route.elevations[i+1]-route.elevations[i])*clamp(along/lengths[i]);
   along-=lengths[i];
  }
 }
 if(typeof route.elevation==='number')return route.elevation;
 if(route.elevation)return route.elevation[0]+(route.elevation[1]-route.elevation[0])*progress;
 if(route.id==='skate-stairs')return .22+Math.min(12,Math.floor(progress*12))* .19;
 if(route.id==='cave')return -.1;
 return (substrateHeight??substrateAt(x,z))+.025;
}
export function routeDistanceAt(x:number,z:number){
 let result={distance:Infinity,route:undefined as TownRoute|undefined,progress:0};const h=substrateAt(x,z);
 for(const s of nearbySegments(x,z)){if(s.route.id==='cave'||x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;const c=closest(s,x,z,h);if(c.distance<result.distance)result={...c,route:s.route};}
 return result;
}
/** Upper terrain and paths. The traversable void below is resolved by the runtime. */
export function groundSurfaceAt(x:number,z:number):{height:number;kind:'ground'|'pier';route?:string}{
 let height=substrateAt(x,z),routeId:string|undefined;
 const local=inPeninsulaRegion(x,z),unroutedHeight=height;
 for(const s of nearbySegments(x,z)){
  if(s.route.id==='cave'||(s.route.id==='beach-east'&&x>26.3))continue;
  if(local&&s.route.id==='lighthouse-trail')continue;
  if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  const c=closest(s,x,z,height),half=s.route.width/2;
  if(c.distance<=half){height=routeElevation(s.route,x,z,c.progress,unroutedHeight);routeId=s.route.id;}
  else if((s.route.id==='skate-stairs'||s.route.elevation!==undefined||s.route.elevations||(s.route.id==='beach-east'&&inPeninsulaRegion(x,z)&&x>23))&&c.distance<half+1.8){height+=(routeElevation(s.route,x,z,c.progress)-height)*(1-smooth(half,half+1.8,c.distance));}
 }
 if(local){
  // Resolve this winding trail once, not once per overlapping segment. Repeated
  // shoulder blending fed the changing height back into the physical metric,
  // creating abrupt invisible steps along otherwise continuous path edges.
  let nearest:{segment:Segment;distance:number;progress:number}|undefined;
  const candidates:{segment:Segment;distance:number;progress:number}[]=[];
  for(const s of segments){
   if(s.route.id!=='lighthouse-trail'||x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
   const c=closest(s,x,z,unroutedHeight);
   candidates.push({segment:s,...c});
   if(!nearest||c.distance<nearest.distance)nearest={segment:s,...c};
  }
  if(nearest){
   let weight=0,total=0;
   for(const c of candidates){
    const w=1-smooth(0,.8,c.distance-nearest.distance);
    weight+=w;total+=routeElevation(c.segment.route,x,z,c.progress)*w;
   }
   const half=nearest.segment.route.width/2,target=total/weight;
   const blend=1-smooth(half,half+1.8,nearest.distance);
   height+=(target-height)*blend;
   if(nearest.distance<=half)routeId='lighthouse-trail';
  }
 }
 for(const area of TOWN_AREAS){const m=mapMetric(x,height),dx=Math.abs(x-area.center[0])*m.x,dz=Math.abs(z-area.center[1])*m.z;
  if(dx<=area.width/2&&dz<=area.depth/2){const edge=Math.min(area.width/2-dx,area.depth/2-dz);height+=( (area.elevation??height)-height)*smooth(0,.7,edge);}
 }
 const stair=skateStairSurfaceAt(x,z);
 if(stair){height=stair.height;routeId='skate-stairs';}
 // The lighthouse's top foundation is independent of the lower tunnel floor.
 if(inPeninsulaRegion(x,z)){
  const foundation=peninsulaFoundationAt(x,z);
  if(foundation.blend>0)height+=(foundation.height-height)*foundation.blend;
 }
 // Join both sides of the L-shaped protected-town boundary, including its
 // corner. The anchor is always outside, so this single recursive sample ends.
 if(inPeninsulaRegion(x,z)&&x<24.7&&z>-19.2){
  const anchorX=Math.min(x,24),anchorZ=Math.max(z,-18);
  const distance=Math.hypot(x-anchorX,(z-anchorZ)*mapMetric(x,0).z);
  if(distance<.7){
   const boundary=groundSurfaceAt(anchorX,anchorZ).height;
   height=boundary+(height-boundary)*smooth(0,.7,distance);
  }
 }
 return {height,kind:'ground',route:routeId};
}
export function townSurfaceAt(x:number,z:number):{height:number;kind:'ground'|'pier';route?:string}{
 const deck=pierSurfaceAt(x,z);return deck?{height:deck.height,kind:'pier',route:'pier'}:groundSurfaceAt(x,z);
}
export function asphaltAt(x:number,z:number){const r=routeDistanceAt(x,z);return r.route?.material==='asphalt'&&r.distance<=r.route.width/2;}
/** Callers that already know the local height pass it; it only scales the physical metric. */
export function surfaceMaterialAt(x:number,z:number,height=substrateAt(x,z)):string|null{
 let color:string|null=null;
 for(const s of nearbySegments(x,z)){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  if(s.route.id==='cave'||(s.route.id==='beach-east'&&x>26.3))continue;
  if(closest(s,x,z,height).distance<=s.route.width/2)color=s.route.material==='asphalt'?'#687D7E':s.route.material==='timber'?'#A98A60':s.route.material==='sand'?'#D8BD8B':s.route.material==='concrete'?'#CBC6B4':'#AE9972';
 }
 for(const a of TOWN_AREAS){const m=mapMetric(x,height);if(Math.abs(x-a.center[0])*m.x<a.width/2&&Math.abs(z-a.center[1])*m.z<a.depth/2)color=a.material==='gravel'?'#B2A38A':'#D6D0BE';}
 return color;
}
/** `slope` is the local tangent of the rendered terrain, when the caller knows it. */
export function terrainColorAt(x:number,z:number,height:number,slope=0){
 const material=surfaceMaterialAt(x,z,height);if(material)return material;
 const run=z>36?skiRunSampleAt(x,z):undefined;
 const half=run?runWidthAt(run.run,run.s)/2:0,onRun=!!run&&run.s>0&&run.s<run.run.length;
 if(onRun&&run!.distance<=half+.6)return '#D3E2E0';
 if(z>36&&mountainFinishAreaAt(x,z))return '#D3E2E0';
 if(height<-.5)return '#BCA87B';
 if(inPeninsulaRegion(x,z)&&peninsulaBlendAt(x,z)>.5){
  if(height<.4&&coastDistance(x,z,PENINSULA_SAND)>-.5)return '#D7BB85';
  return height>2.4?'#999C89':height>.4?'#818C83':'#BDA77F';
 }
 // Carved run banks stay powder; only natural steep ground shows rock.
 const bank=onRun&&run!.distance<half+RUN_FEATHER;
 if((mountainSnowAt(x,z)||bank)&&height>0)return bank?'#E6EDE6':slope>.85?'#8A968F':slope>.7&&Math.abs(Math.sin(x*.21+z*.13))<.35?'#A3AEA8':'#EDF2E9';
 if(caveBlendAt(x,z)>.3||(x>30&&z<12&&height<.4)||(z<-17&&Math.abs(x)<27&&height<.5))return '#D7BB85';
 if(skateBlendAt(x,z)>.98)return '#B5BAB3';
 if((x>23&&z<18)||(x<-28&&z<20))return '#899087';
 // Forest belt below the mountain snow line lightens toward the alpine zone.
 if(mountainBlendAt(x,z)>.5){const massif=massifHeightAt(x,z);return massif>4.5?'#8E9C88':massif>3.2?'#7B9175':'#688765';}
 return '#688765';
}

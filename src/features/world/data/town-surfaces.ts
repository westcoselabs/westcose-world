import { TOWN_AREAS, TOWN_ROUTES } from './town-layout';
import type { TownRoute } from './town-types';
import { pierSurfaceAt } from './pier-layout';
import { MAP_RADIUS, mapCoordinates, mapMetric } from './world-map';
import { massifHeightAt, mountainBaseAt, mountainBlendAt, mountainCoastDistance, mountainFinishAreaAt, mountainResortPlatesAt, mountainRunPlateWeightAt, mountainRunPlatesAt, mountainSnowAt } from './mountain-layout';
import { islandTerrainAt } from './island-terrain';
import { RUN_FEATHER, runWidthAt, skiCarveAt, skiRunSampleAt } from './ski-runs';
import { nearSeaCave, seaCaveCliffFootAt, seaCaveMassifWeightAt, seaCaveTerrainAt } from './sea-cave';
import { SEA_CAVE_MOUTH } from './sea-cave-layout';
import { downtownKindAt, downtownSurfaceAt } from './downtown-layout';
import { GRAND_STAIRS, grandStairSurfaceAt, nearSkatepark, skateparkSurfaceAt } from './skatepark-layout';
import { westBluffAt, westBluffDistance } from './island-terrain';
import { inAuthoredRegion, inPeninsulaRegion, peninsulaBlendAt, peninsulaHeightAt, peninsulaFoundationAt, peninsulaLocal, peninsulaTransplantWeight } from './peninsula-layout';
import { peninsulaWorldPoint } from './peninsula-frame';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const townCoordinates=mapCoordinates;
// Compatibility metadata for the grand stairs up to the skate park; skatepark-layout.ts authors the treads.
export const TOWN_STEPS={lon:GRAND_STAIRS.foot/MAP_RADIUS,endLon:GRAND_STAIRS.top/MAP_RADIUS,width:GRAND_STAIRS.halfWidth*2,count:GRAND_STAIRS.count,rise:GRAND_STAIRS.rise,baseHeight:GRAND_STAIRS.base};
export const COVE_STEPS={start:[-20,-16] as const,end:[-18,-20] as const,width:2.4,count:0,top:.15,rise:0};

/** Low dune hummocks behind the dry beach, clear of the pier, both ramps and the props. */
export const BEACH_DUNES:readonly (readonly [x:number,z:number,halfX:number,halfZ:number,height:number])[]=[
 [-26.5,-20.2,3.4,1.5,.34],[-14.6,-20.4,3.6,1.6,.3],[-6.8,-20.1,2.6,1.3,.26],
 [10.8,-20.3,2.9,1.4,.3],[18.8,-20.6,3.2,1.6,.36],[27.6,-20.6,3,1.4,.3],
];
/** The public beach's shore line for its cross-section (one straight shore east of x 15). */
const beachShore=(x:number)=>{const sx=Math.min(x,15);return -34+1.3*Math.sin(sx*.13)+.8*Math.cos(sx*.3);};
/** A real beach section: dunes behind a dry upper beach, a berm, a gentle wet foreshore
 * and a long shallow shelf before the open-sea floor. Replaces the old steep beach face. */
function beachProfileAt(x:number,z:number){
 const d=z-beachShore(x);
 let h:number;
 if(d>5.5)h=.02+(.16-.02)*smooth(5.5,14,d);
 else if(d>.5)h=-.8+(.02+.8)*smooth(.5,5.5,d)**.85;
 else if(d>-5)h=-.8-.7*smooth(.5,-5,d);
 else h=-1.5-1.5*smooth(-5,-15,d);
 for(const [dx,dz,hx,hz,height] of BEACH_DUNES){
  const q=Math.hypot((x-dx)/hx,(z-dz)/hz);
  if(q<1)h+=height*(.5+.5*Math.cos(Math.PI*q))*(1+.18*Math.sin(x*1.7+z*2.3));
 }
 return h;
}
/** How much of the ground is the reshaped public beach. */
function beachWeightAt(x:number,z:number){
 if(z>-17||z<-52||x<-32||x>40)return 0;
 return smooth(-32,-28.5,x)*(1-smooth(34,39,x))*(1-smooth(-18.6,-17.2,z));
}

/** Present town substrate + mountain island, with the ski runs carved between flat
 * run plates and the resort foundations applied last. The placed peninsula is a bounded
 * blend in its own authoring frame, the sea-cave headland rises over it, and the public
 * beach is shaped last. */
export function naturalTerrainAt(x:number,z:number):number {
 const plated=mountainRunPlatesAt(x,z,mountainBaseAt(x,z)),carved=skiCarveAt(x,z,plated),plate=mountainRunPlateWeightAt(x,z);
 // Run plates stay level over any carving; a second plate pass would not be idempotent.
 let height=plate>0?carved+(plated-carved)*plate:carved;
 height=mountainResortPlatesAt(x,z,height);
 const blend=peninsulaBlendAt(x,z);
 height=blend===0?height:height+(peninsulaHeightAt(x,z)-height)*blend;
 height=seaCaveTerrainAt(x,z,height);
 const beach=beachWeightAt(x,z);
 if(beach>0)height+=(beachProfileAt(x,z)-height)*beach;
 // The west bluff reaches far up the chart this far west; it wins over the mountain's
 // chart-z blend, which only means anything near the town meridian.
 return x<-32?Math.max(height,westBluffAt(x,z)):height;
}
/** Cheap exact test for the flat -3m open-sea floor, where no land layer applies. */
export const OPEN_SEA_FLOOR=-3;
export function terrainIsOpenSea(x:number,z:number):boolean{
 if(x<-32&&westBluffAt(x,z)>OPEN_SEA_FLOOR+1e-9)return false;
 if(z>=52)return mountainCoastDistance(x,z)<-3;
 if(z>=40||inPeninsulaRegion(x,z)||nearSeaCave(x,z)||beachWeightAt(x,z)>0)return false;
 return islandTerrainAt(x,z)<=OPEN_SEA_FLOOR+1e-9;
}
export function substrateAt(x:number,z:number):number {
 const height=naturalTerrainAt(x,z);
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
const routeIndex=segmentIndex(segments);
const NO_SEGMENTS:Segment[]=[];
function nearbySegments(x:number,z:number){return routeIndex.get(segmentKey(Math.floor(x/8),Math.floor(z/8)))??NO_SEGMENTS;}
/** Authored-frame x of a world point inside the placed peninsula region, else -Infinity. */
function authoredRegionX(x:number,z:number){const a=peninsulaLocal(x,z);return a&&inAuthoredRegion(a.x,a.z)?a.x:-Infinity;}
function closest(s:Segment,x:number,z:number,height:number){
 const metric=mapMetric(x,height),dx=s.dx*metric.x,dz=s.dz*metric.z;
 const t=clamp(((x-s.ax)*metric.x*dx+(z-s.az)*metric.z*dz)/(dx*dx+dz*dz));
 return {distance:Math.hypot((x-s.ax-s.dx*t)*metric.x,(z-s.az-s.dz*t)*metric.z),progress:(s.offset+t*s.length)/s.total};
}
export function routeElevation(route:TownRoute,x:number,z:number,progress:number,substrateHeight?:number){
 const ax=route.id==='beach-east'?authoredRegionX(x,z):-Infinity;
 if(ax>23){
  const beach=substrateAt(x,z)+.025;
  return beach+(SEA_CAVE_MOUTH.floor+.025-beach)*smooth(23,25,ax);
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
 return (substrateHeight??substrateAt(x,z))+.025;
}
export function routeDistanceAt(x:number,z:number){
 let result={distance:Infinity,route:undefined as TownRoute|undefined,progress:0};const h=substrateAt(x,z);
 for(const s of nearbySegments(x,z)){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;const c=closest(s,x,z,h);if(c.distance<result.distance)result={...c,route:s.route};}
 return result;
}
/** Upper terrain and paths. The traversable void below is resolved by the runtime. */
export function groundSurfaceAt(x:number,z:number,stitch=true):{height:number;kind:'ground'|'pier';route?:string}{
 let height=substrateAt(x,z),routeId:string|undefined;
 const local=inPeninsulaRegion(x,z),unroutedHeight=height,ax=local?authoredRegionX(x,z):-Infinity;
 for(const s of nearbySegments(x,z)){
  if(s.route.id==='beach-east'&&ax>26.3)continue;
  if(local&&s.route.id==='lighthouse-trail')continue;
  if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  const c=closest(s,x,z,height),half=s.route.width/2;
  if(c.distance<=half){height=routeElevation(s.route,x,z,c.progress,unroutedHeight);routeId=s.route.id;}
  else if((s.route.elevation!==undefined||s.route.elevations||(s.route.id==='beach-east'&&ax>23))&&c.distance<half+1.8){height+=(routeElevation(s.route,x,z,c.progress)-height)*(1-smooth(half,half+1.8,c.distance));}
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
 // Downtown streets and sidewalks, the grand stairs, then the skate park on the bluff.
 const street=downtownSurfaceAt(x,z);
 if(street){height=street.height;routeId=street.id;}
 const stair=grandStairSurfaceAt(x,z);
 if(stair){height=stair.height;routeId='grand-stairs';}
 if(nearSkatepark(x,z)){const park=skateparkSurfaceAt(x,z);if(park){height=park.height;routeId=`skatepark:${park.feature}`;}}
 // The lighthouse's top foundation is independent of the lower tunnel floor.
 if(inPeninsulaRegion(x,z)){
  const foundation=peninsulaFoundationAt(x,z);
  if(foundation.blend>0)height+=(foundation.height-height)*foundation.blend;
 }
 // Join both sides of the peninsula's L-shaped town boundary, including its corner, in
 // its authoring frame. The anchor is always outside, so this single recursive sample ends.
 const a=local&&stitch?peninsulaLocal(x,z):null;
 if(a&&a.x<24.7&&a.z>-19.2){
  // Just outside the region, so round-off in the placement never lands it back inside.
  const anchorX=Math.min(a.x,24-1e-6),anchorZ=Math.max(a.z,-18+1e-6);
  const distance=Math.hypot(a.x-anchorX,(a.z-anchorZ)*mapMetric(a.x,0).z);
  if(distance<.7){
   const anchor=peninsulaWorldPoint(anchorX,anchorZ);
   const boundary=groundSurfaceAt(anchor.x,anchor.z,false).height;
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
  if(s.route.id==='beach-east'&&authoredRegionX(x,z)>26.3)continue;
  if(closest(s,x,z,height).distance<=s.route.width/2)color=s.route.material==='asphalt'?'#687D7E':s.route.material==='timber'?'#A98A60':s.route.material==='sand'?'#D8BD8B':s.route.material==='concrete'?'#CBC6B4':'#AE9972';
 }
 for(const a of TOWN_AREAS){const m=mapMetric(x,height);if(Math.abs(x-a.center[0])*m.x<a.width/2&&Math.abs(z-a.center[1])*m.z<a.depth/2)color=a.material==='gravel'?'#B2A38A':'#D6D0BE';}
 const paved=downtownKindAt(x,z);
 if(paved)color=paved==='road'?'#4F5A5C':'#CBC6B4';
 if(grandStairSurfaceAt(x,z)||(nearSkatepark(x,z)&&skateparkSurfaceAt(x,z)))color='#C3C0B5';
 return color;
}
/** `slope` is the local tangent of the rendered terrain, when the caller knows it. */
export function terrainColorAt(x:number,z:number,height:number,slope=0){
 const material=surfaceMaterialAt(x,z,height);if(material)return material;
 const run=z>36?skiRunSampleAt(x,z):undefined;
 const half=run?runWidthAt(run.run,run.s)/2:0,onRun=!!run&&run.s>0&&run.s<run.run.length;
 if(onRun&&run!.distance<=half+.6)return '#D3E2E0';
 if(z>36&&mountainFinishAreaAt(x,z))return '#D3E2E0';
 // The sea-cave headland: weathered rock, darker on its cliffs and wet at the waterline.
 const headland=seaCaveMassifWeightAt(x,z);
 // Its cliffs run straight down into the water: the sea floor at their foot is rock too.
 if(height<=-.5&&seaCaveCliffFootAt(x,z))return '#5F6B66';
 if(headland>.35&&height>-.5){
  if(slope>1.15)return height<1.2?'#6E7A73':'#7E857B';
  const facet=Math.sin(x*1.1+z*.7)*Math.sin(x*.4-z*1.3),scrub=Math.sin(x*.53+z*.31)*Math.sin(x*.27-z*.61);
  // Low salt-scrub on the gentler treads, bare stone on the risers.
  if(slope<.45&&height>3&&scrub>.18)return scrub>.42?'#6F7F69':'#7D8B73';
  return height>7.5?(facet>.25?'#A3A592':'#999C89'):height>3?(facet>.2?'#959989':'#8C9386'):'#818C83';
 }
 const cape=inPeninsulaRegion(x,z)&&peninsulaBlendAt(x,z)>.5;
 // The public beach: dune sand, dry sand, a darker wet band at the water, then the shallows.
 if(!cape&&z<-17&&x>-31&&x<46&&height<.62){
  const grain=Math.sin(x*3.1+z*1.7)*Math.sin(x*1.3-z*4.2);
  if(height<-1.1)return '#A99A74';
  if(height<-.5)return grain>.2?'#A58A60':'#AC9168';
  if(height<-.3)return '#C2A87A';
  if(height>.24)return grain>.35?'#D4BD8C':'#DCC697';
  return grain>.3?'#DAC291':grain<-.4?'#E2CD9D':'#DEC795';
 }
 if(height<-.5)return '#BCA87B';
 if(cape){
  return height>2.4?'#999C89':height>.4?'#818C83':'#BDA77F';
 }
 // Carved run banks stay powder; only natural steep ground shows rock.
 const bank=onRun&&run!.distance<half+RUN_FEATHER;
 if((mountainSnowAt(x,z)||bank)&&height>0)return bank?'#E6EDE6':slope>.85?'#8A968F':slope>.7&&Math.abs(Math.sin(x*.21+z*.13))<.35?'#A3AEA8':'#EDF2E9';
 // The bluff top is mown grass; its open slopes read as coastal scrub down to the sand.
 if(x<-30&&x>-90){const d=westBluffDistance(x,z);if(d<-.5)return '#6F8D66';if(d<5&&height>.5)return '#7F8C76';}
 if(peninsulaTransplantWeight(x,z)>.5||(x<-28&&z<20))return '#899087';
 // Forest belt below the mountain snow line lightens toward the alpine zone.
 if(mountainBlendAt(x,z)>.5){const massif=massifHeightAt(x,z);return massif>4.5?'#8E9C88':massif>3.2?'#7B9175':'#688765';}
 return '#688765';
}

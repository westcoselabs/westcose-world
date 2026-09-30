import { TOWN_AREAS, TOWN_ROUTES } from './town-layout';
import type { TownRoute } from './town-types';
import { pierSurfaceAt } from './pier-layout';
import { mapCoordinates, mapMetric } from './world-map';
import { mountainHeightAt, mountainSnowAt } from './mountain-layout';
import { CAVE_FLOOR, caveBlendAt, skateBlendAt, skateHeightAt, skateStairSurfaceAt } from './concept-landmarks';
import { inPeninsulaRegion, peninsulaBlendAt, peninsulaHeightAt, peninsulaFoundationAt, coastDistance, PENINSULA_SAND } from './peninsula-layout';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
// Frozen pre-approval substrate. Only the bounded mountain overlay changes its massif.
const ORIGINAL_SUMMIT={z:153,height:32};
export const townCoordinates=mapCoordinates;
// Compatibility metadata; the actual stair support is authored by the route below.
export const TOWN_STEPS={lon:-24/36,startLat:0,endLat:11/36,width:3,count:12,rise:.19,treadAngle:11/36/12,baseHeight:.22};
export const COVE_STEPS={start:[-20,-16] as const,end:[-18,-20] as const,width:2.4,count:0,top:.15,rise:0};

/** Broad continuous island, with scalloped shores instead of a rectangular land strip. */
function existingIslandTerrainAt(x:number,z:number):number {
 const coastWave=2*Math.sin(z*.075)+1.2*Math.sin(z*.17+.8);
 const forestWidth=35+coastWave;
 const inlandWidth=34+(forestWidth-34)*smooth(10,32,z);
 const width=inlandWidth+(29-inlandWidth)*smooth(105,140,z);
 const coastX=x-(1.6*Math.sin(z*.05)*smooth(20,60,z));
 const cross=1-smooth(width-3,width+4,Math.abs(coastX));
 const shoreline=-34+1.3*Math.sin(x*.13)+.8*Math.cos(x*.3);
 const front=smooth(shoreline-2,shoreline+3,z),rear=1-smooth(164,171,z);
 let land=.16+2.22*smooth(20,110,z);
 // An asymmetric massif: three shoulders and cut valleys lead into the real summit.
 // The rear drops immediately, keeping it visible from the longer pier across the water.
 if(z>118&&z<=ORIGINAL_SUMMIT.z){
  const climb=clamp((z-118)/(ORIGINAL_SUMMIT.z-118));
  const spine=2.1*Math.sin(climb*Math.PI*2)*(1-climb);
  const ridge=Math.max(0,1-Math.abs(x-spine)/28)**1.25;
  land=2.38+(ORIGINAL_SUMMIT.height-2.38)*climb**2.9*ridge;
  const shoulder=(px:number,pz:number,peak:number,rx:number,rz:number)=>2.38+(peak-2.38)*Math.max(0,1-Math.abs((x-px)/rx)-Math.abs((z-pz)/rz));
  land=Math.max(land,shoulder(-11,144,24,15,22),shoulder(10,147,27,15,25),shoulder(-5,136,14,10,18));
 }else if(z>ORIGINAL_SUMMIT.z){
  const t=clamp((z-ORIGINAL_SUMMIT.z)/14),ridge=Math.max(0,1-Math.abs(x)/28)**1.25;
  land=-3+(ORIGINAL_SUMMIT.height+3)*(1-t)**2*ridge;
 }
 if(z<-16)land=.16-.28*smooth(-16,-31,z);
 let height=-3+(land+3)*cross*front*rear;
 const west=Math.hypot((x+29)/12,(z-10)/30);
 height=Math.max(height,-3+5.45*(1-smooth(.68,1.14,west)));
 // Tall cliffs surround the low cave floor; a separate finger of land carries the lighthouse.
 const east=Math.hypot((x-33)/12,(z+3)/26);
 const peninsula=Math.hypot((x-35)/10,(z+25)/16);
 height=Math.max(height,-3+10.8*(1-smooth(.7,1.12,east)),-3+10.8*(1-smooth(.68,1.12,peninsula)));
 const peninsulaToe=Math.hypot((x-31)/11,(z+31)/13);
 const toeHeight=2+5.8*smooth(23,33,x);
 height=Math.max(height,-3+(toeHeight+3)*(1-smooth(.66,1.1,peninsulaToe)));
 // Keep the village / boardwalk foreground level, rather than burying the eastern shop shells.
 const townShelf=(1-smooth(24,29,x))*(1-smooth(12,20,z))*smooth(-22,-18,z);
 if(x>0)height+=(.16-height)*townShelf;
 const cove=Math.hypot((x-35.7)/5.3,(z-2)/9);
 if(cove<1.2){const beach=1-smooth(.7,1.2,cove);height=height*(1-beach)+(-.12)*beach;}
 // Open the sheltered sand pocket EAST to the sea. The lighthouse trail stays
 // on the south/west headland; no raised path forms a dam across this outlet.
 const outlet=smooth(32,35,x)*(1-smooth(6,10,Math.abs(z-2)));
 const coveFloor=-.12-2.88*smooth(38,44,x);
 height+=(Math.min(height,coveFloor)-height)*outlet;
 return height;
}
/** A bounded replacement, not a smoothing pass on the former headland mound. */
export function naturalTerrainAt(x:number,z:number):number {
 const existing=mountainHeightAt(x,z,existingIslandTerrainAt(x,z)),blend=peninsulaBlendAt(x,z);
 return blend===0?existing:existing+(peninsulaHeightAt(x,z)-existing)*blend;
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
function segmentIndex(items:Segment[]){
 const cells=new Map<string,Segment[]>();
 for(const s of items)for(let x=Math.floor(s.minX/8);x<=Math.floor(s.maxX/8);x++)for(let z=Math.floor(s.minZ/8);z<=Math.floor(s.maxZ/8);z++){
  const key=`${x}:${z}`,bucket=cells.get(key);if(bucket)bucket.push(s);else cells.set(key,[s]);
 }
 return cells;
}
const localIndex=segmentIndex(segments),outsideIndex=segmentIndex(outsideSegments);
function nearbySegments(x:number,z:number){return (inPeninsulaRegion(x,z)?localIndex:outsideIndex).get(`${Math.floor(x/8)}:${Math.floor(z/8)}`)??[];}
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
 return (substrateHeight??substrateAt(x,z))+(route.id.startsWith('ski-')?0:.025);
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
export function surfaceMaterialAt(x:number,z:number):string|null{
 let color:string|null=null;const height=substrateAt(x,z);
 for(const s of nearbySegments(x,z)){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  if(s.route.id==='cave'||(s.route.id==='beach-east'&&x>26.3))continue;
  if(closest(s,x,z,height).distance<=s.route.width/2)color=s.route.id.startsWith('ski-')?'#C0DEDD':s.route.material==='asphalt'?'#687D7E':s.route.material==='timber'?'#A98A60':s.route.material==='sand'?'#D8BD8B':s.route.material==='concrete'?'#CBC6B4':'#AE9972';
 }
 for(const a of TOWN_AREAS){const m=mapMetric(x,height);if(Math.abs(x-a.center[0])*m.x<a.width/2&&Math.abs(z-a.center[1])*m.z<a.depth/2)color=a.material==='gravel'?'#B2A38A':'#D6D0BE';}
 return color;
}
export function terrainColorAt(x:number,z:number,height:number){
 const material=surfaceMaterialAt(x,z);if(material)return material;
 if(height<-.5)return '#BCA87B';
 if(inPeninsulaRegion(x,z)&&peninsulaBlendAt(x,z)>.5){
  if(height<.4&&coastDistance(x,z,PENINSULA_SAND)>-.5)return '#D7BB85';
  return height>2.4?'#999C89':height>.4?'#818C83':'#BDA77F';
 }
 if(mountainSnowAt(x,z)&&height>0)return (z>153||Math.abs(Math.sin(x*.27+z*.08))<.12)?'#82918E':'#EDF2E9';
 if(caveBlendAt(x,z)>.3||(x>30&&z<12&&height<.4)||(z<-17&&Math.abs(x)<27&&height<.5))return '#D7BB85';
 if(skateBlendAt(x,z)>.98)return '#B5BAB3';
 if((x>23&&z<18)||(x<-28&&z<20))return '#899087';
 return z>120?'#A4AFA0':'#688765';
}

import { TOWN_AREAS, TOWN_ROUTES } from './town-layout';
import type { TownRoute } from './town-types';
import { pierSurfaceAt } from './pier-layout';
import { mapCoordinates, mapMetric, MAP_SUMMIT } from './world-map';
import { CAVE_FLOOR, caveBlendAt, caveHeightAt, skateBlendAt, skateHeightAt, skateStairSurfaceAt } from './concept-landmarks';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const townCoordinates=mapCoordinates;
// Compatibility metadata; the actual stair support is authored by the route below.
export const TOWN_STEPS={lon:-24/36,startLat:0,endLat:11/36,width:3,count:12,rise:.19,treadAngle:11/36/12,baseHeight:.22};
export const COVE_STEPS={start:[-20,-16] as const,end:[-18,-20] as const,width:2.4,count:0,top:.15,rise:0};

/** Broad continuous island, with scalloped shores instead of a rectangular land strip. */
export function naturalTerrainAt(x:number,z:number):number {
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
 if(z>118&&z<=MAP_SUMMIT.z){
  const climb=clamp((z-118)/(MAP_SUMMIT.z-118));
  const spine=2.1*Math.sin(climb*Math.PI*2)*(1-climb);
  const ridge=Math.max(0,1-Math.abs(x-spine)/28)**1.25;
  land=2.38+(MAP_SUMMIT.height-2.38)*climb**2.9*ridge;
  const shoulder=(px:number,pz:number,peak:number,rx:number,rz:number)=>2.38+(peak-2.38)*Math.max(0,1-Math.abs((x-px)/rx)-Math.abs((z-pz)/rz));
  land=Math.max(land,shoulder(-11,144,24,15,22),shoulder(10,147,27,15,25),shoulder(-5,136,14,10,18));
 }else if(z>MAP_SUMMIT.z){
  const t=clamp((z-MAP_SUMMIT.z)/14),ridge=Math.max(0,1-Math.abs(x)/28)**1.25;
  land=-3+(MAP_SUMMIT.height+3)*(1-t)**2*ridge;
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
export function substrateAt(x:number,z:number):number {
 let height=naturalTerrainAt(x,z);
 const skate=skateHeightAt(x,z),skateBlend=skateBlendAt(x,z);
 if(skate!==undefined)height+=(skate-height)*skateBlend;
 const cave=caveHeightAt(x,z),caveBlend=caveBlendAt(x,z);
 if(cave!==undefined)height+=(cave-height)*caveBlend;
 return height;
}
type Segment={route:TownRoute;ax:number;az:number;dx:number;dz:number;length:number;offset:number;total:number;minX:number;maxX:number;minZ:number;maxZ:number};
const segments:Segment[]=TOWN_ROUTES.flatMap(route=>{
 const lengths=route.points.slice(1).map((p,i)=>Math.hypot(p[0]-route.points[i][0],p[1]-route.points[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);let offset=0;
 return lengths.map((length,i)=>{const a=route.points[i],b=route.points[i+1],pad=(route.width/2+(route.sidewalk||0)+1)/.45;
  const s={route,ax:a[0],az:a[1],dx:b[0]-a[0],dz:b[1]-a[1],length,offset,total,minX:Math.min(a[0],b[0])-pad,maxX:Math.max(a[0],b[0])+pad,minZ:Math.min(a[1],b[1])-pad,maxZ:Math.max(a[1],b[1])+pad};offset+=length;return s;
 });
});
function closest(s:Segment,x:number,z:number,height:number){
 const metric=mapMetric(x,height),dx=s.dx*metric.x,dz=s.dz*metric.z;
 const t=clamp(((x-s.ax)*metric.x*dx+(z-s.az)*metric.z*dz)/(dx*dx+dz*dz));
 return {distance:Math.hypot((x-s.ax-s.dx*t)*metric.x,(z-s.az-s.dz*t)*metric.z),progress:(s.offset+t*s.length)/s.total};
}
export function routeElevation(route:TownRoute,x:number,z:number,progress:number){
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
 return substrateAt(x,z)+(route.id.startsWith('ski-')?0:.025);
}
export function routeDistanceAt(x:number,z:number){
 let result={distance:Infinity,route:undefined as TownRoute|undefined,progress:0};const h=substrateAt(x,z);
 for(const s of segments){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;const c=closest(s,x,z,h);if(c.distance<result.distance)result={...c,route:s.route};}
 return result;
}
/** Terrain and paths use the same radial support, including the carved cave and skate ramps. */
export function groundSurfaceAt(x:number,z:number):{height:number;kind:'ground'|'pier';route?:string}{
 let height=substrateAt(x,z),routeId:string|undefined;
 for(const s of segments){
  if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  const c=closest(s,x,z,height),half=s.route.width/2;
  if(c.distance<=half){height=routeElevation(s.route,x,z,c.progress);routeId=s.route.id;}
  else if((s.route.id==='skate-stairs'||s.route.elevation!==undefined||s.route.elevations)&&c.distance<half+1.8){height+=(routeElevation(s.route,x,z,c.progress)-height)*(1-smooth(half,half+1.8,c.distance));}
 }
 for(const area of TOWN_AREAS){const m=mapMetric(x,height),dx=Math.abs(x-area.center[0])*m.x,dz=Math.abs(z-area.center[1])*m.z;
  if(dx<=area.width/2&&dz<=area.depth/2){const edge=Math.min(area.width/2-dx,area.depth/2-dz);height+=( (area.elevation??height)-height)*smooth(0,.7,edge);}
 }
 const stair=skateStairSurfaceAt(x,z);
 if(stair){height=stair.height;routeId='skate-stairs';}
 // The low passage owns its entire width, including near the high lookout's outer edge.
 // Never let a plaza or a trail lift the visitor into the separate rock roof.
 if(caveBlendAt(x,z)===1){height=CAVE_FLOOR;routeId='cave';}
 return {height,kind:'ground',route:routeId};
}
export function townSurfaceAt(x:number,z:number):{height:number;kind:'ground'|'pier';route?:string}{
 const deck=pierSurfaceAt(x,z);return deck?{height:deck.height,kind:'pier',route:'pier'}:groundSurfaceAt(x,z);
}
export function asphaltAt(x:number,z:number){const r=routeDistanceAt(x,z);return r.route?.material==='asphalt'&&r.distance<=r.route.width/2;}
export function surfaceMaterialAt(x:number,z:number):string|null{
 let color:string|null=null;const height=substrateAt(x,z);
 for(const s of segments){if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
  if(closest(s,x,z,height).distance<=s.route.width/2)color=s.route.id.startsWith('ski-')?'#C0DEDD':s.route.material==='asphalt'?'#687D7E':s.route.material==='timber'?'#A98A60':s.route.material==='sand'?'#D8BD8B':s.route.material==='concrete'?'#CBC6B4':'#AE9972';
 }
 for(const a of TOWN_AREAS){const m=mapMetric(x,height);if(Math.abs(x-a.center[0])*m.x<a.width/2&&Math.abs(z-a.center[1])*m.z<a.depth/2)color=a.material==='gravel'?'#B2A38A':'#D6D0BE';}
 if(caveBlendAt(x,z)===1)color='#D8BD8B';
 return color;
}
export function terrainColorAt(x:number,z:number,height:number){
 const material=surfaceMaterialAt(x,z);if(material)return material;
 if(height<-.5)return '#BCA87B';
 if(z>127&&height>8)return (z>153||Math.abs(Math.sin(x*.27+z*.08))<.19)?'#82918E':'#EDF2E9';
 if(caveBlendAt(x,z)>.3||(x>30&&z<12&&height<.4)||(z<-17&&Math.abs(x)<27&&height<.5))return '#D7BB85';
 if(skateBlendAt(x,z)>.98)return '#B5BAB3';
 if((x>23&&z<18)||(x<-28&&z<20))return '#899087';
 return z>120?'#A4AFA0':'#688765';
}

import { Vector3 } from 'three';
import { buildingFrame } from '../../data/building-shapes';
import { directionAt, pointAt, RADIUS, SEA_LEVEL } from '../../data/planet';
import { TOWN_BUILDINGS, TOWN_ROUTES } from '../../data/town-layout';
import { townSurfaceAt } from '../../data/town-surfaces';

export type CoastalTree = { id:string; x:number; z:number; height:number; spread:number; lean:number; seed:number };
type TreeSpec = [id:string,x:number,z:number,height:number,spread:number,lean:number];

/** Individual planting pockets: courtyards and gaps first, then the exposed coast. */
const trees:TreeSpec[] = [
  ['courtyard-shade',3.2,9.2,5.3,2.3,.65],
  ['courtyard-south',11.6,.1,4.8,2.0,.6],
  ['office-garden',12.2,19.8,4.7,1.9,.5],
  ['studio-side',-4.8,7.9,4.7,1.8,.65],
  ['print-corner',-25,3.1,4.5,1.9,.4],
  ['print-yard',-18.4,11.6,5.1,2.1,.55],
  ['narrow-garden',-7.5,15.3,4.6,1.7,.4],
  ['livework-yard',-18.7,19.8,5.6,2.3,.8],
  ['garage-garden',-29,16.3,4.7,1.9,.5],
  ['cafe-garden',16.8,19,4.7,1.8,.5],
  ['workshop-south',33.4,10.3,4.8,2.0,.65],
  ['fabrication-yard',40,25.3,5.5,2.2,.85],
  ['salt-road',31.4,32,4.6,1.9,.85],
  ['cove-west',-32,-14.7,3.8,2.1,1.1],
  ['cove-radio',-24,-16,4.0,2.2,1.0],
  ['cove-shack',-1,-14.8,4.1,2.0,1.0],
  ['cove-east',12,-15.3,3.8,2.0,1.1],
  ['lab-garden',12,29,4.8,1.9,.8],
  ['upper-path',-8,27.1,4.7,2.0,.8],
  ['motel-court',-22,27.2,4.8,2.1,.75],
];
export const COASTAL_TREES:CoastalTree[] = trees.map(([id,x,z,height,spread,lean],seed)=>({id,x,z,height,spread,lean,seed:seed+17}));

/** Low planting has its own authored pockets; small offsets are clipped against walkable routes. */
export const UNDERSTORY_POCKETS = [
  [3.2,9.2,1.35], [10.1,.3,1.2], [12.2,19.8,.8], [-4.8,7.9,1.0],
  [-18.4,11.6,.8], [-7.5,15.3,.7], [-18.7,19.8,1.3], [-29,16.3,.9],
  [-32,-14.7,1.1], [-24,-16,1.3], [-1,-14.8,1.0], [12,-15.3,1.2],
  [33.4,10.3,.9], [40,25.3,1.2], [31.4,32,.8], [12,29,1.0],
  [-8,27.1,.8], [-22,27.2,.8], [-38,20,1.2], [46,25,1.4],
  [-27,-16,1.0], [8,26,.85],
] as const;

/** Conservative clearance in physical metres, including paths, door aprons and solid footprints. */
export function plantingClearanceAt(x:number,z:number):number {
  let clearance=Infinity;
  const surface=townSurfaceAt(x,z);
  if(surface.kind==='pier'||surface.height<=SEA_LEVEL+.05)return -1;
  const chartScale=Math.max(.15,Math.cos(z/RADIUS));
  for(const route of TOWN_ROUTES)for(let index=1;index<route.points.length;index++){
    const a=route.points[index-1],b=route.points[index],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    clearance=Math.min(clearance,(distance-route.width/2-(route.sidewalk??0))*chartScale);
  }
  const point=pointAt(x/RADIUS,z/RADIUS),up=directionAt(x/RADIUS,z/RADIUS);
  for(const building of TOWN_BUILDINGS){
    const frame=buildingFrame(building);
    if(up.dot(frame.up)<.8)continue;
    const local=point.clone().sub(frame.position).applyQuaternion(frame.inverse);
    const outsideX=Math.abs(local.x)-building.width/2,outsideZ=Math.abs(local.z)-building.depth/2;
    const distance=outsideX<0&&outsideZ<0?Math.max(outsideX,outsideZ):Math.hypot(Math.max(0,outsideX),Math.max(0,outsideZ));
    clearance=Math.min(clearance,distance);
    if(building.interior&&local.z>building.depth/2&&local.z<building.depth/2+2.7)
      clearance=Math.min(clearance,Math.abs(local.x-building.entryOffset)-building.entryWidth/2-.45);
  }
  return clearance;
}

export function plantingFrame(x:number,z:number) {
  const up=directionAt(x/RADIUS,z/RADIUS);
  const east=new Vector3(Math.cos(x/RADIUS),0,-Math.sin(x/RADIUS));
  const south=new Vector3().crossVectors(east,up).normalize();
  return {position:pointAt(x/RADIUS,z/RADIUS).addScaledVector(up,.035),up,east,south};
}

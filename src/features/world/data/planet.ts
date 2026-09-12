import { Matrix4, Quaternion, Vector3 } from 'three';
import { COASTAL_RADIO, TOWN_BUILDINGS, TOWN_SPAWN } from './town-layout';
import { substrateAt, townSurfaceAt, TOWN_STEPS } from './town-surfaces';
import { buildingDoorPoint, buildingLocalPoint } from './building-shapes';
import { CAVE_POINTS, LIGHTHOUSE } from './concept-landmarks';
import { PIER_LAYOUT } from './pier-layout';
import { MAP_MAX_HEIGHT, MAP_MIN_Z, MAP_RADIUS, MAP_SEAM, MAP_SEA_LEVEL, mapCoordinates, mapFrame } from './world-map';
export const RADIUS=MAP_RADIUS;
export const SEA_LEVEL=MAP_SEA_LEVEL;
export const PLANET_VERSION=6;
export const SPAWN_COORDS={lon:TOWN_SPAWN.lon,lat:TOWN_SPAWN.lat};
export const clamp=(v:number,low:number,high:number)=>Math.max(low,Math.min(high,v));
export function smoothstep(low:number,high:number,value:number){const t=clamp((value-low)/(high-low),0,1);return t*t*(3-2*t);}
export const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function directionAt(lon:number,lat:number):Vector3{return new Vector3(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat));}
export function coordinatesAt(d:{x:number;y:number;z:number}){const length=Math.hypot(d.x,d.y,d.z)||1;return{lon:Math.atan2(d.x,d.z),lat:Math.asin(clamp(d.y/length,-1,1))};}
export const STAIRS=TOWN_STEPS;
/** World visuals, walking support and map coordinates all use the same authored chart. */
export function terrainHeightAt(d:{x:number;y:number;z:number}):number{const {x,z}=mapCoordinates(d);return Math.min(MAP_MAX_HEIGHT,substrateAt(x,z));}
export function heightAt(d:{x:number;y:number;z:number}):number{const {x,z}=mapCoordinates(d);return Math.min(MAP_MAX_HEIGHT,townSurfaceAt(x,z).height);}
export const waterAt=(d:{x:number;y:number;z:number})=>heightAt(d)<SEA_LEVEL;
export function pointAt(lon:number,lat:number,elevation?:number):Vector3{
 const up=directionAt(lon,lat);return up.multiplyScalar(RADIUS+(elevation??Math.max(SEA_LEVEL,heightAt(up))));
}
export function frameAt(lon:number,lat:number){
 const up=directionAt(lon,lat),east=new Vector3(Math.cos(lon),0,-Math.sin(lon));
 const north=new Vector3(-Math.sin(lat)*Math.sin(lon),Math.cos(lat),-Math.sin(lat)*Math.cos(lon));
 const quaternion=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(east,up,north.clone().negate()));
 return{position:pointAt(lon,lat),quaternion,up,east,north};
}
export type { TownBuilding as PlanetBuilding } from './town-types';
export const BUILDINGS=TOWN_BUILDINGS;
const building=(id:string)=>TOWN_BUILDINGS.find(candidate=>candidate.id===id)!;
type FixtureFacing='east'|'north'|'south'|'west'|{east:number;north:number};
type MapFixture={x:number;z:number;facing:FixtureFacing};

/** Build fixture headings from the rendered doorway geometry, not stale chart guesses. */
function fixtureToward(source:Vector3,target:Vector3):MapFixture {
 const {x,z}=mapCoordinates(source),frame=mapFrame(x,z);
 const forward=target.clone().sub(source).addScaledVector(frame.up,-target.clone().sub(source).dot(frame.up));
 if(forward.lengthSq()<1e-8)return {x,z,facing:'north'};
 forward.normalize();return {x,z,facing:{east:forward.dot(frame.east),north:forward.dot(frame.north)}};
}
function doorwayFixture(id:string,outward=1.35,intoDoor=true):MapFixture {
 const shape=building(id),source=buildingDoorPoint(shape,outward);
 return fixtureToward(source,buildingDoorPoint(shape,intoDoor?0:outward+1));
}
function wallFixture(id:string):MapFixture {
 const shape=building(id),localX=-shape.width/2+.7;
 return fixtureToward(
  buildingLocalPoint(shape,[localX,0,shape.depth/2+1.35]),
  buildingLocalPoint(shape,[localX,0,shape.depth/2]),
 );
}
const studioFixture=doorwayFixture('studio');
const workshopFixture=doorwayFixture('workshop');
const arcadeFixture=doorwayFixture('arcade');
const aboutFixture=doorwayFixture('about');
const labFixture=doorwayFixture('lab');
const galleryWallFixture=wallFixture('studio');
const galleryCameraFixture=doorwayFixture('studio',1.35,false);
export const PLANET_PLACES=[
 {id:'studio',label:'Portfolio Gallery',section:'Projects',x:building('studio').x,z:building('studio').z,radius:4,contentId:'world',number:'01',interior:'studio'},
 {id:'workshop',label:'WestCose Shop',section:'Services',x:building('workshop').x,z:building('workshop').z,radius:4.8,contentId:'services',number:'02',interior:'workshop'},
 {id:'arcade',label:'Social Club',section:'Games',x:building('arcade').x,z:building('arcade').z,radius:4.5,contentId:'fightclub',number:'03',interior:'arcade'},
 {id:'about',label:'WestCose Motel',section:'About',x:building('about').x,z:building('about').z,radius:4,contentId:'about',number:'04',interior:'about'},
 // Kept just beyond the fresh-load clearing so a visitor arrives in the
 // courtyard without an immediate interaction prompt.
 {id:'contact',label:'Contact Station',section:'Contact',x:3,z:10.5,radius:2.2,contentId:'contact',number:'05',interior:null},
 {id:'beach',label:'Hidden Beach',section:'Discovery',x:COASTAL_RADIO.x,z:COASTAL_RADIO.z,radius:3,contentId:'frequency',number:'06',interior:null},
 {id:'lab',label:'Alley Room',section:'Labs',x:building('lab').x,z:building('lab').z,radius:4,contentId:'labs',number:'07',interior:'lab'},
] as const;
export function areaAt(d:{x:number;y:number;z:number}):string{
 const{x,z}=mapCoordinates(d),surface=townSurfaceAt(x,z);
 if(surface.kind==='pier')return 'The Pier';
 if(surface.height<SEA_LEVEL)return 'Open Water';
 if(z>=147)return 'Mountain Summit';
 if(z>=108)return 'Ski Resort';
 if(z>=40)return 'Forest Trail';
 if(x<=-20&&z>=-5&&z<=22)return 'Skate Park';
 if(x>=30&&z>=-35&&z<=-18)return 'Lighthouse Point';
 if(x>=20&&x<30&&z<=-18)return 'Cave Access';
 if(x>=27&&z>=-2&&z<=5)return 'Hidden Beach';
 if(z<=-18)return 'The Beach';
 if(z<=-12)return 'Boardwalk';
 if(x>=17&&z>=-9&&z<=8)return 'Graffiti Alley';
 if(z>=3&&z<=14)return 'WestCose Courtyard';
 return 'The Boulevard';
}
const entry=mapCoordinates(directionAt(TOWN_SPAWN.lon,TOWN_SPAWN.lat));
export const PLANET_FIXTURES={
 entry:{x:entry.x,z:entry.z,facing:TOWN_SPAWN.facing},
 courtyard:{x:0,z:8,facing:'south'},
 studio:studioFixture,
 alley:{x:16.5,z:-1,facing:'south'},
 // Offset left of the gallery doorway so the forward walking fixture meets a
 // real front wall rather than entering the room through its open door.
 collision:galleryWallFixture,
 // Begin at the actual foot of the stair route. Its first leg climbs nearly
 // north, so this explicit tangent stays on its narrow physical surface.
 stairs:{x:-23,z:0,facing:{east:-1,north:5}},
 // Stand outside the gallery facing away from its front wall; the follow ray
 // must shorten against that real obstruction.
 camera:galleryCameraFixture,
 seam:{x:0,z:MAP_SEAM-4,facing:'north'},
 pole:{x:0,z:52.5,facing:'north'},
 south:{x:0,z:MAP_MIN_Z+6,facing:'south'},
 // Start beside the pier, not on it, so the shoreline traversal crosses the
 // actual beach into open water.
 shoreline:{x:-10,z:-30,facing:'south'},
 beach:{x:-10,z:-29,facing:'east'},
 arcade:arcadeFixture,
 about:aboutFixture,
 pierapproach:{x:0,z:PIER_LAYOUT.approach.start[1]+1.5,facing:'south'},
 pierhead:{x:0,z:PIER_LAYOUT.head.center[1],facing:'north'},
 pieroutward:{x:0,z:PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2+1,facing:'south'},
 pierside:{x:1.2,z:(PIER_LAYOUT.entrance[1]+PIER_LAYOUT.neckEnd[1])/2,facing:'east'},
 pierbeach:{x:10,z:-29,facing:'east'},
 promenade:{x:0,z:-16,facing:'east'},
 eastgrove:{x:18,z:34,facing:'north'},
 westgrove:{x:-18,z:34,facing:'north'},
 farside:{x:0,z:92,facing:'north'},
 ridge:{x:0,z:105,facing:'north'},
 workshop:workshopFixture,
 // The lab's rotated front faces west, so begin outside that doorway and walk
 // east through it rather than spawning inside the room.
 lab:labFixture,
 circuit:{x:0,z:96,facing:'north'},
 skatepark:{x:-27,z:15,facing:'north'},
 lighthouse:{x:LIGHTHOUSE.x-3.2,z:LIGHTHOUSE.z,facing:'east'},
 cave:{x:CAVE_POINTS[0][0]-2,z:CAVE_POINTS[0][1],facing:'east'},
 hiddenbeach:{x:COASTAL_RADIO.x,z:COASTAL_RADIO.z,facing:'north'},
 resort:{x:0,z:115,facing:'north'},
 summit:{x:0,z:153,facing:'north'},
} as const;

import { Matrix4, Quaternion, Vector3 } from 'three';
import { TOWN_BUILDINGS, TOWN_SPAWN } from './town-layout';
import { substrateAt, townSurfaceAt, TOWN_STEPS } from './town-surfaces';
import { activeInteriorAt, buildingDoorPoint, buildingLocalPoint } from './building-shapes';
import { PIER_LAYOUT } from './pier-layout';
import { MOUNTAIN_LAYOUT, massifHeightAt, mountainFinishAreaAt, mountainSnowAt } from './mountain-layout';
import { skiRunSampleAt } from './ski-runs';
import { peninsulaLocal } from './peninsula-layout';
import { SEA_CAVE_FRAME, seaCaveAt, SEA_CAVE_ZONE_NAMES } from './sea-cave';
import { SEA_CAVE_ARENA, SEA_CAVE_MOUTH, SEA_CAVE_WALL_OFFSET, SEA_CAVE_WINDOW } from './sea-cave-layout';
import { LIGHTHOUSE_GALLERY_NOTE, LIGHTHOUSE_GALLERY_STAND, LIGHTHOUSE_STAIR_FOOT, LIGHTHOUSE_TOWER, lighthouseLocal } from './lighthouse-tower';
import { MAP_MAX_HEIGHT, MAP_MIN_Z, MAP_RADIUS, MAP_SEAM, MAP_SEA_LEVEL, mapCoordinates, mapDirection, mapFrame } from './world-map';
import { CUL_DE_SACS, downtownSurfaceAt } from './downtown-layout';
import { grandStairSurfaceAt, nearSkatepark, skateparkSurfaceAt } from './skatepark-layout';
import { westBluffDistance } from './island-terrain';
import { ANGLER, PROMPT } from './fishing-spot';
export const RADIUS=MAP_RADIUS;
export const SEA_LEVEL=MAP_SEA_LEVEL;
export const PLANET_VERSION=9;
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
/** `layer` and `elevation` place a fixture in the sea caves or up on the lighthouse. */
type MapFixture={x:number;z:number;facing:FixtureFacing;layer?:'upper'|'tunnel';elevation?:number};

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
 const shape=building(id),localX=-shape.width/2+1.7;
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
const skateShopFixture=doorwayFixture('skate-shop');
/** A visitor position at sea-cave local metres, facing another local point. */
function caveFixture(u:number,v:number,toU:number,toV:number,extra:Partial<MapFixture>={}):MapFixture {
 return {...fixtureToward(SEA_CAVE_FRAME.direction(u,v),SEA_CAVE_FRAME.direction(toU,toV)),...extra};
}
/** The customer side of the skate-shop counter, where E takes a board. */
const skateCounter=mapCoordinates(buildingLocalPoint(building('skate-shop'),[-.2,0,-building('skate-shop').depth/2+3.2]));
/** The WestCose Studio's street door at Palm Court; the services office is upstairs. */
const palmCourt=building('apartments'),studioOfficeAt=(outward:number)=>buildingLocalPoint(palmCourt,[palmCourt.width*.32,0,palmCourt.depth/2+outward]);
const studioOffice=mapCoordinates(studioOfficeAt(.9));
/** Pier Pressure: the open rail gap on the west side of the pier head. */
const fishingSpot={x:PROMPT.x,z:PROMPT.z};
export const PLANET_PLACES=[
 {id:'studio',label:'Portfolio Gallery',section:'Projects',x:building('studio').x,z:building('studio').z,radius:4,contentId:'world',number:'01',interior:'studio'},
 {id:'workshop',label:'WestCose Shop',section:'Clothing',x:building('workshop').x,z:building('workshop').z,radius:4.8,contentId:'shop',number:'12',interior:'workshop'},
 {id:'services',label:'WestCose Studio',section:'Services',x:studioOffice.x,z:studioOffice.z,radius:2.2,contentId:'services',number:'02',interior:null},
 {id:'arcade',label:'Social Club',section:'Games',x:building('arcade').x,z:building('arcade').z,radius:4.5,contentId:'fightclub',number:'03',interior:'arcade'},
 {id:'about',label:'WestCose Motel',section:'About',x:building('about').x,z:building('about').z,radius:4,contentId:'about',number:'04',interior:'about'},
 // Kept just beyond the fresh-load clearing so a visitor arrives in the
 // courtyard without an immediate interaction prompt.
 {id:'contact',label:'Contact Station',section:'Contact',x:5.4,z:16.6,radius:2.2,contentId:'contact',number:'05',interior:null},
 // The field note waits on the lighthouse balcony. The id stays 'beach' so discoveries
 // already saved on a device carry over from its old home on the hidden beach.
 {id:'beach',label:'Lighthouse Gallery',section:'Discovery',x:LIGHTHOUSE_GALLERY_NOTE.x,z:LIGHTHOUSE_GALLERY_NOTE.z,elevation:LIGHTHOUSE_GALLERY_NOTE.elevation,radius:2.2,contentId:'frequency',number:'06',interior:null},
 {id:'lab',label:'Alley Room',section:'Labs',x:building('lab').x,z:building('lab').z,radius:4,contentId:'labs',number:'07',interior:'lab'},
 // The lift-ticket window facing the resort forecourt: E opens the snowboard run menu.
 {id:'tickets',label:'Lift Tickets',section:'Snowboard',x:MOUNTAIN_LAYOUT.ticketHut.x,z:MOUNTAIN_LAYOUT.ticketHut.z-MOUNTAIN_LAYOUT.ticketHut.depth/2-.9,radius:2.4,contentId:'snowboard',number:'08',interior:null},
 // The skate-shop counter: E takes a board from the wall behind it.
 {id:'skateshop',label:'Skate Shop Counter',section:'Skateboards',x:skateCounter.x,z:skateCounter.z,radius:2.5,contentId:'skateshop',number:'09',interior:'skateshop'},
 // Anywhere on the grand stairs (or at the top, riding in): E starts a game of S.K.A.T.E.
 {id:'skatepark',label:'Game of S.K.A.T.E.',section:'Skate Park',x:-29.3,z:0,radius:4.4,contentId:'skatepark',number:'10',interior:null},
 // At the seaward rail of the pier head: E opens the bait-and-tackle menu.
 {id:'fishing',label:'Pier Pressure',section:'Fishing',x:fishingSpot.x,z:fishingSpot.z,radius:2.4,contentId:'fishing',number:'11',interior:null},
] as const;
/** Each room names itself while the visitor is inside it. */
const ROOM_AREAS={studio:'Studio Row Gallery',workshop:'WestCose Shop',arcade:'Dead Coast Social Club',about:'West Cose Motel',lab:'Alley Room',skateshop:'WestCose Skate Shop'} as const;
export function areaAt(d:{x:number;y:number;z:number}):string{
 const room=activeInteriorAt(d);
 if(room)return ROOM_AREAS[room];
 const{x,z}=mapCoordinates(d),surface=townSurfaceAt(x,z);
 if(surface.kind==='pier')return 'The Pier';
 if(surface.height<SEA_LEVEL)return 'Open Water';
 if(z>=36){
  const finish=mountainFinishAreaAt(x,z);
  if(finish)return finish.name;
  const run=skiRunSampleAt(x,z);
  if(run&&run.distance<=run.run.width/2+.5&&run.s>0&&run.s<run.run.length)return run.run.name;
  if(z>=MOUNTAIN_LAYOUT.summitPlateau.z-10&&massifHeightAt(x,z)>=66)return 'Mountain Summit';
  if(z>=MOUNTAIN_LAYOUT.pedestrianArrival.z-4&&z<60&&Math.abs(x-MOUNTAIN_LAYOUT.resort.x)<12)return 'Ski Resort';
  if(mountainSnowAt(x,z))return z>MOUNTAIN_LAYOUT.summit.z?'Backcountry':'Snowfield';
  if(z>=40)return z<60?'Forest Trail':'Mountain Forest';
 }
 if(nearSkatepark(x,z)&&skateparkSurfaceAt(x,z))return 'WestCose Skate Park';
 if(grandStairSurfaceAt(x,z))return 'Skate Park Stairs';
 if(x<-32&&x>-100&&Math.abs(z)<45)return westBluffDistance(x,z)<2?'West Bluff':'West Beach';
 const street=downtownSurfaceAt(x,z)?.id;
 const cul=CUL_DE_SACS.find(c=>street===c.id||street===`${c.id}:island`||(street===c.street&&x>=c.cut));
 if(cul)return cul.name;
 // The sea caves name their rooms when a visitor is down inside them.
 const elevation=Math.hypot(d.x,d.y,d.z)-RADIUS,cave=seaCaveAt(x,z);
 if(cave&&cave.sdf<=SEA_CAVE_WALL_OFFSET&&elevation>cave.floor-.6&&elevation<cave.ceiling+.3)return SEA_CAVE_ZONE_NAMES[cave.zone];
 // Up on the lighthouse: its stair, then the balcony.
 const tower=lighthouseLocal(d);
 if(tower.radius<LIGHTHOUSE_TOWER.balcony.outer+.6&&tower.height>1.2)return tower.height>LIGHTHOUSE_TOWER.gallery-.6?'Lighthouse Gallery':'Lighthouse Stair';
 // The placed peninsula's areas, in its own authoring frame.
 const a=peninsulaLocal(x,z);
 if(a){
  if(a.x>=27&&a.x<=41&&a.z>=-35&&a.z<=-19)return 'Lighthouse Point';
  if(a.x>24&&a.x<35&&a.z>-25&&a.z<6)return 'Lighthouse Trail';
  if(cave&&a.x>24)return 'Sea Cave Headland';
 }
 if(z<=-18)return 'The Beach';
 if(z<=-14)return 'Boardwalk';
 if(street==='alley'||(x>=24.4&&x<=33&&z>=-14&&z<=-6))return 'Graffiti Alley';
 if(street==='motel-walk')return 'West Cose Motel';
 if(street==='courtyard')return 'WestCose Courtyard';
 if(street==='pier-st'||street==='pier-west'||street==='pier-east')return 'Pier Street';
 if(street==='west-promenade'||street==='stair-plaza')return 'West Promenade';
 if(z>=16)return z>28?'Upper Town':'Palm Avenue';
 return 'Main Street';
}
const entry=mapCoordinates(directionAt(TOWN_SPAWN.lon,TOWN_SPAWN.lat));
export const PLANET_FIXTURES={
 entry:{x:entry.x,z:entry.z,facing:TOWN_SPAWN.facing},
 courtyard:{x:0,z:16.4,facing:'south'},
 studio:studioFixture,
 alley:{x:26.2,z:-7,facing:'south'},
 // Offset left of the gallery doorway so the forward walking fixture meets a
 // real front wall rather than entering the room through its open door.
 collision:galleryWallFixture,
 // Begin at the actual foot of the stair route. Its first leg climbs nearly
 // north, so this explicit tangent stays on its narrow physical surface.
 stairs:{x:-25.8,z:0,facing:'west'},
 // Stand outside the gallery facing away from its front wall; the follow ray
 // must shorten against that real obstruction.
 camera:galleryCameraFixture,
 seam:{x:0,z:MAP_SEAM-4,facing:'north'},
 // The north geographic pole now lies under the mountain's south face. Exercise
 // the antipodal south pole through the unobstructed rear-ocean lane instead.
 pole:{x:0,z:MAP_RADIUS*Math.PI*1.5-3.9,facing:'north'},
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
 // A step back from the fishing rail, facing out to sea.
 fishing:{x:ANGLER.x,z:ANGLER.z+2.2,facing:'south'},
 pierside:{x:1.2,z:(PIER_LAYOUT.entrance[1]+PIER_LAYOUT.neckEnd[1])/2,facing:'east'},
 pierbeach:{x:10,z:-29,facing:'east'},
 promenade:{x:0,z:-16,facing:'east'},
 eastgrove:{x:18,z:37.5,facing:'north'},
 westgrove:{x:-18,z:37.5,facing:'north'},
 // Upper south face of the snowboard mountain, on the far side of the planet.
 farside:{x:0,z:176,facing:'north'},
 ridge:{x:0,z:200,facing:'north'},
 workshop:workshopFixture,
 // On Palm Ave, facing the WestCose Studio door at Palm Court from just outside its prompt.
 studiooffice:fixtureToward(studioOfficeAt(3.2),studioOfficeAt(0)),
 // The lab's rotated front faces west, so begin outside that doorway and walk
 // east through it rather than spawning inside the room.
 lab:labFixture,
 circuit:{x:0,z:120,facing:'north'},
 skatepark:{x:-34,z:0,facing:'west'},
 skateshop:skateShopFixture,
 mainstreet:{x:-12,z:0,facing:'east'},
 // At the end of the trail, facing the foot of the lighthouse stair.
 lighthouse:caveFixture(-3.4,4.3,LIGHTHOUSE_STAIR_FOOT.u,LIGHTHOUSE_STAIR_FOOT.v),
 // On the lighthouse balcony, just short of the field note.
 lighthousegallery:{...fixtureToward(mapDirection(LIGHTHOUSE_GALLERY_STAND.x,LIGHTHOUSE_GALLERY_STAND.z),mapDirection(LIGHTHOUSE_GALLERY_NOTE.x,LIGHTHOUSE_GALLERY_NOTE.z)),elevation:LIGHTHOUSE_GALLERY_STAND.elevation},
 // On the beach two metres outside the sea-cave mouth, facing in.
 cave:caveFixture(SEA_CAVE_MOUTH.center[0]-2*SEA_CAVE_MOUTH.inward[0]/Math.hypot(...SEA_CAVE_MOUTH.inward),SEA_CAVE_MOUTH.center[1]-2*SEA_CAVE_MOUTH.inward[1]/Math.hypot(...SEA_CAVE_MOUTH.inward),SEA_CAVE_MOUTH.center[0],SEA_CAVE_MOUTH.center[1]),
 // The middle of the Grotto, facing the ocean window.
 grotto:caveFixture(SEA_CAVE_ARENA.center[0],SEA_CAVE_ARENA.center[1],SEA_CAVE_WINDOW.center[0],SEA_CAVE_WINDOW.center[1],{layer:'tunnel'}),
 culdesac:{x:CUL_DE_SACS[0].center[0]-4,z:CUL_DE_SACS[0].center[1]-3.6,facing:'east'},
 motel:{x:16.2,z:-3.9,facing:'south'},
 resort:{x:MOUNTAIN_LAYOUT.pedestrianArrival.x,z:MOUNTAIN_LAYOUT.pedestrianArrival.z,facing:'north'},
 // In front of the lift-ticket hut door, which faces the resort forecourt.
 tickets:{x:MOUNTAIN_LAYOUT.ticketHut.x,z:MOUNTAIN_LAYOUT.ticketHut.z-MOUNTAIN_LAYOUT.ticketHut.depth/2-1.2,facing:'north'},
 summit:{x:MOUNTAIN_LAYOUT.summitPlateau.x,z:MOUNTAIN_LAYOUT.summitPlateau.z,facing:'south'},
} as const;

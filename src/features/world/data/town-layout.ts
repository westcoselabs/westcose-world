import type { TownArea, TownBuilding, TownRoute, BuildingArchetype, DistrictId, RoofStyle } from './town-types';
import { mapGeographic } from './world-map';
import { CAVE_POINTS, CAVE_WIDTH } from './concept-landmarks';
import { PLACED_COVE, PLACED_LIGHTHOUSE } from './peninsula-layout';
import { placedPoint } from './peninsula-frame';
import { MOUNTAIN_LAYOUT } from './mountain-layout';
import { COURTYARD, CUL_DE_SACS } from './downtown-layout';
import { MOTEL } from './town-props';
const P={bone:'#E9DFCE',graphite:'#39474A',steel:'#647778',blue:'#5B7E8A',rust:'#A66A45'};
type Spec=[id:string,x:number,z:number,width:number,depth:number,height:number,archetype:BuildingArchetype,roof:RoofStyle,district:DistrictId,color:string,extra?:Partial<TownBuilding>];
const make=([id,x,z,width,depth,height,archetype,roof,district,color,extra={}]:Spec):TownBuilding=>({id,x,z,...mapGeographic(x,z),width,depth,height,archetype,roof,district,color,kind:'shop',rotation:0,trim:P.bone,accent:P.blue,entryWidth:2.6,entryOffset:0,floorHeight:.45,...extra});
/** Downtown on the widened streets. Local +Z is each front: rotation 0 faces south onto the
 * street in front, PI faces north, PI/2 east and -PI/2 west. Main St fronts sit 0.3m behind
 * the 2.5m sidewalks. The gallery and the shop flank the courtyard and open onto it. */
const MAIN_NORTH=6.3,MAIN_SOUTH=-6.3,PALM_NORTH=27.8,PALM_SOUTH=17.2;
const north=(front:number,depth:number)=>front+depth/2,south=(front:number,depth:number)=>front-depth/2;
const buildings:Spec[]=[
 // Main St, north side, west of the courtyard.
 ['surf-supply',-22.8,north(MAIN_NORTH,7),7,7,6.4,'market','flat','studio-row',P.bone,{sign:'WEST COSE SURF SUPPLY',subtitle:'BOARDS / APPAREL / REPAIRS',awning:true,accent:P.rust}],
 // The two courtyard halls: two storeys tall, their grand entrances facing each other.
 ['studio',-14.2,11.8,10.8,9.6,7.6,'studio','flat','studio-row',P.bone,{kind:'studio',rotation:Math.PI/2,sign:'STUDIO ROW GALLERY',subtitle:'PORTFOLIO / PROJECTS / PROCESS',interior:'studio',awning:true,entryWidth:3.2,facade:'gallery'}],
 ['workshop',14.2,11.8,10.8,9.6,7.2,'warehouse','sawtooth','workshop',P.blue,{kind:'workshop',rotation:-Math.PI/2,sign:'WESTCOSE SHOP',subtitle:'CLOTHING / TEES / HOODIES / HATS',interior:'workshop',awning:true,entryWidth:3.6,accent:P.rust,facade:'shop'}],
 ['skate-shop',24,north(MAIN_NORTH,9.2),9.2,9.2,5.8,'market','flat','workshop',P.graphite,{sign:'WESTCOSE SKATE SHOP',subtitle:'DECKS / WHEELS / GRIP / FREE BOARDS',interior:'skateshop',awning:true,accent:P.rust,entryWidth:2.8,entryOffset:-2.2}],
 // Main St, south side (backs to the boardwalk).
 ['town-corner',-18.3,south(MAIN_SOUTH,6.5),7,6.5,4.2,'corner','flat','studio-row','#A3A58E',{rotation:Math.PI,sign:'DEAD COAST DINER',subtitle:'BURGERS / SHAKES / LATE',awning:true,accent:P.rust}],
 ['arcade',-10.1,south(MAIN_SOUTH,6.5),7.5,6.5,4.8,'arcade','gable','studio-row',P.graphite,{kind:'arcade',rotation:Math.PI,sign:'DEAD COAST SOCIAL CLUB',subtitle:'BAR / ARCADE / GAMES',interior:'arcade',entryWidth:2.8,awning:true,accent:P.rust}],
 // The motel: a glazed lobby on the corner and a two-storey room wing with an open upper walkway.
 ['about',MOTEL.lobby.x,MOTEL.lobby.z,MOTEL.lobby.width,MOTEL.lobby.depth,MOTEL.lobby.height,'motel','flat','courtyard','#D8C4A6',{rotation:Math.PI,sign:'WEST COSE MOTEL',subtitle:'LOBBY / ABOUT / CHECK IN',interior:'about',entryWidth:2.4,entryOffset:-1.35,accent:P.rust,facade:'motel-lobby',floorHeight:MOTEL.floorHeight}],
 ['motel-rooms',MOTEL.rooms.x,MOTEL.rooms.z,MOTEL.rooms.width,MOTEL.rooms.depth,MOTEL.rooms.height,'motel','flat','courtyard','#D8C4A6',{rotation:Math.PI,accent:'#C2653E',facade:'motel-rooms',floorHeight:MOTEL.floorHeight}],
 ['lab',30.2,-11,5,5,3.8,'lab','lean','back-alleys','#737E78',{rotation:-Math.PI/2,sign:'ALLEY ROOM',subtitle:'WESTCOSE LABS',interior:'lab',entryWidth:2.4}],
 // Palm Ave, north side, and a small back-lot shop facing it. The WestCose Studio (services)
 // keeps an office upstairs at Palm Court; its plaque sits beside the street door.
 ['taco-shack',-17.5,north(PALM_NORTH,6),6,6,4.1,'cottage','gable','high-ground','#C98F5E',{sign:'TACO SHACK',subtitle:'BURRITOS / AGUAS FRESCAS',awning:true}],
 ['apartments',-8.5,north(PALM_NORTH,7),8.5,7,8.2,'livework','flat','high-ground','#D9CDB6',{sign:'PALM COURT',subtitle:'APARTMENTS',balcony:true,doorSign:{title:'WESTCOSE STUDIO',subtitle:'SERVICES / UPSTAIRS'}}],
 ['records',8,north(PALM_NORTH,6.5),6.5,6.5,5.4,'corner','flat','high-ground',P.graphite,{sign:'DEAD WAX RECORDS',subtitle:'VINYL / TAPES / SHOWS',accent:P.rust}],
 ['coffee',16,north(PALM_NORTH,6),6,6,4.4,'market','lean','high-ground','#8FA39B',{sign:'SALT & SMOKE',subtitle:'COFFEE / BAKERY',awning:true}],
 ['bike-rental',-23.55,south(PALM_SOUTH,3),5.5,3,3.2,'shed','lean','studio-row',P.blue,{rotation:Math.PI,sign:'BIKE RENTAL',subtitle:'CRUISERS BY THE DAY'}],
 ['resort-lodge',MOUNTAIN_LAYOUT.lodge.x,MOUNTAIN_LAYOUT.lodge.z,MOUNTAIN_LAYOUT.lodge.width,MOUNTAIN_LAYOUT.lodge.depth,4.2,'cottage','gable','high-ground',P.rust,{sign:'WESTCOSE LODGE',subtitle:'SKI RESORT / CONCEPT',floorHeight:MOUNTAIN_LAYOUT.lodge.height}],
 ['ticket-hut',MOUNTAIN_LAYOUT.ticketHut.x,MOUNTAIN_LAYOUT.ticketHut.z,MOUNTAIN_LAYOUT.ticketHut.width,MOUNTAIN_LAYOUT.ticketHut.depth,2.5,'shed','gable','high-ground',P.blue,{sign:'LIFT TICKETS',subtitle:'SNOWBOARD / 4 RUNS',floorHeight:MOUNTAIN_LAYOUT.ticketHut.height}],
];
export const TOWN_BUILDINGS=buildings.map(make);
export const TOWN_AREAS:TownArea[]=[
 {id:'resort',label:'Ski Resort / Base of F',district:'high-ground',center:[MOUNTAIN_LAYOUT.pedestrianArrival.x,MOUNTAIN_LAYOUT.pedestrianArrival.z],width:MOUNTAIN_LAYOUT.pedestrianArrival.width,depth:MOUNTAIN_LAYOUT.pedestrianArrival.depth,material:'gravel',elevation:MOUNTAIN_LAYOUT.pedestrianArrival.height},
 {id:'lighthouse-view',label:'Lighthouse Peninsula Lookout',district:'outskirts',center:[PLACED_LIGHTHOUSE.x,PLACED_LIGHTHOUSE.z],width:6.5,depth:6.5,material:'gravel'},
];
/** The lighthouse trail leaves the Cliff Cul-de-sac's south-east sidewalk, then follows the
 * approved upper trail (authored points, placed with the peninsula) to the lighthouse terrace. */
const MAIN_CUL=CUL_DE_SACS[0];
const trailhead=(degrees:number):[number,number]=>[MAIN_CUL.center[0]+Math.cos(degrees*Math.PI/180)*(MAIN_CUL.walk-.3),MAIN_CUL.center[1]+Math.sin(degrees*Math.PI/180)*(MAIN_CUL.walk-.3)];
/** Paths beyond the paved downtown network (downtown-layout.ts owns the streets). */
export const TOWN_ROUTES:TownRoute[]=[
 {id:'boardwalk',label:'Beach Boardwalk',district:'cove',points:[[-31,-16],[-25,-16],[-12,-16],[0,-16],[12,-16],[24,-16],[35,-16]],width:4,material:'timber',category:'primary'},
 {id:'resort-trail',label:'Forest Route to Resort',district:'high-ground',points:[[0,27.5],[0,34],[-3,38],[-6,42],[0,45]],width:4,material:'dirt',category:'primary'},
 ...MOUNTAIN_LAYOUT.pedestrianLinks.map(link=>({id:link.id,label:link.id.replaceAll('-',' '),district:'high-ground' as const,
  // These closed concept shells are approached, not entered: leave capsule room
  // in front of their approved door-face anchors without moving either building.
  points:link.points.map((point,index)=>[point[0],point[1]-(index===link.points.length-1&&['lodge-walk','ticket-walk'].includes(link.id)?.55:0)] as const),
  width:link.width,material:'dirt' as const,category:'secondary' as const})),
 // Ski runs are carved snow terrain (ski-runs.ts), not walking routes.
 {id:'lighthouse-trail',label:'Lighthouse Upper Trail',district:'outskirts',points:[trailhead(-24),...([[29,-10],[30,-17],[31,-23],[33,-28],[33.05,-32]] as const).map(placedPoint)],width:2.4,material:'dirt',category:'secondary',elevations:[.37,1.35,2.95,4.8,6.3,6.32]},
 {id:'beach-west',label:'West Beach Ramp',district:'cove',points:[[-20,-16],[-18,-22],[-10,-28],[-3,-28]],width:2.4,material:'sand',category:'secondary'},
 {id:'beach-east',label:'East Beach and Cave Access',district:'cove',points:[[33,-16],[31.5,-22.5],...([[20,-28],[24,-29],[26,-29],[28,-29]] as const).map(placedPoint)],width:2.4,material:'sand',category:'secondary'},
 {id:'cave',label:'Covered Cave to Hidden Beach',district:'cove',points:CAVE_POINTS.map(p=>[p[0],p[1]]),width:CAVE_WIDTH,material:'sand',category:'discovery'},
];
export const TOWN_INTERIORS=TOWN_BUILDINGS.filter(b=>b.interior);
export const COASTAL_RADIO=PLACED_COVE;
export const TOWN_SPAWN={...mapGeographic(COURTYARD.spawn[0],COURTYARD.spawn[1]),facing:'south' as const};

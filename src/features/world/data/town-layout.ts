import type { TownArea, TownBuilding, TownRoute, BuildingArchetype, DistrictId, RoofStyle } from './town-types';
import { mapGeographic } from './world-map';
import { CAVE_POINTS, CAVE_WIDTH } from './concept-landmarks';
import { PENINSULA_COVE, PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import { MOUNTAIN_LAYOUT } from './mountain-layout';
import { COURTYARD } from './downtown-layout';
const P={bone:'#E9DFCE',graphite:'#39474A',steel:'#647778',blue:'#5B7E8A',rust:'#A66A45'};
type Spec=[id:string,x:number,z:number,width:number,depth:number,height:number,archetype:BuildingArchetype,roof:RoofStyle,district:DistrictId,color:string,extra?:Partial<TownBuilding>];
const make=([id,x,z,width,depth,height,archetype,roof,district,color,extra={}]:Spec):TownBuilding=>({id,x,z,...mapGeographic(x,z),width,depth,height,archetype,roof,district,color,kind:'shop',rotation:0,trim:P.bone,accent:P.blue,entryWidth:2.6,entryOffset:0,floorHeight:.45,...extra});
/** Downtown on the widened streets. Local +Z is each front: rotation 0 faces south onto the
 * street in front, PI faces north. Main St fronts sit 0.3m behind the 2.5m sidewalks. */
const MAIN_NORTH=6.3,MAIN_SOUTH=-6.3,PALM_NORTH=27.8,PALM_SOUTH=17.2;
const north=(front:number,depth:number)=>front+depth/2,south=(front:number,depth:number)=>front-depth/2;
const buildings:Spec[]=[
 // Main St, north side.
 ['surf-supply',-18.7,north(MAIN_NORTH,7),7,7,6.4,'market','flat','studio-row',P.bone,{sign:'WEST COSE SURF SUPPLY',subtitle:'BOARDS / APPAREL / REPAIRS',awning:true,accent:P.rust}],
 ['studio',-10.9,north(MAIN_NORTH,7),6.8,7,5.4,'studio','sawtooth','studio-row',P.bone,{kind:'studio',sign:'STUDIO ROW GALLERY',subtitle:'PROJECTS / WESTCOSE',interior:'studio',awning:true}],
 ['workshop',10.9,north(MAIN_NORTH,7),6.4,7,4.8,'warehouse','sawtooth','workshop',P.blue,{kind:'workshop',sign:'WESTCOSE SHOP',subtitle:'SERVICES / MADE HERE',interior:'workshop',entryWidth:3.2}],
 ['skate-shop',19.3,north(MAIN_NORTH,8.2),8,8.2,5,'market','flat','workshop',P.graphite,{sign:'WESTCOSE SKATE SHOP',subtitle:'DECKS / WHEELS / GRIP',interior:'skateshop',awning:true,accent:P.rust,entryWidth:2.6,entryOffset:-1.6}],
 // Main St, south side (backs to the boardwalk).
 ['town-corner',-18.3,south(MAIN_SOUTH,6.5),7,6.5,4.2,'corner','flat','studio-row','#A3A58E',{rotation:Math.PI,sign:'DEAD COAST DINER',subtitle:'BURGERS / SHAKES / LATE',awning:true,accent:P.rust}],
 ['arcade',-10.1,south(MAIN_SOUTH,6.5),7.5,6.5,4.8,'arcade','gable','studio-row',P.graphite,{kind:'arcade',rotation:Math.PI,sign:'DEAD COAST SOCIAL CLUB',subtitle:'BAR / ARCADE / GAMES',interior:'arcade',entryWidth:2.8,awning:true,accent:P.rust}],
 ['about',11.4,south(MAIN_SOUTH,6.5),10,6.5,6.2,'motel','flat','courtyard','#D1BA9E',{rotation:Math.PI,sign:'WEST COSE MOTEL',subtitle:'ABOUT / LOBBY',interior:'about',balcony:true}],
 ['lab',21.8,-9.8,4.8,5,3.8,'lab','lean','back-alleys','#737E78',{rotation:-Math.PI/2,sign:'ALLEY ROOM',subtitle:'WESTCOSE LABS',interior:'lab',entryWidth:2.4}],
 // Palm Ave, north side, and two small back-lot shops facing it.
 ['taco-shack',-17.5,north(PALM_NORTH,6),6,6,4.1,'cottage','gable','high-ground','#C98F5E',{sign:'TACO SHACK',subtitle:'BURRITOS / AGUAS FRESCAS',awning:true}],
 ['apartments',-8.5,north(PALM_NORTH,7),8.5,7,8.2,'livework','flat','high-ground','#D9CDB6',{sign:'PALM COURT',subtitle:'APARTMENTS',balcony:true}],
 ['records',8,north(PALM_NORTH,6.5),6.5,6.5,5.4,'corner','flat','high-ground',P.graphite,{sign:'DEAD WAX RECORDS',subtitle:'VINYL / TAPES / SHOWS',accent:P.rust}],
 ['coffee',16,north(PALM_NORTH,6),6,6,4.4,'market','lean','high-ground','#8FA39B',{sign:'SALT & SMOKE',subtitle:'COFFEE / BAKERY',awning:true}],
 ['bike-rental',-18.7,south(PALM_SOUTH,3),5.5,3,3.2,'shed','lean','studio-row',P.blue,{rotation:Math.PI,sign:'BIKE RENTAL',subtitle:'CRUISERS BY THE DAY'}],
 ['laundry',11,south(PALM_SOUTH,3),5.5,3,3.3,'garage','flat','workshop','#B8B2A2',{rotation:Math.PI,sign:'SUDS LAUNDRY',subtitle:'WASH / DRY / FOLD'}],
 ['resort-lodge',MOUNTAIN_LAYOUT.lodge.x,MOUNTAIN_LAYOUT.lodge.z,MOUNTAIN_LAYOUT.lodge.width,MOUNTAIN_LAYOUT.lodge.depth,4.2,'cottage','gable','high-ground',P.rust,{sign:'WESTCOSE LODGE',subtitle:'SKI RESORT / CONCEPT',floorHeight:MOUNTAIN_LAYOUT.lodge.height}],
 ['ticket-hut',MOUNTAIN_LAYOUT.ticketHut.x,MOUNTAIN_LAYOUT.ticketHut.z,MOUNTAIN_LAYOUT.ticketHut.width,MOUNTAIN_LAYOUT.ticketHut.depth,2.5,'shed','gable','high-ground',P.blue,{sign:'LIFT TICKETS',subtitle:'SNOWBOARD / 4 RUNS',floorHeight:MOUNTAIN_LAYOUT.ticketHut.height}],
];
export const TOWN_BUILDINGS=buildings.map(make);
export const TOWN_AREAS:TownArea[]=[
 {id:'resort',label:'Ski Resort / Base of F',district:'high-ground',center:[MOUNTAIN_LAYOUT.pedestrianArrival.x,MOUNTAIN_LAYOUT.pedestrianArrival.z],width:MOUNTAIN_LAYOUT.pedestrianArrival.width,depth:MOUNTAIN_LAYOUT.pedestrianArrival.depth,material:'gravel',elevation:MOUNTAIN_LAYOUT.pedestrianArrival.height},
 {id:'lighthouse-view',label:'Lighthouse Peninsula Lookout',district:'outskirts',center:[PENINSULA_LIGHTHOUSE.x,PENINSULA_LIGHTHOUSE.z],width:6.5,depth:6.5,material:'gravel'},
];
/** Paths beyond the paved downtown network (downtown-layout.ts owns the streets). */
export const TOWN_ROUTES:TownRoute[]=[
 {id:'boardwalk',label:'Beach Boardwalk',district:'cove',points:[[-31,-16],[-25,-16],[-12,-16],[0,-16],[12,-16],[24,-16]],width:4,material:'timber',category:'primary'},
 {id:'resort-trail',label:'Forest Route to Resort',district:'high-ground',points:[[0,27.5],[0,34],[-3,38],[-6,42],[0,45]],width:4,material:'dirt',category:'primary'},
 ...MOUNTAIN_LAYOUT.pedestrianLinks.map(link=>({id:link.id,label:link.id.replaceAll('-',' '),district:'high-ground' as const,
  // These closed concept shells are approached, not entered: leave capsule room
  // in front of their approved door-face anchors without moving either building.
  points:link.points.map((point,index)=>[point[0],point[1]-(index===link.points.length-1&&['lodge-walk','ticket-walk'].includes(link.id)?.55:0)] as const),
  width:link.width,material:'dirt' as const,category:'secondary' as const})),
 // Ski runs are carved snow terrain (ski-runs.ts), not walking routes.
 // Ends .15m further west than on the radius-36 globe: the tower foot spans more chart
 // width at the larger radius, and the trail's edge lanes must still clear it.
 {id:'lighthouse-trail',label:'Lighthouse Upper Trail',district:'outskirts',points:[[20,4],[23,0],[27,-3],[29,-10],[30,-17],[31,-23],[33,-28],[33.05,-32]],width:2.4,material:'dirt',category:'secondary',elevations:[.2,.2,.4,1.35,2.95,4.8,6.3,6.32]},
 {id:'beach-west',label:'West Beach Ramp',district:'cove',points:[[-20,-16],[-18,-22],[-10,-28],[-3,-28]],width:2.4,material:'sand',category:'secondary'},
 {id:'beach-east',label:'East Beach and Cave Access',district:'cove',points:[[20,-16],[18,-23],[20,-28],[24,-29],[26,-29],[28,-29]],width:2.4,material:'sand',category:'secondary'},
 {id:'cave',label:'Covered Cave to Hidden Beach',district:'cove',points:CAVE_POINTS.map(p=>[p[0],p[1]]),width:CAVE_WIDTH,material:'sand',category:'discovery'},
];
export const TOWN_INTERIORS=TOWN_BUILDINGS.filter(b=>b.interior);
export const COASTAL_RADIO=PENINSULA_COVE;
export const TOWN_SPAWN={...mapGeographic(COURTYARD.spawn[0],COURTYARD.spawn[1]),facing:'south' as const};

import type { TownArea, TownBuilding, TownRoute, BuildingArchetype, DistrictId, RoofStyle } from './town-types';
import { mapGeographic } from './world-map';
import { CAVE_POINTS, CAVE_WIDTH } from './concept-landmarks';
import { PENINSULA_COVE, PENINSULA_LIGHTHOUSE } from './peninsula-layout';
import { MOUNTAIN_LAYOUT, MOUNTAIN_RUNS } from './mountain-layout';
const P={bone:'#E9DFCE',graphite:'#39474A',steel:'#647778',blue:'#5B7E8A',rust:'#A66A45'};
type Spec=[id:string,x:number,z:number,width:number,depth:number,height:number,archetype:BuildingArchetype,roof:RoofStyle,district:DistrictId,color:string,extra?:Partial<TownBuilding>];
const make=([id,x,z,width,depth,height,archetype,roof,district,color,extra={}]:Spec):TownBuilding=>({id,x,z,...mapGeographic(x,z),width,depth,height,archetype,roof,district,color,kind:'shop',rotation:0,trim:P.bone,accent:P.blue,entryWidth:2.6,entryOffset:0,floorHeight:.4,...extra});
/** Compact reference composition; local +Z faces the waterfront. */
const buildings:Spec[]=[
 ['studio',-9,7,6.8,7,5.2,'studio','sawtooth','studio-row',P.bone,{kind:'studio',sign:'PORTFOLIO GALLERY',subtitle:'PROJECTS / WESTCOSE',interior:'studio',awning:true}],
 ['workshop',8,7,6.4,7,4.5,'warehouse','sawtooth','workshop',P.blue,{kind:'workshop',sign:'WESTCOSE SHOP',subtitle:'SERVICES / MADE HERE',interior:'workshop',entryWidth:3.2}],
 ['skate-shop',14.2,7,5,6,3.8,'market','lean','workshop',P.steel,{sign:'SKATE SHOP',subtitle:'CONNECTED TO WESTCOSE SHOP',awning:true}],
 ['arcade',-8,-6,7.5,6,4.6,'arcade','gable','studio-row',P.graphite,{kind:'arcade',rotation:Math.PI,sign:'SOCIAL CLUB',subtitle:'BAR / ARCADE / GAMES',interior:'arcade',entryWidth:2.8,awning:true,accent:P.rust}],
 ['about',8,-6,10,6,5.6,'motel','flat','courtyard','#D1BA9E',{rotation:Math.PI,sign:'WESTCOSE MOTEL',subtitle:'ABOUT / LOBBY',interior:'about',balcony:true}],
 ['lab',19.5,-6,4.8,5,3.8,'lab','lean','back-alleys','#737E78',{rotation:-Math.PI/2,sign:'ALLEY ROOM',subtitle:'WESTCOSE LABS',interior:'lab',entryWidth:2.4}],
 ['town-corner',-17,-6,6,5.5,3.5,'market','flat','studio-row','#A3A58E',{rotation:Math.PI,sign:'THE BLVD',subtitle:'WESTCOSE / CONCEPT',awning:true}],
 ['resort-lodge',MOUNTAIN_LAYOUT.lodge.x,MOUNTAIN_LAYOUT.lodge.z,MOUNTAIN_LAYOUT.lodge.width,MOUNTAIN_LAYOUT.lodge.depth,4.2,'cottage','gable','high-ground',P.rust,{sign:'WESTCOSE LODGE',subtitle:'SKI RESORT / CONCEPT',floorHeight:MOUNTAIN_LAYOUT.lodge.height}],
 ['ticket-hut',MOUNTAIN_LAYOUT.ticketHut.x,MOUNTAIN_LAYOUT.ticketHut.z,MOUNTAIN_LAYOUT.ticketHut.width,MOUNTAIN_LAYOUT.ticketHut.depth,2.5,'shed','gable','high-ground',P.blue,{sign:'LIFT TICKETS',subtitle:'TRAILS 1 / 2 / 3',floorHeight:MOUNTAIN_LAYOUT.ticketHut.height}],
];
export const TOWN_BUILDINGS=buildings.map(make);
export const TOWN_AREAS:TownArea[]=[
 {id:'courtyard',label:'Courtyard / Arrival',district:'courtyard',center:[0,8],width:10,depth:11,material:'concrete',elevation:.3},
 {id:'resort',label:'Ski Resort / Base of F',district:'high-ground',center:[MOUNTAIN_LAYOUT.pedestrianArrival.x,MOUNTAIN_LAYOUT.pedestrianArrival.z],width:MOUNTAIN_LAYOUT.pedestrianArrival.width,depth:MOUNTAIN_LAYOUT.pedestrianArrival.depth,material:'gravel',elevation:MOUNTAIN_LAYOUT.pedestrianArrival.height},
 {id:'lighthouse-view',label:'Lighthouse Peninsula Lookout',district:'outskirts',center:[PENINSULA_LIGHTHOUSE.x,PENINSULA_LIGHTHOUSE.z],width:6.5,depth:6.5,material:'gravel'},
];
export const TOWN_ROUTES:TownRoute[]=[
 {id:'boulevard',label:'The Boulevard',district:'studio-row',points:[[-23,0],[-12,0],[0,0],[12,0],[20,0]],width:4,material:'asphalt',category:'primary',elevation:.22},
 {id:'main-street',label:'Courtyard to Pier',district:'courtyard',points:[[0,8],[0,0],[0,-16]],width:4,material:'concrete',category:'primary'},
 {id:'boardwalk',label:'Beach Boardwalk',district:'cove',points:[[-25,-16],[-12,-16],[0,-16],[12,-16],[24,-16]],width:4,material:'timber',category:'primary'},
 {id:'gallery-entry',label:'Gallery Entrance',district:'studio-row',points:[[-9,0],[-9,4]],width:2.8,material:'concrete',category:'secondary'},
 {id:'shop-entry',label:'Shop Entrance',district:'workshop',points:[[8,0],[8,4]],width:3.2,material:'concrete',category:'secondary'},
 {id:'shop-link',label:'Connected Skate Shop',district:'workshop',points:[[8,2],[14.2,2],[14.2,2.5]],width:2.4,material:'concrete',category:'secondary'},
 {id:'social-entry',label:'Social Club Entrance',district:'studio-row',points:[[-8,0],[-8,-3]],width:2.8,material:'concrete',category:'secondary'},
 {id:'motel-entry',label:'Motel Lobby',district:'courtyard',points:[[8,0],[8,-3]],width:2.8,material:'concrete',category:'secondary'},
 {id:'alley',label:'Graffiti Alley',district:'back-alleys',points:[[20,4],[16.5,0],[16.5,-6],[16.5,-16]],width:2.4,material:'concrete',category:'secondary'},
 {id:'lab-entry',label:'Alley Room',district:'back-alleys',points:[[16.5,-6],[17.5,-6]],width:2.4,material:'concrete',category:'secondary'},
 {id:'forest-trail',label:'Forest Trail to Skate Park',district:'high-ground',points:[[-25,-16],[-30,-11],[-33,-1],[-32,8],[-27,15]],width:2.4,material:'dirt',category:'secondary'},
 {id:'skate-stairs',label:'Skate Park Stairs',district:'high-ground',points:[[-23,0],[-24,5],[-27,9]],width:3,material:'concrete',category:'secondary'},
 {id:'resort-trail',label:'Forest Route to Resort',district:'high-ground',points:[[0,13],[0,20],[7,27],[8,34],[-6,42],[0,45]],width:4,material:'dirt',category:'primary'},
 ...MOUNTAIN_LAYOUT.pedestrianLinks.map(link=>({id:link.id,label:link.id.replaceAll('-',' '),district:'high-ground' as const,
  // These closed concept shells are approached, not entered: leave capsule room
  // in front of their approved door-face anchors without moving either building.
  points:link.points.map((point,index)=>[point[0],point[1]-(index===link.points.length-1&&['lodge-walk','ticket-walk'].includes(link.id)?.55:0)] as const),
  width:link.width,material:'dirt' as const,category:'secondary' as const})),
 ...MOUNTAIN_RUNS.map(run=>({id:run.id,label:`${run.number} / ${run.name}`,district:'high-ground' as const,points:run.points.map(p=>[p[0],p[1]] as const),width:run.width,material:'concrete' as const,category:'primary' as const})),
 // Separate walking fan-out and finish links; racing centerlines stay exactly as approved.
 ...MOUNTAIN_RUNS.flatMap(run=>[
  {id:`${run.id}-gate`,label:`Walk to trail ${run.number}`,district:'high-ground' as const,points:[[0,151],[run.points[0][0]*.4,150],[run.points[0][0],148]] as const,width:3,material:'concrete' as const,category:'secondary' as const},
  {id:`${run.id}-return`,label:`Trail ${run.number} run-out to F`,district:'high-ground' as const,points:[[run.points.at(-1)![0],64],[run.points.at(-1)![0],61],[2.1,61]] as const,width:2.4,material:'concrete' as const,category:'secondary' as const},
 ]),
 {id:'ski-summit-walk',label:'Summit to route-choice apron',district:'high-ground',points:[[0,153],[0,151]],width:3,material:'concrete',category:'secondary'},
 {id:'lighthouse-trail',label:'Lighthouse Upper Trail',district:'outskirts',points:[[20,4],[23,0],[27,-3],[29,-10],[30,-17],[31,-23],[33,-28],[33.2,-32]],width:2.4,material:'dirt',category:'secondary',elevations:[.2,.2,.4,1.35,2.95,4.8,6.3,6.32]},
 {id:'beach-west',label:'West Beach Ramp',district:'cove',points:[[-20,-16],[-18,-22],[-10,-28],[-3,-28]],width:2.4,material:'sand',category:'secondary'},
 {id:'beach-east',label:'East Beach and Cave Access',district:'cove',points:[[20,-16],[18,-23],[20,-28],[24,-29],[26,-29],[28,-29]],width:2.4,material:'sand',category:'secondary'},
 {id:'cave',label:'Covered Cave to Hidden Beach',district:'cove',points:CAVE_POINTS.map(p=>[p[0],p[1]]),width:CAVE_WIDTH,material:'sand',category:'discovery'},
];
export const TOWN_INTERIORS=TOWN_BUILDINGS.filter(b=>b.interior);
export const COASTAL_RADIO=PENINSULA_COVE;
export const TOWN_SPAWN={...mapGeographic(0,8),facing:'south' as const};

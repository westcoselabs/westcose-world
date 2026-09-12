import type { TownArea, TownBuilding, TownRoute, BuildingArchetype, DistrictId, RoofStyle } from './town-types';
import { mapGeographic } from './world-map';
import { CAVE_POINTS, CAVE_WIDTH } from './concept-landmarks';
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
 ['resort-lodge',-7,115,7,5,4.2,'cottage','gable','high-ground',P.rust,{sign:'WESTCOSE LODGE',subtitle:'SKI RESORT / CONCEPT',floorHeight:2.8}],
 ['ticket-hut',6,116,3,3,2.5,'shed','gable','high-ground',P.blue,{sign:'LIFT TICKETS',subtitle:'TRAILS 1 / 2 / 3',floorHeight:2.8}],
];
export const TOWN_BUILDINGS=buildings.map(make);
export const TOWN_AREAS:TownArea[]=[
 {id:'courtyard',label:'Courtyard / Arrival',district:'courtyard',center:[0,8],width:10,depth:11,material:'concrete',elevation:.3},
 {id:'resort',label:'Ski Resort',district:'high-ground',center:[0,112],width:20,depth:8,material:'gravel',elevation:2.5},
 {id:'lighthouse-view',label:'Lighthouse Peninsula Lookout',district:'outskirts',center:[36,-28.5],width:8.5,depth:7.5,material:'gravel',elevation:7.8},
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
 {id:'resort-trail',label:'Forest Route to Resort',district:'high-ground',points:[[0,13],[0,20],[7,27],[8,34],[-6,42],[-9,49],[6,58],[10,68],[-5,79],[-8,87],[6,97],[7,103],[0,109],[0,115]],width:4,material:'dirt',category:'primary'},
 {id:'ski-central',label:'1 / Central Snow Trail',district:'high-ground',points:[[0,115],[0,132],[4,139],[0,146],[0,153]],width:4,material:'concrete',category:'primary'},
 {id:'ski-west',label:'2 / Western Forest Trail',district:'high-ground',points:[[0,115],[-7,122],[-12,130],[-16,139],[-9,149],[0,153]],width:4,material:'concrete',category:'primary'},
 {id:'ski-east',label:'3 / Eastern Contour Trail',district:'high-ground',points:[[0,115],[9,121],[14,131],[15,140],[9,148],[0,153]],width:4,material:'concrete',category:'primary'},
 {id:'lighthouse-trail',label:'Lighthouse Upper Trail',district:'outskirts',points:[[20,4],[23,0],[24.5,-10],[25.5,-14],[23,-21],[19,-23],[18.5,-29],[20,-33],[24,-36],[29,-38],[32.8,-35],[32.8,-27]],width:2.4,material:'dirt',category:'secondary',elevations:[.2,.2,.2,.2,.1,-.05,-.1,-.1,.8,3.6,6.2,7.8]},
 {id:'beach-west',label:'West Beach Ramp',district:'cove',points:[[-20,-16],[-18,-22],[-10,-28],[-3,-28]],width:2.4,material:'sand',category:'secondary'},
 {id:'beach-east',label:'East Beach and Cave Access',district:'cove',points:[[20,-16],[18,-23],[20,-28],[24,-29]],width:2.4,material:'sand',category:'secondary'},
 {id:'cave',label:'Covered Cave to Hidden Beach',district:'cove',points:CAVE_POINTS.map(p=>[p[0],p[1]]),width:CAVE_WIDTH,material:'sand',category:'discovery'},
];
export const TOWN_INTERIORS=TOWN_BUILDINGS.filter(b=>b.interior);
export const COASTAL_RADIO={x:35,z:1} as const;
export const TOWN_SPAWN={...mapGeographic(0,8),facing:'south' as const};

/** Frozen pre-mountain town substrate, moved verbatim from town-surfaces.ts so the
 * mountain and ski-run modules can sample the same base terrain without a cycle.
 * Chart coordinates only; no radius or runtime dependencies.
 */
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
// Frozen pre-approval substrate. Only the bounded mountain overlay changes its massif.
const ORIGINAL_SUMMIT={z:153,height:32};

/** West bluff: a level plateau at the skate-park deck height, with a steep grass bank
 * straight down into the sea on its open sides (a sand beach would sprawl across the
 * chart this far west). The town-facing east edge is a retaining wall at chart x -32. */
export const WEST_BLUFF={x:-54.6,z:0,halfX:22.6,halfZ:29.5,corner:8,top:3.25} as const;
export function westBluffDistance(x:number,z:number){
 const b=WEST_BLUFF,k=Math.cos(x/72);
 const qx=Math.abs(x-b.x)-(b.halfX-b.corner),qz=Math.abs(z-b.z)*k-(b.halfZ-b.corner);
 return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-b.corner;
}
export function westBluffAt(x:number,z:number){
 if(x>-20||x<-90)return -3;
 // The retaining wall along the town side is a clean vertical face, not a bank.
 if(x>-32&&z>-24&&z<27.5)return -3;
 const d=westBluffDistance(x,z),top=WEST_BLUFF.top;
 if(d<=-1)return top;
 if(d<=0)return top-.25*smooth(-1,0,d);
 // A steep grass bank, a strip of rock and sand at the waterline, then deep water.
 if(d<=3.5)return top-.25+(.15-(top-.25))*smooth(0,3.5,d)**.85;
 if(d<=5.5)return .15+(-1.3-.15)*smooth(3.5,5.5,d);
 return -1.3+(-3+1.3)*smooth(5.5,8,d);
}

/** Broad continuous island, with scalloped shores instead of a rectangular land strip. */
export function existingIslandTerrainAt(x:number,z:number):number {
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
 // The west bluff carries the skate park above a new west beach.
 height=Math.max(height,westBluffAt(x,z));
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

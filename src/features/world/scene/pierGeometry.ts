import * as THREE from 'three';
import { PIER_LAYOUT, PIER_SUPPORT_ROWS, pierFrameAt, pierHeightAtZ, pierPointAt, pierWidthAtZ } from '../data/pier-layout';
import { PIER_RAIL_POSTS, PIER_RAIL_SEGMENTS } from '../data/pier-rails';
import { PIER_SHACK } from '../data/town-props';
import { SceneryBatch } from './sceneryGeometry';
import { SURFACE } from './materials/surface-types';
import type { PhysicalSign } from './kit/context';

type Triple=[number,number,number];
const PLANKS=['#968574','#A18D73','#B5A58B','#93816C','#A78A68'];
const BEAM='#80715E',IRON='#425F65',BONE='#D3C3A4';
const IDENTITY=new THREE.Matrix4(),UP=new THREE.Vector3(0,1,0);

/** Curved plank top and thickness, sampled from the same radial surface as support. */
function plank(width:number,north:number,south:number){
  const positions:number[]=[],uvs:number[]=[],heights:number[]=[];
  const across=Math.ceil(width/.48);
  const vertex=(u:number,z:number,offset:number)=>pierPointAt(u,z,pierHeightAtZ(z)+offset);
  const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,coords:readonly Triple[])=>{
    for(const [index,p] of [a,b,c].entries()){
      positions.push(p.x,p.y,p.z);uvs.push(coords[index][1],coords[index][0]);heights.push(0);
    }
  };
  const quad=(corners:readonly [number,number,number][],reverse=false)=>{
    const points=corners.map(([u,z,h])=>vertex(u,z,h));
    const faces=reverse?[[0,1,2],[1,3,2]]:[[0,2,1],[1,2,3]];
    for(const face of faces)triangle(points[face[0]],points[face[1]],points[face[2]],face.map(index=>[corners[index][0],corners[index][1],0]));
  };
  for(let index=0;index<across;index++){
    const a=(index/across-.5)*width,b=((index+1)/across-.5)*width,bottom=-PIER_LAYOUT.boardThickness;
    quad([[a,north,0],[b,north,0],[a,south,0],[b,south,0]]);
    quad([[a,north,bottom],[b,north,bottom],[a,south,bottom],[b,south,bottom]],true);
    quad([[a,north,bottom],[b,north,bottom],[a,north,0],[b,north,0]]);
    quad([[a,south,0],[b,south,0],[a,south,bottom],[b,south,bottom]]);
    if(index===0)quad([[a,north,0],[a,south,0],[a,north,bottom],[a,south,bottom]]);
    if(index===across-1)quad([[b,south,0],[b,north,0],[b,south,bottom],[b,north,bottom]]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('surfaceUv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('surfaceKind',new THREE.Float32BufferAttribute(new Float32Array(heights.length).fill(SURFACE.timber),1));
  geometry.setAttribute('surfaceHeight',new THREE.Float32BufferAttribute(heights,1));
  geometry.computeVertexNormals();return geometry;
}

export function buildPierGeometry(){
  const solid=new SceneryBatch(),glow=new SceneryBatch(),signs:PhysicalSign[]=[];
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,8),ring=new THREE.TorusGeometry(1,.17,6,18);
  const cub=(parent:THREE.Matrix4,position:Triple,size:Triple,color:string,rotation:Triple=[0,0,0],kind:number=SURFACE.timber)=>solid.shape(box,parent,position,size,color,rotation,{kind});
  const post=(parent:THREE.Matrix4,position:Triple,radius:number,height:number,color:string,kind:number=SURFACE.timber)=>solid.shape(cylinder,parent,position,[radius,height,radius],color,[0,0,0],{kind});
  const beam=(a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number,color:string,kind:number=SURFACE.timber)=>{
    const delta=b.clone().sub(a),matrix=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(UP,delta.clone().normalize()),new THREE.Vector3(width,delta.length(),depth));
    solid.add(box,matrix,color,{kind});
  };
  const localBeam=(parent:THREE.Matrix4,a:Triple,b:Triple,width:number,color:string)=>beam(new THREE.Vector3(...a).applyMatrix4(parent),new THREE.Vector3(...b).applyMatrix4(parent),width,width,color);

  let boardCount=0;
  const headLandwardEdge=PIER_LAYOUT.head.center[1]+PIER_LAYOUT.head.depth/2;
  for(const [start,end,width] of [[PIER_LAYOUT.approach.start[1],headLandwardEdge,PIER_LAYOUT.width],[headLandwardEdge,PIER_LAYOUT.head.center[1]-PIER_LAYOUT.head.depth/2,PIER_LAYOUT.head.width]]){
    const count=Math.ceil((start-end)/PIER_LAYOUT.plankPitch),pitch=(start-end)/count;
    for(let index=0;index<count;index++){
      const north=start-index*pitch,south=start-(index+1)*pitch;
      const geometry=plank(width,north-.003,south+.003);
      solid.add(geometry,IDENTITY,PLANKS[boardCount++%PLANKS.length]);geometry.dispose();
    }
  }

  // Rows of driven timber piles and cross-braces expose a real structure above the water.
  for(const z of PIER_SUPPORT_ROWS){
    const width=pierWidthAtZ(z);
    const pileAcross=width/2-.32,deckHeight=pierHeightAtZ(z);
    const frame=pierFrameAt(0,z),pileHeight=deckHeight-PIER_LAYOUT.pileBottom+.18;
    for(const side of [-1,1]){
      const column=pierFrameAt(side*pileAcross,z).matrix;
      post(column,[0,-pileHeight/2+.12,0],.18,pileHeight,BEAM);
      post(column,[0,-deckHeight-.8,0],.185,.24,'#52645B');
      cub(column,[0,-.35,0],[.42,.17,.42],'#968574');
    }
    cub(frame.matrix,[0,-.39,0],[width+.18,.32,.34],BEAM);
    localBeam(frame.matrix,[-pileAcross,-2.45,0],[pileAcross,-.54,0],.15,'#93816C');
    localBeam(frame.matrix,[pileAcross,-2.45,.05],[-pileAcross,-.54,.05],.15,'#93816C');
  }
  for(let index=1;index<PIER_SUPPORT_ROWS.length;index++){
    const north=PIER_SUPPORT_ROWS[index-1],south=PIER_SUPPORT_ROWS[index];
    for(const side of [-1,1]){
      const northU=side*(pierWidthAtZ(north)/2-.32),southU=side*(pierWidthAtZ(south)/2-.32);
      beam(pierPointAt(northU,north,pierHeightAtZ(north)-.3),pierPointAt(southU,south,pierHeightAtZ(south)-.3),.16,.22,BEAM);
      if(index%2===0)beam(pierPointAt(northU,north,pierHeightAtZ(north)-2.3),pierPointAt(southU,south,pierHeightAtZ(south)-.55),.12,.12,'#93816C');
    }
  }

  for(const rail of PIER_RAIL_SEGMENTS){
    const m=new THREE.Matrix4().compose(rail.center,rail.quaternion,new THREE.Vector3(1,1,1));
    cub(m,[0,rail.size.y/2-.035,0],[.19,.10,rail.size.z],BONE);
    cub(m,[0,-.04,0],[.09,.085,rail.size.z],'#968574');
    cub(m,[0,-rail.size.y/2+.14,0],[.12,.12,rail.size.z],BEAM);
    const count=Math.max(1,Math.ceil(rail.size.z/.21));
    for(let index=1;index<count;index++)cub(m,[0,.015,(index/count-.5)*rail.size.z],[.036,.84,.036],'#80715E');
  }
  for(const railPost of PIER_RAIL_POSTS){
    const m=new THREE.Matrix4().compose(railPost.center,railPost.quaternion,new THREE.Vector3(1,1,1));
    cub(m,[0,0,0],railPost.size.toArray() as Triple,'#93816C');
    cub(m,[0,railPost.size.y/2+.025,0],[.22,.05,.22],BONE);
    for(const height of [-.27,.33])post(m,[0,height,.09],.025,.035,IRON,SURFACE.metal);
  }

  const bench=(u:number,z:number,yaw:number)=>{
    const m=pierFrameAt(u,z).matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
    for(let index=0;index<4;index++)cub(m,[0,.49,(index-1.5)*.12],[1.55,.07,.1],PLANKS[index]);
    for(let index=0;index<3;index++)cub(m,[0,.71+index*.14,-.27],[1.55,.10,.065],PLANKS[index]);
    for(const x of [-.57,.57]){
      cub(m,[x,.25,0],[.08,.5,.46],IRON,[0,0,0],SURFACE.metal);
      cub(m,[x,.72,-.28],[.07,.8,.07],IRON,[0,0,0],SURFACE.metal);
    }
  };
  const headCenter = PIER_LAYOUT.head.center[1];
  const headTip = headCenter - PIER_LAYOUT.head.depth / 2;
  const headSide = PIER_LAYOUT.head.width / 2 - .72;
  bench(-headSide, headCenter - 1.4, Math.PI / 2); bench(-headSide, headCenter + 2.2, Math.PI / 2); bench(headSide, headTip + 2.2, -Math.PI / 2);
  // Benches along the walkway rails look out over the surf.
  const railSide = PIER_LAYOUT.width / 2 - .42;
  for (const [u, z] of [[-railSide, -36.2], [railSide, -42.8], [-railSide, -49.4]] as const) bench(u, z, u < 0 ? Math.PI / 2 : -Math.PI / 2);

  const lantern=(u:number,z:number)=>{
    const m=pierFrameAt(u,z).matrix;
    post(m,[0,1.16,0],.048,2.32,IRON,SURFACE.metal);
    cub(m,[0,2.28,0],[.34,.08,.34],IRON,[0,0,0],SURFACE.metal);
    glow.shape(box,m,[0,2.1,0],[.22,.30,.22],'#E5B574');
    cub(m,[0,1.93,0],[.29,.055,.29],IRON,[0,0,0],SURFACE.metal);
    for(const x of [-.13,.13])for(const z of [-.13,.13])cub(m,[x,2.1,z],[.025,.34,.025],IRON,[0,0,0],SURFACE.metal);
  };
  const deckSide = PIER_LAYOUT.width / 2 - .15;
  // Lanterns every 6.5m down the walkway, alternating sides, then round the head.
  for (let i = 0; i < 6; i++) lantern(i % 2 ? deckSide : -deckSide, -19.5 - i * 6.5);
  lantern(-deckSide, PIER_LAYOUT.neckEnd[1] + .55); lantern(deckSide, PIER_LAYOUT.neckEnd[1] + .55);
  lantern(-headSide, headTip + .62); lantern(headSide, headTip + .62);
  lantern(-headSide, headCenter + .4);

  // The bait shack: weathered boards, a serving hatch toward the walkway, a lean-to roof.
  const shackAcross = (PIER_SHACK.across0 + PIER_SHACK.across1) / 2, shackZ = (PIER_SHACK.z0 + PIER_SHACK.z1) / 2;
  const sw = PIER_SHACK.across1 - PIER_SHACK.across0, sd = PIER_SHACK.z1 - PIER_SHACK.z0, sh = PIER_SHACK.height;
  const shack = pierFrameAt(shackAcross, shackZ).matrix;
  cub(shack, [0, sh / 2, 0], [sw, sh, sd], '#7C929A', [0, 0, 0], SURFACE.plaster);
  for (let i = 0; i < Math.round(sh / .22); i++) cub(shack, [-sw / 2 - .012, .11 + i * .22, 0], [.02, .04, sd], '#6A7F87');
  cub(shack, [-sw / 2 - .02, 1.45, -.2], [.06, .95, 1.8], '#2E3E44');
  cub(shack, [-sw / 2 - .25, 1.0, -.2], [.5, .07, 1.9], '#A18D73');
  cub(shack, [-sw / 2 - .55, 2.05, -.2], [1.1, .06, 2.2], BEAM, [0, 0, -.18]);
  glow.shape(box, shack, [-sw / 2 - .03, 1.45, -.2], [.02, .8, 1.65], '#E5B574');
  cub(shack, [0, sh + .12, 0], [sw + .5, .12, sd + .5], '#4F5A5C', [0, 0, .08]);
  cub(shack, [-sw / 2 + .2, sh - .45, sd / 2 + .03], [.9, .06, .03], BONE);
  for (let i = 0; i < 3; i++) post(shack, [sw / 2 - .4 - i * .45, .5, sd / 2 + .25], .2, .02, ['#C4553F', '#E9DFCE', '#D9A441'][i], SURFACE.plaster);
  signs.push({title:'BAIT & TACKLE',subtitle:'SNACKS / COLD DRINKS / RODS FOR HIRE',width:sd - .3,height:.42,matrix:shack.clone().multiply(new THREE.Matrix4().makeTranslation(-sw / 2 - .04, sh - .38, 0)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI/2)),background:'#2E3E44',dark:true});
  // A coin-op viewer at the seaward rail.
  const viewer = pierFrameAt(-2.6, headTip + .7).matrix;
  post(viewer, [0, .55, 0], .06, 1.1, IRON, SURFACE.metal);
  cub(viewer, [0, 1.2, 0], [.32, .28, .46], '#5B7E8A', [0, 0, 0], SURFACE.metal);
  for (const side of [-1, 1]) post(viewer, [side * .08, 1.24, .28], .06, .16, IRON, SURFACE.metal);

  // Fishing hardware, tied rope and a life ring make the head read as a public pier.
  for(const side of [-1,1]){
    const m=pierFrameAt(side*(PIER_LAYOUT.head.width / 2 - .3),headCenter-.85).matrix;
    localBeam(m,[0,.82,0],[side*.28,1.2,-.03],.055,IRON);
    beam(new THREE.Vector3(0,.88,0).applyMatrix4(m),new THREE.Vector3(side*.72,2.05,-.17).applyMatrix4(m),.02,.02,IRON,SURFACE.metal);
    for(let loop=0;loop<3;loop++)solid.shape(ring,m,[0,.08+loop*.025,.37],[.22+loop*.024,.22+loop*.024,.13],'#B6A68B',[Math.PI/2,0,0],{kind:SURFACE.timber});
  }
  const rescue=pierFrameAt(0,headTip).matrix;
  solid.shape(ring,rescue,[0,.65,.12],[.29,.29,.29],'#A66A45',[0,0,0],{kind:SURFACE.plaster});
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])cub(rescue,[Math.cos(angle)*.29,.65+Math.sin(angle)*.29,.13],[.09,.09,.12],BONE,[0,0,angle],SURFACE.plaster);

  const gateway=pierFrameAt(0,PIER_LAYOUT.entrance[1]+.3).matrix;
  for(const side of [-1,1])cub(gateway,[side*1.91,1.43,0],[.19,2.86,.20],BEAM);
  cub(gateway,[0,2.82,0],[4.15,.41,.18],BONE);
  signs.push({title:'WESTCOSE PIER',subtitle:'FISHING / SUNSETS / TAKE YOUR TIME',width:3.7,height:.34,matrix:gateway.clone().multiply(new THREE.Matrix4().makeTranslation(0,2.82,-.105)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)),background:BONE});
  const notice=pierFrameAt(-PIER_LAYOUT.head.width / 2 + .08,headTip+.38).matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI/2));
  cub(notice,[0,1.08,0],[.72,.43,.06],BONE);
  signs.push({title:'SLOW DOWN',subtitle:'YOU ARE AT THE OCEAN',width:.65,height:.36,matrix:notice.clone().multiply(new THREE.Matrix4().makeTranslation(0,1.08,.039)),background:BONE});

  box.dispose();cylinder.dispose();ring.dispose();
  const geometry=solid.finish(),lights=glow.finish();
  return {geometry,lights,signs,stats:{boards:boardCount,piles:PIER_SUPPORT_ROWS.length*2,railSegments:PIER_RAIL_SEGMENTS.length,triangles:(geometry.getAttribute('position').count+lights.getAttribute('position').count)/3}};
}

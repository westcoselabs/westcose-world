import * as THREE from 'three';
import { buildingFrame, buildingMatrix } from '../../data/building-shapes';
import { TOWN_BUILDINGS } from '../../data/town-layout';
import { SceneryBatch, variation } from '../sceneryGeometry';
import { trellisFrameFor, windowBoxFramesFor } from '../kit/architecturalDetails';
import { COASTAL_TREES, UNDERSTORY_POCKETS, plantingClearanceAt, plantingFrame, type CoastalTree } from './coastalPlanting';

type Triple = [number,number,number];
const LEAVES=['#405E3F','#536E45','#668154','#7C8D58','#8C955F'];
const SHADE=['#345A42','#44664B','#527355','#6F8357'];
const BARK=['#5D6050','#71705B','#7C7760'];
const Y=new THREE.Vector3(0,1,0);
const TAU=Math.PI*2;

/** Opaque, individually shaped folded leaves; one merged draw call, no sprite planes or balls. */
class LeafBatch {
  private positions:number[]=[];
  private colors:number[]=[];
  private weights:number[]=[];
  private color=new THREE.Color();
  triangle(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,color:string,weights:Triple=[.5,1,.5]){
    this.color.set(color);
    for(const [index,point] of [a,b,c].entries()){
      this.positions.push(point.x,point.y,point.z);
      this.colors.push(this.color.r,this.color.g,this.color.b);
      this.weights.push(weights[index]);
    }
  }
  leaf(parent:THREE.Matrix4,base:THREE.Vector3,tip:THREE.Vector3,width:number,color:string,roll=0,fold=true){
    const along=tip.clone().sub(base),length=along.length();
    if(length<1e-6)return;
    const axis=along.clone().normalize();
    const across=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.95?new THREE.Vector3(1,0,0):Y).normalize().applyAxisAngle(axis,roll);
    const normal=new THREE.Vector3().crossVectors(across,axis).normalize();
    const middle=base.clone().addScaledVector(along,.46);
    const left=middle.clone().addScaledVector(across,width/2);
    const right=middle.clone().addScaledVector(across,-width/2);
    const ridge=middle.clone().addScaledVector(normal,fold?width*.13:0);
    const points=[base,left,tip,right,ridge].map(p=>p.clone().applyMatrix4(parent));
    if(fold){
      this.triangle(points[0],points[1],points[4],color,[.15,.6,.5]);
      this.triangle(points[1],points[2],points[4],color,[.6,1,.5]);
      this.triangle(points[2],points[3],points[4],color,[1,.6,.5]);
      this.triangle(points[3],points[0],points[4],color,[.6,.15,.5]);
    }else{
      this.triangle(points[0],points[1],points[2],color,[.1,.5,1]);
      this.triangle(points[0],points[2],points[3],color,[.1,1,.5]);
    }
  }
  roundedLeaf(parent:THREE.Matrix4,base:THREE.Vector3,tip:THREE.Vector3,width:number,color:string,roll=0){
    const along=tip.clone().sub(base),axis=along.clone().normalize();
    const across=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.95?new THREE.Vector3(1,0,0):Y).normalize().applyAxisAngle(axis,roll);
    const normal=new THREE.Vector3().crossVectors(across,axis).normalize();
    const edge=(t:number,side:number)=>base.clone().addScaledVector(along,t).addScaledVector(across,side*width*.5).addScaledVector(normal,-width*.065);
    const points=[base,edge(.28,1),edge(.7,.87),tip,edge(.7,-.87),edge(.28,-1)].map(p=>p.clone().applyMatrix4(parent));
    this.triangle(points[0],points[1],points[2],color,[.1,.45,.8]);
    this.triangle(points[0],points[2],points[3],color,[.1,.8,1]);
    this.triangle(points[0],points[3],points[4],color,[.1,1,.8]);
    this.triangle(points[0],points[4],points[5],color,[.1,.8,.45]);
  }
  finish(){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));
    geometry.setAttribute('foliageWeight',new THREE.Float32BufferAttribute(this.weights,1));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
  }
}

function groundFrame(x:number,z:number){
  const f=plantingFrame(x,z);
  return new THREE.Matrix4().makeBasis(f.east,f.up,f.south).setPosition(f.position);
}

export function buildCoastalVegetation(){
  const wood=new SceneryBatch(),foliage=new LeafBatch(),ground=new LeafBatch();
  const branchGeometry=new THREE.CylinderGeometry(.82,1,1,5,1,true);
  const buildingBounds=TOWN_BUILDINGS.map(building=>({building,frame:buildingFrame(building)}));
  const insideBuilding=(point:THREE.Vector3)=>buildingBounds.some(({building,frame})=>{
    if(point.distanceToSquared(frame.position)>(building.height+building.width+building.depth)**2)return false;
    const local=point.clone().sub(frame.position).applyQuaternion(frame.inverse);
    return local.y>0&&local.y<building.height+.2&&Math.abs(local.x)<building.width/2+.05&&Math.abs(local.z)<building.depth/2+.05;
  });
  let grassClumps=0,ferns=0,shrubs=0,ivyLeaves=0,windowBoxes=0;
  const branch=(parent:THREE.Matrix4,start:THREE.Vector3,end:THREE.Vector3,radius:number,color:string)=>{
    const delta=end.clone().sub(start);
    const matrix=new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(Y,delta.clone().normalize()),new THREE.Vector3(radius,delta.length(),radius)).premultiply(parent);
    wood.add(branchGeometry,matrix,color);
  };
  const cluster=(parent:THREE.Matrix4,center:THREE.Vector3,radius:number,seed:number,count:number,palette=LEAVES,leafScale=1)=>{
    for(let index=0;index<count;index++){
      const angle=index*2.39996+seed,spread=Math.sqrt(variation(seed+index*3.3))*radius;
      const leafBase=center.clone().add(new THREE.Vector3(Math.cos(angle)*spread,(variation(seed+index*2.8)-.5)*radius*.85,Math.sin(angle)*spread*.85));
      const length=(.23+variation(seed+index*4.2)*.19)*leafScale;
      const leafAngle=angle+(variation(seed+index*1.7)-.5)*2.7;
      const tip=leafBase.clone().add(new THREE.Vector3(Math.cos(leafAngle)*length,(.035+variation(seed+index*5.1)*.12)*leafScale,Math.sin(leafAngle)*length));
      if(insideBuilding(leafBase.clone().applyMatrix4(parent))||insideBuilding(tip.clone().applyMatrix4(parent)))continue;
      foliage.roundedLeaf(parent,leafBase,tip,length*(.64+variation(seed+index)*.17),palette[index%palette.length],(variation(index+seed*2)-.5)*1.05);
    }
  };
  const tree=(spec:CoastalTree)=>{
    const parent=groundFrame(spec.x,spec.z),h=spec.height,seed=spec.seed;
    const trunk=[new THREE.Vector3(0,0,0),new THREE.Vector3(-.08,h*.27,.07),new THREE.Vector3(spec.lean*.35,h*.51,-.12),new THREE.Vector3(spec.lean*.7,h*.73,.04)];
    for(let i=1;i<trunk.length;i++)branch(parent,trunk[i-1],trunk[i],.185*Math.pow(.82,i-1),BARK[(seed+i)%BARK.length]);
    // Broken, lateral boughs make the exposed coastal silhouettes broad and asymmetric.
    for(let i=0;i<7;i++){
      const angle=i*2.39996+seed*.8,tier=i%3;
      const start=trunk[tier===0?2:3];
      const reach=spec.spread*(.58+variation(seed+i)*.28);
      const end=new THREE.Vector3(spec.lean+Math.cos(angle)*reach,h*(.73+tier*.085)+variation(seed+i*3)*.25,Math.sin(angle)*reach*.73);
      const elbow=start.clone().lerp(end,.56).add(new THREE.Vector3(.08,-.13,.05));
      branch(parent,start,elbow,.063-tier*.009,BARK[(seed+i)%BARK.length]);
      branch(parent,elbow,end,.035,BARK[1]);
      cluster(parent,end,spec.spread*.26,seed+i*71,38);
    }
    // A few exposed roots and flat litter silhouettes tie each tree into its planting bed.
    for(let i=0;i<3;i++){
      const angle=i*TAU/3+seed;
      branch(parent,new THREE.Vector3(0,.22,0),new THREE.Vector3(Math.cos(angle)*.34,.015,Math.sin(angle)*.34),.065,BARK[0]);
    }
    for(let i=0;i<13;i++){
      const a=i*2.39996+seed,r=.32+variation(seed+i*4)*.6;
      const base=new THREE.Vector3(Math.cos(a)*r,.012,Math.sin(a)*r);
      ground.leaf(parent,base,base.clone().add(new THREE.Vector3(.12+variation(i)*.1,.007,.1)),.09,i%3?'#6B704E':'#92836A',0,false);
    }
  };
  COASTAL_TREES.forEach(tree);

  const grass=(parent:THREE.Matrix4,seed:number,scale=1)=>{
    for(let i=0;i<7;i++){
      const angle=i*2.39996+seed,height=(.22+variation(seed+i)*.32)*scale;
      const base=new THREE.Vector3(Math.cos(angle)*.055,0,Math.sin(angle)*.055);
      const tip=new THREE.Vector3(Math.cos(angle)*height*.56,height,Math.sin(angle)*height*.56);
      foliage.leaf(parent,base,tip,.035*scale,i%3?'#7D895B':'#A0A077',angle*.2,false);
    }
    grassClumps++;
  };
  const fern=(parent:THREE.Matrix4,seed:number)=>{
    for(let frond=0;frond<4;frond++){
      const angle=frond*TAU/4+seed;
      const direction=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
      const across=new THREE.Vector3(-direction.z,0,direction.x);
      for(let pair=0;pair<5;pair++){
        const t=(pair+1)/6;
        const center=direction.clone().multiplyScalar(t*.62).add(new THREE.Vector3(0,.12+Math.sin(t*Math.PI*.87)*.34,0));
        for(const side of [-1,1]){
          const tip=center.clone().addScaledVector(across,side*(.19*(1-t)+.02)).addScaledVector(direction,.1).add(new THREE.Vector3(0,.012,0));
          foliage.leaf(parent,center,tip,.06*(1-t)+.022,SHADE[(frond+pair)%SHADE.length],0,false);
        }
      }
    }
    ferns++;
  };
  UNDERSTORY_POCKETS.forEach(([x,z,radius],index)=>{
    const seed=index*39+7;
    for(let i=0;i<8;i++){
      const angle=i*2.39996+seed,distance=(.45+variation(seed+i)*.65)*radius;
      const px=x+Math.cos(angle)*distance,pz=z+Math.sin(angle)*distance;
      if(plantingClearanceAt(px,pz)<.46)continue;
      const parent=groundFrame(px,pz);
      if((i===0||i===5)&&plantingClearanceAt(px,pz)>.8)fern(parent,seed+i);
      else grass(parent,seed+i,.8+variation(seed+i)*.5);
    }
    if(plantingClearanceAt(x,z)>.95){
      const parent=groundFrame(x+.12,z),tip=new THREE.Vector3(.18,.65,.04);
      branch(parent,new THREE.Vector3(),tip,.035,BARK[0]);
      cluster(parent,tip,.25,seed,32,SHADE,.78);shrubs++;
    }
  });

  for(const building of TOWN_BUILDINGS){
    const frame=trellisFrameFor(building);
    if(frame){
      const parent=new THREE.Matrix4().makeRotationY(frame.yaw).setPosition(...frame.position).premultiply(buildingMatrix(building));
      for(let vine=0;vine<7;vine++){
        const seed=building.id.length*19+vine*13,x=(vine/6-.5)*frame.width*.81;
        const top=.48-variation(seed)*.18,length=Math.min(top+.46,.62+variation(seed+8)*.27),count=13+Math.floor(variation(seed+3)*6);
        let previous=new THREE.Vector3(x,frame.height*top,.13);
        for(let i=0;i<count;i++){
          const t=Math.min(1,(i+variation(seed+i)*.35)/(count-1));
          const y=frame.height*(top-t*length);
          const center=new THREE.Vector3(x+Math.sin(t*7+seed)*.1+Math.cos(t*13+seed)*.06,y,.135+Math.sin(t*4)*.018);
          if(i)foliage.leaf(parent,previous,center,.018,'#526443',0,false);
          for(let leaf=0;leaf<(variation(seed+i*9)>.3?2:1);leaf++){
            const side=(i+leaf)%2?1:-1,scale=.13+variation(seed+i+leaf*6)*.1;
            const base=center.clone().add(new THREE.Vector3(0,leaf*.055,leaf*.01));
            const tip=base.clone().add(new THREE.Vector3(side*scale,-.06-variation(seed+i*3)*.1,.025));
            foliage.roundedLeaf(parent,base,tip,scale*.78,SHADE[(vine+i+leaf)%SHADE.length],.15);ivyLeaves++;
          }
          previous=center;
        }
      }
    }
    for(const box of windowBoxFramesFor(building)){
      const parent=new THREE.Matrix4().makeRotationY(box.yaw).setPosition(...box.position).premultiply(buildingMatrix(building));
      for(let i=0;i<3;i++){
        const seed=building.id.length*8+i*31,center=new THREE.Vector3((i-1)*box.width*.27,.15,0);
        for(let leaf=0;leaf<9;leaf++){
          const angle=leaf*2.39996+seed;
          const base=center.clone().add(new THREE.Vector3(Math.cos(angle)*.04,leaf*.014,Math.sin(angle)*.025));
          const tip=base.clone().add(new THREE.Vector3(Math.cos(angle)*.075,.13+variation(seed+leaf)*.12,Math.sin(angle)*.045));
          foliage.roundedLeaf(parent,base,tip,.075,SHADE[leaf%SHADE.length],angle);
        }
      }
      windowBoxes++;
    }
  }
  branchGeometry.dispose();
  const geometry={wood:wood.finish(),foliage:foliage.finish(),litter:ground.finish()};
  const triangles=Object.values(geometry).reduce((total,g)=>total+g.getAttribute('position').count/3,0);
  return {...geometry,stats:{trees:COASTAL_TREES.length,grassClumps,ferns,shrubs,ivyLeaves,windowBoxes,triangles,drawCalls:3}};
}

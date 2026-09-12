import { Matrix4, Quaternion, Vector3 } from 'three';
import { PIER_EDGES, PIER_LAYOUT, pierFrameAt, pierHeightAtZ, pierPointAt } from './pier-layout';

export type PierRailBox = { id:string; center:Vector3; quaternion:Quaternion; size:Vector3 };
export const PIER_RAIL_SEGMENTS:PierRailBox[] = [];
export const PIER_RAIL_POSTS:PierRailBox[] = [];
const knownPosts=new Set<string>();

for(const edge of PIER_EDGES){
  const count=Math.max(1,Math.ceil(Math.hypot(edge.end[0]-edge.start[0],edge.end[1]-edge.start[1])/1.8));
  const point=(t:number)=>{
    const across=edge.start[0]+(edge.end[0]-edge.start[0])*t,z=edge.start[1]+(edge.end[1]-edge.start[1])*t;
    return {across,z,position:pierPointAt(across,z,pierHeightAtZ(z)+PIER_LAYOUT.railHeight/2)};
  };
  for(let index=0;index<=count;index++){
    const start=point(index/count),key=`${start.across.toFixed(5)}:${start.z.toFixed(5)}`;
    if(!knownPosts.has(key)){
      knownPosts.add(key);
      PIER_RAIL_POSTS.push({id:`pier-${edge.id}-post-${index}`,center:start.position,quaternion:pierFrameAt(start.across,start.z).quaternion,size:new Vector3(.15,PIER_LAYOUT.railHeight+.06,.15)});
    }
    if(index===count)continue;
    const end=point((index+1)/count),center=start.position.clone().add(end.position).multiplyScalar(.5);
    const along=end.position.clone().sub(start.position),length=along.length();along.normalize();
    const up=center.clone().normalize();up.addScaledVector(along,-up.dot(along)).normalize();
    const right=new Vector3().crossVectors(up,along).normalize();
    const quaternion=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right,up,along));
    PIER_RAIL_SEGMENTS.push({id:`pier-${edge.id}-rail-${index}`,center,quaternion,size:new Vector3(.16,PIER_LAYOUT.railHeight,length+.025)});
  }
}

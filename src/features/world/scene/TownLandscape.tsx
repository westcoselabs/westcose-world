'use client';
import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, Sphere, Triangle, Vector3 } from 'three';
import { MAP_RADIUS, MAP_SEA_LEVEL, mapCoordinates, mapDirection } from '../data/world-map';
import { clipTerrainOutsideSeaCave, insideSeaCaveCut, nearSeaCaveCut, registerSeaCaveOpeningTriangles, seaCaveOpeningSeals } from '../data/sea-cave-openings';
import { downtownKindAt } from '../data/downtown-layout';
import { grandStairSurfaceAt, nearSkatepark, skateparkTerrainCeiling } from '../data/skatepark-layout';
import { skiFeatureMaskAt } from '../data/ski-runs';
import { TOWN_INTERIORS } from '../data/town-layout';
import { groundSurfaceAt,OPEN_SEA_FLOOR,terrainColorAt,terrainIsOpenSea } from '../data/town-surfaces';
import { buildingFloorRadius } from '../data/building-shapes';
import type { WorldRuntimeState } from '../runtime/types';

export function terrainVisibleHeight(d:Vector3,h:number){
 for(const building of TOWN_INTERIORS){const r=buildingFloorRadius(building,d,.1);if(r!==null)h=Math.min(h,r-MAP_RADIUS-.1);}
 const p=mapCoordinates(d),stair=grandStairSurfaceAt(p.x,p.z);
 // Coarse terrain triangles must not interpolate up through the explicit level treads.
 if(stair)h=Math.min(h,stair.height-.25);
 // Streets, the bluff wall and the park are explicit meshes; keep the cells just beneath.
 if(downtownKindAt(p.x,p.z))h=Math.min(h,h-.06);
 if(p.x>-32.95&&p.x<-31.9&&p.z>-24.2&&p.z<27.7)h=Math.min(h,.2);
 if(nearSkatepark(p.x,p.z)){const ceiling=skateparkTerrainCeiling(p.x,p.z);if(ceiling!==null)h=Math.min(h,ceiling);}
 // Kickers, moguls and drops have their own detailed mesh; keep coarse cells beneath it.
 if(p.z>40)h-=.12*skiFeatureMaskAt(p.x,p.z);
 return h;
}

export type TerrainRegion={id:'town'|'mountain'|'west';x0:number;z0:number;step:number;columns:number;rows:number};
/** Chart regions covering all land; they abut at z=42. Open ocean needs no terrain: the
 * sea sphere is opaque. Even cell counts keep full and coarse grids on shared boundaries. */
export const TERRAIN_REGIONS:readonly TerrainRegion[]=[
 // Reaches east past the sea-cave headland's cliffs and south past the lighthouse cape.
 {id:'town',x0:-52,z0:42-.45*218,step:.45,columns:290,rows:218},
 {id:'mountain',x0:-96,z0:42,step:.8,columns:240,rows:338},
 // The skate-park bluff west of the town. This far west a chart metre of z is far
 // shorter than a physical one, so a coarse step still draws its banks finely.
 {id:'west',x0:-100,z0:42-.8*190,step:.8,columns:60,rows:190},
];
export type TerrainLod='full'|'coarse';
const CHUNK_CELLS=80;
const SKIRT_DEPTH=.8;
const UNDERWATER=MAP_SEA_LEVEL-.6;
/** Chunks intersecting this chart box contain the cells cut at the sea-cave openings. */
const PENINSULA_BOX={x0:28,x1:79,z0:-54,z1:42};
const PORTAL_ROCK=new Color('#899185');
const SEA_FLOOR=new Color('#BCA87B');

export type TerrainChunk={id:string;region:TerrainRegion['id'];cave:boolean;geometry:BufferGeometry};
export type TerrainLevel={chunks:(TerrainChunk|null)[];portal:BufferGeometry|null};
export type TerrainBuild={full:TerrainLevel;coarse:TerrainLevel};
type ChunkSamples={region:TerrainRegion;i0:number;j0:number;cols:number;rows:number;cave:boolean;
 positions:Float32Array;normals:Float32Array;colors:Float32Array;heights:Float32Array};


/** Sample one chunk at full detail. A one-vertex apron gives central-difference normals
 * that match exactly across chunk edges; both levels of detail reuse these samples. */
function sampleChunk(region:TerrainRegion,i0:number,i1:number,j0:number,j1:number):ChunkSamples{
 const cols=i1-i0,rows=j1-j0,W=cols+3,H=rows+3,step=region.step;
 const X=(i:number)=>region.x0+i*step,Z=(j:number)=>region.z0+j*step;
 const raw=new Float64Array(W*H),height=new Float64Array(W*H),apron=new Float64Array(W*H*3);
 for(let a=0;a<W;a++)for(let b=0;b<H;b++){
  // Open sea is the flat floor under an opaque ocean; skip every land layer there.
  const x=X(i0+a-1),z=Z(j0+b-1),d=mapDirection(x,z),sea=terrainIsOpenSea(x,z),r=sea?OPEN_SEA_FLOOR:groundSurfaceAt(x,z).height,h=sea?r:terrainVisibleHeight(d,r),k=a*H+b;
  raw[k]=r;height[k]=h;d.multiplyScalar(MAP_RADIUS+h);apron[k*3]=d.x;apron[k*3+1]=d.y;apron[k*3+2]=d.z;
 }
 const count=(cols+1)*(rows+1),positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),heights=new Float32Array(count);
 const color=new Color(),n=new Vector3(),u=new Vector3(),v=new Vector3();
 const at=(a:number,b:number)=>(a+1)*H+(b+1);
 for(let a=0;a<=cols;a++)for(let b=0;b<=rows;b++){
  const i=a*(rows+1)+b,k=at(a,b),kx0=at(a-1,b),kx1=at(a+1,b),kz0=at(a,b-1),kz1=at(a,b+1);
  u.set(apron[kx1*3]-apron[kx0*3],apron[kx1*3+1]-apron[kx0*3+1],apron[kx1*3+2]-apron[kx0*3+2]);
  v.set(apron[kz1*3]-apron[kz0*3],apron[kz1*3+1]-apron[kz0*3+1],apron[kz1*3+2]-apron[kz0*3+2]);
  n.crossVectors(v,u).normalize();
  if(n.x*apron[k*3]+n.y*apron[k*3+1]+n.z*apron[k*3+2]<0)n.negate();
  positions[i*3]=apron[k*3];positions[i*3+1]=apron[k*3+1];positions[i*3+2]=apron[k*3+2];
  normals[i*3]=n.x;normals[i*3+1]=n.y;normals[i*3+2]=n.z;heights[i]=height[k];
  // Physical slope for rock/snow colouring: chart spacing grows with elevation and shrinks by cos(x/R) in z.
  const x=X(i0+a),z=Z(j0+b),scale=(MAP_RADIUS+Math.max(0,height[k]))/MAP_RADIUS;
  const gx=(height[kx1]-height[kx0])/(2*step*scale),gz=(height[kz1]-height[kz0])/(2*step*Math.max(.05,Math.cos(x/MAP_RADIUS))*scale);
  if(raw[k]===OPEN_SEA_FLOOR&&terrainIsOpenSea(x,z))color.copy(SEA_FLOOR);else color.set(terrainColorAt(x,z,raw[k],Math.hypot(gx,gz)));
  colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
 }
 const cave=region.id==='town'&&X(i1)>=PENINSULA_BOX.x0&&X(i0)<=PENINSULA_BOX.x1&&Z(j1)>=PENINSULA_BOX.z0&&Z(j0)<=PENINSULA_BOX.z1;
 return {region,i0,j0,cols,rows,cave,positions,normals,colors,heights};
}

/** Mesh a sampled chunk at a stride (1 = full detail, 2 = coarse). The detailed level cuts
 * both sea-cave openings and collects their seals; the coarse level cuts only the ocean
 * window, so it still reads as open from a distance. */
function meshChunk(samples:ChunkSamples,stride:number,skirts:boolean,portal:number[]|null):TerrainChunk|null{
 const {region}=samples,cols=samples.cols/stride,rows=samples.rows/stride,step=region.step*stride;
 const X=(a:number)=>region.x0+samples.i0*region.step+a*step,Z=(b:number)=>region.z0+samples.j0*region.step+b*step;
 const positions:number[]=[],normals:number[]=[],colors:number[]=[],heights:number[]=[],indices:number[]=[];
 for(let a=0;a<=cols;a++)for(let b=0;b<=rows;b++){
  const source=a*stride*(samples.rows+1)+b*stride;
  for(let axis=0;axis<3;axis++){positions.push(samples.positions[source*3+axis]);normals.push(samples.normals[source*3+axis]);colors.push(samples.colors[source*3+axis]);}
  heights.push(samples.heights[source]);
 }
 const vertex=(a:number,b:number)=>a*(rows+1)+b;
 const clip=samples.cave,detailed=portal!==null;
 const point=(index:number)=>new Vector3(positions[index*3],positions[index*3+1],positions[index*3+2]);
 const addVertex=(position:Vector3,from:number[],weights:number[])=>{
  const index=positions.length/3;positions.push(position.x,position.y,position.z);
  for(const target of [normals,colors])for(let axis=0;axis<3;axis++)target.push(from.reduce((sum,f,i)=>sum+target[f*3+axis]*weights[i],0));
  return index;
 };
 const triangle=new Triangle(),bary=new Vector3();
 const emit=(t:[number,number,number],local:boolean)=>{
  if(!local){indices.push(t[0],t[1],t[2]);return;}
  // Cut the openings; every other triangle keeps its exact position.
  const points=t.map(point);
  const fragments=clipTerrainOutsideSeaCave(points[0],points[1],points[2],!detailed);
  if(fragments===undefined){indices.push(t[0],t[1],t[2]);return;}
  triangle.set(points[0],points[1],points[2]);
  for(const polygon of fragments){
   const ids=polygon.map(q=>{const w=triangle.getBarycoord(q,bary)??bary.set(1,0,0);return addVertex(q,t,[w.x,w.y,w.z]);});
   for(let i=1;i<ids.length-1;i++)indices.push(ids[0],ids[i],ids[i+1]);
  }
  // The cut edges meet the cave rock; without these seals sky shows round the openings.
  if(detailed)for(const panel of seaCaveOpeningSeals(fragments))for(const q of panel)portal!.push(q.x,q.y,q.z);
 };
 for(let a=0;a<cols;a++)for(let b=0;b<rows;b++){
  const i=vertex(a,b),j=vertex(a+1,b);
  if(heights[i]<UNDERWATER&&heights[j]<UNDERWATER&&heights[i+1]<UNDERWATER&&heights[j+1]<UNDERWATER)continue;
  const local=clip&&nearSeaCaveCut(X(a)+step/2,Z(b)+step/2);
  emit([i,j,i+1],local);emit([j,j+1,i+1],local);
 }
 if(indices.length===0)return null;
 if(skirts){
  // Vertical flaps hide T-junction cracks where neighbouring chunks use another level of detail.
  const edge=(list:number[])=>{for(let e=1;e<list.length;e++){
   const s0=list[e-1],s1=list[e];
   if(heights[s0]<UNDERWATER&&heights[s1]<UNDERWATER)continue;
   const h0=Math.hypot(positions[s0*3],positions[s0*3+1],positions[s0*3+2]),h1=Math.hypot(positions[s1*3],positions[s1*3+1],positions[s1*3+2]);
   // A flap across a cut opening would hang in it as a thin sheet.
   if(clip&&insideSeaCaveCut(point(s0).add(point(s1)).multiplyScalar(.5).multiplyScalar(1-SKIRT_DEPTH/(h0+h1))))continue;
   const low0=addVertex(point(s0).multiplyScalar((h0-SKIRT_DEPTH)/h0),[s0],[1]),low1=addVertex(point(s1).multiplyScalar((h1-SKIRT_DEPTH)/h1),[s1],[1]);
   indices.push(s0,s1,low1,s0,low1,low0,s0,low1,s1,s0,low0,low1);
  }};
  edge(Array.from({length:cols+1},(_,a)=>vertex(a,0)));edge(Array.from({length:cols+1},(_,a)=>vertex(a,rows)));
  edge(Array.from({length:rows+1},(_,b)=>vertex(0,b)));edge(Array.from({length:rows+1},(_,b)=>vertex(cols,b)));
 }
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);
 geometry.computeBoundingSphere();
 return {id:`${region.id}-${samples.i0}-${samples.j0}`,region:region.id,cave:samples.cave,geometry};
}

/** Every land chunk at both levels of detail (sampled once), plus the cave portal collars. */
export function buildTerrain({skirts=true}:{skirts?:boolean}={}):TerrainBuild{
 const full:(TerrainChunk|null)[]=[],coarse:(TerrainChunk|null)[]=[],portal:number[]=[];
 for(const region of TERRAIN_REGIONS){
  for(let i0=0;i0<region.columns;i0+=CHUNK_CELLS)for(let j0=0;j0<region.rows;j0+=CHUNK_CELLS){
   const samples=sampleChunk(region,i0,Math.min(i0+CHUNK_CELLS,region.columns),j0,Math.min(j0+CHUNK_CELLS,region.rows));
   full.push(meshChunk(samples,1,skirts,portal));coarse.push(meshChunk(samples,2,skirts,null));
  }
 }
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute(portal,3));
 geometry.setAttribute('color',new Float32BufferAttribute(Array.from({length:portal.length/3},()=>[PORTAL_ROCK.r,PORTAL_ROCK.g,PORTAL_ROCK.b]).flat(),3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();
 // Sequential index: collision helpers read portal triangles through the index buffer.
 geometry.setIndex(Array.from({length:portal.length/3},(_,index)=>index));
 return {full:{chunks:full,portal:geometry},coarse:{chunks:coarse,portal:null}};
}

function merge(geometries:BufferGeometry[]){
 const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
 for(const geometry of geometries){
  const offset=positions.length/3,index=geometry.getIndex()!;
  positions.push(...(geometry.getAttribute('position').array as Float32Array));
  normals.push(...(geometry.getAttribute('normal').array as Float32Array));
  colors.push(...(geometry.getAttribute('color').array as Float32Array));
  for(let i=0;i<index.count;i++)indices.push(index.getX(i)+offset);
  geometry.dispose();
 }
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);geometry.computeBoundingSphere();
 return geometry;
}
const lodOf=(value:TerrainLod|number):TerrainLod=>typeof value==='number'?(value>=200?'full':'coarse'):value;
function levelOf(lod:TerrainLod|number){
 const build=buildTerrain({skirts:false}),keep=lodOf(lod);
 const other=keep==='full'?build.coarse:build.full;
 for(const chunk of other.chunks)chunk?.geometry.dispose();other.portal?.dispose();
 return keep==='full'?build.full:build.coarse;
}
/** Test-facing merged land surface without skirts or portal collars. */
export function makeTerrain(lod:TerrainLod|number='full'){
 const level=levelOf(lod);level.portal?.dispose();
 return merge(level.chunks.filter((chunk):chunk is TerrainChunk=>!!chunk).map(chunk=>chunk.geometry));
}
/** Compatibility partition for the peninsula/cave checks. */
export function makeTerrainPartition(lod:TerrainLod|number='full'){
 const level=levelOf(lod),chunks=level.chunks.filter((chunk):chunk is TerrainChunk=>!!chunk);
 return {baseWorld:merge(chunks.filter(chunk=>!chunk.cave).map(chunk=>chunk.geometry)),localPatch:merge(chunks.filter(chunk=>chunk.cave).map(chunk=>chunk.geometry)),portal:level.portal??new BufferGeometry()};
}

/** Distance beyond which a chunk swaps to its coarse level of detail. */
const DETAIL_DISTANCE=70;
export default function TownLandscape({runtime}:{runtime:WorldRuntimeState}){
 const terrain=useMemo(()=>buildTerrain(),[]);
 const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,roughness:1}),[]);
 const visible=useMemo(()=>terrain.full.chunks.map((chunk,index)=>chunk?index:-1).filter(index=>index>=0),[terrain]);
 const meshes=useRef<(Mesh|null)[]>([]);
 const sphere=useRef(new Sphere());
 useFrame(({camera})=>{
  const overview=runtime.overviewTransition>.65;
  for(const index of visible){
   const mesh=meshes.current[index],detailed=terrain.full.chunks[index]!.geometry;
   if(!mesh)continue;
   sphere.current.copy(detailed.boundingSphere!);
   const near=!overview&&camera.position.distanceTo(sphere.current.center)<sphere.current.radius+DETAIL_DISTANCE;
   const geometry=near?detailed:terrain.coarse.chunks[index]?.geometry??detailed;
   if(mesh.geometry!==geometry)mesh.geometry=geometry;
  }
 });
 useEffect(()=>{
  const portal=terrain.full.portal!,positions=portal.getAttribute('position'),triangles:Vector3[][]=[];
  for(let index=0;index<positions.count;index+=3)triangles.push([0,1,2].map(offset=>new Vector3().fromBufferAttribute(positions,index+offset)));
  const release=registerSeaCaveOpeningTriangles(portal,triangles);
  return ()=>{
   release();
   for(const level of [terrain.full,terrain.coarse]){for(const chunk of level.chunks)chunk?.geometry.dispose();level.portal?.dispose();}
   material.dispose();
  };
 },[terrain,material]);
 // Terrain receives landmark shadows but does not duplicate the globe in the shadow map.
 return <group name="terrain-chunks">
  {visible.map(index=><mesh key={terrain.full.chunks[index]!.id} name={`terrain-${terrain.full.chunks[index]!.id}`} ref={mesh=>{meshes.current[index]=mesh;}} geometry={terrain.full.chunks[index]!.geometry} material={material} receiveShadow/>)}
  <mesh name="terrain-cave-portals" geometry={terrain.full.portal!} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading/></mesh>
 </group>;
}

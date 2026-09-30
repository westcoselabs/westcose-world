'use client';
import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BufferGeometry, Color, Float32BufferAttribute, Mesh, Sphere, Triangle, Vector3 } from 'three';
import { MAP_RADIUS, MAP_MIN_Z, MAP_CIRCUMFERENCE, mapCoordinates, mapDirection } from '../data/world-map';
import { inPeninsulaRegion } from '../data/peninsula-layout';
import { cavePortalLining, cavePortalSeals, clipTerrainOutsideCave, registerCavePortalTriangles } from '../data/peninsula-cave';
import { skateStairSurfaceAt } from '../data/concept-landmarks';
import { TOWN_INTERIORS } from '../data/town-layout';
import { groundSurfaceAt,terrainColorAt } from '../data/town-surfaces';
import { buildingFloorRadius } from '../data/building-shapes';
import type { WorldRuntimeState } from '../runtime/types';

export function terrainVisibleHeight(d:Vector3,h:number){
 for(const building of TOWN_INTERIORS){const r=buildingFloorRadius(building,d,.1);if(r!==null)h=Math.min(h,r-MAP_RADIUS-.1);}
 const p=mapCoordinates(d),stair=skateStairSurfaceAt(p.x,p.z);
 // Coarse terrain triangles must not interpolate up through the explicit level treads.
 if(stair)h=Math.min(h,stair.height-.23);
 return h;
}
/** A complete periodic grid, not a latitude shoreline or a finite town rectangle.
 * The upper cape stays continuous; only triangles crossing the actual cave void
 * are clipped. The separate underground floor never replaces the cape above it.
 */
type TerrainGrid={
 positions:Float32BufferAttribute;
 colors:Float32BufferAttribute;
 normals:Float32BufferAttribute;
 whole:number[];
 baseWorld:number[];
 localPatch:number[];
 portal:number[];
};
export type TerrainPartition={baseWorld:BufferGeometry;localPatch:BufferGeometry;portal:BufferGeometry};

function boundsFor(position:Float32BufferAttribute,indices:number[]){
 const box=new Box3(),point=new Vector3();
 for(const index of indices)box.expandByPoint(point.fromBufferAttribute(position,index));
 const center=box.getCenter(new Vector3());let radiusSq=0;
 for(const index of indices)radiusSq=Math.max(radiusSq,center.distanceToSquared(point.fromBufferAttribute(position,index)));
 return new Sphere(center,Math.sqrt(radiusSq));
}
function terrainGeometry(grid:TerrainGrid,indices:number[]){
 const geometry=new BufferGeometry();
 // Both draw partitions deliberately reference the exact same sampled vertices
 // and whole-grid normals. The index lists alone decide which cell each mesh owns.
 geometry.setAttribute('position',grid.positions);
 geometry.setAttribute('color',grid.colors);
 geometry.setAttribute('normal',grid.normals);
 geometry.setIndex(indices);
 geometry.boundingSphere=boundsFor(grid.positions,indices);
 return geometry;
}
function makeTerrainGrid(columns:number):TerrainGrid{
 const rows=columns*2,count=(columns+1)*(rows+1);
 const positions=new Float32Array(count*3),colors=new Float32Array(count*3),whole:number[]=[],baseWorld:number[]=[],localPatch:number[]=[];
 const color=new Color();
 for(let column=0;column<=columns;column++)for(let row=0;row<=rows;row++){
  const x=(column/columns-.5)*Math.PI*MAP_RADIUS,z=MAP_MIN_Z+row/rows*MAP_CIRCUMFERENCE;
  const d=mapDirection(x,z),raw=groundSurfaceAt(x,z).height,h=terrainVisibleHeight(d,raw),i=column*(rows+1)+row;
  d.multiplyScalar(MAP_RADIUS+h);positions.set([d.x,d.y,d.z],i*3);
  color.set(terrainColorAt(x,z,raw));colors.set([color.r,color.g,color.b],i*3);
  if(column<columns&&row<rows){
   const a=i,b=i+rows+1,cell=[a,b,a+1,b,b+1,a+1];
   whole.push(...cell);
   const centerX=((column+.5)/columns-.5)*Math.PI*MAP_RADIUS;
   const centerZ=MAP_MIN_Z+(row+.5)/rows*MAP_CIRCUMFERENCE;
   (inPeninsulaRegion(centerX,centerZ)?localPatch:baseWorld).push(...cell);
  }
 }
 // Subtract the 3D cave void from local coastal triangles. Unlike flattening a
 // strip, this leaves every high roof/cape triangle in its original position.
 const addedPositions:number[]=[],addedColors:number[]=[],clippedLocal:number[]=[],portal:number[]=[];
 const portalRock=new Color('#899185');
 const addPortal=(point:Vector3)=>{
  portal.push(count+addedPositions.length/3);
  addedPositions.push(point.x,point.y,point.z);
  addedColors.push(portalRock.r,portalRock.g,portalRock.b);
 };
 const vertex=(index:number)=>new Vector3(positions[index*3],positions[index*3+1],positions[index*3+2]);
 for(let offset=0;offset<localPatch.length;offset+=3){
  const indices=localPatch.slice(offset,offset+3),points=indices.map(vertex);
  const fragments=clipTerrainOutsideCave(points[0],points[1],points[2]);
  if(fragments===undefined){clippedLocal.push(...indices);continue;}
  const triangle=new Triangle(points[0],points[1],points[2]);
  for(const polygon of fragments){
   const polygonIndices=polygon.map(point=>{
    const bary=triangle.getBarycoord(point,new Vector3());
    const index=count+addedPositions.length/3;
    addedPositions.push(point.x,point.y,point.z);
    for(let axis=0;axis<3;axis++)addedColors.push(bary
     ?colors[indices[0]*3+axis]*bary.x+colors[indices[1]*3+axis]*bary.y+colors[indices[2]*3+axis]*bary.z
     :colors[indices[0]*3+axis]);
    return index;
   });
   for(let i=1;i<polygonIndices.length-1;i++)clippedLocal.push(polygonIndices[0],polygonIndices[i],polygonIndices[i+1]);
  }
  // Match the exact clipped boundary to the buried lining. Without this collar,
  // the heightfield is an open sheet and sky/ocean is visible behind its mouth.
  for(const panel of cavePortalSeals(fragments))for(const point of panel)addPortal(point);
 }
 for(const panel of cavePortalLining((x,z)=>terrainVisibleHeight(mapDirection(x,z),groundSurfaceAt(x,z).height)))for(const point of panel)addPortal(point);
 localPatch.length=0;
 for(const index of clippedLocal)localPatch.push(index);
 whole.length=0;
 for(const index of baseWorld)whole.push(index);
 // Avoid spreading the complete globe's index buffer into a single call.
 for(const index of localPatch)whole.push(index);
 const joinedPositions=new Float32Array(positions.length+addedPositions.length);
 joinedPositions.set(positions);joinedPositions.set(addedPositions,positions.length);
 const joinedColors=new Float32Array(colors.length+addedColors.length);
 joinedColors.set(colors);joinedColors.set(addedColors,colors.length);
 const positionAttribute=new Float32BufferAttribute(joinedPositions,3),colorAttribute=new Float32BufferAttribute(joinedColors,3);
 // Compute normals once across the complete manifold before splitting indices,
 // so the two meshes share a continuous lighting seam at the patch edge.
 const normalSource=new BufferGeometry();
 normalSource.setAttribute('position',positionAttribute);normalSource.setAttribute('color',colorAttribute);normalSource.setIndex(whole.concat(portal));normalSource.computeVertexNormals();
 const normals=normalSource.getAttribute('normal') as Float32BufferAttribute;
 return {positions:positionAttribute,colors:colorAttribute,normals,whole,baseWorld,localPatch,portal};
}
/** Full unpartitioned terrain is retained as the stable, test-facing geometry API. */
export function makeTerrain(columns=252){
 const grid=makeTerrainGrid(columns);return terrainGeometry(grid,grid.whole);
}
/** Runtime rendering partitions complete cells; their shared border vertices cannot crack or overlap. */
export function makeTerrainPartition(columns=252):TerrainPartition{
 const grid=makeTerrainGrid(columns);
 return {baseWorld:terrainGeometry(grid,grid.baseWorld),localPatch:terrainGeometry(grid,grid.localPatch),portal:terrainGeometry(grid,grid.portal)};
}
export default function TownLandscape({runtime}:{runtime:WorldRuntimeState}){
 const terrain=useMemo(()=>makeTerrainPartition(),[]);
 const overviewTerrain=useMemo(()=>makeTerrainPartition(126),[]);
 const baseMesh=useRef<Mesh>(null),localMesh=useRef<Mesh>(null),portalMesh=useRef<Mesh>(null);
 useFrame(()=>{
  const active=runtime.overviewTransition>.65?overviewTerrain:terrain;
  if(baseMesh.current&&baseMesh.current.geometry!==active.baseWorld)baseMesh.current.geometry=active.baseWorld;
  if(localMesh.current&&localMesh.current.geometry!==active.localPatch)localMesh.current.geometry=active.localPatch;
  if(portalMesh.current&&portalMesh.current.geometry!==active.portal)portalMesh.current.geometry=active.portal;
 });
 useEffect(()=>{
  const geometry=terrain.portal,positions=geometry.getAttribute('position'),indices=geometry.getIndex();
  const triangles:Vector3[][]=[];
  if(indices)for(let index=0;index<indices.count;index+=3)triangles.push([0,1,2].map(offset=>new Vector3().fromBufferAttribute(positions,indices.getX(index+offset))));
  const release=registerCavePortalTriangles(geometry,triangles);
  return ()=>{
   release();
   terrain.baseWorld.dispose();terrain.localPatch.dispose();terrain.portal.dispose();
   overviewTerrain.baseWorld.dispose();overviewTerrain.localPatch.dispose();overviewTerrain.portal.dispose();
  };
 },[terrain,overviewTerrain]);
 // Terrain receives landmark shadows but does not duplicate the complete
 // globe in the dynamic shadow map. Surface normals describe its own slopes.
 return <group name="terrain-partition">
  <mesh ref={baseMesh} name="terrain-base-world" geometry={terrain.baseWorld} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
  <mesh ref={localMesh} name="terrain-local-patch" geometry={terrain.localPatch} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
  <mesh ref={portalMesh} name="terrain-cave-portals" geometry={terrain.portal} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading/></mesh>
 </group>;
}

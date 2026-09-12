'use client';
import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BufferGeometry, Color, Float32BufferAttribute, Mesh, Sphere, Vector3 } from 'three';
import { MAP_RADIUS, MAP_MIN_Z, MAP_CIRCUMFERENCE, mapCoordinates, mapDirection } from '../data/world-map';
import { inPeninsulaRegion } from '../data/peninsula-layout';
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
 * Rendering samples the same support function as walking, including the cave floor.
 */
type TerrainGrid={
 positions:Float32BufferAttribute;
 colors:Float32BufferAttribute;
 normals:Float32BufferAttribute;
 whole:number[];
 baseWorld:number[];
 localPatch:number[];
};
export type TerrainPartition={baseWorld:BufferGeometry;localPatch:BufferGeometry};

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
 const positionAttribute=new Float32BufferAttribute(positions,3),colorAttribute=new Float32BufferAttribute(colors,3);
 // Compute normals once across the complete manifold before splitting indices,
 // so the two meshes share a continuous lighting seam at the patch edge.
 const normalSource=new BufferGeometry();
 normalSource.setAttribute('position',positionAttribute);normalSource.setAttribute('color',colorAttribute);normalSource.setIndex(whole);normalSource.computeVertexNormals();
 const normals=normalSource.getAttribute('normal') as Float32BufferAttribute;
 return {positions:positionAttribute,colors:colorAttribute,normals,whole,baseWorld,localPatch};
}
/** Full unpartitioned terrain is retained as the stable, test-facing geometry API. */
export function makeTerrain(columns=252){
 const grid=makeTerrainGrid(columns);return terrainGeometry(grid,grid.whole);
}
/** Runtime rendering partitions complete cells; their shared border vertices cannot crack or overlap. */
export function makeTerrainPartition(columns=252):TerrainPartition{
 const grid=makeTerrainGrid(columns);
 return {baseWorld:terrainGeometry(grid,grid.baseWorld),localPatch:terrainGeometry(grid,grid.localPatch)};
}
export default function TownLandscape({runtime}:{runtime:WorldRuntimeState}){
 const terrain=useMemo(()=>makeTerrainPartition(),[]);
 const overviewTerrain=useMemo(()=>makeTerrainPartition(126),[]);
 const baseMesh=useRef<Mesh>(null),localMesh=useRef<Mesh>(null);
 useFrame(()=>{
  const active=runtime.overviewTransition>.65?overviewTerrain:terrain;
  if(baseMesh.current&&baseMesh.current.geometry!==active.baseWorld)baseMesh.current.geometry=active.baseWorld;
  if(localMesh.current&&localMesh.current.geometry!==active.localPatch)localMesh.current.geometry=active.localPatch;
 });
 useEffect(()=>()=>{
  terrain.baseWorld.dispose();terrain.localPatch.dispose();
  overviewTerrain.baseWorld.dispose();overviewTerrain.localPatch.dispose();
 },[terrain,overviewTerrain]);
 // Terrain receives landmark shadows but does not duplicate the complete
 // globe in the dynamic shadow map. Surface normals describe its own slopes.
 return <group name="terrain-partition">
  <mesh ref={baseMesh} name="terrain-base-world" geometry={terrain.baseWorld} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
  <mesh ref={localMesh} name="terrain-local-patch" geometry={terrain.localPatch} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
 </group>;
}

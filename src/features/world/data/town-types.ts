export type TownPoint = readonly [number, number]; // east metres, north metres on the planet
export type DistrictId = 'studio-row' | 'courtyard' | 'back-alleys' | 'workshop' | 'outskirts' | 'cove' | 'pier' | 'high-ground';
export type InteriorId = 'studio' | 'workshop' | 'arcade' | 'about' | 'lab' | 'skateshop';
export type BuildingArchetype = 'studio' | 'livework' | 'corner' | 'warehouse' | 'garage' | 'cottage' | 'motel' | 'shed' | 'arcade' | 'office' | 'lab' | 'market';
export type RoofStyle = 'flat' | 'gable' | 'sawtooth' | 'lean';
export type TownBuilding = {
  id:string; x:number; z:number; lon:number; lat:number;
  width:number; depth:number; height:number; rotation:number;
  kind:'studio'|'arcade'|'workshop'|'house'|'tower'|'shop';
  archetype:BuildingArchetype; roof:RoofStyle; district:DistrictId;
  color:string; trim:string; accent:string; sign?:string; subtitle?:string;
  secondary?:boolean; interior?:InteriorId; entryWidth:number; entryOffset:number;
  floorHeight:number; balcony?:boolean; awning?:boolean; exteriorStair?:boolean;
};
export type TownRoute = {
  id:string; label:string; district:DistrictId; points:readonly TownPoint[];
  width:number; sidewalk?:number; material:'asphalt'|'concrete'|'dirt'|'sand'|'timber';
  category:'primary'|'secondary'|'discovery';
  elevation?:number|readonly [number,number];
  elevations?:readonly number[]; // Optional matching control-point heights for graded trails.
};
export type TownArea = {id:string; label:string; district:DistrictId; center:TownPoint; width:number; depth:number; elevation?:number; material:'concrete'|'gravel'|'timber'};
export type WallSegment = {id:string; buildingId:string; center:readonly [number,number,number]; size:readonly [number,number,number]; camera?:boolean};

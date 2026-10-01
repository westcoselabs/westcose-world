import { Matrix4, Quaternion, Vector3 } from 'three';
/** A periodic authoring chart, independent of geographic runtime coordinates. */
// Radius 72 (4x the original surface) leaves room for the snowboard mountain and
// puts it around the curve from the pier, which now looks out over open ocean.
export const MAP_RADIUS=72;
export const MAP_SEA_LEVEL=-.8;
export const MAP_MAX_HEIGHT=84;
export const MAP_SUMMIT={x:0,z:228,height:78} as const;
/** Camera, sky and sun distances were tuned for the original 36m globe and 42m envelope. */
export const MAP_VIEW_SCALE=(MAP_RADIUS+MAP_MAX_HEIGHT)/78;
export const MAP_CIRCUMFERENCE=2*Math.PI*MAP_RADIUS;
// Keep the coordinate seam in open ocean between the pier and the new rear shore. It sits
// well beyond the long pier head, so nothing a visitor reaches straddles the chart cut.
export const MAP_SEAM=360;
export const MAP_MIN_Z=MAP_SEAM-MAP_CIRCUMFERENCE;
export function canonicalMapZ(z:number){return ((z-MAP_MIN_Z)%MAP_CIRCUMFERENCE+MAP_CIRCUMFERENCE)%MAP_CIRCUMFERENCE+MAP_MIN_Z;}
export function mapDirection(x:number,z:number){const a=x/MAP_RADIUS,b=z/MAP_RADIUS;return new Vector3(Math.sin(a),Math.cos(a)*Math.sin(b),Math.cos(a)*Math.cos(b));}
export function mapCoordinates(d:{x:number;y:number;z:number}){const r=Math.hypot(d.x,d.y,d.z)||1;return {x:MAP_RADIUS*Math.asin(Math.max(-1,Math.min(1,d.x/r))),z:canonicalMapZ(MAP_RADIUS*Math.atan2(d.y,d.z))};}
export function mapPoint(x:number,z:number,elevation=0){return mapDirection(x,z).multiplyScalar(MAP_RADIUS+elevation);}
export function mapFrame(x:number,z:number,elevation=0){
 const a=x/MAP_RADIUS,b=z/MAP_RADIUS,up=mapDirection(x,z);
 const east=new Vector3(Math.cos(a),-Math.sin(a)*Math.sin(b),-Math.sin(a)*Math.cos(b)),north=new Vector3(0,Math.cos(b),-Math.sin(b));
 const matrix=new Matrix4().makeBasis(east,up,north.clone().negate());
 const quaternion=new Quaternion().setFromRotationMatrix(matrix),position=up.clone().multiplyScalar(MAP_RADIUS+elevation);
 matrix.setPosition(position);return {up,east,north,quaternion,position,matrix};
}
export function mapGeographic(x:number,z:number){const d=mapDirection(x,z);return {lon:Math.atan2(d.x,d.z),lat:Math.asin(d.y)};}
export function mapMetric(x:number,elevation=0){const lateral=(MAP_RADIUS+elevation)/MAP_RADIUS;return {x:lateral,z:Math.max(.025,Math.cos(x/MAP_RADIUS))*lateral};}

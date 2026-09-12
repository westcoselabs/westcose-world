'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** One small, deterministic, packed scalar texture; no image downloads or per-building maps. */
function makeSurfaceTexture() {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 1274126177;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, cells: number) => {
    const px = x / size * cells, py = y / size * cells, ix = Math.floor(px), iy = Math.floor(py);
    const sx = px - ix, sy = py - iy, u = sx*sx*(3-2*sx), v = sy*sy*(3-2*sy);
    const a = hash(ix % cells, iy % cells), b = hash((ix+1) % cells, iy % cells);
    const c = hash(ix % cells, (iy+1) % cells), d = hash((ix+1) % cells, (iy+1) % cells);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    pixels[i]=255*(.5*noise(x,y,8)+.28*noise(x,y,16)+.15*noise(x,y,32)+.07*noise(x,y,64));
    pixels[i+1]=255*hash(x,y);
    pixels[i+2]=255*(.72*noise(x,y,4)+.28*noise(x,y,16));
    pixels[i+3]=255*noise(x,y,64);
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  texture.name='WestCose / packed mineral, grit and weathering';
  return texture;
}
// Shared GPU resource, reference-counted across the batches and React remounts.
let sharedTexture: THREE.DataTexture | null = null;
let users = 0;
function acquireTexture(){users++;return sharedTexture??(sharedTexture=makeSurfaceTexture());}
function releaseTexture(){if(--users===0){sharedTexture?.dispose();sharedTexture=null;}}

const declarations = /* glsl */`
uniform sampler2D coastSurface;
varying vec2 vCoastUv;
varying float vCoastKind;
varying float vCoastHeight;
float coastHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float coastJoint(vec2 cell, vec2 width) {
  vec2 q=fract(cell), aa=max(fwidth(cell),vec2(.001));
  vec2 edge=min(q,1.0-q);
  return 1.0-min(smoothstep(width.x-aa.x,width.x+aa.x,edge.x),smoothstep(width.y-aa.y,width.y+aa.y,edge.y));
}
`;
const finishColor = /* glsl */`
vec2 cuv=vCoastUv;
vec4 mineral=texture2D(coastSurface,cuv*.19);
float grit=texture2D(coastSurface,cuv*2.6).g;
float broad=texture2D(coastSurface,cuv*.038+vec2(.21,.7)).b;
float relief=(mineral.r-.5)*.003+(grit-.5)*.0006;
float surfaceRoughness=.91;
float damp=0.0;
vec3 pigment=vec3(1.0);
if(vCoastKind<.5) {
  // Quiet plaster body with concentrated salt/runoff damage, rather than broad camouflage.
  float tide=(1.0-smoothstep(.04,.48,vCoastHeight))*(.3+.7*mineral.r);
  float streak=texture2D(coastSurface,cuv*vec2(.6,.035)).r;
  float runoff=smoothstep(.64,.76,streak)*smoothstep(.33,.68,broad);
  float spall=smoothstep(.62,.71,mineral.r)*smoothstep(.5,.65,broad);
  pigment=mix(vec3(.93,.93,.89),vec3(1.01,1.005,.97),mineral.r);
  pigment=mix(pigment,vec3(.57,.55,.47),spall*.62);
  pigment*=1.0-tide*.24-runoff*.19;
  float salt=smoothstep(.59,.73,mineral.a)*tide;
  pigment=mix(pigment,vec3(1.04,1.035,.97),salt*.27);
  relief+=(mineral.a-.5)*.0015-spall*.004;
  surfaceRoughness=.88+mineral.a*.1;
} else if(vCoastKind<1.5) {
  float grain=texture2D(coastSurface,cuv*vec2(1.4,.045)).r;
  float rings=sin(cuv.x*88.0+grain*16.0)*.055;
  pigment=vec3(.71+.38*grain+rings);
  float seam=coastJoint(cuv/vec2(.22,3.4),vec2(.025,.003));
  pigment*=1.0-seam*.52;relief=(grain-.5)*.019-seam*.014;
  surfaceRoughness=.78+mineral.a*.14;
} else if(vCoastKind<2.5) {
  float patina=smoothstep(.56,.76,mineral.r);
  pigment=mix(vec3(.8+.23*mineral.r),vec3(.62,.38,.22),patina*.52);
  pigment*=.96+.06*grit;surfaceRoughness=.46+patina*.46;
  relief=(mineral.a-.5)*.0012;
} else if(vCoastKind<3.5) {
  // Metre-scaled cut stone: chipped mortar edges, mineral veins, and uneven wetness.
  vec2 tile=cuv/vec2(.94,.66);tile.x+=mod(floor(tile.y),2.0)*.5;
  float chips=smoothstep(.49,.68,mineral.a);
  float joint=coastJoint(tile,vec2(.011,.016)+chips*vec2(.012,.016));
  float bevel=coastJoint(tile,vec2(.027,.036)+chips*vec2(.013,.016));
  float stone=coastHash(floor(tile));
  vec3 stoneTint=mix(vec3(.86,.91,.94),vec3(1.06,1.015,.9),stone);
  pigment=stoneTint*(.61+stone*.22+mineral.r*.13);
  float vein=(1.0-smoothstep(.005,.023,abs(mineral.r-.49)))*smoothstep(.56,.72,broad);
  pigment*=1.0-vein*.14;
  pigment=mix(pigment,vec3(.26,.285,.23),joint*.82);
  float edgeDirt=bevel*smoothstep(.39,.67,broad);
  pigment*=1.0-edgeDirt*.22;
  relief=(mineral.r-.5)*.009-bevel*.004-joint*.011-vein*.002;
  surfaceRoughness=.79+mineral.a*.15;
  damp=smoothstep(.5,.7,broad)*smoothstep(.29,.54,mineral.r)*.82;
  float pond=min(length((cuv-vec2(3.2,8.0))/vec2(1.8,.72)),length((cuv-vec2(8.6,3.0))/vec2(1.3,.62)));
  pond+=(mineral.r-.5)*.28;
  damp=max(damp,(1.0-smoothstep(.82,1.02,pond))*.94);
} else if(vCoastKind<4.5) {
  pigment=vec3(.72+.28*mineral.r+grit*.04);
  vec2 crackUv=cuv*.23;float fissure=abs(texture2D(coastSurface,crackUv).r-.5);
  float cracks=(1.0-smoothstep(.003,.013,fissure))*smoothstep(.58,.69,broad);
  pigment*=1.0-cracks*.44;relief=(mineral.a-.5)*.003-cracks*.004;
  damp=smoothstep(.51,.71,broad)*.78;
} else if(vCoastKind<5.5) {
  float aggregate=texture2D(coastSurface,cuv*1.5).a;
  pigment=vec3(.74+mineral.r*.38+aggregate*.17);
  relief=(aggregate-.5)*.008;
} else if(vCoastKind<6.5) {
  float ripples=sin(cuv.y*17.0+mineral.r*5.0);
  pigment=vec3(.89+mineral.r*.17+ripples*.018);
  relief=(grit-.5)*.002+ripples*.0015;
} else {
  // Quiet coastal duff and dry grass under the groves. The town's sharper
  // aggregate relief sparkles over a whole hemisphere at grazing sunset angles.
  float duff=texture2D(coastSurface,cuv*.52).r;
  pigment=mix(vec3(.83,.86,.77),vec3(1.08,1.02,.89),broad);
  pigment*=.91+duff*.17;
  relief=(duff-.5)*.002+(mineral.a-.5)*.0006;
  surfaceRoughness=.98;
}
pigment=mix(pigment,pigment*vec3(.64,.70,.72),damp);
diffuseColor.rgb*=pigment;
surfaceRoughness=mix(surfaceRoughness,.19,damp);
relief*=1.0-damp*.76;
`;
const perturbNormal=/* glsl */`
// Derivative bump mapping adds relief without displacing the collision surface.
vec3 cdx=dFdx(-vViewPosition), cdy=dFdy(-vViewPosition);
vec3 cr1=cross(cdy,normal), cr2=cross(normal,cdx);
float cdet=dot(cdx,cr1);
vec3 cgrad=sign(cdet)*(dFdx(relief)*cr1+dFdy(relief)*cr2);
normal=normalize(abs(cdet)*normal-cgrad);
`;

export function WeatheredMaterial({doubleSide=false}:{doubleSide?:boolean}){
  const textureUniform=useRef<{value:THREE.Texture|null}>({value:null});
  const material=useMemo(()=>{
    const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:doubleSide?THREE.DoubleSide:THREE.FrontSide});
    m.name='WestCose / weathered shared PBR';
    m.onBeforeCompile=shader=>{
      shader.uniforms.coastSurface=textureUniform.current;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nattribute vec2 surfaceUv;\nattribute float surfaceKind;\nattribute float surfaceHeight;\nvarying vec2 vCoastUv;\nvarying float vCoastKind;\nvarying float vCoastHeight;`)
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCoastUv=surfaceUv;vCoastKind=surfaceKind;vCoastHeight=surfaceHeight;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${declarations}`)
        .replace('#include <color_fragment>',`#include <color_fragment>\n${finishColor}`)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=surfaceRoughness;')
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${perturbNormal}`);
    };
    m.customProgramCacheKey=()=> 'westcose-weathered-v6';
    return m;
  },[doubleSide]);
  useLayoutEffect(()=>{
    textureUniform.current.value=acquireTexture();
    return()=>{releaseTexture();material.dispose();};
  },[material]);
  return <primitive object={material} attach="material"/>;
}

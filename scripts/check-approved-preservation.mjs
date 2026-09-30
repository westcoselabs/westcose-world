import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root=process.cwd(), out=path.join(root,'.next','approved-preservation');
mkdirSync(out,{recursive:true});
for(const file of readdirSync('src/features/world/data').filter(f=>f.endsWith('.ts'))){
 const result=ts.transpileModule(readFileSync(path.join('src/features/world/data',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 writeFileSync(path.join(out,file.replace('.ts','.js')),result.outputText);
}
const require=createRequire(import.meta.url),town=require(path.join(out,'town-layout.js')),surface=require(path.join(out,'town-surfaces.js'));
const protectedRoutes=town.TOWN_ROUTES.filter(r=>!r.id.startsWith('ski-')&&!['resort-trail','lighthouse-trail','cave','beach-east','resort-approach','lodge-walk','ticket-walk','finish-return'].includes(r.id));
const terrain=[];
for(let x=-40;x<=24;x+=2)for(let z=-18;z<=42;z+=2)terrain.push([x,z,surface.groundSurfaceAt(x,z).height]);
const data={buildings:town.TOWN_BUILDINGS.filter(b=>!['resort-lodge','ticket-hut'].includes(b.id)),routes:protectedRoutes,terrain};
const destination=path.join(root,'docs/qa/approved-layout-implementation');
mkdirSync(destination,{recursive:true});
const baseline=path.join(destination,'protected-baseline.json');
if(process.argv.includes('--baseline')){writeFileSync(baseline,JSON.stringify(data,null,2)+'\n');console.log('Protected baseline recorded: seven buildings, town routes, 1023 terrain samples.');}
else {
 const before=JSON.parse(readFileSync(baseline,'utf8'));
 assert.deepEqual(data.buildings,before.buildings,'Protected buildings changed');
 assert.deepEqual(data.routes,before.routes,'Protected routes changed');
 // Only the final forest-route junction is reconnected to the new base resort.
 // Its 2.5cm path skin may change at the last row, not the underlying forest landform.
 let delta=0,junctionDelta=0;for(let i=0;i<terrain.length;i++){
  const [x,z,h]=terrain[i],change=Math.abs(h-before.terrain[i][2]);
  if(z===42&&x>=-10&&x<=4)junctionDelta=Math.max(junctionDelta,change);else delta=Math.max(delta,change);
 }
 assert.ok(delta<1e-9,`Protected terrain changed by ${delta}`);
 assert.ok(junctionDelta<=.02500001,`Forest reconnection altered more than the path skin: ${junctionDelta}`);
 const report={protectedBuildings:data.buildings.length,protectedRoutes:data.routes.length,terrainSamples:terrain.length,maxHeightDelta:delta,authorizedForestJunctionSkinDelta:junctionDelta,passed:true};
 writeFileSync(path.join(destination,'preservation.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
}

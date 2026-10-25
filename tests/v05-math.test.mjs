import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, isVictory, positionError } from '../experimental/v05/src/game/game.ts';
import { constructionFor, configsFor, structuralFingerprint } from '../experimental/v05/src/generator/cascade.ts';
import { PERTURBED_TEMPLATES, columnsForTemplate, solutionForTemplate } from '../experimental/v05/src/generator/perturbation-data.ts';
import { makeCertificate, verifyBarrier, verifyWinTrace, classifyMinimum, layoutKey } from '../experimental/v05/src/generator/barrier.ts';
import { generateDeal } from '../experimental/v05/src/generator/level-generator.ts';
import { solveForward } from '../experimental/v05/src/solver/solver.ts';
import { solveCertified } from '../experimental/v05/src/solver/certified-solver.ts';

const level = c => ({ seed:'native-v05', algorithm:'reserve-proof-v5', columns:c.columns, solution:c.solution });
test('v05 engine and bounded solver support all reserve capacities0..4 and reject other capacities',()=>{
  const built=constructionFor(1,0);
  for(let q=0;q<=4;q++){
    const game=createGame(level(built),q);assert.equal(game.reserve.length,q);assert.equal(positionError(game,game.config),null);
    const result=solveForward(game,{maxStates:1,maxMs:0});assert.equal(result.status,'UNKNOWN');
  }
  for(const q of [-1,5,1.5])assert.throws(()=>createGame(level(built),q));
});
test('v05 all87 constructive variants have independent lower proofs and actual-engine upper proofs',()=>{
  const expected=[21,22,22,22],all=new Set();
  for(let k=1;k<=4;k++){
    const fingerprints=new Set();
    for(let i=0;i<configsFor(k).length;i++){
      const built=constructionFor(k,i),cert=makeCertificate(built.columns,k),result=classifyMinimum(built.columns,cert,built.solution);
      assert.ok(result.ok,result.reason);assert.equal(result.minimum,k);assert.equal(result.positive.status,'WIN');assert.equal(result.lower.status,'LOSE');
      assert.equal(result.positive.reservePeak,k);assert.equal(result.lower.capacity,k-1);assert.equal(built.mixedColumns,8);
      fingerprints.add(built.structuralFingerprint);all.add(built.structuralFingerprint);
    }
    assert.equal(fingerprints.size,expected[k-1]);
  }
  assert.equal(all.size,87);
});
test('v05 all64 normal templates are structurally distinct, mixed,108hidden and exactRmin1..4',()=>{
  const global=new Set(),perClass=[0,0,0,0];
  for(const t of PERTURBED_TEMPLATES){
    const columns=columnsForTemplate(t),trace=solutionForTemplate(t),proof=makeCertificate(columns,t.required);
    assert.deepEqual(columns.map(c=>c.length),[10,11,11,11,11,11,11,11,11,10]);assert.ok(columns.flat().every(t=>!t.open));
    assert.equal(new Set(columns.flat().map(t=>t.id)).size,108);
    assert.ok(columns.some(c=>new Set(c.map(t=>t.kind)).size>=3));assert.equal(columns.filter(c=>new Set(c.map(t=>t.kind)).size>1).length,8);
    const result=classifyMinimum(columns,proof,trace);assert.ok(result.ok,result.reason);assert.equal(result.minimum,t.required);
    global.add(structuralFingerprint(columns));perClass[t.required-1]++;
  }
  assert.deepEqual(perClass,[16,16,16,16]);assert.equal(global.size,64);
  for(let k=1;k<=4;k++)for(let i=0;i<configsFor(k).length;i++)global.add(constructionFor(k,i).structuralFingerprint);
  assert.equal(global.size,151,'rich templates add64 structures beyond87 constructive roots');
});
test('v05 structural diversity is invariant to column permutation, kind relabel andcopyIDs',()=>{
  for(let k=1;k<=4;k++){
    const b=constructionFor(k,0),altered=b.columns.toReversed().map(c=>c.map(t=>({...t,kind:8-t.kind,id:(8-t.kind)*12+(11-t.id%12)})));
    assert.equal(structuralFingerprint(b.columns),structuralFingerprint(altered));
  }
});
test('v05 lower proof rejects damaged metadata and actual barriers afterrebinding; valid orderchange accepted',()=>{
  let rejected=0;
  for(let k=1;k<=4;k++){
    const b=constructionFor(k,0),original=makeCertificate(b.columns,k);
    const mutations=[c=>{delete c.schema;},c=>{c.required=0;},c=>{c.required=k===4?3:k+1;},c=>{c.blockedReserve=k;},c=>{c.capacity=13;},c=>{c.initialHeights[0]=11;},c=>{c.layoutKey+='0';},c=>{c.gateColumns=[1,1];},c=>{c.gatePrefixes[0]++;},c=>{c.gateKind=8;},c=>{c.otherPorts.pop();},c=>{c.otherPorts[0].prefix++;},c=>{c.otherPorts[0].kind=c.gateKind;},c=>{c.otherPorts[0].column=c.gateColumns[0];},c=>{c.injected=true;}];
    for(const mutate of mutations){const c=structuredClone(original);mutate(c);assert.equal(verifyBarrier(b.columns,c).ok,false);rejected++;}
    assert.equal(verifyBarrier(b.columns,Object.create(original)).ok,false);rejected++;
    const flag=structuredClone(b.columns);flag[0][0].open=true;assert.equal(verifyBarrier(flag,original).ok,false);rejected++;
    const prefix=structuredClone(b.columns);[prefix[1][0],prefix[1][10]]=[prefix[1][10],prefix[1][0]];
    const rebound=structuredClone(original);rebound.layoutKey=layoutKey(prefix);assert.equal(verifyBarrier(prefix,rebound).ok,false);rejected++;
    const ordered=structuredClone(original);ordered.otherPorts.reverse();assert.equal(verifyBarrier(b.columns,ordered).ok,true);
    assert.equal(verifyBarrier(b.columns,original,k).ok,false);rejected++;
  }
  assert.equal(rejected,76);
});
test('v05 no lower claim from peakreserve alone; broken uppertrace has no exactclassification',()=>{
  for(let k=1;k<=4;k++){
    const b=constructionFor(k,0),cert=makeCertificate(b.columns,k);
    assert.equal(classifyMinimum(b.columns,null,b.solution).ok,false);
    const bad=structuredClone(b.solution);bad.find(a=>a.type==='move').count=0;
    assert.equal(verifyWinTrace(b.columns,bad,k).ok,false);assert.equal(classifyMinimum(b.columns,cert,bad).ok,false);
  }
});
test('v05 analytical LOSE is a separate checked proof; budgetUNKNOWN neverbecomes graphLOSE',()=>{
  for(let k=1;k<=4;k++){
    const b=constructionFor(k,0),c=makeCertificate(b.columns,k),lower={columns:b.columns,reserve:Array(k-1).fill(null)},upper={columns:b.columns,reserve:Array(k).fill(null)};
    assert.equal(solveForward(lower,{maxStates:1,maxMs:0}).status,'UNKNOWN');
    const proof=solveCertified(lower,{lowerBound:c},{maxStates:1,maxMs:0});assert.equal(proof.status,'LOSE');assert.equal(proof.reason,'first-unlock-invariant');
    assert.equal(solveCertified(upper,{lowerBound:c,solution:b.solution},{maxStates:1,maxMs:0}).status,'WIN');
    assert.equal(solveCertified(lower,{lowerBound:{...c,capacity:13}},{maxStates:1,maxMs:0}).status,'UNKNOWN');
  }
});
test('v05 normal seeded transforms preserve proof, determinism, exact108IDs and actualWIN',async()=>{
  for(let k=1;k<=4;k++)for(let i=0;i<8;i++){
    const a=await generateDeal('normal-'+i,k),b=await generateDeal('normal-'+i,k);assert.deepEqual(a,b);
    let state=createGame({seed:a.seed,columns:a.columns,solution:a.solution,algorithm:a.algorithm},k);
    for(const action of a.solution){const r=applyAction(state,action);assert.ok(r.ok,r.reason);state=r.state;assert.equal(positionError(state,state.config),null);}
    assert.ok(isVictory(state));assert.ok(verifyBarrier(a.columns,a.certificate,k-1).ok);
  }
});

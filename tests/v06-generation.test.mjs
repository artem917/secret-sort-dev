import test from 'node:test';
import assert from 'node:assert/strict';
import {allTemplates,columnsForTemplate,solutionForTemplate} from '../experimental/v06/src/generator/interleaved-data.ts';
import {generateDeal} from '../experimental/v06/src/generator/level-generator.ts';
import {classifyMinimum,makeCertificate} from '../experimental/v06/src/generator/barrier.ts';
import {verifyPortsBarrier} from '../experimental/v06/src/generator/ports-barrier.ts';
import {createGame,applyAction,isVictory} from '../experimental/v06/src/game/game.ts';
import {validateDeal,sealDeal,levelFor} from '../experimental/v06/src/game/deal.ts';
import {saveSession,loadSession,SESSION_KEY} from '../experimental/v06/src/game/session.ts';
import {ReplayPlayer} from '../experimental/v06/src/replay/player.ts';
import {deriveGeneralCertificate,verifyGeneralCertificate} from './support/independent-v06-bound.mjs';
import {fullCanonical} from './support/v06-metrics.mjs';
import {benchmarkLevels} from '../scripts/benchmark-v06.mjs';
import * as engine from '../experimental/v06/src/game/game.ts';
const pos=s=>({columns:s.columns,reserve:s.reserve});
const memory=()=>{const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};
class Clock{jobs=new Map();n=0;set(fn){const n=++this.n;this.jobs.set(n,fn);return n;}clear(n){this.jobs.delete(n);}all(){for(let n=0;this.jobs.size&&n<5000;n++){const [k,fn]=this.jobs.entries().next().value;this.jobs.delete(k);fn();}assert.equal(this.jobs.size,0);}}

test('v06 every admitted structural root has independently checked exact Rmin and actual engine WIN',()=>{
 const seen=new Set();for(const t of allTemplates()){
  const c=columnsForTemplate(t),s=solutionForTemplate(t),certificate=makeCertificate(c,t.required),proof=classifyMinimum(c,certificate,s);
  assert.ok(proof.ok,t.id+':'+proof.reason);assert.equal(proof.minimum,t.required);assert.equal(proof.positive.manualReveals,0);
  const independent=deriveGeneralCertificate(c,t.required);assert.ok(verifyGeneralCertificate(c,independent).ok);
  const lower=verifyPortsBarrier(c,certificate);assert.ok(lower.ok);assert.ok(lower.duplicatedKinds>=2);
  assert.ok(!seen.has(t.structuralFingerprint));seen.add(t.structuralFingerprint);
 }
 for(const k of [1,2,3,4])assert.ok(allTemplates().filter(t=>t.required===k).length>=4);
});
test('v06 deterministic seeds rebind every proof after kind and column transforms',async()=>{
 for(const k of[1,2,3,4])for(const seed of['repeat-identical','second-independent','third-independent']){
  const a=await generateDeal(seed,k),b=await generateDeal(seed,k);assert.deepEqual(a,b);assert.ok((await validateDeal(a)).ok);
  const port=memory(),start=createGame(levelFor(a),k,'live');let moved=applyAction(start,a.solution[0]);assert.ok(moved.ok);assert.equal(moved.state.history.length,1);
  assert.ok(moved.state.history[0].autoRevealedId!==null,'one source reveal');assert.equal(moved.state.columns.flat().filter(t=>t.open).length+moved.state.reserve.filter(Boolean).length,11);
  const undo=applyAction(moved.state,{type:'undo'});assert.ok(undo.ok);assert.deepEqual(pos(undo.state),pos(start));
  saveSession(port,moved.state,a,'playing');const restored=await loadSession(port);assert.deepEqual(restored.game,moved.state);assert.deepEqual(restored.deal,a);
  assert.deepEqual(createGame(levelFor(restored.deal),k).columns,start.columns);assert.equal(port.map.size,1);assert.ok(port.map.has(SESSION_KEY));
 }
});
test('v06 forged bounds, start masks, startup reveals and corrupt traces rejected even if resealed',async()=>{
 const d=await generateDeal('cross-r1-15',1);
 for(const mutate of[x=>x.solution=[],x=>x.solution.unshift({type:'reveal',column:0,index:0}),x=>x.certificate.ports[0].prefix++,x=>x.columns[0][0].open=false,x=>x.solution[0].count=0]){
  const copy=structuredClone(d);mutate(copy);assert.equal((await validateDeal(await sealDeal(copy))).ok,false);
 }
 for(const q of[null,NaN,.5,4])assert.equal(verifyPortsBarrier(d.columns,d.certificate,q).ok,false);
});
test('v06 replay starts with ten open tiles, reaches true WIN in every class and leaves live save untouched',async()=>{
 for(const k of[1,2,3,4]){
  const d=await generateDeal('isolated-player',k),port=memory(),live=createGame(levelFor(d),k,'live');saveSession(port,live,d,'surrendered');const before=port.getItem(SESSION_KEY),clock=new Clock();
  const p=new ReplayPlayer(levelFor(d),k,()=>{},true,clock);assert.equal(p.view.state.columns.flat().filter(t=>t.open).length,10);assert.equal(p.view.index,0);assert.equal(p.view.state.history.length,0);
  p.next();clock.all();assert.equal(p.view.index,1);assert.equal(p.view.state.transfers,1);p.previous();assert.equal(p.view.state.columns.flat().filter(t=>t.open).length,10);
  p.play();clock.all();assert.ok(isVictory(p.view.state));assert.equal(p.view.phase,'won');assert.equal(port.getItem(SESSION_KEY),before);assert.equal(live.result,null);
  p.restart();assert.equal(p.view.state.history.length,0);p.play();p.close();assert.equal(clock.jobs.size,0);
 }
});
test('v06 all reference traces interleave kinds without selfloops, full-stack relocations or padded moves',()=>{
 const levels=allTemplates().map(t=>({id:t.id,difficulty:t.required,columns:columnsForTemplate(t),solution:solutionForTemplate(t),algorithm:'reserve-proof-v6'}));
 const report=benchmarkLevels(levels,engine,{policyBudget:1});
 for(const g of report.games.filter(g=>g.strategy==='certificate')){
  assert.equal(g.outcome,'WIN');assert.ok(g.metrics.maxSameKindRun<=5,g.id);assert.ok(g.metrics.equalAdjacentFraction<.35,g.id);assert.equal(g.metrics.meaningfulMovesTaken,g.metrics.moves,g.id);const l=levels.find(l=>l.id===g.id);let state=createGame({seed:l.id,...l},l.difficulty);const seen=new Set([fullCanonical(state)]);
  for(const action of l.solution){const source=action.from.zone==='column'?state.columns[action.from.index]:[];assert.ok(!(source.length===12&&action.count===12&&source.every(t=>t.open&&t.kind===source[0].kind)),'no full sorted stack relocation');const r=applyAction(state,action);assert.ok(r.ok);state=r.state;const key=fullCanonical(state);assert.ok(!seen.has(key),'no repeated canonical state '+g.id);seen.add(key);}
 }
});

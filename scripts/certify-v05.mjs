import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {generateDeal} from '../experimental/v05/src/generator/level-generator.ts';
import {levelFor} from '../experimental/v05/src/game/deal.ts';
import {classifyMinimum,makeCertificate} from '../experimental/v05/src/generator/barrier.ts';
import {constructionFor,configsFor,structuralFingerprint} from '../experimental/v05/src/generator/cascade.ts';
import {PERTURBED_TEMPLATES,columnsForTemplate,solutionForTemplate} from '../experimental/v05/src/generator/perturbation-data.ts';
import {createGame,applyAction,isVictory,legalMoves} from '../experimental/v05/src/game/game.ts';
import {visiblePosition} from '../experimental/v05/src/game/visible.ts';
import {canonicalPositionKey,verifyClosedProof} from '../experimental/v05/src/solver/solver.ts';
import {independentReserveFloor} from '../tests/support/v05-independent-proof.mjs';
import * as frozenV04 from '../experimental/v04/src/game/game.ts';
const dir='docs/v05';mkdirSync(`${dir}/certificates`,{recursive:true});mkdirSync(`${dir}/solutions`,{recursive:true});
const read=name=>JSON.parse(readFileSync(`tests/fixtures/v05/${name}.json`));
function replay(state,actions){for(const a of actions){const next=applyAction(state,a);assert.ok(next.ok,next.reason);state=next.state;}return state;}
function metrics(solution){const moves=solution.filter(a=>a.type==='move');return{actions:solution.length,transfers:moves.length,groupTransfers:moves.filter(a=>a.count>1).length,singleTransfers:moves.filter(a=>a.count===1).length,reserveEntries:moves.filter(a=>a.to.zone==='reserve').length,manualReveals:solution.filter(a=>a.type==='reveal').length};}
const normal=[],constructive=[],risk=[];
let frozenEngineReplays=0;
function crossCheckFrozen(columns,solution,q){
  let state=frozenV04.createGame({seed:'v05-cross-check',algorithm:'full-shuffle-v4',columns,solution:[]},q);
  for(const action of solution){const next=frozenV04.applyAction(state,action);assert.ok(next.ok,next.reason);state=next.state;assert.equal(frozenV04.positionError(state,state.config),null);}
  assert.ok(frozenV04.isVictory(state));frozenEngineReplays++;
}
for(const t of PERTURBED_TEMPLATES){
  const columns=columnsForTemplate(t),solution=solutionForTemplate(t),certificate=makeCertificate(columns,t.required),classification=classifyMinimum(columns,certificate,solution),independent=independentReserveFloor(columns);
  assert.ok(classification.ok);assert.equal(independent.minimumReserveForFirstUnlock,t.required);
  crossCheckFrozen(columns,solution,t.required);
  normal.push({id:t.id,required:t.required,structure:structuralFingerprint(columns),metrics:metrics(solution),independentLower:independent});
}
for(let k=1;k<=4;k++)for(let i=0;i<configsFor(k).length;i++){
  const c=constructionFor(k,i),classification=classifyMinimum(c.columns,makeCertificate(c.columns,k),c.solution);assert.ok(classification.ok);
  assert.equal(independentReserveFloor(c.columns).minimumReserveForFirstUnlock,k);
  crossCheckFrozen(c.columns,c.solution,k);
  constructive.push({required:k,index:i,structure:c.structuralFingerprint,metrics:metrics(c.solution)});
}
for(const w of read('risk-witnesses')){
  const deal=await generateDeal(w.seed,w.required),classification=classifyMinimum(deal.columns,deal.certificate,deal.solution);assert.ok(classification.ok);
  const parent=replay(createGame(levelFor(deal),w.required),w.prefix);assert.ok(isVictory(replay(parent,w.winning)));
  const child=replay(parent,[w.bad]);assert.ok(verifyClosedProof(child,w.lose.closedProof));
  const queue=[child],seen=new Set([canonicalPositionKey(child)]);let edges=0;
  for(let i=0;i<queue.length;i++){assert.ok(!isVictory(queue[i]));assert.ok(queue[i].columns.every(c=>!c.length||c[0].open));for(const a of legalMoves(queue[i])){edges++;const s=replay(queue[i],[a]),key=canonicalPositionKey(s);if(!seen.has(key)){seen.add(key);queue.push(s);}}}
  assert.deepEqual(seen,new Set(w.lose.closedProof.keys));
  risk.push({required:w.required,id:w.seed,parentStatus:'WIN-by-actual-engine-suffix',prefixActions:w.prefix.length,badAction:w.bad,childStatus:'LOSE',method:'independent-production-engine-closed-graph',states:seen.size,edges,frontier:0,scope:'reserve=q=required; noUndo oracle; Undo retained in game'});
  writeFileSync(`${dir}/certificates/class-${w.required}.json`,JSON.stringify({schema:'secret-sort-v05-class-certificate-v1',deal,classification,independentLower:independentReserveFloor(deal.columns),metrics:metrics(deal.solution)},null,2));
  const place=l=>`${l.zone==='column'?'Колонка':'Резерв'} ${l.index+1}`,rows=[];let shown=createGame(levelFor(deal),w.required);
  for(const [i,action]of deal.solution.entries()){
    shown=replay(shown,[action]);const last=shown.history.at(-1);
    rows.push(`| ${i+1} | ${action.type==='reveal'?`Раскрыть верхнюю фишку: колонка ${action.column+1}`:`${place(action.from)} → ${place(action.to)}`} | ${action.type==='move'?action.count:'—'} | ${last?.type==='move'&&last.autoRevealedId!==null?`Да, колонка ${action.from.index+1}`:'—'} |`);
  }
  writeFileSync(`${dir}/solutions/class-${w.required}.md`,`# Полное решение: обязательный резерв ${w.required}\n\nSeed: ${deal.seed}. ID: ${deal.id}. Номера колонок и резерва здесь начинаются с 1. Все действия повторно выполнены production engine до настоящей победы; Undo не используется.\n\n| Шаг | Действие | Размер пачки | Автораскрытие |\n|---:|---|---:|---|\n${rows.join('\n')}\n`);
}
const pair=read('pool-hidden-pair'),da=await generateDeal(pair.rootIdA,1),db=await generateDeal(pair.rootIdB,1);let a=createGame(levelFor(da),1),b=createGame(levelFor(db),1),observations=1;
assert.deepEqual(visiblePosition(a),visiblePosition(b));for(const action of pair.commonPrefix){a=replay(a,[action]);b=replay(b,[action]);assert.deepEqual(visiblePosition(a),visiblePosition(b));observations++;}
assert.ok(isVictory(replay(a,pair.A.parentWinningActions)));assert.ok(isVictory(replay(b,pair.B.parentWinningActions)));
assert.ok(verifyClosedProof(replay(a,[pair.commonAction]),pair.A.loseProof.closedProof));assert.ok(isVictory(replay(replay(b,[pair.commonAction]),pair.B.childWinningActions)));
const classes=[1,2,3,4].map(k=>({required:k,normalLayouts:normal.filter(r=>r.required===k).length,normalStructures:new Set(normal.filter(r=>r.required===k).map(r=>r.structure)).size,constructiveStructures:new Set(constructive.filter(r=>r.required===k).map(r=>r.structure)).size,metricRange:Object.fromEntries(['transfers','groupTransfers','singleTransfers','reserveEntries'].map(key=>[key,[Math.min(...normal.filter(r=>r.required===k).map(r=>r.metrics[key])),Math.max(...normal.filter(r=>r.required===k).map(r=>r.metrics[key]))]]))}));
const report={schema:'secret-sort-v05-evidence-v1',scope:'Current production sources; complete known pools, not random population risk statistics',classes,normalCount:normal.length,constructiveCount:constructive.length,totalStructures:new Set([...normal,...constructive].map(r=>r.structure)).size,frozenV04EngineReplays:frozenEngineReplays,risk,ambiguity:{rootA:pair.rootIdA,rootB:pair.rootIdB,bothNormalPoolMembers:true,required:1,identicalObservations:observations,commonAction:pair.commonAction,resultA:'LOSE-closed-proof',resultB:'WIN-engine-trace',observation:'kind/open per position, column heights and reserve; no tile-copy IDs or seed'},normal,constructive};
writeFileSync(`${dir}/evidence.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({classes,totalStructures:report.totalStructures,risk,ambiguity:report.ambiguity}));

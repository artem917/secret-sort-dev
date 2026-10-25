import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {shuffleLevel} from '../experimental/v04/src/generator/level-generator.ts';
import {solveForward,verifyClosedProof} from '../experimental/v04/src/solver/solver.ts';
import {createVisibleExplorer,rankedVisibleMoves,visibleKey} from '../tests/support/visible-policy.mjs';
import {createGame,applyAction,isVictory,positionError} from '../experimental/v04/src/game/game.ts';

const observe=s=>({columns:s.columns.map(c=>c.map(t=>({kind:t.open?t.kind:-1,open:t.open}))),reserve:s.reserve.map(t=>t?{kind:t.kind,open:true}:null)});
const results=[],wins=[];
for(const policyName of ['greedy400','explore2000'])for(let i=0;i<32;i++){
  const seed=`shuffle-${i}`,level=shuffleLevel(seed);let state=createGame(level,4);
  const policy=createVisibleExplorer(2000,80),tried=new Set(),actions=[];
  let outcome='limit',reserveEntries=0,groupMoves=0,moves=0,undos=0;
  const budget=policyName==='greedy400'?400:2000;
  for(let step=0;step<budget;step++){
    if(isVictory(state)){outcome='WIN';break;}
    const visible=observe(state);let action;
    if(policyName==='explore2000'){
      action=policy.next(visible);if(!action){outcome=policy.status;break;}
    }else{
      const hidden=visible.columns.findIndex(c=>c[0]&&!c[0].open);
      if(hidden>=0)action={type:'reveal',column:hidden,index:0};
      else{
        const key=visibleKey(visible);action=rankedVisibleMoves(visible).find(a=>!tried.has(key+JSON.stringify(a)));
        if(!action){outcome='tried-actions-stall';break;}tried.add(key+JSON.stringify(action));
      }
    }
    const next=applyAction(state,action);assert.ok(next.ok,next.reason);state=next.state;assert.equal(positionError(state,state.config),null);actions.push(action);
    if(action.type==='move'){moves++;if(action.count>1)groupMoves++;if(action.to.zone==='reserve')reserveEntries++;}if(action.type==='undo')undos++;
  }
  if(isVictory(state)){outcome='WIN';wins.push({seed,policy:policyName,actions});}
  let forwardAtFinal=outcome==='WIN'?{status:'WIN',reason:'actual-engine-victory'}:solveForward(state,{maxStates:1000,maxMs:100});
  if(forwardAtFinal.status==='LOSE')assert.ok(verifyClosedProof(state,forwardAtFinal.closedProof));
  const{solution,closedProof,...stats}=forwardAtFinal;
  results.push({seed,policy:policyName,outcome,actions:actions.length,moves,undos,reserveEntries,groupMoves,forwardAtFinal:stats});
}
const summary=Object.fromEntries(['greedy400','explore2000'].map(name=>{
  const rows=results.filter(r=>r.policy===name),counts=Object.fromEntries([...new Set(rows.map(r=>r.outcome))].map(o=>[o,rows.filter(r=>r.outcome===o).length]));
  return[name,{outcomes:counts,forwardAtFinal:Object.fromEntries(['WIN','LOSE','UNKNOWN'].map(o=>[o,rows.filter(r=>r.forwardAtFinal.status===o).length]))}];
}));
writeFileSync(new URL('../docs/v04/visible-play.json',import.meta.url),JSON.stringify({scope:'Frozen shuffle-0..31,4reserve; closed kinds are masked -1; no seed/certificate input to policy; current engine and actual Undo80',summary,results},null,2));
writeFileSync(new URL('../output/playwright/v04-visible-wins.json',import.meta.url),JSON.stringify(wins,null,2));
console.log(JSON.stringify(summary));

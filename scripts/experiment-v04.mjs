import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('output/playwright',{recursive:true});
import {generateLevel as v03} from '../src/generator/level-generator.ts';
import {generateVerifiedLevel} from '../experimental/v04/src/generator/level-generator.ts';
import {solveForward,canonicalPositionKey,verifyClosedProof} from '../experimental/v04/src/solver/solver.ts';
import {createGame,applyAction,isVictory,legalMoves} from '../src/game/game.ts';

const initial=[],cohort=[],frozen=[];
for(let i=0;i<32;i++){
 const seed='shuffle-'+i,first=generateVerifiedLevel(seed,{maxStates:20000,maxMs:1000});
 const {solution:unused,...firstStats}=first.report;initial.push({seed,...firstStats});
 const accepted=generateVerifiedLevel(seed,{maxStates:80000,maxMs:8000});
 const {solution,...stats}=accepted.report;cohort.push({seed,...stats});
 if(accepted.status==='WIN')frozen.push({seed,level:accepted.level,solution});
}
const summary=rows=>({WIN:rows.filter(r=>r.status==='WIN').length,LOSE:rows.filter(r=>r.status==='LOSE').length,UNKNOWN:rows.filter(r=>r.status==='UNKNOWN').length});
assert.equal(frozen.length,32,'Frozen cohort must have32 replayable WINs for this release');
const followup=[];
for(let i=32;i<64;i++){
  const result=generateVerifiedLevel(`shuffle-${i}`,{maxStates:80000,maxMs:8000});
  const {solution,...stats}=result.report;followup.push({seed:`shuffle-${i}`,...stats});
}
writeFileSync(new URL('../docs/v04/additional-cohort.json',import.meta.url),JSON.stringify({scope:'Diagnostic follow-up: frozen shuffle-32..63 after one unlogged crypto draw exceeded admission budget; no retry/substitution in generator',budget:{maxStates:80000,maxMs:8000},rows:followup},null,2));
const clone=x=>structuredClone(x);
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function checkpoints(level,path){
  let state=createGame(level,4);const prefix=[];
  for(let column=0;column<10;column++){const a={type:'reveal',column,index:0},next=applyAction(state,a);assert.ok(next.ok);state=next.state;prefix.push(a);}
  const moves=path.filter(a=>a.type==='move').length;
  const targets=new Map([[0,'first-visible'],[25,'transfer-25'],[50,'transfer-50'],[75,'transfer-75'],[moves-5,'five-before-win']]);
  const points=[];let transfers=0;
  const capture=()=>{if(targets.has(transfers)&&!isVictory(state))points.push({name:targets.get(transfers),transfers,state:clone(state),prefix:clone(prefix)});};capture();
  for(const action of path){
    if(action.type==='reveal'&&state.columns[action.column][0]?.open)continue;
    const next=applyAction(state,action);assert.ok(next.ok,next.reason);state=next.state;prefix.push(action);if(action.type==='move'){transfers++;capture();}
  }
  assert.ok(isVictory(state));for(const point of points)point.winningActions=clone(prefix.slice(point.prefix.length));return points;
}
function replayWin(state,actions){for(const a of actions){const next=applyAction(state,a);assert.ok(next.ok,next.reason);state=next.state;}assert.ok(isVictory(state));}
const rows=[],losingForks=[];let certifiedLoses=0,replayedWins=0;
for(const family of ['v03','v04'])for(let seed=0;seed<8;seed++){
  const seedText=`shuffle-${seed}`,root=family==='v03'?v03(seedText):frozen.find(r=>r.seed===seedText).level;
  const path=family==='v03'?root.solution:frozen.find(r=>r.seed===seedText).solution;
  for(const point of checkpoints(root,path)){
    const raw=legalMoves(point.state),children=new Map();
    for(const action of raw){const next=applyAction(point.state,action);assert.ok(next.ok);const key=canonicalPositionKey(next.state);if(!children.has(key))children.set(key,{key,action,state:next.state});}
    const ordered=[...children.values()].sort((a,b)=>hash(a.key)-hash(b.key)||(a.key<b.key?-1:1));
    const sampled=ordered.slice(0,16),results=[];
    for(const child of sampled){
      const result=solveForward(child.state,{maxStates:1000,maxMs:100});
      if(result.status==='WIN'){replayWin(clone(child.state),result.solution);replayedWins++;}
      if(result.status==='LOSE'){
        assert.ok(verifyClosedProof(child.state,result.closedProof));certifiedLoses++;
        replayWin(clone(point.state),point.winningActions);
        losingForks.push({family,seed:seedText,checkpoint:point.name,root,rootToParent:point.prefix,parent:{columns:point.state.columns,reserve:point.state.reserve},parentWinningActions:point.winningActions,
          badAction:child.action,child:{columns:child.state.columns,reserve:child.state.reserve},childProof:result});
      }
      const {solution,closedProof,...stats}=result;
      results.push({action:child.action,...stats,closedProofStates:closedProof?.keys.length??null});
    }
    rows.push({family,seed:seedText,checkpoint:point.name,transfers:point.transfers,parent:'WIN-by-verified-trajectory-suffix',
      reserveOccupied:point.state.reserve.filter(Boolean).length,rawLegalActions:raw.length,canonicalChildren:children.size,checked:sampled.length,omitted:Math.max(0,children.size-sampled.length),
      WIN:results.filter(r=>r.status==='WIN').length,LOSE:results.filter(r=>r.status==='LOSE').length,UNKNOWN:results.filter(r=>r.status==='UNKNOWN').length,results});
  }
  console.log(family,seed,'done');
}
const summaries={};
for(const family of ['v03','v04']){
  const r=rows.filter(row=>row.family===family),sum=k=>r.reduce((s,a)=>s+a[k],0);
  summaries[family]={positions:r.length,rawLegalActions:sum('rawLegalActions'),canonicalChildren:sum('canonicalChildren'),checked:sum('checked'),omitted:sum('omitted'),WIN:sum('WIN'),LOSE:sum('LOSE'),UNKNOWN:sum('UNKNOWN'),positionsWithCertifiedLosingChild:r.filter(a=>a.LOSE>0).length};
}
const report={scope:'Frozen seeds shuffle-0..7; v03 reverse-packets-v3 versus v04 full Fisher-Yates; checkpoints firstvisible/25/50/75/fivebeforewin',
  sampleRule:'All unique canonical child states if <=16, else first16 after deterministic FNV32-key order; raw slot/column symmetries collapsed. Omitted children are unexamined, not UNKNOWN.',
  generatedAt:new Date().toISOString(), initialBudget:{maxStates:20000,maxMs:1000},initialSummary:summary(initial),initial,admissionBudget:{maxStates:80000,maxMs:8000},admissionSummary:summary(cohort),cohort, childBudget:{maxStates:1000,maxMs:100},noUndo:true,replayedWins,certifiedLoses,summaries,rows};
writeFileSync(new URL('../docs/v04/experiment.json',import.meta.url),JSON.stringify(report,null,2));
writeFileSync(new URL('../output/playwright/v04-census-forks.json',import.meta.url),JSON.stringify(losingForks,null,2));
console.log(JSON.stringify({summaries,replayedWins,certifiedLoses}));

import assert from'node:assert/strict';
import{visiblePosition}from'../experimental/v06/src/game/visible.ts';
import{STRATEGIES,makeVisibleStrategy}from'../tests/support/v06-visible-strategies.mjs';
import{choiceMetrics,kindTraceMetrics,fullCanonical}from'../tests/support/v06-metrics.mjs';
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const summary=metrics=>({positions:metrics.length,rawLegalActionsMean:mean(metrics.map(m=>m.rawLegalActions)),meaningfulMovesMean:mean(metrics.map(m=>m.meaningfulMoves)),meaningfulDirectionsMean:mean(metrics.map(m=>m.meaningfulDirections)),activeVisibleKindsMean:mean(metrics.map(m=>m.activeVisibleKinds)),meaningfulKindsMean:mean(metrics.map(m=>m.meaningfulKinds)),positionsWith2MeaningfulKinds:metrics.filter(m=>m.meaningfulKinds>=2).length,shareWith2MeaningfulKinds:metrics.length?metrics.filter(m=>m.meaningfulKinds>=2).length/metrics.length:null,selfLoops:metrics.reduce((n,m)=>n+m.selfLoops,0),strictReverseCycles:metrics.reduce((n,m)=>n+m.strictReverseCycles,0)});
function prepare(level,engine){let state=engine.createGame({seed:level.id,columns:level.columns,solution:level.solution,algorithm:level.algorithm},level.difficulty,'benchmark');let normalizedReveals=0;for(let column=0;column<10;column++)if(!state.columns[column][0].open){const r=engine.applyAction(state,{type:'reveal',column,index:0});assert.ok(r.ok,r.reason);state=r.state;normalizedReveals++;}assert.equal(state.columns.flat().filter(t=>t.open).length,10);assert.equal(state.reserve.filter(Boolean).length,0);return{state,normalizedReveals};}
function play(level,engine,name,budget){
 const start=prepare(level,engine);let state=start.state,previousCanonical=null;const metrics=[],trace=[],kinds=[],meaningfulKinds=[];
 const policy=name==='certificate'?null:makeVisibleStrategy(name);let index=0,outcome='ACTION_LIMIT',groups=0,singles=0,reserveEntries=0,meaningfulTaken=0,meaningfulGroups=0;
 for(let moveIndex=0;moveIndex<budget;moveIndex++){
  if(engine.isVictory(state)){outcome='WIN';break;}
  const measurement=choiceMetrics(state,engine,previousCanonical);
  let action;if(name==='certificate'){
   while(index<level.solution.length&&level.solution[index].type==='reveal'&&state.columns[level.solution[index].column]?.[0]?.open)index++;
   action=level.solution[index++];if(!action){outcome='PROOF_EXHAUSTED';break;}
  }else action=policy.next(visiblePosition(state));
  if(!action){outcome=measurement.rawLegalActions===0?'NO_FORWARD_MOVE':'POLICY_EXHAUSTED';break;}
  if(action.type==='reveal'){const r=engine.applyAction(state,action);assert.ok(r.ok,r.reason);state=r.state;moveIndex--;continue;}
  const selected=measurement.choices.find(c=>JSON.stringify(c.action)===JSON.stringify(action));assert.ok(selected,'Policy/proof emitted illegal move');
  const result=engine.applyAction(state,action);assert.ok(result.ok,result.reason);assert.equal(engine.positionError(result.state,result.state.config),null);
  const {choices,...m}=measurement;metrics.push(m);kinds.push(selected.kind);if(selected.meaningful){meaningfulTaken++;meaningfulKinds.push(selected.kind);if(action.count>1)meaningfulGroups++;}
  if(action.count>1)groups++;else singles++;if(action.to.zone==='reserve')reserveEntries++;
  trace.push({move:moveIndex,kind:selected.kind,action,meaningful:selected.meaningful,phase:m.phase,meaningfulOptions:m.meaningfulMoves,meaningfulKinds:m.meaningfulKinds,rawLegal:m.rawLegalActions});
  previousCanonical=fullCanonical(state);state=result.state;
 }
 if(engine.isVictory(state))outcome='WIN';
 if(name==='certificate')assert.equal(outcome,'WIN',`Reference proof failed ${level.id}`);
 return{id:level.id,difficulty:level.difficulty,strategy:name,outcome,actionBudget:budget,normalizedStartReveals:start.normalizedReveals,certificateUsedForDecisions:name==='certificate',hiddenKindsUsedForPolicyDecisions:false,metrics:{...kindTraceMetrics(kinds),singles,groups,reserveEntries,meaningfulMovesTaken:meaningfulTaken,meaningfulGroups,meaningfulKindTrace:kindTraceMetrics(meaningfulKinds)},choices:{all:summary(metrics),early:summary(metrics.filter(m=>m.phase==='early')),middle:summary(metrics.filter(m=>m.phase==='middle')),late:summary(metrics.filter(m=>m.phase==='late'))},trace,choiceRecords:metrics};
}
export function benchmarkLevels(levels,engine,{version='unknown',policyBudget=300}={}){
 const games=[];for(const level of levels){for(const strategy of ['certificate',...STRATEGIES])games.push(play(level,engine,strategy,strategy==='certificate'?2000:policyBudget));}
 const aggregates=[];for(const difficulty of[1,2,3,4])for(const strategy of['certificate',...STRATEGIES]){
  const r=games.filter(g=>g.difficulty===difficulty&&g.strategy===strategy);if(!r.length)continue;const all=r.flatMap(g=>g.choiceRecords);
  aggregates.push({difficulty,strategy,games:r.length,outcomes:Object.fromEntries([...new Set(r.map(g=>g.outcome))].map(outcome=>[outcome,r.filter(g=>g.outcome===outcome).length])),maxSameKindRunMean:mean(r.map(g=>g.metrics.maxSameKindRun)),maxSameKindRunRange:[Math.min(...r.map(g=>g.metrics.maxSameKindRun)),Math.max(...r.map(g=>g.metrics.maxSameKindRun))],equalAdjacentFractionMean:mean(r.map(g=>g.metrics.equalAdjacentFraction).filter(v=>v!==null)),rolling12Mean:mean(r.map(g=>g.metrics.rolling12Mean).filter(v=>v!==null)),singlesMean:mean(r.map(g=>g.metrics.singles)),groupsMean:mean(r.map(g=>g.metrics.groups)),meaningfulGroupsMean:mean(r.map(g=>g.metrics.meaningfulGroups)),early:summary(all.filter(m=>m.phase==='early')),middle:summary(all.filter(m=>m.phase==='middle')),late:summary(all.filter(m=>m.phase==='late'))});
 }
 return{version,cohort:levels.map(l=>({id:l.id,difficulty:l.difficulty})),policyBudget,phaseDefinition:'Early10..36open tiles; middle37..72; late73..108. Initial10open normalized for both versions; initialmanualreveals are excluded.',meaningfulDefinition:'Actual-engine legal action; excluding full-position canonical selfloops and immediate exact reversal; with at least one observable progress flag: newtile reveal, wholefragment merge, emptycolumn creation or reservefreeing. Conservative operational measure, neither WIN/LOSE proof nor human usefulness.',policyIsolation:'Strategies receive ONLY masked visiblePosition; their API has no seed, ID, hidden kind, certificate or oracle. Full-state canonical analysis occurs separately and is not passed back. Independent tests throw on illicit reads.',limitations:'Frozen deterministic bots with bounded actions are not human playtests, success probabilities or proof of fun. POLICY_EXHAUSTED/ACTION_LIMIT are not LOSE. Certificate rows are omniscient reference traces and are separate from independent policy rows.',aggregates,games};
}

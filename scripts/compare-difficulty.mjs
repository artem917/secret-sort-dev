import { mkdirSync, writeFileSync } from 'node:fs';
import { generateLevel } from '../src/generator/level-generator.ts';
import { generateLevel as oldLevel } from '../tests/fixtures/v02/generator/level-generator.ts';
import * as current from '../src/game/game.ts';
import * as original from '../tests/fixtures/v02/game/game.ts';

// Fixed cohort, including every seed. Neither selection nor difficulty scoring
// uses whether a seed was easy for a strategy or gave a favourable result.
const cohort = Array.from({length:100},(_,i)=>`comparison-${i}`);
function layout(level){
  let transitions=0,maxRun=0,monoMass=0,minKinds=9,totalKinds=0,maxMajority=0;
  for(const col of level.columns){
    const counts=new Map();let last=-1,run=0;
    for(const tile of col){counts.set(tile.kind,(counts.get(tile.kind)??0)+1);if(tile.kind===last)run++;else{if(last!==-1)transitions++;run=1;last=tile.kind;}maxRun=Math.max(maxRun,run);}
    minKinds=Math.min(minKinds,counts.size);totalKinds+=counts.size;if(counts.size===1)monoMass+=col.length;maxMajority=Math.max(maxMajority,...counts.values());
  }
  return{transitions,meanKinds:totalKinds/10,minKinds,maxRun,monoMass,maxMajority};
}
function analyze(level,engine,adaptAuto=false){
  let state=engine.createGame(level,4),manualReveals=0,transfers=0,groupMoves=0,singleStreak=0,maxSingleStreak=0,choiceSum=0,multipleChoices=0;
  for(const action of level.solution){
    if(engine.isVictory(state))break;
    if(adaptAuto&&action.type==='reveal'&&state.columns[action.column][0]?.open)continue;
    if(action.type==='move'){
      const choices=new Set(engine.legalMoves(state).filter(m=>m.from.zone==='column'&&m.to.zone==='column').map(m=>`${m.from.index}:${m.to.index}`)).size;
      choiceSum+=choices;if(choices>=2)multipleChoices++;
      transfers++;if(action.count>1)groupMoves++;
      singleStreak=action.count===1?singleStreak+1:0;maxSingleStreak=Math.max(maxSingleStreak,singleStreak);
    }else manualReveals++;
    const result=engine.applyAction(state,action);
    if(!result.ok||engine.positionError(result.state,result.state.config))throw Error(`${level.seed}: invalid comparison path`);
    state=result.state;
  }
  if(!engine.isVictory(state))throw Error(`${level.seed}: comparison path did not win`);
  return{...layout(level),transfers,groupMoves,manualReveals,maxSingleStreak,meanLegalColumnPairs:choiceSum/transfers,multipleChoiceFraction:multipleChoices/transfers};
}
function summary(rows){return Object.fromEntries(Object.keys(rows[0]).map(key=>{const values=rows.map(row=>row[key]);return[key,{min:Math.min(...values),mean:Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(3)),max:Math.max(...values)}];}));}
const oldManual=[],oldAuto=[],newAuto=[];
for(const seed of cohort){const old=oldLevel(seed);oldManual.push(analyze(old,original));oldAuto.push(analyze(old,current,true));newAuto.push(analyze(generateLevel(seed),current));}
const report={baseline:'e05fd6c0b56e9d6a8c12e05c5367b70dd3df1766',cohort,oldOriginal:summary(oldManual),oldWithAutoReveal:summary(oldAuto),new:summary(newAuto),limits:['Structural and certificate metrics are not a measure of human enjoyment or guaranteed fair hidden-information difficulty.','Legal alternatives include reversible or strategically bad moves.','32 fixed structural templates plus deterministic symmetry permutations; not uniform arbitrary shuffling.'],perSeed:cohort.map((seed,i)=>({seed,oldManual:oldManual[i],oldAuto:oldAuto[i],new:newAuto[i]}))};
mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/v03-difficulty.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({sample:cohort.length,oldOriginal:report.oldOriginal,oldWithAutoReveal:report.oldWithAutoReveal,new:report.new},null,2));

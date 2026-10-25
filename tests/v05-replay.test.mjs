import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayPlayer } from '../experimental/v05/src/replay/player.ts';
import { generateDeal } from '../experimental/v05/src/generator/level-generator.ts';
import { levelFor, validateDeal, sealDeal } from '../experimental/v05/src/game/deal.ts';
import { createGame, applyAction, isVictory } from '../experimental/v05/src/game/game.ts';
import { loadSession, saveSession, SESSION_KEY } from '../experimental/v05/src/game/session.ts';
import { saveRecords, recordVictory, emptyRecords, RECORDS_KEY } from '../experimental/v05/src/game/storage.ts';
import {readFileSync} from 'node:fs';

class FakeClock {
  jobs=new Map();serial=0;now=0;
  set(fn,ms){const id=++this.serial;this.jobs.set(id,{fn,at:this.now+ms});return id;}
  clear(id){this.jobs.delete(id);}
  next(){const entry=[...this.jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)return false;this.jobs.delete(entry[0]);this.now=entry[1].at;entry[1].fn();return true;}
  all(limit=10000){for(let i=0;i<limit&&this.next();i++);assert.equal(this.jobs.size,0);}
}
const portFor=()=>{const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const pos=s=>({columns:s.columns,reserve:s.reserve});
test('v05 session stores original108order,algorithm,ID,SHA256andtrace acrossF5; repeatusespersistedsource',async()=>{
  const deal=await generateDeal('persist-original',3),port=portFor();let game=createGame(levelFor(deal),3,'live');
  const revealed=applyAction(game,{type:'reveal',column:0,index:0});assert.ok(revealed.ok);game=revealed.state;
  const moved=applyAction(game,{type:'move',from:{zone:'column',index:0},to:{zone:'reserve',index:0},count:1});assert.ok(moved.ok);game=moved.state;
  assert.ok(saveSession(port,game,deal,'surrendered'));
  const restored=await loadSession(port);assert.deepEqual(restored.game,game);assert.deepEqual(restored.deal,deal);assert.equal(restored.disposition,'surrendered');
  assert.deepEqual(createGame(levelFor(restored.deal),3).columns,deal.columns);
  const undo=applyAction(restored.game,{type:'undo'});assert.ok(undo.ok);assert.deepEqual(pos(undo.state),pos(revealed.state));
  for(const key of ['secret-sort:game:v2','secret-sort:v04:session:v1','secret-sort:v04:game:v2'])assert.equal(port.getItem(key),null);
});
test('v05 missing/corrupted replay data disables solution while preserving validlivegame',async()=>{
  const deal=await generateDeal('corruption',2),game=createGame(levelFor(deal),2),port=portFor();
  for(const mutate of [d=>{delete d.solution;},d=>{d.solution[0].column=99;},d=>{d.columns[0][0].open=true;},d=>{d.algorithmVersion=2;},d=>{d.integrity='0'.repeat(64);},d=>{d.certificate.capacity=13;}]){
    const d=structuredClone(deal);mutate(d);assert.ok(saveSession(port,game,d,'surrendered'));
    const loaded=await loadSession(port);assert.deepEqual(loaded.game,game);assert.equal(loaded.deal,null);assert.ok(loaded.solutionReason);
  }
  assert.equal((await validateDeal(null)).ok,false);
});
test('v05 resealedforgedtrace andlowerbound stillfail independently ofchecksum',async()=>{
  const d=await generateDeal('re-sealed',4);
  for(const mutate of [x=>{x.solution=[];},x=>{x.certificate.gatePrefixes[0]++;},x=>{x.solution.find(a=>a.type==='move').count=0;}]){
    const changed=structuredClone(d);mutate(changed);const signed=await sealDeal(changed);assert.equal((await validateDeal(signed)).ok,false);
  }
});
test('v05 replay runsactualengine toWIN onisolatedframes forALL4classes, no storageorrecordchanges',async()=>{
  for(let k=1;k<=4;k++){
    const deal=await generateDeal('replay-'+k,k),port=portFor(),game=createGame(levelFor(deal),k,'live');saveSession(port,game,deal,'surrendered');saveRecords(port,emptyRecords());
    const before=port.getItem(SESSION_KEY),beforeRecords=port.getItem(RECORDS_KEY),clock=new FakeClock(),views=[];
    const player=new ReplayPlayer(levelFor(deal),k,v=>views.push(v),false,clock);assert.ok(player.view.state.columns.flat().every(t=>!t.open));
    player.setSpeed(4);player.play();clock.all();
    assert.equal(player.view.index,deal.solution.length);assert.equal(player.view.phase,'won');assert.equal(player.view.playing,false);assert.ok(isVictory(player.view.state));
    assert.ok(views.some(v=>v.selection?.count>1));assert.ok(views.some(v=>v.effect?.autoRevealId!==null&&v.effect?.autoRevealId!==undefined));
    assert.equal(port.getItem(SESSION_KEY),before);assert.equal(port.getItem(RECORDS_KEY),beforeRecords);assert.equal(game.result,null);player.close();
  }
});
test('v05 pause, back/forward,Restart,speeds andClose cancel timers and preserveexactframes',async()=>{
  const deal=await generateDeal('player-controls',1),clock=new FakeClock(),player=new ReplayPlayer(levelFor(deal),1,()=>{},false,clock);
  player.play();assert.equal(player.view.phase,'selected');assert.equal([...clock.jobs.values()][0].at,160);
  player.pause();assert.equal(clock.jobs.size,0);assert.equal(player.view.index,0);
  player.setSpeed(4);player.next();assert.equal([...clock.jobs.values()][0].at,40);clock.all();assert.equal(player.view.index,1);
  const one=player.view.state;player.next();clock.all();assert.equal(player.view.index,2);player.previous();assert.deepEqual(player.view.state,one);
  player.restart();assert.equal(player.view.index,0);assert.ok(player.view.state.columns.flat().every(t=>!t.open));
  player.play();clock.next();assert.equal(player.view.phase,'moving');player.pause();assert.equal(clock.jobs.size,0);assert.equal(player.view.index,1);
  player.play();player.close();assert.equal(clock.jobs.size,0);const index=player.view.index;clock.all();player.next();assert.equal(player.view.index,index);
});
test('v05 reducedmotion usesno movingdelay andcorrupttrace cannotinstantiate fakewinner',async()=>{
  const deal=await generateDeal('reduce-motion',1),clock=new FakeClock(),player=new ReplayPlayer(levelFor(deal),1,()=>{},true,clock);
  player.play();assert.equal([...clock.jobs.values()][0].at,0);player.close();
  assert.throws(()=>new ReplayPlayer({...levelFor(deal),solution:[]},1,()=>{}));
  const invalid=levelFor(deal);invalid.solution[0]={type:'move',from:{zone:'column',index:0},to:{zone:'reserve',index:0},count:1};assert.throws(()=>new ReplayPlayer(invalid,1,()=>{}));
});
test('v05 F5 retains ONLY a reverified lossproof and nevertrusts anunsupported LOSEflag',async()=>{
  const w=JSON.parse(readFileSync(new URL('./fixtures/v05/risk-witnesses.json',import.meta.url)))[0],deal=await generateDeal(w.seed,1),port=portFor();
  let game=createGame(levelFor(deal),1);for(const action of [...w.prefix,w.bad]){const n=applyAction(game,action);assert.ok(n.ok);game=n.state;}
  saveSession(port,game,deal,'proven-lose',w.lose.closedProof);const restored=await loadSession(port);assert.equal(restored.disposition,'proven-lose');assert.ok(restored.lossProof);
  const damaged=structuredClone(w.lose.closedProof);damaged.keys.pop();saveSession(port,game,deal,'proven-lose',damaged);
  assert.equal((await loadSession(port)).disposition,'playing');saveSession(port,game,deal,'proven-lose');assert.equal((await loadSession(port)).disposition,'playing');
  saveSession(port,game,{...deal,integrity:'0'.repeat(64)},'proven-lose');assert.equal((await loadSession(port)).disposition,'playing');
});

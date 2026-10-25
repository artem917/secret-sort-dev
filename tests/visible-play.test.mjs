import test from 'node:test';
import assert from 'node:assert/strict';
import { visiblePosition } from '../src/game/visible.ts';
import { generateLevel } from '../src/generator/level-generator.ts';
import { createGame, applyAction, isVictory, positionError } from '../src/game/game.ts';
import { createVisibleExplorer } from './support/visible-policy.mjs';

test('visible projection contains no IDs, seed, certificate or concealed kind',()=>{
  const state=createGame(generateLevel('visible-projection'));
  const visible=visiblePosition(state);
  assert.deepEqual(Object.keys(visible).sort(),['columns','reserve']);
  assert.ok(visible.columns.flat().every(t=>t.kind===-1&&t.open===false));
  assert.ok(visible.columns.flat().every(t=>Object.keys(t).sort().join(',')==='kind,open'));
  assert.deepEqual(visible,visiblePosition(createGame(generateLevel('different-hidden-layout'))));
});
test('12 ordinary games finish by observing actual moves, without certificate input',()=>{
  let reserveEntries=0,groups=0;
  for(let i=0;i<12;i++){
    let state=createGame(generateLevel(`mixed-v3-${i}`));const player=createVisibleExplorer(600,80);
    for(let step=0;step<600;step++){
      const visible=visiblePosition(state);
      assert.ok(visible.columns.flat().filter(t=>!t.open).every(t=>t.kind===-1));
      const action=player.next(visible);
      if(!action)break;
      if(action.type==='move'){if(action.to.zone==='reserve')reserveEntries++;if(action.count>1)groups++;}
      const result=applyAction(state,action);assert.equal(result.ok,true,result.reason);state=result.state;
      assert.equal(positionError(state,state.config),null);
    }
    assert.equal(player.status,'win');assert.equal(isVictory(state),true);
  }
  assert.ok(reserveEntries>0);assert.ok(groups>600);
});

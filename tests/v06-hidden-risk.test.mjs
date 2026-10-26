import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{generateDeal}from'../experimental/v06/src/generator/level-generator.ts';import{levelFor,validateDeal}from'../experimental/v06/src/game/deal.ts';import{createGame,applyAction,isVictory,legalMoves}from'../experimental/v06/src/game/game.ts';import{visiblePosition}from'../experimental/v06/src/game/visible.ts';import{verifyClosedProof}from'../experimental/v06/src/solver/solver.ts';
test('v06 admitted identical visible starts conceal a genuine WIN/LOSE fork for the same legal choice',async()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/v06/hidden-ambiguity.json',import.meta.url))),good=await generateDeal(f.winning,1),bad=await generateDeal(f.losing,1);assert.ok((await validateDeal(good)).ok);assert.ok((await validateDeal(bad)).ok);
 const a=createGame(levelFor(good),1),b=createGame(levelFor(bad),1);assert.deepEqual(visiblePosition(a),visiblePosition(b));
 let win=applyAction(a,f.action),lose=applyAction(b,f.action);assert.ok(win.ok);assert.ok(lose.ok);
 for(const action of f.winningChildSolution){win=applyAction(win.state,action);assert.ok(win.ok);}assert.ok(isVictory(win.state));
 assert.equal(f.losingClosedProof.keys.length,64);assert.ok(verifyClosedProof(lose.state,f.losingClosedProof));assert.ok(legalMoves(lose.state).length>0);
 const undo=applyAction(lose.state,{type:'undo'});assert.ok(undo.ok);assert.deepEqual(undo.state.columns,b.columns);
});

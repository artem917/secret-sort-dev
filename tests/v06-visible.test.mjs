import test from 'node:test';import assert from 'node:assert/strict';
import{allTemplates,columnsForTemplate,solutionForTemplate}from'../experimental/v06/src/generator/interleaved-data.ts';
import{benchmarkLevels}from'../scripts/benchmark-v06.mjs';import*as engine from'../experimental/v06/src/game/game.ts';
test('v06 fixed mixed class1 candidate is independently winnable by all three visible-only policies',()=>{
 const t=allTemplates().find(t=>t.id==='policy-guided-r1-rotate-0');assert.ok(t,'admit a fixed visible-policy verified candidate');
 const r=benchmarkLevels([{id:t.id,difficulty:1,columns:columnsForTemplate(t),solution:solutionForTemplate(t),algorithm:'reserve-proof-v6'}],engine);
 for(const game of r.games){assert.equal(game.outcome,'WIN');if(game.strategy!=='certificate')assert.equal(game.certificateUsedForDecisions,false);}
});

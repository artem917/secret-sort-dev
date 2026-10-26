import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{templateById,columnsForTemplate,solutionForTemplate}from'../experimental/v06/src/generator/interleaved-data.ts';import{verifyWinTrace}from'../experimental/v06/src/generator/barrier.ts';
test('v06 independent initial-kind alternatives have31 real-engine winning continuations',()=>{
 const alternatives=JSON.parse(readFileSync(new URL('./fixtures/v06/alternative-wins.json',import.meta.url)));assert.equal(alternatives.length,31);const kinds=new Map();
 for(const row of alternatives){const t=templateById(row.id);assert.ok(t);const solution=solutionForTemplate({...t,solution:row.solution});assert.ok(verifyWinTrace(columnsForTemplate(t),solution,row.k).ok,row.id);if(!kinds.has(row.id))kinds.set(row.id,new Set());kinds.get(row.id).add(row.kind);}
 assert.equal([...kinds.values()].filter(k=>k.size===2).length,14);
});

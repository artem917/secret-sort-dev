import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const target=process.env.SECRET_SORT_TARGET??'v06';
const module=await import(`../experimental/${target}/src/generator/${target==='v05'?'barrier':'ports-barrier'}.ts`);
const check=target==='v05'?module.verifyBarrier:module.verifyPortsBarrier;
const cases=JSON.parse(readFileSync(new URL('./fixtures/v06/four-starts.json',import.meta.url)));
test('v06 lower certificate accepts two simultaneously active surface kinds with buried copies',()=>{
  for(const c of cases){
    assert.equal(c.root.columns.flat().filter(t=>t.open).length,10);
    assert.equal(new Set(c.root.columns.map(p=>p[0].kind)).size,8);
    const proof=check(c.root.columns,c.certificate,c.required-1);
    assert.ok(proof.ok,proof.reason);assert.ok(proof.duplicatedKinds>=2);assert.ok(proof.minimumFloor>=c.required);
  }
});

async(page)=>{
 const u=new URL(page.url()),base=u.origin+u.pathname,reports=[];
 for(const k of [1,2,3,4]){
  const [width,height]=k===1?[1366,768]:k===2?[320,568]:k===3?[768,1024]:[390,844];
  const ctx=await page.context().browser().newContext({viewport:{width,height},isMobile:width<680,hasTouch:true,reducedMotion:'reduce'}),p=await ctx.newPage(),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await ctx.addInitScript(()=>localStorage.setItem('secret-sort:v06:settings:v1',JSON.stringify({sound:false,animations:false,reserveCapacity:1,tutorialSeen:true})));
  const cmd=n=>p.locator(`[data-command="${n}"]`).filter({visible:true}),snap=()=>p.evaluate(()=>window.__secretSortV06.snapshot());
  const tap=async l=>{if(width<680)await l.tap();else await l.click();},check=(ok,label)=>{if(!ok)throw Error('class'+k+' '+label);checks.push(label);},position=g=>JSON.stringify({columns:g.columns,reserve:g.reserve});
  const cell=(i,n=0)=>p.locator(`.cell[data-zone="column"][data-place="${i}"][data-index="${n}"]`),slot=i=>p.locator(`.cell[data-zone="reserve"][data-place="${i}"]`);
  const execute=async a=>{await tap(a.from.zone==='column'?cell(a.from.index,a.count-1):slot(a.from.index));await tap(a.to.zone==='column'?p.locator(`.column-heading[data-place="${a.to.index}"]`):slot(a.to.index));};
  await p.goto(base+'?qa=1&mode='+k+'&seed=browser-fixed-'+k);await tap(cmd('play'));await p.locator('.board').waitFor();
  const initial=await snap(),deal=await p.evaluate(()=>window.__secretSortV06.deal());
  check(initial.game.columns.flat().filter(t=>t.open).length===10&&initial.game.history.length===0,'ten open,98closed andzero initialactions');
  check(await p.locator('.closed[data-tile-id]').count()===0,'no concealed kind/ID inDOM');check(!/seed|сертификат|sha-256|невозможно победить/i.test(await p.locator('body').innerText()),'no technical fields or solver forecast');
  if(k===1){await cell(0).focus();await p.keyboard.press('Enter');check(!!(await snap()).selection,'keyboard selects already open top');await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.activeElement.dataset.place)==='1','keyboard arrow navigates');await p.keyboard.press('Escape');}
  await execute(deal.solution[0]);const moved=await snap();check(moved.game.history.length===1&&moved.game.history[0].autoRevealedId!==null,'move plus exactoneautoReveal');
  check(await p.locator('.can-receive').count()===0,'no permanent target highlighting');await tap(cmd('undo'));check(position((await snap()).game)===position(initial.game),'atomic Undo restores exact start');
  await tap(cmd('restart'));await tap(cmd('confirm-restart'));check(position((await snap()).game)===position(initial.game),'repeat identical108tiles andopen mask');
  await execute(deal.solution[0]);const saved=await snap();await p.reload();await tap(cmd('continue'));check(position((await snap()).game)===position(saved.game),'actualreload restores state');
  await tap(cmd('pause'));await tap(cmd('surrender'));await tap(cmd('confirm-surrender'));check((await snap()).disposition==='surrendered','only voluntary surrender ends loss');
  await tap(cmd('replay-open'));let r=(await snap()).replay;check(r.index===0&&r.state.columns.flat().filter(t=>t.open).length===10,'replay has same initial tenopen');
  const live=JSON.stringify((await snap()).game),records=JSON.stringify((await snap()).records),storage=await p.evaluate(()=>localStorage.getItem('secret-sort:v06:session:v2'));
  await tap(cmd('replay-next'));await p.waitForFunction(()=>window.__secretSortV06.snapshot().replay.index===1&&window.__secretSortV06.snapshot().replay.phase==='ready');
  check((await snap()).replay.state.transfers===1,'replay first step is transfer');await tap(cmd('replay-back'));check((await snap()).replay.state.columns.flat().filter(t=>t.open).length===10,'back preserves initialopen');
  await tap(p.locator('[data-command="replay-speed"][data-value="4"]'));await tap(cmd('replay-toggle'));await p.waitForFunction(()=>window.__secretSortV06.snapshot().replay.index>=4);await tap(cmd('replay-toggle'));const index=(await snap()).replay.index;await p.waitForTimeout(160);check((await snap()).replay.index===index,'Pause cancels progress');
  await tap(cmd('replay-restart'));await tap(cmd('replay-toggle'));await p.waitForFunction(()=>window.__secretSortV06.snapshot().replay.phase==='won',undefined,{timeout:30000});
  r=(await snap()).replay;check(r.state.result&&r.state.reserve.every(t=>!t)&&r.state.columns.filter(c=>!c.length).length===1&&r.index===deal.solution.length,'true9x12WIN inreplay');
  await p.screenshot({path:'output/playwright/v06/replay-win-r'+k+'.png'});await tap(cmd('replay-close').last());
  check(JSON.stringify((await snap()).game)===live&&JSON.stringify((await snap()).records)===records&&await p.evaluate(()=>localStorage.getItem('secret-sort:v06:session:v2'))===storage,'replay neverchanges livegame,records,save');
  check(errors.length===0,'no runtime/resource errors');reports.push({k,width,height,checks,errors,transfers:r.state.transfers});await ctx.close();
 }
 return{passed:true,reports};
}

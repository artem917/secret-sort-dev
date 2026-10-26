async(page)=>{
 const u=new URL(page.url()),base=u.origin+u.pathname,reports=[];
 const cases=[['policy-guided-r1-rotate-0',1,'information-first',390,844],['policy-guided-r1-rotate-0',1,'space-first',1366,768],['policy-guided-r1-rotate-0',1,'rotate-kinds',320,568],['cross-r2-14',2,'rotate-kinds',360,740],['cross-r3-2',3,'information-first',768,1024],['frontier-r4-2',4,'space-first',412,915]];
 for(const [seed,k,strategy,width,height] of cases){
  const ctx=await page.context().browser().newContext({viewport:{width,height},isMobile:width<680,hasTouch:true});await ctx.addInitScript({path:'tests/support/v06-visible-strategies.browser.js'});await ctx.addInitScript(()=>localStorage.setItem('secret-sort:v06:settings:v1',JSON.stringify({sound:false,animations:false,reserveCapacity:1,tutorialSeen:true})));
  const p=await ctx.newPage(),errors=[],actions=[];p.on('pageerror',e=>errors.push(e.message));const snap=()=>p.evaluate(()=>window.__secretSortV06.snapshot());
  await p.goto(`${base}?qa=1&mode=${k}&seed=${seed}`);await p.locator('[data-command="play"]').click();await p.locator('.board').waitFor();await p.evaluate(name=>{window.__blindPlayer=window.__v06VisibleStrategies.make(name);},strategy);
  let outcome='ACTION_LIMIT',groups=0;
  for(let i=0;i<180;i++){
   const before=await snap();if(before.game.result){outcome='WIN';break;}if(before.disposition!=='playing'||before.modal)throw Error('automatic stop during independent play');
   const action=await p.evaluate(()=>window.__blindPlayer.next(window.__secretSortV06.visible()));if(!action){outcome='POLICY_EXHAUSTED';break;}
   const source=p.locator(action.from.zone==='column'?`.cell[data-zone="column"][data-place="${action.from.index}"][data-index="${action.count-1}"]`:`.cell[data-zone="reserve"][data-place="${action.from.index}"]`);
   const target=p.locator(action.to.zone==='column'?`.column-heading[data-place="${action.to.index}"]`:`.cell[data-zone="reserve"][data-place="${action.to.index}"]`);
   if(width<680){await source.tap();await target.tap();}else{await source.click();await target.click();}
   const after=await snap();if(after.game.transfers!==before.game.transfers+1)throw Error('real input did not transfer '+JSON.stringify(action));if(action.count>1)groups++;actions.push(action);
   if(i===25)await p.screenshot({path:`output/playwright/v06/visible-${strategy}-r${k}-mid.png`});
  }
  const end=await snap();if(end.game.result)outcome='WIN';if(errors.length)throw Error(errors.join('\n'));await p.screenshot({path:`output/playwright/v06/visible-${strategy}-r${k}-${outcome}.png`});
  reports.push({seed,k,strategy,width,height,outcome,transfers:end.game.transfers,groups,opened:end.game.columns.flat().filter(t=>t.open).length+end.game.reserve.filter(Boolean).length,liveRecordWins:end.records.wins,certificateRead:false,hiddenKindsUsed:false,errors,actions});await ctx.close();
 }
 return{passed:true,method:'Real mouse/touch actions; decisions consume only masked visiblePosition. No certificate/replay/seed passed to the policy.',reports};
}

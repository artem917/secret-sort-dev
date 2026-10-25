async (page)=>{
  const u=new URL(page.url()),base=`${u.origin}${u.pathname}`,root=base.replace(/v05\/$/,''),phase=u.hostname.includes('github.io')?'published-v05':'local-v05';
  const context=await page.context().browser().newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true}),p=await context.newPage(),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const cmd=name=>p.locator(`[data-command="${name}"]`).filter({visible:true});
  const check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);};
  try{
    for(const path of [root,`${root}v04/`]){
      await p.goto(`${path}?qa=1&seed=shuffle-1`);await cmd('play').tap();await p.getByRole('button',{name:'Пропустить',exact:true}).tap();
    }
    const old=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('secret-sort:v05:'))));
    await p.goto(`${base}?qa=1&mode=1&seed=perturbed-r1-11`);await cmd('play').tap();await p.getByRole('button',{name:'Пропустить',exact:true}).tap();
    await cmd('pause').tap();await cmd('surrender').tap();await cmd('confirm-surrender').tap();
    const before=await p.evaluate(()=>window.__secretSortV05.snapshot().game);
    // Deliberate persistence mutation tests a real corrupted save, never a
    // synthetic victory. The current game is left entirely unchanged.
    await p.evaluate(()=>{const key='secret-sort:v05:session:v1',data=JSON.parse(localStorage.getItem(key));data.deal.solution[0].column=99;localStorage.setItem(key,JSON.stringify(data));});
    await p.reload();check(await cmd('replay-open').isDisabled(),'damaged persisted solution disabled in menu');
    check((await p.locator('body').innerText()).includes('повреждено'),'honest corruption reason shown');
    const loaded=await p.evaluate(()=>window.__secretSortV05.snapshot());check(JSON.stringify(loaded.game)===JSON.stringify(before),'valid game preserved when trace is corrupt');
    await cmd('continue').tap();check(await p.getByRole('button',{name:'Показать правильное решение',exact:true}).isDisabled(),'ended dialog cannot play invalid certificate');
    check(await p.getByRole('button',{name:'Повторить раскладку',exact:true}).isDisabled(),'cannot silently regenerate a different source when original integrity fails');
    check(await p.locator('.replay-screen').count()===0,'no fake solution displayed');
    await p.screenshot({path:`output/playwright/${phase}-damaged-certificate.png`});
    await cmd('new').last().tap();await p.locator('[data-command="choose-mode"][data-value="3"]').tap();await cmd('confirm-new').tap();await p.locator('.board').waitFor();
    await p.waitForFunction(()=>window.__secretSortV05.snapshot().game.config.reserveCapacity===3);
    check((await p.evaluate(()=>window.__secretSortV05.snapshot())).solutionAvailable,'new selected mode restores valid certified deal');
    const after=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('secret-sort:v05:'))));const changed=[...new Set([...Object.keys(old),...Object.keys(after)])].filter(key=>old[key]!==after[key]);check(changed.length===0,'v03 andv04 actual saves/settings/records remain byte-identical: '+changed.join(','));
    await p.goto(base);check(await p.evaluate(()=>typeof window.__secretSortV05)==='undefined','QA oracle absent on ordinaryURL');
    check(!/seed|сертификат|SHA-256/i.test(await p.locator('.menu-card').innerText()),'normal difficulty UI has no technical parameters');
    check(errors.length===0,'no console errors');
    return{phase,passed:true,checks,errors};
  }finally{await context.close();}
}

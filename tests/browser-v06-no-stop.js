async(page)=>{
  const u=new URL(page.url()),base=`${u.origin}${u.pathname}`,isOld=u.pathname.includes('/v05/'),api=isOld?'__secretSortV05':'__secretSortV06';
  const context=await page.context().browser().newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  await context.addInitScript({path:'tests/support/v05-browser-fixtures.browser.js'});
  if(!isOld) await context.addInitScript({path:'tests/support/v06-legacy-session.browser.js'});
  const p=await context.newPage(),checks=[];
  const command=name=>p.locator(`[data-command="${name}"]`).filter({visible:true});
  const snap=()=>p.evaluate(api=>window[api].snapshot(),api);
  const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
  const cell=(c,i=0)=>p.locator(`.cell[data-zone="column"][data-place="${c}"][data-index="${i}"]`),slot=i=>p.locator(`.cell[data-zone="reserve"][data-place="${i}"]`);
  async function execute(a){if(a.type==='reveal')await cell(a.column).tap();else{await(a.from.zone==='column'?cell(a.from.index,a.count-1):slot(a.from.index)).tap();await(a.to.zone==='column'?p.locator(`.column-heading[data-place="${a.to.index}"]`):slot(a.to.index)).tap();}}
  try{
    await p.goto(`${base}?qa=1&mode=1&seed=perturbed-r1-11`);if(isOld){await command('play').tap();await p.getByRole('button',{name:'Пропустить',exact:true}).tap();}else await command('continue').tap();
    const witness=await p.evaluate(()=>window.__v05RiskFixtures.find(w=>w.required===1));
    for(const a of isOld?witness.prefix:[]){if(a.type==='reveal'&&(await snap()).game.columns[a.column][0].open)continue;await execute(a);}
    await execute(witness.bad);
    await p.waitForFunction(api=>window[api].analysis()?.status==='LOSE',api,{timeout:10000});
    check((await snap()).disposition==='playing','a proved losing position remains playable');
    check(await p.locator('[role="dialog"]').count()===0,'no automatic loss or solution dialog');
    check(!/победить.*невозможно|продолжения до победы нет/i.test(await p.locator('body').innerText()),'no solver forecast in ordinary UI');
    const afterBad=await snap(),proof=await p.evaluate(api=>window[api].analysis(),api);check(proof.proofVerified===true&&proof.proofStates>0,'solver closed graph proof independently verified');
    for(let i=0;i<4;i++){
      // The witness's last move is reversible. Exercise a legal reserve cycle
      // without consulting its hidden colors or the winning certificate.
      const a=await p.evaluate(api=>{
        const p=window[api].visible(),locs=[...p.columns.map((_,index)=>({zone:'column',index})),...p.reserve.map((_,index)=>({zone:'reserve',index}))];
        const get=l=>l.zone==='column'?p.columns[l.index]:p.reserve[l.index]?[p.reserve[l.index]]:[];
        for(const from of locs)for(const to of locs){if(from.zone===to.zone&&from.index===to.index)continue;const a=get(from),b=get(to);
          if(!a[0]?.open)continue;if(to.zone==='reserve'&&!b.length||to.zone==='column'&&b.length<12&&(!b.length||b[0].open&&b[0].kind===a[0].kind))return{type:'move',from,to,count:1};}
      },api),before=(await snap()).game.transfers;
      check(!!a,'visible legal action exists '+i);await execute(a);
      check((await snap()).game.transfers===before+1,'legal continuation '+(i+1));
    }
    const continued=await snap();
    await p.reload();const q=p;await command('continue').tap();
    const resumed=await q.evaluate(api=>window[api].snapshot(),api);
    check(resumed.disposition==='playing'&&resumed.modal===null,'F5/resume has no forced ending');
    check(JSON.stringify(resumed.game.columns)===JSON.stringify(continued.game.columns),'saved board exactly restored');
    await q.locator('[data-command="undo"]').tap();
    check((await q.evaluate(api=>window[api].snapshot(),api)).game.undos===continued.game.undos+1,'Undo works after resume');
    await q.screenshot({path:'output/playwright/v06/no-forced-stop.png'});
    return{passed:true,checks,solverVerified:proof.proofVerified,continuedTransfers:continued.game.transfers};
  }finally{await context.close();}
}

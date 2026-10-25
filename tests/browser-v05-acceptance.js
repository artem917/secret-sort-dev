async (page) => {
  const u=new URL(page.url()),base=`${u.origin}${u.pathname}`,phase=u.hostname.includes('github.io')?'published-v05':'local-v05';
  const chosen=Number(u.searchParams.get('acceptClass')),reports=[];
  for(const k of chosen?[chosen]:[1,2,3,4]){
    const sizes={1:[1366,768],2:[320,568],3:[768,1024],4:[390,844]},[width,height]=sizes[k],touch=k===2||k===4,reduced=k===4;
    const context=await page.context().browser().newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:reduced?'reduce':'no-preference'});
    await context.addInitScript({path:'tests/support/v05-browser-fixtures.browser.js'});
    let stage='start';
    const p=await context.newPage(),checks=[],errors=[],failed=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('requestfailed',r=>failed.push(r.url()));p.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    const check=(ok,name)=>{if(!ok)throw Error(`class${k}: ${name}`);checks.push(name);};
    const snap=()=>p.evaluate(()=>window.__secretSortV05.snapshot());
    const cmd=name=>p.locator(`[data-command="${name}"]`).filter({visible:true});
    const press=async locator=>{if(touch)await locator.tap();else await locator.click();};
    const tile=(col,index=0)=>p.locator(`.cell[data-zone="column"][data-place="${col}"][data-index="${index}"]`);
    const slot=i=>p.locator(`.cell[data-zone="reserve"][data-place="${i}"]`);
    const pos=s=>JSON.stringify({columns:s.game.columns,reserve:s.game.reserve});
    const saved=()=>p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('secret-sort:'))));
    async function execute(a){if(a.type==='reveal')await press(tile(a.column));else{await press(a.from.zone==='column'?tile(a.from.index,a.count-1):slot(a.from.index));await press(a.to.zone==='column'?p.locator(`.column-heading[data-place="${a.to.index}"]`):slot(a.to.index));}}
    const waitReplay=async index=>{await p.waitForFunction(index=>{const r=window.__secretSortV05.snapshot().replay;return r?.index===index&&(r.phase==='ready'||r.phase==='won');},index);};
    try{
      await p.goto(`${base}?qa=1&mode=${k}`);const w=await p.evaluate(k=>window.__v05RiskFixtures.find(w=>w.required===k),k);
      await p.goto(`${base}?qa=1&mode=${k}&seed=${w.seed}`);await press(cmd('play'));await press(p.getByRole('button',{name:'Пропустить',exact:true}));
      const initial=await snap(),source=await p.evaluate(()=>window.__secretSortV05.deal());
      check(initial.game.reserve.length===k&&initial.difficulty===k,'correct free reserve capacity and chosen mode');
      check(await p.locator('.board .closed').count()===108&&await p.locator('.closed[data-tile-id]').count()===0,'108 hidden tiles, no hidden kind/ID inDOM');
      check(!/seed|сертификат|sha-256/i.test(await p.locator('body').innerText()),'ordinary UI has no technical seed/certificate input');
      await press(cmd('settings'));await p.locator('[data-setting="sound"]').uncheck();if(!reduced)await p.locator('[data-setting="animations"]').uncheck();await press(cmd('close').first());
      if(k===1){await tile(0).focus();await p.keyboard.press('Enter');check((await snap()).game.columns[0][0].open,'keyboard Enter reveals');await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.activeElement.dataset.place)==='1','arrow keyboard navigation');}
      else await press(tile(0));
      const before=await snap();await press(tile(0));check(await p.locator('.can-receive').count()===0,'no persistent destination highlight');await press(slot(0));
      const moved=await snap();check(moved.game.history.length===before.game.history.length+1&&moved.game.columns[0][0].open,'autoReveal shares one move');
      await press(cmd('undo'));check(pos(await snap())===pos(before),'oneUndo recloses autoReveal');
      await press(cmd('restart'));await press(cmd('confirm-restart'));check(pos(await snap())===pos(initial),'repeat exact order of all108 from persisted original');
      for(const a of w.prefix)await execute(a);const parent=await snap();
      await execute(w.bad);await p.getByRole('heading',{name:'Продолжения до победы нет'}).waitFor({timeout:15000});
      check((await snap()).disposition==='proven-lose','real worker proves forwardLOSE, not cyclic move availability');
      const oracle=await p.evaluate(()=>window.__secretSortV05.analysis());check(oracle.status==='LOSE'&&oracle.proofStates>0,'checked closed proof received');
      await p.screenshot({path:`output/playwright/${phase}-class-${k}-proved-lose.png`});
      if(k===2){await p.reload();await press(cmd('continue'));check((await snap()).disposition==='proven-lose','F5 independently revalidates persisted lossproof');}
      await press(p.getByRole('button',{name:'Отменить последний ход',exact:true}));check(pos(await snap())===pos(parent),'Undo from loss dialog restores exactWIN parent');
      for(const a of w.winning)await execute(a);const won=await snap();
      check(!!won.game.result&&won.records.wins===1,'actual mouse/touch win atcapacityk counted once');
      await p.screenshot({path:`output/playwright/${phase}-class-${k}-live-win.png`});
      await press(cmd('inspect-win'));await press(cmd('restart'));await press(cmd('confirm-restart'));check(pos(await snap())===pos(initial),'repeat after win retains original hidden order');
      if(k===1){
        const g=await p.evaluate(()=>window.__v05GroupRisk);for(const a of g.prefix)await execute(a);const groupParent=await snap();
        await execute(g.bad);await p.getByRole('heading',{name:'Продолжения до победы нет'}).waitFor({timeout:15000});
        check((await p.evaluate(()=>window.__secretSortV05.analysis())).proofStates===185,'choosing packet2 reaches independently proved185-stateLOSE');
        await press(p.getByRole('button',{name:'Отменить последний ход',exact:true}));check(pos(await snap())===pos(groupParent),'group-size mistake undone atomically');
        for(const a of g.goodContinuation)await execute(a);check(!!(await snap()).game.result,'sameports packet1 preserves realWIN');
        await press(cmd('inspect-win'));await press(cmd('restart'));await press(cmd('confirm-restart'));
      }
      await press(cmd('pause'));await press(cmd('surrender'));await press(cmd('confirm-surrender'));check((await snap()).disposition==='surrendered','voluntary surrender is separate from winning');
      await p.reload();await press(cmd('continue'));check((await snap()).disposition==='surrendered'&&(await snap()).solutionAvailable,'F5 preserves surrendered game and valid solution');
      check(JSON.stringify(await p.evaluate(()=>window.__secretSortV05.deal()))===JSON.stringify(source),'F5 restores original, algorithmVersion, trace,ID andintegrity');
      // Re-enable animation for motion acceptance (system reduced-motion stays honored).
      await press(cmd('close').first());await press(cmd('settings'));if(!reduced)await p.locator('[data-setting="animations"]').check();await press(cmd('close').first());await press(cmd('pause'));await press(cmd('close').first());
      // Menu is always an available route back to ended actions after inspection.
      await press(cmd('pause'));await press(cmd('menu'));await press(cmd('replay-open'));
      await p.locator('.replay-screen').waitFor();let state=await snap();check(JSON.stringify(state.replay.state.columns)===JSON.stringify(source.columns),'replay starts on isolated ORIGINALboard');
      const liveBefore=JSON.stringify(state.game),recordsBefore=JSON.stringify(state.records),storageBefore=JSON.stringify(await saved());
      stage='first replay step';await press(cmd('replay-next'));await waitReplay(1);check((await snap()).replay.state.columns.flat().filter(t=>t.open).length===1,'step forward executes real reveal');
      if(k===1){stage='keyboard replay forward';await p.keyboard.press('ArrowRight');await waitReplay(2);await p.keyboard.press('ArrowLeft');await waitReplay(1);checks.push('keyboard replay steps');}
      await press(cmd('replay-back'));await waitReplay(0);check((await snap()).replay.state.columns.flat().every(t=>!t.open),'step back restores exact prior hidden frame');
      for(const n of [2,4]){await press(p.locator(`[data-command="replay-speed"][data-value="${n}"]`));check((await snap()).replay.speed===n,`speed${n} selected`);}
      stage='play and pause';await press(cmd('replay-toggle'));await p.waitForFunction(()=>window.__secretSortV05.snapshot().replay.index>=3);await press(cmd('replay-toggle'));
      const paused=(await snap()).replay.index;await p.waitForTimeout(250);check((await snap()).replay.index===paused&&(await p.evaluate(()=>window.__secretSortV05.animations()))===0,'Pause stops timers and animations');
      await press(cmd('replay-restart'));check((await snap()).replay.index===0,'Restart resets replay');
      let motion=null;stage='motion group';
      if(k===1){
        await press(p.locator('[data-command="replay-speed"][data-value="1"]'));await press(cmd('replay-toggle'));
        await p.waitForFunction(()=>{const r=window.__secretSortV05.snapshot().replay;return r.phase==='selected'&&r.selection?.count>1;},{timeout:20000});
        check(await p.locator('.replay-board .cell.selected').count()>1,'visible semitransparent packet selection');
        await p.screenshot({path:`output/playwright/${phase}-replay-selected-packet.png`});
        await p.waitForFunction(()=>window.__secretSortV05.animations()>0&&window.__secretSortV05.snapshot().replay.phase==='moving');
        motion=await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').map(a=>({time:a.currentTime,transform:getComputedStyle(a.effect.target).transform})));
        check(motion.length>0,'actual WebAnimations move/flip frames');await press(cmd('replay-toggle'));
      }
      await press(cmd('replay-toggle'));await p.waitForFunction(()=>window.__secretSortV05.snapshot().replay.playing);await press(cmd('replay-close').last());
      check((await snap()).replay===null&&await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)===0,'Close cancels all animation/timer activity');
      check(JSON.stringify((await snap()).game)===liveBefore&&JSON.stringify((await snap()).records)===recordsBefore&&JSON.stringify(await saved())===storageBefore,'closed partial replay changes no save,game,counter,record');
      stage='full winning replay';await press(cmd('replay-open'));await press(p.locator('[data-command="replay-speed"][data-value="4"]'));await press(cmd('replay-toggle'));
      await p.waitForFunction(()=>window.__secretSortV05.snapshot().replay.phase==='won',undefined,{timeout:60000});
      state=await snap();check(state.replay.index===source.solution.length&&!!state.replay.state.result&&state.replay.state.reserve.every(t=>!t)&&state.replay.state.columns.filter(c=>!c.length).length===1,'replay reaches real9x12WIN with emptyreserve');
      if(reduced)check(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)===0,'reduced-motion has no running animations');
      await p.screenshot({path:`output/playwright/${phase}-class-${k}-replay-win.png`});
      await press(cmd('replay-close').last());check(JSON.stringify((await snap()).game)===liveBefore&&JSON.stringify((await snap()).records)===recordsBefore&&JSON.stringify(await saved())===storageBefore,'winning replay also changes no saved state orwins');
      check(errors.length===0&&failed.length===0,'no console errors or failedresources');
      reports.push({class:k,seed:w.seed,viewport:[width,height],touch,reducedMotion:reduced,passed:checks.length,checks,oracle,liveResult:won.game.result,replayActions:source.solution.length,motion,errors,failed});
    }catch(error){const state=await snap().catch(()=>null);throw Error(`${stage}: ${error.message}; replay=${JSON.stringify(state?.replay?{index:state.replay.index,phase:state.replay.phase,playing:state.replay.playing}:null)} modal=${state?.modal}`);}finally{await context.close();}
  }
  return{phase,passed:true,reports,humanPlaytest:false,physicalPhoneTested:false};
}

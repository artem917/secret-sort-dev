async (page) => {
  const root=new URL(page.url()),base=`${root.origin}${root.pathname}`;
  const phase=root.hostname.includes('github.io')?'published-v03':'local-v03';
  const cases=[{seed:'mixed-v3-0',width:1366,height:768,touch:false},{seed:'mixed-v3-4',width:320,height:568,touch:true},{seed:'mixed-v3-11',width:390,height:844,touch:true}];
  const reports=[];
  for(const item of cases){
    const context=await page.context().browser().newContext({viewport:{width:item.width,height:item.height},isMobile:item.touch,hasTouch:item.touch,deviceScaleFactor:1});
    // This script installs a test player only. It can read the masked visible
    // projection and propose an action. Game state changes only by mouse/touch.
    await context.addInitScript({path:'tests/support/visible-policy.browser.js'});
    const p=await context.newPage(),errors=[],requests=[],checks=[],trace=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    p.on('requestfailed',r=>requests.push(r.url()));p.on('response',r=>{if(r.status()>=400)requests.push(`${r.status()} ${r.url()}`);});
    const check=(ok,name)=>{if(!ok)throw Error(`${item.seed}: ${name}`);checks.push(name);};
    const snap=()=>p.evaluate(()=>window.__secretSort.snapshot());
    const position=s=>JSON.stringify({columns:s.game.columns,reserve:s.game.reserve});
    const press=async locator=>{if(item.touch)await locator.tap();else await locator.click();};
    const command=name=>p.locator(`[data-command="${name}"]`).filter({visible:true});
    const cell=(col,index=0)=>p.locator(`.cell[data-zone="column"][data-place="${col}"][data-index="${index}"]`);
    const target=col=>p.locator(`.column-heading[data-place="${col}"]`);
    const slot=index=>p.locator(`.cell[data-zone="reserve"][data-place="${index}"]`);
    const source=(loc,count)=>loc.zone==='column'?cell(loc.index,count-1):slot(loc.index);
    const destination=loc=>loc.zone==='column'?target(loc.index):slot(loc.index);
    const total=s=>s.game.columns.flat().length+s.game.reserve.filter(Boolean).length;
    async function execute(action){
      if(action.type==='reveal')await press(cell(action.column));
      else if(action.type==='undo')await press(command('undo'));
      else{await press(source(action.from,action.count));await press(destination(action.to));}
    }
    async function bounds(){
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      return p.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,scrollX:document.querySelector('.board-scroll').scrollWidth-document.querySelector('.board-scroll').clientWidth,scrollY:document.querySelector('.board-scroll').scrollHeight-document.querySelector('.board-scroll').clientHeight,bad:[...document.querySelectorAll('.board .cell,.reserve-slots .cell,.game-controls > button')].filter(n=>n.getBoundingClientRect().width>0).filter(n=>{const b=n.getBoundingClientRect();return b.left<-.5||b.top<-.5||b.right>innerWidth+.5||b.bottom>innerHeight+.5;}).length}));
    }
    try{
      await p.goto(`${base}?qa=1&seed=${item.seed}`);
      check(await command('play').count()===1,'fresh menu has Play, no false Continue');await press(command('play'));
      await press(p.getByRole('button',{name:'Раскрыть учебную фишку'}));
      await press(p.getByRole('button',{name:'Выбрать 1 учебных фишек'}));await press(p.getByRole('button',{name:'Выбрать 5 учебных фишек'}));
      await press(p.getByRole('button',{name:'Перенести учебную пачку в пустую колонку'}));
      check(await p.getByRole('heading',{name:'Всё готово!'}).count()===1,'three-step tutorial works under new atomic rules');await press(command('tutorial-finish'));
      const start=await snap();
      check(start.game.generator==='reverse-packets-v3'&&total(start)===108,'ordinary mixed-v3 game,108 IDs');
      check(start.game.columns.every(col=>new Set(col.map(t=>t.kind)).size>=5),'all ten columns genuinely mixed, minimum five kinds');
      check(await p.locator('.board .cell').count()===120&&await p.locator('.reserve-slots .cell').count()===4,'120 board positions and4 independent reserve slots');
      check(await p.locator('.board .closed').count()===108,'all108 initially hidden');
      await press(command('settings'));await p.locator('[data-setting="sound"]').uncheck();await p.locator('[data-setting="animations"]').uncheck();await press(command('close').first());
      const geometry=await bounds();check(!geometry.bad&&geometry.scrollX===0&&geometry.scrollY===0&&geometry.width===geometry.pageWidth,'all cells, reserve and controls fit without scrolling');
      await press(cell(0,1));check((await snap()).game.columns.flat().every(t=>!t.open),'deep hidden click rejected');
      if(!item.touch){await cell(0).focus();await p.keyboard.press('Enter');check((await snap()).game.columns[0][0].open,'keyboard Enter reveals');await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.activeElement.dataset.place)==='1','arrow navigation works');}
      else await press(cell(0));
      const before=await snap(),nextId=before.game.columns[0][1].id;
      await press(cell(0));await press(slot(0));const stored=await snap();
      check(stored.game.columns[0][0].id===nextId&&stored.game.columns[0][0].open&&!stored.game.columns[0][1].open,'transfer automatically reveals exactly new top');
      check(stored.game.history.length===before.game.history.length+1&&stored.game.transfers===1,'transfer plus reveal use one history operation');
      await p.screenshot({path:`output/playwright/${phase}-${item.width}x${item.height}-reserve-auto.png`});
      await p.reload();check(await command('continue').count()===1,'F5 offers genuine Continue');await press(command('continue'));
      check(position(await snap())===position(stored),'F5 keeps atomic reveal, reserve and inventory');
      await press(command('undo'));const afterUndo=await snap();
      check(position(afterUndo)===position(before)&&!afterUndo.game.columns[0][1].open,'single Undo restores move and recloses automatic reveal');
      check(afterUndo.game.undos===1&&afterUndo.game.transfers===1,'Undo costs retained, transfer count monotonic');
      await press(command('undo'));check(position(await snap())===position(start),'second Undo restores separate manual opening');
      await press(command('hint'));check((await snap()).game.hints===1&&(await p.locator('.message').innerText()).includes('Возможный ход'),'hint remains legal/free and tracked');
      await p.evaluate(()=>{window.__playExplorer=window.__createVisibleExplorer(600,80);});
      let groups=0,reserveEntries=0,probeDone=false,choiceSteps=0,policyTransfers=0,autoCount=0;
      for(let step=0;step<600;step++){
        const decision=await p.evaluate(()=>{
          const v=window.__secretSort.visible();
          if(v.columns.flat().some(t=>!t.open&&t.kind!==-1)||JSON.stringify(v).includes('"id"'))throw Error('Hidden information escaped');
          return {action:window.__playExplorer.next(v),choices:window.__legalVisibleMoves(v).length};
        });
        const action=decision.action;if(!action)break;
        if(decision.choices>1)choiceSteps++;
        if(action.type==='move'&&action.count>=5&&!probeDone){
          const beforeProbe=await snap();await press(source(action.from,1));check((await snap()).selection.count===1,'top tile selects one');
          await press(source(action.from,5));check((await snap()).selection.count===5,'fifth tile selects exactly five');
          await press(slot(3));check(position(await snap())===position(beforeProbe)&&await p.locator('.error-message').count()===1,'reserve rejects group without truncation');
          await press(command('cancel'));await press(source(action.from,5));
          const selectedBounds=await bounds();check(selectedBounds.bad===0&&selectedBounds.scrollX===0&&selectedBounds.scrollY===0,'selected group keeps full board visible');
          await p.screenshot({path:`output/playwright/${phase}-${item.width}x${item.height}-five-selected.png`});
          await press(destination(action.to));check((await snap()).game.transfers===beforeProbe.game.transfers+1,'five transferred as one actual move');
          await press(command('undo'));check(position(await snap())===position(beforeProbe),'one Undo reverses five-transfer and any reveal');probeDone=true;
        }
        const beforeAction=await snap();await execute(action);const after=await snap();
        if(total(after)!==108)throw Error(`Inventory lost at ${step}`);
        if(action.type==='move'){
          policyTransfers++;if(action.count>1)groups++;if(action.to.zone==='reserve')reserveEntries++;
          if(after.game.transfers!==beforeAction.game.transfers+1)throw Error(`UI rejected policy move at ${step}`);
          if(after.game.history.at(-1)?.autoRevealedId!==null)autoCount++;
        }
        trace.push({step,action,visibleChoices:decision.choices});
      }
      const end=await snap(),status=await p.evaluate(()=>window.__playExplorer.status);
      check(status==='win'&&end.game.result!==null,'visible-information policy reaches actual victory, no solution replay');
      check(end.game.columns.filter(c=>c.length===12).length===9&&end.game.columns.filter(c=>!c.length).length===1&&end.game.reserve.every(t=>!t)&&end.game.columns.flat().every(t=>t.open),'victory9x12,all108 open,one empty,empty reserve');
      check(groups>50&&reserveEntries>0&&choiceSteps>40,'game involved real groups, reserve use and alternative choices');
      check(probeDone,'natural group-of-five interaction exercised');
      check(end.game.result.score===Math.max(0,10000-end.game.transfers*30-end.game.undos*250-end.game.hints*500),'final score includes all real operations');
      await p.screenshot({path:`output/playwright/${phase}-${item.width}x${item.height}-victory.png`});
      // The certificate is read only AFTER victory, solely to verify this play
      // trail differs from the prerecorded proof. It cannot guide any decision.
      const proofAfterVictory=await p.evaluate(()=>window.__secretSort.certificate());
      const differentFromProof=JSON.stringify(trace.map(t=>t.action).filter(a=>a.type==='move'))!==JSON.stringify(proofAfterVictory.filter(a=>a.type==='move'));
      check(differentFromProof,'actual move trail differs from certified solution');
      await press(command('menu').last());check(await command('continue').count()===0,'won game not offered as Continue');
      await p.reload();check((await snap()).records.wins===1,'F5 preserves one win and does not farm result');
      await press(command('settings'));await p.locator('[data-setting="reserveCapacity"]').selectOption('0');await press(command('close').first());
      await press(command('new'));await p.locator('#seed').fill('reserve0-v03');await press(p.getByRole('button',{name:'Начать с этим seed'}));
      check((await snap()).game.reserve.length===0,'zero-reserve setting remains functional');
      await press(command('pause'));await press(command('restart'));await press(command('confirm-restart'));
      check((await snap()).game.seed==='reserve0-v03'&&(await snap()).game.columns.flat().every(t=>!t.open),'restart retains seed and resets hidden position');
      check(errors.length===0&&requests.length===0,'zero console errors and failed resources');
      reports.push({...item,passed:checks.length,checks,policy:{transfers:policyTransfers,groups,reserveEntries,choiceSteps,autoReveals:autoCount,differentFromProof,certificateUsedForDecisions:false},final:end.game.result,geometry,trace});
    }finally{await context.close();}
  }
  const fresh=await page.context().browser().newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  let defaultStart;
  try{
    const p=await fresh.newPage();await p.goto(`${base}?qa=1`);await p.locator('[data-command="play"]').click();await p.getByRole('button',{name:'Пропустить',exact:true}).click();
    defaultStart=await p.evaluate(()=>{const s=window.__secretSort.snapshot();return{seed:s.game.seed,generator:s.game.generator,mixed:s.game.columns.every(col=>new Set(col.map(t=>t.kind)).size>=5)};});
    if(!defaultStart.seed.startsWith('s-')||defaultStart.generator!=='reverse-packets-v3'||!defaultStart.mixed)throw Error('Default Play did not create ordinary random mixed game');
  }finally{await fresh.close();}
  return {phase,passed:reports.every(r=>r.passed>25),games:reports,defaultStart,physicalPhoneTested:false};
}

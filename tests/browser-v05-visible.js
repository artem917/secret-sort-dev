async (page) => {
  const url = new URL(page.url()), base = `${url.origin}${url.pathname}`;
  const phase = url.hostname.includes('github.io') ? 'published-v05' : 'local-v05', games = [];
  // Fixed integration cases: two documented risk roots and one visible-policy
  // winning example from the full32 cohort. This is not a random success rate.
  for (const [seed, width, height, mode] of [['perturbed-r1-0',320,568,1],['perturbed-r2-8',390,844,2],['perturbed-r4-8',1366,768,4]]) {
    const touch = width < 700, context = await page.context().browser().newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
    await context.addInitScript({path:'tests/support/visible-policy.browser.js'});
    const p = await context.newPage(), errors = [], trace = [];
    p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const press = async locator => { if(touch)await locator.tap();else await locator.click(); };
    const command = name => p.locator(`[data-command="${name}"]`).filter({visible:true});
    const tile = (col,index=0) => p.locator(`.cell[data-zone="column"][data-place="${col}"][data-index="${index}"]`);
    const slot = index => p.locator(`.cell[data-zone="reserve"][data-place="${index}"]`);
    try {
      await p.goto(`${base}?qa=1&mode=${mode}&seed=${seed}`);await press(command('play'));await press(p.getByRole('button',{name:'Пропустить',exact:true}));
      await press(command('settings'));await p.locator('[data-setting="sound"]').uncheck();await p.locator('[data-setting="animations"]').uncheck();await press(command('close').first());
      await p.evaluate(()=>{window.__visibleTried=new Set();});
      let groups=0,reserveEntries=0,outcome='action-limit',choices=0;
      for(let step=0;step<200;step++) {
        // Decisions read ONLY the masked projection. No snapshot/certificate,
        // seed, tileID or solver is passed to this player.
        const decision=await p.evaluate(()=>{
          const v=window.__secretSortV05.visible();
          if(v.columns.flat().some(t=>!t.open&&t.kind!==-1)||JSON.stringify(v).includes('"id"'))throw Error('Hidden information escaped');
          const hidden=v.columns.findIndex(c=>c[0]&&!c[0].open);
          if(hidden>=0)return {action:{type:'reveal',column:hidden,index:0},choices:1};
          const legal=window.__legalVisibleMoves(v),key=v.columns.map(c=>c.map(t=>t.open?String(t.kind):'?').join(',')).join('|')+'#'+v.reserve.map(t=>t?String(t.kind):'-').join(',');
          const ranked=legal.map(action=>{
            const source=action.from.zone==='column'?v.columns[action.from.index]:[v.reserve[action.from.index]],target=action.to.zone==='column'?v.columns[action.to.index]:[];
            const exposes=action.from.zone==='column'&&source[action.count]&&!source[action.count].open;
            let score=(exposes?100:0)+(action.from.zone==='reserve'?25:0)+(action.to.zone==='column'?20:0)+action.count*2+(target.length?5:0);
            if(action.to.zone==='reserve')score-=10;if(source.length===12&&source.every(t=>t.open&&t.kind===source[0].kind))score-=50;
            return {action,score};
          }).sort((a,b)=>b.score-a.score);
          const action=ranked.find(({action})=>!window.__visibleTried.has(key+JSON.stringify(action)))?.action??null;
          if(action)window.__visibleTried.add(key+JSON.stringify(action));return {action,choices:legal.length};
        });
        if(!decision.action){outcome='tried-actions-stall';break;}
        const a=decision.action;
        if(a.type==='reveal')await press(tile(a.column));
        else {await press(a.from.zone==='column'?tile(a.from.index,a.count-1):slot(a.from.index));await press(a.to.zone==='column'?p.locator(`.column-heading[data-place="${a.to.index}"]`):slot(a.to.index));if(a.count>1)groups++;if(a.to.zone==='reserve')reserveEntries++;}
        if(decision.choices>1)choices++;trace.push({action:a,visibleLegalChoices:decision.choices});
        const s=await p.evaluate(()=>window.__secretSortV05.snapshot());
        if(s.disposition==='proven-lose'){outcome='proven-lose';break;}
        if(s.game.columns.flat().length+s.game.reserve.filter(Boolean).length!==108)throw Error('Inventory lost');
        if(s.game.result){outcome='WIN';break;}
      }
      await p.waitForTimeout(800);
      const final=await p.evaluate(()=>window.__secretSortV05.snapshot());
      if(final.disposition==='proven-lose')outcome='proven-lose';
      await p.screenshot({path:`output/playwright/${phase}-${seed}-visible-play.png`});

      if(errors.length)throw Error(JSON.stringify(errors));
      games.push({seed,mode,disposition:final.disposition,viewport:[width,height],outcome,actionBudget:200,actions:trace.length,groups,reserveEntries,choiceSteps:choices,certificateUsedForDecisions:false,hiddenKindsUsedForDecisions:false,final:final.game.result,finalPosition:{columns:final.game.columns,reserve:final.game.reserve},trace,errors});
    }finally{await context.close();}
  }
  return {phase,passed:true,games,physicalPhoneTested:false,humanPlaytest:false};
}

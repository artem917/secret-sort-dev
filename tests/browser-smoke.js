async (page) => {
  // Run with playwright-cli run-code --filename=tests/browser-smoke.js.
  // The current page supplies the host and optional ?device=phone. No dispatch,
  // localStorage fixture or victory injection: all game changes are real input.
  const origin = new URL(page.url());
  const phone = origin.searchParams.get('device') === 'phone';
  const mode = phone ? 'phone' : 'desktop';
  const phase = origin.hostname.includes('github.io') ? 'published' : 'local';
  const base = `${origin.origin}${origin.pathname}`;
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 768 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  const p = await context.newPage();
  const errors = [], failedRequests = [], checks = [];
  p.on('pageerror', error => errors.push(error.message));
  p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  p.on('requestfailed', request => failedRequests.push(request.url()));
  p.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const check = (condition, label) => { if (!condition) throw new Error(`${phase}/${mode}: ${label}`); checks.push(label); };
  const snap = () => p.evaluate(() => window.__secretSort.snapshot());
  const press = async locator => { if (phone) await locator.tap(); else await locator.click(); };
  const command = name => p.locator(`[data-command="${name}"]`).filter({ visible: true });
  const cell = (col, index = 0) => p.locator(`.cell[data-zone="column"][data-place="${col}"][data-index="${index}"]`);
  const target = col => p.locator(`.column-heading[data-place="${col}"]`);
  const reserve = slot => p.locator(`.cell[data-zone="reserve"][data-place="${slot}"]`);
  const total = s => s.game.columns.flat().length + s.game.reserve.filter(Boolean).length;
  const position = s => JSON.stringify({ columns:s.game.columns, reserve:s.game.reserve });
  try {
    await p.goto(`${base}?qa=1&seed=certified-2`);
    check(await p.getByRole('button', {name:'▶ Играть',exact:true}).count() === 1, 'fresh menu: Play, no false Continue');
    await press(command('play'));
    await press(p.getByRole('button', {name:'Раскрыть учебную фишку'}));
    await press(p.getByRole('button', {name:'Выбрать 1 учебных фишек'}));
    await press(p.getByRole('button', {name:'Выбрать 5 учебных фишек'}));
    await press(p.getByRole('button', {name:'Перенести учебную пачку в пустую колонку'}));
    check(await p.getByRole('heading',{name:'Всё готово!'}).count() === 1, 'three-step interactive tutorial completed');
    await press(command('tutorial-finish'));
    const start = await snap();
    check(start.game.seed === 'certified-2' && total(start) === 108, 'real 108-tile game, requested seed');
    check(await p.locator('.column').count() === 10, 'exactly ten board columns');
    check(await p.locator('.board .cell.closed').count() === 108 && await p.locator('.board .cell.vacant').count() === 12, '108 questions and 12 genuine empty positions');
    check(await p.locator('.reserve-slots .cell').count() === 4, 'four independent reserve places');
    // Disable effects through the actual settings, not a test-only bypass.
    await press(command('settings'));
    await p.locator('[data-setting="sound"]').uncheck();
    await p.locator('[data-setting="animations"]').uncheck();
    await press(command('close').first());
    const geometry = await p.evaluate(() => ({ width:innerWidth, pageWidth:document.documentElement.scrollWidth, reserve:document.querySelector('.reserve-panel').getBoundingClientRect().bottom, controls:document.querySelector('.game-controls').getBoundingClientRect().bottom, height:innerHeight }));
    check(geometry.width === geometry.pageWidth, 'no page horizontal overflow (board scroll stays inside field)');
    check(geometry.reserve <= geometry.height && geometry.controls <= geometry.height, 'reserve and controls visible in viewport');
    await p.screenshot({path:`output/playwright/${phase}-${mode}-initial.png`});
    await press(cell(0,1));
    check((await snap()).game.columns.flat().every(t=>!t.open), 'deep hidden tile cannot be revealed');
    if (!phone) {
      await cell(0).focus(); await p.keyboard.press('Enter');
      check((await snap()).game.columns[0][0].open, 'keyboard Enter reveals top');
      await p.keyboard.press('ArrowRight');
      check(await p.evaluate(()=>document.activeElement.dataset.place) === '1', 'keyboard arrow navigates columns');
    } else await press(cell(0));
    await press(cell(0));
    check((await snap()).selection.count === 1, 'select one actual open tile');
    await press(reserve(0));
    const stored = await snap();
    check(total(stored) === 108 && stored.game.reserve[0] !== null && !stored.game.columns[0][0].open, 'reserve stores one, next hidden tile stays hidden');
    await p.reload();
    check(await p.getByRole('button',{name:'▶ Продолжить',exact:true}).count() === 1, 'F5 shows genuine Continue');
    await press(command('continue'));
    check(position(await snap()) === position(stored), 'F5/resume restores board and reserve exactly');
    await press(reserve(0)); await press(target(0));
    check((await snap()).game.reserve[0] !== null && await p.locator('.error-message').count() === 1, 'reserve cannot return onto closed tile');
    await press(command('undo'));
    await press(command('undo'));
    check(position(await snap()) === position(start), 'undo transfer and reveal restores original hidden position');
    await press(command('hint'));
    check((await snap()).game.hints === 1 && (await p.locator('.message').innerText()).includes('Возможный ход'), 'free honest legal hint, tracked once');
    // The certificate is read-only data. Every following reveal and move uses a
    // real click/tap on the normal UI, including the group-size choice.
    const certificate = await p.evaluate(() => window.__secretSort.certificate());
    check(certificate.length === 216, 'full certificate loaded as read-only evidence');
    let actionsPlayed = 0;
    for (const [i, action] of certificate.entries()) {
      if (i === 201) {
        check(action.type === 'move' && action.count === 5, 'natural certified group-of-five position reached');
        await press(cell(action.from.index,4));
        check((await snap()).selection.count === 5, 'fifth tile selects exactly five');
        const before = position(await snap());
        await press(reserve(1));
        check(position(await snap()) === before && await p.locator('.error-message').count() === 1, 'five cannot be silently placed or truncated in reserve');
        await press(command('cancel'));
        await press(cell(action.from.index)); await press(reserve(0));
        await press(reserve(0)); await press(target(action.from.index));
        check(position(await snap()) === before, 'real reserve-to-matching-column roundtrip');
        await press(cell(action.from.index,4));
        await p.screenshot({path:`output/playwright/${phase}-${mode}-five-selected.png`});
        const beforeMove = await snap();
        await press(target(action.to.index));
        const afterMove = await snap();
        check(afterMove.game.transfers === beforeMove.game.transfers+1 && afterMove.game.columns[action.to.index].length === beforeMove.game.columns[action.to.index].length+5, 'five tiles transferred as one move');
      } else if (action.type === 'reveal') await press(cell(action.column));
      else { await press(cell(action.from.index,action.count-1)); await press(target(action.to.index)); }
      actionsPlayed++;
      const state = await snap();
      if (total(state) !== 108) throw new Error(`Lost inventory at ${i}`);
      if (state.game.transfers !== certificate.slice(0,i+1).filter(a=>a.type==='move').length + (i>=201?3:1)) throw new Error(`UI action did not match certificate at ${i}`);
    }
    const victory = await snap();
    check(victory.game.result !== null && victory.game.columns.filter(col=>col.length===12).length===9 && victory.game.columns.filter(col=>!col.length).length===1 && victory.game.reserve.every(t=>t===null), 'real victory9x12 + empty column + empty reserve');
    check(victory.game.columns.flat().every(t=>t.open) && total(victory)===108, 'all108 remain visible at victory');
    check(victory.game.result.score===Math.max(0,10000-30*victory.game.transfers-250*victory.game.undos-500*victory.game.hints), 'final score includes real transfers, undos, hint');
    check(victory.records.wins===1 && victory.records.bestScore.seed==='certified-2', 'one genuine local result recorded');
    check(Number(await p.locator('[data-testid="final-score"]').innerText().then(text=>text.replace(/\D/g,'')))===victory.game.result.score, 'visible victory score matches state');
    await p.screenshot({path:`output/playwright/${phase}-${mode}-victory.png`});
    await press(command('menu').last());
    check(await p.getByRole('button',{name:'▶ Продолжить',exact:true}).count()===0, 'completed game never offered as Continue');
    await p.reload();
    check((await snap()).records.wins===1, 'F5 does not farm victory or local record');
    await press(command('records'));
    check((await p.locator('.record').first().innerText()).includes(String(victory.game.result.score)), 'local score record visible after F5');
    await press(command('close').first());
    await press(command('settings'));
    await p.locator('[data-setting="reserveCapacity"]').selectOption('0');
    await press(command('close').first());
    await press(command('new'));
    await p.locator('#seed').fill('onboarding');
    await press(p.getByRole('button',{name:'Начать с этим seed'}));
    check((await snap()).game.reserve.length===0 && await p.locator('.reserve-slots .cell').count()===0, 'no-reserve setting really starts reserve0 game');
    if(phone){
      await p.setViewportSize({width:360,height:800});
      const compact=await p.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,reserveBottom:document.querySelector('.reserve-panel').getBoundingClientRect().bottom}));
      check(compact.width===compact.pageWidth && compact.reserveBottom<=800, '360px phone keeps field contained and reserve accessible');
    } else {
      await p.setViewportSize({width:1920,height:1080});
      check(await p.locator('.column').count()===10, '1920x1080 retains exact ten columns');
      await p.screenshot({path:`output/playwright/${phase}-${mode}-1920.png`});
    }
    check(errors.length===0, `zero console/page errors: ${errors.join('; ')}`);
    check(failedRequests.length===0, `zero failed assets: ${failedRequests.join('; ')}`);
    return {phase,mode,input:phone?'real tap events in mobile emulation':'mouse + keyboard',passed:checks.length,checks,actionsPlayed,seed:'certified-2',final:victory.game.result,geometry,screenshots:`output/playwright/${phase}-${mode}-*.png`,physicalPhoneTested:false};
  } finally { await context.close(); }
}

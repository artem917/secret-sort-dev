async (page) => {
  const url = new URL(page.url()), base = `${url.origin}${url.pathname}`;
  const phase = url.hostname.includes('github.io') ? 'published-v04' : 'local-v04';
  const context = await page.context().browser().newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  const p = await context.newPage(), checks = [];
  const check = (ok, text) => { if (!ok) throw Error(text); checks.push(text); };
  try {
    await p.goto(`${base}?qa=1&seed=shuffle-49`);
    await p.locator('[data-command="play"]').tap();
    await p.getByRole('heading',{name:'Раскладка не допущена'}).waitFor({timeout:15000});
    const report = await p.evaluate(()=>window.__secretSortV04.generation());
    check(report.status==='UNKNOWN','real worker budget interruption is UNKNOWN');
    check(await p.locator('body').innerText().then(t=>t.includes('это не доказательство проигрыша')),'failure UI does not claim unsolvability');
    check((await p.evaluate(()=>window.__secretSortV04.snapshot())).game===null,'unproved draw never admitted as a game');
    await p.screenshot({path:`output/playwright/${phase}-unknown-admission.png`});
    await p.locator('[data-command="close"]').first().tap();await p.reload();
    check(await p.locator('[data-command="play"]').count()===1,'rejected draw does not create false Continue after F5');
    await p.goto(`${base}?seed=shuffle-1`);
    check(await p.evaluate(()=>typeof window.__secretSortV04)==='undefined','ordinary URL does not expose QA oracle');
    await p.locator('[data-command="play"]').tap();await p.getByRole('button',{name:'Пропустить',exact:true}).tap();
    check(!/seed/i.test(await p.locator('body').innerText()),'ordinary game hides technical seed');
    await p.locator('[data-command="restart"]').tap();
    check(await p.getByRole('button',{name:'Повторить раскладку',exact:true}).count()===1,'same-draw action has requested label');
    await p.locator('[data-command="close"]').first().tap();await p.locator('[data-command="new"]').tap();
    check(await p.getByRole('button',{name:'Новая раскладка',exact:true}).count()===1,'new-draw action has requested label');
    return {phase,passed:true,checks,unknownReport:report};
  }finally{await context.close();}
}

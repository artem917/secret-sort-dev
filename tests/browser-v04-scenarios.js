async (page) => {
  const url = new URL(page.url()), base = `${url.origin}${url.pathname}`;
  const phase = url.hostname.includes('github.io') ? 'published-v04' : 'local-v04';
  const reports = [];
  for (let scenario = 0; scenario < 2; scenario++) {
    const touch = scenario === 1;
    const context = await page.context().browser().newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 768 }, isMobile: touch, hasTouch: touch });
    await context.addInitScript({ path: 'tests/support/v04-browser-fixtures.browser.js' });
    const p = await context.newPage(), checks = [], errors = [], requests = [];
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('requestfailed', r => requests.push(r.url())); p.on('response', r => { if (r.status() >= 400) requests.push(`${r.status()} ${r.url()}`); });
    const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
    const snap = () => p.evaluate(() => window.__secretSortV04.snapshot());
    const pos = s => JSON.stringify({ columns: s.game.columns, reserve: s.game.reserve });
    const press = async loc => { if (touch) await loc.tap(); else await loc.click(); };
    const command = name => p.locator(`[data-command="${name}"]`).filter({ visible: true });
    const tile = (col, index = 0) => p.locator(`.cell[data-zone="column"][data-place="${col}"][data-index="${index}"]`);
    const slot = i => p.locator(`.cell[data-zone="reserve"][data-place="${i}"]`);
    const source = (loc, count) => loc.zone === 'column' ? tile(loc.index, count - 1) : slot(loc.index);
    const target = loc => loc.zone === 'column' ? p.locator(`.column-heading[data-place="${loc.index}"]`) : slot(loc.index);
    async function execute(a) {
      if (a.type === 'reveal') await press(tile(a.column));
      else { await press(source(a.from, a.count)); await press(target(a.to)); }
    }
    try {
      // Seed an actual stable session through its UI, then prove isolation.
      await p.goto(`${base.replace(/v04\/$/, '')}?qa=1&seed=stable-isolation`);
      await press(command('play')); await press(p.getByRole('button', { name: 'Пропустить', exact: true }));
      const stable = await p.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('secret-sort:') && !k.startsWith('secret-sort:v04:'))));
      await p.goto(`${base}?qa=1`);
      const fixture = await p.evaluate(index => window.__v04RiskFixtures[index], scenario);
      await p.goto(`${base}?qa=1&seed=${fixture.seed}`);
      await press(command('play')); await press(p.getByRole('button', { name: 'Пропустить', exact: true }));
      const start = await snap();
      check(start.game.generator === 'full-shuffle-v4' && start.game.reserve.length === 4, 'full-shuffle admission with four reserve slots');
      check((await p.evaluate(() => window.__secretSortV04.generation())).status === 'WIN', 'worker confirmed WIN before admission');
      check(await p.locator('.board .closed').count() === 108, 'all108 initially hidden');
      check(await p.locator('.closed[data-tile-id]').count() === 0, 'hidden tile identity absent from rendered DOM');
      check(!/seed/i.test(await p.locator('body').innerText()) && !(await p.locator('body').innerText()).includes(fixture.seed), 'technical seed absent from ordinary UI');
      await press(command('settings')); await p.locator('[data-setting="sound"]').uncheck(); await p.locator('[data-setting="animations"]').uncheck();
      check(await p.locator('[data-setting="reserveCapacity"]').count() === 0, 'experimental reserve fixed at4'); await press(command('close').first());
      await press(tile(0)); const before = await snap(); await press(tile(0));
      check(await p.locator('.can-receive,.hint-target').count() === 0, 'selection has no destination highlight');
      await press(slot(0)); const stored = await snap();
      check(stored.game.columns[0][0].open && stored.game.history.at(-1).autoRevealedId === stored.game.columns[0][0].id, 'transfer automatically reveals new top');
      check(stored.game.history.length === before.game.history.length + 1, 'move and reveal form one operation');
      await p.reload(); await press(command('continue'));
      check(pos(await snap()) === pos(stored), 'F5 preserves atomic operation and full inventory');
      await press(command('undo')); check(pos(await snap()) === pos(before), 'oneUndo restores transfer and recloses secret');
      await press(command('restart')); await press(command('confirm-restart')); await p.locator('[role="dialog"]').waitFor({state:'hidden',timeout:15000});
      check(pos(await snap()) === pos(start) && (await snap()).game.runId !== start.game.runId, 'Повторить раскладку resets exact same108 layout');
      for (const a of fixture.prefix) await execute(a);
      const parent = await snap(); check(pos(parent) === JSON.stringify(fixture.parent), 'real clicks reach certified solvable parent');
      await execute(fixture.bad); const child = await snap();
      check(pos(child) === JSON.stringify(fixture.child), 'risky legal move reaches independently certified forwardLOSE child');
      await p.screenshot({ path: `output/playwright/${phase}-${fixture.seed}-risky-child.png` });
      await press(command('undo')); check(pos(await snap()) === pos(parent), 'Undo recovers from actual dangerous choice');
      for (const a of fixture.winning) await execute(a);
      const won = await snap();
      check(!!won.game.result && won.game.reserve.every(t => !t) && won.game.columns.filter(c => !c.length).length === 1, 'alternate continuation wins via actual mouse/touch');
      check(won.game.result.score === Math.max(0, 10000 - 30 * won.game.transfers - 250 * won.game.undos - 500 * won.game.hints), 'real operations determine final score');
      check(won.records.wins === 1, 'real victory recorded once');
      await p.screenshot({ path: `output/playwright/${phase}-${fixture.seed}-victory.png` });
      await press(command('inspect-win')); await press(command('new'));
      const rejectedDraws = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        await press(command('confirm-new'));
        await p.waitForFunction(() => window.__secretSortV04.snapshot().modal !== 'generating', {timeout:15000});
        if ((await snap()).modal === null) break;
        const report = await p.evaluate(() => window.__secretSortV04.generation()); rejectedDraws.push(report);
        check(pos(await snap()) === pos(won), 'unproved new draw preserves prior game');
      }
      const fresh = await snap(); check(fresh.game.seed !== start.game.seed && pos(fresh) !== pos(start), 'Новая раскладка makes a different admitted108 shuffle');
      check(fresh.records.wins === 1, 'new draw retains experimental records');
      const afterStable = await p.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('secret-sort:') && !k.startsWith('secret-sort:v04:'))));
      check(JSON.stringify(stable) === JSON.stringify(afterStable), 'stablev03 saves/settings/records unchanged');
      check(errors.length === 0 && requests.length === 0, 'zero browser errors and failed resources');
      reports.push({ seed: fixture.seed, touch, passed: checks.length, checks, scriptedIntegrationProof: true, prefixActions: fixture.prefix.length, winningContinuationActions: fixture.winning.length, badAction: fixture.bad, final: won.game.result, rejectedDraws, errors, requests });
    } finally { await context.close(); }
  }
  return { phase, passed: true, scenarios: reports, physicalPhoneTested: false };
}

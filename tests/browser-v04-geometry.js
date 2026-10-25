async (page) => {
  const url = new URL(page.url());
  const baseline = url.searchParams.get('baseline') === '1';
  const base = `${url.origin}${url.pathname}`;
  const phase = baseline ? 'baseline' : url.hostname.includes('github.io') ? 'published-v04' : 'local-v04';
  const viewports = [[320,568],[360,740],[390,844],[412,915],[768,1024],[1366,768]];
  const results = [];
  for (const [width,height] of viewports) {
    const context = await page.context().browser().newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,deviceScaleFactor:1});
    try {
      const p = await context.newPage();
      await p.goto(`${base}?qa=1&seed=shuffle-12`);
      await p.locator('[data-command="play"]').click();
      await p.getByRole('button',{name:'Пропустить',exact:true}).click();
      await p.locator('[data-command="settings"]').click();
      await p.locator('[data-setting="sound"]').uncheck();
      await p.locator('[data-setting="animations"]').uncheck();
      await p.locator('[data-command="close"]').first().click();
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      async function measure(){
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      return p.evaluate(() => {
        const cells=[...document.querySelectorAll('.board .cell, .reserve-slots .cell')];
        const controls=[...document.querySelectorAll('.game-controls > button, .game-header > button')].filter(node=>node.getBoundingClientRect().width>0);
        const rects=[...cells,...controls].map((node,index)=>{
          const b=node.getBoundingClientRect();
          let clipped=false;
          for(let parent=node.parentElement;parent;parent=parent.parentElement){
            const css=getComputedStyle(parent),r=parent.getBoundingClientRect();
            if(/hidden|auto|scroll|clip/.test(css.overflowX)&&(b.left<r.left-.5||b.right>r.right+.5))clipped=true;
            if(/hidden|auto|scroll|clip/.test(css.overflowY)&&(b.top<r.top-.5||b.bottom>r.bottom+.5))clipped=true;
          }
          const inViewport=b.left>=-.5&&b.top>=-.5&&b.right<=innerWidth+.5&&b.bottom<=innerHeight+.5;
          const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
          const centerHit=!!hit&&(hit===node||node.contains(hit));
          return {key:node.dataset.focusKey??node.dataset.command??String(index),kind:index<cells.length?'cell':'control',x:b.x,y:b.y,width:b.width,height:b.height,inViewport,clipped,centerHit};
        });
        const scroll=document.querySelector('.board-scroll');
        return {viewport:[innerWidth,innerHeight],boardCells:document.querySelectorAll('.board .cell').length,reserveCells:document.querySelectorAll('.reserve-slots .cell').length,fieldScroll:{x:scroll.scrollWidth-scroll.clientWidth,y:scroll.scrollHeight-scroll.clientHeight},pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,violations:rects.filter(r=>!r.inViewport||r.clipped||!r.centerHit),rects};
      });
      }
      const record=await measure();record.states=[];
      await p.screenshot({path:`output/playwright/${phase}-${width}x${height}.png`});
      if(!baseline){
        const top=()=>p.locator('.cell[data-zone="column"][data-place="0"][data-index="0"]');
        await p.locator('.cell[data-zone="column"][data-place="0"][data-index="1"]').click();
        record.states.push({name:'invalid-deep-click',...await measure()});
        await top().click();await top().click();
        record.states.push({name:'selected-one',...await measure()});
        await p.locator('.cell[data-zone="reserve"][data-place="0"]').click();
        record.states.push({name:'reserve-and-autoReveal',...await measure()});
        await p.locator('[data-command="undo"]').click();
        record.states.push({name:'atomic-undo',...await measure()});
      }
      results.push(record);
    } finally { await context.close(); }
  }
  return {phase,viewports:results,passed:results.every(record=>[record,...record.states].every(r=>r.boardCells===120&&r.reserveCells===4&&!r.violations.length&&r.fieldScroll.x<=1&&r.fieldScroll.y<=1))};
}

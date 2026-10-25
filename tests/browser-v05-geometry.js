async (page) => {
  const u=new URL(page.url()),base=`${u.origin}${u.pathname}`,phase=u.hostname.includes('github.io')?'published-v05':'local-v05';
  const results=[];
  for(const [width,height]of[[320,568],[360,740],[390,844],[412,915],[768,1024],[1366,768]])for(let k=1;k<=4;k++){
    const context=await page.context().browser().newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,deviceScaleFactor:1});
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    const cmd=name=>p.locator(`[data-command="${name}"]`).filter({visible:true});
    try{
      await p.goto(`${base}?qa=1&mode=${k}&seed=geometry-v05-${k}`);await cmd('play').click();await p.getByRole('button',{name:'Пропустить',exact:true}).click();
      await cmd('settings').click();await p.locator('[data-setting="sound"]').uncheck();await p.locator('[data-setting="animations"]').uncheck();await cmd('close').first().click();
      const states=[];
      async function measure(name){
        await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const r=await p.evaluate(()=>{
          const cells=[...document.querySelectorAll('.board .cell,.reserve-slots .cell')],controls=[...document.querySelectorAll('.game-controls >button,.game-header >button,.replay-controls >button')].filter(n=>n.getBoundingClientRect().width>0);
          const rects=[...cells,...controls].map((n,index)=>{const b=n.getBoundingClientRect();let clipped=false;for(let par=n.parentElement;par;par=par.parentElement){const c=getComputedStyle(par),r=par.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(c.overflowX)&&(b.left<r.left-.5||b.right>r.right+.5))clipped=true;if(/hidden|auto|scroll|clip/.test(c.overflowY)&&(b.top<r.top-.5||b.bottom>r.bottom+.5))clipped=true;}const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2),centerHit=!!n.closest('[inert]')||!!hit&&(hit===n||n.contains(hit));return{key:n.dataset.focusKey??n.dataset.command??index,x:b.x,y:b.y,width:b.width,height:b.height,inViewport:b.left>=-.5&&b.top>=-.5&&b.right<=innerWidth+.5&&b.bottom<=innerHeight+.5,clipped,centerHit};});
          const s=document.querySelector('.board-scroll');return{viewport:[innerWidth,innerHeight],boardCells:document.querySelectorAll('.board .cell').length,reserveCells:document.querySelectorAll('.reserve-slots .cell').length,scroll:{x:s.scrollWidth-s.clientWidth,y:s.scrollHeight-s.clientHeight},violations:rects.filter(r=>!r.inViewport||r.clipped||!r.centerHit),rects};
        });states.push({name,...r});
      }
      await measure('initial');
      const top=()=>p.locator('.cell[data-zone="column"][data-place="0"][data-index="0"]');
      await top().click();await top().click();await measure('selected');await p.locator('.cell[data-zone="reserve"][data-place="0"]').click();await measure('reserve-autoReveal');await cmd('undo').click();await measure('undo');
      await p.screenshot({path:`output/playwright/${phase}-k${k}-${width}x${height}.png`});
      if(k===4||width===320){
        await cmd('pause').click();await cmd('surrender').click();await cmd('confirm-surrender').click();await cmd('replay-open').click();await p.locator('.replay-screen').waitFor();
        await measure('replay-initial');await cmd('replay-next').click();await p.waitForFunction(()=>window.__secretSortV05.snapshot().replay.index===1&&window.__secretSortV05.snapshot().replay.phase==='ready');await measure('replay-step');
        await p.screenshot({path:`output/playwright/${phase}-replay-k${k}-${width}x${height}.png`});
      }
      if(errors.length)throw Error(errors.join(';'));
      results.push({class:k,viewport:[width,height],states,errors});
    }finally{await context.close();}
  }
  const bad=results.flatMap(r=>r.states.filter(s=>s.boardCells!==120||s.reserveCells!==r.class||s.violations.length||s.scroll.x>1||s.scroll.y>1).map(s=>({class:r.class,viewport:r.viewport,state:s.name,violations:s.violations,scroll:s.scroll})));
  return{phase,passed:bad.length===0,violations:bad,results};
}

async(page)=>{
 const u=new URL(page.url()),base=u.origin+u.pathname,old=u.pathname.includes('/v05/');
 const sizes=[[320,568],[360,740],[390,844],[412,915],[768,1024],[1366,768],[320,440],[360,612]];
 const results=[];
 for(const [width,height] of sizes){
  const ctx=await page.context().browser().newContext({viewport:{width,height},isMobile:width<768,hasTouch:true});
  await ctx.addInitScript(()=>{for(const v of ['v05','v06'])localStorage.setItem('secret-sort:'+v+':settings:v1',JSON.stringify({sound:false,animations:false,reserveCapacity:4,tutorialSeen:true}));});
  const p=await ctx.newPage();await p.goto(base+'?qa=1&mode=4&seed='+(old?'perturbed-r4-0':'spread-r4-0'));await p.locator('[data-command="play"]').click();await p.locator('.board').waitFor();
  // Resize the actually available content area, as browser chrome expands/collapses.
  for(const h of [height,height-24,height]){
   await p.setViewportSize({width,height:h});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const data=await p.evaluate(()=>{
    const vv=visualViewport,box={left:vv.offsetLeft,top:vv.offsetTop,right:vv.offsetLeft+vv.width,bottom:vv.offsetTop+vv.height};
    const selectors=['.column .cell','.reserve-slots .cell','.game-controls .button'];
    const nodes=[...document.querySelectorAll(selectors.join(','))].filter(e=>e.getBoundingClientRect().width>0),bad=[];
    const details=nodes.map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);const inView=r.left>=box.left-.5&&r.top>=box.top-.5&&r.right<=box.right+.5&&r.bottom<=box.bottom+.5,hitOK=hit===e||e.contains(hit);if(!inView||!hitOK)bad.push({label:e.getAttribute('aria-label')??e.textContent,inView,hitOK,rect:r.toJSON()});return r.width;});
    return{box,count:nodes.length,columns:document.querySelectorAll('.column .cell').length,reserve:document.querySelectorAll('.reserve-slots .cell').length,minCell:Math.min(...details.slice(0,120)),bad,scroll:{x:scrollX,y:scrollY}};
   });
   if(data.columns!==120||data.reserve!==4||data.bad.length)throw Error(JSON.stringify({width,height:h,...data}));
   if(width<680&&data.minCell<22)throw Error('tiles below22px '+JSON.stringify({width,height:h,...data}));
   results.push({width,height:h,...data});
  }
  await p.locator('.cell[data-zone="column"][data-place="1"][data-index="0"]').tap();
  if(await p.locator('.cell.selected').count()!==1)throw Error('touch selection failed');
  await p.screenshot({path:'output/playwright/v06/layout-'+width+'x'+height+'.png'});await ctx.close();
 }
 return{passed:true,results};
}

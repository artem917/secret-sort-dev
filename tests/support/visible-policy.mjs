// Decisions can consume kind:-1 for every closed tile. No certificate, seed,
// template, ID, or concealed kind participates in any decision.
export function visibleKey(position) {
  return position.columns.map(c=>c.map(t=>t.open?String(t.kind):'?').join(',')).join('|')+'#'+position.reserve.map(t=>t?String(t.kind):'-').join(',');
}
function topRun(c){if(!c[0]?.open)return 0;let n=1;while(c[n]?.open&&c[n].kind===c[0].kind)n++;return n;}
export function legalVisibleMoves(position){
  const {columns:cols,reserve}=position;
  const locations=[...cols.map((_,index)=>({zone:'column',index})),...reserve.map((_,index)=>({zone:'reserve',index}))];
  const get=loc=>loc.zone==='column'?cols[loc.index]:reserve[loc.index]?[reserve[loc.index]]:[];
  const moves=[];
  for(const from of locations){const source=get(from);for(let count=1;count<=topRun(source);count++)for(const to of locations){
    if(from.zone===to.zone&&from.index===to.index)continue;
    if(to.zone==='reserve'){if(count===1&&!reserve[to.index])moves.push({type:'move',from,to,count});continue;}
    const target=get(to);
    if(target.length+count<=12&&(!target[0]||target[0].open&&target[0].kind===source[0].kind))moves.push({type:'move',from,to,count});
  }}return moves;
}
export function rankedVisibleMoves(position){
  return legalVisibleMoves(position).map(action=>{
    const source=action.from.zone==='column'?position.columns[action.from.index]:[position.reserve[action.from.index]];
    const target=action.to.zone==='column'?position.columns[action.to.index]:[];
    const exposes=action.from.zone==='column'&&source[action.count]&&!source[action.count].open;
    let score=(exposes?100:0)+(action.from.zone==='reserve'?25:0)+(action.to.zone==='column'?20:0)+action.count*2+(target.length?5:0);
    if(action.to.zone==='reserve')score-=10;
    if(source.length===12&&source.every(t=>t.open&&t.kind===source[0].kind))score-=50;
    return {action,score};
  }).sort((a,b)=>b.score-a.score).map(item=>item.action);
}
export function visibleVictory(position){return position.reserve.every(t=>!t)&&position.columns.filter(c=>c.length===0).length===1&&position.columns.filter(c=>c.length===12&&c.every(t=>t.open&&t.kind===c[0].kind)).length===9;}

/** Bounded visible DFS. Call next(position) after executing its prior action.
 * The outer engine/browser executes actual moves and Undo, then supplies the
 * newly observed position. No candidate move is simulated before being chosen.
 */
export function createVisibleExplorer(maxActions=2000,undoWindow=80){
  const frames=[],seen=new Set();let pending=null,actions=0,status='running';
  const frame=position=>({key:visibleKey(position),moves:rankedVisibleMoves(position),index:0});
  const emit=action=>{actions++;return action;};
  return {
    get status(){return status;},get actions(){return actions;},get visited(){return seen.size;},
    next(position){
      if(visibleVictory(position)){status='win';return null;}
      if(actions>=maxActions){status='limit';return null;}
      if(!frames.length){
        const hidden=position.columns.findIndex(c=>c[0]&&!c[0].open);
        if(hidden>=0)return emit({type:'reveal',column:hidden,index:0});
        frames.push(frame(position));seen.add(visibleKey(position));
      }else if(pending==='move'){
        pending=null;const key=visibleKey(position);
        if(seen.has(key)){pending='undo';return emit({type:'undo'});}
        seen.add(key);frames.push(frame(position));
        // Keep at most79 parent moves, within the engine's80-entry history.
        // Earlier branches are committed; this is bounded exploration rather
        // than an exhaustive solver from the original root position.
        if(frames.length>undoWindow)frames.shift();
      }else if(pending==='undo'){pending=null;}
      const current=frames[frames.length-1];
      if(current.key!==visibleKey(position))throw Error('Execute each returned policy action exactly once');
      if(current.index<current.moves.length){pending='move';return emit(current.moves[current.index++]);}
      if(frames.length===1){status='exhausted';return null;}
      frames.pop();pending='undo';return emit({type:'undo'});
    },
  };
}

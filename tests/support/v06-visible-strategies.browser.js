(()=>{
// Decisions can consume kind:-1 for every closed tile. No certificate, seed,
// template, ID, or concealed kind participates in any decision.
function visibleKey(position) {
  return position.columns.map(c=>c.map(t=>t.open?String(t.kind):'?').join(',')).join('|')+'#'+position.reserve.map(t=>t?String(t.kind):'-').join(',');
}
function topRun(c){if(!c[0]?.open)return 0;let n=1;while(c[n]?.open&&c[n].kind===c[0].kind)n++;return n;}
function legalVisibleMoves(position){
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

const STRATEGIES=['information-first','space-first','rotate-kinds'];
function canonicalVisible(position){return position.columns.map(c=>c.map(t=>t.open?String(t.kind):'?').join(',')).sort().join('|')+'#'+position.reserve.map(t=>t?String(t.kind):'-').sort().join(',');}
const read=(p,l)=>l.zone==='column'?p.columns[l.index]:p.reserve[l.index]?[p.reserve[l.index]]:[];
function visibleFeatures(position,action,previousCanonical=null){
 const from=read(position,action.from),target=read(position,action.to),kind=from[0].kind;
 const reveal=action.from.zone==='column'&&!!from[action.count]&&!from[action.count].open;
 const sourceEmpty=action.from.zone==='column'&&from.length===action.count;
 const targetEmpty=action.to.zone==='column'&&target.length===0;
 const freeReserve=action.from.zone==='reserve'&&action.to.zone==='column';
 const park=action.to.zone==='reserve';
 const createsEmptyColumn=sourceEmpty&&!targetEmpty;
 const merge=action.to.zone==='column'&&target.length>0&&(sourceEmpty||action.from.zone==='reserve');
 const copy={columns:position.columns.map(c=>c.map(t=>({kind:t.open?t.kind:-1,open:t.open}))),reserve:position.reserve.map(t=>t?{kind:t.kind,open:true}:null)};
 let packet;if(action.from.zone==='column')packet=copy.columns[action.from.index].splice(0,action.count);else{packet=[copy.reserve[action.from.index]];copy.reserve[action.from.index]=null;}
 if(action.to.zone==='column')copy.columns[action.to.index].unshift(...packet);else copy.reserve[action.to.index]=packet[0];
 if(reveal){const next=copy.columns[action.from.index][0];next.kind=-2;next.open=true;}
 const projectedCanonical=canonicalVisible(copy),selfLoop=projectedCanonical===canonicalVisible(position),strictReverse=previousCanonical!==null&&projectedCanonical===previousCanonical;
 return{kind,reveal,freeReserve,park,createsEmptyColumn,merge,targetEmpty,count:action.count,sourceHeight:from.length,targetHeight:target.length,projectedCanonical,selfLoop,strictReverse,meaningful:!selfLoop&&!strictReverse&&(reveal||freeReserve||createsEmptyColumn||merge)};
}
function makeVisibleStrategy(name){
 if(!STRATEGIES.includes(name))throw Error('Unknown visible strategy');
 const tried=new Set(),recentKinds=[];let previousCanonical=null;
 return{name,next(position){
  const raw=legalVisibleMoves(position),key=visibleKey(position);
  let candidates=raw.map(action=>({action,f:visibleFeatures(position,action,previousCanonical)})).filter(c=>!tried.has(key+JSON.stringify(c.action))&&!c.f.selfLoop&&!c.f.strictReverse);
  const meaningful=candidates.filter(c=>c.f.meaningful);if(meaningful.length)candidates=meaningful;if(!candidates.length)return null;
  const info=f=>Number(f.reveal)*100+Number(f.createsEmptyColumn)*60+Number(f.freeReserve)*25+Number(f.merge)*20+f.count*2-Number(f.park)*10;
  const space=f=>Number(f.freeReserve)*1000+Number(f.createsEmptyColumn)*900+Number(f.merge)*500+Number(f.reveal)*100+f.count*3-Number(f.park)*80;
  const frequency=kind=>recentKinds.filter(k=>k===kind).length;
  candidates.sort((a,b)=>name==='information-first'?info(b.f)-info(a.f):name==='space-first'?space(b.f)-space(a.f):frequency(a.f.kind)-frequency(b.f.kind)||b.f.kind-a.f.kind||info(b.f)-info(a.f));
  const selected=candidates[0];tried.add(key+JSON.stringify(selected.action));previousCanonical=canonicalVisible(position);recentKinds.push(selected.f.kind);if(recentKinds.length>12)recentKinds.shift();return structuredClone(selected.action);
 }};
}

window.__v06VisibleStrategies={names:STRATEGIES,make:makeVisibleStrategy,features:visibleFeatures,canonical:canonicalVisible};
})();

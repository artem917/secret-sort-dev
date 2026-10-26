import{visiblePosition}from'../../experimental/v05/src/game/visible.ts';
import{visibleFeatures}from'./v06-visible-strategies.mjs';
export function fullCanonical(position){return position.columns.map(c=>c.map(t=>`${t.kind}${t.open?'o':'h'}`).join('')).sort().join('|')+'#'+position.reserve.map(t=>t?.kind??-1).sort((a,b)=>a-b).join(',');}
export function kindTraceMetrics(kinds){
 let maxSameKindRun=0,run=0,equal=0;for(let i=0;i<kinds.length;i++){run=i&&kinds[i]===kinds[i-1]?run+1:1;maxSameKindRun=Math.max(maxSameKindRun,run);if(i&&kinds[i]===kinds[i-1])equal++;}
 const windows=[];for(let i=11;i<kinds.length;i++)windows.push(new Set(kinds.slice(i-11,i+1)).size);
 return{moves:kinds.length,maxSameKindRun,equalAdjacentFraction:kinds.length>1?equal/(kinds.length-1):null,distinctMovedKinds:new Set(kinds).size,rolling12Mean:windows.length?windows.reduce((a,b)=>a+b,0)/windows.length:null,rolling12Min:windows.length?Math.min(...windows):null,rolling12Max:windows.length?Math.max(...windows):null};
}
export function choiceMetrics(state,engine,previousCanonical=null){
 const visible=visiblePosition(state),currentKey=fullCanonical(state),raw=engine.legalMoves(state),choices=[];
 let selfLoops=0,strictReverseCycles=0;const rawKinds=new Set(),meaningfulKinds=new Set(),meaningfulDirections=new Set();
 for(const action of raw){const selected=action.from.zone==='column'?state.columns[action.from.index][0]:state.reserve[action.from.index];rawKinds.add(selected.kind);
  const n=engine.applyAction(state,action);if(!n.ok)throw Error(n.reason);const nextKey=fullCanonical(n.state),f=visibleFeatures(visible,action);
  const selfLoop=nextKey===currentKey,strictReverse=previousCanonical!==null&&nextKey===previousCanonical,progress=f.reveal||f.freeReserve||f.createsEmptyColumn||f.merge,meaningful=!selfLoop&&!strictReverse&&progress;
  if(selfLoop)selfLoops++;if(strictReverse)strictReverseCycles++;
  if(meaningful){meaningfulKinds.add(selected.kind);meaningfulDirections.add(`${action.from.zone}${action.from.index}>${action.to.zone}${action.to.index}`);}
  choices.push({action,kind:selected.kind,reveal:f.reveal,freeReserve:f.freeReserve,createsEmptyColumn:f.createsEmptyColumn,merge:f.merge,selfLoop,strictReverse,meaningful});
 }
 const open=state.columns.flat().filter(t=>t.open).length+state.reserve.filter(Boolean).length;
 return{phase:open<=36?'early':open<=72?'middle':'late',revealed:open,rawLegalActions:raw.length,selfLoops,strictReverseCycles,activeVisibleKinds:rawKinds.size,meaningfulMoves:choices.filter(c=>c.meaningful).length,meaningfulKinds:meaningfulKinds.size,meaningfulDirections:meaningfulDirections.size,choices};
}

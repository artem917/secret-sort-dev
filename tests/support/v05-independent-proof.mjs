// Independent lower-bound audit. Derives the first-unlock floor from the
// actual board, without reading the production certificate or its claims.
export function independentReserveFloor(columns) {
  if(columns.length!==10||JSON.stringify(columns.map(c=>c.length))!==JSON.stringify([10,11,11,11,11,11,11,11,11,10]))throw Error('heights');
  const tiles=columns.flat(),counts=Array(9).fill(0),ids=new Set();
  for(const t of tiles){if(t.open!==false||!Number.isInteger(t.kind)||t.kind<0||t.kind>8||!Number.isInteger(t.id)||Math.floor(t.id/12)!==t.kind||ids.has(t.id))throw Error('inventory');counts[t.kind]++;ids.add(t.id);}
  if(tiles.length!==108||counts.some(n=>n!==12))throw Error('counts');
  const runs=columns.map(c=>{let n=0;while(c[n]?.kind===c[0].kind)n++;return n;}),ports=new Map();
  columns.forEach((c,i)=>{const a=ports.get(c[0].kind)??[];a.push(i);ports.set(c[0].kind,a);});
  const pairs=[...ports].filter(([,indices])=>indices.length===2);
  if(ports.size!==9||pairs.length!==1||[...ports.values()].some(p=>p.length>2))throw Error('ports');
  const [kind,pair]=pairs[0],[a,b]=pair;
  if(columns[a].length!==11||columns[b].length!==11||runs[a]+runs[b]!==12||counts[kind]!==12)throw Error('gate mass');
  const uniqueFloors=columns.map((_,i)=>pair.includes(i)?Infinity:runs[i]);
  // To empty gateA, all twelve gate tiles must fit over gateB's fixed suffix
  // plus reserve. Capacity of gateB above that suffix is 12-(11-runs[b]).
  const gateFloors=[12-(12-(11-runs[b])),12-(12-(11-runs[a]))];
  const floor=Math.min(...uniqueFloors,...gateFloors);
  if(!Number.isInteger(floor)||floor<1||floor>4)throw Error('unsupported floor');
  return{minimumReserveForFirstUnlock:floor,gateFloors,uniqueFloors:uniqueFloors.filter(Number.isFinite),fixedSuffixLengths:pair.map(i=>11-runs[i])};
}

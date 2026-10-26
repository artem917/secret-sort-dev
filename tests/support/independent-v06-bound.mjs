import{createHash}from'node:crypto';
export const HEIGHTS=[10,11,11,11,11,11,11,11,11,10];
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
const prefix=c=>{let n=0;while(c[n]?.kind===c[0]?.kind)n++;return n;};
export function deriveGeneralCertificate(columns,required){
 if(!Number.isInteger(required)||required<1||required>4)throw Error('invalid required reserve');
 if(!Array.isArray(columns)||columns.length!==10||columns.some((c,i)=>!Array.isArray(c)||c.length!==HEIGHTS[i]))throw Error('initial heights');
 const counts=Array(9).fill(0),ids=new Set();
 for(const column of columns)for(const[tile,index]of column.map((t,i)=>[t,i])){
  if(!tile||!Number.isInteger(tile.id)||tile.id<0||tile.id>=108||!Number.isInteger(tile.kind)||tile.kind<0||tile.kind>8||Math.floor(tile.id/12)!==tile.kind||ids.has(tile.id)||tile.open!==(index===0))throw Error('initial inventory or open-mask');
  ids.add(tile.id);counts[tile.kind]++;
 }
 if(ids.size!==108||counts.some(n=>n!==12))throw Error('inventory counts');
 const ports=columns.map((c,column)=>({column,kind:c[0].kind,height:c.length,prefix:prefix(c),spare:12-c.length,fixedSuffix:c.length-prefix(c)}));
 const surfaceMass=Array(9).fill(0);for(const p of ports)surfaceMass[p.kind]+=p.prefix;
 for(const p of ports){p.otherSpares=ports.filter(other=>other.column!==p.column&&other.kind===p.kind).reduce((n,other)=>n+other.spare,0);p.floor=p.prefix-p.otherSpares;}
 const minimumFirstUnlockReserve=Math.min(...ports.map(p=>p.floor));if(minimumFirstUnlockReserve<required)throw Error('first-unlock bound insufficient');
 return{schema:'independent-general-first-unlock-v1',required,blockedReserve:required-1,capacity:12,heights:[...HEIGHTS],positionHash:createHash('sha256').update(stable(columns)).digest('hex'),ports,surfaceMass,minimumFirstUnlockReserve,theorem:'Before the first fixed-suffix exposure or empty port, only original surface-prefix mass can move. Clearing port i requires q >= a_i - sum of other same-kind port spares.'};
}
export function verifyGeneralCertificate(columns,certificate,claimedReserve=certificate?.blockedReserve){
 try{if(!certificate||claimedReserve!==certificate.required-1||claimedReserve!==certificate.blockedReserve)return{ok:false,reason:'reserve claim'};const computed=deriveGeneralCertificate(columns,certificate.required);if(stable(computed)!==stable(certificate))return{ok:false,reason:'certificate fields or binding'};return{ok:true,status:'LOSE',reserve:claimedReserve,minimumFirstUnlockReserve:computed.minimumFirstUnlockReserve};}catch(error){return{ok:false,reason:error.message};}
}

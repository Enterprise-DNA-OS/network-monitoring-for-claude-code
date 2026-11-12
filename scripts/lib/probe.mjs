import net from 'node:net';
import { lookup } from 'node:dns/promises';

export function validateTarget(kind, target) {
 if (kind==='external') { if(target) throw Error('External monitors do not accept a target'); return; }
 let u; try {u=new URL(target);} catch {throw Error('Target must be a complete http(s), tcp or dns URL');}
 if(u.username||u.password||u.search||u.hash) throw Error('Target must not contain credentials, query strings or fragments');
 if(!u.hostname) throw Error('Target needs a hostname');
 if(kind==='http'&&!['http:','https:'].includes(u.protocol)) throw Error('HTTP monitor requires http(s)');
 if(kind==='tcp'&&(u.protocol!=='tcp:'||!u.port||u.pathname)) throw Error('TCP target requires tcp://host:port');
 if(kind==='dns'&&(u.protocol!=='dns:'||u.port||u.pathname)) throw Error('DNS target requires dns://hostname');
 if(!['http','tcp','dns'].includes(kind)) throw Error('Unknown monitor kind');
 return u;
}
export async function probe(m) {
 const u=validateTarget(m.kind,m.target); const start=performance.now();
 try {
  let detail;
  if(m.kind==='http') {
   const res=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(m.timeout_ms),headers:{'User-Agent':'NetworkMonitoring/0.1'}});
   await res.body?.cancel(); detail=`HTTP ${res.status}`;
   return {outcome:res.status===m.expected_status?'up':'down',latency_ms:Math.round(performance.now()-start),detail};
  }
  if(m.kind==='tcp') await new Promise((resolve,reject)=>{
   const socket=net.createConnection({host:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port)});
   const timer=setTimeout(()=>{socket.destroy();reject(Error('Timeout'));},m.timeout_ms);
   socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve();});
   socket.once('error',e=>{clearTimeout(timer);socket.destroy();reject(e);});
  });
  else if(m.kind==='dns') {
   let timer;
   try {await Promise.race([lookup(u.hostname),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout')),m.timeout_ms);})]);}
   finally {clearTimeout(timer);}
  } else throw Error('No native collector for external monitor');
  detail=m.kind==='tcp'?'TCP connection accepted':'Hostname resolved';
  return {outcome:'up',latency_ms:Math.round(performance.now()-start),detail};
 } catch(e) {
  return {outcome:'down',latency_ms:Math.round(performance.now()-start),detail:e.name==='TimeoutError'||e.message==='Timeout'?'Timeout':'Connection or name resolution failed'};
 }
}

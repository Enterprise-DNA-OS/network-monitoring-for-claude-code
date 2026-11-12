#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb,REPO_ROOT } from './lib/db.mjs';
import { parseCsv,pick } from './lib/csv.mjs';
import { table } from './lib/format.mjs';
import { page,table as htmlTable,writeOut } from './lib/render.mjs';
import { validateTarget,probe } from './lib/probe.mjs';

export const READS={
 monitors:'select id,name,device,site,owner,kind,enabled,state,in_maintenance from monitor_state order by name',
 attention:'select name,site,owner,state,in_maintenance from attention order by site,name',
 stale:"select name,site,owner,state,observed_at from monitor_state where enabled and state in ('stale','unknown') order by name",
 unowned:"select name,device,site,state from monitor_state where owner='' order by name",
 failures:"select name,site,owner,state,in_maintenance from monitor_state where enabled and state='down' order by name",
 maintenance:'select m.name,w.starts_at,w.ends_at,w.reason,w.actor from maintenance w join monitors m on m.id=w.monitor_id where w.ends_at>now() order by w.starts_at',
 overdue:'select id,name,owner,note,due_at,state from overdue_followups order by due_at',
 'weekly-samples':'select name,site,samples,failed_samples,maintenance_samples,observed_success_pct,mean_latency_ms from sampling_week order by name',
 'site-review':"select site,count(*)::integer as monitors,count(*) filter(where enabled and state='down' and not in_maintenance)::integer as failures,count(*) filter(where enabled and state in ('stale','unknown'))::integer as missing_evidence from monitor_state group by site order by site",
 'owner-review':"select coalesce(nullif(owner,''),'Unassigned') as owner,count(*)::integer as monitors,count(*) filter(where enabled and state in ('down','stale','unknown'))::integer as needs_review from monitor_state group by owner order by owner",
 'migration-gaps':"select name,device,vendor_type,vendor_status,kind,enabled from monitors where source like 'prtg:%' and (not enabled or kind='external') order by name",
 'noisy-monitors':"select m.name,count(r.id)::integer as failed_samples from monitors m join readings r on m.id=r.monitor_id where r.observed_at>=now()-interval '7 days' and r.outcome='down' and not r.maintenance group by m.id,m.name order by failed_samples desc,m.name",
 compliance:'select * from compliance_findings order by rule,record',
 retention:"select m.name,count(*)::integer as old_readings from readings r join monitors m on m.id=r.monitor_id join policy p on true where r.observed_at<now()-make_interval(days=>p.retention_days) group by m.id,m.name order by m.name",
 audit:'select actor,action,record_id,details,created_at from audit order by created_at desc,id limit 100'
};
const WRITE=['add','configure','assign','enable','disable','import','ingest','collect','collect-due','plan-maintenance','log','close','review-policy'];
const FLAGS=['json','actor','name','device','site','owner','kind','target','interval','timeout','expected','upper-limit','unit','file','source','dry-run','allow-network','start','end','reason','note','due','evidence','purpose','access-due','retention-days','retention-due'];
function parse(args){const p=[],f={};for(const a of args){if(a.startsWith('--')){const [k,...v]=a.slice(2).split('=');if(!FLAGS.includes(k)||k in f)throw Error(`Unknown or repeated flag --${k}`);f[k]=v.length?v.join('='):true;}else p.push(a);}for(const k of ['json','dry-run','allow-network'])if(k in f&&f[k]!==true)throw Error(`--${k} takes no value`);return {p,f};}
function need(f,k){if(typeof f[k]!=='string'||!f[k].trim())throw Error(`Required --${k}=value`);return f[k].trim();}
function num(v,low,high,name){if(typeof v==='boolean'||v===''||!Number.isFinite(Number(v))||Number(v)<low||Number(v)>high)throw Error(`Invalid ${name}`);return Number(v);}
function integer(v,low,high,name){const n=num(v,low,high,name);if(!Number.isInteger(n))throw Error(`Invalid ${name}`);return n;}
function timestamp(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Use an ISO timestamp with seconds and timezone');return new Date(v).toISOString();}
function day(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Invalid calendar date');return v;}
export async function resolve(db,q,collection='monitors'){
 if(!q)throw Error('Supply an identifier or name');
 const rows=await db.query(collection==='monitors'?'select * from monitors':'select * from followups');
 const exact=rows.filter(r=>r.id===q||String(r.name||'').toLowerCase()===q.toLowerCase());
 const hit=exact.length?exact:rows.filter(r=>r.id.startsWith(q)||String(r.name||'').toLowerCase().includes(q.toLowerCase()));
 if(hit.length!==1)throw Error(`${hit.length?'Ambiguous':'No match'}: ${q}${hit.length?'\n'+hit.map(r=>`${r.id} ${r.name||r.note}`).join('\n'):''}`);return hit[0];
}
async function audit(db,actor,action,id,details){await db.query('insert into audit(actor,action,record_id,details) values($1,$2,$3,$4)',[actor,action,id,JSON.stringify(details)]);}
async function reading(db,m,r){
 const key=String(r.source_key||'').trim();if(!key)throw Error('Reading requires source_key');
 day(String(r.observed_at).slice(0,10));const observed=timestamp(r.observed_at);if(Date.parse(observed)>Date.now()+300000)throw Error('Future reading');
 if(!['up','down'].includes(r.outcome))throw Error('Reading outcome must be up or down');
 const value=r.value==null?null:num(r.value,-1e15,1e15,'value');
 if(m.upper_limit!==null&&value===null)throw Error('This monitor requires a numeric value');
 const outcome=m.upper_limit!==null&&value>Number(m.upper_limit)?'down':r.outcome;
 const latency=r.latency_ms==null?null:num(r.latency_ms,0,1e9,'latency');
 const detail=String(r.detail||'').slice(0,500);
 const existing=await db.query('select * from readings where source_key=$1',[key]);
 if(existing.length){const e=existing[0];if(e.monitor_id!==m.id||new Date(e.observed_at).toISOString()!==observed||e.outcome!==outcome||(e.value===null?null:Number(e.value))!==value||(e.latency_ms===null?null:Number(e.latency_ms))!==latency||e.detail!==detail||e.config_version!==m.config_version)throw Error(`Conflicting reading key: ${key}`);return false;}
 const [w]=await db.query('select exists(select 1 from maintenance where monitor_id=$1 and $2::timestamptz>=starts_at and $2::timestamptz<ends_at) as active',[m.id,observed]);
 await db.query('insert into readings(monitor_id,source_key,observed_at,outcome,value,latency_ms,detail,config_version,maintenance) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[m.id,key,observed,outcome,value,latency,detail,m.config_version,w.active]);return true;
}
function config(m,f){
 const c={...m};for(const k of ['kind','target','unit'])if(k in f)c[k]=need(f,k);
 c.kind??='external';c.target??='';c.unit??='';if(c.target==='none')c.target='';
 for(const [flag,column,dflt,low,high] of [['interval','interval_seconds',300,10,86400],['timeout','timeout_ms',5000,100,30000],['expected','expected_status',200,100,599]]) c[column]=flag in f?integer(f[flag],low,high,flag):(m[column]??dflt);
 c.upper_limit='upper-limit' in f?(f['upper-limit']==='none'?null:num(f['upper-limit'],-1e15,1e15,'upper-limit')):(m.upper_limit??null);
 validateTarget(c.kind,c.target);if(c.upper_limit!==null&&c.kind!=='external')throw Error('Numeric upper limits apply to external readings');return c;
}
export async function run(db,args){
 const {p,f}=parse(args);const command=p[0]||'help';
 const maxArgs=['import','monitor','history','configure','assign','enable','disable','collect','plan-maintenance','log','close','draft-monitor-brief'].includes(command)?2:1;
 if(p.length>maxArgs)throw Error('Unexpected positional arguments');
 if(command==='help')return [{commands:[...Object.keys(READS),'monitor','history',...WRITE,'weekly-review','draft-monitor-brief','export','help'].join(', '),syntax:'See docs/cli.md. Values use --flag=value. Every mutation requires --actor.'}];
 if(READS[command])return db.query(READS[command]);
 if(command==='monitor'||command==='history'){const m=await resolve(db,p[1]);return command==='monitor'?db.query('select * from monitor_state where id=$1',[m.id]):db.query('select observed_at,outcome,value,latency_ms,detail,maintenance,config_version from readings where monitor_id=$1 order by observed_at desc limit 100',[m.id]);}
 if(command==='export'){const out={format:'network-monitoring-v1',exported_at:new Date().toISOString()};await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{for(const t of ['monitors','readings','maintenance','followups','policy','audit'])out[t]=await db.query(`select * from ${t} order by id`);}finally{await db.exec('ROLLBACK');}if(f.file){const file=path.resolve(need(f,'file'));fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(out,null,2),{flag:'wx',mode:0o600});return [{file,collections:6}];}return out;}
 if(command==='weekly-review'||command==='draft-monitor-brief'){
  const sections=[];let name='weekly-review';
  if(command==='weekly-review'){for(const k of ['attention','overdue','weekly-samples','compliance'])sections.push({title:k,html:htmlTable(await db.query(READS[k]))});}
  else{const m=await resolve(db,p[1]);name=`monitor-${m.id}`;sections.push({title:m.name,html:htmlTable(await db.query('select name,site,owner,state,in_maintenance from monitor_state where id=$1',[m.id]))},{title:'Recent readings',html:htmlTable(await db.query('select observed_at,outcome,detail,maintenance from readings where monitor_id=$1 order by observed_at desc limit 25',[m.id]))},{title:'Follow-ups',html:htmlTable(await db.query('select owner,note,due_at,closed_at,evidence from followups where monitor_id=$1',[m.id]))});}
  return [{file:writeOut('drafts',name,page({title:command==='weekly-review'?'Weekly monitoring review':'Monitor investigation brief',subtitle:'Private draft. Observed sample ratios are not time-based uptime.',sections}))}];
 }
 if(command==='collect-due'){const actor=need(f,'actor');if(!f['allow-network'])throw Error('Collect requires --allow-network');if(f['dry-run'])throw Error('Use monitors to review targets before collecting');const rows=await db.query("select id from monitor_state where enabled and kind<>'external' and (observed_at is null or observed_at<now()-make_interval(secs=>interval_seconds)) order by observed_at nulls first,id limit 100");const results=[];for(const m of rows)results.push(...await run(db,['collect',m.id,'--actor='+actor,'--allow-network']));return results;}
 if(!WRITE.includes(command))throw Error(`Unknown command: ${command}`);
 const actor=need(f,'actor');
 if(f['dry-run']&&!['import','ingest'].includes(command))throw Error('--dry-run is supported only by import and ingest');
 await db.exec('BEGIN');
 try{
  let result;
  if(command==='add'){
   const c=config({},f);const [m]=await db.query('insert into monitors(source,source_id,name,device,site,owner,kind,target,interval_seconds,timeout_ms,expected_status,upper_limit,unit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *',['local',randomUUID(),need(f,'name'),f.device?need(f,'device'):'',f.site?need(f,'site'):'',need(f,'owner'),c.kind,c.target,c.interval_seconds,c.timeout_ms,c.expected_status,c.upper_limit,c.unit]);result=[{id:m.id,name:m.name,enabled:false}];await audit(db,actor,command,m.id,{name:m.name});
  }else if(command==='import'){
   if(p[1]!=='prtg')throw Error('Import supports prtg');const source='prtg:'+need(f,'source');const rows=parseCsv(fs.readFileSync(need(f,'file'),'utf8'));if(!rows.length)throw Error('Empty sensor export');let added=0,unchanged=0;const seen=new Set();
   for(const r of rows){const id=pick(r,'objid','ID','Object ID'),name=pick(r,'sensor','name','Sensor');if(!/^\d+$/.test(id)||!name.trim())throw Error('Each row needs a numeric objid/ID and sensor/name');if(seen.has(id))throw Error('Duplicate source ID in export: '+id);seen.add(id);const values=[name,pick(r,'device'),[pick(r,'probe'),pick(r,'group')].filter(Boolean).join(' / '),pick(r,'type'),pick(r,'status')];const [old]=await db.query('select * from monitors where source=$1 and source_id=$2',[source,id]);if(old){if([old.name,old.device,old.site,old.vendor_type,old.vendor_status].some((v,i)=>v!==values[i]))throw Error(`Changed source inventory ${id}: reconcile it explicitly before reimport`);unchanged++;}else{await db.query('insert into monitors(source,source_id,name,device,site,vendor_type,vendor_status) values($1,$2,$3,$4,$5,$6,$7)',[source,id,...values]);added++;}}
   result=[{rows:rows.length,added,unchanged,enabled:0,dry_run:!!f['dry-run']}];await audit(db,actor,'import',source,result[0]);
  }else if(command==='ingest'){
   const rows=JSON.parse(fs.readFileSync(need(f,'file'),'utf8'));if(!Array.isArray(rows)||!rows.length)throw Error('Provide a nonempty reading array');let added=0;
   for(const r of rows){const m=await resolve(db,r.monitor);if(m.kind!=='external')throw Error('Ingest only accepts external monitors');if(await reading(db,m,r))added++;}result=[{rows:rows.length,added,unchanged:rows.length-added,dry_run:!!f['dry-run']}];await audit(db,actor,'ingest','readings',result[0]);
  }else if(command==='review-policy'){
   result=await db.query("insert into policy(name,purpose,reviewed_by,access_review_due,retention_days,retention_review_due) values('monitoring',$1,$2,$3,$4,$5) on conflict(name) do update set purpose=excluded.purpose,reviewed_by=excluded.reviewed_by,access_review_due=excluded.access_review_due,retention_days=excluded.retention_days,retention_review_due=excluded.retention_review_due returning *",[need(f,'purpose'),actor,day(need(f,'access-due')),integer(need(f,'retention-days'),1,3650,'retention days'),day(need(f,'retention-due'))]);await audit(db,actor,command,result[0].id,{purpose:result[0].purpose});
  }else if(command==='close'){
   const item=await resolve(db,p[1],'followups');if(item.closed_at)throw Error('Follow-up already closed');const [s]=await db.query('select * from monitor_state where id=$1',[item.monitor_id]);if(s.state!=='up'||s.in_maintenance)throw Error('Close needs a fresh up reading outside current maintenance');result=await db.query('update followups set closed_at=now(),evidence=$1 where id=$2 returning id,closed_at',[need(f,'evidence'),item.id]);await audit(db,actor,command,item.id,{evidence:f.evidence});
  }else{
   const m=await resolve(db,p[1]);
   if(command==='configure'){
    const c=config(m,f);result=await db.query('update monitors set kind=$1,target=$2,interval_seconds=$3,timeout_ms=$4,expected_status=$5,upper_limit=$6,unit=$7,config_version=config_version+1,enabled=false where id=$8 returning id,kind,target,config_version,enabled',[c.kind,c.target,c.interval_seconds,c.timeout_ms,c.expected_status,c.upper_limit,c.unit,m.id]);
   }else if(command==='assign'){result=await db.query('update monitors set owner=$1 where id=$2 returning id,name,owner',[need(f,'owner'),m.id]);}
   else if(command==='enable'||command==='disable'){if(command==='enable'){if(!m.owner)throw Error('Assign an owner before enabling');validateTarget(m.kind,m.target);}result=await db.query('update monitors set enabled=$1 where id=$2 returning id,name,enabled',[command==='enable',m.id]);}
   else if(command==='collect'){
    if(!f['allow-network'])throw Error('Collect requires --allow-network for an authorised target');if(!m.enabled||m.kind==='external')throw Error('Enable a native monitor before collection');
    const r=await probe(m);await reading(db,m,{...r,observed_at:new Date().toISOString(),source_key:'native:'+randomUUID()});result=[{name:m.name,...r}];
   }else if(command==='plan-maintenance'){
    const start=timestamp(need(f,'start')),end=timestamp(need(f,'end'));if(Date.parse(start)<Date.now()-60000)throw Error('Maintenance must be planned now or in the future');if(Date.parse(end)<=Date.parse(start))throw Error('Maintenance end must follow start');result=await db.query('insert into maintenance(monitor_id,starts_at,ends_at,reason,actor) values($1,$2,$3,$4,$5) returning *',[m.id,start,end,need(f,'reason'),actor]);
   }else if(command==='log'){result=await db.query('insert into followups(monitor_id,owner,note,due_at) values($1,$2,$3,$4) returning *',[m.id,need(f,'owner'),need(f,'note'),timestamp(need(f,'due'))]);}
   await audit(db,actor,command,m.id,{before:{owner:m.owner,kind:m.kind,target:m.target,config_version:m.config_version,enabled:m.enabled},result});
  }
  await db.exec(f['dry-run']?'ROLLBACK':'COMMIT');return result;
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
export function output(result,json=false){if(json||!Array.isArray(result))return JSON.stringify(result,null,2);if(!result.length)return '  (none)';return table(result,Object.keys(result[0]).map(key=>({key,label:key,format:v=>typeof v==='object'&&v!==null?JSON.stringify(v):v,width:90})));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){let db;try{db=await getDb();console.log(output(await run(db,process.argv.slice(2)),process.argv.includes('--json')));}catch(e){console.error(e.message);process.exitCode=1;}finally{await db?.close();}}

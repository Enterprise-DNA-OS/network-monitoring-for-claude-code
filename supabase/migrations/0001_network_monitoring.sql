create table monitors (
 id uuid primary key default gen_random_uuid(), source text not null, source_id text not null,
 name text not null check(length(trim(name))>0), device text not null default '', site text not null default '',
 vendor_type text not null default '', vendor_status text not null default '', owner text not null default '',
 kind text not null default 'external' check(kind in ('external','http','tcp','dns')), target text not null default '',
 enabled boolean not null default false, interval_seconds integer not null default 300 check(interval_seconds between 10 and 86400),
 timeout_ms integer not null default 5000 check(timeout_ms between 100 and 30000),
 expected_status integer not null default 200 check(expected_status between 100 and 599),
 upper_limit numeric, unit text not null default '', config_version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(source,source_id),
 check(not enabled or kind='external' or length(target)>0)
);
create table readings (
 id uuid primary key default gen_random_uuid(), monitor_id uuid not null references monitors,
 source_key text not null unique, observed_at timestamptz not null check(observed_at <= now()+interval '5 minutes'),
 outcome text not null check(outcome in ('up','down')), value numeric, latency_ms numeric check(latency_ms>=0),
 detail text not null default '', config_version integer not null, maintenance boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index readings_monitor_time on readings(monitor_id,observed_at desc);
create table maintenance (
 id uuid primary key default gen_random_uuid(), monitor_id uuid not null references monitors,
 starts_at timestamptz not null, ends_at timestamptz not null, reason text not null check(length(trim(reason))>0),
 actor text not null check(length(trim(actor))>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create table followups (
 id uuid primary key default gen_random_uuid(), monitor_id uuid not null references monitors,
 owner text not null check(length(trim(owner))>0), note text not null check(length(trim(note))>0), due_at timestamptz not null,
 closed_at timestamptz, evidence text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((closed_at is null and evidence is null) or (closed_at is not null and length(trim(evidence))>0))
);
create table policy (
 id uuid primary key default gen_random_uuid(), name text not null unique default 'monitoring', purpose text not null,
 reviewed_by text not null, access_review_due date not null, retention_days integer not null check(retention_days between 1 and 3650),
 retention_review_due date not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table audit (
 id uuid primary key default gen_random_uuid(), actor text not null, action text not null, record_id text not null, details jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function touch_monitoring_record() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create function preserve_monitoring_evidence() returns trigger language plpgsql as $$ begin raise exception 'Evidence is append-only; use authorised retention administration'; end $$;
create trigger monitors_touch before update on monitors for each row execute function touch_monitoring_record();
create trigger followups_touch before update on followups for each row execute function touch_monitoring_record();
create trigger policy_touch before update on policy for each row execute function touch_monitoring_record();
create trigger readings_preserve before update or delete on readings for each row execute function preserve_monitoring_evidence();
create trigger maintenance_preserve before update or delete on maintenance for each row execute function preserve_monitoring_evidence();
create trigger audit_preserve before update or delete on audit for each row execute function preserve_monitoring_evidence();
create view monitor_state as
select m.*, r.observed_at, r.outcome as last_outcome, r.value, r.latency_ms, r.detail,
 exists(select 1 from maintenance w where w.monitor_id=m.id and now()>=w.starts_at and now()<w.ends_at) as in_maintenance,
 case when not m.enabled then 'disabled'
 when r.id is null or r.config_version<>m.config_version then 'unknown'
 when r.observed_at<now()-make_interval(secs=>m.interval_seconds*2) then 'stale'
 else r.outcome end as state
from monitors m left join lateral (select * from readings where monitor_id=m.id order by observed_at desc,created_at desc,id desc limit 1) r on true;
create view attention as select id,name,device,site,owner,state,in_maintenance,observed_at from monitor_state
where enabled and (state in ('unknown','stale') or (state='down' and not in_maintenance) or owner='');
create view sampling_week as
select m.id,m.name,m.site,count(r.id)::integer as samples,
 count(r.id) filter(where r.outcome='down' and not r.maintenance)::integer as failed_samples,
 count(r.id) filter(where r.maintenance)::integer as maintenance_samples,
 round(100.0*count(r.id) filter(where r.outcome='up' and not r.maintenance)/nullif(count(r.id) filter(where not r.maintenance),0),2) as observed_success_pct,
 round(avg(r.latency_ms),2) as mean_latency_ms
from monitors m left join readings r on r.monitor_id=m.id and r.observed_at>=now()-interval '7 days' group by m.id,m.name,m.site;
create view overdue_followups as select f.id,m.name,f.owner,f.note,f.due_at,s.state from followups f join monitors m on m.id=f.monitor_id join monitor_state s on s.id=m.id where f.closed_at is null and f.due_at<now();
create view compliance_findings as
select 'owner' as rule,id::text as record,name as finding,'House rule' as source from monitors where enabled and owner=''
union all select 'coverage',id::text,name||': '||state,'House rule' from monitor_state where enabled and state in ('unknown','stale')
union all select 'policy-missing','monitoring','Record monitoring purpose, access review and retention policy','NZ IPP5 and IPP9' where not exists(select 1 from policy)
union all select 'access-review',id::text,'Access review overdue','NZ IPP5' from policy where access_review_due<current_date
union all select 'retention-review',id::text,'Retention purpose review overdue','NZ IPP9' from policy where retention_review_due<current_date
union all select 'retention-age',p.id::text,'Readings exceed the configured retention period','NZ IPP9' from policy p where exists(select 1 from readings r where r.observed_at<now()-make_interval(days=>p.retention_days));
do $$ declare t text; begin foreach t in array array['monitors','readings','maintenance','followups','policy','audit'] loop execute format('alter table %I enable row level security',t); execute format('revoke all on %I from public',t); end loop; end $$;
revoke all on monitor_state,attention,sampling_week,overdue_followups,compliance_findings from public;

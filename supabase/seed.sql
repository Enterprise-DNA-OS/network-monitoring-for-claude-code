do $$ begin
if exists(select 1 from monitors) then return; end if;
insert into monitors(id,source,source_id,name,device,site,owner,kind,enabled,interval_seconds,upper_limit,unit) values
('10000000-0000-4000-8000-000000000001','demo','101','Order portal','portal.example.test','Auckland','Mere','external',true,300,null,''),
('10000000-0000-4000-8000-000000000002','demo','102','Warehouse link','edge-02','Hamilton','','external',true,300,null,''),
('10000000-0000-4000-8000-000000000003','demo','103','Backup storage','backup-01','Auckland','Noah','external',true,300,85,'percent'),
('10000000-0000-4000-8000-000000000004','demo','104','Branch DNS','resolver-01','Wellington','Mere','external',true,300,null,''),
('10000000-0000-4000-8000-000000000005','demo','105','Legacy router','router-09','Hamilton','','external',false,300,null,''),
('10000000-0000-4000-8000-000000000006','demo','106','Warehouse spare','edge-03','Hamilton','Noah','external',true,300,null,'');
insert into maintenance(id,monitor_id,starts_at,ends_at,reason,actor) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',now()-interval '1 hour',now()+interval '1 hour','Resolver firmware window','Mere');
insert into readings(monitor_id,source_key,observed_at,outcome,value,latency_ms,config_version,maintenance,detail) values
('10000000-0000-4000-8000-000000000001','demo-1',now()-interval '1 minute','up',null,120,1,false,'Demo successful response'),
('10000000-0000-4000-8000-000000000001','demo-2',now()-interval '1 day','down',null,5000,1,false,'Demo timeout'),
('10000000-0000-4000-8000-000000000002','demo-3',now()-interval '1 minute','down',null,5000,1,false,'Demo failed link'),
('10000000-0000-4000-8000-000000000003','demo-4',now()-interval '2 days','up',71,10,1,false,'Collector stopped after this reading'),
('10000000-0000-4000-8000-000000000004','demo-5',now()-interval '1 minute','down',null,5000,1,true,'Planned resolver restart'),
('10000000-0000-4000-8000-000000000003','demo-6',now()-interval '100 days','up',60,12,1,false,'Old reading for retention review');
insert into followups(id,monitor_id,owner,note,due_at) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Noah','Confirm uplink recovery and record evidence',now()-interval '1 day');
insert into policy(purpose,reviewed_by,access_review_due,retention_days,retention_review_due) values('Service availability and named response ownership','Mere',current_date-7,90,current_date+30);
insert into audit(actor,action,record_id,details) values('demo','seed','demo','{"synthetic":true}');
end $$;

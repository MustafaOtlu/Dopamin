alter table background_jobs add column manual_retries integer not null default 0 check(manual_retries between 0 and 5);
alter table background_jobs add column lease_token uuid;
alter table background_jobs add column heartbeat_at timestamptz;

alter table courses add column automatic_consent_at timestamptz;
alter table courses add column automatic_consent_by uuid references profiles(id);
-- Existing policy values have no recorded consent: require a fresh explicit choice.
update courses set publish_mode='review';
alter table generation_reviews add column version_id uuid references activity_versions(id);
update generation_reviews r set version_id=v.id from activities a join activity_versions v
on v.activity_id=a.id and v.version=1 where r.activity_id=a.id;
create index generation_review_job_idx on generation_reviews(job_id,status);

alter table plan_items add column plan_date date;
update plan_items i set plan_date=p.date from daily_plans p where p.id=i.plan_id;
alter table plan_items alter column plan_date set not null;
create index plan_item_course_date_idx on plan_items(course_id,plan_date,user_id);

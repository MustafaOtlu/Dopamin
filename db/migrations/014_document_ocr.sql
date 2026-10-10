alter table documents add column ocr_pages jsonb not null default '[]';
alter table documents add column ocr_confidence numeric check(ocr_confidence between 0 and 100);

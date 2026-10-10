-- Assignment attachments are PDFs. Their independent read grant must not bypass
-- the revision-bound permission and explicit sharing of web snapshots.
drop policy assignment_document_read on documents;
create policy assignment_document_read on documents for select using(
 source_kind='pdf' and status='ready' and exists(select 1 from assignment_resources r
 where r.file_id=documents.file_id and can_read_assignment(r.assignment_id))
);
drop policy assignment_file_read on files;
create policy assignment_file_read on files for select using(
 exists(select 1 from documents d where d.file_id=files.id and d.source_kind='pdf')
 and exists(select 1 from assignment_resources r where r.file_id=files.id and can_read_assignment(r.assignment_id))
);
create index documents_web_permission on documents(source_permission_id) where source_kind='web';

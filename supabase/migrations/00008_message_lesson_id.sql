-- Associate messages with specific lessons
alter table messages add column lesson_id uuid references lessons(id) on delete set null;
create index idx_messages_lesson_id on messages(lesson_id);

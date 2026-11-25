-- Create storage bucket for message attachments
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload
create policy "Authenticated users can upload attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'message-attachments');

-- Allow authenticated users to read
create policy "Anyone can read message attachments"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'message-attachments');

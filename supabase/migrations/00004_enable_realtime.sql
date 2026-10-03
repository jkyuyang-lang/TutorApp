-- Enable Realtime on messages and notifications tables
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;

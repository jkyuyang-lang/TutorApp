-- Auto-create tutor_clients record when a lesson is booked.
-- Runs as security definer so the booker doesn't need INSERT on tutor_clients.

create or replace function auto_create_tutor_client()
returns trigger as $$
begin
  insert into tutor_clients (tutor_id, account_holder_id, status)
  select NEW.tutor_id, l.account_holder_id, 'active'
  from learners l
  where l.id = NEW.learner_id
  on conflict (tutor_id, account_holder_id) do update
    set status = case
      when tutor_clients.status = 'blocked' then 'blocked'
      else 'active'
    end;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_auto_tutor_client
  after insert on lessons
  for each row
  execute function auto_create_tutor_client();

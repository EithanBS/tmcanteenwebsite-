-- Atomic wallet transfer in a single transaction
-- Creates a SECURITY DEFINER function so it can bypass RLS if enabled
-- Usage: select transfer_funds(sender_id := '...', recipient_id := '...', amount := 1000);

create or replace function transfer_funds(
  sender_id uuid,
  recipient_id uuid,
  amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_balance numeric;
begin
  if amount is null or amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if sender_id is null or recipient_id is null then
    raise exception 'Sender and recipient are required';
  end if;
  if sender_id = recipient_id then
    raise exception 'Cannot send to self';
  end if;

  -- Lock sender and recipient rows in a consistent order to avoid deadlocks
  if sender_id < recipient_id then
    perform 1 from users where id = sender_id for update;
    perform 1 from users where id = recipient_id for update;
  else
    perform 1 from users where id = recipient_id for update;
    perform 1 from users where id = sender_id for update;
  end if;

  select wallet_balance into sender_balance from users where id = sender_id;
  if sender_balance is null then
    raise exception 'Sender not found';
  end if;
  if sender_balance < amount then
    raise exception 'Insufficient balance';
  end if;

  update users set wallet_balance = wallet_balance - amount where id = sender_id;
  if not found then raise exception 'Failed to debit sender'; end if;

  update users set wallet_balance = wallet_balance + amount where id = recipient_id;
  if not found then raise exception 'Recipient not found'; end if;

  insert into transactions(sender_id, receiver_id, amount, type)
  values (sender_id, recipient_id, amount, 'transfer');
end;
$$;

-- Allow execution from both anon and authenticated roles
do $$
begin
  begin
    grant execute on function transfer_funds(uuid, uuid, numeric) to anon;
  exception when others then null;
  end;
  begin
    grant execute on function transfer_funds(uuid, uuid, numeric) to authenticated;
  exception when others then null;
  end;
end
$$;

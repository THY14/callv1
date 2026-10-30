-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel text not null,
  author text not null check (char_length(author) between 1 and 32),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Fast "latest messages in this channel" queries
create index if not exists messages_channel_id_idx on public.messages (channel, id desc);

-- Browsers (publishable/anon key) may only READ. Writes go through our
-- /api/messages route, which uses the secret key and validates input.
alter table public.messages enable row level security;

drop policy if exists "Anyone can read messages" on public.messages;
create policy "Anyone can read messages"
  on public.messages for select
  to anon, authenticated
  using (true);

-- Push new rows to browsers in realtime
alter publication supabase_realtime add table public.messages;

-- v2: edit / delete your own messages
-- author_key = SHA-256 of the sender's browser token (safe to expose; the token itself is never stored)
alter table public.messages add column if not exists author_key text;
alter table public.messages add column if not exists edited_at timestamptz;

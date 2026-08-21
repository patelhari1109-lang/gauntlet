-- ============================================================================
-- Gauntlet — Supabase setup
--
-- Run this ONCE in your Supabase project:  Dashboard -> SQL Editor -> New query
-- -> paste this whole file -> Run.
--
-- ⚠️  BEFORE YOU RUN IT: change the passcode on the last line of this file.
--     That passcode is what your scorers type in to be allowed to enter scores.
--
-- Security model
-- --------------
-- The anon key that lives in the web page can only ever READ. Every write goes
-- through a `security definer` function that checks the passcode first, so a
-- player who views the page source still cannot change a single score or
-- un-eliminate their own team. The passcode itself lives in a table with row
-- level security on and no policy, which means nothing holding the anon key can
-- read it — only these functions, which run as the table owner.
--
-- Everything is prefixed `gauntlet_`, so this can share one Supabase project
-- with other scoreboards without colliding.
-- ============================================================================

-- ---------------------------------------------------------------- tables ---

create table if not exists gauntlet_secret (
  id  int primary key default 1 check (id = 1),
  pin text not null
);

create table if not exists gauntlet_config (
  id         int primary key default 1 check (id = 1),
  event      jsonb not null,
  rules      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists gauntlet_teams (
  id         text primary key,
  name       text not null,
  color      text,
  emoji      text,
  members    text,
  out_round  int,                     -- null = still in; otherwise the round it went out in
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists gauntlet_rounds (
  id         text primary key,
  idx        int  not null,           -- 1, 2, 3 … the order rounds are played in
  name       text not null,
  note       text,
  status     text not null default 'active',   -- active | done
  elim       jsonb not null default '[]'::jsonb,  -- team ids knocked out by this round
  locked_at  bigint,
  updated_at timestamptz not null default now()
);

create table if not exists gauntlet_games (
  id         text primary key,
  round_id   text not null,
  name       text not null,
  icon       text,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists gauntlet_scores (
  game_id    text not null,
  team_id    text not null,
  value      numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_id)
);

create index if not exists gauntlet_games_round_idx  on gauntlet_games (round_id);
create index if not exists gauntlet_scores_team_idx  on gauntlet_scores (team_id);

-- ------------------------------------------------------------------ rls ---

alter table gauntlet_secret enable row level security;
alter table gauntlet_config enable row level security;
alter table gauntlet_teams  enable row level security;
alter table gauntlet_rounds enable row level security;
alter table gauntlet_games  enable row level security;
alter table gauntlet_scores enable row level security;

-- Anyone with the link may watch the scoreboard.
drop policy if exists "gauntlet public read config" on gauntlet_config;
drop policy if exists "gauntlet public read teams"  on gauntlet_teams;
drop policy if exists "gauntlet public read rounds" on gauntlet_rounds;
drop policy if exists "gauntlet public read games"  on gauntlet_games;
drop policy if exists "gauntlet public read scores" on gauntlet_scores;
create policy "gauntlet public read config" on gauntlet_config for select using (true);
create policy "gauntlet public read teams"  on gauntlet_teams  for select using (true);
create policy "gauntlet public read rounds" on gauntlet_rounds for select using (true);
create policy "gauntlet public read games"  on gauntlet_games  for select using (true);
create policy "gauntlet public read scores" on gauntlet_scores for select using (true);

-- gauntlet_secret deliberately has NO policy at all, so the anon key cannot read
-- the passcode. No table has an insert/update/delete policy, so the anon key
-- cannot write anything directly either.

-- ------------------------------------------------------------- functions ---

-- Internal guard. Not callable by the public — see the revoke further down.
create or replace function gauntlet_check(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is null or p_pin <> (select pin from gauntlet_secret where id = 1) then
    raise exception 'Wrong scorer passcode' using errcode = '28000';
  end if;
end $$;

create or replace function gauntlet_verify_pin(p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return exists (select 1 from gauntlet_secret where id = 1 and pin = p_pin);
end $$;

-- Cheap change-detector the app polls a few times a minute. The counts are what
-- make deletions visible, since a deleted row leaves no timestamp behind.
create or replace function gauntlet_revision()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    't',  (select coalesce(max(updated_at)::text, '') from gauntlet_teams),
    'tc', (select count(*) from gauntlet_teams),
    'r',  (select coalesce(max(updated_at)::text, '') from gauntlet_rounds),
    'rc', (select count(*) from gauntlet_rounds),
    'g',  (select coalesce(max(updated_at)::text, '') from gauntlet_games),
    'gc', (select count(*) from gauntlet_games),
    's',  (select coalesce(max(updated_at)::text, '') from gauntlet_scores),
    'sc', (select count(*) from gauntlet_scores),
    'c',  (select coalesce(max(updated_at)::text, '') from gauntlet_config)
  );
$$;

create or replace function gauntlet_upsert_team(p_pin text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  insert into gauntlet_teams (id, name, color, emoji, members, out_round, sort, updated_at)
  values (p->>'id', p->>'name', p->>'color', p->>'emoji', p->>'members',
          nullif(p->>'out', '')::int, coalesce(nullif(p->>'sort', '')::int, 0), now())
  on conflict (id) do update
    set name = excluded.name, color = excluded.color, emoji = excluded.emoji,
        members = excluded.members, out_round = excluded.out_round,
        sort = excluded.sort, updated_at = now();
end $$;

create or replace function gauntlet_delete_team(p_pin text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores where team_id = p_id;
  delete from gauntlet_teams  where id = p_id;
  -- a deleted team must not linger in any round's elimination list
  update gauntlet_rounds
     set elim = (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from jsonb_array_elements(elim) e where e <> to_jsonb(p_id)),
         updated_at = now()
   where elim @> to_jsonb(array[p_id]);
end $$;

create or replace function gauntlet_upsert_round(p_pin text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  insert into gauntlet_rounds (id, idx, name, note, status, elim, locked_at, updated_at)
  values (p->>'id', (p->>'idx')::int, p->>'name', p->>'note',
          coalesce(nullif(p->>'status', ''), 'active'),
          coalesce(p->'elim', '[]'::jsonb), nullif(p->>'lockedAt', '')::bigint, now())
  on conflict (id) do update set
    idx = excluded.idx, name = excluded.name, note = excluded.note,
    status = excluded.status, elim = excluded.elim,
    locked_at = excluded.locked_at, updated_at = now();
end $$;

create or replace function gauntlet_delete_round(p_pin text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores where game_id in (select id from gauntlet_games where round_id = p_id);
  delete from gauntlet_games  where round_id = p_id;
  delete from gauntlet_rounds where id = p_id;
end $$;

create or replace function gauntlet_upsert_game(p_pin text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  insert into gauntlet_games (id, round_id, name, icon, sort, updated_at)
  values (p->>'id', p->>'roundId', p->>'name', p->>'icon',
          coalesce(nullif(p->>'sort', '')::int, 0), now())
  on conflict (id) do update set
    round_id = excluded.round_id, name = excluded.name, icon = excluded.icon,
    sort = excluded.sort, updated_at = now();
end $$;

create or replace function gauntlet_delete_game(p_pin text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores where game_id = p_id;
  delete from gauntlet_games  where id = p_id;
end $$;

-- One cell of the score grid. A null value clears the cell entirely, which is
-- different from a zero — "hasn't played yet" vs "scored nothing".
create or replace function gauntlet_set_score(p_pin text, p_game text, p_team text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  if p_value is null then
    delete from gauntlet_scores where game_id = p_game and team_id = p_team;
  else
    insert into gauntlet_scores (game_id, team_id, value, updated_at)
    values (p_game, p_team, p_value, now())
    on conflict (game_id, team_id) do update
      set value = excluded.value, updated_at = now();
  end if;
end $$;

create or replace function gauntlet_save_config(p_pin text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  insert into gauntlet_config (id, event, rules, updated_at)
  values (1, p->'event', p->'rules', now())
  on conflict (id) do update set
    event = excluded.event, rules = excluded.rules, updated_at = now();
end $$;

-- Wipes the event clean. Config (event name, rules) is left alone.
create or replace function gauntlet_reset(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores;
  delete from gauntlet_games;
  delete from gauntlet_rounds;
  delete from gauntlet_teams;
end $$;

-- Clears every score and revives every team, but keeps the teams, rounds and
-- the list of games — the "let's run it again" button.
create or replace function gauntlet_restart(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores;
  update gauntlet_teams  set out_round = null, updated_at = now();
  update gauntlet_rounds set status = 'active', elim = '[]'::jsonb,
                             locked_at = null, updated_at = now();
end $$;

-- Lets you rotate the passcode without opening the SQL editor again.
create or replace function gauntlet_set_pin(p_pin text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  if length(coalesce(p_new, '')) < 4 then
    raise exception 'New passcode must be at least 4 characters';
  end if;
  update gauntlet_secret set pin = p_new where id = 1;
end $$;

-- ------------------------------------------------------------- privileges ---

-- Stated explicitly rather than inherited from the project defaults, so the
-- security model is readable here and does not depend on how the project was
-- provisioned: the anon key may read the scoreboard and nothing else.
grant usage on schema public to anon, authenticated;
grant select on gauntlet_config, gauntlet_teams, gauntlet_rounds,
                gauntlet_games, gauntlet_scores to anon, authenticated;
revoke insert, update, delete on gauntlet_config, gauntlet_teams, gauntlet_rounds,
                                 gauntlet_games, gauntlet_scores from anon, authenticated;
revoke all on gauntlet_secret from anon, authenticated;

revoke execute on function gauntlet_check(text) from public, anon, authenticated;

grant execute on function
  gauntlet_verify_pin(text), gauntlet_revision(),
  gauntlet_upsert_team(text, jsonb),  gauntlet_delete_team(text, text),
  gauntlet_upsert_round(text, jsonb), gauntlet_delete_round(text, text),
  gauntlet_upsert_game(text, jsonb),  gauntlet_delete_game(text, text),
  gauntlet_set_score(text, text, text, numeric),
  gauntlet_save_config(text, jsonb),  gauntlet_reset(text),
  gauntlet_restart(text),             gauntlet_set_pin(text, text)
to anon, authenticated;

-- ------------------------------------------------------------------ seed ---

insert into gauntlet_config (id, event, rules) values (1,
  '{"name":"Fun Games","tagline":"Last team standing"}'::jsonb,
  '{"basis":"round","perRound":1,"direction":"high","confirm":true}'::jsonb
) on conflict (id) do nothing;


-- ⚠️  CHANGE THIS PASSCODE before running. Give it only to your scorers.
insert into gauntlet_secret (id, pin) values (1, 'gauntlet2026')
on conflict (id) do nothing;

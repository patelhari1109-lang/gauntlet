-- ============================================================================
-- Gauntlet — Supabase setup
--
-- Run this ONCE in your Supabase project:  Dashboard -> SQL Editor -> New query
-- -> paste this whole file -> Run.
--
-- ⚠️  BEFORE YOU RUN IT: change the passcode on the last line of this file.
--     That passcode is what your scorers type in to be allowed to enter scores.
--
-- Safe to re-run: it only adds what is missing and never touches your scores.
-- If you ran the earlier rounds-based version of this file, re-running this one
-- upgrades you in place (see the upgrade block below).
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
  out_game   int,                     -- null = still in; otherwise the game it went out on
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per game. Games are played in `idx` order; locking one applies its
-- eliminations and closes it for editing.
create table if not exists gauntlet_games (
  id         text primary key,
  idx        int  not null,
  name       text not null,
  icon       text,
  note       text,
  status     text not null default 'active',      -- active | done
  elim       jsonb not null default '[]'::jsonb,  -- team ids knocked out by this game
  locked_at  bigint,
  updated_at timestamptz not null default now()
);

create table if not exists gauntlet_scores (
  game_id    text not null,
  team_id    text not null,
  value      numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, team_id)
);

create index if not exists gauntlet_scores_team_idx on gauntlet_scores (team_id);

-- ------------------------------------------------- upgrade from v1 (rounds) ---
-- The first version of this app nested games inside rounds. Everything is one
-- flat list of games now, so an older install is migrated here rather than
-- being left broken. A fresh install skips all of this.

do $$
declare
  has_rounds boolean := exists (select 1 from information_schema.tables
                                 where table_name = 'gauntlet_rounds')
                    and exists (select 1 from information_schema.columns
                                 where table_name = 'gauntlet_games' and column_name = 'round_id');
begin
  -- games used to live under a round and carry none of the round's own fields
  alter table gauntlet_games add column if not exists idx       int;
  alter table gauntlet_games add column if not exists note      text;
  alter table gauntlet_games add column if not exists status    text not null default 'active';
  alter table gauntlet_games add column if not exists elim      jsonb not null default '[]'::jsonb;
  alter table gauntlet_games add column if not exists locked_at bigint;

  if has_rounds then
    -- number every game in the order it was actually played, and carry down the
    -- status, timestamp and note of the round it belonged to
    update gauntlet_games g
       set idx       = o.rn,
           status    = o.status,
           locked_at = o.locked_at,
           note      = coalesce(g.note, o.note)
      from (select gg.id,
                   row_number() over (order by rr.idx, gg.sort) as rn,
                   rr.status, rr.locked_at, rr.note
              from gauntlet_games gg
              join gauntlet_rounds rr on rr.id = gg.round_id) o
     where o.id = g.id;

    -- a round eliminated its teams once, at its end — so the elimination belongs
    -- to the LAST game of that round, not to every game in it
    update gauntlet_games g
       set elim = r.elim
      from gauntlet_rounds r
     where r.id = g.round_id
       and g.idx = (select max(gg.idx) from gauntlet_games gg where gg.round_id = r.id);

    -- teams recorded the ROUND they went out in; that number now has to name the
    -- GAME it happened on, which is that round's last game
    update gauntlet_teams t
       set out_round = m.game_idx
      from (select rr.idx as round_idx, max(gg.idx) as game_idx
              from gauntlet_rounds rr
              join gauntlet_games gg on gg.round_id = rr.id
             group by rr.idx) m
     where t.out_round = m.round_idx;

    alter table gauntlet_games drop column round_id;
    alter table gauntlet_games drop column if exists sort;
    drop table gauntlet_rounds cascade;
  end if;

  if exists (select 1 from information_schema.columns
              where table_name = 'gauntlet_teams' and column_name = 'out_round') then
    alter table gauntlet_teams rename column out_round to out_game;
  end if;

  update gauntlet_games set idx = 1 where idx is null;
  alter table gauntlet_games alter column idx set not null;
end $$;

-- ------------------------------------------------------------------ rls ---

alter table gauntlet_secret enable row level security;
alter table gauntlet_config enable row level security;
alter table gauntlet_teams  enable row level security;
alter table gauntlet_games  enable row level security;
alter table gauntlet_scores enable row level security;

-- Anyone with the link may watch the scoreboard.
drop policy if exists "gauntlet public read config" on gauntlet_config;
drop policy if exists "gauntlet public read teams"  on gauntlet_teams;
drop policy if exists "gauntlet public read games"  on gauntlet_games;
drop policy if exists "gauntlet public read scores" on gauntlet_scores;
create policy "gauntlet public read config" on gauntlet_config for select using (true);
create policy "gauntlet public read teams"  on gauntlet_teams  for select using (true);
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
  insert into gauntlet_teams (id, name, color, emoji, members, out_game, sort, updated_at)
  values (p->>'id', p->>'name', p->>'color', p->>'emoji', p->>'members',
          nullif(p->>'out', '')::int, coalesce(nullif(p->>'sort', '')::int, 0), now())
  on conflict (id) do update
    set name = excluded.name, color = excluded.color, emoji = excluded.emoji,
        members = excluded.members, out_game = excluded.out_game,
        sort = excluded.sort, updated_at = now();
end $$;

create or replace function gauntlet_delete_team(p_pin text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores where team_id = p_id;
  delete from gauntlet_teams  where id = p_id;
  -- a deleted team must not linger in any game's elimination list
  update gauntlet_games
     set elim = (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from jsonb_array_elements(elim) e where e <> to_jsonb(p_id)),
         updated_at = now()
   where elim @> to_jsonb(array[p_id]);
end $$;

create or replace function gauntlet_upsert_game(p_pin text, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  insert into gauntlet_games (id, idx, name, icon, note, status, elim, locked_at, updated_at)
  values (p->>'id', (p->>'idx')::int, p->>'name', p->>'icon', p->>'note',
          coalesce(nullif(p->>'status', ''), 'active'),
          coalesce(p->'elim', '[]'::jsonb), nullif(p->>'lockedAt', '')::bigint, now())
  on conflict (id) do update set
    idx = excluded.idx, name = excluded.name, icon = excluded.icon, note = excluded.note,
    status = excluded.status, elim = excluded.elim,
    locked_at = excluded.locked_at, updated_at = now();
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
  delete from gauntlet_teams;
end $$;

-- Clears every score and revives every team, but keeps the teams and the list
-- of games — the "let's run it again" button.
create or replace function gauntlet_restart(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform gauntlet_check(p_pin);
  delete from gauntlet_scores;
  update gauntlet_teams set out_game = null, updated_at = now();
  update gauntlet_games set status = 'active', elim = '[]'::jsonb,
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
grant select on gauntlet_config, gauntlet_teams, gauntlet_games, gauntlet_scores
  to anon, authenticated;
revoke insert, update, delete on gauntlet_config, gauntlet_teams, gauntlet_games,
                                 gauntlet_scores from anon, authenticated;
revoke all on gauntlet_secret from anon, authenticated;

revoke execute on function gauntlet_check(text) from public, anon, authenticated;

grant execute on function
  gauntlet_verify_pin(text), gauntlet_revision(),
  gauntlet_upsert_team(text, jsonb), gauntlet_delete_team(text, text),
  gauntlet_upsert_game(text, jsonb), gauntlet_delete_game(text, text),
  gauntlet_set_score(text, text, text, numeric),
  gauntlet_save_config(text, jsonb), gauntlet_reset(text),
  gauntlet_restart(text),            gauntlet_set_pin(text, text)
to anon, authenticated;

-- ------------------------------------------------------------------ seed ---

insert into gauntlet_config (id, event, rules) values (1,
  '{"name":"Fun Games","tagline":"Last team standing"}'::jsonb,
  '{"basis":"game","perGame":1,"direction":"high","confirm":true}'::jsonb
) on conflict (id) do nothing;


-- ⚠️  CHANGE THIS PASSCODE before running. Give it only to your scorers.
insert into gauntlet_secret (id, pin) values (1, 'gauntlet2026')
on conflict (id) do nothing;

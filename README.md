# Gauntlet — elimination scoreboard

Fun-games event scoring for **8–10 teams**. Every team gets a score in every
game, and when you lock a game the rules knock somebody out. Keep going until
one team is left standing.

**Live:** https://patelhari1109-lang.github.io/gauntlet/

Single self-contained `index.html`. No build step, no framework, no bundler.

---

## The shape of an event

```
Game 1   Tug of war   9 teams   →  lowest scorer out   →  8 teams
Game 2   Quiz         8 teams   →  lowest scorer out   →  7 teams
…
Game 8   Musical mats 2 teams   →  lowest scorer out   →  champion 🏆
```

One flat list of games. Add them all up front or one at a time as the day goes
on — locking a game creates the next one for you.

---

## What it does

**Standings** — a **16:9 dashboard**, built for the screen in the corner of the
room. The survival grid takes the floor: teams down the side, games across the
top, every score in its cell with 💀 marking where each team went out. Best and
worst in each game are colour-coded, so a column reads at a glance. A rail down
the right carries the leader (or the champion), the chasing pack, the counts,
and whoever is currently on the chopping block.

It is laid out once at 1600×900 and then scaled to fit whatever it is shown on,
so the whole board is always on screen with nothing cropped and nothing to
scroll. The **⛶** button strips the chrome and goes fullscreen for a projector.
Narrow screens drop the 16:9 frame and stack the same panels normally — a
letterboxed strip on a phone would be unreadable. Past about fifteen teams the
grid starts scrolling inside its own panel rather than overflowing the frame.

**Games** — a card per game, listing every surviving team with its score and
big `−` / `+` buttons. Rows sort live into running order with a position number,
so the standing of the game is visible as you enter it. Teams currently in the
drop zone are highlighted red, and the standings page shows the same "on the
chopping block" line — so the room can see who needs a big score.

**Full screen** gives you that same list with nothing else on it, which is what
you want on a phone while standing next to a tug-of-war rope. `Enter` moves to
the next team, the way you actually read scores off a sheet.

**Locking a game** is the one thing that always asks first. The dialog shows the
full order worst-first, pre-ticks whoever the rules pick, and lets you overrule
it — for a tie, a disqualification, or a judged game where the number isn't the
whole story. Tie on the cut line? It says so rather than quietly picking one. It
also warns you if anyone still has blank scores, and it will never let you
eliminate the last team standing.

Locked a game too early? **Reopen** puts the teams back in and makes the scores
editable again.

**Teams** — add them one at a time or paste a list, one per line. Badge emoji,
colour, member names. Removing a team takes its scores with it.

**Settings** — the elimination rules, all live:

| Setting | Options | Default |
| --- | --- | --- |
| Who goes out | lowest score **that game** · lowest **running total** | that game |
| Scoring direction | high score wins · low score wins (times, penalties) | high wins |
| Eliminated per game | 0–5 | 1 |

Every number on the board is *derived* from the score cells — nothing is stored
twice. Change a rule, or fix a typo from three games ago, and the whole event
re-ranks instantly.

Deleting a game renumbers the ones after it, brings back whoever it knocked out,
and shifts every later elimination down with the numbering, so the survival grid
never points at the wrong game.

---

## Ranking

Alive teams rank above eliminated ones. Among the eliminated, **surviving
longer beats scoring big and leaving early** — a team knocked out on game 6
finishes above one that posted a huge game 1 and went out on game 2. That is
what an elimination event actually rewards. Score breaks ties inside each group.

---

## Storage

Works two ways.

### Local only (default)

Everything lives in the browser's `localStorage`. It saves on every keystroke,
so a refresh, a locked phone, or a closed tab all resume where you were. Data is
tied to that one browser on that one device — use **Settings → Export backup**
to move a snapshot around.

### Shared database (recommended for a real event)

Connect a free Supabase project and every device sees one live board. The host
scores from a phone, the projector shows the standings, and the teams watch from
their own seats. No exports, no "which laptop has the real scores".

Local storage stays the working copy, so a dropped wifi connection never
interrupts scoring — edits queue in an outbox and flush when the network
returns. Rapid taps on one cell coalesce into a single write.

#### Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **`supabase-setup.sql`** in this repo. **Change the passcode on the last
   line** — that is what your scorers will type in. It is safe to re-run, and it
   upgrades an install of the earlier rounds-based version in place.
3. In Supabase: **SQL Editor → New query**, paste the whole file, **Run**.
4. In the app: **Settings → Shared database**. Paste your **Project URL** and
   **anon public key** (Supabase → Project Settings → API), plus the passcode.
5. Hit **Test connection** — it checks reachability, tables, functions, the
   schema version and the passcode one by one and tells you exactly what is
   missing. It stays available after you connect, so it can diagnose a board
   that stopped syncing as well as one that never started.
6. **Connect**. If you already entered teams on this device, hit **Upload this
   device's data** once to push them up.

Then use **Copy watch link** to share the board with the players, and **Copy
scorer link** for whoever is running the games. Both carry the connection
settings so nobody has to retype a Supabase URL on a phone; only the scorer link
carries the passcode.

Everything is prefixed `gauntlet_`, so this can share one Supabase project with
other scoreboards without colliding.

#### Security model

The anon key sits in a public web page, so it is treated as public. It can
**only read**. Every write goes through a `security definer` function that
checks the passcode first, and the passcode itself lives in a table with RLS on
and no policy, so nothing holding the anon key can read it. A player who opens
dev tools cannot edit a score or bring their own team back.

Verified against Postgres 16: as the `anon` role, reads succeed, and reading the
passcode, direct `INSERT`/`UPDATE`/`DELETE`, calling the internal guard, and
passing a wrong passcode to any write function all fail.

The sync pill in the header shows the state: `○ Local`, `👁 View` (connected,
read-only), `● Live` (scoring unlocked), `◍` (syncing), `⚠` (queued / offline).
Tap it for the current message.

#### If it will not connect

The app names the specific failure rather than guessing. In order of how often
they actually happen:

| What it says | What to do |
| --- | --- |
| *Connected, but the sync functions are missing* | The project is reachable and the key works — you have not run `supabase-setup.sql` yet, or it errored partway. Run the whole file. |
| *Tables not found* | Same fix: run `supabase-setup.sql`. |
| *The database is out of date* / *Schema is the older rounds-based one* | Re-run `supabase-setup.sql`; it upgrades in place and keeps your scores. |
| *The key was rejected* | Use the **anon public** key from Project Settings → API, not the service role key. |
| *Cannot reach …* | The URL or the network. Paste the **Project URL** from Project Settings → API. A missing `https://` is fixed for you, as is a trailing `/rest/v1`. |

**Retry now** forces an immediate sync attempt rather than waiting for the next
poll.

---

## Development

No build step — open `index.html`.

There is no Node on this machine; the test suite runs on JavaScriptCore. It
reads `index.html`, pulls the `<script>` out and evaluates it against a stubbed
DOM, so there is no second copy of the logic to drift out of sync:

```sh
cd ~/projects/gauntlet
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc test.js
```

251 assertions covering the scoring engine, every elimination rule, lock and
reopen round-trips, a full event played end to end, the renumbering that follows
a deleted game, upgrading a saved v1 (rounds-based) event, database row mapping,
a render pass over every view that catches stray `undefined`s and unclosed tags,
and the 16:9 stage arithmetic — that the board scales to the limiting dimension,
centres in the slack, subtracts whatever sits above it, and drops the frame
entirely on a phone.

The SQL is validated by running `supabase-setup.sql` against a throwaway
`postgres:16` container and exercising every function as the `anon` role — both
as a fresh install and on top of a populated v1 database, checking that the
upgrade lands each elimination on the right game.

---

Designed & built by **Hari Patel**.

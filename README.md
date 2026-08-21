# Gauntlet — elimination scoreboard

Fun-games event scoring for **8–10 teams**. Every team gets a score in every
game, and at the end of each round the rules knock somebody out. Keep going
until one team is left standing.

Single self-contained `index.html`. No build step, no framework, no bundler.

---

## The shape of an event

```
Round 1   9 teams   →  lowest scorer out   →  8 teams
Round 2   8 teams   →  lowest scorer out   →  7 teams
…
Round 8   2 teams   →  lowest scorer out   →  champion 🏆
```

A **round** holds one or more **games**. If your round is just one game, that is
the simple case and the grid is one column wide. If Round 2 is a tug of war
*and* a quiz, add both — a team's round score is the sum of its games.

---

## What it does

**Standings** — the champion banner once it's over, a podium, and a full
survival grid: teams down the side, rounds across the top, every round score in
its cell with 💀 marking where each team went out. Best and worst in each round
are colour-coded, so a column reads at a glance. The **⛶** button strips the
chrome and goes fullscreen for a projector.

**Rounds** — a card per round. Open one to get the score grid: teams down,
games across, a live round total on the right. While a round is open the teams
currently in the drop zone are highlighted in red, and the standings page shows
the same "on the chopping block" line — so the room can see who needs a big
score in the last game.

Tap any game's header for a **one-game scorer**: that game alone, full screen,
one row per team with big `−` / `+` buttons. Far better than a grid on a phone
while you're standing next to a tug-of-war rope.

Pressing `Enter` in a score cell moves down the column, the way you actually
read scores off a sheet.

**Locking a round** is the one thing that always asks first. The dialog shows
the full round order worst-first, pre-ticks whoever the rules pick, and lets you
overrule it — for a tie, a disqualification, or a judged game where the number
isn't the whole story. Tie on the cut line? It says so rather than quietly
picking one. It also warns you if anyone still has blank scores, and it will
never let you eliminate the last team standing.

Locked a round too early? **Reopen** puts the teams back in and makes the
scores editable again.

**Teams** — add them one at a time or paste a list, one per line. Badge emoji,
colour, member names. Removing a team takes its scores with it.

**Settings** — the elimination rules, all live:

| Setting | Options | Default |
| --- | --- | --- |
| Who goes out | lowest score **that round** · lowest **running total** | that round |
| Scoring direction | high score wins · low score wins (times, penalties) | high wins |
| Eliminated per round | 0–5 | 1 |

Every number on the board is *derived* from the score cells — nothing is stored
twice. Change a rule, or fix a typo from three rounds ago, and the whole event
re-ranks instantly.

---

## Ranking

Alive teams rank above eliminated ones. Among the eliminated, **surviving
longer beats scoring big and leaving early** — a team knocked out in round 6
finishes above one that posted a huge round 1 and went out in round 2. That is
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
   line** — that is what your scorers will type in.
3. In Supabase: **SQL Editor → New query**, paste the whole file, **Run**.
4. In the app: **Settings → Shared database**. Paste your **Project URL** and
   **anon public key** (Supabase → Project Settings → API), plus the passcode.
5. Hit **Test connection** — it checks reachability, tables, functions and the
   passcode one by one and tells you exactly what is missing.
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

208 assertions covering the scoring engine, every elimination rule, lock and
reopen round-trips, a full five-round event, deletion cleanup, database row
mapping, and a render pass over every view that catches stray `undefined`s and
unclosed tags.

The SQL is validated by running `supabase-setup.sql` against a throwaway
`postgres:16` container and exercising every function as the `anon` role.

---

Designed & built by **Hari Patel**.

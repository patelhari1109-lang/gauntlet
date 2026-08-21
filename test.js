/* ============================================================================
   Gauntlet — headless test suite.
   Stubs just enough DOM for the page to boot, then runs the real scoring and
   elimination functions the page uses. No Node on this machine, so:

     /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc test.js

   It reads index.html, pulls the <script> out and evaluates it, so there is no
   second copy of the logic to drift out of sync.
   ========================================================================== */

/* ------------------------------ DOM stubs ------------------------------ */
function El(){
  this.innerHTML = ''; this.value = ''; this.textContent = ''; this.checked = false;
  this.style = {}; this.dataset = {}; this.files = [];
  this.classList = {
    _s: {},
    add: function(c){ this._s[c] = true; }, remove: function(c){ delete this._s[c]; },
    toggle: function(c, on){ if (on === undefined) on = !this._s[c]; on ? this.add(c) : this.remove(c); },
    contains: function(c){ return !!this._s[c]; }
  };
}
El.prototype.addEventListener = function(){};
El.prototype.appendChild = function(){};
El.prototype.removeChild = function(){};
El.prototype.remove = function(){};
El.prototype.click = function(){};
El.prototype.focus = function(){};
El.prototype.select = function(){};
El.prototype.animate = function(){ return { onfinish: null }; };
El.prototype.closest = function(){ return null; };
El.prototype.querySelector = function(){ return null; };
El.prototype.querySelectorAll = function(){ return []; };
El.prototype.setAttribute = function(){};

var _els = {};
var document = {
  querySelector: function(s){ return _els[s] || (_els[s] = new El()); },
  querySelectorAll: function(){ return []; },
  createElement: function(){ return new El(); },
  addEventListener: function(){},
  body: new El(),
  documentElement: new El(),
  hidden: false,
  fullscreenElement: null
};
var _store = {};
var localStorage = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function(k, v){ _store[k] = String(v); },
  removeItem: function(k){ delete _store[k]; }
};
var location = { hash: '', pathname: '/index.html', origin: 'http://x', search: '' };
var history = { replaceState: function(){} };
var navigator = { clipboard: null };
var window = { scrollTo: function(){}, addEventListener: function(){}, innerHeight: 800, prompt: function(){} };
var setTimeout = function(){ return 0; };
var setInterval = function(){ return 0; };
var fetch = function(){ return { then: function(){ return { then: function(){} }; } }; };
var Blob = function(){}; var URL = { createObjectURL: function(){ return ''; }, revokeObjectURL: function(){} };
var FileReader = function(){};
var console = { warn: function(){}, log: function(){} };

/* ---------------------------- load the app ---------------------------- */
var html = readFile('index.html');
var open = html.indexOf('<script>') + '<script>'.length;
var shut = html.lastIndexOf('</script>');
var src  = html.slice(open, shut);
(new Function(src + '\nthis.__api = { migrate: migrate, gameScore: gameScore, totalScore: totalScore,' +
  ' standings: standings, gameOrder: gameOrder, elimPreview: elimPreview,' +
  ' lockGame: lockGame, unlockGame: unlockGame, addGame: addGame, delGame: delGame,' +
  ' delTeam: delTeam, setCell: setCell, cell: cell, inGame: inGame, alive: alive,' +
  ' games: games, teamPayload: teamPayload, rowToTeam: rowToTeam,' +
  ' gamePayload: gamePayload, rowToGame: rowToGame,' +
  ' vBoard: vBoard, vGames: vGames, vTeams: vTeams, vSettings: vSettings,' +
  ' gameCard: gameCard, lockModal: lockModal, openScorer: openScorer,' +
  ' getModal: function(){ return document.querySelector("#modal").innerHTML; },' +
  ' getScorer: function(){ return document.querySelector("#scorer").innerHTML; },' +
  ' setState: function(s){ state = s; }, getState: function(){ return state; } };'))
  .call(this);
var A = this.__api;

/* ------------------------------- harness ------------------------------- */
var pass = 0, fail = 0, group = '';
function G(g){ group = g; }
function ok(cond, what){
  if (cond) { pass++; }
  else { fail++; print('  ✗ [' + group + '] ' + what); }
}
function eq(a, b, what){
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) pass++;
  else { fail++; print('  ✗ [' + group + '] ' + what + '\n      got ' + sa + '\n      want ' + sb); }
}

/* Build a fresh event: n teams, no games. */
function fresh(n, rules){
  var s = {
    version: 2, event: { name: 'T', tagline: '' },
    rules: { basis: 'game', perGame: 1, direction: 'high', confirm: true },
    teams: [], games: [], scores: {}
  };
  for (var k in (rules || {})) s.rules[k] = rules[k];
  for (var i = 0; i < n; i++)
    s.teams.push({ id: 't' + i, name: 'Team ' + i, color: '#fff', emoji: '', members: '', out: null, sort: i });
  A.setState(s);
  return s;
}
/* One game, scores given in team order (null leaves a team unscored). */
function play(scores, name){
  var g = A.addGame(name || null, '');
  scores.forEach(function(v, i){ if (v != null) A.setCell(g.id, 't' + i, v); });
  return g;
}

print('');
print('Gauntlet test suite');
print('───────────────────');

/* ---------------------------------------------------------------- scoring */
G('scoring');
(function(){
  fresh(4);
  var g = play([10, null, 0, 2.5]);

  eq(A.gameScore(g, 't0').v, 10, 'a team’s game score is its cell');
  eq(A.gameScore(g, 't1').any, false, 'a blank cell means the team has not played');
  eq(A.gameScore(g, 't1').v, 0, 'and reads as zero when summed');
  eq(A.gameScore(g, 't2').any, true, 'a zero is a real score, not a blank');
  eq(A.gameScore(g, 't3').v, 2.5, 'decimal scores survive');

  A.setCell(g.id, 't0', null);
  eq(A.cell(g.id, 't0'), null, 'a null clears the cell');
  eq(A.gameScore(g, 't0').any, false, 'and the team is unscored again');

  A.setCell(g.id, 't0', 10);
  var g2 = play([4, 0, 0, 0]);
  eq(A.totalScore('t0'), 14, 'the total adds every game');
  eq(A.totalScore('t0', 1), 10, 'the total can be capped at a game index');
  eq(A.games().map(function(x){ return x.idx; }), [1, 2], 'games are numbered in play order');
})();

/* ------------------------------------------------------------ elimination */
G('elimination — lowest that game');
(function(){
  fresh(5);
  var g = play([50, 10, 30, 20, 40]);
  var p = A.elimPreview(g);
  eq(p.order.map(function(o){ return o.t.id; }), ['t0','t4','t2','t3','t1'], 'order runs best to worst');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t1'], 'the lowest scorer is picked');
  eq(p.n, 1, 'one team goes out by default');
  eq(p.tie, false, 'distinct scores are not a tie');
  eq(p.unscored, 0, 'every team scored');
})();

G('elimination — low score wins');
(function(){
  fresh(5, { direction: 'low' });
  var g = play([50, 10, 30, 20, 40]);
  var p = A.elimPreview(g);
  eq(p.order[0].t.id, 't1', 'with low-wins the smallest score leads');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t0'], 'with low-wins the biggest score goes out');
})();

G('elimination — running total');
(function(){
  fresh(3, { basis: 'total' });
  var a = play([100, 1, 50]);
  A.lockGame(a, []);                          // lock without eliminating anyone
  var b = play([0, 90, 10]);
  var p = A.elimPreview(b);
  eq(p.order.map(function(o){ return o.t.id; }), ['t0','t1','t2'], 'totals carry the early lead forward');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t2'], 'lowest running total goes out');

  A.getState().rules.basis = 'game';
  eq(A.elimPreview(b).picks.map(function(o){ return o.t.id; }), ['t0'],
     'switching the basis re-picks without touching a single score');
})();

G('elimination — ties and headcount');
(function(){
  fresh(4);
  eq(A.elimPreview(play([9, 5, 5, 7])).tie, true, 'a tie on the cut line is flagged');

  fresh(4, { perGame: 2 });
  eq(A.elimPreview(play([9, 5, 3, 7])).picks.map(function(o){ return o.t.id; }), ['t2','t1'],
     'two out per game, worst first');

  fresh(2, { perGame: 3 });
  eq(A.elimPreview(play([9, 5])).n, 1, 'never takes more than all-but-one');

  fresh(1);
  var solo = A.elimPreview(play([9]));
  eq(solo.n, 0, 'the last team standing can never be eliminated');
  eq(solo.picks.length, 0, 'and nobody is picked');
})();

G('elimination — unscored teams');
(function(){
  fresh(4);
  var p = A.elimPreview(play([10, 20, null, null]));
  eq(p.unscored, 2, 'unscored teams are counted for the warning');
  eq(p.order.map(function(o){ return o.t.id; }).slice(0, 2), ['t1','t0'],
     'unscored teams count as zero and sink below everyone who played');
  eq(p.tie, true, 'two teams level on the cut line is a tie the host must settle');
  ok(['t2','t3'].indexOf(p.picks[0].t.id) >= 0, 'the pick is one of the two tied teams');
})();

/* -------------------------------------------------------- lock and unlock */
G('locking a game');
(function(){
  fresh(4);
  var g = play([40, 10, 30, 20]);
  A.lockGame(g, ['t1']);

  eq(A.getState().teams[1].out, 1, 'the eliminated team records the game it went out on');
  eq(g.status, 'done', 'the game is marked done');
  eq(g.elim, ['t1'], 'the game remembers who it knocked out');
  ok(g.lockedAt > 0, 'a lock timestamp is written');
  eq(A.alive().length, 3, 'three teams survive');
  eq(A.games().length, 2, 'the next game is created automatically');
  eq(A.games()[1].idx, 2, 'and it is numbered 2');

  var g2 = A.games()[1];
  eq(A.inGame(A.getState().teams[1], g2), false, 'an eliminated team is not in the next game');
  eq(A.inGame(A.getState().teams[1], g), true, 'but is still in the game it played');
  eq(A.gameOrder(g2).length, 3, 'the next game only ranks survivors');
})();

G('reopening a game');
(function(){
  fresh(4);
  var g = play([40, 10, 30, 20]);
  A.lockGame(g, ['t1']);
  var before = A.games().length;
  A.unlockGame(g);

  eq(A.getState().teams[1].out, null, 'reopening brings the team back in');
  eq(g.status, 'active', 'the game is active again');
  eq(g.elim, [], 'the elimination list is cleared');
  eq(A.alive().length, 4, 'everyone is back');
  eq(A.games().length, before, 'reopening does not delete the game that follows');
  eq(A.gameScore(g, 't1').v, 10, 'the scores are untouched by the round-trip');
})();

G('locking with a host override');
(function(){
  fresh(4);
  var g = play([40, 10, 30, 20]);
  A.lockGame(g, ['t0']);          // host overrules the rule and knocks out the leader
  eq(A.getState().teams[0].out, 1, 'the host’s pick is what is applied');
  eq(A.getState().teams[1].out, null, 'the rule’s pick survives when overruled');
})();

G('a full event');
(function(){
  fresh(5);
  var out = [];
  [[50,40,30,20,60],[50,40,30,10,60],[50,40,20,0,60],[50,30,0,0,60]].forEach(function(sc){
    var g = A.games().filter(function(x){ return x.status !== 'done'; })[0] || A.addGame();
    A.alive().forEach(function(t){ A.setCell(g.id, t.id, sc[Number(t.id.slice(1))]); });
    var p = A.elimPreview(g);
    out.push(p.picks[0].t.id);
    A.lockGame(g, p.picks.map(function(z){ return z.t.id; }));
  });
  eq(out, ['t3','t2','t1','t0'], 'each game knocks out the current worst survivor');
  eq(A.alive().length, 1, 'one team is left standing');
  eq(A.alive()[0].id, 't4', 'and it is the team that kept winning');
  eq(A.games().length, 4, 'no empty game is added once a champion exists');

  var st = A.standings();
  eq(st[0].t.id, 't4', 'the champion tops the standings');
  eq(st.map(function(s){ return s.t.id; }), ['t4','t0','t1','t2','t3'],
     'below the champion, teams rank by how long they lasted');
  eq(st[0].rank, 1, 'ranks are numbered from one');
})();

/* -------------------------------------------------------------- standings */
G('standings');
(function(){
  fresh(3);
  play([10, 30, 20]);
  eq(A.standings().map(function(s){ return s.t.id; }), ['t1','t2','t0'],
     'with nobody out it is a plain score ranking');
  eq(A.standings()[0].total, 30, 'the total travels with the row');

  A.getState().rules.direction = 'low';
  eq(A.standings().map(function(s){ return s.t.id; }), ['t0','t2','t1'], 'low-wins flips the order');
})();

/* --------------------------------------------------------------- deleting */
G('deleting a game renumbers the rest');
(function(){
  fresh(5);
  var g1 = play([50,40,30,20,10]); A.lockGame(g1, ['t4']);   // t4 out on game 1
  var g2 = A.games()[1];
  A.alive().forEach(function(t){ A.setCell(g2.id, t.id, 10); });
  A.setCell(g2.id, 't3', 1);       A.lockGame(g2, ['t3']);   // t3 out on game 2
  var g3 = A.games()[2];
  A.alive().forEach(function(t){ A.setCell(g3.id, t.id, 10); });
  A.setCell(g3.id, 't2', 1);       A.lockGame(g3, ['t2']);   // t2 out on game 3
  eq(A.games().map(function(x){ return x.idx; }), [1,2,3,4], 'setup: four games');

  A.delGame(g2.id);
  eq(A.games().length, 3, 'the game is gone');
  eq(A.games().map(function(x){ return x.idx; }), [1,2,3], 'the games after it renumber');
  eq(A.getState().teams[4].out, 1, 'a team knocked out before it keeps its number');
  eq(A.getState().teams[3].out, null, 'the team it knocked out comes back in');
  eq(A.getState().teams[2].out, 2, 'a team knocked out after it shifts down with the numbering');
  eq(Object.keys(A.getState().scores).filter(function(k){ return k.split('|')[0] === g2.id; }).length, 0,
     'and every score in it is gone');
  eq(A.gameScore(A.games()[0], 't0').v, 50, 'the surviving games keep their scores');
})();

G('deleting a team');
(function(){
  fresh(3);
  var g = play([10, 30, 20]);
  A.lockGame(g, ['t0']);
  eq(A.games()[0].elim, ['t0'], 'setup: t0 was knocked out');

  A.delTeam('t0');
  eq(A.getState().teams.length, 2, 'the team is gone');
  eq(A.games()[0].elim, [], 'and is scrubbed from the game that eliminated it');
  eq(Object.keys(A.getState().scores).filter(function(k){ return k.split('|')[1] === 't0'; }).length, 0,
     'every score of a deleted team goes with it');
})();

/* ----------------------------------------------------------------- saving */
G('migrate');
(function(){
  var d = A.migrate(null);
  eq(d.teams, [], 'garbage input falls back to defaults');
  eq(d.rules.perGame, 1, 'default rules are filled in');

  var m = A.migrate({ teams: [{ id: 'a', name: 'A' }], games: [{ id: 'g', name: 'G' }] });
  eq(m.teams[0].sort, 0, 'a team with no sort order gets one');
  eq(m.teams[0].out, null, 'a team with no status is in');
  eq(m.games[0].idx, 1, 'a game with no number gets one');
  eq(m.games[0].elim, [], 'a game with no elimination list gets an empty one');
  eq(m.games[0].status, 'active', 'and defaults to open');
  eq(m.scores, {}, 'a missing score map becomes an empty one');
  eq(m.rules.basis, 'game', 'partial saved state keeps the default rules it lacks');
})();

G('migrate — a v1 save with rounds');
(function(){
  var v1 = {
    version: 1,
    rules: { basis: 'round', perRound: 2, direction: 'low', confirm: true },
    rounds: [{ id: 'r1', idx: 1, name: 'R1', note: 'gym', status: 'done',   elim: ['t1'], lockedAt: 55 },
             { id: 'r2', idx: 2, name: 'R2', note: '',    status: 'active', elim: [],     lockedAt: 0  }],
    games: [{ id: 'g1', roundId: 'r1', name: 'Quiz',  icon: 'Q', sort: 0 },
            { id: 'g2', roundId: 'r1', name: 'Relay', icon: 'R', sort: 1 },
            { id: 'g3', roundId: 'r2', name: 'Darts', icon: 'D', sort: 0 }],
    teams: [{ id: 't0', name: 'A', out: null, sort: 0 },
            { id: 't1', name: 'B', out: 1,    sort: 1 }],
    scores: { 'g1|t0': 5, 'g2|t0': 3 }
  };
  var m = A.migrate(v1);

  eq(m.games.map(function(g){ return g.id; }), ['g1','g2','g3'], 'the rounds flatten into games in play order');
  eq(m.games.map(function(g){ return g.idx; }), [1,2,3], 'and are renumbered 1..n');
  eq(m.games.map(function(g){ return g.status; }), ['done','done','active'],
     'each game inherits the status of the round it belonged to');
  eq(m.games[1].elim, ['t1'], 'the round’s elimination lands on the last game of that round');
  eq(m.games[0].elim, [], 'and not on the earlier ones');
  eq(m.teams[1].out, 2, 'a team out in round 1 is now out on game 2, where the elimination happened');
  eq(m.teams[0].out, null, 'a surviving team stays in');
  eq(m.games[0].note, 'gym', 'the round note carries onto its games');
  eq(m.scores, { 'g1|t0': 5, 'g2|t0': 3 }, 'every score survives the migration');
  eq(m.rounds, undefined, 'the rounds are gone');
  eq(m.games[0].roundId, undefined, 'and so is the back-reference');
  eq(m.rules.basis, 'game', 'the old round-based rule becomes the game-based one');
  eq(m.rules.perGame, 2, 'perRound becomes perGame');
  eq(m.rules.perRound, undefined, 'and the old key is dropped');
  eq(m.rules.direction, 'low', 'a rule that did not change is left alone');
  eq(m.version, 2, 'the save is stamped as version 2');
})();

G('row mapping');
(function(){
  var t = { id: 'a', name: 'A', color: '#fff', emoji: '🐯', members: 'x,y', out: 3, sort: 2 };
  eq(A.teamPayload(t).out, 3, 'an eliminated team sends its game number');
  eq(A.rowToTeam({ id: 'a', name: 'A', color: '#fff', emoji: '🐯', members: 'x,y', out_game: 3, sort: 2 }), t,
     'a team survives the round trip through a database row');
  eq(A.rowToTeam({ id: 'b', name: 'B', out_game: null, sort: 0 }).out, null,
     'a null out_game comes back as still-in');
  eq(A.teamPayload({ id: 'b', name: 'B', out: null, sort: 0 }).out, '',
     'still-in sends an empty string, which the SQL turns back into null');

  var g = { id: 'g', idx: 2, name: 'Relay', icon: 'R', note: 'n', status: 'done', elim: ['a'], lockedAt: 1234 };
  eq(A.rowToGame({ id: 'g', idx: 2, name: 'Relay', icon: 'R', note: 'n', status: 'done',
                   elim: ['a'], locked_at: 1234 }), g, 'a game survives the round trip too');
  eq(A.gamePayload(g).lockedAt, 1234, 'the lock timestamp is sent');
})();

/* ----------------------------------------------------------------- render */
/* No browser here, so the views are called directly and their HTML inspected.
   This is what catches a typo in a template string — a stray `undefined`, a
   number that came out NaN, or a tag left unclosed that would collapse the
   layout on the projector. */
G('render');
(function(){
  function balanced(h, tag){
    // the tag name must end at the match, or <thead> counts as a <th>
    var o = (h.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || []).length;
    var c = (h.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    return o === c;
  }
  function clean(h, what){
    ok(h.length > 0, what + ' renders something');
    ok(h.indexOf('undefined') < 0, what + ' has no stray undefined');
    ok(h.indexOf('NaN') < 0, what + ' has no NaN');
    ok(h.indexOf('[object Object]') < 0, what + ' has no leaked object');
    ['div','button','table','tbody','tr','td','th','span','label'].forEach(function(t){
      ok(balanced(h, t), what + ' closes every <' + t + '>');
    });
  }

  fresh(9);                                            // a realistic 9-team event
  var g1 = play([30,20,50,10,40,25,35,15,45], 'Tug of war');
  A.lockGame(g1, ['t3']);
  var g2 = A.games()[1];
  A.setCell(g2.id, 't0', 12);

  clean(A.vBoard(), 'the standings board');
  clean(A.vGames(), 'the games view');
  clean(A.vTeams(), 'the teams view');
  clean(A.vSettings(), 'the settings view');
  clean(A.gameCard(g1), 'a locked game card');
  clean(A.gameCard(g2), 'an open game card');

  var b = A.vBoard();
  ok(b.indexOf('Team 3') >= 0, 'the board lists an eliminated team');
  ok(b.indexOf('💀') >= 0, 'and marks where it was knocked out');
  ok(A.gameCard(g1).indexOf('Reopen') >= 0, 'a locked game offers to reopen');
  ok(A.gameCard(g2).indexOf('Lock game') >= 0, 'an open game offers to lock');
  ok(A.gameCard(g2).indexOf('Team 3') < 0, 'an eliminated team is off the next game’s card');
  ok(A.gameCard(g1).indexOf('data-act="step"') < 0, 'a locked game has no steppers');
  ok(A.gameCard(g2).indexOf('data-act="step"') >= 0, 'an open game does');

  A.lockModal(g2.id);
  var m = A.getModal();
  clean(m, 'the lock dialog');
  ok(m.indexOf('data-elim') >= 0, 'the lock dialog offers a checkbox per team');
  eq(m.split('data-elim').length - 1, 8, 'one row per surviving team');

  A.openScorer(g2.id);
  var sc = A.getScorer();
  clean(sc, 'the full-screen scorer');
  ok(sc.indexOf('data-act="step"') >= 0, 'the scorer has +/- steppers');
  ok(sc.indexOf('Lock & eliminate') >= 0, 'and can lock the game without going back');

  ok(A.vBoard().indexOf('Last team standing') < 0, 'no champion banner mid-event');
  fresh(2);
  A.lockGame(play([10, 5]), ['t1']);
  ok(A.vBoard().indexOf('Last team standing') >= 0, 'the champion banner appears at the end');
  clean(A.vBoard(), 'the finished board');
})();

print('───────────────────');
print(fail === 0 ? '✓ ' + pass + ' assertions passed' : '✗ ' + fail + ' failed, ' + pass + ' passed');
print('');

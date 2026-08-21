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
(new Function(src + '\nthis.__api = { state: state, migrate: migrate, roundScore: roundScore,' +
  ' totalScore: totalScore, standings: standings, roundOrder: roundOrder, elimPreview: elimPreview,' +
  ' lockRound: lockRound, unlockRound: unlockRound, addRound: addRound, addGame: addGame,' +
  ' delGame: delGame, delTeam: delTeam, delRound: delRound, setCell: setCell, cell: cell,' +
  ' inRound: inRound, alive: alive, rounds: rounds, gamesOf: gamesOf, teamPayload: teamPayload,' +
  ' rowToTeam: rowToTeam, roundPayload: roundPayload, rowToRound: rowToRound,' +
  ' vBoard: vBoard, vRounds: vRounds, vTeams: vTeams, vSettings: vSettings,' +
  ' roundCard: roundCard, lockModal: lockModal, openScorer: openScorer,' +
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

/* Build a fresh event: n teams, no rounds. */
function fresh(n, rules){
  var s = {
    version: 1, event: { name: 'T', tagline: '' },
    rules: { basis: 'round', perRound: 1, direction: 'high', confirm: true },
    teams: [], rounds: [], games: [], scores: {}
  };
  for (var k in (rules || {})) s.rules[k] = rules[k];
  for (var i = 0; i < n; i++)
    s.teams.push({ id: 't' + i, name: 'Team ' + i, color: '#fff', emoji: '', members: '', out: null, sort: i });
  A.setState(s);
  return s;
}
/* One round with one game, scores given in team order. */
function playRound(scores, name){
  var r = A.addRound(name);
  var g = A.addGame(r.id, 'G' + r.idx, '');
  scores.forEach(function(v, i){ if (v != null) A.setCell(g.id, 't' + i, v); });
  return { r: r, g: g };
}

print('');
print('Gauntlet test suite');
print('───────────────────');

/* ---------------------------------------------------------------- scoring */
G('scoring');
(function(){
  fresh(4);
  var r = A.addRound('R1');
  var g1 = A.addGame(r.id, 'Quiz', ''), g2 = A.addGame(r.id, 'Relay', '');
  A.setCell(g1.id, 't0', 10); A.setCell(g2.id, 't0', 5);
  A.setCell(g1.id, 't1', 7);

  eq(A.roundScore(r, 't0').v, 15, 'round score sums the games in the round');
  eq(A.roundScore(r, 't0').filled, 2, 'filled counts only cells with a number');
  eq(A.roundScore(r, 't1').of, 2, 'of counts every game in the round');
  eq(A.roundScore(r, 't1').filled, 1, 'a blank cell is not counted as filled');
  eq(A.roundScore(r, 't2').any, false, 'a team with no cells has scored nothing');
  eq(A.roundScore(r, 't2').v, 0, 'no cells sums to zero');

  A.setCell(g1.id, 't1', null);
  eq(A.cell(g1.id, 't1'), null, 'a null clears the cell');
  eq(A.roundScore(r, 't1').any, false, 'clearing the last cell makes the team unscored');

  A.setCell(g1.id, 't1', 0);
  eq(A.cell(g1.id, 't1'), 0, 'zero is a real score, not a blank');
  eq(A.roundScore(r, 't1').any, true, 'a zero counts as having played');

  A.setCell(g1.id, 't2', 2.5);
  eq(A.roundScore(r, 't2').v, 2.5, 'decimal scores survive');

  var r2 = A.addRound('R2');
  var g3 = A.addGame(r2.id, 'Darts', '');
  A.setCell(g3.id, 't0', 4);
  eq(A.totalScore('t0'), 19, 'total adds every round');
  eq(A.totalScore('t0', 1), 15, 'total can be capped at a round index');
})();

/* ------------------------------------------------------------ elimination */
G('elimination — lowest that round');
(function(){
  fresh(5);
  var x = playRound([50, 10, 30, 20, 40]);
  var p = A.elimPreview(x.r);
  eq(p.order.map(function(o){ return o.t.id; }), ['t0','t4','t2','t3','t1'], 'order runs best to worst');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t1'], 'the lowest scorer is picked');
  eq(p.n, 1, 'one team goes out by default');
  eq(p.tie, false, 'distinct scores are not a tie');
  eq(p.unscored, 0, 'every team scored');
})();

G('elimination — low score wins');
(function(){
  fresh(5, { direction: 'low' });
  var x = playRound([50, 10, 30, 20, 40]);
  var p = A.elimPreview(x.r);
  eq(p.order[0].t.id, 't1', 'with low-wins the smallest score leads');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t0'], 'with low-wins the biggest score goes out');
})();

G('elimination — running total');
(function(){
  fresh(3, { basis: 'total' });
  var a = playRound([100, 1, 50]);
  A.lockRound(a.r, []);                       // lock without eliminating anyone
  var b = playRound([0, 90, 10]);
  var p = A.elimPreview(b.r);
  eq(p.order.map(function(o){ return o.t.id; }), ['t0','t1','t2'], 'totals carry the early lead forward');
  eq(p.picks.map(function(o){ return o.t.id; }), ['t2'], 'lowest running total goes out');

  // the same scores judged round-by-round pick a different victim
  A.getState().rules.basis = 'round';
  eq(A.elimPreview(b.r).picks.map(function(o){ return o.t.id; }), ['t0'],
     'switching the basis re-picks without touching a single score');
})();

G('elimination — ties and headcount');
(function(){
  fresh(4);
  var x = playRound([9, 5, 5, 7]);
  var p = A.elimPreview(x.r);
  eq(p.tie, true, 'a tie on the cut line is flagged');

  fresh(4);
  A.getState().rules.perRound = 2;
  var y = playRound([9, 5, 3, 7]);
  eq(A.elimPreview(y.r).picks.map(function(o){ return o.t.id; }), ['t2','t1'], 'two out per round, worst first');

  fresh(2);
  A.getState().rules.perRound = 3;
  var z = playRound([9, 5]);
  eq(A.elimPreview(z.r).n, 1, 'never takes more than all-but-one');

  fresh(1);
  A.getState().rules.perRound = 1;
  var w = playRound([9]);
  eq(A.elimPreview(w.r).n, 0, 'the last team standing can never be eliminated');
  eq(A.elimPreview(w.r).picks.length, 0, 'and nobody is picked');
})();

G('elimination — unscored teams');
(function(){
  fresh(4);
  var x = playRound([10, 20, null, null]);
  var p = A.elimPreview(x.r);
  eq(p.unscored, 2, 'unscored teams are counted for the warning');
  eq(p.order.map(function(o){ return o.t.id; }).slice(0, 2), ['t1','t0'],
     'unscored teams count as zero and sink below everyone who played');
  eq(p.tie, true, 'two teams level on the cut line is a tie the host must settle');
  ok(['t2','t3'].indexOf(p.picks[0].t.id) >= 0, 'the pick is one of the two tied teams');
})();

/* -------------------------------------------------------- lock and unlock */
G('locking a round');
(function(){
  fresh(4);
  var x = playRound([40, 10, 30, 20]);
  A.lockRound(x.r, ['t1']);

  eq(A.getState().teams[1].out, 1, 'the eliminated team records the round it went out in');
  eq(x.r.status, 'done', 'the round is marked done');
  eq(x.r.elim, ['t1'], 'the round remembers who it knocked out');
  ok(x.r.lockedAt > 0, 'a lock timestamp is written');
  eq(A.alive().length, 3, 'three teams survive');
  eq(A.rounds().length, 2, 'the next round is created automatically');
  eq(A.rounds()[1].idx, 2, 'and it is numbered 2');

  var r2 = A.rounds()[1];
  eq(A.inRound(A.getState().teams[1], r2), false, 'an eliminated team is not in the next round');
  eq(A.inRound(A.getState().teams[1], x.r), true, 'but is still in the round it played');
  eq(A.roundOrder(r2).length, 3, 'the next round only ranks survivors');
})();

G('reopening a round');
(function(){
  fresh(4);
  var x = playRound([40, 10, 30, 20]);
  A.lockRound(x.r, ['t1']);
  var before = A.rounds().length;
  A.unlockRound(x.r);

  eq(A.getState().teams[1].out, null, 'reopening brings the team back in');
  eq(x.r.status, 'active', 'the round is active again');
  eq(x.r.elim, [], 'the elimination list is cleared');
  eq(A.alive().length, 4, 'everyone is back');
  eq(A.rounds().length, before, 'reopening does not delete the round that follows');
  eq(A.roundScore(x.r, 't1').v, 10, 'the scores are untouched by the round-trip');
})();

G('locking with a host override');
(function(){
  fresh(4);
  var x = playRound([40, 10, 30, 20]);
  A.lockRound(x.r, ['t0']);      // host overrules the rule and knocks out the leader
  eq(A.getState().teams[0].out, 1, 'the host’s pick is what is applied');
  eq(A.getState().teams[1].out, null, 'the rule’s pick survives when overruled');
})();

G('a full five-round event');
(function(){
  fresh(5);
  // t4 is best every round; the bottom team differs each time
  var out = [];
  [[50,40,30,20,60],[50,40,30,10,60],[50,40,20,0,60],[50,30,0,0,60]].forEach(function(sc, i){
    var r = A.rounds().filter(function(x){ return x.status !== 'done'; })[0] || A.addRound();
    var g = A.gamesOf(r.id)[0] || A.addGame(r.id, 'G', '');
    A.alive().forEach(function(t){ A.setCell(g.id, t.id, sc[Number(t.id.slice(1))]); });
    var p = A.elimPreview(r);
    out.push(p.picks[0].t.id);
    A.lockRound(r, p.picks.map(function(z){ return z.t.id; }));
  });
  eq(out, ['t3','t2','t1','t0'], 'each round knocks out the current worst survivor');
  eq(A.alive().length, 1, 'one team is left standing');
  eq(A.alive()[0].id, 't4', 'and it is the team that kept winning');
  eq(A.rounds().length, 4, 'no empty round is added once a champion exists');

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
  var x = playRound([10, 30, 20]);
  var st = A.standings();
  eq(st.map(function(s){ return s.t.id; }), ['t1','t2','t0'], 'with nobody out it is a plain score ranking');
  eq(st[0].total, 30, 'the total travels with the row');

  A.getState().rules.direction = 'low';
  eq(A.standings().map(function(s){ return s.t.id; }), ['t0','t2','t1'], 'low-wins flips the order');
})();

/* --------------------------------------------------------------- deleting */
G('deleting things');
(function(){
  fresh(3);
  var x = playRound([10, 30, 20]);
  A.lockRound(x.r, ['t0']);
  eq(A.rounds()[0].elim, ['t0'], 'setup: t0 was knocked out');

  A.delTeam('t0');
  eq(A.getState().teams.length, 2, 'the team is gone');
  eq(A.rounds()[0].elim, [], 'and is scrubbed from the round that eliminated it');
  eq(Object.keys(A.getState().scores).filter(function(k){ return k.split('|')[1] === 't0'; }).length, 0,
     'every score of a deleted team goes with it');

  var r2 = A.rounds()[1];
  var g = A.addGame(r2.id, 'Extra', '');
  A.setCell(g.id, 't1', 5);
  A.delGame(g.id);
  eq(A.gamesOf(r2.id).length, 0, 'the game is gone');
  eq(Object.keys(A.getState().scores).filter(function(k){ return k.split('|')[0] === g.id; }).length, 0,
     'and its scores with it');

  var keep = A.rounds()[0].id;
  A.delRound(r2.id);
  eq(A.rounds().length, 1, 'the round is gone');
  eq(A.rounds()[0].id, keep, 'and the other round is untouched');
})();

/* ------------------------------------------------------ storage + mapping */
G('migrate');
(function(){
  var d = A.migrate(null);
  eq(d.teams, [], 'garbage input falls back to defaults');
  eq(d.rules.perRound, 1, 'default rules are filled in');

  var m = A.migrate({ teams: [{ id: 'a', name: 'A' }], rounds: [{ id: 'r', idx: 1, name: 'R' }] });
  eq(m.teams[0].sort, 0, 'a team with no sort order gets one');
  eq(m.teams[0].out, null, 'a team with no status is in');
  eq(m.rounds[0].elim, [], 'a round with no elimination list gets an empty one');
  eq(m.scores, {}, 'a missing score map becomes an empty one');
  eq(m.rules.basis, 'round', 'partial saved state keeps the default rules it lacks');
})();

G('row mapping');
(function(){
  var t = { id: 'a', name: 'A', color: '#fff', emoji: '🐯', members: 'x,y', out: 3, sort: 2 };
  var p = A.teamPayload(t);
  eq(p.out, 3, 'an eliminated team sends its round number');
  eq(A.rowToTeam({ id: 'a', name: 'A', color: '#fff', emoji: '🐯', members: 'x,y', out_round: 3, sort: 2 }), t,
     'a team survives the round trip through a database row');
  eq(A.rowToTeam({ id: 'b', name: 'B', out_round: null, sort: 0 }).out, null,
     'a null out_round comes back as still-in');
  eq(A.teamPayload({ id: 'b', name: 'B', out: null, sort: 0 }).out, '',
     'still-in sends an empty string, which the SQL turns back into null');

  var r = { id: 'r', idx: 2, name: 'R2', note: 'n', status: 'done', elim: ['a'], lockedAt: 1234 };
  eq(A.rowToRound({ id: 'r', idx: 2, name: 'R2', note: 'n', status: 'done', elim: ['a'], locked_at: 1234 }), r,
     'a round survives the round trip too');
  eq(A.roundPayload(r).lockedAt, 1234, 'the lock timestamp is sent');
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
    ['div','button','table','tbody','tr','td','th','span','label','input'].forEach(function(t){
      if (t === 'input') return;                       // void element, never closed
      ok(balanced(h, t), what + ' closes every <' + t + '>');
    });
  }

  fresh(9);                                            // a realistic 9-team event
  var one = playRound([30,20,50,10,40,25,35,15,45], 'Opening Round');
  A.addGame(one.r.id, 'Tug of war', '💪');
  A.setCell(A.gamesOf(one.r.id)[1].id, 't0', 5);
  A.lockRound(one.r, ['t3']);
  var two = A.rounds()[1];
  A.addGame(two.id, 'Quiz', '🧠');
  A.setCell(A.gamesOf(two.id)[0].id, 't0', 12);

  clean(A.vBoard(), 'the standings board');
  clean(A.vRounds(), 'the rounds view');
  clean(A.vTeams(), 'the teams view');
  clean(A.vSettings(), 'the settings view');
  clean(A.roundCard(one.r), 'a locked round card');
  clean(A.roundCard(two), 'an open round card');

  var b = A.vBoard();
  ok(b.indexOf('Team 3') >= 0, 'the board lists an eliminated team');
  ok(b.indexOf('💀') >= 0, 'and marks where it was knocked out');
  ok(A.roundCard(one.r).indexOf('Reopen') >= 0, 'a locked round offers to reopen');
  ok(A.roundCard(two).indexOf('Lock round') >= 0, 'an open round offers to lock');
  ok(A.roundCard(two).indexOf('Team 3') < 0, 'an eliminated team is off the next round’s grid');

  A.lockModal(two.id);
  var m = A.getModal();
  clean(m, 'the lock dialog');
  ok(m.indexOf('data-elim') >= 0, 'the lock dialog offers a checkbox per team');
  eq(m.split('data-elim').length - 1, 8, 'one row per surviving team');

  A.openScorer(A.gamesOf(two.id)[0].id);
  var sc = A.getScorer();
  clean(sc, 'the one-game scorer');
  ok(sc.indexOf('data-act="step"') >= 0, 'the scorer has +/- steppers');

  // the champion banner only appears once the event is actually over
  ok(A.vBoard().indexOf('Last team standing') < 0, 'no champion banner mid-event');
  fresh(2);
  var f = playRound([10, 5]);
  A.lockRound(f.r, ['t1']);
  ok(A.vBoard().indexOf('Last team standing') >= 0, 'the champion banner appears at the end');
  clean(A.vBoard(), 'the finished board');
})();

print('───────────────────');
print(fail === 0 ? '✓ ' + pass + ' assertions passed' : '✗ ' + fail + ' failed, ' + pass + ' passed');
print('');

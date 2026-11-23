/* Beat Board · Beat screen
   A drum machine (step grid) plus finger-drumming pads laid out like a computer number pad.
   It edits the drums clip of the scene being edited (BB.state.scene).
   Computers: one page, as always: controls strip, then the step grid with the pads beside it.
   Phones: the screen holds the sound (kit, swing, volume and effects) and two cards. Each card opens a
   full-screen workspace: the step grid (placing hits in time) and the pads (playing live).
   Both arrangements are built once; layout() moves the shared controls between them. */
(function () {
'use strict';
const BB = window.BB, { h } = BB, UI = BB.ui, TR = BB.transport;
const VOICES = BB.DRUM_VOICES;
const DIGIT = { Digit1: 'kick', Digit2: 'snare', Digit3: 'clap', Digit4: 'hat', Digit5: 'ohat', Digit6: 'rim', Digit7: 'tomL', Digit8: 'tomH', Digit9: 'crash', Digit0: 'shaker' };
const PAD_ORDER = ['tomL', 'tomH', 'crash', 'hat', 'ohat', 'rim', 'kick', 'snare', 'clap', 'shaker']; // 7 8 9 / 4 5 6 / 1 2 3 / 0
const HARD = 1, SOFT = 0.45, SOFT_LINE = 0.75;
const ROLL_NEXT = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 0 };
const BPM_GAP = 12; // suggest a starter beat's tempo when the song is this far off
const narrowMQ = window.matchMedia('(max-width: 560px)');
const ICON = {
  hard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="currentColor"/></svg>',
  soft: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="currentColor" opacity=".38"/><rect x="5.75" y="5.75" width="12.5" height="12.5" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  roll: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="2.4" fill="currentColor"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><circle cx="17.5" cy="12" r="2.4" fill="currentColor"/></svg>',
  follow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h12m0 0-4-4m4 4-4 4M20 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* view state (UI only, never part of the song) */
const V = {
  root: null, grid: null, rows: [], cells: [], nums: [], labels: {}, pads: {}, ctl: {}, ws: {},
  mini: [], miniCols: [], miniPads: {},
  visibleBar: 0, builtBars: 0, playCol: -1, playBar: -1,
  tool: BB.storage.get('beatboard.beat.tool', 'hard'),
  follow: BB.storage.get('beatboard.beat.follow', true),
  page: BB.storage.get('beatboard.beat.page', 'a'),
  padSoft: BB.storage.get('beatboard.beat.padSoft', false),
  cursor: { row: 0, s: 0, on: false },
  starterShown: '', lastToast: null,
};
if (!['hard', 'soft', 'roll'].includes(V.tool)) V.tool = 'hard';
if (!['a', 'b', 'all'].includes(V.page)) V.page = 'a';

/* ---------- small helpers ---------- */
const scene = () => BB.state.scene;
const clip = () => BB.store.clip('drums', scene());
const barsOf = c => (c ? c.bars : 1);
const kitNow = () => { const c = clip(); return (c && c.kit) || 'lofi'; };
const isEmpty = c => BB.clipIsEmpty('drums', c);
const touchy = () => !BB.finePointer();
const paging = () => narrowMQ.matches && V.page !== 'all';
const gridOpen = () => !UI.phone.matches || !!(V.ws.grid && V.ws.grid.isOpen()); // the step grid is on screen
const pageOf = s => (s < 8 ? 'a' : 'b');
const velAt = (c, v, i) => (c && c.steps[v] && c.steps[v][i]) || 0;
const rollAt = (c, v, i) => (c && c.rolls && c.rolls[v] && c.rolls[v][i]) || 0;
const mixFor = vel => (vel >= 0.95 ? '100%' : Math.round(BB.clamp(34 + (vel - 0.3) / 0.65 * 56, 34, 92)) + '%');

/* Make sure every array of a drum clip is long enough (older or hand-edited clips). */
function fixArrays(c) {
  const n = c.bars * 16;
  c.rolls = c.rolls || {};
  for (const v of VOICES) {
    const a = c.steps[v.id] || (c.steps[v.id] = []);
    while (a.length < n) a.push(0);
  }
  return c;
}
function rollsFor(c, v) {
  const n = c.bars * 16, r = c.rolls[v] || (c.rolls[v] = []);
  while (r.length < n) r.push(0);
  return r;
}

/* Every edit to this scene's beat goes through here (one place for undo info and auto-launch). */
function edit(label, fn, opts = {}) {
  const sc = scene(), had = !!clip();
  if (!opts.keepStarter) V.starterShown = '';
  const res = BB.store.change(label, () => fn(fixArrays(BB.store.ensureClip('drums', sc))),
    { group: opts.group, window: opts.window, info: { track: 'drums', scene: sc } });
  if (!had) maybeLaunch(sc);
  return res;
}
/* A brand-new beat in a scene you are listening to should be heard right away. */
function maybeLaunch(sc) {
  if (TR.mode !== 'loop' || !BB.store.clip('drums', sc)) return;
  if (TR.isLaunched('drums', sc) || TR.queuedFor('drums') === sc) return;
  const sceneLive = BB.TRACKS.some(t => t.id !== 'drums' && TR.isLaunched(t.id, sc));
  if (sceneLive || (TR.playing && !TR.launched.drums)) TR.launchClip('drums', sc);
}

/* One toast at a time from this screen (flipping through starter beats would stack them). */
function toast(text, opts = {}) {
  if (V.lastToast && V.lastToast.isConnected) V.lastToast.remove();
  UI.toast(text, opts);
  const wrap = BB.$('#toasts'); V.lastToast = wrap ? wrap.lastElementChild : null;
}
/* Toast with an Undo button that undoes exactly this action, even if it is no longer the last one. */
function undoToast(text, label, before, sc, ms) {
  const depth = BB.store.undoStack.length;
  toast(text, { ms: ms || 4200, action: { label: 'Undo', onClick: () => {
    const top = BB.store.undoStack[BB.store.undoStack.length - 1];
    if (BB.store.undoStack.length === depth && top && top.label === label) BB.store.undo();
    else BB.store.change('Undo ' + label.toLowerCase(), p => { p.clips.drums[sc] = before ? BB.clone(before) : null; }, { info: { track: 'drums', scene: sc } });
  } } });
}

/* Audition a hit (and its roll) while stopped, and light its pad. */
function audition(v, vel, roll) {
  flash(v, 'hit');
  if (TR.playing || !BB.audio.init()) return;
  const n = roll > 1 ? roll : 1, sd = 60 / BB.store.p.bpm / 4, kit = kitNow();
  for (let k = 0; k < n; k++) BB.audio.E.drum('drums', kit, v, BB.audio.now + 0.003 + k * sd / n, k ? vel * 0.78 : vel);
}

/* ---------- grid editing ---------- */
/* Decide what a click (or the start of a drag) does with the current hit tool. */
function gestureFor(ri, idx, erase) {
  const v = VOICES[ri].id, c = clip(), cur = velAt(c, v, idx), curRoll = rollAt(c, v, idx);
  const g = { id: 'beat-paint-' + BB.uid(), seen: new Set() };
  if (erase) g.mode = 'erase';
  else if (V.tool === 'roll') { g.mode = 'roll'; g.roll = cur > 0 ? ROLL_NEXT[curRoll] : 2; }
  else {
    const soft = V.tool === 'soft', same = cur > 0 && (soft ? cur < SOFT_LINE : cur >= SOFT_LINE);
    g.mode = same ? 'erase' : 'set'; g.vel = soft ? SOFT : HARD;
  }
  return g;
}
function applyCell(g, ri, idx) {
  const key = ri + ':' + idx;
  if (g.seen.has(key)) return;
  g.seen.add(key);
  const v = VOICES[ri].id, c = clip(), cur = velAt(c, v, idx), curRoll = rollAt(c, v, idx);
  let nv = cur, nr = curRoll;
  if (g.mode === 'erase') { nv = 0; nr = 0; }
  else if (g.mode === 'set') { nv = g.vel; if (!cur) nr = 0; }
  else if (g.mode === 'roll') { if (!cur && g.roll > 0) nv = HARD; if (nv > 0) nr = g.roll; }
  if (nv === cur && nr === curRoll) return;
  const label = g.mode === 'erase' ? 'Remove hits' : g.mode === 'roll' ? 'Drum roll' : (g.vel < SOFT_LINE ? 'Add soft hits' : 'Add hits');
  edit(label, cc => {
    cc.steps[v][idx] = nv;
    if (nr || (cc.rolls[v] && cc.rolls[v][idx])) rollsFor(cc, v)[idx] = nr;
  }, { group: g.id, window: 600000 });
  if (nv > 0) audition(v, nv, nr);
}
/* Keyboard cursor: Enter works like a click with the current tool, Backspace erases. */
function cursorCell(erase) {
  const { row, s } = V.cursor, idx = V.visibleBar * 16 + s;
  if (!V.cursor.on) { V.cursor.on = true; paintCursor(); return; } // first press just shows the cursor
  if (paging() && pageOf(s) !== V.page) setPage(pageOf(s), true);
  applyCell(gestureFor(row, idx, erase), row, idx);
  paintCursor();
}
function moveCursor(dr, ds) {
  const C = V.cursor, n = barsOf(clip());
  if (!C.on) { C.on = true; paintCursor(); return; } // first press just shows the cursor
  if (dr) C.row = (C.row + dr + VOICES.length) % VOICES.length;
  if (ds) {
    let s = C.s + ds, bar = V.visibleBar;
    while (s > 15) { s -= 16; bar++; }
    while (s < 0) { s += 16; bar--; }
    bar = (bar + n) % n;
    if (bar !== V.visibleBar) { setVisibleBar(bar, true); }
    C.s = s;
  }
  if (paging() && pageOf(C.s) !== V.page) setPage(pageOf(C.s), true);
  paintCursor();
}

/* Pointer painting. Mouse: press paints right away, drag paints more. Touch: tap toggles, a sideways
   slide paints, and an up/down swipe scrolls the page as usual. */
function wireGrid(grid) {
  let G = null, T = null;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); const c = el && el.closest ? el.closest('.beat-cell') : null; return c && grid.contains(c) ? c : null; };
  const begin = (el, erase, pointerId, x, y) => {
    const ri = +el.dataset.r, s = +el.dataset.s, idx = V.visibleBar * 16 + s;
    G = gestureFor(ri, idx, erase); G.pointerId = pointerId; G.x = x; G.y = y;
    V.cursor.row = ri; V.cursor.s = s;
    applyCell(G, ri, idx);
    if (V.cursor.on) paintCursor();
  };
  const sweep = (x, y) => { // fill in cells a fast drag jumped over
    const dx = x - G.x, dy = y - G.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 1; i <= n; i++) {
      const el = cellAt(G.x + dx * i / n, G.y + dy * i / n);
      if (el) applyCell(G, +el.dataset.r, V.visibleBar * 16 + +el.dataset.s);
    }
    G.x = x; G.y = y;
  };
  grid.addEventListener('pointerdown', e => {
    const el = e.target.closest('.beat-cell'); if (!el) return;
    BB.controls.clear();
    if (e.pointerType === 'touch') { if (!T) T = { id: e.pointerId, el, x: e.clientX, y: e.clientY, started: false }; return; }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    begin(el, e.button === 2, e.pointerId, e.clientX, e.clientY);
  });
  grid.addEventListener('pointermove', e => {
    if (T && e.pointerId === T.id && !T.started) {
      const dx = Math.abs(e.clientX - T.x), dy = Math.abs(e.clientY - T.y);
      if (dx > 9 && dx > dy * 1.3) { T.started = true; begin(T.el, false, e.pointerId, T.x, T.y); }
      else return;
    }
    if (G && G.pointerId === e.pointerId) sweep(e.clientX, e.clientY);
  });
  const end = e => {
    if (T && e.pointerId === T.id) {
      if (!T.started && e.type === 'pointerup') begin(T.el, false, e.pointerId, T.x, T.y);
      T = null;
    }
    if (G && G.pointerId === e.pointerId) G = null;
  };
  ['pointerup', 'pointercancel'].forEach(ev => grid.addEventListener(ev, end));
  grid.addEventListener('lostpointercapture', e => { if (G && G.pointerId === e.pointerId && e.pointerType !== 'touch') G = null; });
  grid.addEventListener('contextmenu', e => { if (e.target.closest('.beat-cell')) e.preventDefault(); });
  grid.addEventListener('mousedown', e => { if (e.target.closest('.beat-cell')) e.preventDefault(); });
  V.isPainting = () => !!G;
}

/* ---------- actions ---------- */
function applyStarter(id) {
  if (!id) return;
  const sc = scene(), before = BB.clone(clip()), item = BB.library.itemsFor('drums').find(x => x.id === id);
  const built = BB.library.build('drums', id, sc);
  V.starterShown = id;
  edit('Starter beat', () => { BB.store.p.clips.drums[sc] = built; }, { group: 'beat-starter-' + sc, keepStarter: true });
  V.visibleBar = 0;
  const info = BB.library.drumInfo(id) || {}, bpm = BB.store.p.bpm;
  const text = (item ? item.name + ': ' + item.desc : 'Starter beat added.');
  if (info.bpm && Math.abs(info.bpm - bpm) >= BPM_GAP) {
    toast(text, { ms: 6500, action: { label: 'Use ' + info.bpm + ' BPM', onClick: () => {
      BB.store.change('Tempo', p => { p.bpm = BB.clamp(info.bpm, 50, 200); }, { group: 'bpm' });
      UI.toast('Tempo set to ' + info.bpm + ' BPM');
    } } });
  } else if (!TR.playing) {
    toast(text, { ms: 5000, action: { label: 'Play it', onClick: () => { TR.launchScene(scene()); TR.play(); } } });
  } else undoToast(text, 'Starter beat', before, sc);
}
function surprise() {
  const sc = scene(), before = BB.clone(clip()), c = BB.library.surpriseDrums(before ? before.kit : undefined);
  if (before && before.bars > 1) BB.resizeClip('drums', c, before.bars);
  edit('Surprise beat', () => { BB.store.p.clips.drums[sc] = c; });
  V.visibleBar = Math.min(V.visibleBar, c.bars - 1);
  undoToast('Here is a surprise beat. Press again for another idea.', 'Surprise beat', before, sc);
}
function copyBarToAll() {
  const c = clip(), n = barsOf(c);
  if (!c || n < 2) { toast('Your beat is 1 bar long. Set Length to 2 or 4 bars first, then copy.'); return; }
  const sc = scene(), before = BB.clone(c), from = V.visibleBar;
  edit('Copy bar', cc => {
    for (const v of VOICES) {
      const a = cc.steps[v.id], r = cc.rolls[v.id];
      for (let b = 0; b < n; b++) if (b !== from) for (let s = 0; s < 16; s++) { a[b * 16 + s] = a[from * 16 + s]; if (r) r[b * 16 + s] = r[from * 16 + s] || 0; }
    }
  });
  undoToast('Copied bar ' + (from + 1) + ' into all ' + n + ' bars.', 'Copy bar', before, sc);
}
function clearBeat() {
  const c = clip();
  if (!c || isEmpty(c)) { toast('There is nothing to clear yet.'); return; }
  const sc = scene(), before = BB.clone(c);
  edit('Clear beat', cc => {
    for (const v of VOICES) cc.steps[v.id] = new Array(cc.bars * 16).fill(0);
    cc.rolls = {};
  });
  undoToast('Beat cleared.', 'Clear beat', before, sc);
}
function setLength(n) {
  const c = clip(), old = barsOf(c);
  if (n === old) return;
  const sc = scene(), before = BB.clone(c);
  const lost = c && n < old && VOICES.some(v => (c.steps[v.id] || []).slice(n * 16).some(x => x > 0));
  edit('Beat length', cc => { BB.resizeClip('drums', cc, n); });
  V.visibleBar = Math.min(V.visibleBar, n - 1);
  if (lost) undoToast('Shortened to ' + n + (n > 1 ? ' bars' : ' bar') + '. The hits after that were removed.', 'Beat length', before, sc);
  else if (n > old) toast('Now ' + n + ' bars long. The first ' + (old > 1 ? old + ' bars were' : 'bar was') + ' repeated so you can change each copy.');
}
function setVisibleBar(b, manual) {
  V.visibleBar = BB.clamp(b, 0, barsOf(clip()) - 1);
  if (manual && TR.playing && V.follow) setFollow(false, true);
  paintCells(); syncBars(); paintPlayhead();
}
function setPage(pg, manual) {
  V.page = pg; BB.storage.set('beatboard.beat.page', pg);
  if (manual && TR.playing && V.follow && pg !== 'all') setFollow(false, true);
  V.grid.dataset.page = pg;
  if (V.ctl.pages) V.ctl.pages.update();
}
function setFollow(on, auto) {
  V.follow = on; BB.storage.set('beatboard.beat.follow', on);
  if (V.ctl.follow) V.ctl.follow.update();
  if (auto) toast('Follow is off so you can edit here. Turn it back on to jump along with the music.');
}

/* ---------- drawing ---------- */
function paintCells() {
  const c = clip(), off = V.visibleBar * 16;
  VOICES.forEach((v, ri) => {
    for (let s = 0; s < 16; s++) {
      const vel = velAt(c, v.id, off + s), roll = vel > 0 ? rollAt(c, v.id, off + s) : 0, k = vel + ':' + roll, el = V.cells[ri][s];
      const mc = V.mini[ri][s];
      if (mc._k !== k) { mc._k = k; mc.classList.toggle('on', vel > 0); mc.classList.toggle('soft', vel > 0 && vel < SOFT_LINE); }
      if (el._k === k) continue;
      el._k = k;
      el.classList.toggle('on', vel > 0);
      el.classList.toggle('soft', vel > 0 && vel < SOFT_LINE);
      if (vel > 0) el.style.setProperty('--mix', mixFor(vel)); else el.style.removeProperty('--mix');
      if (roll > 1) el.dataset.roll = roll; else delete el.dataset.roll;
      el.setAttribute('aria-pressed', vel > 0 ? 'true' : 'false');
      el.setAttribute('aria-label', v.name + ', beat ' + (Math.floor(s / 4) + 1) + ', step ' + (s + 1) + (vel > 0 ? (vel < SOFT_LINE ? ', soft hit' : ', hit') + (roll > 1 ? ', roll of ' + roll : '') : ''));
    }
  });
}
function paintCursor() {
  BB.$$('.beat-cell.cur', V.grid).forEach(el => el.classList.remove('cur'));
  if (!V.cursor.on) return;
  const el = V.cells[V.cursor.row] && V.cells[V.cursor.row][V.cursor.s];
  if (el) el.classList.add('cur');
}
function setPlayCol(col) {
  if (col === V.playCol) return;
  if (V.playCol >= 0) { V.cells.forEach(r => r[V.playCol].classList.remove('now')); V.nums[V.playCol].classList.remove('now'); V.miniCols[V.playCol].forEach(c => c.classList.remove('now')); }
  V.playCol = col;
  if (col >= 0) { V.cells.forEach(r => r[col].classList.add('now')); V.nums[col].classList.add('now'); V.miniCols[col].forEach(c => c.classList.add('now')); }
}
function paintPlayhead() {
  setPlayCol(V.playBar >= 0 && V.playBar === V.visibleBar ? V.playColRaw : -1);
  if (V.ctl.bars) BB.$$('button', V.ctl.bars).forEach((b, i) => b.classList.toggle('playing', i === V.playBar));
}
function flash(v, kind) {
  const pad = V.pads[v], lab = V.labels[v];
  for (const el of [pad, lab, V.miniPads[v]]) {
    if (!el || (kind === 'seq' && el.classList.contains('hit'))) continue;
    el.classList.add(kind);
    clearTimeout(el['_t' + kind]);
    el['_t' + kind] = setTimeout(() => el.classList.remove(kind), kind === 'hit' ? 120 : 100);
  }
}
function drumsAudible() {
  const t = BB.store.p.tracks, anySolo = BB.TRACKS.some(x => t[x.id].solo);
  return !t.drums.mute && (!anySolo || t.drums.solo);
}
/* Rebuild the bar tabs when the beat's length changes. */
function syncBars() {
  const n = barsOf(clip()), wrap = V.barsWrap;
  if (n !== V.builtBars) {
    const wasSel = BB.controls.sel === V.ctl.bars;
    const seg = UI.seg({ label: 'Bar', key: 'E', small: true,
      tip: 'Your beat is longer than one bar. Pick which bar to see and edit. Press E, then ← → to flip through them.',
      options: BB.range(n).map(i => ({ id: String(i), label: String(i + 1), tip: 'Show bar ' + (i + 1) + ' of ' + n + '.' })),
      value: () => String(V.visibleBar), set: id => setVisibleBar(+id, true) });
    seg.classList.add('beat-bar-seg');
    if (V.ctl.bars) V.ctl.bars.replaceWith(seg); else wrap.append(seg);
    V.ctl.bars = seg; V.builtBars = n;
    if (wasSel) BB.controls.select(seg, { noScroll: true });
  }
  V.ctl.bars.update();
  wrap.hidden = n <= 1;
  V.followWrap.hidden = !(n > 1 || narrowMQ.matches);
  V.miniBar.textContent = 'Bar ' + (V.visibleBar + 1) + ' of ' + n;
  V.miniBar.hidden = n < 2;
}
function refresh() {
  if (!V.root) return;
  const c = clip(), n = barsOf(c);
  V.visibleBar = BB.clamp(V.visibleBar, 0, n - 1);
  V.grid.dataset.page = V.page;
  for (const k of ['kit', 'len', 'tool', 'starter', 'swing', 'follow', 'pages', 'padVel']) if (V.ctl[k]) V.ctl[k].update();
  syncBars();
  paintCells(); paintCursor(); paintPlayhead();
  const empty = isEmpty(c);
  V.emptyHint.hidden = !empty;
  V.miniEmpty.hidden = !empty;
  V.ctl.clear.setAttribute('aria-disabled', empty ? 'true' : 'false');
  V.ctl.copy.setAttribute('aria-disabled', n < 2 ? 'true' : 'false');
  V.recPad.setAttribute('aria-pressed', TR.rec ? 'true' : 'false');
  const name = c ? (c.name || 'Beat') + ' · ' + n + (n > 1 ? ' bars' : ' bar') : 'No beat yet';
  V.nameEl.textContent = name;
  V.cardName.textContent = name;
}

/* ---------- building the screen ---------- */
function group(label, ctl, cls) {
  return h('div', 'beat-cg' + (cls ? ' ' + cls : ''), h('span', 'lbl', label), ctl);
}
/* The screen itself: how the drums sound */
function buildSound() {
  const C = V.ctl;
  C.kit = UI.kitSelect({ key: 'D',
    tip: 'The set of drum sounds this beat uses. Your pattern stays the same, only the sounds change. Press D, then ← → to try each kit.',
    value: kitNow,
    set: id => { edit('Change kit', cc => { cc.kit = id; }, { group: 'beat-kit', keepStarter: true }); const k = BB.KITS[id]; if (k) toast(k.name + ': ' + k.desc); } });
  C.swing = UI.knob({ label: 'Swing', key: 'W', size: 'md', color: 'drums', min: 0, max: 0.6, step: 0.01, kstep: 0.02, def: 0,
    tip: 'Pushes every other 16th note a little late, so the groove bounces instead of marching. Lo-fi and hip-hop love it. This changes the whole song.',
    fmt: v => (v < 0.005 ? 'Straight' : Math.round(v / 0.6 * 100) + '%'),
    value: () => BB.store.p.swing || 0,
    set: v => BB.store.change('Swing', p => { p.swing = v; }, { group: 'knob-swing' }) });
  C.swing.classList.add('beat-swing');
  C.knobs = UI.trackKnobs('drums', { volKey: 'O' });
  V.gKit = group('Kit', C.kit, 'beat-cg-kit');
  V.dialSep = h('span', { class: 'beat-dials-sep', 'aria-hidden': 'true' });
  V.dials = h('div', 'beat-dials', C.swing, V.dialSep, C.knobs);
  V.soundRow = h('div', 'beat-sound-row', V.gKit, V.dials);
  return h('section', { class: 'panel beat-sound c-drums phone-layout', id: 'beat-sound', 'aria-label': 'Drum sound' },
    h('div', 'panel-head', h('h3', null, h('i', 'sw'), 'Sound')), V.soundRow);
}
/* Card: a live mini picture of the beat, starter beats, and the button that opens the step grid */
function buildGridCard() {
  const C = V.ctl;
  const mini = h('div', { class: 'beat-mini', 'aria-hidden': 'true' });
  V.miniCols = BB.range(16).map(() => []);
  VOICES.forEach((v, ri) => {
    const row = h('div', 'bm-row');
    V.mini[ri] = [];
    for (let g = 0; g < 4; g++) {
      const grp = h('div', 'bm-grp');
      for (let i = 0; i < 4; i++) { const s = g * 4 + i, c = h('i'); V.mini[ri][s] = c; V.miniCols[s].push(c); grp.append(c); }
      row.append(grp);
    }
    mini.append(row);
  });
  V.miniEmpty = h('span', 'beat-mini-empty', 'No beat yet. Tap here to start one, or pick a starter beat.');
  V.miniBar = h('span', 'pill beat-mini-bar', '');
  C.starter = UI.select({ label: 'Starter beats', key: 'P', small: true,
    tip: 'Ready-made beats in many styles. Picking one replaces this scene’s beat; then change it to make it yours. Press P, then ← → to flip through them.',
    options: () => [{ id: '', label: UI.phone.matches ? 'Starter beats…' : 'Pick a style…' }].concat(BB.library.itemsFor('drums').map(it => ({ id: it.id, label: it.name, group: it.group }))),
    value: () => V.starterShown, set: applyStarter });
  C.surprise = UI.button({ label: 'Surprise me', key: 'U', icon: UI.ICONS.dice, cls: 'sm', instant: true,
    tip: 'Makes a random beat to spark ideas, using your kit. Press again for another one. Undo brings your old beat back.', onClick: surprise });
  C.openGrid = UI.button({ label: 'Edit beat', key: 'G', icon: UI.ICONS.edit, cls: 'colored ws-go',
    tip: 'Open the step grid full screen to place each hit in time. Close it (or press Esc) to come back here.', onClick: () => V.ws.grid.open({ from: C.openGrid }) });
  V.cardName = h('span', 'pill beat-name c-drums');
  return UI.wsCard({ id: 'beat-grid-card', title: 'Step grid', color: 'drums', cls: 'beat-card-grid phone-layout', pill: V.cardName, headExtra: V.miniBar,
    preview: h('div', 'beat-mini-wrap', mini, V.miniEmpty), onOpen: () => V.ws.grid.open({ from: C.openGrid }),
    ariaLabel: 'Open the step grid', tipTitle: 'Your beat', tip: 'A picture of the beat in this scene: each row is a drum, each column a step in time. Tap it to open the step grid and edit it.',
    foot: [C.starter, C.surprise], button: C.openGrid });
}
function buildPadsCard() {
  const mp = h('div', { class: 'beat-minipads', 'aria-hidden': 'true' });
  for (const id of PAD_ORDER) { const el = h('i', 'bmp' + (id === 'shaker' ? ' wide' : ''), h('b', null, BB.DRUM[id].pad), h('span', null, BB.DRUM[id].short)); V.miniPads[id] = el; mp.append(el); }
  mp.append(h('i', 'bmp rec', h('b', null, '.'), h('span', null, 'Rec')));
  V.ctl.openPads = UI.button({ label: 'Play pads', key: 'A', icon: UI.ICONS.tap, cls: 'colored ws-go',
    tip: 'Open big drum pads full screen to play live with your fingers. Turn on Record to add what you play to the beat.', onClick: () => V.ws.pads.open({ from: V.ctl.openPads }) });
  return UI.wsCard({ id: 'beat-pads-card', title: 'Pads', color: 'drums', cls: 'beat-card-pads ws-card-side phone-layout',
    preview: mp, onOpen: () => V.ws.pads.open({ from: V.ctl.openPads }),
    ariaLabel: 'Open the drum pads', tipTitle: 'Finger drums', tip: 'Big pads to play the drums live, like a drum machine. Tap here to open them.',
    foot: [h('p', 'hint beat-card-hint', h('span', 'only-fine', 'The number pad plays them from any screen.'), h('span', 'only-touch', 'Freestyle, or record a take.'))], button: V.ctl.openPads });
}

/* Computers: the classic one-page arrangement. Its containers start empty; layout() fills them. */
function buildDesk() {
  V.gStarter = group('Starter beats', null, 'beat-cg-starter');
  V.swingWrap = h('div', 'beat-cg beat-cg-swing');
  V.deskActions = h('div', 'beat-actions');
  V.deskControls = h('div', { class: 'panel beat-controls desk-layout', id: 'beat-controls' });
  V.deskPadSlot = h('div', 'beat-padslot');
  V.deskPads = h('section', { class: 'panel beat-padpanel c-drums', 'aria-label': 'Drum pads' },
    h('div', 'panel-head', h('h3', null, 'Pads'), h('p', 'hint', h('span', 'only-fine', 'Number pad layout'), h('span', 'only-touch', 'Tap to play'))),
    V.deskPadSlot,
    h('p', { class: 'hint beat-padhint' },
      h('span', 'only-fine', 'Tap the number pad to play. Turn on Record (R) to add what you tap to the beat.'),
      h('span', 'only-touch', 'Tap the pads to play. Turn on Record to add what you tap to the beat.')));
  V.deskMain = h('div', 'beat-main desk-layout', V.deskPads);
}
/* Put the shared controls where this screen size wants them */
function layout(phone) {
  const C = V.ctl, foot = V.gridCardFoot;
  const softTip = 'Quiet hits, shown dimmer. Drummers call them ghost notes; they make a beat feel human.';
  if (phone) {
    V.soundRow.replaceChildren(V.gKit, V.dials);
    V.dials.replaceChildren(C.swing, V.dialSep, C.knobs);
    foot.prepend(C.starter, C.surprise);
    V.tools.replaceChildren(V.gTool, V.gLen);
    V.phoneActions.replaceChildren(C.copy, C.clear);
    V.seqHead.append(V.phoneActions);
    V.ws.grid.head.insertBefore(V.nameEl, V.wsGrow);
    V.ws.grid.body.append(V.tools, V.seqPanel);
    V.ws.pads.body.prepend(V.padsWrap);
  } else {
    V.gStarter.append(C.starter);
    V.swingWrap.append(C.swing);
    V.deskActions.replaceChildren(C.surprise, C.copy, C.clear);
    V.deskControls.replaceChildren(V.gKit, V.gLen, V.gTool, V.gStarter, V.swingWrap, V.deskActions);
    V.seqHead.insertBefore(V.nameEl, V.seqHead.children[1]);
    V.deskMain.prepend(V.seqPanel);
    V.deskPadSlot.append(V.padsWrap);
  }
  C.swing.classList.toggle('sm', !phone); C.swing.classList.toggle('md', phone);
  C.starter.classList.toggle('sm', phone); C.starter.refill();
  const softBtn = C.tool.querySelectorAll('button')[1];
  if (softBtn) softBtn.setAttribute('data-tip', phone ? softTip : softTip + ' The pads play softly too.');
}

/* Workspace: the step grid */
function buildGridWorkspace() {
  const C = V.ctl;
  C.len = UI.seg({ label: 'Length', key: 'B',
    tip: 'How long your beat is before it repeats. 1 bar is 16 squares. Longer beats leave room for a fill at the end.',
    options: [
      { id: 1, label: '1 bar', tip: '16 squares. Repeats every 4 beats.' },
      { id: 2, label: '2 bars', tip: '32 squares. The first bar is copied so you can change the second.' },
      { id: 4, label: '4 bars', tip: '64 squares. Room for a fill in the last bar.' }],
    value: () => barsOf(clip()), set: setLength });
  C.len.classList.add('beat-len');
  BB.$$('button', C.len).forEach(b => { const t = b.textContent, n = t.split(' ')[0]; b.textContent = n; b.append(h('span', 'u', t.slice(n.length))); });
  C.tool = UI.seg({ label: 'Hits', key: 'H',
    tip: 'What clicking a square does. Hard adds a loud hit, Soft a quiet one, Rolls turns a hit into a quick burst.',
    options: [
      { id: 'hard', label: 'Hard', icon: ICON.hard, tip: 'Loud, full hits. Click a square to add one, click it again to remove it.' },
      { id: 'soft', label: 'Soft', icon: ICON.soft, tip: 'Quiet hits, shown dimmer. Drummers call them ghost notes; they make a beat feel human.' },
      { id: 'roll', label: 'Rolls', icon: ICON.roll, tip: 'Click a hit to split it into 2, 3 or 4 quick hits (shown as dots). Click again to change it. Hi-hat rolls are the classic trap sound.' }],
    value: () => V.tool, set: id => { V.tool = id; BB.storage.set('beatboard.beat.tool', id); } });
  C.copy = UI.button({ label: 'Copy bar to all', key: 'C', icon: UI.ICONS.copy, cls: 'sm icon-phone',
    tip: 'Copies the bar you are looking at into every other bar of this beat. Handy before you add a fill to the last bar.', onClick: copyBarToAll });
  C.clear = UI.button({ label: 'Clear', key: 'X', icon: UI.ICONS.trash, cls: 'sm ghost danger icon-phone',
    tip: 'Removes every hit from this beat. You can undo it.', onClick: clearBeat });
  V.gTool = group('Hits', C.tool, 'beat-cg-tool');
  V.gLen = group([h('span', 'w720', 'Length'), h('span', 'n720', 'Bars')], C.len, 'beat-cg-len');
  V.tools = h('div', 'beat-tools', V.gTool, V.gLen);

  C.follow = UI.toggle({ label: 'Follow', key: 'F', icon: ICON.follow, cls: 'sm c-drums',
    tip: 'When on, the grid jumps to the part that is playing. Picking a bar yourself turns it off.',
    value: () => V.follow, set: on => setFollow(on) });
  C.pages = UI.seg({ label: 'Steps shown', small: true,
    tip: 'On a narrow screen the grid can show half a bar at a time, with bigger squares that are easier to tap. Pick All to see all 16.',
    options: [{ id: 'a', label: '1–8', tip: 'Steps 1 to 8 (beats 1 and 2).' }, { id: 'b', label: '9–16', tip: 'Steps 9 to 16 (beats 3 and 4).' }, { id: 'all', label: 'All', tip: 'All 16 steps, smaller squares.' }],
    value: () => V.page, set: pg => { setPage(pg, true); paintCursor(); } });
  V.barsWrap = h('div', 'beat-bars', h('span', 'lbl', 'Bar'));
  V.followWrap = h('div', 'beat-follow', C.follow);
  V.nameEl = h('span', { class: 'pill beat-name c-drums', 'data-tip': 'The name and length of the beat in this scene.', 'data-tip-title': 'This beat' });
  V.phoneActions = h('div', 'beat-actions', C.copy, C.clear);
  V.seqHead = h('div', 'panel-head',
    h('h3', 'desk-layout', 'Step grid'),
    h('p', 'hint beat-grid-hint', h('span', 'only-fine', 'Click to add a hit, drag to paint, right-click to erase.'), h('span', 'only-touch', 'Tap to add a hit. Slide sideways to paint.')),
    h('span', 'grow'), h('div', 'beat-pages', C.pages), V.barsWrap, V.followWrap, V.phoneActions);
  V.seqPanel = h('section', { class: 'panel beat-seq c-drums', 'aria-label': 'Step grid' }, V.seqHead, buildGrid());
  V.wsGrow = h('span', 'grow');

  V.ws.grid = UI.workspace({ id: 'beat-grid', title: 'Step grid', color: 'drums', cls: 'beat-ws beat-gridws',
    closeTip: 'Close the step grid and go back to the Beat screen. Your beat keeps playing. Shortcut: Esc.',
    head: [V.nameEl, V.wsGrow, UI.sceneSelect({ track: 'drums', key: 'S' })],
    onOpen: () => refresh(), onClose: () => { V.cursor.on = false; paintCursor(); } });
  V.ws.grid.body.append(V.tools, V.seqPanel);
  return V.ws.grid.el;
}
/* Workspace: big pads for playing live */
function buildPadsWorkspace() {
  const wrap = V.padsWrap = h('div', { class: 'beat-pads c-drums', id: 'beat-pads', 'data-no-press-tip': '' });
  /* phones have a Hard / Soft switch on the pads; computers follow the Hits tool, as they always did */
  const vel = () => ((UI.phone.matches ? V.padSoft : V.tool === 'soft') ? 0.5 : 0.95);
  for (const id of PAD_ORDER) {
    const v = BB.DRUM[id];
    const pad = h('button', { class: 'beat-pad' + (id === 'shaker' ? ' wide' : ''), 'data-voice': id, 'aria-label': v.name + ' pad (number ' + v.pad + ')',
      'data-tip': v.desc + '. Tap to play it. Keyboard: ' + v.pad + ' on the number pad, or the ' + v.pad + ' key at the top.', 'data-tip-title': v.name },
      h('span', 'pad-num', v.pad), h('span', 'pad-name', v.short));
    pad.addEventListener('pointerdown', e => { if (e.button > 0) return; if (e.pointerType === 'mouse') e.preventDefault(); BB.controls.clear(); TR.drumHit(id, vel()); });
    pad.addEventListener('mousedown', e => e.preventDefault());
    pad.addEventListener('click', e => { if (e.detail === 0) TR.drumHit(id, vel()); });
    V.pads[id] = pad; wrap.append(pad);
  }
  V.recPad = h('button', { class: 'beat-pad rec', 'aria-pressed': 'false', 'aria-label': 'Record on or off',
    'data-tip': 'Turn recording on or off. While it is on, what you tap is added to the beat, snapped in time. Keyboard: R, or the . key on the number pad.', 'data-tip-title': 'Record',
    onclick: () => TR.setRec(!TR.rec) }, h('span', 'pad-num', '.'), h('span', 'pad-name', h('i', 'rec-dot'), 'Rec'));
  V.recPad.addEventListener('mousedown', e => e.preventDefault());
  wrap.append(V.recPad);
  V.ctl.padVel = UI.seg({ label: 'Pad hits', key: 'H', small: true,
    tip: 'How hard the pads play. Soft is quiet, like a drummer’s ghost notes. On a keyboard, hold Shift for a soft hit.',
    options: [{ id: false, label: 'Hard', icon: ICON.hard, tip: 'Loud, full hits.' }, { id: true, label: 'Soft', icon: ICON.soft, tip: 'Quiet hits.' }],
    value: () => V.padSoft, set: v => { V.padSoft = v; BB.storage.set('beatboard.beat.padSoft', v); } });
  V.ctl.padVel.classList.add('beat-padvel');
  V.ws.pads = UI.workspace({ id: 'beat-pads', title: 'Pads', color: 'drums', cls: 'beat-ws beat-padws',
    closeTip: 'Close the pads and go back to the Beat screen. Shortcut: Esc.',
    head: [h('span', 'grow'), UI.sceneSelect({ track: 'drums', key: 'S' })] });
  V.ws.pads.body.append(wrap,
    h('div', 'beat-padfoot', V.ctl.padVel,
      h('p', { class: 'hint beat-padhint' },
        h('span', 'only-fine', 'Tap the pads or the number pad. Turn on Record (R) to add what you play to the beat.'),
        h('span', 'only-touch', 'Turn on Record at the top to add what you play to the beat.'))));
  return V.ws.pads.el;
}
function buildGrid() {
  const grid = h('div', { class: 'beat-grid c-drums', id: 'beat-grid', role: 'group', 'aria-label': 'Drum step grid', 'data-page': V.page });
  const head = h('div', { class: 'beat-row beat-nums', 'aria-hidden': 'true' },
    h('span', { class: 'beat-corner', 'data-tip': 'The numbers count the 4 beats in a bar. Every 4 squares is one beat, and each square is a 16th note.', 'data-tip-title': 'Beats' }, 'Beat'));
  for (let g = 0; g < 4; g++) {
    const grp = h('div', 'grp g' + g + (g % 2 ? ' alt' : ''));
    for (let i = 0; i < 4; i++) { const s = g * 4 + i, n = h('span', 'bnum' + (i === 0 ? ' major' : i === 2 ? ' and' : ''), i === 0 ? String(g + 1) : i === 2 ? '+' : '·'); V.nums[s] = n; grp.append(n); }
    head.append(grp);
  }
  grid.append(head);
  VOICES.forEach((v, ri) => {
    const lab = h('button', { class: 'beat-lab', 'data-voice': v.id, 'aria-label': 'Hear the ' + v.name.toLowerCase(), 'data-tip': v.desc + '. Click to hear it.', 'data-tip-title': v.name },
      h('i', 'dot'), h('span', 'nm', v.short), h('span', { class: 'pk', 'aria-hidden': 'true' }, v.pad));
    const hear = () => { BB.preview.drum(v.id, kitNow()); flash(v.id, 'hit'); };
    lab.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); hear(); });
    lab.addEventListener('click', e => { if (e.detail === 0) hear(); });
    V.labels[v.id] = lab;
    const row = h('div', { class: 'beat-row', 'data-voice': v.id }, lab);
    V.cells[ri] = [];
    for (let g = 0; g < 4; g++) {
      const grp = h('div', 'grp g' + g + (g % 2 ? ' alt' : ''));
      for (let i = 0; i < 4; i++) {
        const s = g * 4 + i, cell = h('button', { class: 'beat-cell', tabindex: '-1', 'aria-pressed': 'false', dataset: { r: ri, s } });
        V.cells[ri][s] = cell; grp.append(cell);
      }
      row.append(grp);
    }
    V.rows[ri] = row; grid.append(row);
  });
  V.emptyHint = h('div', { class: 'beat-empty', 'aria-live': 'polite' },
    h('span', null, h('span', 'only-fine', 'Click'), h('span', 'only-touch', 'Tap'), ' squares to start a beat, or pick a starter beat'));
  grid.append(V.emptyHint);
  wireGrid(grid);
  V.grid = grid;
  return grid;
}

/* ---------- the view ---------- */
BB.views.register({
  id: 'beat', title: 'Beat', letterMode: 'plain',
  mount(el) {
    V.root = el; el.classList.add('beat-view');
    el.append(
      h('div', 'view-head beat-head',
        h('div', 'beat-titles',
          h('div', 'beat-title-row', h('h2', 'view-title', 'Beat'), UI.tourButton('beat')),
          h('p', 'view-sub', h('span', 'only-fine', 'Click'), h('span', 'only-touch', 'Tap'), ' squares to build a drum pattern, or play the pads like a drummer.')),
        UI.scenePicker({ track: 'drums', key: 'S' })),
      buildSound());
    buildDesk();
    const gridCard = buildGridCard();
    V.gridCardFoot = gridCard.querySelector('.ws-card-foot');
    el.append(V.deskControls, h('div', 'beat-cards phone-layout', gridCard, buildPadsCard()), V.deskMain,
      buildGridWorkspace(), buildPadsWorkspace());
    UI.onLayout(phone => { layout(phone); if (V.grid) refresh(); });
    BB.on('drumhit', d => { if (BB.state.view === 'beat') flash(d.voice, 'hit'); });
    BB.on('ui', d => { if ('scene' in d) { V.visibleBar = 0; V.starterShown = ''; V.playBar = -1; refresh(); } });
    BB.on('transport', d => { if ('rec' in d && V.recPad) V.recPad.setAttribute('aria-pressed', TR.rec ? 'true' : 'false'); if (d.playing === false) { V.playBar = -1; paintPlayhead(); } });
    narrowMQ.addEventListener('change', refresh);
    refresh();
  },
  render() { refresh(); },
  show() { refresh(); },
  hide() { BB.$$('.beat-pad.hit, .beat-pad.seq, .beat-lab.hit, .bmp.hit, .bmp.seq', V.root).forEach(e => e.classList.remove('hit', 'seq')); },
  step(e) {
    if (!e) { V.playBar = -1; paintPlayhead(); return; }
    const d = e.pos && e.pos.drums;
    if (d && drumsAudible()) {
      const c = BB.store.clip('drums', d.scene);
      if (c) for (const v of VOICES) if (velAt(c, v.id, d.pos) > 0) flash(v.id, 'seq');
    }
    if (!d || d.scene !== BB.state.scene) { if (V.playBar !== -1) { V.playBar = -1; paintPlayhead(); } return; }
    const bar = Math.floor(d.pos / 16), col = d.pos % 16;
    if (V.follow && !(V.isPainting && V.isPainting())) {
      if (bar !== V.visibleBar && bar < barsOf(clip())) { V.visibleBar = bar; paintCells(); syncBars(); paintCursor(); }
      if (paging() && pageOf(col) !== V.page) { V.page = pageOf(col); V.grid.dataset.page = V.page; V.ctl.pages.update(); }
    }
    V.playBar = bar; V.playColRaw = col;
    paintPlayhead();
  },
  keydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const code = e.code;
    if (DIGIT[code]) { if (!e.repeat) TR.drumHit(DIGIT[code], e.shiftKey ? 0.5 : 0.95); return true; }
    if (BB.controls.sel || !gridOpen()) return false; // the grid cursor only works while the step grid is open
    switch (e.key) {
      case 'ArrowLeft': moveCursor(0, e.shiftKey ? -4 : -1); return true;
      case 'ArrowRight': moveCursor(0, e.shiftKey ? 4 : 1); return true;
      case 'ArrowUp': moveCursor(-1, 0); return true;
      case 'ArrowDown': moveCursor(1, 0); return true;
      case 'Enter': if (!e.repeat) cursorCell(false); return true;
      case 'Backspace': case 'Delete': cursorCell(true); return true;
      default: return false;
    }
  },
  tutorial: [
    /* computers */
    { only: 'desk', target: '#beat-grid', view: 'beat', title: 'The step grid',
      text: 'This is a drum machine. Each row is one drum sound, and each square is a short slice of time. <b>16 squares make 1 bar.</b> When you press Play, the music moves left to right and loops.' },
    { only: 'desk', target: '#beat-grid .beat-nums', view: 'beat', title: 'Count 1, 2, 3, 4',
      text: 'Every group of 4 squares is one <b>beat</b>, and a bar has 4 beats. Count “1, 2, 3, 4” out loud while it plays and you will feel where each hit lands.' },
    { only: 'desk', target: '#beat-grid .beat-row[data-voice="kick"]', view: 'beat', title: 'Kick on 1 and 3, snare on 2 and 4',
      text: 'The beat behind thousands of songs: a <b>Kick</b> on beats 1 and 3, a <b>Snare</b> on beats 2 and 4, and a <b>Hat</b> on every other square. Click a row name to hear that drum.' },
    { only: 'desk', target: '#beat-pads', view: 'beat', title: 'Finger drums',
      text: 'Tap the pads to play live. They are laid out like a computer <b>number pad</b>: 1 is the kick, 2 the snare, 4 the hi-hat. The number pad plays drums from any screen, and the 1–0 keys work here too.' },
    { only: 'desk', target: '.beat-pad.rec', view: 'beat', title: 'Record what you tap',
      text: 'Turn on <b>Record</b> (press <b>R</b>, or the number pad’s <b>.</b> key), then tap along with the music. Your hits land on the grid, snapped in time. Not happy? Undo with <b>Ctrl+Z</b>.' },
    { only: 'desk', target: '.beat-cg-kit', view: 'beat', title: 'Kits and starter beats',
      text: 'The <b>Kit</b> swaps the sounds and keeps your pattern: try Trap 808 or 8-bit. <b>Starter beats</b> give you a ready-made groove in a style you like, to change as you wish.' },
    { only: 'desk', target: '.beat-cg-swing', view: 'beat', title: 'Swing',
      text: 'Swing pushes every other 16th note a little late, so the beat bounces instead of marching. Try around 30% with the Lo-fi starter beat. Press <b>W</b>, then <b>← →</b>.' },
    { only: 'desk', target: '.beat-cg-tool', view: 'beat', title: 'Try this',
      text: 'Pick the <b>Boom bap</b> starter beat and press Play. Choose <b>Soft</b> and add a quiet snare just before beat 3. Then choose <b>Rolls</b> and click a hi-hat to make it flutter.' },
    /* phones: the step grid and the pads open full screen */
    { only: 'phone', target: '#beat-sound', view: 'beat', title: 'Your drum sound',
      text: 'This screen is home base for your drums. Here you shape the <b>sound</b>: the <b>Kit</b> swaps every drum at once, <b>Swing</b> makes the groove bounce, and the dials set the drums’ volume, tone, reverb (Space) and echo.' },
    { only: 'phone', target: '#beat-grid-card', view: 'beat', title: 'Your beat at a glance',
      text: 'This little picture is the beat in the scene you picked at the top. <b>Tap it</b> (or <b>Edit beat</b>) to open the step grid full screen. <b>Play pads</b> opens big pads for playing live.' },
    { only: 'phone', target: '#beat-grid', view: 'beat', title: 'The step grid',
      text: 'Each row is one drum sound and each square is a short slice of time. Every group of 4 squares is one <b>beat</b>, and <b>16 squares make 1 bar</b>. Press Play and count “1, 2, 3, 4”. <b>Close</b> (or Esc) takes you back.' },
    { only: 'phone', target: '#beat-grid .beat-row[data-voice="kick"]', view: 'beat', title: 'Kick on 1 and 3, snare on 2 and 4',
      text: 'The beat behind thousands of songs: a <b>Kick</b> on beats 1 and 3, a <b>Snare</b> on beats 2 and 4, and a <b>Hat</b> on every other square. Click a row name to hear that drum.' },
    { only: 'phone', target: () => V.gTool, view: 'beat', title: 'Soft hits and rolls',
      text: '<b>Soft</b> adds quiet “ghost” hits that make a beat feel human. <b>Rolls</b> turns a hit into a quick burst: click a hi-hat for the classic trap flutter.' },
    { only: 'phone', target: '#beat-pads', view: 'beat', title: 'Finger drums',
      text: 'Tap the pads to play live. They are laid out like a computer <b>number pad</b>: 1 is the kick, 2 the snare, 4 the hi-hat. The number pad plays drums from any screen, and the 1–0 keys work here too.' },
    { only: 'phone', target: '.beat-pad.rec', view: 'beat', title: 'Record what you tap',
      text: 'Turn on <b>Record</b> (press <b>R</b>, or the number pad’s <b>.</b> key), then tap along with the music. Your hits land on the grid, snapped in time. Not happy? Undo with <b>Ctrl+Z</b>.' },
    { only: 'phone', target: () => V.ctl.starter, view: 'beat', title: 'Try this',
      text: 'Pick the <b>Boom bap</b> starter beat and press Play. Then tap <b>Edit beat</b>, choose <b>Soft</b> and add a quiet snare just before beat 3.' },
  ],
});
})();

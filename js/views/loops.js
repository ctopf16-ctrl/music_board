/* Beat Board · Loops screen (the home screen)
   A loop launcher grid, made friendly: tracks across, scenes (song sections) down.
   - Press a loop to start or stop it. While playing, changes wait for the next bar.
   - The ▶ at the start of a row launches the whole scene (keys 1–8 too).
   - A + square opens the starter-loop library for that track and scene.
   - Selecting a square shows a toolbar: edit, swap, duplicate, copy/paste, length, delete.
   Phones (≤720px): the grid shows one track at a time (switch with the track strip or a
   sideways swipe) and the toolbar sits just above the tab bar, where thumbs reach it.
   Every selector in css/views/loops.css starts with .lp-view or an lp- class. */
(function () {
'use strict';
const BB = window.BB, { h } = BB, UI = BB.ui, TR = BB.transport, I = UI.ICONS, C = BB.controls;
const TRACKS = BB.TRACKS, NT = TRACKS.length, NS = BB.SCENE_COUNT;

const QUICK_NAMES = [
  ['Intro', 'The opening. Often just a few parts, so the song can grow.'],
  ['Verse', 'Where the story happens. Medium energy, repeats with new words.'],
  ['Pre-chorus', 'A short build that raises the tension right before the chorus.'],
  ['Chorus', 'The big, catchy part everybody remembers.'],
  ['Bridge', 'Something different before the last chorus, for contrast.'],
  ['Drop', 'The high-energy payoff in dance music, right after a build.'],
  ['Break', 'Strip things back for a breather.'],
  ['Outro', 'The ending. Take parts away until it fades out.'],
];
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  paste: svg('<rect x="5" y="4.5" width="14" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 4.5V3h6v1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 10.5h6M9 14.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  dup: svg('<rect x="3.5" y="3.5" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 6.5v6M6.5 9.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19.5 8.5v9a2 2 0 0 1-2 2h-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  swap: svg('<path d="M4.5 8.5h14l-4-4M19.5 15.5h-14l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
};
const ico = html => h('span', { class: 'ico', html });

/* ---------------- small helpers ---------------- */
const P = () => BB.store.p;
const clipAt = (t, s) => BB.store.clip(TRACKS[t].id, s);
const sceneName = s => P().scenes[s].name;
const barsText = n => n + (n === 1 ? ' bar' : ' bars');
const instName = id => (id === 'drums' ? 'Drum machine' : ((BB.INSTRUMENTS[P().tracks[id].inst] || {}).name || 'Synth'));
const editorOf = id => (id === 'drums' ? 'Beat' : id === 'chords' ? 'Chords' : 'Keys');
const whatOf = type => (type === 'drums' ? 'the hits' : type === 'chords' ? 'the chords' : 'the notes');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const loopMode = () => TR.mode === 'loop';
/* A toast with an Undo button. It only undoes if nothing else changed since, and it replaces an
   older Undo toast from this screen, so there is never a stale Undo on screen. */
function undoToast(text) {
  const v = BB.store.version;
  BB.$$('#toasts .toast.lp-undo').forEach(t => t.classList.add('lp-stale'));
  UI.toast(text, { ms: 4200, action: { label: 'Undo', onClick: () => {
    if (BB.store.version === v) BB.store.undo(); else UI.toast('Something else changed since. Use Undo in the top bar to step back.');
  } } });
  const wrap = BB.$('#toasts'), t = wrap && wrap.lastElementChild;
  if (t) t.classList.add('lp-undo');
}
const songIsEmpty = () => TRACKS.every(t => P().clips[t.id].every(c => !c));

/* ---------------- state ---------------- */
const V = { cells: [], sig: [], heads: [], scenes: [], chips: [], prog: {}, lastScene: {}, songScene: -1, lv: new Array(NT).fill(0), metersOn: false };
let sel = null;        // {t, s}: the selected square, which is also the keyboard cursor
let clipboard = null;  // {track, clip}
let ptrack = 0;        // phones: the track column being shown

/* ================= building ================= */
function mount(el) {
  V.root = el;
  el.classList.add('lp-view');
  V.stopAll = UI.button({ label: 'Stop all', icon: I.stop, key: 'S', instant: true, cls: 'lp-stopall',
    tip: 'Stops every loop at the end of the bar, so the music ends neatly. Press it again to stop right away.',
    onClick: () => { stopAll(); release(); } });
  const head = h('div', 'view-head lp-head',
    h('div', 'lp-titles', h('h2', 'view-title', 'Loops'),
      h('p', 'view-sub', 'Tap a loop to start it. Changes wait for the next bar, so you always stay in time.')),
    h('div', 'lp-head-actions', UI.tourButton('loops'), V.stopAll));
  V.start = buildStartHint();
  V.tools = buildTools();
  V.strip = buildStrip();
  V.board = buildBoard();
  V.live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  V.panel = h('div', 'panel lp-panel', V.tools, V.strip, V.board);
  el.append(head, V.start, V.panel, V.live);

  BB.on('launch', refreshState);
  BB.on('transport', d => { if (d && d.playing === false) clearProgress(); refreshState(); });
  BB.on('ui', d => {
    if (!('scene' in d)) return;
    if (sel && sel.s !== d.scene) { sel = { t: sel.t, s: d.scene }; refreshSel(); }
    refreshState();
  });
  BB.on('frame', meters);
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => { if (sel) setPtrack(sel.t); refreshState(); });
  render({ all: true });
}

function buildStartHint() {
  return h('div', { class: 'lp-start', hidden: true },
    h('span', { class: 'lp-start-art', 'aria-hidden': 'true' }, TRACKS.slice(0, 4).map(tr => h('i', 'c-' + tr.color))),
    h('div', 'lp-start-text',
      h('h4', null, 'Your song is empty. Let’s add a loop!'),
      h('p', null, 'Press any ', h('b', null, '+'), ' square below to pick a ready-made loop. Drums are a great first step. Or load the demo song from the menu ',
        h('span', { class: 'lp-inline-ico', html: I.menu, 'aria-label': 'menu' }), ' to hear a finished example.')),
    h('div', 'lp-start-actions',
      h('button', { class: 'btn primary', 'data-tip-title': 'Add a drum beat', 'data-tip': 'Pick a ready-made beat for the first scene. You can change every hit later.',
        onclick: () => { const s = BB.state.scene; select(0, s); openLibrary(0, s); } }, ico(I.plus), 'Add a drum beat'),
      h('button', { class: 'btn', 'data-tip-title': 'Demo song', 'data-tip': 'Loads a finished example song to explore and remix. Undo brings back your empty song.',
        onclick: loadDemo }, ico(I.play), 'Load the demo song')));
}

/* ---- the selected-loop toolbar ---- */
function buildTools() {
  const T = V.T = {};
  T.hint = h('p', 'lp-tools-hint',
    h('span', null, 'Select a loop to edit, copy or change its length here.'),
    h('span', 'lp-kbd', h('kbd', null, '←↑↓→'), ' move ', h('kbd', null, 'Enter'), ' start/stop ', h('kbd', null, '1'), '–', h('kbd', null, '8'), ' launch a row'));
  T.where = h('span', 'lp-ctx-where'); T.name = h('span', 'lp-ctx-name');
  T.ctx = h('div', 'lp-ctx', h('i', 'sw'), h('span', 'lp-ctx-text', T.where, T.name));
  const b = (o) => UI.button(Object.assign({ cls: 'sm', instant: true }, o, { onClick: () => { o.run(); release(); } }));
  T.swap = b({ label: 'Add loop', icon: I.plus, key: 'A', tip: '', run: () => sel && openLibrary(sel.t, sel.s) });
  T.edit = b({ label: 'Edit', icon: I.edit, key: 'E', cls: 'sm lp-for-clip', tip: '', run: () => sel && clipAt(sel.t, sel.s) && goEdit(sel.t, sel.s) });
  T.dup = b({ label: 'Duplicate', icon: ICON.dup, key: 'D', cls: 'sm lp-for-clip', tip: 'Makes a copy in the next empty scene of this track. Handy for making a variation.', run: duplicateSel });
  T.copy = b({ label: 'Copy', icon: I.copy, key: 'C', cls: 'sm lp-for-clip', tip: `Remembers this loop so you can paste it into another square. Shortcut: ${MOD}C.`, run: copySel });
  T.paste = b({ label: 'Paste', icon: ICON.paste, key: 'P', tip: `Puts the copied loop into the selected square. Shortcut: ${MOD}V.`, run: pasteSel });
  T.del = b({ label: 'Delete', icon: I.trash, key: 'X', cls: 'sm danger lp-for-clip', tip: 'Removes this loop. You can undo it. Shortcut: the Delete key.', run: deleteSel });
  const lenTip = 'How many bars this loop lasts before it repeats. Making it longer copies what is there, so you can add changes to the copy.';
  const lenVal = () => { const c = sel && clipAt(sel.t, sel.s); return c ? c.bars : 0; };
  T.len = UI.seg({ label: 'Length', key: 'B', small: true, tip: lenTip, value: lenVal, set: v => setLength(+v),
    options: BB.BAR_CHOICES.map(n => ({ id: n, label: String(n), tip: barsText(n) })) });
  T.lenSel = UI.select({ label: 'Length', small: true, tip: lenTip, value: () => String(lenVal() || ''), set: v => setLength(+v),
    options: BB.BAR_CHOICES.map(n => ({ id: String(n), label: barsText(n) })) });
  T.lenSel.classList.add('lp-len-sel');
  T.rename = b({ label: 'Rename scene', icon: I.edit, key: 'N', cls: 'sm ghost lp-rename-btn', tip: 'Give this row a name like Verse or Chorus, so your song is easy to find your way around.', run: () => sel && openRename(sel.s) });
  T.close = h('button', { class: 'btn ghost icon-only sm lp-close', 'aria-label': 'Close the toolbar', 'data-tip-title': 'Close', 'data-tip': 'Hides this toolbar. Tap any loop to bring it back.',
    onclick: () => { sel = null; refreshSel(); refreshTools(); } }, ico(I.close));
  return h('div', { class: 'lp-tools', 'data-state': 'none', role: 'toolbar', 'aria-label': 'Selected loop' },
    T.hint, T.ctx,
    h('div', 'lp-acts', T.swap, T.edit, T.dup, T.copy, T.paste, T.del),
    h('div', 'lp-len lp-for-clip', h('span', 'lbl', 'Bars'), T.len, T.lenSel),
    T.rename, T.close);
}

/* ---- phones: which track column is shown ---- */
function buildStrip() {
  const strip = h('div', { class: 'lp-strip', role: 'group', 'aria-label': 'Show track' });
  TRACKS.forEach((tr, t) => {
    const b = h('button', { class: 'lp-chip c-' + tr.color, 'aria-pressed': String(t === ptrack), 'data-tip-title': tr.name,
      'data-tip': `Show the ${tr.name} column. You can also swipe sideways on the grid to switch tracks.`, onclick: () => setPtrack(t) },
    h('i', 'sw'), h('span', 'lp-chip-name', tr.name));
    V.chips[t] = b; strip.append(b);
  });
  return strip;
}

function buildBoard() {
  const b = h('div', { class: 'lp-board', role: 'group', 'aria-label': 'Loop grid', 'data-ptrack': TRACKS[ptrack].id });
  b.append(h('div', { class: 'lp-corner', 'aria-hidden': 'true' }, h('span', 'lbl', 'Scenes')));
  TRACKS.forEach((tr, t) => b.append(buildHead(tr, t)));
  for (let t = 0; t < NT; t++) { V.cells[t] = []; V.sig[t] = []; }
  for (let s = 0; s < NS; s++) {
    b.append(buildScene(s));
    TRACKS.forEach((tr, t) => { const c = buildCell(t, s); V.cells[t][s] = c; b.append(c); });
  }
  addSwipe(b);
  return b;
}

function buildHead(tr, t) {
  const tb = (cls, label, tipTitle, tip, onclick, kids) => h('button', { class: 'lp-hbtn ' + cls, 'aria-label': label, 'data-tip-title': tipTitle, 'data-tip': tip, onclick }, kids);
  const mute = tb('lp-mute', 'Mute ' + tr.name, 'Mute', `Silences the ${tr.name} without stopping the loop. Press again to bring them back.`,
    () => toggleMix(tr.id, 'mute'), [h('span', 'lp-short', 'M'), h('span', 'lp-long', 'Mute')]);
  const solo = tb('lp-solo', 'Solo ' + tr.name, 'Solo', `Plays only the ${tr.name} (and any other soloed tracks). Great for hearing one part on its own.`,
    () => toggleMix(tr.id, 'solo'), [h('span', 'lp-short', 'S'), h('span', 'lp-long', 'Solo')]);
  const stop = tb('lp-tstop', 'Stop ' + tr.name, 'Stop ' + tr.name, `Stops the ${tr.name} loop at the end of the bar. The other tracks keep playing.`,
    () => TR.stopClip(tr.id), [ico(I.stop), h('span', 'lp-long', 'Stop')]);
  mute.setAttribute('aria-pressed', 'false'); solo.setAttribute('aria-pressed', 'false');
  const inst = h('span', 'lp-ch-inst'), meter = h('i');
  const el = h('div', { class: 'lp-colhead c-' + tr.color, 'data-track': tr.id, 'data-tip-title': tr.name, 'data-tip': tr.desc + '.' },
    h('div', 'lp-ch-name', h('i', 'sw'), h('span', null, tr.name)), inst,
    h('div', 'lp-ch-btns', mute, solo, stop),
    h('span', { class: 'lp-meter', 'aria-hidden': 'true' }, meter));
  V.heads[t] = { el, mute, solo, stop, inst, meter };
  return el;
}

function buildScene(s) {
  const name = h('span', 'lp-sname');
  const dots = h('span', { class: 'lp-dots', 'aria-hidden': 'true' }, TRACKS.map(tr => h('i', 'c-' + tr.color)));
  const launch = h('button', { class: 'lp-launch', onclick: () => launchRow(s) },
    h('span', { class: 'lp-play', html: I.play }), h('span', 'lp-stext', h('span', 'lp-snum', String(s + 1)), name, dots));
  const ren = h('button', { class: 'lp-rename', 'aria-label': 'Rename scene ' + (s + 1), 'data-tip-title': 'Name this scene',
    'data-tip': 'Give this row a name like Verse or Chorus, so your song is easy to find your way around.', onclick: () => openRename(s) }, ico(I.edit));
  const el = h('div', { class: 'lp-scene', 'data-scene': s }, launch, ren);
  V.scenes[s] = { el, launch, name, dots: Array.from(dots.children) };
  return el;
}

function buildCell(t, s) {
  const tr = TRACKS[t];
  const el = h('button', { class: 'lp-cell c-' + tr.color, 'data-track': tr.id, 'data-scene': s });
  el.addEventListener('click', () => cellClick(t, s));
  el.addEventListener('focus', () => { if (el.matches(':focus-visible') && !(sel && sel.t === t && sel.s === s)) select(t, s); });
  return el;
}

/* Sideways swipe on the phone grid switches tracks */
function addSwipe(b) {
  let g = null, eat = false;
  b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && BB.isMobile()) g = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  b.addEventListener('pointerup', e => {
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y; g = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      const n = BB.clamp(ptrack + (dx < 0 ? 1 : -1), 0, NT - 1);
      if (n !== ptrack) setPtrack(n);
      eat = true; setTimeout(() => { eat = false; }, 60);
    }
  });
  b.addEventListener('pointercancel', () => { g = null; });
  b.addEventListener('click', e => { if (eat) { eat = false; e.preventDefault(); e.stopPropagation(); } }, true);
}

/* ================= previews (drawn from the clip data, colored by currentColor) ================= */
const DRUM_ROWS = [['kick', 'tomL'], ['snare', 'clap', 'rim', 'tomH'], ['hat', 'ohat', 'shaker', 'crash']];
function drumSvg(clip) {
  const n = Math.min(clip.bars, 2) * 16;
  let grid = '', on = '', soft = '';
  DRUM_ROWS.forEach((vs, r) => {
    const y = 5 + r * 10;
    for (let i = 0; i < n; i++) {
      let v = 0; for (const id of vs) v = Math.max(v, (clip.steps[id] || [])[i] || 0);
      const d = `M${i * 10 + 5} ${y}h0`;
      if (!v) grid += d; else if (v >= 0.6) on += d; else soft += d;
    }
  });
  return `<svg viewBox="0 0 ${n * 10} 30" preserveAspectRatio="none"><path class="lp-d-grid" d="${grid}"/><path class="lp-d-soft" d="${soft}"/><path class="lp-d-on" d="${on}"/></svg>`;
}
function notesSvg(clip) {
  const len = clip.bars * 16;
  let lo = 127, hi = 0;
  for (const n of clip.notes) { lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); }
  if (hi - lo < 8) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 4); hi = Math.ceil(mid + 4); }
  const H = hi - lo + 1;
  let d = '';
  for (const n of clip.notes) {
    if (n.s >= len) continue;
    const x0 = n.s + 0.14, x1 = Math.max(x0 + 0.6, Math.min(len, n.s + n.d) - 0.14), y = hi - n.m + 0.5;
    d += `M${x0.toFixed(2)} ${y}H${x1.toFixed(2)}`;
  }
  return `<svg viewBox="0 0 ${len} ${H}" preserveAspectRatio="none"><path class="lp-n-bar" d="${d}"/></svg>`;
}
function chordNames(clip) {
  const out = []; let last = null;
  for (const sl of clip.slots) {
    if (!sl || sl.rest) continue;
    const n = BB.theory.chordName(sl.r, sl.q);
    if (n !== last) out.push(n);
    last = n;
  }
  return out.slice(0, 8);
}
function preview(trackId, clip) {
  const type = BB.TRACK[trackId].type;
  const box = h('span', { class: 'lp-prev', 'aria-hidden': 'true' });
  if (BB.clipIsEmpty(trackId, clip)) {
    box.append(h('span', 'lp-prev-empty', type === 'drums' ? 'No hits yet' : type === 'chords' ? 'No chords yet' : 'No notes yet'));
  } else if (type === 'drums') box.innerHTML = drumSvg(clip);
  else if (type === 'notes') box.innerHTML = notesSvg(clip);
  else { box.classList.add('lp-prev-chords'); chordNames(clip).forEach(n => box.append(h('span', 'lp-chn', n))); }
  return box;
}

/* ================= rendering ================= */
/* Song changed (or the screen was shown). Only rebuilds squares whose clip actually changed. */
function render() {
  if (!V.board) return;
  const p = P();
  for (let t = 0; t < NT; t++) for (let s = 0; s < NS; s++) paintCell(t, s);
  TRACKS.forEach((tr, t) => { V.heads[t].inst.textContent = instName(tr.id); });
  for (let s = 0; s < NS; s++) {
    const sc = V.scenes[s], nm = p.scenes[s].name;
    sc.name.textContent = nm;
    sc.launch.setAttribute('aria-label', `Play scene ${s + 1}: ${nm}`);
    sc.launch.dataset.tipTitle = `Play scene ${s + 1} · ${nm}`;
    sc.launch.dataset.tip = `Starts every loop in this row together (on the next bar if music is playing). Rows are the sections of your song, like Verse or Chorus. Shortcut: number key ${s + 1}.`;
  }
  refreshState();
}

function paintCell(t, s) {
  const tr = TRACKS[t], clip = P().clips[tr.id][s], el = V.cells[t][s];
  const key = (clip ? JSON.stringify(clip) : '') + '|' + sceneName(s);
  if (V.sig[t][s] === key) return;
  V.sig[t][s] = key;
  el.innerHTML = '';
  el.classList.toggle('is-empty', !clip);
  if (!clip) {
    el.append(h('span', 'lp-plus', ico(I.plus), h('span', 'lp-plus-txt', 'Add')));
    el.dataset.tipTitle = 'Add a loop';
    el.dataset.tip = `Pick a ready-made ${tr.name} loop for “${sceneName(s)}”, or start a blank one.`;
    el._label = `Empty square: add a ${tr.name} loop to scene ${s + 1}, ${sceneName(s)}`;
    return;
  }
  el.append(
    h('span', 'lp-top', h('span', 'lp-name', clip.name || tr.name), h('span', 'lp-bars', barsText(clip.bars))),
    preview(tr.id, clip),
    h('span', { class: 'lp-prog', 'aria-hidden': 'true' }));
  el.dataset.tipTitle = (clip.name || tr.name) + ' · ' + tr.name;
  el.dataset.tip = 'Press to start or stop this loop. It waits for the next bar, so it stays in time. Selected loops can be edited, copied or deleted in the toolbar.';
  el._label = `${tr.name}, scene ${s + 1} ${sceneName(s)}: ${clip.name}, ${barsText(clip.bars)}`;
}

/* Launch states, mute/solo, selection, toolbar. Cheap: safe to call on every launch/ui event. */
function refreshState() {
  if (!V.board) return;
  const p = P(), playing = TR.playing, lm = loopMode();
  const anySolo = TRACKS.some(tr => p.tracks[tr.id].solo);
  const live = new Array(NS).fill(0), queued = new Array(NS).fill(false), filled = new Array(NS).fill(0);
  TRACKS.forEach((tr, t) => {
    const mix = p.tracks[tr.id], silent = mix.mute || (anySolo && !mix.solo), q = lm ? TR.queuedFor(tr.id) : undefined;
    const hd = V.heads[t];
    hd.mute.setAttribute('aria-pressed', String(!!mix.mute));
    hd.solo.setAttribute('aria-pressed', String(!!mix.solo));
    hd.el.classList.toggle('is-silent', silent);
    let trackLive = false;
    for (let s = 0; s < NS; s++) {
      const el = V.cells[t][s], has = !!p.clips[tr.id][s];
      const on = has && (lm ? TR.isLaunched(tr.id, s) : (playing && V.lastScene[tr.id] === s));
      const isQ = has && q === s && !on, stopping = on && q === -1;
      el.classList.toggle('is-on', on);
      el.classList.toggle('is-queued', isQ);
      el.classList.toggle('is-stopping', stopping);
      el.classList.toggle('is-silent', silent);
      if (has) {
        filled[s]++;
        if (on) { live[s]++; trackLive = true; }
        if (isQ) queued[s] = true;
        const bars = el.querySelector('.lp-bars');
        if (bars) bars.textContent = isQ ? 'Next bar' : stopping ? 'Stopping' : barsText(p.clips[tr.id][s].bars);
        el.setAttribute('aria-pressed', String(on));
        el.setAttribute('aria-label', el._label + (isQ ? ', starts on the next bar' : stopping ? ', stops on the next bar' : on ? (playing ? ', playing' : ', ready to play') : '') + (silent ? ', muted' : ''));
      } else {
        el.removeAttribute('aria-pressed');
        el.setAttribute('aria-label', el._label || '');
      }
      V.scenes[s].dots[t].classList.toggle('has', has);
      V.scenes[s].dots[t].classList.toggle('on', on);
    }
    hd.stop.classList.toggle('is-idle', !(lm && (TR.launched[tr.id] || q !== undefined)));
    V.chips[t].classList.toggle('is-live', trackLive);
    V.chips[t].classList.toggle('is-silent', silent);
  });
  for (let s = 0; s < NS; s++) {
    const el = V.scenes[s].el;
    const songLive = !lm && playing && V.songScene === s;
    el.classList.toggle('is-live', songLive || (live[s] > 0 && live[s] === filled[s]));
    el.classList.toggle('is-part', !songLive && live[s] > 0 && live[s] < filled[s]);
    el.classList.toggle('is-queued', queued[s]);
    el.classList.toggle('is-current', BB.state.scene === s);
    el.classList.toggle('is-blank', filled[s] === 0);
  }
  V.board.classList.toggle('is-playing', playing);
  const empty = songIsEmpty();
  V.start.hidden = !empty;
  V.cells[0][0].classList.toggle('is-pulse', empty);
  refreshSel();
  refreshTools();
}

function refreshSel() {
  const cur = V.board.querySelector('.lp-cell.is-sel');
  const next = sel ? V.cells[sel.t][sel.s] : null;
  if (cur && cur !== next) cur.classList.remove('is-sel');
  if (next) next.classList.add('is-sel');
}

function refreshTools() {
  const T = V.T;
  const clip = sel && clipAt(sel.t, sel.s);
  V.tools.dataset.state = !sel ? 'none' : clip ? 'clip' : 'empty';
  if (!sel) return;
  const tr = TRACKS[sel.t];
  T.ctx.className = 'lp-ctx c-' + tr.color;
  T.where.textContent = `${tr.name} · ${sel.s + 1} ${sceneName(sel.s)}`;
  T.name.textContent = clip ? clip.name : 'Empty square';
  const swapLabel = clip ? 'Swap' : 'Add loop';
  const lbl = T.swap.querySelector('.btn-label');
  if (lbl.textContent !== swapLabel) {
    lbl.textContent = swapLabel; T.swap.setAttribute('aria-label', swapLabel); T.swap.__ctl.label = swapLabel;
    T.swap.querySelector('.ico').innerHTML = clip ? ICON.swap : I.plus;
  }
  T.swap.dataset.tipTitle = swapLabel;
  T.swap.dataset.tip = clip ? 'Replace this loop with a different ready-made one. Try a few until it feels right.' : `Pick a ready-made ${tr.name} loop for this square, or start a blank one.`;
  T.edit.dataset.tip = `Opens this loop in the ${editorOf(tr.id)} screen so you can change ${whatOf(tr.type)}.`;
  T.paste.classList.toggle('is-off', !clipboard);
  T.paste.setAttribute('aria-disabled', String(!clipboard));
  T.len.update(); T.lenSel.update();
}

/* ---- playhead: progress bars, beat-synced blinking, song-mode highlights ---- */
function step(e) {
  if (!V.board) return;
  if (!e) { clearProgress(); return; }
  if (!reduceMotion()) V.board.classList.toggle('tick', e.abs % 4 < 2);
  let moved = false;
  TRACKS.forEach((tr, t) => {
    const pos = e.pos[tr.id], el = pos ? V.cells[t][pos.scene] : null, prev = V.prog[tr.id];
    if (prev && prev !== el) prev.style.removeProperty('--p');
    if (el) el.style.setProperty('--p', ((pos.pos + 1) / pos.len).toFixed(4));
    V.prog[tr.id] = el;
    const sc = pos ? pos.scene : -1;
    if (V.lastScene[tr.id] !== sc) { V.lastScene[tr.id] = sc; moved = true; }
  });
  const ss = e.song ? e.song.scene : -1;
  if (ss !== V.songScene) { V.songScene = ss; moved = true; }
  if (moved && !loopMode()) refreshState();
}
function clearProgress() {
  if (!V.board) return;
  Object.values(V.prog).forEach(el => el && el.style.removeProperty('--p'));
  V.prog = {}; V.lastScene = {}; V.songScene = -1;
  V.board.classList.remove('tick');
}
/* Level meters under each track header */
function meters() {
  if (!V.board) return;
  const on = BB.state.view === 'loops' && TR.playing && BB.audio.E;
  if (!on) {
    if (V.metersOn) { V.metersOn = false; V.lv.fill(0); V.heads.forEach(hd => hd.meter.style.removeProperty('--lv')); }
    return;
  }
  V.metersOn = true;
  TRACKS.forEach((tr, t) => {
    const lv = Math.max(BB.audio.E.level(tr.id), V.lv[t] * 0.86);
    V.lv[t] = lv;
    V.heads[t].meter.style.setProperty('--lv', lv.toFixed(3));
  });
}

/* ================= actions ================= */
/* Let go of a toolbar letter after it did its job, so the arrows go back to moving around the grid. */
function release() { if (C.sel && V.root.contains(C.sel)) C.clear(); }

function select(t, s, opts = {}) {
  sel = { t, s };
  if (ptrack !== t) setPtrack(t);
  if (BB.state.scene !== s) BB.setState({ scene: s }); else { refreshSel(); refreshTools(); }
  const el = V.cells[t][s];
  if (opts.scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (opts.announce) {
    const c = clipAt(t, s);
    V.live.textContent = `${TRACKS[t].name}, scene ${s + 1} ${sceneName(s)}: ` + (c ? c.name + (TR.isLaunched(TRACKS[t].id, s) ? ', playing' : '') : 'empty');
  }
}

function setPtrack(t) {
  ptrack = BB.clamp(t, 0, NT - 1);
  V.board.dataset.ptrack = TRACKS[ptrack].id;
  V.chips.forEach((c, i) => c.setAttribute('aria-pressed', String(i === ptrack)));
  if (sel && sel.t !== ptrack && BB.isMobile()) { sel = { t: ptrack, s: sel.s }; refreshSel(); refreshTools(); }
}

function cellClick(t, s) {
  select(t, s);
  if (!clipAt(t, s)) { openLibrary(t, s); return; }
  toggleCell(t, s);
}

/* Song mode plays the arrangement, so launching loops needs Loop mode. Offer the switch. */
function needLoopMode(then) {
  UI.toast('Song mode is playing your arrangement.', { ms: 4200, action: { label: 'Switch to Loop mode', onClick: () => {
    TR.setMode('loop'); then(); if (!TR.playing) TR.play();
  } } });
}

function toggleCell(t, s) {
  const id = TRACKS[t].id;
  if (!BB.store.clip(id, s)) return;
  if (!loopMode()) { needLoopMode(() => TR.launchClip(id, s)); return; }
  TR.toggleClip(id, s);
  if (!TR.playing && TR.isLaunched(id, s)) TR.play();
}

function launchRow(s) {
  if (!TRACKS.some(tr => BB.store.clip(tr.id, s))) {
    BB.setState({ scene: s });
    UI.toast(`Scene ${s + 1} has no loops yet. Press a + in that row to add some.`);
    return;
  }
  if (!loopMode()) { needLoopMode(() => TR.launchScene(s)); return; }
  BB.setState({ scene: s });
  TR.launchScene(s);
  if (!TR.playing) TR.play();
}

function stopAll() {
  if (!TR.playing) { TR.stopAll(); return; }
  if (!loopMode()) { TR.stop(); return; }
  const anyGoing = TRACKS.some(tr => (TR.launched[tr.id] && TR.queuedFor(tr.id) !== -1) || TR.queuedFor(tr.id) >= 0);
  if (!anyGoing) { TR.stop(); return; }
  /* TR.stopAll() only stops tracks that are already playing; also cancel loops still waiting to start */
  TRACKS.forEach(tr => { const q = TR.queuedFor(tr.id); if (q >= 0 && !TR.launched[tr.id]) TR.toggleClip(tr.id, q); });
  TR.stopAll();
}

function toggleMix(id, key) {
  const v = !P().tracks[id][key], name = BB.TRACK[id].name;
  BB.store.change((v ? '' : 'Un') + (key === 'mute' ? 'mute ' : 'solo ') + name, p => { p.tracks[id][key] = v; }, { info: { track: id } });
}

function goEdit(t, s) {
  const id = TRACKS[t].id;
  if (BB.state.scene !== s) BB.setState({ scene: s });
  if (id === 'drums') BB.app.setView('beat');
  else if (id === 'chords') BB.app.setView('chords');
  else { BB.setState({ noteTrack: id }); BB.app.setView('keys'); }
}

function duplicateSel() {
  if (!sel) return;
  const { t, s } = sel, id = TRACKS[t].id, clip = clipAt(t, s);
  if (!clip) return;
  let to = -1;
  for (let k = 1; k < NS; k++) { const j = (s + k) % NS; if (!BB.store.clip(id, j)) { to = j; break; } }
  if (to < 0) { UI.toast(`Every scene in ${TRACKS[t].name} already has a loop. Delete one first.`); return; }
  BB.store.change('Duplicate loop', p => { p.clips[id][to] = BB.clone(p.clips[id][s]); }, { info: { track: id, scene: to } });
  select(t, to, { scroll: true });
  undoToast(`Copied “${clip.name}” to scene ${to + 1} · ${sceneName(to)}`);
}

function copySel() {
  if (!sel) return;
  const clip = clipAt(sel.t, sel.s);
  if (!clip) { UI.toast('This square is empty. Select a loop to copy it.'); return; }
  clipboard = { track: TRACKS[sel.t].id, clip: BB.clone(clip) };
  refreshTools();
  UI.toast(`Copied “${clip.name}”. Select a square and press Paste.`);
}

/* Move a note clip into the target track's range by whole octaves (melody → bass drops it down). */
function fitOctave(clip, trackId) {
  const range = BB.TRACK[trackId].range;
  if (!range || !clip.notes || !clip.notes.length) return clip;
  const avg = clip.notes.reduce((a, n) => a + n.m, 0) / clip.notes.length;
  const shift = Math.round(((range[0] + range[1]) / 2 - avg) / 12) * 12;
  if (Math.abs(shift) >= 12) clip.notes.forEach(n => { n.m = BB.clamp(n.m + shift, range[0], range[1]); });
  return clip;
}

function pasteSel() {
  if (!sel) return;
  if (!clipboard) { UI.toast('Nothing copied yet. Select a loop and press Copy first.'); return; }
  const { t, s } = sel, id = TRACKS[t].id, from = BB.TRACK[clipboard.track];
  if (from.type !== TRACKS[t].type) {
    const fits = TRACKS.filter(x => x.type === from.type).map(x => x.name).join(' or ');
    UI.toast(`A ${from.name} loop can’t go in the ${TRACKS[t].name} column. Paste it into ${fits}.`, { ms: 3600 });
    return;
  }
  const had = clipAt(t, s);
  const clip = clipboard.track === id ? BB.clone(clipboard.clip) : fitOctave(BB.clone(clipboard.clip), id);
  BB.store.change('Paste loop', p => { p.clips[id][s] = clip; }, { info: { track: id, scene: s } });
  undoToast(had ? `Replaced “${had.name}” with “${clip.name}”` : `Pasted “${clip.name}”`);
}

function deleteSel() {
  if (!sel) return;
  const { t, s } = sel, id = TRACKS[t].id, clip = clipAt(t, s);
  if (!clip) return;
  if (TR.queuedFor(id) === s) TR.toggleClip(id, s);   // cancel a pending start
  if (TR.isLaunched(id, s)) TR.stopClip(id);
  BB.store.change('Delete loop', p => { p.clips[id][s] = null; }, { info: { track: id, scene: s } });
  undoToast(`Deleted “${clip.name}”`);
}

function setLength(bars) {
  if (!sel || !BB.BAR_CHOICES.includes(bars)) return;
  const { t, s } = sel, id = TRACKS[t].id, clip = clipAt(t, s);
  if (!clip || clip.bars === bars) return;
  const old = clip.bars;
  BB.store.change('Loop length', p => { BB.resizeClip(id, p.clips[id][s], bars); }, { info: { track: id, scene: s } });
  if (bars < old) undoToast(`Now ${barsText(bars)} long. Undo brings back the rest.`);
}

function loadDemo() {
  const before = JSON.stringify(P());
  TR.stop(); TR.launched = {}; TR.queued = {};
  BB.store.load(BB.demoProject(), 'demo');
  BB.store.undoStack.push({ label: 'Load demo', data: before });
  BB.emit('change', { label: 'demo', all: true });
  UI.toast('Demo song loaded. Press Play!');
}

/* ---- sheets ---- */
function libItem(trackId, scene, it, cur, onPick) {
  let clip = null;
  try { clip = BB.library.build(trackId, it.id, scene); } catch (e) { clip = null; }
  const isCur = cur && cur.name === it.name;
  return h('button', { class: 'list-item lp-li c-' + BB.TRACK[trackId].color + (isCur ? ' is-cur' : ''), onclick: () => onPick(it.id) },
    clip ? h('span', 'lp-li-prev', preview(trackId, clip)) : null,
    h('span', 'li-text', h('span', 'li-title', it.name), h('span', 'li-sub', it.desc)),
    isCur ? h('span', 'pill', 'Now') : h('span', { class: 'lp-li-go', 'aria-hidden': 'true', html: I.plus }));
}

function openLibrary(t, s) {
  const tr = TRACKS[t], id = tr.id, cur = clipAt(t, s);
  const groups = [];
  for (const it of BB.library.itemsFor(id)) {
    let g = groups.find(x => x.name === it.group);
    if (!g) groups.push(g = { name: it.group, items: [] });
    g.items.push(it);
  }
  let sheet = null;
  const pick = itemId => {
    sheet.close();
    const clip = BB.library.apply(id, s, itemId);
    select(t, s);
    const launch = TR.playing && loopMode();
    if (launch) TR.launchClip(id, s);
    const msg = `Added “${clip.name}”.` + (launch ? ' It starts on the next bar.' : ' Press it to hear it.');
    if (cur) undoToast(msg); else UI.toast(msg);
  };
  const intro = tr.type === 'drums' ? 'Pick a starter beat. You can change every hit later in the Beat screen.'
    : tr.type === 'chords' ? 'Pick a chord progression. These are in your song’s key, so they always sound right.'
      : 'Pick a starter part. It follows the chords in this scene, so it always fits.';
  const body = h('div', 'lp-lib',
    h('p', 'hint', intro),
    groups.map(g => h('div', 'sheet-section', h('h4', null, g.name), h('div', 'list', g.items.map(it => libItem(id, s, it, cur, pick))))),
    h('div', 'sheet-section', h('h4', null, 'Make your own'),
      h('div', 'list', h('button', { class: 'list-item lp-li lp-li-blank c-' + tr.color, onclick: () => { sheet.close(); makeBlank(t, s); } },
        h('span', { class: 'lp-li-prev lp-li-plus', 'aria-hidden': 'true', html: I.plus }),
        h('span', 'li-text', h('span', 'li-title', 'Empty pattern (make your own)'),
          h('span', 'li-sub', `A blank ${tr.name} loop. Opens the ${editorOf(id)} screen so you can make it from scratch.`))))));
  sheet = UI.sheet({ title: (cur ? 'Swap ' : 'Add to ') + `${tr.name} · ${sceneName(s)}`, body });
  sheet.el.classList.add('lp-sheet');
  sheet.el.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = BB.$$('.list-item', sheet.el), i = items.indexOf(document.activeElement);
    const n = items[BB.clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1)];
    if (n) { e.preventDefault(); n.focus(); }
  });
}

function makeBlank(t, s) {
  const id = TRACKS[t].id, opts = { name: id === 'drums' ? 'My beat' : 'My ' + TRACKS[t].name.toLowerCase() };
  if (id === 'drums') { const other = P().clips.drums.find(c => c); opts.kit = other ? other.kit : 'lofi'; }
  BB.store.change('New loop', p => { p.clips[id][s] = BB.newClip(id, opts); }, { info: { track: id, scene: s } });
  select(t, s);
  goEdit(t, s);
}

function openRename(s) {
  const cur = sceneName(s);
  const input = h('input', { class: 'text-input', value: cur, maxlength: 24, 'aria-label': 'Scene name', autocomplete: 'off' });
  const commit = name => {
    name = String(name || '').trim().slice(0, 24) || 'Scene ' + (s + 1);
    if (name !== sceneName(s)) BB.store.change('Rename scene', p => { p.scenes[s].name = name; }, { info: { scene: s } });
  };
  let sheet = null;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(input.value); sheet.close(); } });
  const chips = h('div', 'lp-chips', QUICK_NAMES.map(([n, tip]) => h('button', { class: 'lp-namechip' + (n === cur ? ' on' : ''), 'data-tip-title': n, 'data-tip': tip,
    onclick: () => { commit(n); sheet.close(); } }, n)));
  const body = h('div', 'lp-rename-body',
    h('div', 'sheet-section', h('h4', null, 'Name'), input),
    h('div', 'sheet-section', h('h4', null, 'Quick names'), chips),
    h('p', 'hint', 'Scene names also show up in the Song screen, where you put the sections in order.'));
  sheet = UI.sheet({ title: `Name scene ${s + 1}`, body, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => commit(input.value) }] });
  setTimeout(() => { if (input.isConnected) input.select(); }, 40);
}

/* ================= keyboard ================= */
function moveCursor(dx, dy) {
  if (!sel) { select(BB.isMobile() ? ptrack : 0, BB.state.scene, { scroll: true, announce: true }); return; }
  const t = BB.clamp(sel.t + dx, 0, NT - 1), s = BB.clamp(sel.s + dy, 0, NS - 1);
  const a = document.activeElement, inGrid = a && a.classList && a.classList.contains('lp-cell');
  if (!inGrid && a && a !== document.body && V.root.contains(a)) a.blur();
  select(t, s, { scroll: true, announce: true });
  if (inGrid) V.cells[t][s].focus({ preventScroll: true });
}

function keydown(e) {
  if (!V.root || V.root.hidden) return false;
  const k = e.key;
  if (e.ctrlKey || e.metaKey) {
    if (e.shiftKey || e.altKey) return false;
    const kk = k.toLowerCase();
    if (kk === 'c' || kk === 'x') {
      if (!sel || !clipAt(sel.t, sel.s)) return false;
      if (String(window.getSelection ? window.getSelection() : '')) return false; // let real text copy work
      copySel();
      if (kk === 'x') deleteSel();
      return true;
    }
    if (kk === 'v') { if (!sel) return false; pasteSel(); return true; }
    return false;
  }
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
    if (C.sel) return false;
    moveCursor(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
    return true;
  }
  if (k === 'Enter') {
    if (C.sel || e.shiftKey) return false;
    const tg = e.target;
    if (tg && tg !== document.body && tg.closest && tg.closest('button, a, input, select, textarea, [tabindex]') && !tg.closest('.lp-cell')) return false;
    if (!sel) { select(BB.isMobile() ? ptrack : 0, BB.state.scene, { scroll: true, announce: true }); return true; }
    if (clipAt(sel.t, sel.s)) toggleCell(sel.t, sel.s); else openLibrary(sel.t, sel.s);
    return true;
  }
  if (k === 'Delete' || k === 'Backspace') {
    if (!sel || !clipAt(sel.t, sel.s)) return false;
    deleteSel(); return true;
  }
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m && !e.shiftKey) { launchRow(+m[1] - 1); return true; }
  return false;
}

/* ================= tutorial ================= */
const inView = sel => BB.$$('.lp-view ' + sel).filter(el => el.offsetParent !== null);
const tutorial = [
  { view: 'loops', target: () => (BB.isMobile() ? V.panel : V.board), title: 'Loops and scenes',
    get text() {
      return 'This grid holds the building blocks of your song. Each square is a <b>loop</b>: a short pattern that repeats. ' +
        (BB.isMobile() ? 'The strip on top picks the instrument (a <b>track</b>), ' : 'Each column is an instrument (a <b>track</b>), ') +
        'and each row is a <b>scene</b>: a section of your song, like Verse or Chorus.';
    } },
  { view: 'loops', target: () => inView('.lp-cell:not(.is-empty)')[0] || BB.$('.lp-view .lp-board'), title: 'Tap to start and stop',
    text: 'Press a loop to start it, and press it again to stop. While music plays, changes wait for the next bar so everything stays in time. A <b>blinking</b> loop is waiting for its turn. Each track plays one loop at a time.' },
  { view: 'loops', target: () => inView(BB.isMobile() ? '.lp-launch' : '.lp-scene')[0], title: 'Launch a whole row',
    get text() {
      return 'The <b>▶</b> button at the start of a row starts every loop in that scene at once, so a whole section changes together. ' +
        (BB.isMobile() ? 'To rename a scene, select a loop in its row and press the pencil.' : 'Number keys <b>1–8</b> do the same. The pencil next to it renames the scene.');
    } },
  { view: 'loops', target: () => inView('.lp-cell.is-empty')[0] || BB.$('.lp-view .lp-board'), title: 'Add starter loops',
    text: 'Press a <b>+</b> square to pick a ready-made loop, or start a blank one. Bass, melodies and keys follow the chords in their row, so they always fit together.' },
  /* On phones the tutorial card sits where the floating toolbar is, so point at the selected loop instead */
  { view: 'loops', target: () => (BB.isMobile() ? (sel && V.cells[sel.t][sel.s]) : V.tools), title: 'Edit, copy and more',
    before() { if (!sel) { const t = BB.isMobile() ? ptrack : 0; const s = V.cells[t].findIndex((c, i) => clipAt(t, i)); select(t, s >= 0 ? s : BB.state.scene); } },
    get text() {
      return (BB.isMobile() ? 'Tapping a loop also selects it and opens a toolbar at the bottom of the screen. ' : 'The selected loop’s toolbar. ') +
        '<b>Edit</b> opens the loop in its editor, <b>Swap</b> tries another starter loop, and you can duplicate, copy, paste, change its length or delete it. Undo is always there if you change your mind.' +
        (document.body.classList.contains('show-keys') ? ' The little letters are keyboard shortcuts.' : '');
    } },
  { view: 'loops', target: () => inView('.lp-colhead')[0], title: 'Mute, solo and stop',
    get text() {
      return (BB.isMobile() ? '<b>Mute</b> silences a track, <b>Solo</b> plays only that track, and <b>Stop</b> ends its loop at the end of the bar. Swipe sideways on the grid to switch tracks.'
        : '<b>M</b> mutes a track, <b>S</b> (solo) plays only that track, and <b>■</b> stops its loop at the end of the bar.') + ' Great for building up and breaking down a song live.';
    } },
  { view: 'loops', target: () => V.board, title: 'Try this',
    get text() {
      return 'Launch the first scene, then start loops from the next row one at a time to build up. Mute the drums for a breakdown, then bring them back for a big return.' +
        (BB.isMobile() ? '' : ' Keyboard: arrows move around the grid, <b>Enter</b> starts or stops, <b>Space</b> plays and stops everything.');
    } },
];

BB.views.register({
  id: 'loops', title: 'Loops', letterMode: 'plain',
  mount, render, step, keydown,
  show() { clearProgress(); render(); },
  hide() { V.lv.fill(0); V.metersOn = false; V.heads.forEach(hd => hd.meter.style.removeProperty('--lv')); },
  tutorial,
});
})();

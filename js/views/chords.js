/* Beat Board · Chords screen
   Chord pads that are always in key (with "good next" hints), a progression lane of boxes that edits
   the scene's chord clip, a rhythm section (how often each chord strikes), and a scale-locked melody strip.
   Layout: the screen itself holds the sound (instrument, flavor, volume and effects) and two cards. Each card
   opens a full-screen workspace: the progression editor (lane + pads, and the rhythm) and a play area
   (pads + melody strip). The one set of pad elements moves into whichever workspace is open.
   Keyboard: 1–8 (number row or number pad) hold pads, Q–P play the melody strip, ⇧ + letter picks a
   control, ← → move the selected box, Enter writes the last chord, Delete = "same as before", Esc stops writing. */
(function () {
'use strict';
const BB = window.BB, { h } = BB, UI = BB.ui, TR = BB.transport, T = BB.theory, I = UI.ICONS;

/* ================= constants ================= */
const MEL_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const STORE_MEL = 'beatboard.chords.mel';
const FLAVORS = [
  { id: 'triad', label: 'Simple', tip: 'Plain three-note chords. Clean, strong and easy to sing over.' },
  { id: 'seventh', label: '7ths', tip: 'Adds a fourth note for a smoother, jazzy, R&B feel.' },
  { id: 'sus', label: 'Sus', tip: 'Swaps the middle note for an open, floating sound that feels unfinished in a nice way.' },
  { id: 'add9', label: 'Add9', tip: 'Adds a high, sparkly note on top. Dreamy and modern.' },
];
const BOX_FLAVORS = [
  { id: 'triad', label: 'Simple', tip: 'Make just this chord a plain three-note chord.' },
  { id: 'seventh', label: '7th', tip: 'Give just this chord a smooth, jazzy 7th.' },
  { id: 'sus', label: 'Sus', tip: 'Make just this chord open and floating (suspended).' },
  { id: 'add9', label: 'Add9', tip: 'Add a sparkly high note to just this chord.' },
];
const GRID_OPTS = [
  { id: 4, label: 'Every bar', tip: 'One box per bar: a chord can change at the start of each bar. The simplest choice.' },
  { id: 2, label: 'Half bar', tip: 'Two boxes per bar: chords can change on beats 1 and 3.' },
  { id: 1, label: 'Every beat', tip: 'Four boxes per bar: a chord can change on any beat.' },
];
const PRESET_SMALL = { hold: 'rings out', x1: 'once', x2: 'twice', x4: 'every beat', x8: 'eighths', x16: 'sixteenths', off: 'off-beats', push: 'funky', charleston: 'Charleston' };
const BASS_FOLLOW = [{ id: 'long', label: 'Long notes' }, { id: 'bounce', label: 'Bounce' }, { id: 'walk', label: 'Walking' }];
const MEL_FOLLOW = [{ id: 'hook', label: 'Hook' }, { id: 'lazy', label: 'Lazy' }, { id: 'steady', label: 'Steady' }];
/* "Good next" pads for each pad (indexes 0–6 are scale degrees, 7 is the borrowed pad). */
const NEXT = {
  major:      [[3, 4, 5], [4, 3], [5, 3], [0, 4], [0, 5], [3, 1], [0, 2], [0, 4]],
  mixolydian: [[6, 3, 4], [4, 3], [5, 3], [0, 6], [3, 0], [3, 1], [3, 0], [0, 6]],
  minor:      [[5, 3, 6], [7, 4], [6, 3], [0, 7], [0, 5], [6, 3], [0, 2], [0, 5]],
  dorian:     [[3, 6, 1], [2, 0], [3, 6], [0, 6], [0, 3], [7, 0], [0, 3], [0, 3]],
  harmonic:   [[3, 5, 4], [4, 0], [5, 3], [4, 0], [0, 5], [4, 7], [0, 5], [5, 0]],
};
/* What each chord does, in plain words (keyed by its triad numeral without ♭/♯) */
const ROLE = {
  I: 'Home base. Songs often start and end here, and it always feels settled.',
  i: 'Home base. Minor songs often start and end here. Dark, but settled.',
  ii: 'Soft and a little moody. It loves to lead into the V chord.',
  'ii°': 'Tense and shadowy. It leads well into V.',
  iii: 'Gentle and in-between. A nice bridge to vi or IV.',
  'iii°': 'Tense and unstable. Use it briefly.',
  III: 'The bright side of a minor key. It feels hopeful.',
  'III+': 'Strange and dreamy. It adds a mysterious touch.',
  IV: 'Warm and open. It lifts the music away from home.',
  iv: 'Sad and heavy. It pulls back toward home.',
  V: 'Strong tension that wants to go home. Great at the end of a line.',
  v: 'A soft, gentle step away from home.',
  vi: 'The sad cousin of I. Emotional, and in tons of pop songs.',
  'vi°': 'Tense and unstable. Use it briefly.',
  VI: 'Big and dramatic. Perfect for emotional, epic moments.',
  'vii°': 'Tense and unstable. Use it briefly, then go home.',
  VII: 'Bold and rising. It leads nicely back home.',
};
const BORROWED = {
  iv: 'Borrowed from the minor key for a bittersweet twist. Try it just before going home to I.',
  V: 'Borrowed from harmonic minor. A strong, dramatic pull back home to i.',
  bVII: 'Borrowed from the natural minor. A bold, rock-style chord that leads home.',
};
/* chord quality -> its basic triad, and -> which flavor it is */
const BASE_Q = { maj: 'maj', maj7: 'maj', dom7: 'maj', add9: 'maj', maj6: 'maj', min: 'min', m7: 'min', madd9: 'min', m6: 'min', dim: 'dim', m7b5: 'dim', aug: 'aug' };
const FLAVOR_OF = { maj: 'triad', min: 'triad', dim: 'triad', aug: 'triad', maj7: 'seventh', dom7: 'seventh', m7: 'seventh', m7b5: 'seventh', sus2: 'sus', sus4: 'sus', add9: 'add9', madd9: 'add9' };

/* ================= UI state (the song itself is always read fresh from BB.store.p) ================= */
const S = {
  pads: [],          // [{root, q, degree, role, home, borrowed}] ×8
  lastPad: null,     // pad index of the last chord played (for "good next")
  lastPlayed: null,  // {root, q} last chord played, for Enter
  held: null,        // {source, pad} the pad this view is holding
  lit: null,         // 'root:q' of the live chord
  cur: null,         // 'root:q' of the chord under the playhead
  sel: null,         // first slot (beat) of the selected box, or null
  grid: 4,           // preferred box size in beats (4 bar, 2 half bar, 1 beat)
  pendingBars: 4,    // length to use when the first chord creates the clip
  starter: '',       // last applied starter id (so ← → on the select steps through them)
  fresh: null,       // slot just written (flash it)
  nowBox: -1, nowStep: -1,
  clipboard: null,   // copied box value
  bassFollow: 'long', melFollow: 'hook',
  paint: null,       // rhythm-strip drag: {on, group}
  melMode: BB.storage.get(STORE_MEL, 'penta') === 'scale' ? 'scale' : 'penta',
  melNotes: [], melSig: '', keySig: '',
  keyMidi: {},       // KeyQ… -> midi held from the keyboard
  tour: {},          // values remembered at the start of tutorial steps
};
const E = { padEls: [], boxEls: [], boxBySlot: {}, melEls: [], cells: [], presetBtns: [], miniPads: [], miniSegs: [] };
const edOpen = () => !!(E.wsEd && E.wsEd.isOpen());

/* ================= helpers ================= */
const curClip = () => BB.store.clip('chords', BB.state.scene);
const slotCount = () => { const c = curClip(); return c ? c.slots.length : S.pendingBars * 4; };
const boxSize = () => Math.min(S.grid, BB.chordGridNeeded(curClip()));
const qInfo = q => T.QUALITIES[q] || T.QUALITIES.maj;
const fullName = (r, q) => T.pcName(r) + ' ' + qInfo(q).name;
const ckey = (r, q) => r + ':' + q;
const nextFor = i => ((NEXT[BB.store.p.mode] || NEXT.major)[i]) || [];
const numeralOf = (r, q) => T.numeral(BB.store.p.key, r, q);
const orList = arr => (arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' or ' + arr[arr.length - 1]);
const info = scene => ({ info: { track: 'chords', scene } });
function boxLabel(slot, g) {
  const bar = Math.floor(slot / 4) + 1, b = slot % 4 + 1;
  return g >= 4 ? 'Bar ' + bar : g === 2 ? 'Bar ' + bar + ', beats ' + b + '–' + (b + 1) : 'Bar ' + bar + ', beat ' + b;
}
/* Root big, the quality suffix smaller: "C" + "maj7" */
function chordLabel(el, r, q) {
  el.textContent = '';
  el.append(T.pcName(r));
  const sfx = qInfo(q).sfx; if (sfx) el.append(h('small', null, sfx));
}
/* What a box holds: a chord or rest that starts there, one carried over from the left, or nothing yet */
function boxInfo(c, s) {
  if (!c) return { kind: 'empty' };
  const v = c.slots[s];
  if (v && v.rest) return { kind: 'rest', start: true };
  if (v) return { kind: 'chord', start: true, r: v.r, q: v.q };
  const ch = BB.chordAt(c, s * 4);
  if (ch) return { kind: 'chord', start: false, r: ch.root, q: ch.q, from: ch.slot };
  let i = s - 1; while (i >= 0 && !c.slots[i]) i--;
  return i >= 0 ? { kind: 'rest', start: false } : { kind: 'empty' };
}
/* Change a chord's flavor but keep its root (same rules as BB.theory.diatonic) */
function baseOf(r, q) {
  if (BASE_Q[q]) return BASE_Q[q];
  const p = BB.store.p, d = T.degreeOf(r, p.key, p.mode);
  return d >= 0 ? T.diatonic(p.key, p.mode, d, 'triad').q : 'maj';
}
function flavorQ(r, base, fl) {
  const p = BB.store.p, d = T.degreeOf(r, p.key, p.mode);
  if (d >= 0 && T.diatonic(p.key, p.mode, d, 'triad').q === base) return T.diatonic(p.key, p.mode, d, fl).q;
  if (fl === 'seventh') return { maj: 'dom7', min: 'm7', dim: 'm7b5' }[base] || base;
  if (fl === 'sus') return base === 'maj' || base === 'min' ? 'sus2' : base;
  if (fl === 'add9') return { maj: 'add9', min: 'madd9' }[base] || base;
  return base;
}

/* The 8 pads: the 7 chords of the key plus one borrowed chord */
function buildPadChords() {
  const p = BB.store.p, fl = BB.state.chordFlavor || 'triad';
  const out = BB.range(7).map(d => {
    const c = T.diatonic(p.key, p.mode, d, fl), tri = T.diatonic(p.key, p.mode, d, 'triad');
    const role = ROLE[tri.numeral.replace(/[♭♯]/g, '')] || 'A chord from your key.';
    return { root: c.root, q: c.q, degree: d, role, home: d === 0, borrowed: false };
  });
  let b;
  if (!T.isMinorish(p.mode)) b = { root: (p.key + 5) % 12, base: 'min', role: BORROWED.iv };
  else if (T.diatonic(p.key, p.mode, 4, 'triad').q === 'maj') b = { root: (p.key + 10) % 12, base: 'maj', role: BORROWED.bVII, sus: 'sus2' };
  else b = { root: (p.key + 7) % 12, base: 'maj', role: BORROWED.V, sus: 'sus4' };
  const q = b.base === 'min'
    ? { triad: 'min', seventh: 'm7', sus: 'min', add9: 'madd9' }[fl]
    : { triad: 'maj', seventh: 'dom7', sus: b.sus, add9: 'add9' }[fl];
  out.push({ root: b.root, q: q || b.base, degree: 7, role: b.role, home: false, borrowed: true });
  return out;
}
const padKey = i => (S.pads[i] ? ckey(S.pads[i].root, S.pads[i].q) : '');
/* The pad that best matches a chord: same chord, else same root and major/minor family, else same root */
function matchPad(root, q) {
  const minorish = T.MINORISH_Q.has(q);
  let i = S.pads.findIndex(c => c.root === root && c.q === q);
  if (i < 0) i = S.pads.findIndex(c => c.root === root && T.MINORISH_Q.has(c.q) === minorish);
  if (i < 0) i = S.pads.findIndex(c => c.root === root);
  return i;
}
/* Pads used by the "try this" idea and the hands-on tour: vi–IV–I–V (major) or i–VI–III–VII (minor) */
const tryPads = () => (T.isMinorish(BB.store.p.mode) ? [0, 5, 2, 6] : [5, 3, 0, 4]);

/* ================= playing pads ================= */
function press(source, i) {
  const c = S.pads[i]; if (!c) return;
  S.held = { source, pad: i };
  S.lastPad = i; S.lastPlayed = { root: c.root, q: c.q };
  TR.chordOn(c.root, c.q); // plays in the scene's rhythm while the music runs (TR.liveRhythm)
  paintNext();
  if (S.sel != null && !(TR.rec && TR.playing)) placeChord(c.root, c.q, false);
}
function release(source) {
  if (!S.held || S.held.source !== source) return;
  S.held = null;
  TR.chordOff();
}
function hear(slot) {
  const b = boxInfo(curClip(), slot);
  if (b.kind === 'chord') BB.preview.chord(b.r, b.q);
}

/* ================= editing the progression ================= */
/* In loop mode, make sure the scene's chords are launched so what you write is what you hear. */
function heard(track, scene) {
  if (TR.mode === 'loop' && !TR.isLaunched(track, scene) && TR.queuedFor(track) !== scene) TR.launchClip(track, scene);
}
/* Write one box (the selected one). value: {r,q} | {rest:true} | null (same as before). One undo step. */
function writeBox(value, label) {
  const scene = BB.state.scene, slot = S.sel, g = boxSize(), had = !!curClip();
  if (slot == null || (!had && value === null)) return false;
  const rhythm = BB.clone(TR.liveRhythm());
  BB.store.change(label, () => {
    const c = BB.store.ensureClip('chords', scene, { bars: S.pendingBars, rhythm });
    if (slot < c.slots.length) BB.setChordCell(c, slot, g, value);
  }, info(scene));
  if (!had) heard('chords', scene);
  S.starter = '';
  return true;
}
function placeChord(root, q, audition) {
  const slot = S.sel;
  if (!writeBox({ r: root, q }, 'Write chord')) return;
  if (audition) BB.preview.chord(root, q);
  S.fresh = slot; flashFresh();
  advance();
}
function advance() {
  const next = S.sel + boxSize();
  if (next >= slotCount()) { setSel(null); UI.toast('That was the last box. Press Play to hear your progression!', { replace: 'cp-hint' }); }
  else setSel(next);
}
function sameAsBefore() {
  if (S.sel == null) return;
  if (S.sel === 0) { UI.toast('The first box has nothing before it. Pick a chord or a rest instead.', { replace: 'cp-hint' }); return; }
  const b = boxInfo(curClip(), S.sel);
  if (!b.start) { UI.toast('This box already continues the chord before it.', { replace: 'cp-hint' }); return; }
  if (writeBox(null, 'Same as before')) { S.fresh = S.sel; flashFresh(); hear(S.sel); }
}
function restBox() {
  if (S.sel == null) return;
  if (writeBox({ rest: true }, 'Add rest')) advance();
}
function copyBox() {
  if (S.sel == null) return;
  const b = boxInfo(curClip(), S.sel);
  if (b.kind === 'empty') { UI.toast('This box is empty, so there is nothing to copy.', { replace: 'cp-hint' }); return; }
  S.clipboard = b.kind === 'rest' ? { rest: true } : { r: b.r, q: b.q };
  UI.toast('Copied ' + (b.kind === 'rest' ? 'a rest' : T.chordName(b.r, b.q)) + '. Pick another box and press Paste.', { replace: 'cp-hint' });
  paintToolbar();
}
function pasteBox() {
  if (S.sel == null) return;
  if (!S.clipboard) { UI.toast('Copy a box first, then paste it here.', { replace: 'cp-hint' }); return; }
  const v = BB.clone(S.clipboard), slot = S.sel;
  if (!writeBox(v, 'Paste chord')) return;
  if (!v.rest) BB.preview.chord(v.r, v.q);
  S.fresh = slot; flashFresh();
  advance();
}
function boxFlavor(fl) {
  const c = curClip(), scene = BB.state.scene;
  if (S.sel == null || !c) return;
  const ch = BB.chordAt(c, S.sel * 4);
  if (!ch) { UI.toast('Pick a box with a chord in it first.', { replace: 'cp-hint' }); return; }
  const q = flavorQ(ch.root, baseOf(ch.root, ch.q), fl);
  if (q === ch.q) return;
  BB.store.change('Chord flavor', () => { const cc = BB.store.clip('chords', scene); if (cc) cc.slots[ch.slot] = { r: ch.root, q }; }, info(scene));
  BB.preview.chord(ch.root, q);
}
function clearClip() {
  const c = curClip(), scene = BB.state.scene;
  if (!c || BB.clipIsEmpty('chords', c)) { UI.toast('There are no chords to clear in this scene yet.', { replace: 'cp-hint' }); return; }
  BB.store.change('Clear chords', () => { const cc = BB.store.clip('chords', scene); if (cc) cc.slots = cc.slots.map(() => null); }, info(scene));
  S.starter = ''; setSel(null);
  undoToast('Chords cleared.');
}
function undoToast(text) {
  UI.toast(text, { replace: 'cp-undo', ms: 4000, action: { label: 'Undo', onClick: () => { const l = BB.store.undo(); if (l) UI.toast('Undid: ' + l); } } });
}
function setBars(bars) {
  const c = curClip(), scene = BB.state.scene;
  if (!c) { S.pendingBars = bars; buildLane(); return; }
  if (c.bars === bars) return;
  BB.store.change('Chord loop length', () => { const cc = BB.store.clip('chords', scene); if (cc) BB.resizeClip('chords', cc, bars); }, info(scene));
}
function doubleIt() {
  const c = curClip(), scene = BB.state.scene;
  if (!c || BB.clipIsEmpty('chords', c)) { UI.toast('Write a few chords first, then double them.', { replace: 'cp-hint' }); return; }
  if (c.bars >= 8) { UI.toast('This progression is already 8 bars, the longest a loop can be.', { replace: 'cp-hint' }); return; }
  const bars = c.bars * 2;
  BB.store.change('Double progression', () => { const cc = BB.store.clip('chords', scene); if (cc) BB.resizeClip('chords', cc, bars); }, info(scene));
  undoToast('Doubled to ' + bars + ' bars. Try changing a chord or two in the second half.');
}
function transpose(dir) {
  const c = curClip(), scene = BB.state.scene, p = BB.store.p;
  if (!c || BB.clipIsEmpty('chords', c)) { UI.toast('There are no chords to move yet.', { replace: 'cp-hint' }); return; }
  BB.store.change(dir > 0 ? 'Move chords up' : 'Move chords down', () => {
    const cc = BB.store.clip('chords', scene); if (!cc) return;
    cc.slots = cc.slots.map(s => {
      if (!s || s.rest) return s;
      const d = T.nearestDegree(s.r, p.key, p.mode), fl = FLAVOR_OF[s.q] || 'triad';
      const n = T.diatonic(p.key, p.mode, (d + dir + 7) % 7, fl);
      return { r: n.root, q: n.q };
    });
  }, info(scene));
  const first = BB.store.clip('chords', scene).slots.find(s => s && !s.rest);
  if (first) BB.preview.chord(first.r, first.q);
  UI.toast('Moved every chord one step ' + (dir > 0 ? 'up' : 'down') + ' the scale.', { replace: 'cp-hint' });
}
function starterOptions() {
  const p = BB.store.p, progs = BB.library.progressions();
  return [{ id: '', label: 'Starters…' }].concat(BB.library.itemsFor('chords').map(it => {
    const pr = progs.find(x => x.id === it.id);
    const nums = pr ? pr.degrees.map(d => T.diatonic(p.key, p.mode, d, 'triad').numeral).join('–') : '';
    return { id: it.id, label: it.name + (nums ? ' (' + nums + ')' : '') };
  }));
}
function applyStarter(id) {
  if (!id) { S.starter = ''; E.starter.update(); return; }
  const scene = BB.state.scene;
  const clip = BB.library.apply('chords', scene, id, { rhythm: BB.clone(TR.liveRhythm()) });
  S.starter = id; setSel(null); E.starter.update();
  heard('chords', scene);
  const it = starterOptions().find(o => o.id === id);
  UI.toast('Added ' + (it ? it.label : clip.name) + '. Press Play to hear it.', { replace: 'cp-starter' });
}
/* Add a bass line or melody that follows this scene's chords */
function addFollow(track) {
  const c = curClip(), scene = BB.state.scene;
  if (!c || BB.clipIsEmpty('chords', c)) { UI.toast('Write some chords first, then add a part that follows them.', { replace: 'cp-hint' }); return; }
  const list = track === 'bass' ? BASS_FOLLOW : MEL_FOLLOW, id = track === 'bass' ? S.bassFollow : S.melFollow;
  const it = list.find(x => x.id === id) || list[0];
  BB.library.apply(track, scene, it.id, { bars: c.bars });
  heard(track, scene);
  undoToast('Added a “' + it.label + '” ' + (track === 'bass' ? 'bass line' : 'melody') + ' that follows your chords.');
}

/* ================= rhythm ================= */
/* Edit the rhythm of the scene's chord clip, or the pads' rhythm if there's no clip yet */
function setRhythm(label, mutate, group) {
  const scene = BB.state.scene, c = curClip();
  if (c) {
    BB.store.change(label, () => { const cc = BB.store.clip('chords', scene); if (!cc) return; const r = BB.clone(BB.chordRhythm(cc)); mutate(r); cc.rhythm = r; }, Object.assign({ group }, info(scene)));
  } else {
    const r = BB.clone(TR.liveRhythm()); mutate(r); BB.setState({ chordRhythm: r });
  }
}
function pickPreset(id) {
  const pr = BB.CHORD_RHYTHMS.find(x => x.id === id); if (!pr) return;
  setRhythm('Chord rhythm', r => { r.hits = pr.hits.slice(); });
  paintRhythm();
}
const hitVal = i => (i % 4 === 0 ? 1 : 0.8);
function paintRhythm() {
  const r = TR.liveRhythm(), pid = BB.rhythmPresetId(r), n = BB.rhythmCount(r), c = curClip();
  E.presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(BB.CHORD_RHYTHMS[i].id === pid)));
  E.rCustom.hidden = pid !== 'custom';
  E.cells.forEach((el, i) => { const on = r.hits[i] > 0; el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); });
  E.rCount.textContent = n === 0 ? 'Hold: each chord plays once when it starts' : n + (n === 1 ? ' strike' : ' strikes') + ' per bar';
  E.rNote.textContent = c ? 'Rhythms play in time while the music runs. Every new chord also strikes when it starts.'
    : 'No chords in this scene yet: this sets how the pads play while the music runs, and is saved with your first chord.';
  E.feel.update(); E.len.update();
  rhythmSummary();
}

/* ================= painting ================= */
function paintPads() {
  S.pads = buildPadChords();
  S.pads.forEach((c, i) => {
    const el = E.padEls[i], num = numeralOf(c.root, c.q);
    chordLabel(el.querySelector('.cp-name'), c.root, c.q);
    el.querySelector('.cp-num').textContent = num;
    el.querySelector('.cp-tag').textContent = c.home ? 'Home' : c.borrowed ? 'Borrowed' : '';
    el.classList.toggle('home', c.home);
    el.classList.toggle('borrowed', c.borrowed);
    const nx = nextFor(i).map(j => T.chordName(S.pads[j].root, S.pads[j].q));
    el.setAttribute('aria-label', 'Pad ' + (i + 1) + ': ' + fullName(c.root, c.q) + ', the ' + num + ' chord' + (c.borrowed ? ' (borrowed)' : ''));
    el.setAttribute('data-tip-title', fullName(c.root, c.q) + ' · ' + num + (c.borrowed ? ' · Borrowed' : ''));
    el.setAttribute('data-tip', c.role + ' Hold to play it (key ' + (i + 1) + ' on the number row or number pad). Good next: ' + orList(nx) + '.');
    const mp = E.miniPads[i]; chordLabel(mp, c.root, c.q); mp.classList.toggle('home', c.home); mp.classList.toggle('borrowed', c.borrowed);
  });
  paintNext(); paintLit(); paintCur();
}
function paintNext() {
  const nx = S.lastPad == null ? [] : nextFor(S.lastPad);
  E.padEls.forEach((el, i) => el.classList.toggle('next', nx.includes(i)));
}
function paintLit() {
  E.padEls.forEach((el, i) => el.classList.toggle('lit', !!S.lit && padKey(i) === S.lit));
  E.miniPads.forEach((el, i) => el.classList.toggle('lit', !!S.lit && padKey(i) === S.lit));
}
function paintCur() {
  let i = -1;
  if (S.cur) { const [r, q] = S.cur.split(':'); i = matchPad(+r, q); }
  E.padEls.forEach((el, j) => el.classList.toggle('cur', j === i));
  E.miniPads.forEach((el, j) => el.classList.toggle('cur', j === i));
}

/* The lane: one box per bar / half bar / beat, grouped by bar */
function buildLane() {
  const c = curClip(), n = c ? c.slots.length : S.pendingBars * 4, bars = n / 4, g = boxSize(), per = 4 / g;
  const lane = E.lane;
  lane.textContent = '';
  lane.dataset.g = g;
  E.boxEls = []; E.boxBySlot = {};
  for (let b = 0; b < bars; b++) {
    const row = h('div', 'cp-boxes');
    const bar = h('div', 'cp-bar', h('span', 'cp-barlbl', 'Bar ' + (b + 1)), row);
    bar.style.setProperty('--per', per);
    for (let k = 0; k < per; k++) {
      const s = b * 4 + k * g, bi = boxInfo(c, s), where = boxLabel(s, g);
      let cls = 'cp-box ' + bi.kind + (bi.start ? ' start' : bi.kind !== 'empty' ? ' cont' : '');
      if (k === 0) cls += ' first';
      const kids = [];
      let what;
      if (bi.kind === 'chord' && bi.start) {
        const nm = h('span', 'cp-bx-name'); chordLabel(nm, bi.r, bi.q);
        const inKey = T.chordPcs(bi.r, bi.q).every(pc => T.inScale(pc, BB.store.p.key, BB.store.p.mode));
        if (!inKey) cls += ' outside';
        kids.push(nm, h('span', 'cp-bx-num', numeralOf(bi.r, bi.q)));
        what = fullName(bi.r, bi.q) + ', the ' + numeralOf(bi.r, bi.q) + ' chord.';
      } else if (bi.kind === 'chord') {
        const nm = h('span', 'cp-bx-name'); chordLabel(nm, bi.r, bi.q);
        kids.push(h('span', 'cp-bx-cont', h('span', { class: 'cp-bx-arrow', 'aria-hidden': 'true' }, '↳'), nm), h('span', 'cp-bx-num', 'same'));
        what = fullName(bi.r, bi.q) + ' keeps playing from the box before.';
      } else if (bi.kind === 'rest') {
        kids.push(h('span', 'cp-bx-rest', bi.start ? 'Rest' : '↳ rest'));
        what = bi.start ? 'A rest: silence until the next chord.' : 'Silence (the rest before keeps going).';
      } else {
        kids.push(h('span', { class: 'cp-bx-plus', 'aria-hidden': 'true' }, '+'));
        what = 'Empty.';
      }
      if (g < 4) kids.push(h('span', 'cp-bx-beat', g === 2 ? 'beat ' + (s % 4 + 1) : String(s % 4 + 1)));
      const box = h('button', {
        class: cls, 'aria-pressed': 'false', 'aria-label': where + ': ' + what, dataset: { slot: String(s) },
        'data-tip-title': where, 'data-tip': what + ' Tap to pick this box and hear it, then tap a chord pad to put a chord here.',
      }, kids);
      row.append(box);
      E.boxEls.push(box); E.boxBySlot[s] = box;
    }
    lane.append(bar);
  }
  S.nowBox = -1;
  /* hint when smaller boxes are forced so that no change is hidden */
  const need = BB.chordGridNeeded(c);
  E.gridHint.hidden = !(S.grid > need);
  if (S.grid > need) E.gridHint.textContent = 'Showing ' + (need === 2 ? 'half bars' : 'single beats') + ' because a chord in this progression changes ' + (need === 2 ? 'halfway through a bar' : 'on a beat inside a bar') + '. Use “Same as before” to join boxes.';
  E.laneEmpty.hidden = !(BB.clipIsEmpty('chords', c) && S.sel == null);
  paintSel();
  buildMini();
}
/* The card's little picture of the progression: one block per chord, sized by how long it lasts */
function buildMini() {
  const c = curClip(), n = c ? c.slots.length : S.pendingBars * 4, bars = n / 4;
  E.mini.textContent = ''; E.miniSegs = [];
  E.mini.style.setProperty('--bars', bars);
  const empty = BB.clipIsEmpty('chords', c);
  E.miniEmpty.hidden = !empty;
  if (empty) return;
  let i = 0;
  while (i < n) {
    let j = i + 1; while (j < n && !c.slots[j]) j++;
    const v = c.slots[i];
    const seg = h('span', 'cp-mseg' + (v && !v.rest ? '' : v ? ' rest' : ' none'));
    if (v && !v.rest) { const nm = h('b'); chordLabel(nm, v.r, v.q); seg.append(nm, h('small', null, numeralOf(v.r, v.q))); }
    else if (v) seg.append(h('small', null, 'Rest'));
    seg.style.left = 'calc(' + (i / n * 100) + '% + 2px)'; seg.style.width = 'calc(' + ((j - i) / n * 100) + '% - 4px)';
    E.mini.append(seg); E.miniSegs.push({ el: seg, a: i, b: j });
    i = j;
  }
  S.miniNow = -1;
}
function flashFresh() {
  const el = S.fresh != null && E.boxBySlot[S.fresh];
  S.fresh = null;
  if (!el) return;
  el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
}
function paintSel() {
  const n = slotCount(), g = boxSize();
  if (S.sel != null) { S.sel = Math.floor(S.sel / g) * g; if (S.sel >= n) S.sel = null; }
  const placing = S.sel != null;
  E.boxEls.forEach(b => { const on = +b.dataset.slot === S.sel; b.classList.toggle('is-sel', on); b.setAttribute('aria-pressed', String(on)); });
  E.toolbar.hidden = !placing;
  E.writing.hidden = !placing;
  E.edPadHint.hidden = placing;
  E.padsWrap.classList.toggle('placing', placing);
  E.laneEmpty.hidden = placing || !BB.clipIsEmpty('chords', curClip());
  if (placing) { const w = boxLabel(S.sel, g); E.placeWhere.textContent = w; E.writingWhere.textContent = w.replace(/^Bar/, 'bar'); scrollToBox(S.sel); }
  E.write.update();
  paintToolbar();
}
function paintToolbar() {
  if (S.sel == null) return;
  const b = boxInfo(curClip(), S.sel);
  E.same.disabled = S.sel === 0;
  E.same.classList.toggle('cp-dim', S.sel === 0 || !b.start);
  E.paste.classList.toggle('cp-dim', !S.clipboard);
  E.boxFlavor.update();
  E.boxFlavor.classList.toggle('cp-dim', b.kind !== 'chord');
  E.placeWhat.textContent = b.kind === 'chord' ? (b.start ? ' holds ' : ' continues ') + T.chordName(b.r, b.q) + '.' : b.kind === 'rest' ? ' is silent.' : ' is empty.';
}
function setSel(i, opts = {}) {
  S.sel = i == null ? null : BB.clamp(i, 0, slotCount() - 1);
  paintSel();
  if (S.sel != null && opts.hear) hear(S.sel);
}
function scrollToBox(slot) {
  const b = E.boxBySlot[slot], sc = E.laneScroll; if (!b) return;
  const l = b.offsetLeft, r = l + b.offsetWidth;
  if (l < sc.scrollLeft + 8) sc.scrollLeft = Math.max(0, l - 28);
  else if (r > sc.scrollLeft + sc.clientWidth - 8) sc.scrollLeft = r - sc.clientWidth + 28;
}
function paintNow(pos, ch) {
  const g = boxSize(), box = pos < 0 ? -1 : Math.floor(Math.floor(pos / 4) / g) * g;
  if (box !== S.nowBox) {
    const old = E.boxBySlot[S.nowBox]; if (old) old.classList.remove('now');
    S.nowBox = box;
    const b = E.boxBySlot[box]; if (b) b.classList.add('now');
  }
  const step = pos < 0 ? -1 : pos % 16;
  if (step !== S.nowStep) {
    const oc = E.cells[S.nowStep]; if (oc) oc.classList.remove('now', 'strike');
    S.nowStep = step;
    const cell = E.cells[step];
    if (cell) {
      const r = BB.chordRhythm(curClip());
      cell.classList.add('now');
      if (ch && (r.hits[step] > 0 || ch.start === pos)) cell.classList.add('strike');
    }
  }
  const k = ch ? ckey(ch.root, ch.q) : null;
  if (k !== S.cur) { S.cur = k; paintCur(); }
  const slot = pos < 0 ? -1 : Math.floor(pos / 4), mi = slot < 0 ? -1 : E.miniSegs.findIndex(x => slot >= x.a && slot < x.b);
  if (mi !== S.miniNow) { const o = E.miniSegs[S.miniNow]; if (o) o.el.classList.remove('now'); S.miniNow = mi; const m = E.miniSegs[mi]; if (m) m.el.classList.add('now'); }
}

/* The melody strip: 10 bars from the scale, starting near middle C */
function buildMel(force) {
  const p = BB.store.p, sig = p.key + ':' + p.mode + ':' + S.melMode;
  if (!force && sig === S.melSig) return;
  S.melSig = sig;
  const sc = S.melMode === 'scale' ? T.scale(p.mode) : T.penta(p.mode), tonic = T.place(p.key, 60);
  S.melNotes = BB.range(10).map(i => tonic + sc[i % sc.length] + 12 * Math.floor(i / sc.length));
  E.mel.textContent = '';
  E.melEls = S.melNotes.map((m, i) => {
    const letter = MEL_CODES[i].slice(3), home = (((m - p.key) % 12) + 12) % 12 === 0;
    const el = h('button', {
      class: 'cp-mbar' + (home ? ' home' : ''), tabindex: '-1', 'aria-label': 'Play ' + T.noteName(m) + (home ? ', the home note' : ''),
      'data-tip-title': T.pcName(m) + (home ? ' · home note' : ''),
      'data-tip': (home ? 'The home note of your key. Melodies love to end here. ' : 'A note from your scale, so it always fits. ') + 'Press and slide across the bars, or use the ' + letter + ' key.',
      dataset: { i: String(i), midi: String(m) },
    }, h('span', 'cp-mnote', T.pcName(m)), h('i', home ? 'cp-mdot' : 'cp-mgap'), h('span', { class: 'cp-mkey', 'aria-hidden': 'true' }, letter));
    el.style.setProperty('--i', i);
    el.addEventListener('click', e => { if (e.detail === 0) BB.preview.note('melody', m, 0.85, 0.5); });
    return el;
  });
  E.mel.append(...E.melEls);
}

function paintHeader() {
  const p = BB.store.p, sc = p.scenes[BB.state.scene], label = 'Scene ' + (BB.state.scene + 1);
  E.keyPill.textContent = T.pcName(p.key) + ' ' + T.MODES[p.mode].name.toLowerCase();
  const sname = sc && sc.name && sc.name !== label ? label + ' · ' + sc.name : label;
  E.scenePill.textContent = sname;
  E.recPill.hidden = !(TR.rec && TR.playing);
  const scene = BB.state.scene;
  E.addBass.querySelector('.btn-label').textContent = BB.store.clip('bass', scene) ? 'Replace bass' : 'Add bass';
  E.addMel.querySelector('.btn-label').textContent = BB.store.clip('melody', scene) ? 'Replace melody' : 'Add melody';
}
function rhythmSummary() {
  const r = TR.liveRhythm(), pr = BB.CHORD_RHYTHMS.find(x => x.id === BB.rhythmPresetId(r));
  const feel = BB.CHORD_FEELS.find(f => f.id === (r.feel || 'block')), len = BB.CHORD_LENGTHS.find(f => f.id === (r.len || 'ring'));
  E.rSummary.textContent = 'Rhythm: ' + (pr ? pr.short + ' ' + (PRESET_SMALL[pr.id] || pr.name) : 'custom') + ' · ' + (feel ? feel.name : '') + ' · ' + (len ? len.name : '');
}
function updateControls() {
  E.sound.update(); E.flavor.update(); E.playFlavor.update(); E.bars.update(); E.melSeg.update(); E.write.update(); E.gridSeg.update(); E.knobs.update();
  const need = BB.chordGridNeeded(curClip());
  Array.from(E.gridSeg.querySelectorAll('button')).forEach((b, i) => {
    const o = GRID_OPTS[i], locked = o.id > need;
    b.classList.toggle('cp-locked', locked);
    b.setAttribute('aria-disabled', String(locked));
    b.setAttribute('data-tip', locked ? o.tip + ' Not available right now: some chords change inside a bar, and bigger boxes would hide them.' : o.tip);
  });
  E.bassSeg.update(); E.melFollowSeg.update();
  const p = BB.store.p, sig = p.key + ':' + p.mode;
  if (sig !== S.keySig) { S.keySig = sig; E.starter.refill(); } else E.starter.update();
}
function refresh(evt) {
  evt = evt || {};
  paintPads();
  if (!evt.track || evt.track === 'chords' || evt.all) buildLane();
  buildMel(false);
  paintRhythm();
  paintHeader();
  updateControls();
  flashFresh();
}

/* ================= mount ================= */
function mount(el) {
  el.classList.add('cp-view');

  /* header */
  const scenes = UI.scenePicker({ track: 'chords', key: 'Z' });
  const sceneWrap = h('div', 'cp-scenes', scenes);
  const badge = scenes.querySelector(':scope > .hk'); if (badge) sceneWrap.append(badge); // keep the letter badge outside the scroll box
  el.append(h('div', 'view-head cp-head',
    h('div', 'cp-titles', h('h2', 'view-title', 'Chords'), h('p', 'view-sub', 'Shape the chord sound here. Open the progression to write chords, or play the pads freely.')),
    sceneWrap, UI.tourButton('chords')));

  /* ---- the screen itself: sound ---- */
  E.sound = UI.instrumentSelect('chords', { key: 'S', small: true, tip: 'The instrument your chords play. Electric piano and pads are great for chords, but try a few!' });
  const flavorSeg = () => UI.seg({
    label: 'Flavor', key: 'F', small: true, options: FLAVORS,
    tip: 'Adds color to every pad at once. Simple is plain and strong; the others add an extra note for a richer sound.',
    value: () => BB.state.chordFlavor || 'triad',
    set: id => {
      BB.setState({ chordFlavor: id });
      const c = buildPadChords()[S.lastPad != null ? S.lastPad : 0];
      BB.preview.chord(c.root, c.q);
    },
  });
  E.flavor = flavorSeg();
  E.knobs = UI.trackKnobs('chords', { volKey: 'U' });
  E.keyPill = h('span', { class: 'pill cp-keypill', 'data-tip-title': 'Your key', 'data-tip': 'The pads are built from your song’s key and scale. Change them with Key and Scale at the top; the pads follow.' });
  const soundPanel = h('section', { class: 'panel cp-sound c-chords', id: 'cp-sound', 'aria-label': 'Chord sound' },
    h('div', 'panel-head', h('h3', null, h('i', 'sw'), 'Sound'), h('p', 'hint desk-only', 'Change these while the music plays to hear the difference.')),
    h('div', 'cp-sound-row',
      h('div', 'cp-ctl cp-ctl-sound', h('span', 'lbl', 'Sound'), E.sound),
      h('div', 'cp-ctl cp-ctl-flavor', h('span', 'lbl', 'Flavor'), E.flavor),
      E.knobs));

  /* ---- card: the progression ---- */
  E.scenePill = h('span', { class: 'pill', 'data-tip-title': 'Scene', 'data-tip': 'This progression belongs to the scene you picked at the top. Each scene can have its own chords.' });
  E.mini = h('div', 'cp-mini');
  E.miniEmpty = h('span', 'cp-mini-empty', 'No chords in this scene yet. Tap here to write some, or pick a starter.');
  E.rSummary = h('span', 'cp-mini-rhythm');
  E.starter = UI.select({
    label: 'Starter progressions', key: 'G', small: true, options: starterOptions,
    tip: 'Start from a famous chord progression in your key. It replaces this scene’s chords (Undo brings them back).',
    value: () => S.starter, set: applyStarter,
  });
  E.starter.classList.add('cp-starter');
  E.openEd = UI.button({ label: 'Edit chords', key: 'E', icon: I.edit, cls: 'colored ws-go',
    tip: 'Open the progression full screen: put a chord in each box and set the rhythm. Close it (or press Esc) to come back.', onClick: () => E.wsEd.open({ from: E.openEd }) });
  const progCard = UI.wsCard({ id: 'cp-prog-card', title: 'Progression', color: 'chords', cls: 'cp-card cp-prog-card', pill: E.scenePill,
    preview: h('div', 'cp-mini-wrap', E.mini, E.miniEmpty, E.rSummary), onOpen: () => E.wsEd.open({ from: E.openEd }),
    ariaLabel: 'Open the progression editor', tipTitle: 'Your progression', tip: 'The chords this scene loops, in order. Tap it to open the progression editor.',
    foot: [E.starter], button: E.openEd });

  /* ---- card: play freely ---- */
  E.miniPads = BB.range(8).map(() => h('span', 'cp-mpad'));
  E.openPlay = UI.button({ label: 'Play chords', key: 'P', icon: I.tap, cls: 'colored ws-go',
    tip: 'Open big chord pads and the melody strip full screen to play freely. Turn on Record to add what you play to the loop.', onClick: () => E.wsPlay.open({ from: E.openPlay }) });
  const playCard = UI.wsCard({ id: 'cp-play-card', title: 'Pads & melody', color: 'chords', cls: 'cp-card cp-play-card ws-card-side',
    preview: h('div', 'cp-mpads', E.miniPads), onOpen: () => E.wsPlay.open({ from: E.openPlay }),
    ariaLabel: 'Open the chord pads', tipTitle: 'Play freely', tip: 'Eight chord pads that are always in your key, plus a melody strip. Tap here to open them big.',
    foot: [h('p', 'hint cp-card-hint', h('span', 'desk-only', 'Keys 1–8 play the pads from here too.'))], button: E.openPlay });

  el.append(soundPanel, h('div', 'cp-cards', progCard, playCard));

  /* ---- the pads (one set, moved into whichever workspace is open) ---- */
  E.padEls = BB.range(8).map(i => {
    const b = h('button', { class: 'cp-pad', dataset: { i: String(i) } },
      h('span', 'cp-pad-top', h('span', 'cp-num'), h('span', { class: 'cp-kc', 'aria-hidden': 'true' }, String(i + 1))),
      h('span', 'cp-name'),
      h('span', 'cp-pad-foot', h('span', 'cp-tag'), h('span', 'cp-next', 'Good next')));
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      press('p' + e.pointerId, i);
    });
    const up = e => release('p' + e.pointerId);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('click', e => { if (e.detail === 0) { press('click', i); setTimeout(() => release('click'), 650); } });
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  });
  /* data-no-press-tip: pads are held to play, so a long press on a phone plays instead of showing a tooltip */
  E.padsWrap = h('div', { class: 'cp-pads', id: 'cp-pads', 'data-no-press-tip': '' }, E.padEls);
  E.writing = h('span', { class: 'pill cp-writing', hidden: true, 'data-tip-title': 'Writing chords', 'data-tip': 'Tapping a pad now also writes it into the selected box of the progression. Press Done (or Esc) to just play again.' },
    h('span', { class: 'ico', html: I.edit }), 'Tap a pad to write it in ', E.writingWhere = h('b'));
  E.padSlotEd = h('div', 'cp-padslot');
  E.padSlotPlay = h('div', 'cp-padslot');
  E.padSlotEd.append(E.padsWrap);

  /* ---- workspace: the progression editor (lane + pads, and the rhythm) ---- */
  E.write = UI.toggle({
    label: 'Write chords', key: 'A', icon: I.edit, cls: 'sm c-chords',
    tip: 'Turn on, then tap chord pads to fill the boxes one after another. You can also tap any box to start there.',
    value: () => S.sel != null, set: v => setSel(v ? 0 : null, { hear: true }),
  });
  E.gridSeg = UI.seg({
    label: 'Chord changes', small: true, options: GRID_OPTS,
    tip: 'How often a chord can change: once a bar, every half bar, or on any beat. This sets the size of the boxes below.',
    value: () => boxSize(), set: id => { S.grid = id; buildLane(); updateControls(); },
  });
  E.bars = UI.seg({
    label: 'Bars', key: 'B', small: true,
    tip: 'How long the chord loop is. Making it longer repeats what you have, so nothing is lost.',
    options: BB.BAR_CHOICES.map(b => ({ id: b, label: String(b), tip: b === 1 ? 'A 1-bar loop' : 'A ' + b + '-bar loop' })),
    value: () => { const c = curClip(); return c ? c.bars : S.pendingBars; }, set: setBars,
  });
  E.double = UI.button({ label: 'Double it', icon: I.copy, cls: 'sm', tip: 'Repeat the progression so it is twice as long (up to 8 bars). Then change a chord or two in the copy for variety.', onClick: doubleIt });
  E.up = UI.button({ label: 'Move chords up', cls: 'sm icon-only cp-step', text: false, tip: 'Move every chord one step up the scale (C becomes Dm, F becomes G…). A quick way to make a variation.', onClick: () => transpose(1) });
  E.down = UI.button({ label: 'Move chords down', cls: 'sm icon-only cp-step', text: false, tip: 'Move every chord one step down the scale (Dm becomes C, G becomes F…).', onClick: () => transpose(-1) });
  E.up.append(h('span', { class: 'cp-step-glyph', 'aria-hidden': 'true' }, '▲')); E.down.append(h('span', { class: 'cp-step-glyph', 'aria-hidden': 'true' }, '▼'));
  E.clear = UI.button({ label: 'Clear', key: 'C', icon: I.trash, cls: 'sm ghost', tip: 'Remove every chord from this scene’s progression. You can undo it.', onClick: clearClip });

  /* toolbar for the selected box */
  E.same = UI.button({ label: 'Same as before', key: 'X', cls: 'sm', tip: 'Let the chord on the left keep playing through this box, as if you never changed it. Nothing else moves. Shortcut: Delete.', onClick: sameAsBefore });
  E.rest = UI.button({ label: 'Rest', key: 'H', cls: 'sm', tip: 'Silence in this box: the chords pause here.', onClick: restBox });
  E.boxFlavor = UI.seg({
    label: 'This chord’s flavor', small: true, options: BOX_FLAVORS,
    tip: 'Change the color of just the chord in this box. The note it is built on stays the same.',
    value: () => { const b = boxInfo(curClip(), S.sel == null ? 0 : S.sel); return b.kind === 'chord' ? FLAVOR_OF[b.q] || '' : ''; },
    set: boxFlavor,
  });
  E.copy = UI.button({ label: 'Copy', icon: I.copy, cls: 'sm ghost', tip: 'Copy the chord in this box, to paste it into another box.', onClick: copyBox });
  E.paste = UI.button({ label: 'Paste', cls: 'sm ghost', tip: 'Put the copied chord into this box, then move on to the next box.', onClick: pasteBox });
  E.done = UI.button({ label: 'Done', cls: 'sm primary', tip: 'Stop writing. The pads go back to just playing. Shortcut: Esc.', onClick: () => setSel(null) });
  E.toolbar = h('div', { class: 'cp-place', hidden: true, role: 'status' },
    h('div', 'cp-place-line',
      h('span', { class: 'cp-place-ico', html: I.edit }),
      h('span', 'cp-place-text', h('b', null, E.placeWhere = h('span')), E.placeWhat = h('span'), ' Tap a chord pad to put a chord here.',
        h('span', 'desk-only cp-place-keys', ' ← → move, Enter writes the last chord, Esc stops.'))),
    h('div', 'cp-place-btns',
      E.same, E.rest, E.copy, E.paste,
      h('span', 'cp-place-flavor', h('span', 'lbl', 'Flavor'), E.boxFlavor),
      h('span', 'grow'), E.done));

  E.lane = h('div', { class: 'cp-lane', id: 'cp-lane' });
  E.laneScroll = h('div', 'cp-lane-scroll', E.lane);
  E.laneEmpty = h('p', { class: 'cp-lane-empty' }, 'No chords here yet. Tap the first box, then tap pads below. Or pick a starter on the Chords screen.');
  E.gridHint = h('p', { class: 'hint cp-grid-hint', hidden: true });
  E.lane.addEventListener('click', e => {
    const b = e.target.closest('.cp-box'); if (!b) return;
    setSel(+b.dataset.slot, { hear: true });
  });
  E.recPill = h('span', { class: 'pill cp-recpill', hidden: true, 'data-tip-title': 'Recording', 'data-tip': 'Record is on: the chords you play land in the progression in time with the beat. Undo removes a take.' }, h('i', 'cp-recdot'), 'Recording');

  /* follow helpers */
  E.bassSeg = UI.seg({ label: 'Bass style', small: true, options: BASS_FOLLOW.map(o => ({ id: o.id, label: o.label, tip: (BB.library.itemsFor('bass').find(x => x.id === o.id) || {}).desc })), value: () => S.bassFollow, set: id => { S.bassFollow = id; } });
  E.melFollowSeg = UI.seg({ label: 'Melody style', small: true, options: MEL_FOLLOW.map(o => ({ id: o.id, label: o.label, tip: (BB.library.itemsFor('melody').find(x => x.id === o.id) || {}).desc })), value: () => S.melFollow, set: id => { S.melFollow = id; } });
  E.addBass = UI.button({ label: 'Add bass', icon: I.plus, cls: 'sm c-bass colored', tip: 'Adds a bass line to this scene that follows your chords, note for note. Change the chords later and add it again to match.', onClick: () => addFollow('bass') });
  E.addMel = UI.button({ label: 'Add melody', icon: I.plus, cls: 'sm c-melody colored', tip: 'Adds a melody to this scene built on your chords, so it always fits. Edit it on the Keys screen.', onClick: () => addFollow('melody') });
  E.addBass.id = 'cp-add-bass';

  E.toolsToggle = h('button', { class: 'btn sm cp-tools-toggle', 'aria-expanded': 'false', 'aria-controls': 'cp-more',
    'data-tip-title': 'More tools', 'data-tip': 'Show tools for the whole progression: chord changes, length, double it, move and clear.',
    onclick: () => { const open = !E.lanePanel.classList.contains('tools-open'); E.lanePanel.classList.toggle('tools-open', open); E.toolsToggle.setAttribute('aria-expanded', String(open)); } },
  'More tools', h('span', { class: 'cp-ct-chev', 'aria-hidden': 'true' }));
  const lanePanel = E.lanePanel = h('section', { class: 'panel cp-lane-panel c-chords', id: 'cp-lane-panel', 'aria-label': 'Chord progression' },
    h('div', 'cp-lane-tools',
      E.write, E.toolsToggle,
      h('span', { class: 'cp-more', id: 'cp-more' },
        h('span', 'cp-tool', h('span', 'lbl', 'Changes'), E.gridSeg),
        h('span', 'cp-tool', h('span', 'lbl', 'Bars'), E.bars),
        E.double,
        h('span', 'cp-tool', h('span', 'lbl', 'Move'), E.up, E.down),
        E.clear)),
    E.toolbar,
    E.laneEmpty,
    h('div', 'cp-lane-wrap', E.laneScroll),
    E.gridHint);
  const follow = h('section', { class: 'panel cp-follow c-chords', id: 'cp-follow', 'aria-label': 'Follow these chords' },
    h('span', { class: 'lbl cp-follow-lbl', 'data-tip-title': 'Follow these chords', 'data-tip': 'One tap adds a bass line or melody that is built from this progression, so it always fits.' }, 'Follow these chords'),
    h('span', 'cp-follow-item c-bass', h('span', 'cp-follow-name', 'Bass'), E.bassSeg, E.addBass),
    h('span', 'cp-follow-item c-melody', h('span', 'cp-follow-name', 'Melody'), E.melFollowSeg, E.addMel));
  const edPads = h('section', { class: 'panel cp-pads-panel cp-ed-pads c-chords', 'aria-label': 'Chord pads' },
    h('div', 'panel-head', h('h3', null, h('i', 'sw'), 'Chord pads'), E.writing,
      E.edPadHint = h('p', 'hint cp-edpad-hint', 'Tap a box above, then tap pads to fill it.')),
    E.padSlotEd);

  /* rhythm */
  E.presets = h('div', { class: 'cp-presets', id: 'cp-presets', role: 'group', 'aria-label': 'Strikes per bar', 'data-tip-title': 'Strikes per bar', 'data-tip': 'How many times each chord is played in every bar. Pick one, then press Play to hear it.' });
  E.presetBtns = BB.CHORD_RHYTHMS.map(r => {
    const b = h('button', { class: 'cp-preset', 'aria-pressed': 'false', 'data-tip-title': r.name, 'data-tip': r.desc, onclick: () => pickPreset(r.id) },
      h('span', 'cp-pr-big', r.short), h('span', 'cp-pr-small', PRESET_SMALL[r.id] || r.name));
    E.presets.append(b); return b;
  });
  BB.controls.add(E.presets, {
    key: 'D', label: 'Strikes per bar',
    adjust: dir => { const ids = BB.CHORD_RHYTHMS.map(x => x.id), i = ids.indexOf(BB.rhythmPresetId(TR.liveRhythm())); pickPreset(ids[((i < 0 ? 0 : i + dir) + ids.length) % ids.length]); },
    text: () => { const id = BB.rhythmPresetId(TR.liveRhythm()), r = BB.CHORD_RHYTHMS.find(x => x.id === id); return r ? r.name : 'Custom'; },
  });
  E.cells = BB.range(16).map(i => h('button', {
    class: 'cp-rcell' + (i % 4 === 0 ? ' down' : '') + (Math.floor(i / 4) % 2 ? ' odd' : ''), dataset: { i: String(i) }, 'aria-pressed': 'false',
    'aria-label': 'Beat ' + (Math.floor(i / 4) + 1) + ', step ' + (i % 4 + 1),
    'data-tip-title': 'Beat ' + (Math.floor(i / 4) + 1) + (i % 4 ? ', between beats' : ''),
    'data-tip': 'Tap to add or remove a strike here. Drag across squares to change several at once.',
  }, h('span', 'cp-rnum', i % 4 === 0 ? String(i / 4 + 1) : '')));
  E.strip = h('div', { class: 'cp-strip', id: 'cp-strip', 'data-no-press-tip': '' }, E.cells);
  UI.glide(E.strip, '.cp-rcell', (cell, e) => {
    const i = +cell.dataset.i, r = TR.liveRhythm();
    if (!S.paint || (e && e.type === 'pointerdown')) S.paint = { on: !(r.hits[i] > 0), group: 'cp-rhythm-' + Date.now() };
    const on = S.paint.on;
    if ((r.hits[i] > 0) === on) return;
    setRhythm('Chord rhythm', rr => { rr.hits[i] = on ? hitVal(i) : 0; }, S.paint.group);
    paintRhythm();
  }, () => {});
  ['pointerup', 'pointercancel'].forEach(ev => E.strip.addEventListener(ev, () => { S.paint = null; }));
  E.feel = UI.seg({
    label: 'Feel', key: 'N', small: true, options: BB.CHORD_FEELS.map(f => ({ id: f.id, label: f.name, tip: f.desc })),
    tip: 'How the notes of each strike are played: all together, strummed, one at a time (arp) or bouncing.',
    value: () => TR.liveRhythm().feel || 'block', set: id => { setRhythm('Chord feel', r => { r.feel = id; }); paintRhythm(); },
  });
  E.feel.id = 'cp-feel';
  E.len = UI.seg({
    label: 'Length', small: true, options: BB.CHORD_LENGTHS.map(f => ({ id: f.id, label: f.name, tip: f.desc })),
    tip: 'Ring lets each strike sound until the next one. Short makes punchy stabs.',
    value: () => TR.liveRhythm().len || 'ring', set: id => { setRhythm('Chord length', r => { r.len = id; }); paintRhythm(); },
  });
  E.rCount = h('span', 'cp-rcount');
  E.rCustom = h('span', { class: 'pill cp-custom', hidden: true, 'data-tip-title': 'Custom rhythm', 'data-tip': 'Your own pattern, made by tapping the squares. Pick a preset to start over.' }, 'Custom');
  E.rNote = h('p', 'hint cp-rnote');
  const rhythmPanel = h('section', { class: 'panel cp-rhythm-panel c-chords', id: 'cp-rhythm-panel', 'aria-label': 'Chord rhythm' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Rhythm'), h('span', 'cp-rsub', 'how often each chord plays'), h('span', 'grow')),
    h('div', 'cp-rsec', h('span', 'lbl', 'Strikes per bar'), E.presets),
    h('div', 'cp-rsec',
      h('div', 'cp-rline', h('span', 'lbl', 'One bar'), E.rCount, E.rCustom),
      E.strip),
    h('div', 'cp-rfoot',
      h('div', 'cp-ctl', h('span', 'lbl', 'Feel'), E.feel),
      h('div', 'cp-ctl', h('span', 'lbl', 'Length'), E.len)),
    E.rNote);

  /* Chords | Rhythm switch for screens too narrow to show both side by side */
  E.tab = 'chords';
  E.tabSeg = UI.seg({ label: 'Show', small: true,
    tip: 'Chords: put a chord in each box. Rhythm: how often each chord plays in a bar.',
    options: [{ id: 'chords', label: 'Chords', tip: 'The boxes of the progression and the pads to fill them.' }, { id: 'rhythm', label: 'Rhythm', tip: 'How many times each chord strikes in a bar, and how it is played.' }],
    value: () => E.tab, set: setTab });
  E.tabSeg.classList.add('cp-tabs');
  E.edBody = h('div', { class: 'cp-ed', 'data-tab': 'chords' }, lanePanel, edPads, follow, rhythmPanel);
  E.wsEd = UI.workspace({ id: 'chords-editor', title: 'Progression', color: 'chords', cls: 'cp-ws cp-edws ws-tight',
    closeTip: 'Close the progression editor and go back to the Chords screen. Shortcut: Esc.',
    head: [E.tabSeg, E.recPill, h('span', 'grow'), UI.sceneSelect({ track: 'chords', key: 'Z' })],
    onOpen: () => { E.padSlotEd.append(E.padsWrap); refresh({ all: true }); },
    onClose: () => { if (S.sel != null) setSel(null); } });
  E.wsEd.body.append(E.edBody);
  el.append(E.wsEd.el);

  /* ---- workspace: play freely (pads + melody strip) ---- */
  E.melSeg = UI.seg({
    label: 'Melody notes', small: true,
    tip: 'How many different notes the strip uses. 5 notes is the easiest: almost anything you play sounds good.',
    options: [
      { id: 'penta', label: '5 notes', tip: 'The pentatonic scale: 5 notes that always sound good together. Hard to go wrong!' },
      { id: 'scale', label: '7 notes', tip: 'The full scale of your key: all 7 notes. More choice, a little more care needed.' },
    ],
    value: () => S.melMode,
    set: id => { S.melMode = id; BB.storage.set(STORE_MEL, id); buildMel(true); },
  });
  E.mel = h('div', { class: 'cp-mel', id: 'cp-mel', 'data-no-press-tip': '' });
  UI.glide(E.mel, '.cp-mbar', b => TR.noteOn('melody', +b.dataset.midi, 0.85), b => TR.noteOff('melody', +b.dataset.midi));
  const melPanel = h('section', { class: 'panel cp-mel-panel c-melody', id: 'cp-mel-panel', 'aria-label': 'Melody strip' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Melody'),
      h('p', 'hint', 'Slide across the bars', h('span', 'desk-only', ' or press Q to P'), '.'),
      h('span', 'grow'), E.melSeg),
    E.mel);
  const playPads = h('section', { class: 'panel cp-pads-panel cp-play-pads c-chords', id: 'cp-pads-panel', 'aria-label': 'Chord pads' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Chord pads'),
      h('p', 'hint', 'Hold a pad', h('span', 'desk-only', ' or press 1–8'), '. Outlined pads make a good next chord.'),
      h('span', 'grow'), E.keyPill),
    E.padSlotPlay);
  E.playFlavor = flavorSeg();
  E.wsPlay = UI.workspace({ id: 'chords-play', title: 'Pads & melody', color: 'chords', cls: 'cp-ws cp-playws ws-tight',
    closeTip: 'Close the pads and go back to the Chords screen. Shortcut: Esc.',
    head: [h('span', 'grow'), E.playFlavor, UI.sceneSelect({ track: 'chords', key: 'Z' })],
    onOpen: () => { if (S.sel != null) setSel(null); E.padSlotPlay.append(E.padsWrap); refresh({ all: true }); } });
  E.wsPlay.body.append(h('div', 'cp-play', playPads, melPanel));
  el.append(E.wsPlay.el);

  /* ---- events ---- */
  BB.on('chord', d => {
    const k = ckey(d.root, d.q);
    if (d.on) {
      S.lit = k;
      const i = S.pads.findIndex((_, j) => padKey(j) === k);
      if (i >= 0) { S.lastPad = i; S.lastPlayed = { root: d.root, q: d.q }; paintNext(); }
    } else if (S.lit === k) S.lit = null;
    paintLit();
  });
  BB.on('note', d => {
    if (d.track !== 'melody') return;
    const i = S.melNotes.indexOf(d.midi);
    if (i >= 0 && E.melEls[i]) E.melEls[i].classList.toggle('lit', !!d.on);
  });
  BB.on('ui', d => {
    if ('scene' in d) { S.sel = null; S.starter = ''; refresh({ all: true }); return; }
    if ('chordFlavor' in d) { paintPads(); E.flavor.update(); E.playFlavor.update(); }
    if ('chordRhythm' in d) paintRhythm();
  });
  BB.on('transport', d => {
    if (d.rec && S.sel != null) setSel(null); // recording writes chords itself; don't write twice
    paintHeader();
  });

  refresh({ all: true });
}
function setTab(id) {
  E.tab = id; E.edBody.dataset.tab = id; E.tabSeg.update();
  if (id === 'rhythm' && S.sel != null) setSel(null);
}

/* ================= keyboard ================= */
const PAD_CODE = /^(?:Digit|Numpad)([1-8])$/;
function keydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const code = e.code;
  const d = PAD_CODE.exec(code);
  if (d) { if (!e.repeat) press('k' + code, +d[1] - 1); return true; }
  if (code === 'Numpad9' || code === 'Numpad0') return false; // still drums
  const mi = MEL_CODES.indexOf(code);
  if (mi >= 0) {
    if (!e.repeat) {
      const m = S.melNotes[mi];
      if (S.keyMidi[code] != null) TR.noteOff('melody', S.keyMidi[code]);
      S.keyMidi[code] = m;
      TR.noteOn('melody', m, 0.85);
    }
    return true;
  }
  if (e.key === 'Escape') { if (S.sel == null) return false; setSel(null); return true; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (S.sel == null) return false;
    const n = slotCount(), g = boxSize(), step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? Math.max(4, g) : g);
    setSel(((S.sel + step) % n + n) % n, { hear: true });
    return true;
  }
  if (e.key === 'Enter') {
    if (S.sel == null) return false;
    if (S.lastPlayed) placeChord(S.lastPlayed.root, S.lastPlayed.q, true);
    else UI.toast('Play a chord pad first, then press Enter to write it here.', { replace: 'cp-hint' });
    return true;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.sel == null) return false;
    sameAsBefore();
    return true;
  }
  return false;
}
function keyup(e) {
  if (PAD_CODE.test(e.code)) release('k' + e.code);
  const m = S.keyMidi[e.code];
  if (m != null) { delete S.keyMidi[e.code]; TR.noteOff('melody', m); }
}

/* ================= hands-on tutorial ================= */
const padName = i => { const pads = S.pads.length ? S.pads : buildPadChords(); return T.chordName(pads[i].root, pads[i].q); };
const chordStarts = () => { const c = curClip(); return c ? c.slots.filter(s => s && !s.rest).length : 0; };
const ED = 'chords-editor';
const tutorial = [
  { target: '#cp-prog-card', view: 'chords', title: 'Let’s build a progression',
    text: 'A <b>chord</b> is a few notes played together. A <b>progression</b> is a short row of chords that loops, and it sets the mood of your song. This card shows the progression of the scene you picked. Steps with a task wait for you to do it; press <b>Skip</b> to just read along.' },
  { target: '.cp-scenes', view: 'chords', title: 'Pick an empty scene',
    task: 'Tap a scene without a dot (for example <b>Scene 6</b>).', doneText: 'This scene is empty and ready.',
    text: 'Scenes are the parts of your song, like a verse or a chorus. Each one has its own chords.',
    check: () => { const c = BB.store.p.clips.chords[BB.state.scene]; return !c || BB.clipIsEmpty('chords', c); } },
  { target: '#cp-lane-panel', view: 'chords', ws: ED, before: () => setTab('chords'), title: 'The progression lane',
    task: 'Tap the <b>first box</b> (bar 1).', doneText: 'Box 1 is picked. You are writing!',
    text: 'This is the progression editor. Each box is one bar, and the chord in a box plays for that whole bar. <b>Close</b> (or Esc) takes you back.',
    check: () => S.sel === 0 },
  { target: '#cp-pads', view: 'chords', ws: ED, title: 'Put a chord in it',
    get task() { const i = tryPads()[0]; return 'Tap pad <b>' + (i + 1) + '</b> (<b>' + padName(i) + '</b>), or press ' + (i + 1) + '.'; },
    doneText: 'Written into bar 1, and bar 2 is picked next.',
    text: 'While a box is picked, tapping a pad writes that chord into it, then jumps to the next box. These pads are always in your key, so nothing sounds wrong.',
    check: () => { const c = curClip(), pads = S.pads.length ? S.pads : buildPadChords(), s = c && c.slots[0]; return !!(s && !s.rest && s.r === pads[tryPads()[0]].root); } },
  { target: '#cp-pads', view: 'chords', ws: ED, title: 'Fill the other bars',
    get task() { const ids = tryPads().slice(1); return 'Now tap pads <b>' + ids.map(i => i + 1).join(', ') + '</b> (' + ids.map(padName).join(', ') + ').'; },
    doneText: 'Four chords: that is a real progression!',
    get text() { const ids = tryPads(), pads = S.pads.length ? S.pads : buildPadChords(); return 'This one is ' + ids.map(i => numeralOf(pads[i].root, pads[i].q)).join('–') + ', a progression behind countless hits.'; },
    check: () => chordStarts() >= 4 },
  { target: '#playBtn', title: 'Hear it loop',
    task: 'Press <b>Play</b> (or Space).', doneText: 'Listen: your four chords loop over and over.',
    text: 'Your progression plays on repeat. Keep it running while you try the next steps.',
    check: () => BB.transport.playing },
  { target: '#cp-presets', view: 'chords', ws: ED, before: () => setTab('rhythm'), title: 'How often each chord plays',
    task: 'Pick <b>4×</b> to strike every chord on every beat.', doneText: 'Four strikes in every bar.',
    text: 'Right now each chord plays once and rings. These buttons choose how many times it strikes in a bar. The squares below show the pattern; tap them to make your own.',
    check: () => BB.rhythmPresetId(TR.liveRhythm()) === 'x4' },
  { target: '#cp-feel', view: 'chords', ws: ED, title: 'Change the feel',
    before: () => { setTab('rhythm'); S.tour.feel = TR.liveRhythm().feel; },
    task: 'Try a <b>Feel</b>, like <b>Arp up</b>.', doneText: 'Hear how the same chords sound new?',
    text: '<b>Feel</b> decides how the notes of each strike are played: together, strummed, or one at a time.',
    check: () => TR.liveRhythm().feel !== S.tour.feel },
  { target: '#cp-lane-panel', view: 'chords', ws: ED, title: 'Change one chord',
    before: () => { setTab('chords'); const c = curClip(); S.tour.bar3 = c ? JSON.stringify(boxInfo(c, 8)) : ''; },
    task: 'Tap <b>bar 3</b>, then tap a different pad.', doneText: 'Changed! Only bar 3 changed; every other box stayed the same.',
    text: 'You can change any box at any time. Tap it to hear it, then tap a pad to replace it.',
    check: () => { const c = curClip(); return !!c && S.tour.bar3 !== '' && JSON.stringify(boxInfo(c, 8)) !== S.tour.bar3; } },
  { target: () => (E.toolbar.hidden ? E.lanePanel : E.same), view: 'chords', ws: ED, title: 'Same as before',
    before: () => { setTab('chords'); if (curClip()) setSel(8); },
    task: 'Tap <b>Same as before</b>.', doneText: 'Bar 3 now keeps playing the chord from bar 2.',
    text: '<b>Same as before</b> lets the chord on the left carry on through the picked box, as if it had never changed. Nothing else moves. Undo works too.',
    check: () => { const c = curClip(); return !!c && !c.slots[8]; } },
  { target: '#cp-follow', view: 'chords', ws: ED, title: 'Add a bass line that follows',
    before: () => { setTab('chords'); if (S.sel != null) setSel(null); },
    task: 'Tap <b>Add bass</b>.', doneText: 'A bass line now follows your chords.',
    text: 'These buttons write a bass line or melody built from your chords, so it always fits.',
    check: () => !!BB.store.p.clips.bass[BB.state.scene] },
  { target: '#cp-mel-panel', view: 'chords', ws: 'chords-play', title: 'Play a melody on top',
    text: 'This is the play area: the chord pads plus a melody strip. Slide across the bars (or press <b>Q to P</b>) to play a melody; they only hold notes from your scale. <b>Try next:</b> back on the Chords screen, change the <b>Sound</b> or <b>Flavor</b> while it plays.' },
];

BB.views.register({
  id: 'chords', title: 'Chords', letterMode: 'notes', numpad: true,
  mount,
  keydown, keyup, tutorial,
  render(evt) { refresh(evt); },
  show() { refresh({ all: true }); },
  hide() { S.held = null; S.keyMidi = {}; },
  step(e) {
    const r = e && e.pos && e.pos.chords, on = !!(r && r.scene === BB.state.scene);
    const ch = on ? BB.chordAt(curClip(), r.pos) : null;
    paintNow(on ? r.pos : -1, ch);
  },
});
})();

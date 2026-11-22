/* Beat Board · Chords screen
   Chord pads that are always in key (with "good next" hints), a progression lane that edits the
   scene's chord clip, and a scale-locked melody strip.
   Keyboard: 1–8 hold pads, Q–P play the melody strip, ⇧ + letter picks a control,
   ← → move the lane selection, Enter writes the last chord, Delete erases, Esc stops writing. */
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
/* Extra numeral marks T.numeral leaves out, so "7ths" pads read Imaj7, ii7, V7… */
const NUM_SFX = { maj7: 'maj7', m7: '7', m7b5: '7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', madd9: 'add9', maj6: '6', m6: '6', aug: '+' };

/* ================= UI state (the song itself is always read fresh from BB.store.p) ================= */
const S = {
  pads: [],          // [{root, q, degree, role, home, borrowed}] ×8
  lastPad: null,     // pad index of the last chord played (for "good next")
  lastPlayed: null,  // {root, q} last chord played, for Enter
  held: null,        // {source, pad} the pad this view is holding
  lit: null,         // 'root:q' of the live chord
  cur: null,         // 'root:q' of the chord under the playhead
  sel: null,         // selected lane slot (place mode) or null
  pendingBars: 4,    // length to use when the first chord creates the clip
  starter: '',       // last applied starter id (so ← → on the select steps through them)
  fresh: null,       // slot just written (flash it)
  nowSlot: -1,       // slot under the playhead
  melMode: BB.storage.get(STORE_MEL, 'penta') === 'scale' ? 'scale' : 'penta',
  melNotes: [], melSig: '', keySig: '',
  keyMidi: {},       // KeyQ… -> midi held from the keyboard
};
const E = { padEls: [], beatEls: [], melEls: [], blockAt: [] };

/* ================= helpers ================= */
const curClip = () => BB.store.clip('chords', BB.state.scene);
const slotCount = () => { const c = curClip(); return c ? c.slots.length : S.pendingBars * 4; };
const qInfo = q => T.QUALITIES[q] || T.QUALITIES.maj;
const fullName = (r, q) => T.pcName(r) + ' ' + qInfo(q).name;
const ckey = (r, q) => r + ':' + q;
const nextFor = i => ((NEXT[BB.store.p.mode] || NEXT.major)[i]) || [];
const where = slot => 'bar ' + (Math.floor(slot / 4) + 1) + ', beat ' + (slot % 4 + 1);
function numeralOf(r, q) {
  let n = T.numeral(BB.store.p.key, r, q);
  const s = NUM_SFX[q]; if (s && !n.endsWith(s)) n += s;
  return n;
}
/* Root big, the quality suffix smaller: "C" + "maj7" */
function chordLabel(el, r, q) {
  el.textContent = '';
  el.append(T.pcName(r));
  const sfx = qInfo(q).sfx; if (sfx) el.append(h('small', null, sfx));
}
const orList = arr => (arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' or ' + arr[arr.length - 1]);

/* The 8 pads: the 7 chords of the key plus one borrowed chord */
function buildPadChords() {
  const p = BB.store.p, fl = BB.state.chordFlavor || 'triad';
  const out = BB.range(7).map(d => {
    const c = T.diatonic(p.key, p.mode, d, fl), tri = T.diatonic(p.key, p.mode, d, 'triad');
    const role = tri.q === 'aug' ? 'Strange and dreamy. It adds a mysterious touch.' : (ROLE[tri.numeral.replace(/[♭♯]/g, '')] || 'A chord from your key.');
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

/* ================= playing pads ================= */
function press(source, i) {
  const c = S.pads[i]; if (!c) return;
  S.held = { source, pad: i };
  S.lastPad = i; S.lastPlayed = { root: c.root, q: c.q };
  TR.chordOn(c.root, c.q, { style: BB.state.chordStyle });
  paintNext();
  if (S.sel != null && !(TR.rec && TR.playing)) placeAt(S.sel, c.root, c.q, false);
}
function release(source) {
  if (!S.held || S.held.source !== source) return;
  S.held = null;
  TR.chordOff();
}

/* ================= writing into the lane ================= */
/* While the transport plays loops, make sure the chords you write are heard. */
function heard(scene) {
  if (TR.playing && TR.mode === 'loop' && !TR.isLaunched('chords', scene) && TR.queuedFor('chords') !== scene) TR.launchClip('chords', scene);
}
function placeAt(slot, root, q, audition) {
  const scene = BB.state.scene, had = !!curClip();
  BB.store.change('Write chord', () => {
    const c = BB.store.ensureClip('chords', scene, { bars: S.pendingBars, style: BB.state.chordStyle });
    if (slot < c.slots.length) c.slots[slot] = { r: root, q };
  }, { info: { track: 'chords', scene } });
  if (!had) heard(scene);
  if (audition) BB.preview.chord(root, q);
  S.starter = ''; S.fresh = slot;
  flashFresh();
  advance(slot);
}
function advance(slot) {
  const next = (Math.floor(slot / 4) + 1) * 4;
  if (next >= slotCount()) { setSel(null); UI.toast('That was the last bar. Press Play to hear your progression!'); }
  else setSel(next);
}
function eraseSel() {
  if (S.sel == null) return;
  const slot = S.sel, scene = BB.state.scene, c = curClip();
  if (!c || !c.slots[slot]) { UI.toast(slot === 0 || !c ? 'This beat is already empty.' : 'Nothing starts on this beat. The chord before it just keeps playing.'); return; }
  BB.store.change('Erase chord', () => { const cc = BB.store.clip('chords', scene); if (cc) cc.slots[slot] = null; }, { info: { track: 'chords', scene } });
  S.starter = '';
}
function restSel() {
  if (S.sel == null) return;
  const slot = S.sel, scene = BB.state.scene;
  BB.store.change('Add rest', () => {
    const c = BB.store.ensureClip('chords', scene, { bars: S.pendingBars, style: BB.state.chordStyle });
    if (slot < c.slots.length) c.slots[slot] = { rest: true };
  }, { info: { track: 'chords', scene } });
  S.starter = '';
  advance(slot);
}
function clearClip() {
  const c = curClip(), scene = BB.state.scene;
  if (!c || BB.clipIsEmpty('chords', c)) { UI.toast('There are no chords to clear in this scene yet.'); return; }
  BB.store.change('Clear chords', () => { const cc = BB.store.clip('chords', scene); if (cc) cc.slots = cc.slots.map(() => null); }, { info: { track: 'chords', scene } });
  S.starter = ''; setSel(null);
  UI.toast('Chords cleared.', { action: { label: 'Undo', onClick: () => { const l = BB.store.undo(); if (l) UI.toast('Undid: ' + l); } } });
}
function setBars(bars) {
  const c = curClip(), scene = BB.state.scene;
  if (!c) { S.pendingBars = bars; buildLane(); paintSel(); return; }
  if (c.bars === bars) return;
  BB.store.change('Chord loop length', () => { const cc = BB.store.clip('chords', scene); if (cc) BB.resizeClip('chords', cc, bars); }, { info: { track: 'chords', scene } });
}
function setStyle(id) {
  BB.setState({ chordStyle: id });
  const c = curClip(), scene = BB.state.scene;
  if (c && c.style !== id) BB.store.change('Chord style', () => { const cc = BB.store.clip('chords', scene); if (cc) cc.style = id; }, { group: 'chord-style', info: { track: 'chords', scene } });
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
  const scene = BB.state.scene, c0 = curClip();
  const clip = BB.library.apply('chords', scene, id, { style: c0 ? c0.style : BB.state.chordStyle });
  S.starter = id; setSel(null); E.starter.update();
  heard(scene);
  const it = starterOptions().find(o => o.id === id);
  UI.toast('Added ' + (it ? it.label : clip.name) + '. Press Play to hear it.');
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
    el.setAttribute('data-tip', c.role + ' Hold to play it (key ' + (i + 1) + '). Good next: ' + orList(nx) + '.');
  });
  paintNext(); paintLit(); paintCur();
}
function paintNext() {
  const nx = S.lastPad == null ? [] : nextFor(S.lastPad);
  E.padEls.forEach((el, i) => el.classList.toggle('next', nx.includes(i)));
}
function paintLit() { E.padEls.forEach((el, i) => el.classList.toggle('lit', !!S.lit && padKey(i) === S.lit)); }
/* The pad that best matches a chord: same chord, else same root and major/minor family, else same root */
function matchPad(root, q) {
  const minorish = T.MINORISH_Q.has(q);
  let i = S.pads.findIndex(c => c.root === root && c.q === q);
  if (i < 0) i = S.pads.findIndex(c => c.root === root && T.MINORISH_Q.has(c.q) === minorish);
  if (i < 0) i = S.pads.findIndex(c => c.root === root);
  return i;
}
function paintCur() {
  let i = -1;
  if (S.cur) { const [r, q] = S.cur.split(':'); i = matchPad(+r, q); }
  E.padEls.forEach((el, j) => el.classList.toggle('cur', j === i));
}

/* The lane: one column per beat, grouped by bar, with each chord drawn as a block over its beats */
function buildLane() {
  const c = curClip(), n = c ? c.slots.length : S.pendingBars * 4, bars = n / 4, lane = E.lane;
  const col = s => Math.floor(s / 4) * 5 + (s % 4) + 1; // a thin spacer column sits between bars
  const cols = [];
  for (let b = 0; b < bars; b++) { cols.push('repeat(4, minmax(var(--cp-bw), 1fr))'); if (b < bars - 1) cols.push('var(--cp-bgap)'); }
  lane.textContent = '';
  lane.style.gridTemplateColumns = cols.join(' ');
  lane.dataset.bars = bars;
  for (let b = 0; b < bars; b++) {
    lane.append(h('span', { class: 'cp-barlbl', style: { gridColumn: col(b * 4) + ' / span 4' } }, 'Bar ' + (b + 1)));
    lane.append(h('span', { class: 'cp-rail', style: { gridColumn: col(b * 4) + ' / span 4' } }));
  }
  E.blockAt = new Array(n).fill(null);
  const info = new Array(n).fill(null);
  if (c) {
    for (let i = 0; i < n; i++) {
      const s = c.slots[i]; if (!s) continue;
      let j = i + 1; while (j < n && !c.slots[j]) j++;
      let blk;
      if (s.rest) blk = h('span', 'cp-block rest', h('span', 'cp-bname', 'Rest'));
      else {
        const nm = h('span', 'cp-bname'); chordLabel(nm, s.r, s.q);
        const inKey = T.chordPcs(s.r, s.q).every(pc => T.inScale(pc, BB.store.p.key, BB.store.p.mode));
        blk = h('span', 'cp-block' + (inKey ? '' : ' outside'), nm, h('span', 'cp-bnum', numeralOf(s.r, s.q)));
      }
      blk.style.gridColumn = col(i) + ' / ' + (col(j - 1) + 1);
      blk.dataset.span = j - i;
      for (let k = i; k < j; k++) { E.blockAt[k] = blk; info[k] = { start: k === i, s }; }
      lane.append(blk);
    }
  }
  E.beatEls = BB.range(n).map(i => {
    const inf = info[i], label = 'Bar ' + (Math.floor(i / 4) + 1) + ' · beat ' + (i % 4 + 1);
    let what;
    if (!inf) what = 'Empty.';
    else if (inf.s.rest) what = inf.start ? 'A rest starts here: silence until the next chord.' : 'Silence (a rest).';
    else what = fullName(inf.s.r, inf.s.q) + (inf.start ? ' starts here.' : ' keeps playing here.');
    const b = h('button', {
      class: 'cp-beat' + (i % 4 === 0 ? ' down' : ''), 'aria-label': label + ': ' + what, 'aria-pressed': 'false',
      'data-tip-title': label, 'data-tip': what + ' Click to pick this beat, then tap a chord pad to write a chord here.',
      dataset: { i: String(i) }, style: { gridColumn: String(col(i)) },
    }, h('span', 'cp-bn', String(i % 4 + 1)));
    lane.append(b);
    return b;
  });
  S.nowSlot = -1; E.nowBlock = null;
  paintSel();
}
function flashFresh() {
  const blk = S.fresh != null && E.blockAt[S.fresh];
  S.fresh = null;
  if (!blk) return;
  blk.classList.remove('fresh'); void blk.offsetWidth; blk.classList.add('fresh');
}
function paintSel() {
  const n = slotCount();
  if (S.sel != null && S.sel >= n) S.sel = null;
  const placing = S.sel != null;
  E.beatEls.forEach((b, i) => { const on = i === S.sel; b.classList.toggle('is-sel', on); b.setAttribute('aria-pressed', String(on)); });
  E.place.hidden = !placing;
  E.writing.hidden = !placing;
  E.padsWrap.classList.toggle('placing', placing);
  if (placing) { E.placeWhere.textContent = where(S.sel); E.writingWhere.textContent = where(S.sel); scrollToSlot(S.sel); }
  E.write.update();
  E.laneEmpty.hidden = placing || !BB.clipIsEmpty('chords', curClip());
}
function setSel(i) { S.sel = i == null ? null : BB.clamp(i, 0, slotCount() - 1); paintSel(); }
function scrollToSlot(i) {
  const b = E.beatEls[i], sc = E.laneScroll; if (!b) return;
  const l = b.offsetLeft, r = l + b.offsetWidth;
  if (l < sc.scrollLeft + 8) sc.scrollLeft = Math.max(0, l - 28);
  else if (r > sc.scrollLeft + sc.clientWidth - 8) sc.scrollLeft = r - sc.clientWidth + 28;
}
function paintNow(slot, chordKey) {
  if (slot !== S.nowSlot) {
    const old = E.beatEls[S.nowSlot]; if (old) old.classList.remove('now');
    if (E.nowBlock) E.nowBlock.classList.remove('playing');
    S.nowSlot = slot;
    const b = E.beatEls[slot]; if (b) b.classList.add('now');
    E.nowBlock = E.blockAt[slot] || null;
    if (E.nowBlock) E.nowBlock.classList.add('playing');
  }
  if (chordKey !== S.cur) { S.cur = chordKey; paintCur(); }
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
  const p = BB.store.p, sc = p.scenes[BB.state.scene];
  E.keyPill.textContent = T.pcName(p.key) + ' ' + T.MODES[p.mode].name.toLowerCase();
  const label = 'Scene ' + (BB.state.scene + 1);
  E.scenePill.textContent = sc && sc.name && sc.name !== label ? label + ' · ' + sc.name : label;
  E.recPill.hidden = !(TR.rec && TR.playing);
}
function ctlSummary() {
  const p = BB.store.p, inst = BB.INSTRUMENTS[p.tracks.chords.inst];
  const fl = FLAVORS.find(f => f.id === (BB.state.chordFlavor || 'triad')) || FLAVORS[0];
  const c = curClip(), st = BB.CHORD_STYLES.find(x => x.id === ((c && c.style) || BB.state.chordStyle)) || BB.CHORD_STYLES[0];
  E.ctlsVal.textContent = (inst ? inst.name : 'Sound') + ' · ' + fl.label + ' · ' + st.name;
}
function openCtls(open) {
  E.padsPanel.classList.toggle('ctls-open', open);
  E.ctlsToggle.setAttribute('aria-expanded', String(open));
}
function updateControls() {
  ctlSummary();
  E.sound.update(); E.flavor.update(); E.style.update(); E.bars.update(); E.melSeg.update(); E.write.update();
  const p = BB.store.p, sig = p.key + ':' + p.mode;
  if (sig !== S.keySig) { S.keySig = sig; E.starter.refill(); } else E.starter.update();
}
function refresh(evt) {
  evt = evt || {};
  const c = curClip();
  /* the play-style buttons show (and the pads play) the style of the clip you are editing */
  if (c && c.style && c.style !== BB.state.chordStyle) BB.setState({ chordStyle: c.style });
  paintPads();
  if (!evt.track || evt.track === 'chords' || evt.all) buildLane();
  buildMel(false);
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
  E.scenes = scenes;
  el.append(h('div', 'view-head cp-head',
    h('div', 'cp-titles', h('h2', 'view-title', 'Chords'), h('p', 'view-sub', 'Every pad is in your key, so nothing sounds wrong.')),
    sceneWrap, UI.tourButton('chords')));

  /* ---- pads panel ---- */
  E.sound = UI.instrumentSelect('chords', { key: 'S', small: true, tip: 'The instrument your chords play. Electric piano and pads are great for chords, but try a few!' });
  E.flavor = UI.seg({
    label: 'Flavor', key: 'F', small: true, options: FLAVORS,
    tip: 'Adds color to every pad at once. Simple is plain and strong; the others add an extra note for a richer sound.',
    value: () => BB.state.chordFlavor || 'triad',
    set: id => {
      BB.setState({ chordFlavor: id });
      const c = buildPadChords()[S.lastPad != null ? S.lastPad : 0];
      BB.preview.chord(c.root, c.q);
    },
  });
  E.style = UI.seg({
    label: 'Play style', key: 'D', small: true,
    options: BB.CHORD_STYLES.map(s => ({ id: s.id, label: s.name, tip: s.desc })),
    tip: 'How the notes of each chord are played: held, strummed, or in a rhythm. Rhythms follow the beat while the music plays. This also sets how the chord loop below plays.',
    value: () => { const c = curClip(); return (c && c.style) || BB.state.chordStyle || 'hold'; },
    set: setStyle,
  });
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
  E.padsWrap = h('div', { class: 'cp-pads', id: 'cp-pads' }, E.padEls);
  E.keyPill = h('span', { class: 'pill cp-keypill', 'data-tip-title': 'Your key', 'data-tip': 'The pads are built from your song’s key and scale. Change them with Key and Scale at the top; the pads follow.' });
  E.writing = h('span', { class: 'pill cp-writing', hidden: true, 'data-tip-title': 'Writing chords', 'data-tip': 'Tapping a pad now also writes it into the chord lane below. Press Done (or Esc) to just play again.' },
    h('span', { class: 'ico', html: I.edit }), 'Tap a pad to write it on ', E.writingWhere = h('b'));
  E.ctlsVal = h('span', 'cp-ct-val');
  E.ctlsToggle = h('button', { class: 'btn sm cp-ctls-toggle', 'aria-expanded': 'false', 'aria-controls': 'cp-ctls',
    'data-tip-title': 'Sound and style', 'data-tip': 'Show or hide the controls for the chord sound, flavor and play style.',
    onclick: () => openCtls(!E.padsPanel.classList.contains('ctls-open')) },
  h('span', 'lbl', 'Sound & style'), E.ctlsVal, h('span', { class: 'cp-ct-chev', 'aria-hidden': 'true' }));
  const padsPanel = E.padsPanel = h('section', { class: 'panel cp-pads-panel c-chords', id: 'cp-pads-panel', 'aria-label': 'Chord pads' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Chord pads'),
      h('p', 'hint', 'Hold a pad', h('span', 'desk-only', ' or press 1–8'), '. Outlined pads make a good next chord.'),
      h('span', 'grow'), E.writing, E.keyPill),
    E.ctlsToggle,
    h('div', { class: 'cp-ctls', id: 'cp-ctls' },
      h('div', 'cp-ctl', h('span', 'lbl', 'Sound'), E.sound),
      h('div', 'cp-ctl', h('span', 'lbl', 'Flavor'), E.flavor),
      h('div', { class: 'cp-ctl', id: 'cp-style' }, h('span', 'lbl', 'Play style'), E.style)),
    E.padsWrap);

  /* ---- chord lane panel ---- */
  E.write = UI.toggle({
    label: 'Write chords', key: 'A', icon: I.edit, cls: 'sm c-chords',
    tip: 'Turn on, then tap chord pads to write them into the lane, one bar at a time. You can also tap any beat in the lane to start there.',
    value: () => S.sel != null, set: v => setSel(v ? 0 : null),
  });
  E.bars = UI.seg({
    label: 'Bars', key: 'B', small: true,
    tip: 'How long the chord loop is. Making it longer repeats what you have, so nothing is lost.',
    options: BB.BAR_CHOICES.map(b => ({ id: b, label: String(b), tip: b === 1 ? 'A 1-bar loop' : 'A ' + b + '-bar loop' })),
    value: () => { const c = curClip(); return c ? c.bars : S.pendingBars; }, set: setBars,
  });
  E.starter = UI.select({
    label: 'Starter progressions', key: 'G', small: true, options: starterOptions,
    tip: 'Start from a famous chord progression in your key. It replaces this scene’s chords (Undo brings them back).',
    value: () => S.starter, set: applyStarter,
  });
  E.starter.classList.add('cp-starter');
  E.clear = UI.button({ label: 'Clear', key: 'C', icon: I.trash, cls: 'sm ghost', tip: 'Remove every chord from this scene’s chord loop. You can undo it.', onClick: clearClip });
  E.rest = UI.button({ label: 'Rest', key: 'H', cls: 'sm', tip: 'Put a rest (silence) on the picked beat, so the chords pause there.', onClick: restSel });
  E.erase = UI.button({ label: 'Erase', key: 'X', icon: I.trash, cls: 'sm', tip: 'Remove the chord that starts on the picked beat. The chord before it keeps playing instead. Shortcut: Delete.', onClick: eraseSel });
  E.done = UI.button({ label: 'Done', cls: 'sm primary', tip: 'Stop writing. The pads go back to just playing. Shortcut: Esc.', onClick: () => setSel(null) });
  E.place = h('div', { class: 'cp-place', hidden: true, role: 'status' },
    h('span', { class: 'cp-place-ico', html: I.edit }),
    h('span', 'cp-place-text', 'Writing on ', E.placeWhere = h('b'), '. Tap a chord pad to put it there.',
      h('span', 'desk-only cp-place-keys', ' Enter writes the last chord you played, ← → move, Esc stops.')),
    h('span', 'cp-place-btns', E.rest, E.erase, E.done));
  E.lane = h('div', { class: 'cp-lane', id: 'cp-lane' });
  E.laneScroll = h('div', 'cp-lane-scroll', E.lane);
  E.laneEmpty = h('p', { class: 'cp-lane-empty' }, 'No chords here yet. Tap a beat, then tap a pad. Or pick a starter.');
  E.lane.addEventListener('click', e => {
    const b = e.target.closest('.cp-beat'); if (!b) return;
    const i = +b.dataset.i;
    setSel(S.sel === i ? null : i);
  });
  E.scenePill = h('span', { class: 'pill', 'data-tip-title': 'Scene', 'data-tip': 'This lane edits the chords of the scene you picked at the top. Each scene can have its own progression.' });
  E.recPill = h('span', { class: 'pill cp-recpill', hidden: true, 'data-tip-title': 'Recording', 'data-tip': 'Record is on: the chords you play land in this lane in time with the beat. Undo removes a take.' }, h('i', 'cp-recdot'), 'Recording');
  const lanePanel = h('section', { class: 'panel cp-lane-panel c-chords', id: 'cp-lane-panel', 'aria-label': 'Chord progression' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Progression'), E.scenePill, E.recPill, h('span', 'grow'),
      h('div', 'cp-lane-tools', E.write, h('span', 'cp-bars', h('span', 'lbl', 'Bars'), E.bars), E.starter, E.clear)),
    E.place,
    h('div', 'cp-lane-wrap', E.laneScroll, E.laneEmpty),
    h('p', 'hint cp-lane-hint', 'Each chord lasts until the next one starts. Tap any beat to change what plays there.'));

  /* ---- melody panel ---- */
  E.melSeg = UI.seg({
    label: 'Melody notes', key: 'N', small: true,
    tip: 'How many different notes the strip uses. 5 notes is the easiest: almost anything you play sounds good.',
    options: [
      { id: 'penta', label: '5 notes', tip: 'The pentatonic scale: 5 notes that always sound good together. Hard to go wrong!' },
      { id: 'scale', label: '7 notes', tip: 'The full scale of your key: all 7 notes. More choice, a little more care needed.' },
    ],
    value: () => S.melMode,
    set: id => { S.melMode = id; BB.storage.set(STORE_MEL, id); buildMel(true); },
  });
  E.mel = h('div', { class: 'cp-mel', id: 'cp-mel' });
  UI.glide(E.mel, '.cp-mbar', b => TR.noteOn('melody', +b.dataset.midi, 0.85), b => TR.noteOff('melody', +b.dataset.midi));
  const melPanel = h('section', { class: 'panel cp-mel-panel c-melody', id: 'cp-mel-panel', 'aria-label': 'Melody strip' },
    h('div', 'panel-head',
      h('h3', null, h('i', 'sw'), 'Melody'),
      h('p', 'hint', 'Slide across the bars', h('span', 'desk-only', ' or press Q to P'), '.'),
      h('span', 'grow'), E.melSeg),
    E.mel);

  el.append(h('div', 'cp-grid', padsPanel, lanePanel, melPanel));

  /* blur native selects after a choice so number keys and letters reach the pads again */
  [E.sound, E.starter].forEach(s => s.select.addEventListener('change', () => s.select.blur()));

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
    if ('chordFlavor' in d) { paintPads(); E.flavor.update(); }
    if ('chordStyle' in d) E.style.update();
    if ('chordFlavor' in d || 'chordStyle' in d) ctlSummary();
  });
  BB.on('transport', d => {
    if (d.rec && S.sel != null) setSel(null); // recording writes chords itself; don't write twice
    paintHeader();
  });

  /* Esc leaves "write" mode before it would stop playback */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || BB.state.view !== 'chords' || S.sel == null) return;
    if ((BB.tutorial && BB.tutorial.active) || document.querySelector('.sheet-wrap') || (BB.controls && BB.controls.sel)) return;
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault(); e.stopImmediatePropagation(); setSel(null);
  });
  /* Pads and melody bars are played by holding them, so on touch screens a long press should
     play, not pop up a tooltip. Mouse hover tooltips stay. */
  window.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const t = e.target && e.target.closest && e.target.closest('.cp-pad, .cp-mbar');
    if (!t || !t.hasAttribute('data-tip')) return;
    const tip = t.getAttribute('data-tip'); t.removeAttribute('data-tip');
    const back = () => {
      window.removeEventListener('pointerup', back, true); window.removeEventListener('pointercancel', back, true);
      if (!t.hasAttribute('data-tip')) t.setAttribute('data-tip', tip);
    };
    window.addEventListener('pointerup', back, true); window.addEventListener('pointercancel', back, true);
  }, true);

  refresh({ all: true });
}

/* ================= keyboard ================= */
function keydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const code = e.code;
  const d = /^Digit([1-8])$/.exec(code);
  if (d) { if (!e.repeat) press('k' + code, +d[1] - 1); return true; }
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
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (S.sel == null) return false;
    const n = slotCount(), step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 4 : 1);
    setSel(((S.sel + step) % n + n) % n);
    return true;
  }
  if (e.key === 'Enter') {
    if (S.sel == null) return false;
    if (S.lastPlayed) placeAt(S.sel, S.lastPlayed.root, S.lastPlayed.q, true);
    else UI.toast('Play a chord pad first, then press Enter to write it here.');
    return true;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.sel == null) return false;
    eraseSel();
    return true;
  }
  return false;
}
function keyup(e) {
  if (/^Digit[1-8]$/.test(e.code)) release('k' + e.code);
  const m = S.keyMidi[e.code];
  if (m != null) { delete S.keyMidi[e.code]; TR.noteOff('melody', m); }
}

/* ================= tutorial ================= */
function tryPads() { return T.isMinorish(BB.store.p.mode) ? [0, 5, 2, 6] : [5, 3, 0, 4]; }
const tutorial = [
  { target: '#cp-pads-panel', view: 'chords', title: 'What is a chord?',
    text: 'A <b>chord</b> is a few notes played together. Chords set the mood of a song, and the melody sits on top. Each pad here plays one chord.' },
  { target: '#cp-pads', view: 'chords', title: 'You can’t play a wrong chord',
    text: 'The pads are built from your song’s <b>key</b> and <b>scale</b> (set at the top), so they all fit together. Hold a pad, or press <b>1 to 8</b> on your keyboard. Pad 8 is <b>borrowed</b> from a related key for a spicy twist.' },
  { target: () => E.padEls[0] && E.padEls[0].querySelector('.cp-num'), view: 'chords', title: 'What the small numbers mean',
    text: 'The <b>I, ii, IV, V…</b> are roman numerals: each chord’s place in the key. Capitals are major (bright), lowercase are minor (darker). Musicians describe songs this way, like “I–V–vi–IV”.' },
  { target: '#cp-pads', view: 'chords', title: 'Good next chords',
    before: () => { if (S.lastPad == null) { S.lastPad = 0; paintNext(); } },
    text: 'After you play a chord, 2 or 3 pads get a soft <b>outline</b> and say <b>Good next</b>. Those moves sound natural. Follow them or ignore them; nothing here sounds wrong.' },
  { target: '#cp-style', view: 'chords', title: 'Play styles', before: () => openCtls(true),
    text: '<b>Hold</b> rings out, <b>Strum</b> rolls like a guitar, and the others play a rhythm in time with the beat (press Play to hear them). <b>Flavor</b> adds color: 7ths sound jazzy, Sus floats, Add9 sparkles.' },
  { target: '#cp-lane-panel', view: 'chords', title: 'Write a progression',
    text: 'This lane is the chord loop of the scene you are editing. <b>Tap a beat</b>, then <b>tap pads</b>: each chord is written in and the next bar is picked for you. Press <b>Done</b> (or Esc) to stop, or pick a <b>Starter</b> to begin from a classic.' },
  { target: '#cp-mel-panel', view: 'chords', title: 'The melody strip',
    text: 'These bars play the <b>Melody</b> track using only notes from your scale. Slide across them, or press <b>Q to P</b>. Turn on <b>Record</b> at the top to keep what you play.' },
  { target: '#cp-pads', view: 'chords', title: 'Try this',
    get text() {
      const ids = tryPads(), pads = S.pads.length ? S.pads : buildPadChords();
      const nums = ids.map(i => numeralOf(pads[i].root, pads[i].q)).join('–');
      return 'Press <b>Play</b>, then hold pads <b>' + ids.map(i => i + 1).join(', ') + '</b> for one bar each. That is ' + nums + ', a progression behind countless hits. Like it? Tap <b>Write chords</b> and play them again to save it.';
    } },
];

BB.views.register({
  id: 'chords', title: 'Chords', letterMode: 'notes',
  mount, keydown, keyup, tutorial,
  render(evt) { refresh(evt); },
  show() { refresh({ all: true }); },
  hide() { S.held = null; S.keyMidi = {}; },
  step(e) {
    const r = e && e.pos && e.pos.chords, on = !!(r && r.scene === BB.state.scene);
    const ch = on ? BB.chordAt(curClip(), r.pos) : null;
    paintNow(on ? Math.floor(r.pos / 4) : -1, ch ? ckey(ch.root, ch.q) : null);
  },
});
})();

/* Beat Board · Keys screen
   A playable piano plus a piano-roll note editor for the note tracks (bass, melody, keys).
   It edits the clip at (BB.state.noteTrack, BB.state.scene).
   Layout: the screen itself holds the track and scene, the sound (instrument, volume and effects) and two cards.
   Each card opens a full-screen workspace: the note editor (tools + piano roll) and the piano (playing live). */
(function () {
'use strict';
const BB = window.BB, { h, clamp } = BB, UI = BB.ui, TR = BB.transport, T = BB.theory, C = BB.controls, I = UI.ICONS;

const VIEW = 'keys';
const TRACKS = ['bass', 'melody', 'keys'];
/* Musical typing: A W S E D F T G Y H U J K O L P ; ' play C up to F of the next octave */
const CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const LETTERS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];
const BLACK = new Set([1, 3, 6, 8, 10]);
const RULER_H = 22;
const DRAG_WINDOW = 10 * 60 * 1000; // a drag stays one undo step however long it takes

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  up: svg('<path d="M12 19V6m0 0-5.5 5.5M12 6l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  down: svg('<path d="M12 5v13m0 0-5.5-5.5M12 18l5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  erase: svg('<path d="M9 20h11M4.8 14.2l8.4-8.4a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 18H8.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="m9 10 5 5" stroke="currentColor" stroke-width="2"/>'),
  snap: svg('<path d="M5 4v16M12 4v16M19 4v16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/><rect x="5" y="9" width="7" height="6" rx="1.6" fill="currentColor"/>'),
  scale: svg('<circle cx="5.5" cy="17" r="2.4" fill="currentColor"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><circle cx="18.5" cy="7" r="2.4" fill="currentColor"/>'),
  more: svg('<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>'),
  info: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/>'),
};

const LENGTHS = [
  { id: 1, label: '1/16', tip: 'A very short note, a quarter of a beat. Good for quick runs and fast riffs.' },
  { id: 2, label: '1/8', tip: 'Half a beat. The most common length for melodies and bass lines. A great place to start.' },
  { id: 4, label: '1/4', tip: 'One full beat, like counting 1, 2, 3, 4.' },
  { id: 8, label: '1/2', tip: 'Two beats. Nice for slow, singing notes.' },
  { id: 16, label: '1 bar', tip: 'A whole bar (four beats). Great for long bass notes and held pads.' },
];
const TRACK_TIPS = {
  bass: 'Low notes that hold the song together. Usually one or two notes for each chord.',
  melody: 'The tune people hum. Usually the highest and catchiest part.',
  keys: 'Extra parts that fill out the sound: arpeggios, riffs and counter-melodies.',
};
const BAR_TIPS = { 1: 'A short 1-bar loop that repeats often.', 2: 'A 2-bar loop. Room for a question and an answer.', 4: '4 bars: room for a full phrase over a 4-chord progression.', 8: '8 bars: a long part, like a whole verse.' };

/* ---------- view state (not part of the song) ---------- */
const S = {
  root: null,
  tool: 'draw',
  len: BB.storage.get('beatboard.keys.len', 2),
  inKey: BB.storage.get('beatboard.keys.inKey', true),
  more: false,
  pendingBars: {},    // 'track:scene' -> bars for a clip that does not exist yet
  starter: {},        // 'track:scene' -> starter id last applied (lets arrows browse starters)
  rows: [], rowSig: '', rulerSig: '',
  sw: 20, rh: 18, kw: 52, steps: 32,
  octs: 2, prows: 1,  // piano: octaves per row, rows (phones stack two rows of one octave)
  sel: null,          // {s, m} of the selected note
  delShown: false,    // floating delete button (touch)
  drag: null, tap: null,
  keyHeld: new Map(), // keyboard code -> {track, midi} so releases always match their press
  lit: new Set(),     // 'track:midi' held live (piano, keyboard, MIDI)
  sounding: new Set(),// midi notes the playhead is playing
  ctx: '',            // track|scene last scrolled into view
  userScrollT: 0,
  phEl: null,
};
const R = {};         // element refs

/* ---------- helpers ---------- */
const track = () => (TRACKS.includes(BB.state.noteTrack) ? BB.state.noteTrack : 'melody');
const scene = () => BB.state.scene;
const clip = () => BB.store.clip(track(), scene());
const ckey = () => track() + ':' + scene();
const color = t => BB.TRACK[t || track()].color;
const stepSec = () => 60 / BB.store.p.bpm / 4;
const isActive = () => BB.state.view === VIEW;
const same = (a, b) => a.s === b.s && a.m === b.m && a.d === b.d;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function defaultBars() {
  const p = BB.store.p, sc = scene();
  let b = 0;
  for (const t of BB.TRACKS) { const c = p.clips[t.id][sc]; if (c && !BB.clipIsEmpty(t.id, c)) b = Math.max(b, c.bars); }
  return b ? (BB.BAR_CHOICES.find(x => x >= b) || 8) : 2;
}
const bars = () => { const c = clip(); return c ? c.bars : (S.pendingBars[ckey()] || defaultBars()); };
/* Octaves the piano can start on for a track (keeps the keys inside the track's useful range) */
function octRange(t) { const [lo, hi] = BB.TRACK[t].range; return [Math.floor(lo / 12) - 1, Math.floor((hi - 12) / 12) - 1]; }
function octave(t = track()) { const [a, b] = octRange(t), o = BB.state.octave[t]; return clamp(o != null ? o : BB.TRACK[t].octave, a, b); }
const info = () => ({ track: track(), scene: scene() });
function audition(m, steps = 2, t = track()) { BB.preview.note(t, m, 0.8, clamp(steps * stepSec(), 0.18, 0.6)); }
function launchIfPlaying(t, sc) { if (TR.playing && TR.mode === 'loop' && !TR.isLaunched(t, sc) && BB.store.clip(t, sc)) TR.launchClip(t, sc); }
const undoToast = text => UI.toast(text, { action: { label: 'Undo', onClick: () => { const l = BB.store.undo(); if (l) UI.toast('Undid: ' + l); } }, ms: 4200 });
const tip = (text, title) => ({ 'data-tip': text, 'data-tip-title': title });
let infoTimer = 0;
function infoButton(label, text, title) {
  return h('button', Object.assign({ class: 'kx-info', 'aria-label': label, html: ICON.info, onclick: e => {
    const el = e.currentTarget; BB.tooltip.show(el); clearTimeout(infoTimer); infoTimer = setTimeout(() => BB.tooltip.hide(), 5000);
  } }, tip(text, title)));
}
const field = (label, cls, ...kids) => h('div', 'kx-field' + (cls ? ' ' + cls : ''), h('span', 'lbl', label), h('div', 'kx-field-ctl', kids));
/* Native selects keep focus after a mouse pick, which would swallow the piano letters. Let go of it. */
function releaseFocusAfterPick(selWrap) {
  const sel = selWrap.select; let pointerAt = 0;
  sel.addEventListener('pointerdown', () => { pointerAt = Date.now(); });
  sel.addEventListener('change', () => { if (Date.now() - pointerAt < 20000) setTimeout(() => sel.blur(), 0); });
}

/* Rows of the roll, top (high) to bottom (low). "Only notes in key" folds out the other notes,
   but any pitch that already has a note always keeps its row so nothing disappears. */
function computeRows() {
  const t = track(), p = BB.store.p, c = clip();
  let [lo, hi] = BB.TRACK[t].range;
  const used = new Set();
  if (c) for (const n of c.notes) { used.add(n.m); lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); }
  const rows = [];
  for (let m = hi; m >= lo; m--) if (!S.inKey || T.inScale(m % 12, p.key, p.mode) || used.has(m)) rows.push(m);
  return rows;
}

/* ================= building the screen ================= */
function mount(el) {
  const root = S.root = h('div', 'kx c-' + color());
  el.append(root);

  /* --- header --- */
  R.sub = h('p', 'view-sub', '');
  const head = h('div', 'view-head kx-head', h('h2', 'view-title', 'Keys'), R.sub, h('span', 'grow'), UI.tourButton(VIEW));
  R.trackSeg = UI.seg({
    label: 'Track', key: 'P',
    tip: 'Which part you are working on. Each one has its own sound and its own notes in every scene.',
    options: TRACKS.map(id => ({ id, label: BB.TRACK[id].name, color: BB.TRACK[id].color, tip: TRACK_TIPS[id] })),
    value: track, set: id => { if (id !== track()) BB.setState({ noteTrack: id }); },
  });
  R.trackSeg.classList.add('kx-tracks');
  R.scenes = UI.scenePicker({ track: track, key: 'S' });
  const scenesWrap = h('div', 'kx-scenes', R.scenes);
  const context = h('div', 'kx-context', R.trackSeg, scenesWrap);

  /* --- sound panel (the screen itself) --- */
  R.inst = {};
  for (const t of TRACKS) { R.inst[t] = UI.instrumentSelect(t, { key: 'I', small: true }); releaseFocusAfterPick(R.inst[t]); }
  R.knobs = UI.trackKnobs(track, { volKey: 'U' });
  const soundPanel = h('section', { class: 'panel kx-sound', id: 'kx-sound', 'aria-label': 'Sound' },
    h('div', 'panel-head', h('h3', null, h('i', 'sw'), 'Sound'), R.soundName = h('span', 'pill kx-sound-name'), h('p', 'hint kx-desk', 'Change these while the music plays to hear the difference.')),
    h('div', 'kx-sound-row', field('Instrument', 'kx-f-inst', TRACKS.map(t => R.inst[t])), R.knobs));

  /* --- card: the note editor --- */
  R.status = h('span', 'pill kx-status', h('i', 'sw'), h('span', 'kx-status-text', ''));
  R.cardStatus = h('span', 'pill kx-status', h('i', 'sw'), h('span', 'kx-status-text', ''));
  R.starter = UI.select({
    label: 'Starter part', key: 'G', small: true,
    tip: 'A ready-made part that fits your chords. Pick one to fill this scene, then change the notes however you like. Arrow keys flip through them.',
    options: () => [{ id: '', label: 'Starter parts…' }].concat(BB.library.itemsFor(track()).map(it => ({ id: it.id, label: it.name, group: it.group }))),
    value: starterValue, set: applyStarter,
  });
  R.starter.classList.add('kx-starter');
  releaseFocusAfterPick(R.starter);
  R.miniNotes = h('div', 'kx-mini-notes');
  R.miniPh = h('i', 'kx-mini-ph');
  R.miniEmpty = h('span', 'kx-mini-empty', '');
  R.mini = h('div', { class: 'kx-mini', 'aria-hidden': 'true' }, R.miniNotes, R.miniPh, R.miniEmpty);
  R.openEd = UI.button({ label: 'Edit notes', key: 'E', icon: I.edit, cls: 'colored ws-go',
    tip: 'Open the note editor full screen: draw, move and stretch notes on a piano roll. Close it (or press Esc) to come back.', onClick: () => R.wsEd.open({ from: R.openEd }) });
  const edCard = UI.wsCard({ id: 'kx-ed-card', title: 'Note editor', cls: 'kx-card kx-ed-card', pill: R.cardStatus,
    preview: R.mini, onOpen: () => R.wsEd.open({ from: R.openEd }), ariaLabel: 'Open the note editor', tipTitle: 'Your notes',
    tip: 'A picture of this part: each bar is a note, higher notes sit higher. Tap it to open the note editor.',
    foot: [R.starter], button: R.openEd });

  /* --- card: the piano --- */
  R.miniPiano = h('div', { class: 'pkeys kx-mini-piano', 'aria-hidden': 'true' });
  R.openPlay = UI.button({ label: 'Play piano', key: 'A', icon: I.tap, cls: 'colored ws-go',
    tip: 'Open a big piano full screen to play freely. Turn on Record to add what you play to the loop.', onClick: () => R.wsPlay.open({ from: R.openPlay }) });
  const playCard = UI.wsCard({ id: 'kx-play-card', title: 'Piano', cls: 'kx-card kx-play-card ws-card-side',
    preview: h('div', 'kx-mini-piano-wrap', R.miniPiano), onOpen: () => R.wsPlay.open({ from: R.openPlay }), ariaLabel: 'Open the piano', tipTitle: 'Piano',
    tip: 'A playable piano for freestyling. Tap here to open it big.',
    foot: [h('p', 'hint kx-card-hint', h('span', 'kx-desk', 'Your computer keys play it from here too.'), h('span', 'kx-phone', 'Freestyle, or record a take.'))], button: R.openPlay });

  root.append(head, context, soundPanel, h('div', 'kx-cards', edCard, playCard));

  /* --- workspace: the note editor --- */
  const editorInfo = infoButton('How to edit notes',
    'Click an empty spot to add a note. Drag a note to move it, drag its right edge to make it longer. Double-click or right-click a note to delete it. On a phone: tap to add, tap a note to get a delete button. A selected note moves with the arrow keys, and Delete removes it.', 'Drawing notes');
  R.tool = UI.seg({
    label: 'Tool', key: 'D', small: true,
    tip: 'Draw adds and moves notes. Erase removes the notes you click or drag across.',
    options: [
      { id: 'draw', label: 'Draw', icon: I.edit, tip: 'Click an empty spot to add a note. Drag a note to move it, or drag its right edge to make it longer.' },
      { id: 'erase', label: 'Erase', icon: ICON.erase, tip: 'Click or drag across notes to remove them. Tip: double-click or right-click also deletes a note.' },
    ],
    value: () => S.tool, set: v => { S.tool = v; hideGhost(); syncRootClass(); },
  });
  R.len = UI.seg({
    label: 'Note length', key: 'N', small: true,
    tip: 'How long each new note you draw lasts. Short notes sound bouncy, long ones sound smooth. Notes also snap to this grid (up to one beat).',
    options: LENGTHS, value: () => S.len, set: v => { S.len = v; BB.storage.set('beatboard.keys.len', v); },
  });
  R.inKey = UI.toggle({
    label: 'Only notes in key', key: 'Y', icon: ICON.scale, cls: 'sm kx-inkey',
    tip: 'Shows only the notes that belong to your song’s key, so everything you draw sounds right together. Turn it off to see all 12 notes.',
    value: () => S.inKey, set: v => { S.inKey = v; BB.storage.set('beatboard.keys.inKey', v); renderRoll({ scroll: true }); },
  });
  R.inKey.querySelector('.btn-label').replaceChildren(h('span', 'kx-wide', 'Only notes in key'), h('span', 'kx-narrow', 'In key'));
  R.bars = UI.seg({
    label: 'Clip length', key: 'B', small: true,
    tip: 'How many bars this part lasts before it loops. Making it longer copies what you have, so you can change the copy.',
    options: BB.BAR_CHOICES.map(b => ({ id: b, label: String(b), tip: BAR_TIPS[b] })),
    value: bars, set: setBars,
  });
  const octBtn = dir => h('button', Object.assign({ class: 'btn sm', 'aria-label': 'Move all notes ' + (dir > 0 ? 'up' : 'down') + ' an octave', onclick: () => shiftOctave(dir) },
    tip(dir > 0 ? 'Moves every note up 12 steps. Same tune, higher and brighter.' : 'Moves every note down 12 steps. Same tune, lower and deeper.', 'Octave ' + (dir > 0 ? 'up' : 'down'))),
  h('span', { class: 'ico', html: dir > 0 ? ICON.up : ICON.down }), 'Oct');
  R.octDown = octBtn(-1); R.octUp = octBtn(1);
  R.octMove = h('div', Object.assign({ class: 'kx-octmove', role: 'group', 'aria-label': 'Move all notes by an octave' },
    tip('Moves every note in this part up or down one octave (12 steps). The tune stays the same, it just sounds higher or lower.', 'Move all notes')), R.octDown, R.octUp);
  C.add(R.octMove, { key: 'O', label: 'Move all notes', adjust: dir => shiftOctave(dir), text: octMoveText });
  R.quant = UI.button({ label: 'Quantize', key: 'Q', icon: ICON.snap, cls: 'sm', onClick: quantize,
    tip: 'Snaps every note to the nearest 1/8 note (or beat, when Note length is 1/4 or longer), so a loosely played part sounds tight and in time.' });
  R.clear = UI.button({ label: 'Clear', key: 'C', icon: I.trash, cls: 'sm ghost danger', onClick: clearClip,
    tip: 'Removes every note of this part in this scene. You can undo it.' });
  R.moreBtn = UI.toggle({ label: 'More', icon: ICON.more, cls: 'sm kx-more-btn',
    tip: 'More tools: clip length, octave moves, quantize and clear.',
    value: () => S.more, set: v => { S.more = v; R.tools.classList.toggle('open', v); } });

  R.tools = h('div', 'kx-tools',
    field('Tool', null, R.tool),
    field('Note length', 'kx-f-len', R.len),
    field('Helper', null, R.inKey),
    field('Clip · bars', 'kx-secondary', R.bars),
    field('All notes', 'kx-secondary', R.octMove, R.quant, R.clear),
    h('div', 'kx-more-wrap', R.moreBtn));

  /* the roll */
  R.corner = h('div', 'kx-corner', h('i', 'sw'));
  R.ticks = h('div', 'kx-ticks');
  R.ruler = h('div', 'kx-ruler', R.ticks);
  R.keycol = h('div', { class: 'kx-keycol', role: 'group', 'aria-label': 'Note names. Click one to hear it.' });
  R.rowsEl = h('div', 'kx-rows');
  R.lines = h('div', 'kx-lines');
  R.notes = h('div', 'kx-notes');
  R.ghost = h('div', 'kx-ghost');
  R.ph = h('div', 'kx-ph');
  R.del = h('button', { class: 'kx-del', 'aria-label': 'Delete this note', html: I.trash, hidden: true, onclick: deleteSelected });
  R.grid = h('div', { class: 'kx-grid', role: 'application', 'aria-label': 'Piano roll. Click to add notes, drag to move them.' }, R.rowsEl, R.lines, R.notes, R.ghost, R.ph, R.del);
  R.inner = h('div', 'kx-inner', R.corner, R.ruler, R.keycol, R.grid);
  R.roll = h('div', 'kx-roll', R.inner);
  R.empty = h('div', 'kx-empty', h('div', null, h('b', null, 'No notes here yet'), h('span', 'kx-empty-text', '')));
  R.rollWrap = h('div', 'kx-rollwrap', R.roll, R.empty);

  const trackSel = () => {
    const sel = UI.select({ label: 'Track', key: 'P', small: true, tip: 'Which part you are working on: Bass, Melody or Keys.',
      options: TRACKS.map(id => ({ id, label: BB.TRACK[id].name })), value: track, set: id => { if (id !== track()) BB.setState({ noteTrack: id }); } });
    sel.classList.add('kx-track-sel'); releaseFocusAfterPick(sel);
    return sel;
  };
  R.edTrack = trackSel();
  R.wsEd = UI.workspace({ id: 'keys-editor', title: 'Notes', label: 'Note editor', cls: 'kx-ws kx-edws ws-tight',
    closeTip: 'Close the note editor and go back to the Keys screen. Shortcut: Esc.',
    head: [editorInfo, R.status, h('span', 'grow'), R.edTrack, UI.sceneSelect({ track: track, key: 'S' })],
    onOpen: () => { S.lastW = 0; requestAnimationFrame(() => renderAll({ scroll: true })); },
    onClose: () => { S.drag = null; S.tap = null; S.sel = null; S.delShown = false; hideGhost(); R.del.hidden = true; } });
  R.wsEd.body.append(R.tools, R.rollWrap);
  el.append(R.wsEd.el);

  /* --- workspace: the piano --- */
  R.instPlay = {};
  for (const t of TRACKS) { R.instPlay[t] = UI.instrumentSelect(t, { key: 'I', small: true }); releaseFocusAfterPick(R.instPlay[t]); }
  R.oct = UI.stepper({
    label: 'Octave', key: 'Z', min: 0, max: 8, fmt: v => 'C' + v,
    tip: 'Which notes the piano and your computer keys play. Lower numbers sound deeper, higher ones brighter. Shortcut: Z and X.',
    value: () => octave(), set: v => setOctave(v),
  });
  const pianoInfo = infoButton('About the piano',
    'Click, tap or slide across the keys to play. On a computer, the letters on the keys play them too. Keys with a dot are in your song’s key; the big dot is the home note. Turn on Record to add what you play to the loop.', 'Piano');
  R.piano = h('div', { class: 'kx-piano', role: 'group', 'aria-label': 'Piano. Play it with A W S E D F T G Y H U J K on your keyboard. Z and X change the octave.', 'data-no-press-tip': '' });
  R.hint = h('p', 'hint kx-hint', h('span', 'kx-recdot', ''),
    h('span', null, 'Turn on Record', h('span', 'kx-desk', ' (', h('kbd', null, 'R'), ')'), ' at the top and play', h('span', 'kx-desk', ' the keys or your computer keyboard'), '. Notes snap to the grid.'));
  R.playTrack = trackSel();
  R.wsPlay = UI.workspace({ id: 'keys-piano', title: 'Piano', cls: 'kx-ws kx-playws ws-tight',
    closeTip: 'Close the piano and go back to the Keys screen. Shortcut: Esc.',
    head: [pianoInfo, h('span', 'grow'), R.playTrack, UI.sceneSelect({ track: track, key: 'S' })],
    onOpen: () => { S.pianoSig = ''; requestAnimationFrame(() => { sizePiano(); renderPiano(); }); } });
  R.wsPlay.body.append(
    h('div', 'kx-piano-ctl',
      h('div', 'kx-inline', h('span', 'lbl', 'Sound'), TRACKS.map(t => R.instPlay[t])),
      h('div', 'kx-inline', h('span', 'lbl', 'Octave'), R.oct),
      h('span', 'grow'),
      h('p', 'hint kx-keyhint kx-desk', h('kbd', null, 'A'), '–', h('kbd', null, "'"), ' play notes · ', h('kbd', null, 'Z'), ' ', h('kbd', null, 'X'), ' octave')),
    R.piano, R.hint);
  el.append(R.wsPlay.el);

  /* --- behaviour --- */
  wireRoll();
  UI.glide(R.piano, '.pkey', pianoOn, pianoOff);
  UI.glide(R.keycol, '.kx-key', el => { const m = +el.dataset.midi; audition(m, 3); el.classList.add('aud'); }, el => el.classList.remove('aud'));
  R.roll.addEventListener('wheel', () => { S.userScrollT = Date.now(); }, { passive: true });
  R.roll.addEventListener('touchstart', () => { S.userScrollT = Date.now(); }, { passive: true });

  new ResizeObserver(() => {
    if (!isActive() || !R.roll.clientWidth) return;
    if (R.roll.clientWidth !== S.lastW) { S.lastW = R.roll.clientWidth; renderRoll(); }
  }).observe(R.roll);
  new ResizeObserver(() => { if (sizePiano()) renderPiano(); }).observe(R.piano);

  BB.on('ui', d => {
    if (!isActive()) return;
    if ('scene' in d && !TR.playing && TR.mode === 'loop') TR.launchScene(BB.state.scene); // Play / Record use the scene on screen
    if ('noteTrack' in d || 'scene' in d) { S.sel = null; S.delShown = false; S.drag = null; renderAll(); }
    else if ('octave' in d) { R.oct.update(); renderPiano(); }
  });
  BB.on('note', onNoteEvent);
  /* click anywhere outside the roll lets go of the selected note */
  document.addEventListener('pointerdown', e => {
    if (!S.sel || !isActive() || R.grid.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.kx-tools, .hk, #hud, .toast')) return;
    S.sel = null; S.delShown = false; renderNotes();
  }, true);
  window.addEventListener('blur', () => S.keyHeld.clear());

  S.octs = BB.isMobile() ? 1 : 2; S.prows = BB.isMobile() ? 2 : 1;
  renderAll();
}
/* Phones stack two one-octave rows; wider screens show one row of two (or three) octaves. True if it changed. */
function sizePiano() {
  const w = R.piano.clientWidth; if (!w) return false;
  const rows = w < 560 ? 2 : 1, octs = w < 560 ? 1 : w < 1100 ? 2 : 3;
  if (rows === S.prows && octs === S.octs) return false;
  S.prows = rows; S.octs = octs;
  return true;
}
const edOpen = () => !!(R.wsEd && R.wsEd.isOpen());

function syncRootClass() {
  const c = color();
  S.root.className = 'kx c-' + c;
  for (const w of [R.wsEd, R.wsPlay]) w.setColor(c);
  R.wsEd.el.classList.toggle('kx-erasing', S.tool === 'erase');
  R.wsEd.el.classList.toggle('kx-dragging', !!(S.drag && S.drag.type !== 'erase'));
}

/* ================= rendering ================= */
function renderAll(opts = {}) {
  syncHeader();
  const ctx = ckey();
  renderRoll({ scroll: opts.scroll || ctx !== S.ctx });
  renderPiano();
}

function syncHeader() {
  const t = track(), tr = BB.TRACK[t], p = BB.store.p, c = clip(), n = c ? c.notes.length : 0;
  syncRootClass();
  R.sub.textContent = tr.name + ': ' + tr.desc.charAt(0).toLowerCase() + tr.desc.slice(1) + '. Open the note editor to draw notes, or the piano to play.';
  R.trackSeg.update(); R.scenes.update(); R.edTrack.update(); R.playTrack.update(); R.knobs.update();
  for (const id of TRACKS) { R.inst[id].hidden = id !== t; R.instPlay[id].hidden = id !== t; }
  R.inst[t].update(); R.instPlay[t].update();
  R.soundName.textContent = tr.name;
  if (R.starter.dataset.track !== t) { R.starter.dataset.track = t; R.starter.refill(); } else R.starter.update();
  R.tool.update(); R.len.update(); R.inKey.update(); R.bars.update(); R.oct.update(); R.moreBtn.update();
  const sceneName = p.scenes[scene()].name;
  syncStatusOnly();
  R.status.setAttribute('data-tip', 'You are editing the ' + tr.name + ' part of scene ' + (scene() + 1) + ' (' + sceneName + '). Pick another scene above to edit that one.');
  R.status.setAttribute('data-tip-title', tr.name + ' in ' + sceneName);
  for (const b of [R.octDown, R.octUp, R.quant, R.clear]) { b.classList.toggle('kx-dim', !n); b.setAttribute('aria-disabled', !n); }
  R.octMove.classList.toggle('kx-dim', !n);
}

function renderRoll(opts = {}) {
  if (!S.root) return;
  const mobile = BB.isMobile(), steps = bars() * 16;
  const rows = S.drag ? S.drag.rows : computeRows();
  S.kw = mobile ? 46 : 54;
  S.rh = mobile ? 26 : (S.inKey ? 19 : 16);
  const avail = (R.roll.clientWidth || 900) - S.kw - 1;
  S.sw = Math.max(mobile ? 16 : 14, Math.floor(avail / steps));
  S.steps = steps;
  const gw = S.sw * steps, gh = rows.length * S.rh;
  const st = R.inner.style;
  st.setProperty('--sw', S.sw + 'px'); st.setProperty('--rh', S.rh + 'px'); st.setProperty('--kw', S.kw + 'px');
  st.setProperty('--gw', gw + 'px'); st.setProperty('--gh', gh + 'px');
  R.rollWrap.style.setProperty('--kw', S.kw + 'px');

  const p = BB.store.p, t = track();
  const sig = [t, p.key, p.mode, rows.join(',')].join('|');
  if (sig !== S.rowSig) {
    S.rowSig = sig;
    R.rowsEl.innerHTML = ''; R.keycol.innerHTML = '';
    for (const m of rows) {
      const pc = m % 12, inKey = T.inScale(pc, p.key, p.mode), home = pc === p.key;
      const cls = (inKey ? ' in' : ' out') + (home ? ' home' : '') + (pc === 0 ? ' oct' : '');
      R.rowsEl.append(h('div', 'kx-row' + cls));
      const k = h('div', { class: 'kx-key' + cls + (BLACK.has(pc) ? ' blk' : ''), dataset: { midi: m } }, T.noteName(m));
      if (S.lit.has(t + ':' + m)) k.classList.add('lit');
      R.keycol.append(k);
    }
  }
  S.rows = rows;
  const rsig = steps + ':' + S.sw;
  if (rsig !== S.rulerSig) {
    S.rulerSig = rsig;
    R.ticks.innerHTML = '';
    for (let b = 0; b < steps / 16; b++) R.ticks.append(h('span', { class: 'kx-bar', style: { left: b * 16 * S.sw + 'px' } }, String(b + 1)));
  }
  renderNotes();
  if (opts.scroll) { S.ctx = ckey(); requestAnimationFrame(autoScroll); }
}

function renderNotes() {
  const c = clip(), rowOf = new Map(S.rows.map((m, i) => [m, i]));
  R.notes.innerHTML = '';
  S.noteEls = [];
  let selFound = false;
  const notes = c ? c.notes : [];
  notes.forEach((n, i) => {
    const r = rowOf.get(n.m); if (r == null) return;
    const w = n.d * S.sw;
    const el = h('div', { class: 'kx-note', dataset: { i, s: n.s, m: n.m, d: n.d }, 'aria-label': T.noteName(n.m) + ', step ' + (n.s + 1) });
    el.style.cssText = `left:${n.s * S.sw + 1}px;top:${r * S.rh + 1}px;width:${Math.max(4, w - 2)}px;height:${S.rh - 2}px;--v:${n.v}`;
    if (w >= 30 && S.rh >= 16) el.append(h('span', 'kx-nn', T.noteName(n.m)));
    el.append(h('span', 'rz'));
    if (S.sel && S.sel.s === n.s && S.sel.m === n.m) selFound = true;
    if (S.sounding.has(i)) el.classList.add('on');
    R.notes.append(el);
    S.noteEls.push({ el, i, s: n.s, d: n.d, m: n.m });
  });
  if (S.sel && !selFound && !S.drag) { S.sel = null; S.delShown = false; }
  markSel();
  const empty = !notes.length;
  R.empty.hidden = !empty || !!S.drag;
  if (empty) R.empty.querySelector('.kx-empty-text').textContent = BB.isMobile()
    ? 'Tap the grid to add a note, pick a Starter part, or turn on Record and play the piano.'
    : 'Click the grid to add a note, pick a Starter part, or turn on Record and play the piano.';
  syncStatusOnly();
}
function syncStatusOnly() {
  const c = clip(), n = c ? c.notes.length : 0;
  const text = BB.store.p.scenes[scene()].name + ' · ' + plural(bars(), 'bar') + ' · ' + (n ? plural(n, 'note') : 'empty');
  for (const pill of [R.status, R.cardStatus]) pill.querySelector('.kx-status-text').textContent = text;
  renderMini();
}
/* The card's little picture of the part: notes as bars, scaled to fit, plus the playhead */
function renderMini() {
  const c = clip(), steps = bars() * 16, notes = c ? c.notes : [];
  R.mini.style.setProperty('--bars', bars());
  R.miniNotes.textContent = '';
  R.miniEmpty.hidden = notes.length > 0;
  R.miniEmpty.textContent = 'No ' + BB.TRACK[track()].name.toLowerCase() + ' notes in this scene yet. Tap here to draw some, or pick a starter part.';
  if (!notes.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) { lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); }
  const padd = Math.max(1, Math.ceil((12 - (hi - lo)) / 2)); lo -= padd; hi += padd;
  const span = hi - lo + 1;
  for (const n of notes) {
    const el = h('i', 'kx-mn');
    el.style.cssText = `left:${n.s / steps * 100}%;width:max(3px, calc(${n.d / steps * 100}% - 2px));top:${(hi - n.m) / span * 100}%;height:max(3px, calc(${100 / span}% - 1px));--v:${n.v}`;
    R.miniNotes.append(el);
  }
}

/* Scroll the roll so the notes (or the middle of the track's range) are in view */
function autoScroll() {
  const c = clip(), rows = S.rows;
  if (!rows.length || !R.roll.clientHeight) { S.ctx = ''; return; } // not visible yet: try again on the next render
  let mid, firstS = 0;
  const idx = c ? c.notes.map(n => rows.indexOf(n.m)).filter(i => i >= 0) : [];
  if (idx.length) { mid = (Math.min(...idx) + Math.max(...idx)) / 2; firstS = Math.min(...c.notes.map(n => n.s)); }
  else {
    const [lo, hi] = BB.TRACK[track()].range, target = (lo + hi) / 2;
    let best = 0; rows.forEach((m, i) => { if (Math.abs(m - target) < Math.abs(rows[best] - target)) best = i; });
    mid = best;
  }
  const visH = R.roll.clientHeight - RULER_H;
  R.roll.scrollTop = Math.max(0, (mid + 0.5) * S.rh - visH / 2);
  const visW = R.roll.clientWidth - S.kw;
  R.roll.scrollLeft = firstS * S.sw > visW - S.sw * 4 ? Math.max(0, firstS * S.sw - S.sw * 2) : 0;
}
function ensureVisible(n) {
  const r = S.rows.indexOf(n.m); if (r < 0) return;
  const y = r * S.rh, visH = R.roll.clientHeight - RULER_H;
  if (y < R.roll.scrollTop) R.roll.scrollTop = y - S.rh;
  else if (y + S.rh > R.roll.scrollTop + visH) R.roll.scrollTop = y + 2 * S.rh - visH;
  const x = n.s * S.sw, visW = R.roll.clientWidth - S.kw;
  if (x < R.roll.scrollLeft) R.roll.scrollLeft = x - S.sw;
  else if (x + n.d * S.sw > R.roll.scrollLeft + visW) R.roll.scrollLeft = x + n.d * S.sw - visW + S.sw;
}

function pianoKeys(row, base, octs, letterBase, letters) {
  const t = track(), p = BB.store.p, count = octs * 12 + 1, nW = octs * 7 + 1, bw = 100 / nW * 0.62;
  let wi = 0;
  for (let i = 0; i < count; i++) {
    const m = base + i, pc = m % 12, black = BLACK.has(pc);
    const k = h('div', { class: 'pkey ' + (black ? 'black' : 'white') + (T.inScale(pc, p.key, p.mode) ? ' inkey' : '') + (pc === p.key ? ' root' : '') + (S.lit.has(t + ':' + m) ? ' lit' : ''), dataset: { midi: m } });
    if (letters) {
      if (!black && pc === 0) k.append(h('span', 'kname', 'C' + (Math.floor(m / 12) - 1)));
      const li = m - letterBase;
      if (li >= 0 && li < LETTERS.length) k.append(h('span', 'klet', LETTERS[li]));
    }
    if (black) { k.style.left = `calc((100% + 3px) * ${wi / nW} - 1.5px - ${bw / 2}%)`; k.style.width = bw + '%'; } else wi++;
    row.append(k);
  }
}
function renderPiano() {
  if (!S.root) return;
  const t = track(), p = BB.store.p, base = 12 * (octave() + 1);
  const octs = S.octs, rows = S.prows;
  /* Rebuild only when the keys really change: swapping elements under a held finger would retrigger notes */
  const sig = [t, base, octs, rows, p.key, p.mode].join('|');
  if (sig === S.pianoSig) { paintSounding(); return; }
  S.pianoSig = sig;
  R.piano.innerHTML = '';
  R.piano.style.setProperty('--rows', rows);
  for (let r = rows - 1; r >= 0; r--) { // the top row plays the higher notes
    const row = h('div', 'pkeys kx-piano-row');
    pianoKeys(row, base + r * octs * 12, octs, base, true);
    R.piano.append(row);
  }
  R.miniPiano.innerHTML = '';
  pianoKeys(R.miniPiano, base, 2, base, false);
  paintSounding();
}

/* ================= the roll: pointer editing ================= */
function pointAt(e) {
  const r = R.grid.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  return { x, y, step: Math.floor(x / S.sw), row: Math.floor(y / S.rh) };
}
const refOf = el => ({ s: +el.dataset.s, m: +el.dataset.m, d: +el.dataset.d, i: +el.dataset.i });
function findIdx(c, ref, hint) {
  if (hint != null && c.notes[hint] && same(c.notes[hint], ref)) return hint;
  return c.notes.findIndex(x => same(x, ref));
}
/* The note a click at this point would add */
function noteAt(pt) {
  const len = bars() * 16, snap = Math.min(S.len, 4);
  const s = clamp(Math.floor(pt.step / snap) * snap, 0, len - 1);
  const row = clamp(pt.row, 0, S.rows.length - 1);
  return { s, d: Math.min(S.len, len - s), m: S.rows[row], v: 0.8 };
}
function addNote(n, group) {
  const t = track(), sc = scene(), nb = bars();
  BB.store.change('Add note', () => {
    const c = BB.store.ensureClip(t, sc, { bars: nb });
    c.notes = c.notes.filter(x => !(x.s === n.s && x.m === n.m));
    c.notes.push(Object.assign({}, n));
  }, { group, window: DRAG_WINDOW, info: { track: t, scene: sc } });
  launchIfPlaying(t, sc);
  audition(n.m, n.d);
}
function deleteRef(ref, group) {
  const t = track(), sc = scene(), c = clip(); if (!c) return false;
  const i = findIdx(c, ref, ref.i); if (i < 0) return false;
  BB.store.change('Delete note', p => { p.clips[t][sc].notes.splice(i, 1); }, { group, window: DRAG_WINDOW, info: { track: t, scene: sc } });
  return true;
}
function deleteSelected() {
  const c = clip(); if (!c || !S.sel) return;
  const n = c.notes.find(x => x.s === S.sel.s && x.m === S.sel.m);
  S.delShown = false;
  if (n) { const ref = { s: n.s, m: n.m, d: n.d }; S.sel = null; deleteRef(ref); }
  else { S.sel = null; renderNotes(); }
}
function capture(e) { try { R.grid.setPointerCapture(e.pointerId); } catch (_) { /* noop */ } }
function startDrag(type, e, n, opts) {
  S.drag = Object.assign({ type, pid: e.pointerId, x0: e.clientX, y0: e.clientY, orig: Object.assign({}, n), cur: Object.assign({}, n), idx: null,
    row0: S.rows.indexOf(n.m), rows: S.rows.slice(), group: 'kx-drag-' + BB.uid(), moved: false, track: track(), scene: scene(), label: 'Move note' }, opts || {});
  syncRootClass();
}
function dragUpdate(next) {
  const D = S.drag, c = BB.store.clip(D.track, D.scene); if (!c) { S.drag = null; return; }
  const i = findIdx(c, D.cur, D.idx); if (i < 0) { S.drag = null; return; }
  D.idx = i;
  BB.store.change(D.label, p => { Object.assign(p.clips[D.track][D.scene].notes[i], next); }, { group: D.group, window: DRAG_WINDOW, info: { track: D.track, scene: D.scene } });
  D.cur = Object.assign({}, D.cur, next);
  S.sel = { s: D.cur.s, m: D.cur.m };
  renderNotes();
}
/* Two notes on the same spot after a drag: keep the one that was dragged */
function dedupeAfterDrag(D) {
  const c = BB.store.clip(D.track, D.scene); if (!c) return;
  if (c.notes.filter(x => x.s === D.cur.s && x.m === D.cur.m).length < 2) return;
  BB.store.change(D.label, p => {
    const cc = p.clips[D.track][D.scene], keep = cc.notes[findIdx(cc, D.cur, D.idx)];
    cc.notes = cc.notes.filter(x => x === keep || !(x.s === D.cur.s && x.m === D.cur.m));
  }, { group: D.group, window: DRAG_WINDOW, info: { track: D.track, scene: D.scene } });
}

function wireRoll() {
  const g = R.grid;
  g.addEventListener('contextmenu', e => e.preventDefault());
  g.addEventListener('pointerdown', e => {
    if (e.button === 1 || e.button > 2) return;
    if (e.target.closest('.kx-del')) return;
    C.clear(); hideGhost();
    const noteEl = e.target.closest('.kx-note'), touch = e.pointerType !== 'mouse';
    if (e.button === 2) { e.preventDefault(); if (noteEl) { const ref = refOf(noteEl); if (S.sel && S.sel.s === ref.s && S.sel.m === ref.m) S.sel = null; deleteRef(ref); } return; }
    if (S.tool === 'erase') {
      if (!noteEl && touch) return; // let a finger scroll the roll
      e.preventDefault(); capture(e);
      S.drag = { type: 'erase', pid: e.pointerId, group: 'kx-erase-' + BB.uid(), rows: S.rows.slice(), track: track(), scene: scene() };
      if (noteEl) deleteRef(refOf(noteEl), S.drag.group);
      return;
    }
    if (noteEl) {
      e.preventDefault();
      const ref = refOf(noteEl), r = noteEl.getBoundingClientRect(), now = Date.now(), lt = S.lastTap;
      S.lastTap = { s: ref.s, m: ref.m, t: now };
      if (lt && lt.s === ref.s && lt.m === ref.m && now - lt.t < 380) { // double-click / double-tap deletes
        S.lastTap = null; S.sel = null; S.delShown = false; deleteRef(ref); return;
      }
      capture(e);
      const edge = Math.min(touch ? 16 : 9, r.width / 3);
      const resize = e.clientX > r.right - edge;
      S.sel = { s: ref.s, m: ref.m }; S.delShown = false;
      startDrag(resize ? 'resize' : 'move', e, ref, { idx: ref.i, label: resize ? 'Change note length' : 'Move note', existing: true, touch });
      if (!resize) audition(ref.m, ref.d);
      markSel();
      return;
    }
    /* empty space */
    if (touch) { S.tap = { pid: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    e.preventDefault(); capture(e);
    const n = noteAt(pointAt(e));
    S.sel = { s: n.s, m: n.m }; S.delShown = false;
    startDrag('move', e, n, { label: 'Add note', existing: false });
    addNote(n, S.drag.group);
  });
  g.addEventListener('pointermove', e => {
    const D = S.drag;
    if (!D || e.pointerId !== D.pid) { if (!D && e.pointerType === 'mouse') hoverGhost(e); return; }
    if (D.type === 'erase') {
      const hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest && hit.closest('.kx-note');
      if (el && R.grid.contains(el)) deleteRef(refOf(el), D.group);
      return;
    }
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    if (!D.moved && Math.hypot(dx, dy) < 4) return;
    D.moved = true;
    const len = BB.store.clip(D.track, D.scene) ? BB.store.clip(D.track, D.scene).bars * 16 : bars() * 16;
    if (D.type === 'move') {
      const s = clamp(D.orig.s + Math.round(dx / S.sw), 0, Math.max(0, len - D.orig.d));
      const m = D.rows[clamp(D.row0 + Math.round(dy / S.rh), 0, D.rows.length - 1)];
      if (s !== D.cur.s || m !== D.cur.m) { const pitch = m !== D.cur.m; dragUpdate({ s, m }); if (pitch) audition(m, 2, D.track); }
    } else {
      const d = clamp(D.orig.d + Math.round(dx / S.sw), 1, len - D.orig.s);
      if (d !== D.cur.d) dragUpdate({ d });
    }
  });
  const end = e => {
    if (S.tap && e.pointerId === S.tap.pid) {
      const tp = S.tap; S.tap = null;
      if (e.type !== 'pointerup' || Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 10) return;
      if (S.delShown) { S.sel = null; S.delShown = false; markSel(); return; } // a tap away closes the delete button
      if (S.tool !== 'draw') return;
      const n = noteAt(pointAt(e));
      S.sel = null;
      addNote(n, 'kx-add-' + BB.uid());
      return;
    }
    const D = S.drag; if (!D || e.pointerId !== D.pid) return;
    S.drag = null; syncRootClass();
    if (D.type === 'erase') { renderRoll(); return; }
    if (D.moved) { dedupeAfterDrag(D); S.sel = { s: D.cur.s, m: D.cur.m }; renderRoll(); return; }
    if (D.existing && D.touch) S.delShown = true; // tap on a note: offer the delete button
    markSel();
  };
  g.addEventListener('pointerup', end);
  g.addEventListener('pointercancel', end);
  g.addEventListener('pointerleave', hideGhost);
}
/* Update the selected-note outline and the floating delete button without rebuilding the notes
   (rebuilding mid-click would steal the click's target). */
function markSel() {
  let selNote = null;
  for (const ne of S.noteEls || []) {
    const on = !!(S.sel && !selNote && ne.s === S.sel.s && ne.m === S.sel.m);
    ne.el.classList.toggle('sel', on);
    if (on) selNote = ne;
  }
  if (selNote && S.delShown) {
    const r = S.rows.indexOf(selNote.m), x = (selNote.s + selNote.d) * S.sw, y = r * S.rh, sz = BB.isMobile() ? 42 : 36;
    R.del.style.left = clamp(x - sz / 2, 2, S.sw * S.steps - sz - 2) + 'px';
    R.del.style.top = (y - sz - 6 < 0 ? y + S.rh + 6 : y - sz - 6) + 'px';
    R.del.hidden = false;
  } else R.del.hidden = true;
}
function hoverGhost(e) {
  if (S.tool !== 'draw' || e.target.closest('.kx-note, .kx-del')) { hideGhost(); return; }
  const n = noteAt(pointAt(e)), r = S.rows.indexOf(n.m);
  Object.assign(R.ghost.style, { display: 'block', left: n.s * S.sw + 1 + 'px', top: r * S.rh + 1 + 'px', width: Math.max(4, n.d * S.sw - 2) + 'px', height: S.rh - 2 + 'px' });
}
function hideGhost() { if (R.ghost) R.ghost.style.display = 'none'; }

/* Arrow keys move the selected note: ← → by a step (Shift: a beat), ↑ ↓ by a row (Shift: an octave) */
function nudge(ds, dr, big) {
  const c = clip(); if (!c || !S.sel) return false;
  const i = c.notes.findIndex(x => x.s === S.sel.s && x.m === S.sel.m); if (i < 0) { S.sel = null; return false; }
  const n = c.notes[i], len = c.bars * 16;
  const s = clamp(n.s + ds * (big ? 4 : 1), 0, len - n.d);
  let m = n.m;
  if (dr) {
    if (big) m = clamp(n.m + 12 * dr, 12, 108);
    else { const ri = S.rows.indexOf(n.m); m = S.rows[clamp(ri - dr, 0, S.rows.length - 1)]; }
  }
  if (s === n.s && m === n.m) return true;
  const t = track(), sc = scene();
  S.sel = { s, m };
  BB.store.change('Move note', p => { Object.assign(p.clips[t][sc].notes[i], { s, m }); }, { group: 'kx-nudge', info: { track: t, scene: sc } });
  if (m !== n.m) audition(m, n.d);
  ensureVisible({ s, m, d: n.d });
  return true;
}

/* ================= clip actions ================= */
function setBars(b) {
  b = +b; const t = track(), sc = scene(), c = clip();
  if (!c) { S.pendingBars[ckey()] = b; renderAll(); return; }
  if (c.bars === b) return;
  const lost = c.notes.filter(n => n.s >= b * 16).length;
  BB.store.change('Clip length', p => { BB.resizeClip(t, p.clips[t][sc], b); }, { group: 'kx-bars', info: { track: t, scene: sc } });
  if (lost) undoToast('Now ' + plural(b, 'bar') + '. ' + plural(lost, 'note') + ' after bar ' + b + ' went away.');
  else if (b > c.bars) UI.toast('Now ' + plural(b, 'bar') + '. Your notes were copied into the new bars.', { ms: 2200 });
}
function octMoveText() {
  const c = clip(); if (!c || !c.notes.length) return 'No notes yet';
  const ms = c.notes.map(n => n.m);
  return T.noteName(Math.min(...ms)) + ' – ' + T.noteName(Math.max(...ms));
}
function shiftOctave(dir) {
  const c = clip(), t = track(), sc = scene();
  if (!c || !c.notes.length) { UI.toast('Add some notes first, then you can move them all up or down.'); return; }
  const ms = c.notes.map(n => n.m), lo = Math.min(...ms) + 12 * dir, hi = Math.max(...ms) + 12 * dir;
  if (lo < 12 || hi > 108) { UI.toast('That would be too ' + (dir > 0 ? 'high' : 'low') + ' to hear well.'); return; }
  BB.store.change('Move notes ' + (dir > 0 ? 'up' : 'down') + ' an octave', p => { p.clips[t][sc].notes.forEach(n => { n.m += 12 * dir; }); }, { info: { track: t, scene: sc } });
  if (S.sel) S.sel = { s: S.sel.s, m: S.sel.m + 12 * dir };
  renderRoll({ scroll: true });
  audition(dir > 0 ? hi : lo, 2);
  C.showHud();
}
function quantize() {
  const c = clip(), t = track(), sc = scene();
  if (!c || !c.notes.length) { UI.toast('Nothing to quantize yet. Add or record some notes first.'); return; }
  const q = clamp(S.len, 2, 4), len = c.bars * 16, name = q === 2 ? '1/8 note' : 'beat';
  const snapS = s => (Math.round(s / q) * q) % len;
  const moving = c.notes.filter(n => snapS(n.s) !== n.s).length;
  if (!moving) { UI.toast('Every note already sits on the ' + name + ' grid.'); return; }
  BB.store.change('Quantize', p => {
    const cc = p.clips[t][sc], spot = new Map();
    for (const n of cc.notes) {
      n.s = snapS(n.s); n.d = Math.min(n.d, len - n.s);
      const k = n.s + ':' + n.m, o = spot.get(k);
      if (!o || n.v > o.v) spot.set(k, n);
    }
    cc.notes = cc.notes.filter(n => spot.get(n.s + ':' + n.m) === n);
  }, { info: { track: t, scene: sc } });
  S.sel = null;
  undoToast('Snapped ' + plural(moving, 'note') + ' to the nearest ' + name + '.');
}
function clearClip() {
  const c = clip(), t = track(), sc = scene();
  if (!c || !c.notes.length) { UI.toast('This part is already empty.'); return; }
  S.pendingBars[ckey()] = c.bars;
  BB.store.change('Clear ' + BB.TRACK[t].name.toLowerCase(), p => { p.clips[t][sc] = null; }, { info: { track: t, scene: sc } });
  S.sel = null; S.delShown = false;
  undoToast('Cleared the ' + BB.TRACK[t].name + ' part in ' + BB.store.p.scenes[sc].name + '.');
}
/* Recording into an empty scene makes a 2-bar clip; match the length the editor was showing instead
   (same undo step as the take). */
function fixRecordedLength() {
  const t = track(), sc = scene(), c = clip(), want = S.pendingBars[ckey()] || defaultBars();
  if (!c || c.notes.length || c.bars === want) return;
  BB.store.change('Record', p => { BB.resizeClip(t, p.clips[t][sc], want); }, { group: TR.recGroup, info: { track: t, scene: sc } });
}
function starterValue() {
  const id = S.starter[ckey()], c = clip();
  if (!id || !c) return '';
  const it = BB.library.itemsFor(track()).find(x => x.id === id);
  return it && c.name === it.name ? id : '';
}
function applyStarter(id) {
  if (!id) return;
  const t = track(), sc = scene(), it = BB.library.itemsFor(t).find(x => x.id === id); if (!it) return;
  const had = clip() && clip().notes.length;
  const c = BB.library.build(t, id, sc);
  S.starter[ckey()] = id;
  BB.store.change('Starter part: ' + c.name, p => { p.clips[t][sc] = c; }, { group: 'kx-starter-' + ckey(), info: { track: t, scene: sc } });
  launchIfPlaying(t, sc);
  S.sel = null;
  renderRoll({ scroll: true });
  if (had) undoToast(it.name + ': ' + it.desc); else UI.toast(it.name + ': ' + it.desc + (TR.playing ? '' : ' Press Play to hear it.'));
}

/* ================= piano ================= */
function setOctave(v, announce) {
  const t = track(), [a, b] = octRange(t), o = clamp(Math.round(v), a, b);
  if (o === octave()) { if (announce) UI.toast('That is the ' + (v > o ? 'highest' : 'lowest') + ' octave for ' + BB.TRACK[t].name + '.', { ms: 1400 }); return false; }
  BB.setState({ octave: Object.assign({}, BB.state.octave, { [t]: o }) });
  if (announce) UI.toast('Piano octave: C' + o + ' – F' + (o + 1), { ms: 1000 });
  return true;
}
function pianoOn(el, e) {
  const m = +el.dataset.midi, t = track();
  let vel = 0.85;
  if (e && e.clientY != null) { const r = el.getBoundingClientRect(); vel = 0.6 + 0.35 * clamp((e.clientY - r.top) / (r.height || 1), 0, 1); }
  el.dataset.tr = t;
  TR.noteOn(t, m, Math.round(vel * 100) / 100);
}
function pianoOff(el) { TR.noteOff(el.dataset.tr || track(), +el.dataset.midi); }
function onNoteEvent(d) {
  if (!d || !TRACKS.includes(d.track)) return;
  const k = d.track + ':' + d.midi;
  if (d.on) S.lit.add(k); else S.lit.delete(k);
  if (!S.root || d.track !== track()) return;
  R.piano.querySelectorAll('[data-midi="' + d.midi + '"]').forEach(pk => pk.classList.toggle('lit', d.on));
  R.miniPiano.querySelectorAll('[data-midi="' + d.midi + '"]').forEach(pk => pk.classList.toggle('lit', d.on));
  const rk = R.keycol.querySelector('[data-midi="' + d.midi + '"]'); if (rk) rk.classList.toggle('lit', d.on);
}
/* While the loop plays, the notes under the playhead glow on the roll and on both keyboards */
function paintSounding() {
  const ms = new Set();
  if (S.noteEls) for (const ne of S.noteEls) if (S.sounding.has(ne.i)) ms.add(ne.m);
  R.piano.querySelectorAll('.pkey').forEach(k => k.classList.toggle('kx-play', ms.has(+k.dataset.midi)));
  R.miniPiano.querySelectorAll('.pkey').forEach(k => k.classList.toggle('kx-play', ms.has(+k.dataset.midi)));
  R.keycol.querySelectorAll('.kx-key').forEach(k => k.classList.toggle('kx-play', ms.has(+k.dataset.midi)));
}

/* ================= playhead ================= */
function step(e) {
  if (!S.root) return;
  const pos = e && e.pos && e.pos[track()];
  const show = !!(pos && pos.scene === scene());
  R.miniPh.style.display = show ? 'block' : 'none';
  if (show) R.miniPh.style.left = (pos.pos / (bars() * 16) * 100) + '%';
  if (!show) {
    R.ph.style.display = 'none';
    if (S.sounding.size) { S.sounding.clear(); for (const ne of S.noteEls || []) ne.el.classList.remove('on'); paintSounding(); }
    return;
  }
  const x = pos.pos * S.sw;
  R.ph.style.display = 'block';
  R.ph.style.transform = 'translateX(' + x + 'px)';
  const now = new Set();
  for (const ne of S.noteEls || []) { const on = pos.pos >= ne.s && pos.pos < ne.s + ne.d; if (on) now.add(ne.i); ne.el.classList.toggle('on', on); }
  const changed = now.size !== S.sounding.size || [...now].some(i => !S.sounding.has(i));
  S.sounding = now;
  if (changed) paintSounding();
  /* long clips: page along with the playhead unless the person just scrolled */
  const visW = R.roll.clientWidth - S.kw;
  if (S.sw * S.steps > visW + 2 && !S.drag && Date.now() - S.userScrollT > 2500) {
    if (x < R.roll.scrollLeft || x > R.roll.scrollLeft + visW - S.sw) R.roll.scrollLeft = Math.max(0, x - S.sw);
  }
}

/* ================= keyboard ================= */
function keydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const code = e.code, idx = CODES.indexOf(code);
  if (idx >= 0) {
    if (e.repeat) return true;
    const prev = S.keyHeld.get(code);
    if (prev) TR.noteOff(prev.track, prev.midi);
    const t = track(), midi = 12 * (octave() + 1) + idx;
    S.keyHeld.set(code, { track: t, midi });
    TR.noteOn(t, midi, 0.85);
    return true;
  }
  if (code === 'KeyZ' || code === 'KeyX') { if (!e.repeat) setOctave(octave() + (code === 'KeyX' ? 1 : -1), true); return true; }
  if (!edOpen()) return false; // the rest edits the piano roll, so only while the note editor is open
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { deleteSelected(); return true; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    if (S.sel && nudge(0, dir, e.shiftKey)) return true;
    R.roll.scrollTop -= dir * S.rh * 3; S.userScrollT = Date.now();
    return true;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (S.sel && nudge(dir, 0, e.shiftKey)) return true;
    if (R.roll.scrollWidth > R.roll.clientWidth + 2) { R.roll.scrollLeft += dir * S.sw * 16; S.userScrollT = Date.now(); return true; }
    return false;
  }
  return false;
}
function keyup(e) {
  const held = S.keyHeld.get(e.code);
  if (held) { S.keyHeld.delete(e.code); TR.noteOff(held.track, held.midi); }
}
function releaseKeys() { for (const v of S.keyHeld.values()) TR.noteOff(v.track, v.midi); S.keyHeld.clear(); }

/* ================= tutorial ================= */
const $v = sel => BB.$('.view[data-view="keys"] ' + sel);
const mobileText = (desk, phone) => () => (BB.isMobile() ? phone : desk);
const tutorial = [
  { view: VIEW, target: () => $v('.kx-tracks'), title: 'Three note tracks',
    text: '<b>Bass</b> plays the low notes that hold the song together. <b>Melody</b> is the tune people hum. <b>Keys</b> adds extra parts like arpeggios and riffs. Pick one here, and a scene next to it.' },
  { view: VIEW, target: () => $v('#kx-sound'), title: 'Shape the sound',
    text: 'This screen is home base for the track. Pick its <b>Instrument</b>, then set its volume, tone, reverb (Space) and echo. Try it while the music plays.' },
  { view: VIEW, target: () => $v('#kx-ed-card'), title: 'Your notes at a glance',
    text: 'This picture shows the notes of this track in this scene. <b>Tap it</b> (or <b>Edit notes</b>) to open the note editor full screen. <b>Play piano</b> opens a big piano.' },
  { view: VIEW, target: () => $v('.kx-rollwrap'), title: 'Draw notes',
    get text() { return mobileText('Each row is a note and each column is a step in time. <b>Click</b> an empty spot to add a note, <b>drag</b> a note to move it, and drag its <b>right edge</b> to make it longer. <b>Double-click</b> or right-click a note to delete it.', 'Each row is a note and each column is a step in time. <b>Tap</b> an empty spot to add a note and <b>drag</b> a note to move it. Tap a note to get a <b>delete</b> button.')(); } },
  { view: VIEW, target: () => $v('.kx-tools'), title: 'Length and key',
    text: 'New notes get the <b>Note length</b> you pick: <b>1/8</b> is a good start. <b>In key</b> shows only notes from your song’s key, so you can’t hit a wrong note. <b>Close</b> (or Esc) takes you back.' },
  { view: VIEW, target: () => $v('.kx-piano'), title: 'Play the piano',
    get text() { return mobileText('Click or slide across the keys. Your computer keyboard works too: <b>A S D F G H J K</b> are white keys and <b>W E T Y U O P</b> are black keys. <b>Z</b> and <b>X</b> move an octave. Keys with a dot are in your key; the big dot is the home note.', 'Tap the keys, or press and slide across them. The top row is one octave higher. Keys with a dot are in your key; the big dot is the home note.')(); } },
  { view: VIEW, target: () => $v('.kx-hint'), title: 'Record what you play',
    get text() { return 'Turn on <b>Record</b>' + (BB.isMobile() ? '' : ' (<b>R</b>)') + ' at the top, then play. Your notes land in time with the beat and keep looping. Not happy with a take? <b>Undo</b> removes it.'; } },
  { view: VIEW, target: () => $v('.kx-starter'), title: 'Try this',
    text: 'Pick a <b>Starter part</b>, press <b>Play</b>, then open the note editor and drag a few notes up or down to make it your own. Then switch to <b>Bass</b> and do the same.' },
];

BB.views.register({
  id: VIEW, title: 'Keys',
  letterMode: 'notes',
  mount,
  render(evt = {}) {
    if (!S.root) return;
    if (evt.track && evt.track !== track() && !evt.all) return; // another track changed
    if (evt.label === 'Record' && evt.scene === scene()) fixRecordedLength();
    renderAll();
  },
  show() { renderAll(); },
  hide() { releaseKeys(); S.drag = null; S.tap = null; S.sel = null; S.delShown = false; hideGhost(); },
  step,
  keydown,
  keyup,
  tutorial,
});
})();

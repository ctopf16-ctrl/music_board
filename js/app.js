/* Beat Board · app
   Boots everything: the transport bar, screen tabs, keyboard shortcuts, menus, the welcome tour
   and the animation loop. Load last. */
(function () {
'use strict';
const BB = window.BB;
const { h, $, $$ } = BB;
const UI = BB.ui, I = UI.ICONS, TR = BB.transport, C = BB.controls;
const ORDER = ['loops', 'beat', 'keys', 'chords', 'mixer', 'song'];
const SUBS = { loops: 'Mix loops live', beat: 'Drum machine & pads', keys: 'Piano & note editor', chords: 'Chord pads, no wrong notes', mixer: 'Levels & effects', song: 'Arrange & export' };
const app = BB.app = {};

/* ---------- song-wide helpers ---------- */
/* Move every note and chord in the song by delta semitones (used when the key changes). */
BB.transposeSong = function (p, delta) {
  if (!delta) return;
  for (const t of BB.TRACKS) {
    p.clips[t.id].forEach(c => {
      if (!c) return;
      if (t.type === 'notes') c.notes.forEach(n => { n.m = BB.clamp(n.m + delta, 12, 115); });
      if (t.type === 'chords') c.slots.forEach(s => { if (s && !s.rest) s.r = (s.r + delta + 12) % 12; });
    });
  }
};
const setBpm = v => BB.store.change('Tempo', p => { p.bpm = BB.clamp(Math.round(v), 50, 200); }, { group: 'bpm' });

/* ---------- theme & keyboard letters ---------- */
function applyTheme() {
  const t = BB.storage.get('beatboard.theme', 'system');
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  setTimeout(readColors, 30);
}
function applyKeysVisible() {
  const pref = BB.storage.get('beatboard.showKeys', 'auto');
  const on = pref === 'on' || (pref === 'auto' && BB.finePointer() && !BB.isMobile());
  document.body.classList.toggle('show-keys', on);
}
let COLORS = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  ['--ink', '--ink-2', '--line', '--rec', '--good'].concat(BB.TRACKS.map(t => '--' + t.color)).forEach(k => { COLORS[k] = cs.getPropertyValue(k).trim(); });
  BB.colors = COLORS;
  BB.emit('theme', COLORS);
}

/* ---------- transport bar ---------- */
function buildTopbar() {
  const bar = $('#topbar');
  const p = () => BB.store.p;
  const brand = h('button', { class: 'brand', 'aria-label': 'Song and project menu', 'data-tip': 'Name your song, save it, open another one, or download it.', 'data-tip-title': 'Project', onclick: openProjectMenu },
    h('span', { class: 'logo', 'aria-hidden': 'true' }, h('i', 'c-drums'), h('i', 'c-bass'), h('i', 'c-chords'), h('i', 'c-melody')),
    h('span', 'brand-text', h('span', 'brand-name', 'Beat Board'), h('span', { class: 'song-name', id: 'songName' })));

  const play = h('button', { class: 'play-btn', id: 'playBtn', 'aria-pressed': 'false', 'aria-label': 'Play', 'data-tip': 'Start or stop the music. Shortcut: Space (or Enter on the number pad).', 'data-tip-title': 'Play / Stop', onclick: () => TR.toggle() },
    h('span', { class: 'i-play', html: I.play }), h('span', { class: 'i-stop', html: I.stop }), h('span', { id: 'playLabel' }, 'Play'));
  C.add(play, { label: 'Play / Stop', activate: () => TR.toggle() });
  const rec = UI.toggle({ label: 'Record', key: 'R', icon: I.rec, cls: 'rec-btn', value: () => TR.rec, set: v => TR.setRec(v),
    tip: 'Turn on, then play pads, keys or chords. What you play is added to the loop in time. Undo removes a take.' });
  const beats = h('div', { class: 'beats', id: 'beats', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const mode = UI.seg({ label: 'Play mode', key: 'L', small: true, value: () => TR.mode, set: m => TR.setMode(m),
    tip: 'Loop plays the clips you launch, over and over. Song plays your arrangement from the Song tab, start to finish.',
    options: [{ id: 'loop', label: 'Loop', tip: 'Play the launched loops on repeat.' }, { id: 'song', label: 'Song', tip: 'Play the full arrangement from the Song tab.' }] });
  const metro = UI.toggle({ label: 'Click', key: 'M', icon: I.metro, cls: 'metro', value: () => TR.metronome, set: v => TR.setMetronome(v), tip: 'A metronome tick on every beat to help you play in time. It is never recorded.' });
  const tempo = UI.stepper({ label: 'Tempo', key: 'T', min: 50, max: 200, unit: 'BPM', value: () => p().bpm, set: setBpm,
    tip: 'Speed in beats per minute. Hip-hop ~85–95, pop ~100–120, house ~122–128, trap ~140. Number pad + and − also work.' });
  let taps = [];
  const tap = UI.button({ label: 'Tap', icon: I.tap, cls: 'sm ghost tap-btn', text: false, tip: 'Tap this in time with a song in your head to set the tempo.', onClick: () => {
    const now = performance.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 3) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setBpm(60000 / d); }
  } });
  const keySel = UI.select({ label: 'Key', key: 'K', small: true, options: BB.theory.NOTE.map((n, i) => ({ id: String(i), label: n })), value: () => String(p().key),
    tip: 'The home note of your song. Changing it moves every note and chord, so the song stays in tune.',
    set: v => { const nk = +v, d0 = ((nk - p().key + 18) % 12) - 6; BB.store.change('Change key', pp => { BB.transposeSong(pp, d0); pp.key = nk; }); } });
  const modeSel = UI.select({ label: 'Scale', key: 'J', small: true, options: Object.entries(BB.theory.MODES).map(([id, m]) => ({ id, label: m.name })), value: () => p().mode,
    tip: 'The mood of the notes. Major sounds bright, Minor sounds darker. The chord pads and "in key" notes follow this.',
    set: v => { BB.store.change('Change scale', pp => { pp.mode = v; }); UI.toast(BB.theory.MODES[v].name + ': ' + BB.theory.MODES[v].desc); } });
  const undo = UI.button({ label: 'Undo', icon: I.undo, cls: 'ghost icon-only', text: false, tip: 'Undo the last change. Shortcut: Ctrl+Z (⌘Z on Mac).', onClick: doUndo });
  const redo = UI.button({ label: 'Redo', icon: I.redo, cls: 'ghost icon-only', text: false, tip: 'Redo what you undid. Shortcut: Ctrl+Shift+Z (⌘⇧Z on Mac).', onClick: doRedo });
  undo.id = 'undoBtn'; redo.id = 'redoBtn';
  const vol = UI.knob({ label: 'Volume', key: 'V', size: 'sm', value: () => p().master.volume, def: 0.8, set: v => BB.store.change('Volume', pp => { pp.master.volume = v; }, { group: 'mvol' }), tip: 'Overall loudness of everything.' });
  const scope = h('div', { class: 'scope-wrap desk-only', 'aria-hidden': 'true' }, h('canvas', { id: 'scope' }), h('p', { class: 'sound-hint', id: 'soundHint' }, 'Click anywhere to turn on sound'));
  const midiChip = h('span', { class: 'pill', id: 'midiChip', hidden: true, 'data-tip': 'A MIDI keyboard is connected. It plays the track you are editing.', 'data-tip-title': 'MIDI' }, h('i', 'midi-dot'), 'MIDI');
  const menu = UI.button({ label: 'Menu', icon: I.menu, cls: 'ghost icon-only', text: false, tip: 'Save, open, export, settings and MIDI.', onClick: openProjectMenu });
  const help = UI.button({ label: 'Help', icon: I.help, cls: 'ghost icon-only', text: false, tip: 'Tutorials for every screen and the full list of keyboard shortcuts.', onClick: openHelp });
  help.id = 'helpBtn';

  bar.append(
    brand,
    h('div', 'tgroup', play, rec), beats, h('span', 'tsep'),
    h('div', 'tgroup', tempo, h('span', 'desk-only', tap)),
    h('div', { class: 'tgroup more-row' }, mode, metro, keySel, modeSel, undo, redo),
    h('span', 'tsep'), h('span', 'desk-only', vol), scope, midiChip, menu, help);

  const sync = () => {
    $('#songName').textContent = p().name;
    play.setAttribute('aria-pressed', TR.playing); $('#playLabel').textContent = TR.playing ? 'Stop' : 'Play';
    rec.update(); mode.update(); metro.update(); tempo.update(); keySel.update(); modeSel.update(); vol.update();
    undo.disabled = !BB.store.canUndo(); redo.disabled = !BB.store.canRedo();
    document.title = p().name && p().name !== 'New song' ? p().name + ' · Beat Board' : 'Beat Board';
  };
  BB.on('change', sync); BB.on('transport', sync); sync();
  BB.on('step', e => {
    const bl = $$('#beats i');
    if (!e) { bl.forEach(b => b.classList.remove('on', 'one')); return; }
    const beat = Math.floor((e.abs % 16) / 4);
    bl.forEach((b, i) => { b.classList.toggle('on', i === beat); b.classList.toggle('one', i === 0 && beat === 0); });
  });
  BB.on('audio', d => {
    const hint = $('#soundHint');
    if (d.error) { hint.textContent = d.error; return; }
    hint.hidden = d.state === 'running';
  });
}
function doUndo() { const l = BB.store.undo(); if (l) UI.toast('Undid: ' + l); }
function doRedo() { const l = BB.store.redo(); if (l) UI.toast('Redid: ' + l); }

/* ---------- tabs & views ---------- */
function buildViews() {
  const tabs = $('#tabs'), main = $('#views');
  const defs = ORDER.map(id => BB.views.byId[id]).filter(Boolean).concat(BB.views.list.filter(v => !ORDER.includes(v.id)));
  defs.forEach((def, i) => {
    const sec = h('section', { class: 'view', id: 'view-' + def.id, 'data-view': def.id, role: 'tabpanel', 'aria-labelledby': 'tab-' + def.id, hidden: true });
    main.append(sec);
    const tab = h('button', { class: 'tab', role: 'tab', id: 'tab-' + def.id, 'aria-controls': 'view-' + def.id, 'aria-selected': 'false', tabindex: '-1',
      'data-tip': (def.tip || SUBS[def.id] || '') + ' Keyboard: [ and ] switch screens.', 'data-tip-title': def.title, onclick: () => app.setView(def.id) },
      h('span', { class: 'ico', html: I[def.id] || def.icon || I.loops }), h('span', 'tab-text', h('span', 'tab-name', def.title), h('span', 'tab-sub', SUBS[def.id] || def.sub || '')));
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      const n = defs[(i + (e.key === 'ArrowRight' ? 1 : defs.length - 1)) % defs.length];
      app.setView(n.id); $('#tab-' + n.id).focus();
    });
    tabs.append(tab);
    try { def.mount(sec); } catch (e) { console.error('[BB] mount ' + def.id, e); sec.append(h('div', 'empty', h('h4', null, 'This screen failed to load'), String(e.message || e))); }
    def._el = sec; def._dirty = false;
    if (def.tutorial) BB.tutorial.register(def.id, { title: def.title, steps: def.tutorial });
  });
  app.defs = defs;
}
app.setView = function (id) {
  const def = BB.views.byId[id]; if (!def) return;
  const prev = BB.views.byId[BB.state.view];
  if (prev && prev.id !== id && prev.hide) try { prev.hide(); } catch (e) { console.error(e); }
  TR.allNotesOff();
  C.clear();
  BB.setState({ view: id });
  $$('.tab').forEach(t => { const on = t.id === 'tab-' + id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== id; });
  document.body.dataset.letters = def.letterMode === 'notes' ? 'shift' : 'plain';
  if (def._dirty && def.render) { def._dirty = false; try { def.render({ label: 'show', all: true }); } catch (e) { console.error(e); } }
  if (def.show) try { def.show(); } catch (e) { console.error(e); }
  BB.storage.set('beatboard.view', id);
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* sandboxed */ }
};
function routeChange(evt) {
  for (const def of app.defs || []) {
    if (!def.render) continue;
    if (def.id === BB.state.view) { try { def.render(evt || {}); } catch (e) { console.error('[BB] render ' + def.id, e); } }
    else def._dirty = true;
  }
}

/* ---------- keyboard ---------- */
const typing = el => el && ((el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const NUMPAD = { Numpad1: 'kick', Numpad2: 'snare', Numpad3: 'clap', Numpad4: 'hat', Numpad5: 'ohat', Numpad6: 'rim', Numpad7: 'tomL', Numpad8: 'tomH', Numpad9: 'crash', Numpad0: 'shaker' };
const DIGIT_DRUM = { Digit1: 'kick', Digit2: 'snare', Digit3: 'clap', Digit4: 'hat', Digit5: 'ohat', Digit6: 'rim', Digit7: 'tomL', Digit8: 'tomH', Digit9: 'crash', Digit0: 'shaker' };
function onKeyDown(e) {
  if (BB.tutorial.active && BB.tutorial.key(e)) { e.preventDefault(); return; }
  if ($('.sheet-wrap')) return; // sheets handle their own keys
  const tgt = e.target, view = BB.views.current();
  if (typing(tgt)) { if (e.key === 'Escape') tgt.blur(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
    else if (k === 's') { e.preventDefault(); BB.store.saveAs(); UI.toast('Saved “' + BB.store.p.name + '” in this browser'); }
    else if (view && view.keydown && view.keydown(e)) e.preventDefault();
    return;
  }
  if (e.altKey) return;
  const code = e.code;
  if (code === 'Space' || code === 'NumpadEnter') { e.preventDefault(); if (!e.repeat) TR.toggle(); return; }
  if (NUMPAD[code]) { e.preventDefault(); if (!e.repeat) TR.drumHit(NUMPAD[code], e.shiftKey ? 0.5 : 0.95); return; }
  if (code === 'NumpadDecimal') { e.preventDefault(); if (!e.repeat) TR.setRec(!TR.rec); return; }
  if (code === 'NumpadAdd' || code === 'NumpadSubtract') { e.preventDefault(); setBpm(BB.store.p.bpm + (code === 'NumpadAdd' ? 1 : -1) * (e.shiftKey ? 5 : 1)); UI.toast('Tempo ' + BB.store.p.bpm + ' BPM', { ms: 900 }); return; }
  if (code === 'NumpadMultiply') { e.preventDefault(); TR.setMetronome(!TR.metronome); return; }
  if (code === 'NumpadDivide') { e.preventDefault(); TR.setMode(TR.mode === 'loop' ? 'song' : 'loop'); return; }
  if (e.key === 'Escape') { if (C.sel) C.clear(); else if (view && view.keydown && view.keydown(e)) e.preventDefault(); else if (TR.playing) TR.stop(); return; }
  /* arrows: the picked control first, then the screen, then pick something */
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (C.sel && C.adjust(dir, e.shiftKey)) { e.preventDefault(); return; }
    if (view && view.keydown && view.keydown(e)) { e.preventDefault(); return; }
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (!C.sel && view && view.keydown && view.keydown(e)) { e.preventDefault(); return; }
    e.preventDefault(); C.move(e.key === 'ArrowDown' ? 1 : -1); return;
  }
  if (e.key === 'Enter' && C.sel && (tgt === C.sel || !tgt.closest('.ctl') || !/^(BUTTON|A)$/.test(tgt.tagName))) { e.preventDefault(); C.activate(); return; }
  if (e.key === '[' || e.key === ']') {
    e.preventDefault();
    const ids = app.defs.map(d => d.id), i = ids.indexOf(BB.state.view);
    app.setView(ids[(i + (e.key === ']' ? 1 : ids.length - 1)) % ids.length]); return;
  }
  if (e.key === '?') { e.preventDefault(); openHelp(); return; }
  if (e.repeat) { if (view && view.keydown && /^Key|^Digit|Semicolon|Quote/.test(code)) e.preventDefault(); return; }
  /* letters & digits: the screen first (piano keys, pads), then control letters, then drums */
  const isLetter = /^Key[A-Z]$/.test(code);
  if (isLetter && e.shiftKey) { if (C.letter(code.slice(3))) { e.preventDefault(); return; } }
  if (view && view.keydown && view.keydown(e)) { e.preventDefault(); return; }
  if (isLetter && C.letter(code.slice(3))) { e.preventDefault(); return; }
  if (DIGIT_DRUM[code]) { e.preventDefault(); TR.drumHit(DIGIT_DRUM[code], 0.95); }
}
function onKeyUp(e) {
  if (e.code === 'Space' && !typing(e.target)) { e.preventDefault(); return; }
  const view = BB.views.current();
  if (view && view.keyup) view.keyup(e);
}

/* ---------- menus ---------- */
function openProjectMenu() {
  const p = BB.store.p;
  const name = h('input', { class: 'text-input', id: 'songNameInput', value: p.name, 'aria-label': 'Song name', maxlength: 60 });
  name.addEventListener('change', () => BB.store.change('Rename song', pp => { pp.name = name.value.trim() || 'Untitled song'; }));
  const songs = BB.store.songs();
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; BB.store.importFile(f).then(() => { TR.stop(); TR.launched = {}; UI.toast('Opened ' + BB.store.p.name); sheet.close(); }).catch(() => UI.toast('That file could not be opened. Pick a .beatboard.json file.')); });
  const item = (icon, title, sub, onClick, extra) => h('button', { class: 'list-item', onclick: onClick }, h('span', { class: 'ico', html: icon, style: { width: '20px', height: '20px', display: 'inline-grid' } }), h('span', 'li-text', h('span', 'li-title', title), sub ? h('span', 'li-sub', sub) : null), extra || null);
  const theme = UI.seg({ label: 'Theme', small: true, value: () => BB.storage.get('beatboard.theme', 'system'), set: v => { BB.storage.set('beatboard.theme', v); applyTheme(); },
    options: [{ id: 'system', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] });
  const keysPref = UI.seg({ label: 'Keyboard letters', small: true, value: () => BB.storage.get('beatboard.showKeys', 'auto'), set: v => { BB.storage.set('beatboard.showKeys', v); applyKeysVisible(); },
    options: [{ id: 'auto', label: 'Auto' }, { id: 'on', label: 'Show' }, { id: 'off', label: 'Hide' }] });
  const midiStatus = h('span', 'li-sub', BB.midi ? BB.midi.statusText() : 'Not available');
  const body = h('div', null,
    h('div', 'sheet-section', h('h4', null, 'Song name'), name),
    h('div', 'sheet-section', h('h4', null, 'Song'),
      h('div', 'list',
        item(I.save, 'Save in this browser', 'Keeps a copy here so you can open it later. Shortcut: Ctrl+S', () => { BB.store.change('Rename song', pp => { pp.name = name.value.trim() || pp.name; }); BB.store.saveAs(); UI.toast('Saved “' + BB.store.p.name + '”'); sheet.close(); }),
        item(I.plus, 'New song', 'Start from a blank page (your current song stays saved if you saved it)', () => confirmNew()),
        item(I.play, 'Load the demo song', 'A finished example to explore and remix', () => { TR.stop(); TR.launched = {}; BB.store.load(BB.demoProject(), 'demo'); sheet.close(); UI.toast('Demo song loaded. Press Play!'); }))),
    songs.length ? h('div', 'sheet-section', h('h4', null, 'Saved in this browser'),
      h('div', 'list', songs.map(s => h('div', 'list-item',
        h('span', 'li-text', h('span', 'li-title', s.name), h('span', 'li-sub', 'Saved ' + new Date(s.updated).toLocaleString())),
        h('button', { class: 'btn sm', onclick: () => { TR.stop(); TR.launched = {}; BB.store.openSong(s.id); sheet.close(); UI.toast('Opened ' + s.name); } }, 'Open'),
        h('button', { class: 'btn sm ghost danger', 'aria-label': 'Delete ' + s.name, onclick: ev => { BB.store.deleteSong(s.id); ev.currentTarget.closest('.list-item').remove(); UI.toast('Deleted ' + s.name); } }, 'Delete'))))) : null,
    h('div', 'sheet-section', h('h4', null, 'Files'),
      h('div', 'list',
        item(I.download, 'Download song file', 'A .beatboard.json file you can back up or open on another device', () => BB.store.exportFile()),
        item(I.upload, 'Open song file', 'Load a .beatboard.json file', () => file.click()),
        item(I.download, 'Export audio (WAV)', 'Render your song to a sound file. More options on the Song screen.', () => { sheet.close(); app.setView('song'); if (BB.exportWav) BB.exportWav(); })), file),
    h('div', 'sheet-section', h('h4', null, 'Settings'),
      h('div', 'row', h('span', { class: 'muted', style: { minWidth: '130px' } }, 'Theme'), theme),
      h('div', 'row', h('span', { class: 'muted', style: { minWidth: '130px' } }, 'Keyboard letters'), keysPref),
      h('div', 'list', item(I.midi, 'Connect a MIDI keyboard', null, () => { if (BB.midi) BB.midi.connect().then(() => { midiStatus.textContent = BB.midi.statusText(); }); }, null))),
  );
  body.querySelector('.list-item:last-child .li-text').append(midiStatus);
  const sheet = UI.sheet({ title: 'Project', body });
}
function confirmNew() {
  const s = UI.sheet({ title: 'Start a new song?', body: h('p', { class: 'muted', style: { margin: 0 } }, 'Your current song is kept in this browser only if you saved it. You can also undo this.'),
    actions: [{ label: 'Cancel' }, { label: 'Start new song', primary: true, onClick: () => {
      TR.stop(); TR.launched = {};
      const before = JSON.stringify(BB.store.p);
      BB.store.load(BB.defaultProject(), 'new');
      BB.store.undoStack.push({ label: 'New song', data: before });
      BB.emit('change', { label: 'new', all: true });
      $$('.sheet-wrap').forEach(w => w.remove());
      app.setView('loops'); UI.toast('Blank song ready. Tap an empty square to add a loop.');
    } }] });
  return s;
}
function openHelp() {
  const tours = [{ id: 'welcome', title: 'Welcome tour', sub: 'A 1-minute tour of the whole app' }].concat(app.defs.filter(d => d.tutorial).map(d => ({ id: d.id, title: d.title + ' tutorial', sub: SUBS[d.id] || '' })));
  const sc = (k, d) => [h('dt', null, k.map((x, i) => [i ? ' ' : '', h('kbd', null, x)])), h('dd', null, d)];
  const body = h('div', null,
    h('div', 'sheet-section', h('h4', null, 'Tutorials'),
      h('div', 'list', tours.map(t => h('button', { class: 'list-item', onclick: () => { sheet.close(); BB.tutorial.start(t.id); } }, h('span', 'li-text', h('span', 'li-title', t.title), h('span', 'li-sub', t.sub)))))),
    h('div', 'sheet-section', h('h4', null, 'Keyboard shortcuts'),
      h('dl', 'shortcuts',
        sc(['Space'], 'Play / stop'),
        sc(['Num 0–9'], 'Tap drums from any screen: 1 kick, 2 snare, 3 clap, 4 hat, 5 open hat, 6 rim, 7–8 toms, 9 crash, 0 shaker. Hold Shift for a softer hit.'),
        sc(['1–0'], 'Same drums on the top number row (on the Loops and Chords screens these pick scenes and chords instead)'),
        sc(['Num .'], 'Record on / off'),
        sc(['Num +', 'Num −'], 'Tempo up / down'),
        sc(['Num *'], 'Metronome on / off'),
        sc(['A–Z'], 'Pick the dial or button with that letter (letters show on each control)'),
        sc(['←', '→'], 'Change the picked control. Hold Shift to move faster.'),
        sc(['↑', '↓'], 'Pick the previous / next control'),
        sc(['Enter'], 'Press the picked button'),
        sc(['Esc'], 'Let go of the picked control (press again to stop playback)'),
        sc(['[', ']'], 'Previous / next screen'),
        sc(['Ctrl Z', 'Ctrl ⇧ Z'], 'Undo / redo'),
        sc(['Ctrl S'], 'Save in this browser'),
        sc(['A W S E D…'], 'Play notes on the Keys screen (like a piano). There, hold Shift with a letter to pick controls.'),
        sc(['?'], 'Open this help'))));
  const sheet = UI.sheet({ title: 'Help', body, wide: true });
}

/* ---------- welcome tour ---------- */
BB.tutorial.register('welcome', {
  title: 'Welcome',
  steps: [
    { target: '#playBtn', title: 'Press Play', text: 'A demo song is loaded so you can hear what Beat Board does. Press <b>Play</b> (or <b>Space</b>) any time to start and stop.' },
    { target: '#tabs', title: 'Six screens', text: '<b>Loops</b> mixes clips live. <b>Beat</b> is the drum machine. <b>Keys</b> is a piano and note editor. <b>Chords</b> has pads that are always in tune. <b>Mixer</b> sets levels and effects. <b>Song</b> puts it all in order.' },
    { target: '.topbar .stepper', title: 'Tempo and key', text: 'Set the speed here. Next to it, <b>Key</b> and <b>Scale</b> set the notes your song uses; everything stays in tune when you change them.' },
    { target: '.rec-btn', title: 'Record', text: 'Turn on Record, then play pads, keys or chords. Everything lands in time with the beat. Made a mistake? <b>Undo</b> is right next to it.' },
    { target: () => $('.view:not([hidden]) .tour-btn') || $('#helpBtn'), title: 'Tutorials everywhere', text: 'Every screen has its own <b>Tutorial</b> button. Hover over any dial or button to see what it does (on a phone, press and hold).' },
    { target: '#helpBtn', title: 'Your keyboard is an instrument', text: 'Tap drums on the <b>number pad</b> from any screen. Press a <b>letter</b> shown on a control to pick it, then use <b>← →</b> to change it. The full list is under Help.' },
  ],
  onDone: () => UI.toast('You are ready. Have fun!'),
});

/* ---------- animation loop ---------- */
function frame() {
  TR.frame();
  drawScope();
  BB.emit('frame');
  requestAnimationFrame(frame);
}
let scopeBuf = null;
function drawScope() {
  const cv = $('#scope'); if (!cv || !cv.offsetParent) return;
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const W = Math.round(r.width * d), H = Math.round(r.height * d);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height);
  c.lineWidth = 1.5; c.strokeStyle = COLORS['--ink'] || '#888'; c.globalAlpha = BB.audio.E ? 0.9 : 0.3; c.beginPath();
  const E = BB.audio.E;
  if (E) {
    if (!scopeBuf) scopeBuf = new Uint8Array(E.analyser.fftSize);
    E.analyser.getByteTimeDomainData(scopeBuf);
    const n = 600;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * r.width, y = r.height / 2 + (scopeBuf[i] - 128) / 128 * (r.height / 2 - 2); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  } else { c.moveTo(0, r.height / 2); c.lineTo(r.width, r.height / 2); }
  c.stroke(); c.globalAlpha = 1;
}

/* ---------- boot ---------- */
function boot() {
  applyTheme();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors); } catch (e) { /* old browsers */ }
  const saved = BB.store.restore();
  BB.store.p = BB.migrate(saved || BB.demoProject());
  BB.store.version++;
  buildTopbar();
  buildViews();
  applyKeysVisible();
  window.matchMedia('(max-width: 720px)').addEventListener('change', applyKeysVisible);
  readColors();
  BB.on('change', routeChange);
  BB.on('step', e => { const v = BB.views.current(); if (v && v.step) try { v.step(e); } catch (err) { console.error(err); } });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  const unlock = () => { BB.audio.init(); };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('blur', () => TR.allNotesOff());
  document.addEventListener('visibilitychange', () => { if (document.hidden) TR.allNotesOff(); });
  const hash = (location.hash || '').slice(1);
  const start = BB.views.byId[hash] ? hash : (BB.storage.get('beatboard.view', 'loops'));
  app.setView(BB.views.byId[start] ? start : 'loops');
  if (BB.midi) BB.midi.autoConnect();
  requestAnimationFrame(frame);
  if (!BB.storage.get('beatboard.welcomed', false)) {
    BB.storage.set('beatboard.welcomed', true);
    setTimeout(() => {
      UI.sheet({
        title: 'Welcome to Beat Board',
        body: h('div', null,
          h('p', { style: { margin: '0 0 8px' } }, 'A music studio for making beats and songs, no experience needed. A demo song is loaded so you can hear how it works.'),
          h('p', { class: 'muted', style: { margin: 0 } }, 'Take the 1-minute tour, or jump in and press Play. Every screen has its own tutorial, and you can hover over (or press and hold) anything to learn what it does.')),
        actions: [{ label: 'Just explore' }, { label: 'Take the tour', primary: true, onClick: () => setTimeout(() => BB.tutorial.start('welcome'), 50) }],
      });
    }, 400);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

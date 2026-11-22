/* Beat Board · Song screen
   Put scenes in order to make a full song, play it from start to finish, and export it as a WAV file.
   The arrangement lives in BB.store.p.song = [{scene, repeat}]. Every edit is one undo step. */
(function () {
'use strict';
const BB = window.BB, { h, clamp } = BB, UI = BB.ui, TR = BB.transport, C = BB.controls;

/* ---------------- constants & icons ---------------- */
const MAX_REPEAT = 16, MAX_BLOCKS = 64;
const MIN_BLOCK_W = 104, MIN_BAR_W = 20, MAX_BAR_W = 64, GAP = 6, TILE_W = 84;
const INFO = { info: { song: true } };
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const LN = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const I = {
  play: UI.ICONS.play, stop: UI.ICONS.stop, copy: UI.ICONS.copy, trash: UI.ICONS.trash, download: UI.ICONS.download,
  minus: svg(`<path d="M6 12h12" ${LN}/>`),
  add: svg(`<path d="M12 6v12M6 12h12" ${LN}/>`),
  left: svg(`<path d="M14.5 6 8.5 12l6 6" ${LN}/>`),
  right: svg(`<path d="m9.5 6 6 6-6 6" ${LN}/>`),
  up: svg(`<path d="m6 14.5 6-6 6 6" ${LN}/>`),
  down: svg(`<path d="m6 9.5 6 6 6-6" ${LN}/>`),
  loop: svg('<path d="M16.5 3.5 19.5 6.5l-3 3M19 6.5H9a5 5 0 0 0-5 5v.5M7.5 20.5l-3-3 3-3M5 17.5h10a5 5 0 0 0 5-5V12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  clear: svg(`<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" ${LN}/>`),
};

/* ---------------- helpers ---------------- */
const P = () => BB.store.p;
const clipOn = (p, t, s) => { const c = p.clips[t][s]; return !!c && !BB.clipIsEmpty(t, c); };
const sceneHasClips = (p, s) => BB.TRACKS.some(t => clipOn(p, t.id, s));
const nonEmpty = p => BB.range(BB.SCENE_COUNT).filter(s => sceneHasClips(p, s));
const sceneName = (p, s) => (p.scenes[s] && p.scenes[s].name) || 'Scene ' + (s + 1);
const sceneBars = (p, s) => BB.sceneLength(p, s) / 16;
const stepSec = p => 60 / p.bpm / 4;
const fmtTime = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const barsTxt = n => n + (n === 1 ? ' bar' : ' bars');
const timesTxt = r => (r === 1 ? 'once' : r === 2 ? 'twice' : r + ' times');
const listJoin = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const fileBase = s => String(s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'song';
const vis = sel => { const e = typeof sel === 'string' ? BB.$(sel) : sel; return e && e.offsetParent !== null ? e : null; };
const openLoops = s => { if (s != null) BB.setState({ scene: s }); if (BB.app) BB.app.setView('loops'); };
const emptyToast = () => UI.toast('Your song is empty. Tap a scene or a quick template to start it.');

/* ---------------- quick templates ---------------- */
const ROLE_ORDER = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
const ROLE_RX = { intro: /intro|start|open/i, verse: /verse/i, chorus: /chorus|hook|drop|refrain/i, bridge: /bridge|break|middle/i, outro: /outro|ending|\bend\b|finale/i };
/* Which scene plays each song section. Names win (a scene called "Chorus" is the chorus), then the
   remaining scenes fill the most important sections in scene order, and missing ones reuse others. */
function popRoles(p, scenes) {
  const R = {}, used = new Set();
  for (const r of ROLE_ORDER) {
    const s = scenes.find(x => !used.has(x) && ROLE_RX[r].test(sceneName(p, x)));
    if (s != null) { R[r] = s; used.add(s); }
  }
  const pool = scenes.filter(s => !used.has(s));
  const want = ['verse', 'chorus', 'bridge', 'intro', 'outro'].filter(r => R[r] == null).slice(0, pool.length);
  want.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)).forEach((r, i) => { R[r] = pool[i]; });
  if (R.verse == null) R.verse = R.chorus != null ? R.chorus : scenes[0];
  if (R.chorus == null) R.chorus = R.verse;
  if (R.bridge == null) R.bridge = R.verse;
  if (R.intro == null) R.intro = R.verse;
  if (R.outro == null) R.outro = R.intro;
  return R;
}
/* [section, target length in bars]. A 4-bar scene gives intro ×1, verse ×2, chorus ×2 … */
const POP_PLAN = [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 4], ['chorus', 8], ['bridge', 4], ['chorus', 8], ['outro', 4]];
function buildPop(p, scenes) {
  const R = popRoles(p, scenes), out = [];
  for (const [role, target] of POP_PLAN) {
    const s = R[role], rep = clamp(Math.round(target / sceneBars(p, s)), 1, MAX_REPEAT), last = out[out.length - 1];
    if (last && last.scene === s && last.repeat + rep <= MAX_REPEAT) last.repeat += rep;
    else out.push({ scene: s, repeat: rep });
  }
  return out;
}
const TEMPLATES = [
  { id: 'pop', name: 'Pop song', key: 'Y', desc: 'Intro, verse, chorus, verse, chorus, bridge, chorus, outro',
    tip: 'Builds a classic song shape from your scenes: intro, verse, chorus, verse, chorus, bridge, chorus, outro. Scenes named Intro, Verse, Chorus and so on are used for those parts.',
    build: buildPop },
  { id: 'tape', name: 'Beat tape', key: 'B', desc: 'Every scene ×4, one after another',
    tip: 'Plays each of your scenes 4 times in a row, in order. Good for showing off beats or a long jam.',
    build: (p, sc) => sc.map(s => ({ scene: s, repeat: 4 })) },
  { id: 'simple', name: 'Simple', key: 'S', desc: 'Every scene ×2, in order',
    tip: 'Plays each scene twice, in order. A quick way to hear everything you have made.',
    build: (p, sc) => sc.map(s => ({ scene: s, repeat: 2 })) },
];

/* ---------------- view state (not saved, not undoable) ---------------- */
let root, scroller, track, playhead, dropMark, addTile, arrPanel, emptyBox, emptyText, emptyLoopsBtn, emptySlot, countPill, clearBtn;
let toolsBar, toolsInfo, repStep, moveGrp, moveL, moveR, dupBtn, delBtn, fromBtn;
let playBtn, loopTgl, lcd, lcdBars, lcdTime;
let addPanel, palSec, tplSec, palette, palGrid, tplBtns = [];
let exportPanel, expWhat, wavBtn, expScene, expBars, expBtn, progEl, progText, progTimer = 0;
let sel = 0, blockEls = [], palHi = -1, playInfo = null, busy = false, flashIdx = -1, revealSel = false;
let exportScene = -1, exportScenePicked = false, exportBars = 8, drag = null, suppressClick = false;

/* ---------------- song edits (one undo step each) ---------------- */
function undoIf(version, selAfter) {
  if (BB.store.version !== version) { UI.toast('Something changed since then. Use Undo in the top bar.'); return; }
  if (selAfter != null) sel = selAfter;
  const l = BB.store.undo(); if (l) UI.toast('Undid: ' + l);
}
function explainEmpty(s) {
  UI.toast('Scene ' + (s + 1) + ' has no loops yet. Add some on the Loops screen first.', { action: { label: 'Open Loops', onClick: () => openLoops(s) }, ms: 5000 });
}
function addBlock(s) {
  const p = P();
  if (!sceneHasClips(p, s)) { explainEmpty(s); return; }
  if (p.song.length >= MAX_BLOCKS) { UI.toast('Your song has ' + MAX_BLOCKS + ' blocks, the most it can hold. Try more repeats instead.'); return; }
  const repeat = clamp(Math.round(4 / sceneBars(p, s)), 1, MAX_REPEAT), name = sceneName(p, s);
  sel = p.song.length; flashIdx = sel; revealSel = true;
  BB.store.change('Add ' + name, pp => { pp.song.push({ scene: s, repeat }); }, INFO);
  if (BB.isMobile()) UI.toast('Added ' + name + ' ×' + repeat + ' at the end', { ms: 1600 });
}
function setRepeat(i, r) {
  const b = P().song[i]; if (!b) return;
  r = clamp(Math.round(r), 1, MAX_REPEAT);
  sel = i;
  if (r === b.repeat) { applySel(); if (r === MAX_REPEAT) UI.toast('16 repeats is the most one block can have. Duplicate it for more.'); return; }
  BB.store.change('Repeat ×' + r, pp => { pp.song[i].repeat = r; }, INFO);
}
function moveTo(from, to) {
  const n = P().song.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
  sel = to; revealSel = true;
  BB.store.change('Move block', pp => { const [b] = pp.song.splice(from, 1); pp.song.splice(to, 0, b); }, INFO);
}
const moveBlock = (i, dir) => moveTo(i, i + dir);
function dupBlock(i) {
  const p = P(); if (!p.song[i]) return;
  if (p.song.length >= MAX_BLOCKS) { UI.toast('Your song has ' + MAX_BLOCKS + ' blocks, the most it can hold.'); return; }
  sel = i + 1; flashIdx = i + 1; revealSel = true;
  BB.store.change('Duplicate block', pp => { pp.song.splice(i + 1, 0, BB.clone(pp.song[i])); }, INFO);
}
function removeBlock(i) {
  const p = P(), b = p.song[i]; if (!b) return;
  const name = sceneName(p, b.scene);
  sel = Math.max(0, Math.min(i, p.song.length - 2));
  BB.store.change('Remove block', pp => { pp.song.splice(i, 1); }, INFO);
  const v = BB.store.version;
  UI.toast('Removed ' + name, { action: { label: 'Undo', onClick: () => undoIf(v, i) }, ms: 5000 });
}
function clearSong() {
  if (!P().song.length) return;
  const keep = sel;
  BB.store.change('Clear song', pp => { pp.song = []; }, INFO);
  const v = BB.store.version;
  UI.toast('Cleared the song', { action: { label: 'Undo', onClick: () => undoIf(v, keep) }, ms: 6000 });
}
function applyTemplate(t) {
  const p = P(), scenes = nonEmpty(p);
  if (!scenes.length) { UI.toast('Make some loops first (on the Loops screen). Then a template can turn them into a song.', { action: { label: 'Open Loops', onClick: () => openLoops(0) }, ms: 5000 }); return; }
  const song = t.build(p, scenes);
  if (JSON.stringify(song) === JSON.stringify(p.song)) { UI.toast('Your song already uses the ' + t.name + ' template.'); return; }
  const replacing = p.song.length > 0;
  sel = 0; revealSel = true;
  if (scroller) scroller.scrollLeft = 0;
  BB.store.change(t.name + ' template', pp => { pp.song = song; }, INFO);
  const v = BB.store.version, len = fmtTime(BB.songTimeline(P()).total * stepSec(P()));
  if (replacing) UI.toast('Made a ' + t.name + ' arrangement (' + len + ')', { action: { label: 'Undo', onClick: () => undoIf(v) }, ms: 6000 });
  else UI.toast('Made a ' + t.name + ' arrangement (' + len + '). Press Play song!');
}

/* ---------------- playback ---------------- */
function playFrom(i) {
  const n = P().song.length; if (!n) { emptyToast(); return; }
  select(clamp(i, 0, n - 1));
  TR.playSongFrom(sel);
}
function togglePlaySong() {
  if (TR.playing && TR.mode === 'song') { TR.stop(); return; }
  if (!P().song.length) { emptyToast(); return; }
  TR.playSongFrom(0);
}
function syncPlayBtn() {
  if (!playBtn) return;
  const on = TR.playing && TR.mode === 'song';
  playBtn.querySelector('.btn-label').textContent = on ? 'Stop' : 'Play song';
  playBtn.querySelector('.ico').innerHTML = on ? I.stop : I.play;
  playBtn.setAttribute('aria-pressed', String(on));
  loopTgl.update();
}

/* ---------------- selection (the block cursor) ---------------- */
function select(i, o = {}) {
  const n = blockEls.length; if (!n) return;
  sel = clamp(i, 0, n - 1);
  applySel();
  const el = blockEls[sel];
  if (o.reveal) reveal(sel);
  if (o.focus || (document.activeElement && track.contains(document.activeElement))) el.focus({ preventScroll: true });
}
function applySel() {
  blockEls.forEach((el, j) => {
    const on = j === sel;
    el.classList.toggle('is-sel', on); el.tabIndex = on ? 0 : -1;
    if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  });
  syncTools();
  syncExportDefault();
}
/* Scroll a block into view: sideways inside the timeline on desktop, the page on phones. */
function reveal(i) {
  const el = blockEls[i]; if (!el || !el.offsetParent) return;
  if (BB.isMobile()) { el.scrollIntoView({ block: 'nearest' }); return; }
  const r = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
  if (r.left < sr.left + 8) scroller.scrollLeft += r.left - sr.left - 24;
  else if (r.right > sr.right - 8) scroller.scrollLeft += r.right - sr.right + 24 + (i === blockEls.length - 1 ? TILE_W : 0);
}

/* ---------------- rendering ---------------- */
function render() {
  const p = P(), tl = BB.songTimeline(p), n = p.song.length;
  if (drag) endDrag(false);
  sel = n ? clamp(sel, 0, n - 1) : 0;
  const hadFocus = document.activeElement && track.contains(document.activeElement) && document.activeElement.classList.contains('sb');
  renderTimeline(p, tl);
  renderLcd();
  renderPalette(p);
  renderTemplates(p);
  renderExport(p, tl);
  placeSections(n === 0, p);
  countPill.textContent = n ? n + (n === 1 ? ' block' : ' blocks') : 'empty';
  clearBtn.hidden = !n;
  if (hadFocus && blockEls[sel]) blockEls[sel].focus({ preventScroll: true });
  if (revealSel) { revealSel = false; requestAnimationFrame(() => reveal(sel)); }
  flashIdx = -1;
}

function renderTimeline(p, tl) {
  const n = tl.blocks.length, maxLen = Math.max(16, ...tl.blocks.map(b => b.len));
  blockEls = tl.blocks.map((b, i) => blockEl(p, b, i, n, maxLen));
  track.replaceChildren(...blockEls, addTile, playhead, dropMark);
  addTile.hidden = !n;
  layoutBars(tl);
  applySel();
  applyPlaying();
}

function blockEl(p, b, i, n, maxLen) {
  const sc = b.scene, name = sceneName(p, sc), bars = b.len / 16, sec = b.len * stepSec(p), startBar = b.start / 16 + 1;
  const tracks = BB.TRACKS.filter(t => clipOn(p, t.id, sc)), hollow = !tracks.length;
  const btn = (cls, icon, label, tip, fn, off) => h('button', {
    class: 'sb-btn ' + cls, 'aria-label': label, 'data-tip': tip, 'data-tip-title': label, html: icon, disabled: !!off,
    onclick: e => { e.stopPropagation(); C.clear(); fn(); } });
  const lanes = h('div', { class: 'sb-lanes', 'aria-hidden': 'true' }, BB.TRACKS.map(t => {
    const on = clipOn(p, t.id, sc);
    let segs = on ? b.repeat * Math.max(1, Math.round(b.sceneLen / (p.clips[t.id][sc].bars * 16))) : 1;
    if (segs > 16) segs = b.repeat;
    return h('i', { class: 'c-' + t.color + (on ? ' on' : ''), style: '--n:' + segs });
  }));
  const tip = hollow
    ? `Scene ${sc + 1} is empty now, so this block is ${barsTxt(bars)} of silence. Add loops to the scene, or remove the block.`
    : `${name} plays ${timesTxt(b.repeat)} here: ${barsTxt(bars)}, ${fmtTime(sec)} long, starting at bar ${startBar}. It uses ${listJoin(tracks.map(t => t.name.toLowerCase()))}. Click to pick it, double-click to play from here${BB.isMobile() ? '' : ', or drag it to a new spot'}.`;
  const el = h('div', {
    class: 'sb' + (hollow ? ' hollow' : '') + (i === flashIdx ? ' is-new' : ''), role: 'listitem', tabindex: '-1', dataset: { i: String(i) },
    style: `--bars:${bars};--rel:${(b.len / maxLen).toFixed(3)}`,
    'aria-label': `Block ${i + 1} of ${n}: ${name}, played ${timesTxt(b.repeat)}, ${barsTxt(bars)}`,
    'data-tip': tip, 'data-tip-title': `${sc + 1} · ${name} ×${b.repeat}` },
  h('div', { class: 'sb-ruler', 'aria-hidden': 'true' }, String(startBar)),
  h('div', 'sb-card',
    h('div', 'sb-prog'),
    h('div', 'sb-top',
      h('span', 'sb-num', String(sc + 1)),
      h('span', 'sb-name', name),
      btn('sb-play', I.play, 'Play from here', 'Play the song starting at this block. Shortcut: double-click the block, or pick it and press Enter.', () => playFrom(i))),
    h('div', 'sb-meta', h('span', null, hollow ? 'Empty scene' : barsTxt(bars)), h('span', null, fmtTime(sec)), h('span', 'sb-at', 'from bar ' + startBar)),
    lanes,
    h('div', 'sb-tools',
      h('span', 'sb-rep',
        btn('sb-dec', I.minus, 'Fewer repeats', 'Play this scene one time less. Keyboard: pick the block and press −.', () => setRepeat(i, b.repeat - 1), b.repeat <= 1),
        h('b', { class: 'sb-x', 'aria-label': 'Plays ' + timesTxt(b.repeat) }, '×' + b.repeat),
        btn('sb-inc', I.add, 'More repeats', 'Play this scene one more time in a row. Keyboard: pick the block and press =.', () => setRepeat(i, b.repeat + 1), b.repeat >= MAX_REPEAT)),
      h('span', 'sb-more',
        btn('', I.up, 'Move earlier', 'Move this block one place earlier in the song.', () => moveBlock(i, -1), i === 0),
        btn('', I.down, 'Move later', 'Move this block one place later in the song.', () => moveBlock(i, 1), i === n - 1),
        btn('', I.copy, 'Duplicate', 'Put a copy of this block right after it.', () => dupBlock(i)),
        btn('danger', I.trash, 'Remove', 'Take this block out of the song. Your scene and its loops stay safe.', () => removeBlock(i))))));
  return el;
}

/* Bar width so the whole song fits the timeline when it can (short blocks keep a readable minimum). */
function layoutBars(tl) {
  if (!scroller || !track) return;
  tl = tl || BB.songTimeline(P());
  const n = tl.blocks.length, cs = getComputedStyle(scroller);
  const avail = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - TILE_W - GAP * n - 2;
  const bars = tl.blocks.map(b => b.len / 16);
  let w = avail / Math.max(1, tl.total / 16);
  for (let k = 0; k < 4; k++) {
    let fixed = 0, free = 0;
    for (const b of bars) { if (b * w < MIN_BLOCK_W) fixed += MIN_BLOCK_W; else free += b; }
    if (!free) break;
    w = (avail - fixed) / free;
  }
  track.style.setProperty('--bar-w', clamp(w, MIN_BAR_W, MAX_BAR_W).toFixed(2) + 'px');
}

function syncTools() {
  if (!toolsBar) return;
  const p = P(), n = p.song.length, b = p.song[sel];
  toolsBar.hidden = !b;
  if (!b) return;
  const tb = BB.songTimeline(p).blocks[sel];
  toolsInfo.replaceChildren(
    h('span', 'sb-num', String(b.scene + 1)),
    h('span', 'sg-ti-text', h('b', null, sceneName(p, b.scene)), h('span', 'muted', ` · block ${sel + 1} of ${n} · ${barsTxt(tb.len / 16)} · from bar ${tb.start / 16 + 1}`)));
  repStep.update();
  moveL.disabled = sel === 0; moveR.disabled = sel === n - 1;
}

function renderLcd() {
  const p = P(), tl = TR.timeline(), bars = tl.total / 16, total = fmtTime(tl.total * stepSec(p));
  if (playInfo) {
    lcdBars.replaceChildren(String(Math.floor(playInfo.songStep / 16) + 1), h('span', 'of', '/' + bars));
    lcdTime.replaceChildren(fmtTime(playInfo.songStep * stepSec(p)), h('span', 'of', '/' + total));
  } else {
    lcdBars.textContent = String(bars);
    lcdTime.textContent = total;
  }
  lcd.setAttribute('data-tip', tl.total
    ? `Your song is ${barsTxt(bars)} long, about ${total} at ${p.bpm} BPM. While it plays, this shows where you are. Change the tempo in the top bar to make it faster or slower.`
    : 'How long your song is. Add scenes to see it grow.');
}

function palBtn(p, s) {
  const has = sceneHasClips(p, s), name = sceneName(p, s), bars = sceneBars(p, s);
  const tracks = BB.TRACKS.filter(t => clipOn(p, t.id, s));
  const b = h('button', {
    class: 'sg-pal' + (has ? '' : ' empty'), 'aria-disabled': has ? null : 'true', dataset: { s: String(s) },
    'aria-label': has ? `Add scene ${s + 1}: ${name}` : `Scene ${s + 1} is empty`,
    'data-tip-title': `${s + 1} · ${name}${has ? '' : ' (empty)'}`,
    'data-tip': has ? `Adds ${name} to the end of your song. It is ${barsTxt(bars)} long and uses ${listJoin(tracks.map(t => t.name.toLowerCase()))}.`
      : `This scene has no loops yet. Add loops to it first (on the Loops screen), then it can go in your song.`,
    onclick: () => { C.clear(); if (has) addBlock(s); else explainEmpty(s); } },
  h('span', 'sg-pal-top', h('span', 'sb-num', String(s + 1)), h('span', 'sg-pal-name', name), h('span', { class: 'sg-pal-plus', html: I.add })),
  h('span', 'sg-pal-meta',
    h('span', { class: 'sg-dots', 'aria-hidden': 'true' }, BB.TRACKS.map(t => h('i', 'c-' + t.color + (clipOn(p, t.id, s) ? ' on' : '')))),
    h('span', 'sg-pal-len', has ? barsTxt(bars) : 'Empty')));
  return b;
}
function renderPalette(p) {
  const scenes = nonEmpty(p);
  palGrid.replaceChildren(...BB.range(BB.SCENE_COUNT).map(s => palBtn(p, s)));
  if (!scenes.includes(palHi)) palHi = scenes.length ? scenes[0] : -1;
  syncPalHi();
}
function syncPalHi() { BB.$$('.sg-pal', palGrid).forEach(b => b.classList.toggle('hi', +b.dataset.s === palHi)); }
function movePalHi(dir) {
  const scenes = nonEmpty(P()); if (!scenes.length) return;
  const i = scenes.indexOf(palHi);
  palHi = scenes[i < 0 ? 0 : (i + dir + scenes.length) % scenes.length];
  syncPalHi();
}

function renderTemplates(p) {
  const scenes = nonEmpty(p), sd = stepSec(p);
  tplBtns.forEach(({ t, el, mini, len }) => {
    el.setAttribute('aria-disabled', scenes.length ? 'false' : 'true');
    el.classList.toggle('off', !scenes.length);
    if (!scenes.length) { mini.replaceChildren(); len.textContent = ''; return; }
    const song = t.build(p, scenes), rank = s => scenes.length < 2 ? 0.45 : scenes.indexOf(s) / (scenes.length - 1);
    let steps = 0;
    mini.replaceChildren(...song.map(b => {
      const L = BB.sceneLength(p, b.scene) * b.repeat; steps += L;
      return h('i', { style: `flex:${L} 0 0;--k:${Math.round(18 + rank(b.scene) * 58)}%` });
    }));
    len.textContent = fmtTime(steps * sd);
  });
}

function sceneOptions() {
  const p = P(), sc = nonEmpty(p);
  if (!sc.length) return [{ id: '-1', label: 'No scenes yet' }];
  return sc.map(s => ({ id: String(s), label: (s + 1) + ' · ' + sceneName(p, s) }));
}
function barOptions() {
  const sd = stepSec(P());
  return [1, 2, 4, 8, 16, 32].map(b => ({ id: String(b), label: barsTxt(b) + ' · ' + fmtTime(b * 16 * sd) }));
}
function syncExportDefault() {
  if (!expScene) return;
  const p = P(), sc = nonEmpty(p), b = p.song[sel];
  if (!exportScenePicked && b && sc.includes(b.scene)) exportScene = b.scene;
  if (!sc.includes(exportScene)) exportScene = sc.length ? sc[0] : -1;
  expScene.update();
}
function renderExport(p, tl) {
  expScene.refill(); expBars.refill();
  syncExportDefault();
  const has = nonEmpty(p).length > 0;
  expWhat.textContent = tl.total ? `Whole song · ${barsTxt(tl.total / 16)} · ${fmtTime(tl.total * stepSec(p))}` : 'Add scenes to your song first';
  wavBtn.disabled = busy || !tl.total;
  expBtn.disabled = busy || !has;
  expScene.select.disabled = busy || !has;
  expBars.select.disabled = busy;
}

/* Empty song: the templates and scene buttons move into the explanation box. */
function placeSections(empty, p) {
  root.classList.toggle('is-empty', empty);
  emptyBox.hidden = !empty; scroller.hidden = empty;
  addPanel.hidden = empty;
  if (empty) {
    const any = nonEmpty(p).length > 0;
    emptyText.textContent = any
      ? 'A song is your scenes played in order, like Intro → Verse → Chorus. Start with a quick template, or tap scenes one by one to add them.'
      : 'First make some loops on the Loops screen. Each scene you fill shows up here, ready to line up into a song.';
    emptyLoopsBtn.hidden = any;
    if (tplSec.parentNode !== emptySlot || emptySlot.firstChild !== tplSec) emptySlot.append(tplSec, palSec);
  } else if (palSec.parentNode !== addPanel) addPanel.append(palSec, tplSec);
}

/* ---------------- playhead ---------------- */
function applyPlaying() {
  blockEls.forEach((el, j) => el.classList.toggle('playing', !!playInfo && j === playInfo.block));
  if (playInfo) placePlayhead(0); else track.classList.remove('has-ph');
}
function setPlay(info) {
  const prev = playInfo ? playInfo.block : -1;
  playInfo = info;
  if (!info || info.block !== prev) {
    applyPlaying();
    if (info && !drag && root && !root.hidden) revealPlaying(info.block);
  }
  if (info) placePlayhead(0);
  renderLcd();
}
function revealPlaying(i) {
  const el = blockEls[i]; if (!el || BB.isMobile() || !el.offsetParent) return;
  const r = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
  if (r.left < sr.left || r.right > sr.right) scroller.scrollTo({ left: scroller.scrollLeft + r.left - sr.left - 24, behavior: 'smooth' });
}
function placePlayhead(frac) {
  if (!playInfo) return;
  const el = blockEls[playInfo.block], tb = TR.timeline().blocks[playInfo.block];
  if (!el || !tb) return;
  const f = clamp((playInfo.pos + frac) / tb.len, 0, 1);
  el.style.setProperty('--p', f.toFixed(4));
  if (BB.isMobile()) { track.classList.remove('has-ph'); return; }
  playhead.style.transform = `translateX(${(el.offsetLeft + f * el.offsetWidth).toFixed(1)}px)`;
  track.classList.add('has-ph');
}

/* ---------------- drag to reorder (mouse and pen) ---------------- */
function onPointerDown(e) {
  const el = e.target.closest('.sb');
  if (!el || e.button !== 0 || e.target.closest('button') || e.pointerType === 'touch' || BB.isMobile()) return;
  drag = { from: +el.dataset.i, el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, on: false, to: +el.dataset.i };
}
function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.on) {
    if (Math.abs(e.clientX - drag.x0) < 6 && Math.abs(e.clientY - drag.y0) < 6) return;
    startDrag();
  }
  drag.x = e.clientX;
  updateDrag();
}
function startDrag() {
  const d = drag;
  d.on = true;
  try { d.el.setPointerCapture(d.pid); } catch (_) { /* noop */ }
  BB.tooltip.hide(); C.clear();
  d.startX = d.x0 - track.getBoundingClientRect().left;
  d.mids = blockEls.map(b => b.offsetLeft + b.offsetWidth / 2);
  d.lefts = blockEls.map(b => b.offsetLeft);
  d.rights = blockEls.map(b => b.offsetLeft + b.offsetWidth);
  select(d.from);
  d.el.classList.add('dragging'); track.classList.add('is-dragging'); document.body.classList.add('sg-grabbing');
  const loop = () => {
    if (!drag || !drag.on) return;
    const sr = scroller.getBoundingClientRect(), edge = 48;
    if (drag.x < sr.left + edge) scroller.scrollLeft -= Math.ceil((sr.left + edge - drag.x) / 4);
    else if (drag.x > sr.right - edge) scroller.scrollLeft += Math.ceil((drag.x - sr.right + edge) / 4);
    updateDrag();
    drag.raf = requestAnimationFrame(loop);
  };
  d.raf = requestAnimationFrame(loop);
}
function updateDrag() {
  const d = drag; if (!d || !d.on) return;
  const x = d.x - track.getBoundingClientRect().left, n = blockEls.length;
  d.el.style.transform = `translateX(${(x - d.startX).toFixed(1)}px)`;
  let k = d.mids.findIndex(m => x < m); if (k < 0) k = n;
  d.to = k > d.from ? k - 1 : k;
  if (d.to === d.from) { dropMark.classList.remove('on'); return; }
  const mx = k < n ? d.lefts[k] - GAP / 2 : d.rights[n - 1] + GAP / 2;
  dropMark.style.transform = `translateX(${mx.toFixed(1)}px)`;
  dropMark.classList.add('on');
}
function endDrag(commit) {
  const d = drag; drag = null;
  if (!d || !d.on) return;
  cancelAnimationFrame(d.raf);
  try { d.el.releasePointerCapture(d.pid); } catch (_) { /* noop */ }
  d.el.classList.remove('dragging'); d.el.style.transform = '';
  track.classList.remove('is-dragging'); dropMark.classList.remove('on'); document.body.classList.remove('sg-grabbing');
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (commit && d.to !== d.from) moveTo(d.from, d.to);
}

/* ---------------- export ---------------- */
/* Offline render that creates each voice just before it plays (OfflineAudioContext.suspend), so the
   audio graph stays small. Same output as BB.renderAudio, which builds every voice of the whole song
   up front and gets slower than real time on long songs; this also reports real progress.
   Uses BB.renderAudio when the core sets BB.renderAudio.incremental, or when suspend is missing (Firefox). */
async function renderWav(opts, onProgress) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (BB.renderAudio.incremental || !OAC || typeof OAC.prototype.suspend !== 'function') return BB.renderAudio(Object.assign({}, opts, { onProgress }));
  const p = BB.clone(BB.store.p), sd = 60 / p.bpm / 4, sr = 44100;
  let total, resolver;
  if (opts.mode === 'scene') {
    const scene = opts.scene || 0, bars = opts.bars || Math.max(4, BB.sceneLength(p, scene) / 16);
    total = bars * 16;
    resolver = (id, abs) => { const c = p.clips[id][scene]; return c ? { clip: c, pos: abs % (c.bars * 16) } : null; };
  } else {
    const tl = BB.songTimeline(p);
    if (!tl.total) throw new Error('The song is empty. Add scenes to the song first.');
    total = tl.total;
    resolver = (id, abs) => { const b = tl.blocks.find(x => abs >= x.start && abs < x.start + x.len); if (!b) return null; const c = p.clips[id][b.scene]; return c ? { clip: c, pos: (abs - b.start) % (c.bars * 16) } : null; };
  }
  const oac = new OAC(2, Math.ceil(sr * (total * sd + 3.5)), sr);
  const E = BB.createEngine(oac, p);
  E.applyMix(p);
  const t0 = 0.05, CHUNK = 32;
  let next = 0, failed = null;
  const schedule = upto => {
    for (; next < Math.min(upto, total); next++) {
      const abs = next, t = t0 + abs * sd + (abs % 2 ? p.swing * sd * 0.66 : 0);
      if (abs % 4 === 0) E.pump(t, sd * 4);
      for (const tr of BB.TRACKS) { const r = resolver(tr.id, abs); if (r) BB.playTrackStep(E, p, tr.id, r.clip, r.pos, t, sd); }
    }
  };
  schedule(CHUNK * 2);
  for (let k = 1; k * CHUNK < total; k++) {
    const at = Math.floor((t0 + k * CHUNK * sd) * sr / 128) * 128 / sr;
    oac.suspend(at).then(() => {
      try { schedule((k + 2) * CHUNK); } catch (e) { failed = failed || e; }
      if (onProgress) onProgress(Math.min(0.99, (k * CHUNK) / total));
      oac.resume();
    });
  }
  const buf = await oac.startRendering();
  if (failed) throw failed;
  if (onProgress) onProgress(1);
  return buf;
}
async function runExport(kind) {
  if (busy) return;
  const p = P();
  let opts, fname, what;
  if (kind === 'song') {
    const tl = BB.songTimeline(p);
    if (!tl.total) { emptyToast(); return; }
    opts = { mode: 'song' }; fname = fileBase(p.name) + '.wav';
    what = 'your song (' + fmtTime(tl.total * stepSec(p)) + ')';
  } else {
    const s = exportScene;
    if (s < 0 || !sceneHasClips(p, s)) { UI.toast('Pick a scene that has loops in it.'); return; }
    opts = { mode: 'scene', scene: s, bars: exportBars };
    fname = fileBase(p.name) + '-' + fileBase(sceneName(p, s)) + '.wav';
    what = sceneName(p, s) + ' (' + barsTxt(exportBars) + ')';
  }
  setBusy(true, 'Making a sound file of ' + what);
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 40))); // let the progress state paint first
  try {
    const buf = await renderWav(opts, setProgress);
    setProgress(1, 'Saving ' + fname + '…');
    await new Promise(r => setTimeout(r, 20));
    const blob = BB.encodeWav(buf);
    BB.download(blob, fname);
    UI.toast('Saved ' + fname + ' (' + fmtTime(buf.duration) + '). Check your downloads.', { ms: 4000 });
  } catch (err) {
    console.warn('[song] export failed', err);
    UI.toast('Sorry, the sound file could not be made: ' + ((err && err.message) || err), { ms: 6000 });
  } finally {
    setBusy(false);
  }
}
let progLabel = '', progT0 = 0;
function setBusy(on, text) {
  busy = on;
  exportPanel.classList.toggle('busy', on);
  progEl.hidden = !on;
  progEl.classList.add('indet');
  progEl.style.setProperty('--f', 0);
  clearInterval(progTimer);
  if (on) {
    progLabel = text; progT0 = Date.now();
    progText.textContent = text + '…';
    /* no progress reports (core renderer): show the time spent so it still feels alive */
    progTimer = setInterval(() => { if (progEl.classList.contains('indet')) progText.textContent = progLabel + '… ' + Math.round((Date.now() - progT0) / 1000) + 's'; }, 500);
  }
  renderExport(P(), BB.songTimeline(P()));
}
function setProgress(f, text) {
  if (!busy) return;
  progEl.classList.remove('indet');
  progEl.style.setProperty('--f', clamp(f, 0, 1).toFixed(3));
  progText.textContent = text || progLabel + '… ' + Math.round(clamp(f, 0, 1) * 100) + '%';
}

/* Called by the Project menu ("Export audio") after it opens this screen. */
BB.exportWav = function () {
  if (BB.state.view !== 'song' && BB.app) BB.app.setView('song');
  if (!exportPanel) return;
  exportPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  exportPanel.classList.remove('sg-flash'); void exportPanel.offsetWidth; exportPanel.classList.add('sg-flash');
  if (busy) return;
  if (BB.songTimeline(P()).total) runExport('song');
  else {
    UI.toast('Your song is empty, so there is nothing to export yet. Add scenes, or export one scene below.', { ms: 5000 });
    if (!expBtn.disabled) { expBtn.focus({ preventScroll: true }); C.select(expBtn, { noScroll: true }); }
  }
};

/* ---------------- build the screen ---------------- */
function mount(el) {
  root = el;

  /* header */
  playBtn = UI.button({ label: 'Play song', key: 'P', icon: I.play, cls: 'primary sg-play', instant: true, onClick: togglePlaySong,
    tip: 'Plays your whole song from the first block. Press again to stop. This also flips the top-bar switch from Loop to Song.' });
  playBtn.id = 'song-play';
  loopTgl = UI.toggle({ label: 'Loop song', key: 'O', icon: I.loop, cls: 'sg-loop', value: () => TR.loopSong,
    set: v => { TR.loopSong = !!v; BB.emit('transport', { loopSong: TR.loopSong }); },
    tip: 'When this is on, the song starts again from the beginning after the last block, so it never stops. Handy for practicing over it.' });
  lcdBars = h('b'); lcdTime = h('b');
  lcd = h('div', { class: 'sg-lcd', 'data-tip-title': 'Song length', role: 'status', 'aria-live': 'off' },
    h('span', 'sg-lcd-cell', h('span', 'lbl', 'Bars'), lcdBars),
    h('span', 'sg-lcd-cell', h('span', 'lbl', 'Time'), lcdTime));
  const head = h('div', 'view-head',
    h('div', 'sg-titles', h('h2', 'view-title', 'Song'), h('p', 'view-sub', 'Put your scenes in order to make a full song.')),
    UI.tourButton('song'),
    h('div', 'sg-headctl', lcd, playBtn, loopTgl));

  /* arrangement timeline */
  playhead = h('div', { class: 'sg-playhead', 'aria-hidden': 'true' });
  dropMark = h('div', { class: 'sg-drop', 'aria-hidden': 'true' });
  addTile = h('button', { class: 'sg-addtile', 'aria-label': 'Add a scene',
    'data-tip-title': 'Add a scene', 'data-tip': 'New blocks go at the end of the song. Pick a scene from the list below to add it.',
    onclick: () => { const t = vis(palette); if (!t) return; t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('sg-flash'); void t.offsetWidth; t.classList.add('sg-flash'); } },
  h('span', { class: 'ico', html: I.add }), h('span', null, 'Add'));
  track = h('div', { class: 'sg-track', role: 'list', 'aria-label': 'Song blocks, in playing order' });
  scroller = h('div', { class: 'sg-scroll' }, track);
  track.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(true); });
  window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pid) endDrag(false); });
  track.addEventListener('click', e => {
    if (suppressClick) return;
    const b = e.target.closest('.sb'); if (!b || e.target.closest('button')) return;
    C.clear(); select(+b.dataset.i, { focus: true });
  });
  track.addEventListener('dblclick', e => { const b = e.target.closest('.sb'); if (b && !e.target.closest('button')) playFrom(+b.dataset.i); });
  if (window.ResizeObserver) new ResizeObserver(() => { layoutBars(); if (playInfo) placePlayhead(0); }).observe(scroller);

  emptyText = h('p', 'sg-empty-text');
  emptyLoopsBtn = UI.button({ label: 'Open Loops', cls: 'sm', onClick: () => openLoops(0), tip: 'Go to the Loops screen to fill your scenes with ready-made loops.' });
  emptySlot = h('div', 'sg-empty-slot');
  emptyBox = h('div', { class: 'empty sg-empty' },
    h('div', { class: 'sg-empty-art', 'aria-hidden': 'true' }, h('i', 'c-drums'), h('i', 'c-chords'), h('i', 'c-bass'), h('i', 'c-melody')),
    h('h4', null, 'Your song is empty'), emptyText, emptyLoopsBtn, emptySlot);

  /* selected block toolbar (desktop) */
  toolsInfo = h('div', 'sg-ti');
  repStep = UI.stepper({ label: 'Repeat', key: 'X', min: 1, max: MAX_REPEAT, fmt: v => '×' + v,
    value: () => (P().song[sel] ? P().song[sel].repeat : 1), set: v => setRepeat(sel, v),
    tip: 'How many times the picked block plays in a row. The = and - keys do this too.' });
  moveL = h('button', { class: 'btn sm', 'aria-label': 'Move earlier', 'data-tip': 'Move the picked block one place earlier. Shift+← does this too.', 'data-tip-title': 'Move earlier', onclick: () => moveBlock(sel, -1) }, h('span', { class: 'ico', html: I.left }), h('span', 'btn-label', 'Earlier'));
  moveR = h('button', { class: 'btn sm', 'aria-label': 'Move later', 'data-tip': 'Move the picked block one place later. Shift+→ does this too.', 'data-tip-title': 'Move later', onclick: () => moveBlock(sel, 1) }, h('span', 'btn-label', 'Later'), h('span', { class: 'ico', html: I.right }));
  moveGrp = h('div', { class: 'sg-move', role: 'group', 'aria-label': 'Move block', 'data-tip-title': 'Move block', 'data-tip': 'Change where the picked block sits in the song. You can also drag blocks with the mouse.' }, moveL, moveR);
  C.add(moveGrp, { key: 'G', label: 'Move block', adjust: dir => moveBlock(sel, dir), text: () => 'Place ' + (sel + 1) + ' of ' + P().song.length });
  dupBtn = UI.button({ label: 'Duplicate', key: 'D', icon: I.copy, cls: 'sm', onClick: () => dupBlock(sel), tip: 'Put a copy of the picked block right after it.' });
  delBtn = UI.button({ label: 'Remove', icon: I.trash, cls: 'sm ghost danger', onClick: () => removeBlock(sel), tip: 'Take the picked block out of the song (the Delete key does this too). Your scene and its loops stay safe.' });
  fromBtn = UI.button({ label: 'Play from here', key: 'F', icon: I.play, cls: 'sm', instant: true, onClick: () => playFrom(sel), tip: 'Play the song starting at the picked block. Enter does this too.' });
  toolsBar = h('div', { class: 'sg-tools', id: 'song-tools' }, toolsInfo, h('span', 'grow'),
    h('div', 'sg-tools-grp sg-tools-rep', h('span', 'lbl', 'Repeat'), repStep),
    h('div', 'sg-tools-grp sg-tools-edit', moveGrp, dupBtn, delBtn),
    fromBtn);

  countPill = h('span', 'pill');
  clearBtn = UI.button({ label: 'Clear', icon: I.clear, cls: 'sm ghost', onClick: clearSong, tip: 'Remove every block to start the arrangement over. Your scenes and loops stay safe, and you can undo it.' });
  arrPanel = h('section', { class: 'panel sg-arr', id: 'song-arr', 'aria-label': 'Arrangement' },
    h('div', 'panel-head', h('h3', null, 'Arrangement'), countPill,
      h('p', 'hint sg-hint-desk', 'Click a block to pick it · drag to move · double-click to play from there'),
      h('p', 'hint sg-hint-phone', 'Tap a card to pick it, then use its buttons'),
      h('span', 'grow'), clearBtn),
    scroller, emptyBox, toolsBar);

  /* add: scene palette + quick templates */
  palGrid = h('div', 'sg-pal-grid');
  palette = h('div', { class: 'sg-palette', id: 'song-palette', role: 'group', 'aria-label': 'Add a scene' }, palGrid);
  C.add(palette, { key: 'A', label: 'Add a scene', adjust: dir => movePalHi(dir), activate: () => { if (palHi >= 0) addBlock(palHi); },
    text: () => (palHi >= 0 ? (palHi + 1) + ' · ' + sceneName(P(), palHi) : 'No scenes yet') });
  palSec = h('div', 'sg-sec',
    h('div', 'sg-sec-head', h('span', 'lbl', 'Scenes'), h('span', 'hint', 'Tap one to add it to the end of the song')),
    palette);
  const tplWrap = h('div', 'sg-tpls');
  tplBtns = TEMPLATES.map(t => {
    const mini = h('span', { class: 'sg-tpl-mini', 'aria-hidden': 'true' }), len = h('span', 'sg-tpl-len');
    const el = h('button', { class: 'sg-tpl', 'data-tip-title': t.name, 'data-tip': t.tip + ' If you already have a song, it is replaced (you can undo).',
      onclick: () => { C.clear(); applyTemplate(t); } },
    h('span', 'sg-tpl-top', h('span', 'sg-tpl-name', t.name), len), h('span', 'sg-tpl-desc', t.desc), mini);
    C.add(el, { key: t.key, label: t.name + ' template', activate: () => applyTemplate(t) });
    tplWrap.append(el);
    return { t, el, mini, len };
  });
  tplSec = h('div', { class: 'sg-sec', id: 'song-templates' },
    h('div', 'sg-sec-head', h('span', 'lbl', 'Quick templates'), h('span', 'hint', 'One tap builds a whole song from your scenes')),
    tplWrap);
  addPanel = h('section', { class: 'panel sg-add', id: 'song-add', 'aria-label': 'Add to your song' },
    h('div', 'panel-head', h('h3', null, 'Add to your song')), palSec, tplSec);

  /* export */
  expWhat = h('span', 'sg-exp-what');
  wavBtn = UI.button({ label: 'Download WAV', key: 'W', icon: I.download, cls: 'primary', onClick: () => runExport('song'),
    tip: 'Turns your whole song into a WAV sound file and saves it. Send it to friends, put it in a video, or upload it anywhere.' });
  expScene = UI.select({ label: 'Scene to export', key: 'C', small: true, options: sceneOptions, value: () => String(exportScene),
    set: v => { exportScene = +v; exportScenePicked = true; }, tip: 'Which scene to save as its own sound file.' });
  expBars = UI.select({ label: 'Length to export', key: 'N', small: true, options: barOptions, value: () => String(exportBars),
    set: v => { exportBars = +v; }, tip: 'How long the file is. The scene loops until it fills this many bars.' });
  expBtn = UI.button({ label: 'Export scene', key: 'E', icon: I.download, cls: 'sm', onClick: () => runExport('scene'),
    tip: 'Saves just this one scene, looped, as a WAV file. Great for sharing a beat or a loop.' });
  progText = h('span', 'sg-prog-text');
  progEl = h('div', { class: 'sg-progress', role: 'status', 'aria-live': 'polite', hidden: true }, h('span', 'sg-meter', h('i')), progText);
  exportPanel = h('section', { class: 'panel sg-export', id: 'song-export', 'aria-label': 'Export' },
    h('div', 'panel-head', h('h3', null, 'Export'), h('p', 'hint', 'Make a sound file you can share')),
    h('div', 'sg-exp-main', wavBtn, expWhat),
    h('div', 'sg-exp-one', h('span', 'lbl', 'Export one scene'), h('div', 'sg-exp-ctl', expScene, expBars, expBtn)),
    progEl);

  el.append(head, arrPanel, h('div', 'sg-lower', addPanel, exportPanel));

  BB.on('transport', () => { syncPlayBtn(); if (!TR.playing || TR.mode !== 'song') { if (playInfo) setPlay(null); } });
  BB.on('frame', () => {
    if (!playInfo || BB.state.view !== 'song' || !BB.audio.ctx) return;
    placePlayhead(clamp((BB.audio.ctx.currentTime - playInfo.t) / stepSec(P()), 0, 0.98));
  });
  syncPlayBtn();
  render();
}

/* ---------------- keyboard ---------------- */
function keydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key, code = e.code, n = P().song.length, tgt = e.target;
  if (k === 'ArrowLeft' || k === 'ArrowRight' || (BB.isMobile() && (k === 'ArrowUp' || k === 'ArrowDown'))) {
    if (!n) return false;
    const dir = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
    if (e.shiftKey) moveBlock(sel, dir);
    else select(sel + dir, { reveal: true });
    return true;
  }
  if (!n) return false;
  if (k === 'Delete' || k === 'Backspace') { removeBlock(sel); return true; }
  if (code === 'Equal' || code === 'Minus') { setRepeat(sel, P().song[sel].repeat + (code === 'Equal' ? 1 : -1)); return true; }
  if (k === 'Enter') {
    if (tgt && /^(BUTTON|A)$/.test(tgt.tagName)) return false; // let the focused button press itself
    playFrom(sel); return true;
  }
  return false;
}

/* ---------------- register ---------------- */
BB.views.register({
  id: 'song', title: 'Song', letterMode: 'plain',
  tip: 'Put your scenes in order to make a full song, then export it.',
  mount,
  render,
  show() { syncPlayBtn(); if (!(TR.playing && TR.mode === 'song')) setPlay(null); requestAnimationFrame(() => { layoutBars(); if (playInfo) placePlayhead(0); }); },
  hide() { if (drag) endDrag(false); },
  step(e) {
    if (!e || !e.song) { if (playInfo) setPlay(null); return; }
    setPlay({ block: e.song.block, pos: e.song.posInBlock, songStep: e.song.songStep, t: e.t });
  },
  keydown,
  tutorial: [
    { view: 'song', target: '#song-arr', title: 'Scenes are song sections',
      text: 'A <b>scene</b> is one section of your song, like an Intro, Verse or Chorus. Here you line them up. Your song plays these blocks from left to right, and wider blocks last longer.' },
    { view: 'song', target: () => vis('#song-palette') || vis('#song-arr'), title: 'Add blocks',
      text: 'Tap a scene to add it to the end of your song. The colored dots show which tracks have loops in it. Grey scenes are still empty: fill them on the <b>Loops</b> screen first.' },
    { view: 'song', target: () => vis('.sb.is-sel .sb-rep') || vis('#song-arr'), title: 'Repeats',
      text: '<b>×2</b> means the scene plays twice in a row. Use <b>−</b> and <b>+</b> to make a section longer or shorter. On a keyboard, pick a block with <b>← →</b> and press <b>=</b> or <b>-</b>.' },
    { view: 'song', target: () => vis('#song-tools .sg-tools-edit') || vis('.sb.is-sel .sb-more') || vis('#song-arr'), title: 'Change the order',
      text: 'Drag a block with the mouse to move it, or use the arrow buttons. <b>Duplicate</b> copies a block and the bin removes it. Made a mistake? <b>Undo</b> is in the top bar.' },
    { view: 'song', target: '#song-play', title: 'Play your song',
      text: '<b>Play song</b> plays everything from the start, and <b>▶</b> on a block starts from there. While it plays, the <b>Loop / Song</b> switch in the top bar shows <b>Song</b>. Flip it back to <b>Loop</b> to jam with single loops again.' },
    { view: 'song', target: '#song-templates', title: 'Quick templates',
      text: 'Not sure where to start? <b>Pop song</b> builds an intro, verses, choruses, a bridge and an outro from your scenes. <b>Beat tape</b> plays each scene 4 times and <b>Simple</b> plays each one twice. You can always undo.' },
    { view: 'song', target: '#song-export', title: 'Share it',
      text: '<b>Download WAV</b> turns your whole song into a sound file you can send to friends or upload. <b>Export one scene</b> saves a single loop. <b>Try this:</b> tap <b>Pop song</b>, press <b>Play song</b>, then download it!' },
  ],
});
})();

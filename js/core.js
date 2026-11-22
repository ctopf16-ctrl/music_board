/* Beat Board · core
   Namespace, helpers, events, music theory, the song data model, undo/redo and saving.
   Every other file hangs off window.BB. Load this first. */
(function () {
'use strict';
const BB = window.BB = window.BB || {};

/* ---------------- helpers ---------------- */
BB.$ = (s, r = document) => r.querySelector(s);
BB.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
BB.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
BB.uid = () => Math.random().toString(36).slice(2, 10);
BB.clone = o => JSON.parse(JSON.stringify(o));
BB.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
BB.range = n => Array.from({ length: n }, (_, i) => i);

/* h('div', {class:'x', onclick: fn, 'data-tip': '...'}, child, 'text', [more]) */
BB.h = function (tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (typeof attrs === 'string') e.className = attrs;
  else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  if (tag === 'button' && !e.hasAttribute('type')) e.type = 'button';
  return e;
};

/* localStorage that never throws (private windows, blocked storage) */
BB.storage = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

BB.isMobile = () => window.matchMedia('(max-width: 720px)').matches;
BB.finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Save a Blob as a file (works on a normal web page; some sandboxed previews block downloads). */
BB.download = function (blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = BB.h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
};

/* ---------------- events ---------------- */
const handlers = {};
BB.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); return () => BB.off(ev, fn); };
BB.off = (ev, fn) => { const a = handlers[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
BB.emit = (ev, data) => {
  (handlers[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[BB]', ev, e); } });
};

/* ---------------- music theory ---------------- */
const T = BB.theory = {};
T.NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
T.MODES = {
  major:      { name: 'Major',          steps: [0, 2, 4, 5, 7, 9, 11],  desc: 'Bright and happy. The default for pop.' },
  minor:      { name: 'Minor',          steps: [0, 2, 3, 5, 7, 8, 10],  desc: 'Darker and moodier. Great for emotional songs, trap and lo-fi.' },
  dorian:     { name: 'Dorian',         steps: [0, 2, 3, 5, 7, 9, 10],  desc: 'Minor with a hopeful lift. Common in funk, jazz and lo-fi.' },
  mixolydian: { name: 'Mixolydian',     steps: [0, 2, 4, 5, 7, 9, 10],  desc: 'Major with a bluesy, rock edge.' },
  harmonic:   { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11],  desc: 'Dramatic and exotic. Popular in trap and film music.' },
};
T.scale = mode => (T.MODES[mode] || T.MODES.major).steps;
T.isMinorish = mode => T.scale(mode)[2] === 3;
T.penta = mode => (T.isMinorish(mode) ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]);
T.pcName = pc => T.NOTE[((pc % 12) + 12) % 12];
T.noteName = m => T.NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
T.mtof = m => 440 * Math.pow(2, (m - 69) / 12);
T.place = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12); // lowest MIDI note >= lo with this pitch class
T.inScale = (pc, key, mode) => T.scale(mode).includes((((pc - key) % 12) + 12) % 12);
T.degreeOf = (pc, key, mode) => T.scale(mode).indexOf((((pc - key) % 12) + 12) % 12);
T.nearestDegree = function (pc, key, mode) {
  const rel = (((pc - key) % 12) + 12) % 12, sc = T.scale(mode);
  let best = 0, bd = 99;
  sc.forEach((s, i) => { const d = Math.min(Math.abs(s - rel), 12 - Math.abs(s - rel)); if (d < bd) { bd = d; best = i; } });
  return best;
};
/* MIDI note for scale degree d (may be negative or > 6) counted from tonicMidi */
T.scaleMidi = function (d, tonicMidi, mode) {
  const sc = T.scale(mode), o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return tonicMidi + sc[i] + 12 * o;
};

T.QUALITIES = {
  maj:   { iv: [0, 4, 7],      sfx: '',      name: 'major' },
  min:   { iv: [0, 3, 7],      sfx: 'm',     name: 'minor' },
  dim:   { iv: [0, 3, 6],      sfx: '°',     name: 'diminished' },
  aug:   { iv: [0, 4, 8],      sfx: '+',     name: 'augmented' },
  sus2:  { iv: [0, 2, 7],      sfx: 'sus2',  name: 'suspended 2nd' },
  sus4:  { iv: [0, 5, 7],      sfx: 'sus4',  name: 'suspended 4th' },
  dom7:  { iv: [0, 4, 7, 10],  sfx: '7',     name: 'dominant 7th' },
  maj7:  { iv: [0, 4, 7, 11],  sfx: 'maj7',  name: 'major 7th' },
  m7:    { iv: [0, 3, 7, 10],  sfx: 'm7',    name: 'minor 7th' },
  m7b5:  { iv: [0, 3, 6, 10],  sfx: 'm7♭5',  name: 'half-diminished' },
  add9:  { iv: [0, 4, 7, 14],  sfx: 'add9',  name: 'major add 9' },
  madd9: { iv: [0, 3, 7, 14],  sfx: 'm(add9)', name: 'minor add 9' },
  maj6:  { iv: [0, 4, 7, 9],   sfx: '6',     name: 'major 6th' },
  m6:    { iv: [0, 3, 7, 9],   sfx: 'm6',    name: 'minor 6th' },
};
T.MINORISH_Q = new Set(['min', 'dim', 'm7', 'm7b5', 'madd9', 'm6']);
T.chordName = (root, q) => T.pcName(root) + ((T.QUALITIES[q] || T.QUALITIES.maj).sfx);
T.chordPcs = (root, q) => (T.QUALITIES[q] || T.QUALITIES.maj).iv.map(x => (root + x) % 12);
/* Voice a chord: each chord tone placed inside one octave starting at lo. Returns sorted MIDI notes. */
T.voice = function (root, q, lo = 55) {
  return T.chordPcs(root, q).map(pc => T.place(pc, lo)).sort((a, b) => a - b);
};
const NUMERALS = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
T.numeral = function (key, root, q) {
  let n = NUMERALS[(((root - key) % 12) + 12) % 12];
  if (T.MINORISH_Q.has(q)) n = n.replace(/[IV]+/, s => s.toLowerCase());
  n += { dim: '°', m7b5: 'ø7', dom7: '7', aug: '+', maj7: 'maj7', m7: '7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', madd9: 'add9', maj6: '6', m6: '6' }[q] || '';
  return n;
};
/* Diatonic chord on scale degree (0-6) built by stacking thirds.
   flavor: 'triad' | 'seventh' | 'sus' | 'add9' */
T.diatonic = function (key, mode, degree, flavor = 'triad') {
  const sc = T.scale(mode), at = k => sc[(degree + k) % 7] + (degree + k >= 7 ? 12 : 0);
  const r = at(0), third = at(2) - r, fifth = at(4) - r, sev = at(6) - r;
  let q = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : (fifth === 6 ? 'dim' : 'min');
  if (flavor === 'seventh') {
    if (q === 'maj') q = sev === 11 ? 'maj7' : 'dom7';
    else if (q === 'min') q = sev === 10 ? 'm7' : 'min';
    else if (q === 'dim') q = 'm7b5';
  } else if (flavor === 'sus') {
    if (q === 'maj' || q === 'min') q = 'sus2';
  } else if (flavor === 'add9') {
    if (q === 'maj') q = 'add9'; else if (q === 'min') q = 'madd9';
  }
  const root = (key + r) % 12;
  return { root, q, degree, name: T.chordName(root, q), numeral: T.numeral(key, root, q) };
};

/* ---------------- song model ---------------- */
BB.STEPS_PER_BAR = 16;
BB.SCENE_COUNT = 8;
BB.BAR_CHOICES = [1, 2, 4, 8];
BB.TRACKS = [
  { id: 'drums',  type: 'drums',  name: 'Drums',  color: 'drums',  desc: 'Kick, snare, hats and more' },
  { id: 'bass',   type: 'notes',  name: 'Bass',   color: 'bass',   desc: 'Low notes that hold the song together', inst: 'synthBass', range: [24, 64], octave: 2 },
  { id: 'chords', type: 'chords', name: 'Chords', color: 'chords', desc: 'Groups of notes played together', inst: 'epiano' },
  { id: 'melody', type: 'notes',  name: 'Melody', color: 'melody', desc: 'The tune people hum', inst: 'bell', range: [48, 96], octave: 4 },
  { id: 'keys',   type: 'notes',  name: 'Keys',   color: 'keys',   desc: 'Extra parts: arpeggios, riffs, counter-melodies', inst: 'pluck', range: [36, 88], octave: 3 },
];
BB.TRACK = Object.fromEntries(BB.TRACKS.map(t => [t.id, t]));
BB.NOTE_TRACKS = BB.TRACKS.filter(t => t.type === 'notes').map(t => t.id);

/* 10 drum sounds. `pad` is the number-pad key that plays it from anywhere. */
BB.DRUM_VOICES = [
  { id: 'kick',   name: 'Kick',       short: 'Kick',  pad: '1', desc: 'The low thump on the beat' },
  { id: 'snare',  name: 'Snare',      short: 'Snare', pad: '2', desc: 'The crack, usually on beats 2 and 4' },
  { id: 'clap',   name: 'Clap',       short: 'Clap',  pad: '3', desc: 'A hand clap. Layer it with the snare or use it alone' },
  { id: 'hat',    name: 'Closed hat', short: 'Hat',   pad: '4', desc: 'Short tick that keeps time' },
  { id: 'ohat',   name: 'Open hat',   short: 'Open',  pad: '5', desc: 'Longer, sizzling hi-hat' },
  { id: 'rim',    name: 'Rim',        short: 'Rim',   pad: '6', desc: 'A wooden click, nice for accents' },
  { id: 'tomL',   name: 'Low tom',    short: 'Tom L', pad: '7', desc: 'Deep drum, used in fills' },
  { id: 'tomH',   name: 'High tom',   short: 'Tom H', pad: '8', desc: 'Higher drum, used in fills' },
  { id: 'crash',  name: 'Crash',      short: 'Crash', pad: '9', desc: 'Big cymbal hit to start a new section' },
  { id: 'shaker', name: 'Shaker',     short: 'Shake', pad: '0', desc: 'Soft rhythmic shimmer' },
];
BB.DRUM = Object.fromEntries(BB.DRUM_VOICES.map(v => [v.id, v]));

BB.CHORD_STYLES = [
  { id: 'hold',   name: 'Hold',     desc: 'Each chord rings out until the next one.' },
  { id: 'strum',  name: 'Strum',    desc: 'Notes roll in quickly from low to high, like a guitar.' },
  { id: 'pulse',  name: 'Pulse',    desc: 'The chord repeats on every eighth note.' },
  { id: 'stabs',  name: 'Stabs',    desc: 'Short, punchy hits in a syncopated rhythm.' },
  { id: 'bounce', name: 'Bounce',   desc: 'Low note on the beat, chord on the off-beat. A piano groove.' },
  { id: 'arp',    name: 'Arp up',   desc: 'Plays the chord one note at a time, going up.' },
  { id: 'arpdown', name: 'Arp down', desc: 'Plays the chord one note at a time, going down.' },
];

/* ---- chord rhythm: how a chords clip strikes ----
   rhythm = {hits: one bar of 16 steps (0 = no strike, 0.01-1 = strike strength), feel, len}.
   A chord always strikes when it starts; hits add more strikes while it lasts. */
const hitsOf = steps => BB.range(16).map(i => (steps.includes(i) ? (i % 4 === 0 ? 1 : 0.8) : 0));
BB.CHORD_RHYTHMS = [
  { id: 'hold', name: 'Hold', short: 'Hold', steps: [], desc: 'One strike when the chord changes. It rings until the next chord. Calm and simple.' },
  { id: 'x1', name: 'Once a bar', short: '1×', steps: [0], desc: 'Strikes on beat 1 of every bar.' },
  { id: 'x2', name: 'Twice a bar', short: '2×', steps: [0, 8], desc: 'Strikes on beats 1 and 3.' },
  { id: 'x4', name: 'Every beat', short: '4×', steps: [0, 4, 8, 12], desc: 'Strikes on all 4 beats. A steady piano or guitar feel.' },
  { id: 'x8', name: 'Every 8th', short: '8×', steps: [0, 2, 4, 6, 8, 10, 12, 14], desc: '8 even strikes per bar. Driving, like pop and rock.' },
  { id: 'x16', name: 'Every 16th', short: '16×', steps: BB.range(16), desc: '16 fast strikes per bar. Sounds great with Arp.' },
  { id: 'off', name: 'Off-beats', short: 'Off', steps: [2, 6, 10, 14], desc: 'Strikes between the beats. The reggae and house sound.' },
  { id: 'push', name: 'Push', short: 'Push', steps: [0, 3, 6, 10], desc: 'Syncopated stabs that push ahead of the beat. Funky.' },
  { id: 'charleston', name: 'Charleston', short: 'Swing', steps: [0, 6], desc: 'Beat 1, then just before beat 3. A classic swing rhythm.' },
].map(r => Object.assign(r, { hits: hitsOf(r.steps) }));
BB.CHORD_FEELS = [
  { id: 'block', name: 'Together', desc: 'All the chord notes at once.' },
  { id: 'strum', name: 'Strum', desc: 'Notes roll in quickly from low to high, like a guitar.' },
  { id: 'arp', name: 'Arp up', desc: 'One note per strike, climbing through the chord. Try it with 8× or 16×.' },
  { id: 'arpdown', name: 'Arp down', desc: 'One note per strike, falling through the chord.' },
  { id: 'bounce', name: 'Bounce', desc: 'Low note on each beat, the chord in between. A piano groove.' },
];
BB.CHORD_LENGTHS = [
  { id: 'ring', name: 'Ring', desc: 'Each strike rings until the next one.' },
  { id: 'short', name: 'Short', desc: 'Each strike is short and punchy.' },
];
const LEGACY_RHYTHM = { hold: ['hold', 'block', 'ring'], strum: ['hold', 'strum', 'ring'], pulse: ['x8', 'block', 'short'], stabs: ['push', 'block', 'short'], bounce: ['x8', 'bounce', 'ring'], arp: ['x16', 'arp', 'ring'], arpdown: ['x16', 'arpdown', 'ring'] };
BB.rhythmFromPreset = function (id, feel = 'block', len = 'ring') {
  const r = BB.CHORD_RHYTHMS.find(x => x.id === id) || BB.CHORD_RHYTHMS[0];
  return { hits: r.hits.slice(), feel, len };
};
/* The rhythm of a chords clip (older songs only have clip.style; this converts them). */
BB.chordRhythm = function (clip) {
  const r = clip && clip.rhythm;
  if (r && Array.isArray(r.hits) && r.hits.length === 16) return r;
  const l = LEGACY_RHYTHM[(clip && clip.style) || 'hold'] || LEGACY_RHYTHM.hold;
  return BB.rhythmFromPreset(l[0], l[1], l[2]);
};
/* Which preset a rhythm matches ('custom' if none) and how many strikes per bar it has */
BB.rhythmPresetId = function (r) {
  const m = BB.CHORD_RHYTHMS.find(x => x.hits.every((v, i) => (v > 0) === (r.hits[i] > 0)));
  return m ? m.id : 'custom';
};
BB.rhythmCount = r => r.hits.filter(x => x > 0).length;

/* Write into one box of a progression. value: {r, q} a chord, {rest:true} silence, or null meaning
   "same as before" (merges into the chord on its left). Only that box changes: every box after it keeps
   sounding exactly as it did. start and len are in beats (slots). */
BB.setChordCell = function (clip, start, len, value) {
  const n = clip.slots.length, end = Math.min(n, start + len);
  let after = null;
  if (end < n && !clip.slots[end]) { let i = end - 1; while (i >= 0 && !clip.slots[i]) i--; if (i >= 0) after = BB.clone(clip.slots[i]); }
  clip.slots[start] = value ? BB.clone(value) : null;
  for (let i = start + 1; i < end; i++) clip.slots[i] = null;
  if (after) clip.slots[end] = after;
  return clip;
};
/* The finest box size (in beats) needed to show a progression without hiding a change: 4 bar, 2 half bar, 1 beat */
BB.chordGridNeeded = function (clip) {
  let g = 4;
  if (clip) clip.slots.forEach((s, i) => { if (s) { if (i % 2) g = 1; else if (i % 4) g = Math.min(g, 2); } });
  return g;
};

BB.MASTER_DEFAULT = { volume: 0.8, tone: 0.85, space: 0.3, echo: 0.2, echoTime: 'd8', drive: 0, pump: 0, lofi: 0 };
BB.TRACK_MIX_DEFAULT = { vol: 0.8, pan: 0, mute: false, solo: false, tone: 1, space: 0.25, echo: 0.1 };

BB.newClip = function (trackId, opts = {}) {
  const type = BB.TRACK[trackId].type;
  if (type === 'drums') {
    const bars = opts.bars || 1;
    return {
      name: opts.name || 'Beat', bars, kit: opts.kit || 'lofi',
      steps: Object.fromEntries(BB.DRUM_VOICES.map(v => [v.id, new Array(bars * 16).fill(0)])),
      rolls: {},
    };
  }
  if (type === 'chords') {
    const bars = opts.bars || 4;
    return { name: opts.name || 'Chords', bars, style: opts.style || 'hold', rhythm: opts.rhythm ? BB.clone(opts.rhythm) : BB.chordRhythm({ style: opts.style || 'hold' }), slots: new Array(bars * 4).fill(null) };
  }
  return { name: opts.name || BB.TRACK[trackId].name, bars: opts.bars || 2, notes: [] };
};

/* Change a clip's length. Growing repeats the existing bars so a 1-bar loop becomes 2 copies. */
BB.resizeClip = function (trackId, clip, bars) {
  const type = BB.TRACK[trackId].type, old = clip.bars;
  if (bars === old) return clip;
  if (type === 'drums') {
    for (const v of BB.DRUM_VOICES) {
      const a = clip.steps[v.id] || [], n = new Array(bars * 16);
      for (let i = 0; i < n.length; i++) n[i] = a[i % (old * 16)] || 0;
      clip.steps[v.id] = n;
      if (clip.rolls && clip.rolls[v.id]) { const r = clip.rolls[v.id], nr = new Array(bars * 16); for (let i = 0; i < nr.length; i++) nr[i] = r[i % (old * 16)] || 0; clip.rolls[v.id] = nr; }
    }
  } else if (type === 'chords') {
    const n = new Array(bars * 4);
    for (let i = 0; i < n.length; i++) n[i] = clip.slots[i % (old * 4)] ? BB.clone(clip.slots[i % (old * 4)]) : null;
    if (bars < old) n.splice(bars * 4);
    clip.slots = n;
  } else {
    const len = bars * 16, oldLen = old * 16;
    if (bars > old) {
      const extra = [];
      for (let k = 1; k * oldLen < len; k++) for (const nt of clip.notes) if (nt.s + k * oldLen < len) extra.push({ ...nt, s: nt.s + k * oldLen });
      clip.notes = clip.notes.concat(extra);
    } else {
      clip.notes = clip.notes.filter(nt => nt.s < len).map(nt => ({ ...nt, d: Math.min(nt.d, len - nt.s) }));
    }
  }
  clip.bars = bars;
  return clip;
};

BB.clipIsEmpty = function (trackId, clip) {
  if (!clip) return true;
  const type = BB.TRACK[trackId].type;
  if (type === 'drums') return !BB.DRUM_VOICES.some(v => (clip.steps[v.id] || []).some(x => x > 0));
  if (type === 'chords') return !clip.slots.some(s => s && !s.rest);
  return clip.notes.length === 0;
};

/* Active chord at a step inside a chord clip: {root, q, start, end} (steps) or null */
BB.chordAt = function (clip, pos) {
  if (!clip || !clip.slots.length) return null;
  const n = clip.slots.length, slot = Math.floor(pos / 4) % n;
  for (let i = slot; i >= 0; i--) {
    const s = clip.slots[i];
    if (!s) continue;
    if (s.rest) return null;
    let j = i + 1; while (j < n && !clip.slots[j]) j++;
    return { root: s.r, q: s.q, start: i * 4, end: j * 4, slot: i };
  }
  return null;
};

BB.defaultProject = function () {
  const clips = {};
  for (const t of BB.TRACKS) clips[t.id] = new Array(BB.SCENE_COUNT).fill(null);
  const tracks = {};
  for (const t of BB.TRACKS) tracks[t.id] = Object.assign({}, BB.TRACK_MIX_DEFAULT, t.inst ? { inst: t.inst } : {});
  tracks.drums.space = 0.08; tracks.drums.echo = 0; tracks.bass.space = 0.04; tracks.bass.echo = 0;
  tracks.melody.echo = 0.35; tracks.chords.vol = 0.7; tracks.melody.vol = 0.7; tracks.keys.vol = 0.65;
  return {
    v: 1, id: BB.uid(), name: 'New song',
    bpm: 90, key: 0, mode: 'major', swing: 0.1,
    master: Object.assign({}, BB.MASTER_DEFAULT),
    tracks,
    scenes: BB.range(BB.SCENE_COUNT).map(i => ({ name: 'Scene ' + (i + 1) })),
    clips,
    song: [],
  };
};

/* Fill in anything missing so older or hand-edited files still open. */
BB.migrate = function (p) {
  const d = BB.defaultProject();
  if (!p || typeof p !== 'object') return d;
  const out = Object.assign({}, d, p);
  out.master = Object.assign({}, d.master, p.master || {});
  out.tracks = {};
  for (const t of BB.TRACKS) out.tracks[t.id] = Object.assign({}, d.tracks[t.id], (p.tracks || {})[t.id] || {});
  out.scenes = BB.range(BB.SCENE_COUNT).map(i => Object.assign({ name: 'Scene ' + (i + 1) }, (p.scenes || [])[i] || {}));
  out.clips = {};
  for (const t of BB.TRACKS) {
    const arr = ((p.clips || {})[t.id] || []).slice(0, BB.SCENE_COUNT);
    while (arr.length < BB.SCENE_COUNT) arr.push(null);
    out.clips[t.id] = arr.map(c => {
      if (!c) return null;
      if (t.type === 'drums') { const base = BB.newClip('drums', { bars: c.bars || 1 }); c.steps = Object.assign(base.steps, c.steps || {}); c.rolls = c.rolls || {}; c.kit = c.kit || 'lofi'; }
      if (t.type === 'chords') { c.slots = c.slots || new Array((c.bars || 4) * 4).fill(null); c.style = c.style || 'hold'; c.rhythm = BB.clone(BB.chordRhythm(c)); }
      if (t.type === 'notes') c.notes = c.notes || [];
      return c;
    });
  }
  out.song = Array.isArray(p.song) ? p.song.filter(b => b && b.scene >= 0 && b.scene < BB.SCENE_COUNT).map(b => ({ scene: b.scene, repeat: BB.clamp(b.repeat || 1, 1, 16) })) : [];
  out.bpm = BB.clamp(+out.bpm || 90, 50, 200);
  if (!T.MODES[out.mode]) out.mode = 'major';
  return out;
};

/* Steps in a scene = longest clip in that row (at least one bar). */
BB.sceneLength = function (p, scene) {
  let bars = 0;
  for (const t of BB.TRACKS) { const c = p.clips[t.id][scene]; if (c && !BB.clipIsEmpty(t.id, c)) bars = Math.max(bars, c.bars); }
  return Math.max(1, bars) * 16;
};
BB.songTimeline = function (p) {
  let at = 0;
  const blocks = p.song.map((b, i) => { const sceneLen = BB.sceneLength(p, b.scene), len = sceneLen * b.repeat; const o = { index: i, scene: b.scene, repeat: b.repeat, start: at, len, sceneLen }; at += len; return o; });
  return { blocks, total: at };
};

/* ---------------- store: the current song + undo ---------------- */
const KEY_CURRENT = 'beatboard.current', KEY_SONGS = 'beatboard.songs';
const S = BB.store = {
  p: null, version: 0, undoStack: [], redoStack: [], lastGroup: null, lastGroupTime: 0, saveTimer: 0,

  /* Replace the whole song (open, new, demo). Clears undo history. */
  load(p, label = 'load') {
    S.p = BB.migrate(BB.clone(p));
    S.undoStack = []; S.redoStack = []; S.lastGroup = null; S.version++;
    BB.emit('load', S.p);
    BB.emit('change', { label, all: true });
    S.scheduleSave();
  },

  /* Every edit goes through here. fn(project) mutates in place.
     opts.group: edits with the same group within 1.5s share one undo step (drags, recording).
     opts.info: extra fields for listeners, e.g. {track:'drums', scene:2}. */
  change(label, fn, opts = {}) {
    const now = Date.now();
    const grouped = opts.group && opts.group === S.lastGroup && now - S.lastGroupTime < (opts.window || 1500);
    if (!grouped) {
      S.undoStack.push({ label, data: JSON.stringify(S.p) });
      if (S.undoStack.length > 150) S.undoStack.shift();
      S.redoStack.length = 0;
    }
    S.lastGroup = opts.group || null; S.lastGroupTime = now;
    const r = fn(S.p);
    S.version++;
    BB.emit('change', Object.assign({ label }, opts.info || {}));
    S.scheduleSave();
    return r;
  },
  canUndo: () => S.undoStack.length > 0,
  canRedo: () => S.redoStack.length > 0,
  undo() {
    const s = S.undoStack.pop(); if (!s) return null;
    S.redoStack.push({ label: s.label, data: JSON.stringify(S.p) });
    S.p = JSON.parse(s.data); S.version++; S.lastGroup = null;
    BB.emit('change', { label: 'undo', all: true, undid: s.label }); S.scheduleSave();
    return s.label;
  },
  redo() {
    const s = S.redoStack.pop(); if (!s) return null;
    S.undoStack.push({ label: s.label, data: JSON.stringify(S.p) });
    S.p = JSON.parse(s.data); S.version++; S.lastGroup = null;
    BB.emit('change', { label: 'redo', all: true, redid: s.label }); S.scheduleSave();
    return s.label;
  },

  clip: (trackId, scene) => (S.p.clips[trackId] || [])[scene] || null,
  /* Only call inside change(). Creates an empty clip if the slot is empty. */
  ensureClip(trackId, scene, opts) {
    const arr = S.p.clips[trackId];
    if (!arr[scene]) arr[scene] = BB.newClip(trackId, opts);
    return arr[scene];
  },

  scheduleSave() { clearTimeout(S.saveTimer); S.saveTimer = setTimeout(S.saveNow, 500); },
  saveNow() { if (S.p) BB.storage.set(KEY_CURRENT, S.p); },
  restore() { return BB.storage.get(KEY_CURRENT, null); },

  /* Songs saved in this browser */
  songs: () => BB.storage.get(KEY_SONGS, []),
  saveAs(name) {
    if (name) S.p.name = name;
    const list = S.songs().filter(s => s.id !== S.p.id);
    list.unshift({ id: S.p.id, name: S.p.name, updated: Date.now() });
    const ok = BB.storage.set('beatboard.song.' + S.p.id, S.p) && BB.storage.set(KEY_SONGS, list);
    BB.emit('change', { label: 'save', meta: true });
    return ok;
  },
  openSong(id) { const p = BB.storage.get('beatboard.song.' + id, null); if (p) S.load(p, 'open'); return !!p; },
  deleteSong(id) { BB.storage.del('beatboard.song.' + id); BB.storage.set(KEY_SONGS, S.songs().filter(s => s.id !== id)); },
  exportFile() {
    const blob = new Blob([JSON.stringify(S.p, null, 1)], { type: 'application/json' });
    BB.download(blob, (S.p.name || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.beatboard.json');
  },
  importFile(file) {
    return file.text().then(txt => { const p = JSON.parse(txt); p.id = p.id || BB.uid(); S.load(p, 'import'); return S.p; });
  },
};

/* ---------------- UI state (not part of the song, not undoable) ---------------- */
BB.state = {
  view: 'loops',
  scene: 0,            // the scene (row) the editors are working on
  noteTrack: 'melody', // which note track the Keys view edits
  octave: { bass: 2, melody: 4, keys: 3, chords: 3 },
  chordStyle: 'hold',
  chordFlavor: 'triad',
  chordRhythm: null, // rhythm for live pad playing when the scene has no chords clip yet
};
BB.setState = function (patch) {
  Object.assign(BB.state, patch);
  BB.emit('ui', patch);
};

/* ---------------- view registry ---------------- */
BB.views = {
  list: [],
  byId: {},
  register(def) { BB.views.list.push(def); BB.views.byId[def.id] = def; },
  current: () => BB.views.byId[BB.state.view],
};
})();

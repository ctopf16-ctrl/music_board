/* Beat Board · library
   Ready-made starter loops for every track, and the demo song. Melodic loops are written relative
   to the chords, so they always fit whatever key and chords the scene uses. */
(function () {
'use strict';
const BB = window.BB;
const T = BB.theory;
const R = BB.range;
const E8 = [0, 2, 4, 6, 8, 10, 12, 14], ALL = R(16);

/* ---------- harmony: the chord at any step of a scene ---------- */
const PROGRESSIONS = {
  bright: [
    { id: 'chill',    name: 'Chill',       degrees: [5, 3, 0, 4], flavor: 'seventh', desc: 'vi–IV–I–V with 7ths. Relaxed and warm.' },
    { id: 'happy',    name: 'Happy pop',   degrees: [0, 4, 5, 3], flavor: 'triad',   desc: 'I–V–vi–IV. The most famous pop progression.' },
    { id: 'dreamy',   name: 'Dreamy',      degrees: [3, 4, 2, 5], flavor: 'seventh', desc: 'IV–V–iii–vi. Floating and nostalgic.' },
    { id: 'classic',  name: 'Classic',     degrees: [0, 5, 3, 4], flavor: 'triad',   desc: 'I–vi–IV–V. The 50s doo-wop sound.' },
    { id: 'uplift',   name: 'Uplifting',   degrees: [3, 0, 4, 5], flavor: 'add9',    desc: 'IV–I–V–vi. Big and anthemic.' },
    { id: 'jazzy',    name: 'Jazzy',       degrees: [1, 4, 0, 0], flavor: 'seventh', desc: 'ii–V–I. The backbone of jazz.' },
  ],
  dark: [
    { id: 'moody',    name: 'Moody',       degrees: [0, 5, 2, 6], flavor: 'triad',   desc: 'i–VI–III–VII. Emotional and cinematic.' },
    { id: 'sad',      name: 'Sad',         degrees: [0, 3, 5, 4], flavor: 'triad',   desc: 'i–iv–VI–v. Heartfelt.' },
    { id: 'lofi',     name: 'Lo-fi',       degrees: [0, 3, 0, 3], flavor: 'seventh', desc: 'i7–iv7. Two chords, endless vibe.' },
    { id: 'trap',     name: 'Dark trap',   degrees: [0, 0, 5, 4], flavor: 'triad',   desc: 'i–i–VI–v. Menacing and simple.' },
    { id: 'heroic',   name: 'Heroic',      degrees: [5, 6, 0, 0], flavor: 'triad',   desc: 'VI–VII–i. Rising and triumphant.' },
    { id: 'spanish',  name: 'Spanish',     degrees: [0, 6, 5, 4], flavor: 'triad',   desc: 'i–VII–VI–v. Falling, flamenco-style.' },
  ],
};
const progsFor = mode => (T.isMinorish(mode) ? PROGRESSIONS.dark.concat(PROGRESSIONS.bright) : PROGRESSIONS.bright.concat(PROGRESSIONS.dark));

/* Returns fn(step) -> {root, q, degree, tones:[pcs]} for a scene. Uses the scene's chord clip,
   or a default progression (one chord per bar) if the scene has no chords yet. */
function harmonyFor(p, scene) {
  const clip = p.clips.chords[scene];
  if (clip && !BB.clipIsEmpty('chords', clip)) {
    const len = clip.bars * 16;
    return step => {
      let ch = BB.chordAt(clip, step % len);
      if (!ch) { for (let s = step % len; s >= 0 && !ch; s -= 4) ch = BB.chordAt(clip, s); }
      if (!ch) ch = BB.chordAt(clip, len - 1) || { root: p.key, q: 'maj' };
      return { root: ch.root, q: ch.q, degree: T.nearestDegree(ch.root, p.key, p.mode), pcs: T.chordPcs(ch.root, ch.q) };
    };
  }
  const prog = progsFor(p.mode)[0];
  return step => {
    const d = prog.degrees[Math.floor(step / 16) % prog.degrees.length], c = T.diatonic(p.key, p.mode, d, 'triad');
    return { root: c.root, q: c.q, degree: d, pcs: T.chordPcs(c.root, c.q) };
  };
}

/* ---------- drums ---------- */
const drum = (id, name, desc, kit, bpm, pat, bars = 1) => ({ id, name, desc, kit, bpm, bars, pat });
const DRUMS = [
  drum('lofi', 'Lo-fi chill', 'Lazy, swung hip-hop beat. Great at 75–90 BPM.', 'lofi', 86, { kick: [0, 7, 10], snare: [4, 12], hat: E8, ohat: [14] }),
  drum('boombap', 'Boom bap', 'Classic 90s hip-hop. Hard kick and snare.', 'boombap', 92, { kick: [0, 8, 10], snare: [4, 12], hat: E8, shaker: [6, 14] }),
  drum('trap', 'Trap', 'Half-time snare, rolling hi-hats and an 808. Try 130–150 BPM.', 'trap', 140, { kick: [0, 7, 11], snare: [8], clap: [8], hat: ALL, rolls: { hat: { 14: 3, 15: 2 } } }),
  drum('house', 'House', 'Four-on-the-floor dance beat at 120–126 BPM.', 'house', 122, { kick: [0, 4, 8, 12], clap: [4, 12], ohat: [2, 6, 10, 14], shaker: ALL }),
  drum('techno', 'Techno', 'Driving and hypnotic at 125–135 BPM.', 'techno', 128, { kick: [0, 4, 8, 12], hat: ALL, ohat: [2, 6, 10, 14], rim: [3, 11], clap: [12] }),
  drum('pop', 'Pop', 'Clean, steady beat that fits most songs.', 'pop', 100, { kick: [0, 8, 10], snare: [4, 12], hat: E8, clap: [12] }),
  drum('reggaeton', 'Reggaeton', 'The dembow rhythm. Bouncy and danceable at 90–100 BPM.', 'pop', 95, { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: E8 }),
  drum('halftime', 'Half-time', 'Slow and heavy. The snare lands on beat 3.', 'boombap', 80, { kick: [0, 10], snare: [8], hat: E8 }),
  drum('breakbeat', 'Breakbeat', 'Choppy, funky break.', 'boombap', 100, { kick: [0, 2, 10, 11], snare: [4, 7, 9, 12, 15], hat: E8 }),
  drum('funk', 'Funk', 'Busy, ghosted snare and 16th hats. Feels best with some swing.', 'live', 104, { kick: [0, 3, 10], snare: [4, 12], soft: { snare: [7, 9, 15] }, hat: ALL }),
  drum('rock', 'Rock', 'Straight, steady rock beat.', 'live', 118, { kick: [0, 6, 8], snare: [4, 12], hat: E8, crash: [0] }),
  drum('dnb', 'Drum & bass', 'Fast breakbeat. Set the tempo to 170+.', 'boombap', 172, { kick: [0, 10], snare: [4, 12], hat: E8 }),
  drum('chip', '8-bit', 'Retro video game beat.', 'retro', 120, { kick: [0, 8], snare: [4, 12], hat: E8, tomH: [14], tomL: [15] }),
  drum('hats', 'Just hats', 'Soft hi-hats only. Good for intros.', 'lofi', 86, { hat: E8, shaker: [4, 12] }),
  drum('fill', 'Drum fill', 'A one-bar fill to lead into the next section.', 'live', 100, { kick: [0], snare: [4, 8, 9, 10, 11], tomH: [12, 13], tomL: [14, 15], crash: [0] }),
];
function buildDrum(item) {
  const c = BB.newClip('drums', { name: item.name, bars: item.bars, kit: item.kit });
  const pat = item.pat;
  for (const v of BB.DRUM_VOICES) {
    for (const s of pat[v.id] || []) c.steps[v.id][s] = v.id === 'hat' ? (s % 4 === 0 ? 1 : s % 2 === 0 ? 0.75 : 0.5) : v.id === 'shaker' ? (s % 4 === 2 ? 0.8 : 0.5) : 1;
    for (const s of (pat.soft && pat.soft[v.id]) || []) c.steps[v.id][s] = 0.4;
  }
  if (pat.rolls) for (const [v, m] of Object.entries(pat.rolls)) { c.rolls[v] = new Array(16).fill(0); for (const [s, n] of Object.entries(m)) c.rolls[v][s] = n; }
  return c;
}

/* ---------- bass (root / 3rd / 5th / octave of whatever chord is playing) ---------- */
/* events: [step, tone, length] tone: 0 root, 1 third, 2 fifth, 3 octave, 'a' approach note below next root */
const BASS = [
  { id: 'long', name: 'Long notes', desc: 'One long note per chord. Simple and solid.', mode: 'long' },
  { id: 'bounce', name: 'Bounce', desc: 'Groovy, syncopated rhythm.', ev: [[0, 0, 3], [3, 0, 2], [6, 0, 2], [8, 0, 3], [11, 2, 2], [14, 3, 2]] },
  { id: 'walk', name: 'Walking', desc: 'Steps up through the chord, one note per beat.', ev: [[0, 0, 4], [4, 1, 4], [8, 2, 4], [12, 3, 4]] },
  { id: 'offbeat', name: 'Off-beat', desc: 'Pumping dance bass between the kicks.', ev: [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 3, 2]] },
  { id: 'octaves', name: 'Octaves', desc: 'Disco-style jumps between low and high.', ev: E8.map((s, i) => [s, i % 2 ? 3 : 0, 2]) },
  { id: 'trap808', name: '808 rhythm', desc: 'Long hits that follow a trap kick. Try the 808 bass sound.', ev: [[0, 0, 6], [7, 0, 3], [11, 3, 4]] },
  { id: 'synco', name: 'Syncopated', desc: 'Funky pushes ahead of the beat.', ev: [[0, 0, 2], [3, 0, 1], [6, 2, 2], [10, 0, 2], [12, 3, 1], [14, 2, 2]] },
  { id: 'pulse8', name: 'Eighth pulse', desc: 'Steady driving eighth notes, rock and synthwave style.', ev: E8.map(s => [s, 0, 2]) },
];
function bassMidi(h, tone) {
  const r = T.place(h.root, 36);
  const iv = (T.QUALITIES[h.q] || T.QUALITIES.maj).iv;
  return tone === 3 ? r + 12 : r + (tone === 1 ? iv[1] : tone === 2 ? iv[2] : 0);
}
function buildBass(item, p, scene, bars = 4) {
  const harm = harmonyFor(p, scene), c = BB.newClip('bass', { name: item.name, bars }), len = bars * 16;
  if (item.mode === 'long') {
    let last = null, start = 0;
    for (let s = 0; s <= len; s += 4) {
      const hh = s < len ? harm(s) : null, k = hh ? hh.root + hh.q : null;
      if (k !== last) { if (last != null) c.notes.push({ s: start, d: s - start, m: bassMidi(harm(start), 0), v: 0.85 }); last = k; start = s; }
    }
  } else {
    for (let b = 0; b < bars; b++) for (const [st, tone, d] of item.ev) { const s = b * 16 + st; c.notes.push({ s, d, m: bassMidi(harm(s), tone), v: st % 4 === 0 ? 0.9 : 0.75 }); }
  }
  return c;
}

/* ---------- chords ---------- */
function buildChords(prog, p, opts = {}) {
  const c = BB.newClip('chords', { name: prog.name, bars: 4, style: opts.style || 'hold' });
  prog.degrees.forEach((d, i) => { const ch = T.diatonic(p.key, p.mode, d, prog.flavor); c.slots[i * 4] = { r: ch.root, q: ch.q }; });
  return c;
}

/* ---------- melody & keys (scale degrees relative to the chord root) ---------- */
/* events: [step, degreeOffset, length] per bar */
const MELODY = [
  { id: 'hook', name: 'Hook', desc: 'A catchy main line.', ev: [[0, 4, 2], [2, 2, 1], [3, 4, 1], [6, 2, 2], [8, 0, 3], [12, 1, 2], [14, 2, 2]] },
  { id: 'answer', name: 'Answer', desc: 'Replies to the hook. Try it in the next scene.', ev: [[4, 2, 2], [6, 4, 2], [8, 7, 4], [12, 4, 2], [14, 2, 2]] },
  { id: 'sparkle', name: 'Sparkle', desc: 'High, light and bouncy.', ev: [[0, 4, 1], [2, 5, 1], [4, 7, 1], [6, 5, 1], [8, 4, 1], [10, 2, 1], [12, 4, 1], [14, 7, 2]] },
  { id: 'rise', name: 'Rise', desc: 'Climbs up the scale.', ev: [[0, 0, 2], [2, 1, 2], [4, 2, 2], [6, 3, 2], [8, 4, 2], [10, 5, 2], [12, 6, 2], [14, 7, 2]] },
  { id: 'fall', name: 'Fall', desc: 'Steps down gently.', ev: [[0, 7, 2], [2, 6, 2], [4, 5, 2], [6, 4, 2], [8, 3, 2], [10, 2, 2], [12, 1, 2], [14, 0, 2]] },
  { id: 'lazy', name: 'Lazy', desc: 'Sparse, laid-back notes with lots of space.', ev: [[2, 4, 4], [10, 2, 3], [13, 1, 3]] },
  { id: 'steady', name: 'Steady', desc: 'Simple quarter notes on chord tones. Easy to build on.', ev: [[0, 0, 4], [4, 2, 4], [8, 4, 4], [12, 2, 4]] },
];
const KEYS = [
  { id: 'arp', name: 'Arpeggio', desc: 'Chord notes one at a time, as sixteenths.', mode: 'arp' },
  { id: 'broken', name: 'Broken chords', desc: 'Root, fifth, third, fifth. A piano pattern.', ev: E8.map((s, i) => [s, [0, 4, 2, 4][i % 4], 2]) },
  { id: 'counter', name: 'Counter-melody', desc: 'Long notes that weave under the melody.', ev: [[0, 2, 8], [8, 4, 6], [14, 3, 2]] },
  { id: 'offstab', name: 'Off-beat stabs', desc: 'Short chord-tone hits between the beats.', ev: [[2, 2, 1], [6, 4, 1], [10, 2, 1], [14, 4, 1]] },
  { id: 'octpulse', name: 'Octave pulse', desc: 'Root note bouncing between octaves.', ev: E8.map((s, i) => [s, i % 2 ? 7 : 0, 1]) },
];
function buildLine(trackId, item, p, scene, bars = 4) {
  const harm = harmonyFor(p, scene), c = BB.newClip(trackId, { name: item.name, bars });
  const tonic = T.place(p.key, trackId === 'melody' ? 62 : 55);
  for (let b = 0; b < bars; b++) {
    if (item.mode === 'arp') {
      for (let st = 0; st < 16; st++) {
        const s = b * 16 + st, hh = harm(s), d0 = hh.degree > 3 ? hh.degree - 7 : hh.degree;
        const seq = [0, 2, 4, 7, 9, 7, 4, 2];
        c.notes.push({ s, d: 1, m: T.scaleMidi(d0 + seq[st % seq.length], tonic, p.mode), v: st % 4 === 0 ? 0.8 : 0.6 });
      }
      continue;
    }
    for (const [st, rel, d] of item.ev) {
      const s = b * 16 + st, hh = harm(s), d0 = hh.degree > 3 ? hh.degree - 7 : hh.degree;
      c.notes.push({ s, d, m: T.scaleMidi(d0 + rel, tonic, p.mode), v: st % 4 === 0 ? 0.85 : 0.7 });
    }
  }
  return c;
}

/* ---------- public API ---------- */
BB.library = {
  PROGRESSIONS, harmonyFor, progressions: () => progsFor(BB.store.p.mode),
  /* Items for a track: [{id, name, desc, group}] */
  itemsFor(trackId) {
    if (trackId === 'drums') return DRUMS.map(d => ({ id: d.id, name: d.name, desc: d.desc, group: 'Starter beats' }));
    if (trackId === 'bass') return BASS.map(d => ({ id: d.id, name: d.name, desc: d.desc, group: 'Bass lines' }));
    if (trackId === 'chords') return progsFor(BB.store.p.mode).map(d => ({ id: d.id, name: d.name, desc: d.desc, group: 'Chord progressions' }));
    if (trackId === 'melody') return MELODY.map(d => ({ id: d.id, name: d.name, desc: d.desc, group: 'Melodies' }));
    return KEYS.concat(MELODY).map(d => ({ id: d.id, name: d.name, desc: d.desc, group: KEYS.includes(d) ? 'Parts' : 'Melodies' }));
  },
  /* Build a clip from a library item (does not touch the song). */
  build(trackId, itemId, scene, p = BB.store.p, opts = {}) {
    if (trackId === 'drums') { const it = DRUMS.find(d => d.id === itemId) || DRUMS[0]; return buildDrum(it); }
    if (trackId === 'bass') return buildBass(BASS.find(d => d.id === itemId) || BASS[0], p, scene, opts.bars);
    if (trackId === 'chords') { const all = PROGRESSIONS.bright.concat(PROGRESSIONS.dark); return buildChords(all.find(d => d.id === itemId) || all[0], p, opts); }
    const pool = trackId === 'melody' ? MELODY : KEYS.concat(MELODY);
    return buildLine(trackId, pool.find(d => d.id === itemId) || pool[0], p, scene, opts.bars);
  },
  /* Put a library item into the song at (track, scene). One undo step. */
  apply(trackId, scene, itemId, opts = {}) {
    const clip = BB.library.build(trackId, itemId, scene, BB.store.p, opts);
    BB.store.change('Add ' + clip.name, p => { p.clips[trackId][scene] = clip; }, { info: { track: trackId, scene } });
    return clip;
  },
  drumInfo: id => DRUMS.find(d => d.id === id),
  /* Random variation of a drum clip for the "Surprise me" button */
  surpriseDrums(kit) {
    const base = DRUMS[Math.floor(Math.random() * 10)], c = buildDrum(base);
    if (kit) c.kit = kit;
    for (let s = 0; s < 16; s++) {
      if (Math.random() < 0.12 && !c.steps.kick[s]) c.steps.kick[s] = 0.7;
      if (Math.random() < 0.08) c.steps.snare[s] = c.steps.snare[s] || 0.35;
      if (Math.random() < 0.1) c.steps.shaker[s] = 0.5;
    }
    c.name = 'Surprise';
    return c;
  },
};

/* ---------- demo song ---------- */
BB.demoProject = function () {
  const p = BB.defaultProject();
  Object.assign(p, { name: 'Demo: Late Night Loops', bpm: 86, key: 0, mode: 'major', swing: 0.16 });
  Object.assign(p.master, { space: 0.32, echo: 0.22, lofi: 0.18, tone: 0.82 });
  p.tracks.bass.inst = 'synthBass'; p.tracks.chords.inst = 'epiano'; p.tracks.melody.inst = 'bell'; p.tracks.keys.inst = 'pluck';
  const names = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
  names.forEach((n, i) => { p.scenes[i].name = n; });
  const L = BB.library, all = PROGRESSIONS.bright.concat(PROGRESSIONS.dark), prog = id => all.find(x => x.id === id);
  const put = (t, s, c) => { p.clips[t][s] = c; };
  // chords first: melodic parts follow them
  put('chords', 0, buildChords(prog('chill'), p, { style: 'hold' }));
  put('chords', 1, buildChords(prog('chill'), p, { style: 'hold' }));
  put('chords', 2, buildChords(prog('chill'), p, { style: 'pulse' }));
  put('chords', 3, buildChords(prog('dreamy'), p, { style: 'strum' }));
  put('chords', 4, buildChords(prog('chill'), p, { style: 'hold' }));
  put('keys', 0, L.build('keys', 'arp', 0, p));
  put('drums', 0, L.build('drums', 'hats', 0, p));
  put('drums', 1, L.build('drums', 'lofi', 1, p));
  put('bass', 1, L.build('bass', 'long', 1, p));
  put('drums', 2, L.build('drums', 'boombap', 2, p));
  put('bass', 2, L.build('bass', 'bounce', 2, p));
  put('melody', 2, L.build('melody', 'hook', 2, p));
  put('drums', 3, L.build('drums', 'halftime', 3, p));
  put('bass', 3, L.build('bass', 'long', 3, p));
  put('melody', 3, L.build('melody', 'sparkle', 3, p));
  put('melody', 4, L.build('melody', 'lazy', 4, p));
  p.clips.drums[1].kit = 'lofi'; p.clips.drums[2].kit = 'lofi'; p.clips.drums[3].kit = 'lofi';
  p.song = [{ scene: 0, repeat: 1 }, { scene: 1, repeat: 2 }, { scene: 2, repeat: 2 }, { scene: 1, repeat: 1 }, { scene: 2, repeat: 2 }, { scene: 3, repeat: 1 }, { scene: 2, repeat: 2 }, { scene: 4, repeat: 1 }];
  return p;
};
})();

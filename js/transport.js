/* Beat Board · transport
   The clock, clip launching (loop mode), song playback (song mode), live playing and recording,
   and offline rendering to WAV. */
(function () {
'use strict';
const BB = window.BB;
const T = BB.theory;

/* ---------------- playing one step of one track (shared by live + offline) ---------------- */
function playChordStep(E, p, trackId, clip, pos, t, sd, style) {
  const ch = BB.chordAt(clip, pos);
  if (!ch) return;
  const inst = p.tracks[trackId].inst, tones = T.voice(ch.root, ch.q), rel = pos - ch.start, span = ch.end - ch.start;
  style = style || clip.style || 'hold';
  const v = 0.72;
  switch (style) {
    case 'hold': if (rel === 0) tones.forEach(m => E.note(trackId, inst, m, t, v, span * sd * 0.98)); break;
    case 'strum': if (rel === 0) tones.concat(tones[0] + 12).forEach((m, i) => E.note(trackId, inst, m, t + i * 0.03, v, span * sd * 0.98 - i * 0.03)); break;
    case 'pulse': if (pos % 2 === 0) tones.forEach(m => E.note(trackId, inst, m, t, pos % 4 ? v * 0.7 : v, sd * 1.6)); break;
    case 'stabs': if ([0, 3, 6, 10].includes(pos % 16)) tones.forEach(m => E.note(trackId, inst, m, t, v, sd * 1.3)); break;
    case 'bounce':
      if (pos % 4 === 0) E.note(trackId, inst, tones[0] - 12, t, v, sd * 1.8);
      else if (pos % 4 === 2) tones.forEach(m => E.note(trackId, inst, m, t, v * 0.75, sd * 1.4));
      break;
    case 'arp': case 'arpdown': {
      let seq = tones.concat(tones.map(m => m + 12));
      if (style === 'arpdown') seq = seq.reverse();
      E.note(trackId, inst, seq[rel % seq.length], t, v * 0.85, sd * 1.5); break;
    }
    default: break;
  }
}
BB.playChordStep = playChordStep;

BB.playTrackStep = function (E, p, trackId, clip, pos, t, sd) {
  const type = BB.TRACK[trackId].type;
  if (type === 'drums') {
    for (const v of BB.DRUM_VOICES) {
      const vel = clip.steps[v.id] && clip.steps[v.id][pos];
      if (!vel) continue;
      if (BB.transport.skips.has('drums:' + v.id + ':' + BB.transport._stepAbs)) continue;
      const rolls = (clip.rolls && clip.rolls[v.id] && clip.rolls[v.id][pos]) || 1;
      for (let k = 0; k < rolls; k++) E.drum(trackId, clip.kit, v.id, t + k * sd / rolls, k ? vel * 0.78 : vel);
    }
  } else if (type === 'chords') {
    playChordStep(E, p, trackId, clip, pos, t, sd);
  } else {
    const inst = p.tracks[trackId].inst;
    for (const n of clip.notes) {
      if (n.s !== pos) continue;
      if (BB.transport.skips.has(trackId + ':' + n.m + ':' + BB.transport._stepAbs)) continue;
      E.note(trackId, inst, n.m, t, n.v, n.d * sd * 0.97);
    }
  }
};

/* ---------------- the transport ---------------- */
const TR = BB.transport = {
  playing: false, rec: false, mode: 'loop', metronome: false, loopSong: false,
  abs: 0, next: 0, uiQ: [], shown: null, _stepAbs: -1,
  launched: {},   // trackId -> {scene, start} (start = abs step where the clip began)
  queued: {},     // trackId -> scene, or -1 to stop at the next bar
  songFrom: 0,    // song block index to start from
  skips: new Set(),
  held: {},       // live notes being held
  liveChord: null,
  recGroup: null,
};
const stepDur = () => 60 / BB.store.p.bpm / 4;

function resolveLoop(trackId, abs) {
  const L = TR.launched[trackId]; if (!L || abs < L.start) return null;
  const clip = BB.store.clip(trackId, L.scene); if (!clip) return null;
  const len = clip.bars * 16;
  return { scene: L.scene, clip, pos: (abs - L.start) % len, len };
}
let tlCache = null, tlVersion = -1;
TR.timeline = function () {
  if (tlVersion !== BB.store.version || !tlCache) { tlCache = BB.songTimeline(BB.store.p); tlVersion = BB.store.version; }
  return tlCache;
};
/* Where the song is at absolute step abs: {block, songStep, posInBlock} or null after the end */
TR.songAt = function (abs) {
  const tl = TR.timeline(); if (!tl.total) return null;
  const startBlock = tl.blocks[Math.min(TR.songFrom, tl.blocks.length - 1)];
  let s = abs + (startBlock ? startBlock.start : 0);
  if (s >= tl.total) { if (!TR.loopSong) return null; s %= tl.total; }
  const b = tl.blocks.find(x => s >= x.start && s < x.start + x.len);
  return b ? { block: b, songStep: s, posInBlock: s - b.start } : null;
};
function resolveSong(trackId, abs) {
  const at = TR.songAt(abs); if (!at) return null;
  const clip = BB.store.clip(trackId, at.block.scene); if (!clip) return null;
  const len = clip.bars * 16;
  return { scene: at.block.scene, clip, pos: at.posInBlock % len, len };
}
TR.resolve = (trackId, abs) => (TR.mode === 'song' ? resolveSong(trackId, abs) : resolveLoop(trackId, abs));

function scheduleStep(abs, t, sd) {
  const p = BB.store.p, E = BB.audio.E;
  const entry = { abs, t, pos: {} };
  if (TR.mode === 'loop' && abs % 16 === 0) {
    let changed = false;
    for (const id of Object.keys(TR.queued)) {
      const q = TR.queued[id];
      TR.launched[id] = q >= 0 ? { scene: q, start: abs } : null;
      changed = true;
    }
    TR.queued = {};
    if (changed) entry.launch = true;
  }
  if (TR.mode === 'song') {
    const at = TR.songAt(abs);
    if (!at) { entry.end = true; return entry; }
    entry.song = { block: at.block.index, scene: at.block.scene, songStep: at.songStep, posInBlock: at.posInBlock };
  }
  if (TR.metronome && abs % 4 === 0) E.click(t, abs % 16 === 0);
  if (abs % 4 === 0) E.pump(t, sd * 4);
  TR._stepAbs = abs;
  for (const tr of BB.TRACKS) {
    const r = TR.resolve(tr.id, abs);
    if (!r) continue;
    entry.pos[tr.id] = { scene: r.scene, pos: r.pos, len: r.len };
    try { BB.playTrackStep(E, p, tr.id, r.clip, r.pos, t, sd); } catch (e) { console.error(e); }
  }
  /* a chord being held live in a rhythmic style */
  const lc = TR.liveChord;
  if (lc && ['pulse', 'stabs', 'bounce', 'arp', 'arpdown'].includes(lc.style)) {
    const fake = { slots: [{ r: lc.root, q: lc.q }], bars: 1 };
    const rel = abs - lc.startAbs;
    if (rel >= 0) playChordStep(E, p, 'chords', fake, lc.style.startsWith('arp') ? rel : abs % 16, t, sd, lc.style);
  }
  TR._stepAbs = -1;
  return entry;
}

function tick() {
  if (!TR.playing || !BB.audio.ctx || TR.endAt != null) return;
  const ac = BB.audio.ctx, sd = stepDur();
  if (TR.next < ac.currentTime - 0.05) TR.next = ac.currentTime + 0.02;
  while (TR.next < ac.currentTime + 0.12) {
    const swing = TR.abs % 2 ? BB.store.p.swing * sd * 0.66 : 0;
    const entry = scheduleStep(TR.abs, TR.next + swing, sd);
    TR.uiQ.push(entry);
    if (entry.end) { TR.endAt = entry.t; break; }
    TR.next += sd; TR.abs++;
  }
}
const clock = (() => {
  let w = null, id = null;
  try {
    const src = 'let i=null;onmessage=e=>{clearInterval(i);i=null;if(e.data==="go")i=setInterval(()=>postMessage(1),25)}';
    w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = tick;
  } catch (e) { w = null; }
  return {
    start() { if (w) w.postMessage('go'); else { clearInterval(id); id = setInterval(tick, 25); } },
    stop() { if (w) w.postMessage('stop'); else clearInterval(id); },
  };
})();

/* Called every animation frame by the app: moves the playhead to what is audible now. */
TR.frame = function () {
  if (!TR.playing || !BB.audio.ctx) return;
  const now = BB.audio.ctx.currentTime;
  let cur = null, launch = false;
  while (TR.uiQ.length && TR.uiQ[0].t <= now) { cur = TR.uiQ.shift(); if (cur.launch) launch = true; if (cur.end) { TR.stop(); return; } }
  if (cur) {
    TR.shown = cur;
    if (launch) BB.emit('launch', {});
    BB.emit('step', cur);
  }
};

TR.anyLaunched = () => BB.TRACKS.some(t => TR.launched[t.id] && BB.store.clip(t.id, TR.launched[t.id].scene));
TR.play = function () {
  if (!BB.audio.init() || TR.playing) return;
  const ac = BB.audio.ctx;
  TR.playing = true; TR.abs = 0; TR.next = ac.currentTime + 0.08; TR.uiQ = []; TR.shown = null; TR.skips.clear(); TR.endAt = null;
  if (TR.mode === 'loop') {
    for (const id of Object.keys(TR.queued)) TR.launched[id] = TR.queued[id] >= 0 ? { scene: TR.queued[id], start: 0 } : null;
    TR.queued = {};
    if (!TR.anyLaunched()) TR.launchScene(BB.state.scene, { silent: true });
    for (const id of Object.keys(TR.launched)) if (TR.launched[id]) TR.launched[id].start = 0;
  } else if (!TR.timeline().total) {
    BB.emit('toast', { text: 'Your song is empty. Add scenes in the Song tab first.' });
    TR.playing = false; return;
  }
  BB.audio.E.applyMix(BB.store.p);
  clock.start(); tick();
  BB.emit('transport', { playing: true });
  BB.emit('launch', {});
};
TR.stop = function () {
  if (!TR.playing) return;
  TR.playing = false; clock.stop(); TR.uiQ = []; TR.shown = null; TR.liveChord = null;
  if (TR.rec) TR.setRec(false);
  BB.emit('transport', { playing: false });
  BB.emit('step', null);
};
TR.toggle = () => (TR.playing ? TR.stop() : TR.play());
TR.setMode = function (mode) {
  if (mode === TR.mode) return;
  const was = TR.playing; if (was) TR.stop();
  TR.mode = mode; TR.songFrom = 0;
  BB.emit('transport', { mode });
  if (was) TR.play();
};
TR.setMetronome = function (on) { TR.metronome = on; BB.emit('transport', { metronome: on }); };
TR.setLoopSong = function (on) { TR.loopSong = !!on; BB.emit('transport', { loopSong: TR.loopSong }); };
TR.setRec = function (on) {
  TR.rec = on; TR.recGroup = on ? 'rec-' + Date.now() : null;
  BB.emit('transport', { rec: on });
  if (on && !TR.playing) TR.play();
};
/* Play the song starting at block i */
TR.playSongFrom = function (i) {
  if (TR.playing) TR.stop();
  TR.mode = 'song'; TR.songFrom = Math.max(0, i || 0);
  BB.emit('transport', { mode: 'song' });
  TR.play();
};

/* ---- loop-mode launching ---- */
TR.isLaunched = (trackId, scene) => !!(TR.launched[trackId] && TR.launched[trackId].scene === scene);
TR.queuedFor = trackId => TR.queued[trackId];
TR.launchClip = function (trackId, scene) {
  if (!BB.store.clip(trackId, scene)) return;
  if (TR.playing && TR.mode === 'loop') TR.queued[trackId] = scene;
  else TR.launched[trackId] = { scene, start: 0 };
  BB.emit('launch', {});
};
TR.stopClip = function (trackId) {
  if (TR.playing && TR.mode === 'loop') { if (TR.launched[trackId]) TR.queued[trackId] = -1; else delete TR.queued[trackId]; }
  else TR.launched[trackId] = null;
  BB.emit('launch', {});
};
/* Toggle a clip the way a loop grid does: start it, or stop it if it's already playing */
TR.toggleClip = function (trackId, scene) {
  const q = TR.queued[trackId];
  if (q === scene) { delete TR.queued[trackId]; BB.emit('launch', {}); return; }
  if (TR.isLaunched(trackId, scene) && q !== -1) TR.stopClip(trackId);
  else if (TR.isLaunched(trackId, scene) && q === -1) { delete TR.queued[trackId]; BB.emit('launch', {}); }
  else TR.launchClip(trackId, scene);
};
TR.launchScene = function (scene, opts = {}) {
  for (const t of BB.TRACKS) {
    const has = !!BB.store.clip(t.id, scene);
    if (TR.playing && TR.mode === 'loop') {
      if (has) TR.queued[t.id] = scene; else if (TR.launched[t.id]) TR.queued[t.id] = -1;
    } else TR.launched[t.id] = has ? { scene, start: 0 } : null;
  }
  if (!opts.silent) BB.emit('launch', {});
};
TR.stopAll = function () {
  for (const t of BB.TRACKS) {
    if (TR.playing && TR.mode === 'loop') { if (TR.launched[t.id]) TR.queued[t.id] = -1; else delete TR.queued[t.id]; }
    else TR.launched[t.id] = null;
  }
  BB.emit('launch', {});
};
/* Current playhead for a track: {scene, pos, len} or null */
TR.positionOf = trackId => (TR.shown && TR.shown.pos[trackId]) || null;

/* ---------------- live playing & recording ---------------- */
TR.nearestStep = function () {
  const ac = BB.audio.ctx, now = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0);
  const cands = (TR.shown ? [TR.shown] : []).concat(TR.uiQ, [{ abs: TR.abs, t: TR.next }]);
  let best = cands[0];
  for (const c of cands) if (Math.abs(c.t - now) < Math.abs(best.t - now)) best = c;
  return best;
};
/* The clip that live recording on this track writes into. Creates and launches one if needed. */
TR.recTarget = function (trackId) {
  const ns = TR.nearestStep();
  if (TR.mode === 'song') {
    const at = TR.songAt(ns.abs); if (!at) return null;
    const scene = at.block.scene;
    if (!BB.store.clip(trackId, scene)) BB.store.change('Record', () => BB.store.ensureClip(trackId, scene, { bars: at.block.sceneLen / 16 }), { group: TR.recGroup, info: { track: trackId, scene } });
    const clip = BB.store.clip(trackId, scene), len = clip.bars * 16;
    return { scene, clip, pos: at.posInBlock % len, abs: ns.abs };
  }
  let L = TR.launched[trackId];
  if (!L || !BB.store.clip(trackId, L.scene)) {
    const scene = BB.state.scene, p = BB.store.p;
    const hasAny = BB.TRACKS.some(t => p.clips[t.id][scene] && !BB.clipIsEmpty(t.id, p.clips[t.id][scene]));
    const bars = hasAny ? BB.sceneLength(p, scene) / 16 : (trackId === 'drums' ? 1 : trackId === 'chords' ? 4 : 2);
    if (!BB.store.clip(trackId, scene)) BB.store.change('Record', () => BB.store.ensureClip(trackId, scene, { bars }), { group: TR.recGroup, info: { track: trackId, scene } });
    L = TR.launched[trackId] = { scene, start: ns.abs - (((ns.abs % 16) + 16) % 16) };
    delete TR.queued[trackId];
    BB.emit('launch', {});
  }
  const clip = BB.store.clip(trackId, L.scene), len = clip.bars * 16;
  return { scene: L.scene, clip, pos: ((ns.abs - L.start) % len + len) % len, abs: ns.abs };
};
const recording = () => TR.rec && TR.playing;
/* The drum kit to use when tapping pads */
TR.currentKit = function () {
  const r = TR.positionOf('drums');
  const c = (r && BB.store.clip('drums', r.scene)) || BB.store.clip('drums', BB.state.scene) || (TR.launched.drums && BB.store.clip('drums', TR.launched.drums.scene));
  return (c && c.kit) || 'lofi';
};

/* Tap a drum from pads, the number keys or MIDI */
TR.drumHit = function (voiceId, vel = 0.9) {
  if (!BB.audio.init()) return;
  let kitId = TR.currentKit();
  if (recording()) {
    const tg = TR.recTarget('drums');
    if (tg) {
      kitId = tg.clip.kit;
      BB.store.change('Record drums', () => {
        const c = BB.store.clip('drums', tg.scene);
        c.steps[voiceId][tg.pos] = Math.max(c.steps[voiceId][tg.pos] || 0, vel >= 0.75 ? 1 : 0.55);
      }, { group: TR.recGroup, info: { track: 'drums', scene: tg.scene } });
      if (tg.abs >= TR.abs) TR.skips.add('drums:' + voiceId + ':' + tg.abs);
    }
  }
  BB.audio.E.drum('drums', kitId, voiceId, BB.audio.now + 0.002, vel);
  BB.emit('drumhit', { voice: voiceId, vel, live: true });
};

/* Notes on bass / melody / keys (also used for the chords track to play single notes) */
TR.noteOn = function (trackId, midi, vel = 0.85) {
  if (!BB.audio.init()) return;
  const key = trackId + ':' + midi;
  if (TR.held[key]) TR.noteOff(trackId, midi);
  const inst = BB.store.p.tracks[trackId].inst;
  const hnd = BB.audio.E.note(trackId, inst, midi, BB.audio.now + 0.004, vel);
  const h = { hnd, t0: BB.audio.now, rec: null };
  if (recording() && BB.TRACK[trackId].type === 'notes') {
    const tg = TR.recTarget(trackId);
    if (tg) {
      const n = { s: tg.pos, d: 1, m: midi, v: Math.round(vel * 100) / 100 };
      BB.store.change('Record notes', () => {
        const c = BB.store.clip(trackId, tg.scene);
        c.notes = c.notes.filter(x => !(x.s === n.s && x.m === n.m));
        c.notes.push(n);
      }, { group: TR.recGroup, info: { track: trackId, scene: tg.scene } });
      if (tg.abs >= TR.abs) TR.skips.add(trackId + ':' + midi + ':' + tg.abs);
      h.rec = { scene: tg.scene, s: n.s, m: midi, len: tg.clip.bars * 16 };
    }
  }
  TR.held[key] = h;
  BB.emit('note', { track: trackId, midi, on: true });
};
TR.noteOff = function (trackId, midi) {
  const key = trackId + ':' + midi, h = TR.held[key];
  if (!h) return;
  delete TR.held[key];
  h.hnd.stop(BB.audio.now);
  if (h.rec) {
    const steps = BB.clamp(Math.round((BB.audio.now - h.t0) / stepDur()), 1, h.rec.len - h.rec.s);
    BB.store.change('Record notes', () => {
      const c = BB.store.clip(trackId, h.rec.scene); if (!c) return;
      const n = c.notes.find(x => x.s === h.rec.s && x.m === h.rec.m); if (n) n.d = steps;
    }, { group: TR.recGroup, info: { track: trackId, scene: h.rec.scene } });
  }
  BB.emit('note', { track: trackId, midi, on: false });
};
TR.allNotesOff = function () { Object.keys(TR.held).forEach(k => { const [t, m] = k.split(':'); TR.noteOff(t, +m); }); TR.chordOff(); };

/* Chords played from chord pads. style: one of BB.CHORD_STYLES ids */
TR.chordOn = function (root, q, opts = {}) {
  if (!BB.audio.init()) return;
  TR.chordOff();
  const style = opts.style || BB.state.chordStyle || 'hold';
  const inst = BB.store.p.tracks.chords.inst, tones = T.voice(root, q), now = BB.audio.now + 0.005;
  const lc = TR.liveChord = { root, q, style, hnds: [], startAbs: TR.playing ? TR.abs : 0, t0: BB.audio.now, rec: null };
  if (style === 'strum') tones.concat(tones[0] + 12).forEach((m, i) => lc.hnds.push(BB.audio.E.note('chords', inst, m, now + i * 0.03, 0.75)));
  else if (style === 'hold' || !TR.playing) tones.forEach(m => lc.hnds.push(BB.audio.E.note('chords', inst, m, now, 0.72)));
  if (recording()) {
    const tg = TR.recTarget('chords');
    if (tg) {
      const n = tg.clip.slots.length, slot = Math.round(tg.pos / 4) % n;
      BB.store.change('Record chords', () => { const c = BB.store.clip('chords', tg.scene); c.slots[slot] = { r: root, q }; }, { group: TR.recGroup, info: { track: 'chords', scene: tg.scene } });
      lc.rec = { scene: tg.scene, slot, n };
    }
  }
  BB.emit('chord', { root, q, on: true });
};
TR.chordOff = function () {
  const lc = TR.liveChord; if (!lc) return;
  TR.liveChord = null;
  lc.hnds.forEach(h => h.stop(BB.audio.now));
  if (lc.rec) {
    const beats = Math.max(1, Math.round((BB.audio.now - lc.t0) / (stepDur() * 4)));
    BB.store.change('Record chords', () => {
      const c = BB.store.clip('chords', lc.rec.scene); if (!c) return;
      for (let i = 1; i < beats && i < lc.rec.n; i++) c.slots[(lc.rec.slot + i) % lc.rec.n] = null;
    }, { group: TR.recGroup, info: { track: 'chords', scene: lc.rec.scene } });
  }
  BB.emit('chord', { root: lc.root, q: lc.q, on: false });
};

/* ---------------- offline rendering ---------------- */
/* opts: {mode:'song'} renders the arrangement; {mode:'scene', scene, bars} renders one scene looped. */
BB.renderAudio = async function (opts = {}) {
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
  const seconds = total * sd + 3.5;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oac = new OAC(2, Math.ceil(sr * seconds), sr);
  const E = BB.createEngine(oac, p);
  E.applyMix(p);
  const t0 = 0.05;
  let done = 0;
  const scheduleTo = upto => {
    for (; done < Math.min(upto, total); done++) {
      const abs = done, t = t0 + abs * sd + (abs % 2 ? p.swing * sd * 0.66 : 0);
      if (abs % 4 === 0) E.pump(t, sd * 4);
      for (const tr of BB.TRACKS) { const r = resolver(tr.id, abs); if (r) BB.playTrackStep(E, p, tr.id, r.clip, r.pos, t, sd); }
    }
  };
  /* Create voices just ahead of the render position (suspend/resume) so the audio graph stays small.
     Building the whole song up front is far slower than real time on long songs. */
  const CHUNK = 32;
  if (typeof oac.suspend === 'function') {
    scheduleTo(CHUNK * 2);
    for (let k = 1; k * CHUNK < total; k++) {
      const at = Math.floor((t0 + k * CHUNK * sd) * sr / 128) * 128 / sr;
      oac.suspend(at).then(() => {
        scheduleTo((k + 2) * CHUNK);
        if (opts.onProgress) opts.onProgress(Math.min(0.99, k * CHUNK / total));
        oac.resume();
      });
    }
  } else {
    scheduleTo(total);
  }
  const buf = await oac.startRendering();
  if (opts.onProgress) opts.onProgress(1);
  return buf;
};
BB.renderAudio.incremental = true;
/* AudioBuffer -> 16-bit WAV Blob */
BB.encodeWav = function (buf) {
  const ch = Math.min(2, buf.numberOfChannels), len = buf.length, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = BB.range(ch).map(c => buf.getChannelData(c));
  let peak = 0; for (const c of chans) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(c[i]));
  const norm = peak > 0.98 ? 0.98 / peak : 1;
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i] * norm)); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([data], { type: 'audio/wav' });
};
})();

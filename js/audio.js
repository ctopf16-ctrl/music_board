/* Beat Board · audio
   Every sound is synthesized with the Web Audio API, nothing is downloaded.
   BB.createEngine(audioContext, project) builds a full mixer (one channel per track, master effects)
   on any context, so the same code plays live and renders WAV files offline. */
(function () {
'use strict';
const BB = window.BB;
const mtof = BB.theory.mtof;

/* ---------------- instruments ---------------- */
/* Each preset describes a small synth voice:
   osc: oscillators [{type, ratio, oct, semi, det (cents), gain, decay (sec, per-osc fade), fm:{ratio, index, decay, sustain}}]
   filter: {type, freq, q, env (Hz added at note start), decay, key (keytracking 0-1)}
   amp: {a, d, s, r}  vib: {rate, depth (cents), delay}  pitch: {from (semitones), time}  noise: {gain, decay, freq}
   drive: 0-1, gain: overall level */
BB.INSTRUMENTS = {
  epiano:   { name: 'Electric piano', group: 'Keys', desc: 'Warm, bell-like keys. Great for lo-fi, R&B and chill chords.', gain: 0.34,
              amp: { a: 0.004, d: 1.8, s: 0.25, r: 0.35 }, osc: [{ type: 'sine', fm: { ratio: 1, index: 1.5, decay: 0.45, sustain: 0.12 } }, { type: 'sine', ratio: 7, gain: 0.1, decay: 0.05 }] },
  piano:    { name: 'Soft piano', group: 'Keys', desc: 'A gentle piano for chords and melodies.', gain: 0.3,
              amp: { a: 0.002, d: 2.4, s: 0.12, r: 0.4 }, filter: { freq: 1800, env: 3200, decay: 0.35, key: 0.6 },
              osc: [{ type: 'triangle' }, { type: 'sine', ratio: 2, gain: 0.35, decay: 0.5 }, { type: 'sine', ratio: 3, gain: 0.12, decay: 0.25 }], noise: { gain: 0.04, decay: 0.015, freq: 2500 } },
  organ:    { name: 'Organ', group: 'Keys', desc: 'Classic drawbar organ. Holds as long as you press.', gain: 0.12,
              amp: { a: 0.008, d: 0.1, s: 0.95, r: 0.08 }, vib: { rate: 6, depth: 7, delay: 0 },
              osc: [{ type: 'sine', ratio: 0.5, gain: 0.5 }, { type: 'sine', gain: 0.8 }, { type: 'sine', ratio: 2, gain: 0.5 }, { type: 'sine', ratio: 3, gain: 0.3 }, { type: 'sine', ratio: 4, gain: 0.2 }] },
  mallet:   { name: 'Marimba', group: 'Keys', desc: 'Wooden mallet sound. Short and bouncy.', gain: 0.42,
              amp: { a: 0.001, d: 0.55, s: 0, r: 0.2 }, osc: [{ type: 'sine' }, { type: 'sine', ratio: 4, gain: 0.25, decay: 0.05 }, { type: 'sine', ratio: 10, gain: 0.05, decay: 0.02 }] },
  bell:     { name: 'Bell', group: 'Bells', desc: 'Clear, shimmering bell. Melodies cut through the mix.', gain: 0.24,
              amp: { a: 0.002, d: 2.2, s: 0, r: 0.5 }, osc: [{ type: 'sine', fm: { ratio: 3.5, index: 2.2, decay: 0.5, sustain: 0 } }] },
  musicbox: { name: 'Music box', group: 'Bells', desc: 'Tiny, sparkly and sweet.', gain: 0.24,
              amp: { a: 0.001, d: 1.1, s: 0, r: 0.3 }, osc: [{ type: 'sine', fm: { ratio: 5, index: 1, decay: 0.2, sustain: 0 } }, { type: 'sine', ratio: 2, gain: 0.2, decay: 0.3 }] },
  pluck:    { name: 'Pluck', group: 'Synth', desc: 'Short, snappy synth. Perfect for riffs and arpeggios.', gain: 0.16,
              amp: { a: 0.003, d: 1.0, s: 0, r: 0.2 }, filter: { freq: 300, q: 3, env: 5200, decay: 0.18, key: 0.3 },
              osc: [{ type: 'sawtooth', det: -6 }, { type: 'sawtooth', det: 6 }] },
  lead:     { name: 'Synth lead', group: 'Synth', desc: 'Bright lead with vibrato. Made for hooks.', gain: 0.12,
              amp: { a: 0.01, d: 0.25, s: 0.7, r: 0.15 }, filter: { freq: 2200, q: 2, env: 1500, decay: 0.3, key: 0.3 }, vib: { rate: 5.5, depth: 12, delay: 0.25 },
              osc: [{ type: 'sawtooth' }, { type: 'square', det: 5, gain: 0.5 }] },
  chip:     { name: '8-bit', group: 'Synth', desc: 'Retro video game square wave.', gain: 0.09,
              amp: { a: 0.002, d: 0.1, s: 0.6, r: 0.05 }, osc: [{ type: 'square' }] },
  brass:    { name: 'Synth brass', group: 'Synth', desc: 'Bold, swelling brass stabs.', gain: 0.12,
              amp: { a: 0.05, d: 0.3, s: 0.75, r: 0.2 }, filter: { freq: 600, q: 1, env: 2600, decay: 0.35, key: 0.3 },
              osc: [{ type: 'sawtooth' }, { type: 'sawtooth', det: 9 }] },
  pad:      { name: 'Warm pad', group: 'Pads', desc: 'Soft background wash. Fades in slowly.', gain: 0.07,
              amp: { a: 0.35, d: 0.5, s: 0.85, r: 1.0 }, filter: { freq: 1400, q: 0.6 },
              osc: [{ type: 'sawtooth', det: -10 }, { type: 'sawtooth' }, { type: 'sawtooth', det: 10 }, { type: 'triangle', oct: -1, gain: 0.5 }] },
  glass:    { name: 'Glass pad', group: 'Pads', desc: 'Airy, bright pad for dreamy songs.', gain: 0.12,
              amp: { a: 0.4, d: 0.6, s: 0.8, r: 1.2 }, vib: { rate: 4, depth: 6, delay: 0.4 },
              osc: [{ type: 'sine' }, { type: 'triangle', oct: 1, gain: 0.35 }, { type: 'sine', ratio: 3, gain: 0.08 }] },
  strings:  { name: 'Strings', group: 'Pads', desc: 'String section. Slow and cinematic.', gain: 0.09,
              amp: { a: 0.25, d: 0.3, s: 0.9, r: 0.6 }, filter: { freq: 2600, key: 0.3 }, vib: { rate: 5, depth: 10, delay: 0.3 },
              osc: [{ type: 'sawtooth', det: -7 }, { type: 'sawtooth', det: 7 }] },
  synthBass:{ name: 'Synth bass', group: 'Bass', desc: 'Round, punchy bass that works almost anywhere.', gain: 0.5,
              amp: { a: 0.004, d: 0.3, s: 0.75, r: 0.08 }, filter: { freq: 500, q: 2, env: 1200, decay: 0.15, key: 0.2 },
              osc: [{ type: 'sine', gain: 0.8 }, { type: 'square', gain: 0.18 }] },
  subBass:  { name: 'Sub bass', group: 'Bass', desc: 'Deep, clean low end you feel more than hear.', gain: 0.6,
              amp: { a: 0.006, d: 0.1, s: 0.95, r: 0.08 }, osc: [{ type: 'sine' }] },
  bass808:  { name: '808 bass', group: 'Bass', desc: 'Long, booming hip-hop bass with a little grit.', gain: 0.5,
              amp: { a: 0.002, d: 1.2, s: 0.5, r: 0.15 }, pitch: { from: 5, time: 0.06 }, drive: 0.45, osc: [{ type: 'sine' }] },
  pluckBass:{ name: 'Pluck bass', group: 'Bass', desc: 'Short, funky bass notes.', gain: 0.34,
              amp: { a: 0.002, d: 0.5, s: 0, r: 0.08 }, filter: { freq: 250, q: 4, env: 1800, decay: 0.12, key: 0.2 }, osc: [{ type: 'sawtooth' }] },
  acidBass: { name: 'Acid bass', group: 'Bass', desc: 'Squelchy, resonant bass from dance music.', gain: 0.2,
              amp: { a: 0.003, d: 0.3, s: 0.6, r: 0.06 }, filter: { freq: 300, q: 12, env: 2500, decay: 0.2, key: 0.2 }, drive: 0.3, osc: [{ type: 'sawtooth' }] },
  reese:    { name: 'Wide bass', group: 'Bass', desc: 'Thick, detuned bass for dark and heavy songs.', gain: 0.2,
              amp: { a: 0.01, d: 0.2, s: 0.9, r: 0.1 }, filter: { freq: 700, q: 1 }, osc: [{ type: 'sawtooth', det: -14 }, { type: 'sawtooth', det: 14 }] },
};
BB.INSTRUMENT_GROUPS = ['Keys', 'Bells', 'Synth', 'Pads', 'Bass'];

/* ---------------- drum kits ---------------- */
const base = {
  kick:   { f0: 130, f1: 48, glide: 0.07, dec: 0.4, click: 0.2, gain: 1 },
  snare:  { tone: 200, tdec: 0.09, nf: 1800, ndec: 0.2, gain: 0.55 },
  clap:   { f: 1400, dec: 0.22, gain: 0.5 },
  hat:    { hp: 7600, dec: 0.05, gain: 0.22 },
  ohat:   { hp: 7000, dec: 0.3, gain: 0.17 },
  rim:    { f: 1700, dec: 0.04, gain: 0.35 },
  tom:    { f0: 150, dec: 0.4, gain: 0.6 },
  crash:  { hp: 4500, dec: 1.6, gain: 0.14 },
  shaker: { f: 6000, dec: 0.07, gain: 0.14 },
  lp: 18000, osc: 'sine',
};
const kit = (name, desc, o) => {
  const k = { name, desc };
  for (const key of Object.keys(base)) k[key] = typeof base[key] === 'object' ? Object.assign({}, base[key], o[key] || {}) : (o[key] != null ? o[key] : base[key]);
  return k;
};
BB.KITS = {
  lofi:     kit('Dusty lo-fi', 'Soft, muffled drums with a warm, old-record feel.', { lp: 5200, kick: { f0: 120, f1: 46, glide: 0.09, dec: 0.45, click: 0.08 }, snare: { tone: 185, tdec: 0.1, nf: 1500, gain: 0.5 }, clap: { f: 1150, dec: 0.2, gain: 0.42 }, hat: { hp: 6000, gain: 0.18 }, ohat: { hp: 5500, dec: 0.32, gain: 0.14 }, crash: { dec: 1.3 } }),
  boombap:  kit('Boom bap', 'Punchy 90s hip-hop drums. Hard kick, cracking snare.', { lp: 11000, kick: { f0: 135, f1: 50, glide: 0.06, dec: 0.5, click: 0.25, drive: 0.25 }, snare: { tone: 205, tdec: 0.08, nf: 2000, ndec: 0.24, gain: 0.66 }, hat: { hp: 7000, dec: 0.045 } }),
  trap:     kit('Trap 808', 'Booming 808 kick, sharp snare and tight hats.', { kick: { f0: 160, f1: 43, glide: 0.05, dec: 1.5, click: 0.3, drive: 0.6 }, snare: { tone: 240, tdec: 0.06, nf: 2400, ndec: 0.15, gain: 0.58 }, clap: { f: 1700, dec: 0.18, gain: 0.62 }, hat: { hp: 9000, dec: 0.026, gain: 0.26 }, ohat: { hp: 8500, dec: 0.22 }, tom: { f0: 110, dec: 0.6 } }),
  house:    kit('House', 'Four-on-the-floor club drums with a big clap.', { kick: { f0: 170, f1: 50, glide: 0.06, dec: 0.32, click: 0.35 }, snare: { gain: 0.45 }, clap: { f: 1350, dec: 0.26, gain: 0.62 }, hat: { hp: 7600, dec: 0.06, gain: 0.2 }, ohat: { hp: 7200, dec: 0.18, gain: 0.2 } }),
  techno:   kit('Techno', 'Driving, slightly distorted machine drums.', { kick: { f0: 150, f1: 44, glide: 0.08, dec: 0.45, click: 0.2, drive: 0.45 }, hat: { hp: 9500, dec: 0.035, gain: 0.24 }, ohat: { hp: 9000, dec: 0.16 }, rim: { f: 1900, dec: 0.03, gain: 0.4 }, clap: { f: 1600, dec: 0.18 } }),
  pop:      kit('Pop', 'Clean, bright drums that sit well under vocals.', { lp: 15000, kick: { f0: 140, f1: 52, glide: 0.07, dec: 0.36, click: 0.25 }, snare: { tone: 205, nf: 1800, ndec: 0.2, gain: 0.58 } }),
  live:     kit('Live kit', 'Roomier, more natural drums with longer tails.', { lp: 12000, kick: { f0: 110, f1: 55, glide: 0.05, dec: 0.38, click: 0.3 }, snare: { tone: 180, tdec: 0.12, nf: 1300, ndec: 0.32, gain: 0.55 }, tom: { f0: 130, dec: 0.55 }, crash: { dec: 2.2, gain: 0.16 }, ohat: { dec: 0.45 } }),
  retro:    kit('8-bit', 'Bleepy video game drums.', { osc: 'square', lp: 9000, kick: { f0: 200, f1: 40, glide: 0.1, dec: 0.25, click: 0 }, snare: { tone: 300, tdec: 0.05, nf: 3000, ndec: 0.12 }, tom: { f0: 220, dec: 0.25, gain: 0.35 }, hat: { hp: 8000, dec: 0.03 } }),
};

/* ---------------- engine ---------------- */
BB.createEngine = function (ac, project) {
  const E = { ac, live: !(ac instanceof (window.OfflineAudioContext || function () {})), ch: {} };
  const curves = {};
  E.curve = function (amt) {
    const key = Math.round(amt * 40);
    if (curves[key]) return curves[key];
    const k = 1 + key / 40 * 8, c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 1023 * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return (curves[key] = c);
  };
  /* noise */
  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  E.noise = noise;
  const impulse = (sec, decay) => {
    const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  };
  const G = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const F = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };

  /* master chain */
  const musicBus = G(1), pump = G(1), drumBus = G(1), mix = G(1);
  musicBus.connect(pump); pump.connect(mix); drumBus.connect(mix);
  const drive = ac.createWaveShaper(); drive.oversample = '2x';
  const tone = F('lowpass', 18000, 0.5), lofiLP = F('lowpass', 20000, 0.6), lofiHP = F('highpass', 10, 0.6);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.2;
  const master = G(0.8), analyser = ac.createAnalyser(); analyser.fftSize = 2048;
  const driveMakeup = G(1);
  mix.connect(drive); drive.connect(driveMakeup); driveMakeup.connect(tone); tone.connect(lofiLP); lofiLP.connect(lofiHP); lofiHP.connect(comp); comp.connect(master); master.connect(analyser);
  analyser.connect(ac.destination);
  /* reverb + echo returns */
  const revIn = G(1), rev = ac.createConvolver(), revOut = G(0.3);
  rev.buffer = impulse(2.8, 2.6); revIn.connect(rev); rev.connect(revOut); revOut.connect(mix);
  const dlyIn = G(1), dly = ac.createDelay(2.5), fb = G(0.38), dlyLP = F('lowpass', 2800), dlyHP = F('highpass', 250), dlyOut = G(0.2);
  dlyIn.connect(dly); dly.connect(dlyLP); dlyLP.connect(dlyHP); dlyHP.connect(fb); fb.connect(dly); dlyHP.connect(dlyOut); dlyOut.connect(mix);
  /* vinyl crackle for the lo-fi knob */
  const crackle = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), cd = crackle.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.012;
  const crackSrc = ac.createBufferSource(); crackSrc.buffer = crackle; crackSrc.loop = true;
  const crackBP = F('bandpass', 3000, 0.6), crackG = G(0);
  crackSrc.connect(crackBP); crackBP.connect(crackG); crackG.connect(mix); crackSrc.start(0);
  E.analyser = analyser; E.master = master; E.out = master;

  /* channels */
  for (const t of BB.TRACKS) {
    const input = G(1), lp = F('lowpass', 20000, 0.6), pan = ac.createStereoPanner ? ac.createStereoPanner() : G(1), fader = G(0.8);
    const rs = G(0.2), es = G(0), meter = ac.createAnalyser(); meter.fftSize = 256;
    input.connect(lp); lp.connect(pan); pan.connect(fader);
    fader.connect(t.id === 'drums' ? drumBus : musicBus);
    fader.connect(rs); rs.connect(revIn); fader.connect(es); es.connect(dlyIn); fader.connect(meter);
    E.ch[t.id] = { input, lp, pan, fader, rs, es, meter, buf: new Float32Array(256) };
  }
  /* metronome goes straight out, never into renders */
  const clickOut = G(0.5); clickOut.connect(ac.destination);

  let P = project;
  E.applyMix = function (p) {
    P = p || P; if (!P) return;
    const t = ac.currentTime, m = P.master, set = (param, v) => param.setTargetAtTime(v, t, 0.03);
    const anySolo = BB.TRACKS.some(tr => P.tracks[tr.id].solo);
    for (const tr of BB.TRACKS) {
      const c = E.ch[tr.id], s = P.tracks[tr.id];
      const on = !s.mute && (!anySolo || s.solo);
      set(c.fader.gain, on ? s.vol * s.vol * 1.25 : 0);
      if (c.pan.pan) set(c.pan.pan, s.pan);
      set(c.lp.frequency, 150 * Math.pow(130, s.tone));
      set(c.rs.gain, s.space);
      set(c.es.gain, s.echo);
    }
    set(master.gain, m.volume);
    set(tone.frequency, 180 * Math.pow(110, m.tone));
    set(revOut.gain, m.space * 1.2);
    set(dlyOut.gain, m.echo * 1.1);
    const beats = { '16': 0.25, '8': 0.5, d8: 0.75, '4': 1 }[m.echoTime] || 0.75;
    set(dly.delayTime, Math.min(2.4, beats * 60 / P.bpm));
    drive.curve = m.drive < 0.01 ? null : E.curve(m.drive);
    set(driveMakeup.gain, 1 / (1 + m.drive * 2));
    set(crackG.gain, m.lofi * 0.9);
    set(lofiLP.frequency, 20000 * Math.pow(3800 / 20000, m.lofi));
    set(lofiHP.frequency, 10 + m.lofi * 140);
  };

  /* sidechain-style pump on everything except drums */
  E.pump = function (t, beatDur) {
    const a = P && P.master.pump; if (!a) return;
    pump.gain.setValueAtTime(1 - a * 0.8, t);
    pump.gain.setTargetAtTime(1, t + 0.01, beatDur * 0.22);
  };

  E.click = function (t, accent) {
    if (!E.live) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = accent ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(clickOut); o.start(t); o.stop(t + 0.06);
  };

  E.level = function (id) {
    const c = id === 'master' ? null : E.ch[id];
    const an = c ? c.meter : analyser, buf = c ? c.buf : (E._mb || (E._mb = new Float32Array(2048)));
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(s / buf.length) * 3.2);
  };

  /* ---- melodic voice ---- */
  E.note = function (trackId, instId, midi, t, vel = 0.8, dur = null) {
    const Pz = BB.INSTRUMENTS[instId] || BB.INSTRUMENTS.epiano, f = mtof(midi), dest = E.ch[trackId].input;
    t = Math.max(t, ac.currentTime);
    const amp = ac.createGain(), rel = ac.createGain(), srcs = [], oscs = [];
    amp.gain.value = 0; amp.connect(rel); rel.connect(dest);
    let into = amp;
    if (Pz.filter) {
      const fl = Pz.filter, filt = F(fl.type || 'lowpass', 1000, fl.q != null ? fl.q : 0.7);
      const b = Math.min(18000, fl.freq * Math.pow(f / 261.6, fl.key != null ? fl.key : 0.5));
      filt.frequency.setValueAtTime(Math.min(18000, b + (fl.env || 0) * vel), t);
      if (fl.env) filt.frequency.setTargetAtTime(b, t + 0.003, fl.decay || 0.2);
      filt.connect(into); into = filt;
    }
    if (Pz.drive) { const ws = ac.createWaveShaper(); ws.curve = E.curve(Pz.drive); ws.connect(into); into = ws; }
    for (const o of Pz.osc) {
      const osc = ac.createOscillator(); osc.type = o.type || 'sine';
      const ff = f * Math.pow(2, (o.oct || 0) + (o.semi || 0) / 12) * (o.ratio || 1);
      if (Pz.pitch) { osc.frequency.setValueAtTime(ff * Math.pow(2, Pz.pitch.from / 12), t); osc.frequency.exponentialRampToValueAtTime(ff, t + Pz.pitch.time); }
      else osc.frequency.setValueAtTime(ff, t);
      if (o.det) osc.detune.value = o.det;
      const g = ac.createGain(), og = o.gain != null ? o.gain : 1;
      g.gain.setValueAtTime(og, t);
      if (o.decay) g.gain.setTargetAtTime(0, t, o.decay);
      osc.connect(g); g.connect(into);
      if (o.fm) {
        const m = ac.createOscillator(), mg = ac.createGain();
        m.frequency.value = ff * o.fm.ratio;
        mg.gain.setValueAtTime(ff * o.fm.index * (0.4 + 0.6 * vel), t);
        mg.gain.setTargetAtTime(ff * (o.fm.sustain || 0), t, o.fm.decay || 0.3);
        m.connect(mg); mg.connect(osc.frequency); m.start(t); srcs.push(m);
      }
      osc.start(t); srcs.push(osc); oscs.push(osc);
    }
    if (Pz.vib) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = Pz.vib.rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(Pz.vib.depth, t + (Pz.vib.delay || 0) + 0.2);
      lfo.connect(lg); oscs.forEach(o => lg.connect(o.detune)); lfo.start(t); srcs.push(lfo);
    }
    if (Pz.noise) {
      const ns = ac.createBufferSource(), nf = F('bandpass', Pz.noise.freq || 3000, 0.8), ng = ac.createGain();
      ns.buffer = noise; ng.gain.setValueAtTime(Pz.noise.gain * vel, t); ng.gain.setTargetAtTime(0, t, Pz.noise.decay || 0.02);
      ns.connect(nf); nf.connect(ng); ng.connect(into); ns.start(t, Math.random()); ns.stop(t + 0.3);
    }
    const A = Pz.amp, peak = (Pz.gain != null ? Pz.gain : 0.3) * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + A.a);
    amp.gain.setTargetAtTime(peak * A.s, t + A.a, Math.max(0.005, A.d / 3));
    const hnd = {
      done: false,
      stop(at) {
        if (hnd.done) return; hnd.done = true;
        const s = Math.max(at != null ? at : ac.currentTime, t + 0.005, ac.currentTime);
        rel.gain.setValueAtTime(1, s); rel.gain.setTargetAtTime(0, s, Math.max(0.01, A.r / 3.5));
        const end = s + A.r * 1.6 + 0.06; srcs.forEach(o => { try { o.stop(end); } catch (e) { /* already stopped */ } });
      },
    };
    if (dur != null) hnd.stop(t + dur);
    else { /* safety: never leave a voice hanging forever */ srcs.forEach(o => { try { o.stop(t + 30); } catch (e) { /* noop */ } }); }
    return hnd;
  };

  /* ---- drums ---- */
  const noiseSrc = (t, dur) => { const s = ac.createBufferSource(); s.buffer = noise; s.start(t, Math.random() * 1.2); s.stop(t + dur); return s; };
  const env = (p, t, peak, dec) => { p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.002); p.exponentialRampToValueAtTime(0.0001, t + dec); };
  const burst = (t, dec, type, freq, peak, dest, q) => {
    const s = noiseSrc(t, dec + 0.05), f = F(type, freq, q != null ? q : (type === 'bandpass' ? 1.2 : 0.7)), g = ac.createGain();
    env(g.gain, t, peak, dec); s.connect(f); f.connect(g); g.connect(dest);
  };
  const tonal = (t, type, f0, f1, glide, dec, peak, dest, driveAmt) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g);
    if (driveAmt) { const ws = ac.createWaveShaper(); ws.curve = E.curve(driveAmt); g.connect(ws); ws.connect(dest); } else g.connect(dest);
    o.start(t); o.stop(t + dec + 0.05);
  };
  E.drum = function (trackId, kitId, voiceId, t, vel = 0.9) {
    const K = BB.KITS[kitId] || BB.KITS.lofi;
    t = Math.max(t, ac.currentTime); vel = Math.max(0.03, Math.min(1.2, vel));
    let dest = E.ch[trackId || 'drums'].input;
    if (K.lp < 17000) { const f = F('lowpass', K.lp, 0.5); f.connect(dest); dest = f; }
    switch (voiceId) {
      case 'kick': { const p = K.kick; tonal(t, K.osc, p.f0, p.f1, p.glide, p.dec, vel * p.gain, dest, p.drive); if (p.click) burst(t, 0.012, 'bandpass', 3500, vel * p.click, dest); break; }
      case 'snare': { const p = K.snare; burst(t, p.ndec, 'highpass', p.nf, vel * p.gain, dest); tonal(t, K.osc === 'sine' ? 'triangle' : K.osc, p.tone * 1.6, p.tone, 0.03, p.tdec, vel * p.gain * 0.9, dest); break; }
      case 'clap': {
        const p = K.clap, s = noiseSrc(t, 0.07 + p.dec), f = F('bandpass', p.f, 1.1), g = ac.createGain(), pk = vel * p.gain;
        g.gain.setValueAtTime(0.0001, t);
        [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(pk, t + o); g.gain.exponentialRampToValueAtTime(pk * 0.15, t + o + 0.009); });
        g.gain.setValueAtTime(pk * 0.75, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032 + p.dec);
        s.connect(f); f.connect(g); g.connect(dest); break;
      }
      case 'hat': { const p = K.hat; burst(t, p.dec, 'highpass', p.hp, vel * p.gain, dest); break; }
      case 'ohat': { const p = K.ohat; burst(t, p.dec, 'highpass', p.hp, vel * p.gain, dest); burst(t, p.dec * 0.7, 'bandpass', 10000, vel * p.gain * 0.5, dest, 1); break; }
      case 'rim': { const p = K.rim; tonal(t, 'triangle', p.f, p.f * 0.9, 0.01, p.dec, vel * p.gain, dest); burst(t, 0.01, 'highpass', 5000, vel * p.gain * 0.5, dest); break; }
      case 'tomL': case 'tomH': { const p = K.tom, f0 = p.f0 * (voiceId === 'tomH' ? 1.5 : 1); tonal(t, K.osc, f0 * 1.4, f0, 0.08, p.dec, vel * p.gain, dest); break; }
      case 'crash': { const p = K.crash; burst(t, p.dec, 'highpass', p.hp, vel * p.gain, dest); burst(t, p.dec * 0.5, 'bandpass', 7000, vel * p.gain * 0.6, dest, 0.8); break; }
      case 'shaker': {
        const p = K.shaker, s = noiseSrc(t, p.dec + 0.06), f = F('bandpass', p.f, 1.5), g = ac.createGain(), pk = vel * p.gain;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + p.dec);
        s.connect(f); f.connect(g); g.connect(dest); break;
      }
      default: break;
    }
  };

  if (project) E.applyMix(project);
  return E;
};

/* ---------------- live audio (one per page) ---------------- */
/* Phones need extra care before they make a sound:
   1. Sound may only start while a real tap or key press is being handled. On touch screens browsers count the END
      of a tap (touchend, pointerup, click), not pointerdown, so app.js calls init() on all of them, and wake()
      resumes the context and plays a silent sample inside that tap.
   2. iPhones mute Web Audio when the ring/silent switch is on. Asking for "playback" audio (navigator.audioSession,
      iOS 17+) makes the page play like a music app. Older iPhones get the same result from a silent looping <audio>.
   3. iOS pauses ("interrupts") the context for calls or when you switch apps. The next tap resumes it. */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let silentTag = null;
const quiet = p => { if (p && p.catch) p.catch(() => { /* not inside a tap yet, the next one retries */ }); };
function askForPlayback(ac) {
  const s = navigator.audioSession;
  if (s) { try { if (s.type !== 'playback') s.type = 'playback'; } catch (e) { /* not allowed here */ } return; }
  if (!isIOS || !ac || !window.Audio) return;
  if (!silentTag) {
    silentTag = new Audio(URL.createObjectURL(BB.encodeWav(ac.createBuffer(1, Math.round(ac.sampleRate / 4), ac.sampleRate))));
    silentTag.loop = true; silentTag.preload = 'auto'; silentTag.disableRemotePlayback = true;
    silentTag.setAttribute('x-webkit-airplay', 'deny'); silentTag.setAttribute('playsinline', '');
  }
  if (silentTag.paused && !document.hidden) { try { quiet(silentTag.play()); } catch (e) { /* noop */ } }
}
function wake(ac) {
  askForPlayback(ac);
  if (ac.state === 'running') return;
  try { quiet(ac.resume()); } catch (e) { /* noop */ }
  try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, ac.sampleRate); s.connect(ac.destination); s.start(0); } catch (e) { /* noop */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (silentTag) silentTag.pause(); return; }
  if (BB.audio.ctx && BB.audio.ctx.state !== 'running') { try { quiet(BB.audio.ctx.resume()); } catch (e) { /* noop */ } }
});

BB.audio = {
  ctx: null, E: null,
  /* Call from any user gesture. Returns false if the browser has no Web Audio. */
  init() {
    const A = BB.audio;
    if (!A.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { BB.emit('audio', { error: 'This browser can’t play sound. Try Chrome, Edge, Firefox or Safari.' }); return false; }
      askForPlayback(null);
      A.ctx = new AC({ latencyHint: 'interactive' });
      A.E = BB.createEngine(A.ctx, BB.store.p);
      A.ctx.onstatechange = () => BB.emit('audio', { state: A.ctx.state });
      BB.emit('audio', { state: A.ctx.state });
    }
    wake(A.ctx);
    return true;
  },
  get now() { return BB.audio.ctx ? BB.audio.ctx.currentTime : 0; },
  get ready() { return !!(BB.audio.ctx && BB.audio.ctx.state === 'running'); },
};
/* Keep the live mixer in sync with the song */
BB.on('change', () => { if (BB.audio.E) BB.audio.E.applyMix(BB.store.p); });

/* Quick preview helpers for UI (auditioning sounds) */
BB.preview = {
  note(trackId, midi, vel = 0.8, dur = 0.6, instId) {
    if (!BB.audio.init()) return;
    const p = BB.store.p, inst = instId || (p.tracks[trackId] && p.tracks[trackId].inst) || 'epiano';
    BB.audio.E.note(trackId, inst, midi, BB.audio.now + 0.005, vel, dur);
  },
  drum(voiceId, kitId, vel = 0.9) {
    if (!BB.audio.init()) return;
    BB.audio.E.drum('drums', kitId || 'lofi', voiceId, BB.audio.now + 0.003, vel);
  },
  chord(root, q, instId, dur = 0.9) {
    if (!BB.audio.init()) return;
    const inst = instId || BB.store.p.tracks.chords.inst;
    BB.theory.voice(root, q).forEach(m => BB.audio.E.note('chords', inst, m, BB.audio.now + 0.005, 0.7, dur));
  },
};
})();

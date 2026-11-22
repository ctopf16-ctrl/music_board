/* Beat Board · Mixer screen
   Five channel strips (volume fader with a live meter, pan, tone, reverb and echo sends, mute, solo)
   and the master section (volume, space, echo and echo time, tone, drive, pump, lo-fi) with one-tap
   presets. Desktop: strips side by side, master on the right. Phones (≤720px): every strip becomes a
   card with a horizontal fader, and a swipe that starts on a dial or fader still scrolls the page. */
(function () {
'use strict';
const BB = window.BB, { h } = BB, UI = BB.ui, C = BB.controls;

/* Keyboard letters (R T L M K J V are global). The five faders sit on the home row in strip order;
   every master letter comes from its own name: volUme, spaCe, Echo, ecHo time, toNe, drIve, Pump, lO-fi. */
const FADER_KEY = { drums: 'A', bass: 'S', chords: 'D', melody: 'F', keys: 'G' };
const MASTER_KEY = { volume: 'U', space: 'C', echo: 'E', echoTime: 'H', tone: 'N', drive: 'I', pump: 'P', lofi: 'O' };

const PHONE = window.matchMedia('(max-width: 720px)');
const P = () => BB.store.p;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v * 100) + '%';
const offPct = v => (v < 0.005 ? 'Off' : pct(v));
const openPct = v => (v > 0.995 ? 'Open' : pct(v));
const panFmt = v => { const a = Math.round(Math.abs(v) * 100); return a < 2 ? 'C' : (v < 0 ? 'L ' : 'R ') + a; };
const BEATS = { '16': 0.25, '8': 0.5, d8: 0.75, '4': 1 };

/* ---------- tooltips: what it does, and when you'd use it ---------- */
const TIP = {
  vol: 'How loud this track is in the mix. Drag up for louder, down for quieter. Balance these first: drums and bass usually lead, chords and pads sit a little lower. Double-click to reset.',
  meter: 'How loud this track is right now. It moves while music plays. If it keeps hitting the red at the top, pull the fader down a little.',
  pan: 'Move this track to the left or right speaker. Spreading tracks apart makes the mix feel wider. Keep drums and bass in the middle (C).',
  tone: 'Turn down to make this track darker and softer, as if it were behind a curtain. Handy for tucking a busy part into the background. All the way up (Open) leaves it untouched.',
  space: 'How much of this track goes into the shared reverb, the sound of a room or hall. Use more on chords and melodies for a dreamy feel, and little on drums and bass so they stay punchy. The master Space knob sets the overall amount.',
  echo: 'How much of this track gets repeating echoes. Lovely on melodies and keys; keep it low on bass and drums so things don’t get muddy. The master Echo knob sets how loud the echoes are, and Echo time sets their rhythm.',
  mute: 'Silence this track without deleting anything. Use it to hear the song without a part, or to bring parts in one by one.',
  solo: 'Hear only this track (plus any other soloed tracks). Great for checking a part on its own. Press again to hear everything.',
  sound: 'The instrument this track plays. Changing it here changes it for the whole song, and you hear a quick preview.',
  kit: 'Drums don’t have one sound for the whole song: each beat pattern picks its own drum kit (Dusty lo-fi, Trap 808…). This shows the kit of the scene you are editing. Click to open the Beat screen and change it.',
  silent: 'Another track is soloed, so this one is quiet for now. Turn off Solo to hear it again.',
};
const MTIP = {
  volume: 'The loudness of the whole song. Balance the tracks first, then use this to make everything louder or quieter. If the meter sits in the red, turn it down.',
  meter: 'How loud the whole song is right now. Lively movement that only touches the red now and then is perfect.',
  space: 'Reverb amount: how loud the reverb is for the whole song. Each track’s Space knob decides what goes into it; this sets the overall amount. Turn it up for a big, roomy sound.',
  echo: 'Echo amount: how loud the echoes are for the whole song. Each track’s Echo knob decides what gets echoed; this sets the overall level.',
  echoTime: 'How far apart the echoes are, locked to your tempo. Bouncy (dotted 1/8) rolls along with the beat, Slow (1/4) is wide and spacious, Flutter (1/16) is a quick shimmer.',
  tone: 'The brightness of the whole song. Turn it down for a warmer, darker, softer sound (great for lo-fi and chill); keep it high for crisp and bright.',
  drive: 'Saturation: adds warmth, grit and loudness, like pushing an old tape machine or amp. A little makes things feel fuller; a lot gets crunchy. Great for hip-hop, rock and dance.',
  pump: 'Everything except the drums ducks on each beat and swells back: the “breathing” sound of house and EDM. Works while the music plays, and sounds best with a kick on every beat.',
  lofi: 'Adds vinyl crackle and a muffled, old-radio tone. Perfect for chill lo-fi hip-hop or a nostalgic feel. Turn it way up for a dusty old record.',
};
const ECHO_TIMES = [
  { id: '16', label: '1/16', word: 'Flutter', title: '1/16 · Flutter', tip: 'Very quick echoes, a sixteenth note apart. Adds a fluttery shimmer.' },
  { id: '8', label: '1/8', word: 'Quick', title: '1/8 · Quick', tip: 'An echo every eighth note (half a beat). Busy and rhythmic.' },
  { id: 'd8', label: '1/8 dot', word: 'Bouncy', title: 'Dotted 1/8 · Bouncy', tip: 'Three sixteenths apart, so the echoes bounce in between the beats. Used in countless pop and electronic songs. The default.' },
  { id: '4', label: '1/4', word: 'Slow', title: '1/4 · Slow', tip: 'One echo per beat. Slow, wide and spacious.' },
];
const PRESET_NOTE = ' Sets every master effect at once; your track volumes stay the same, and Undo goes back.';
const PRESETS = [
  { id: 'clean', name: 'Clean', short: 'Clear and natural', tip: 'Clear and natural: a little reverb and echo, with no drive, pump or lo-fi. A good starting point for any song.',
    m: { tone: 0.92, space: 0.22, echo: 0.14, echoTime: 'd8', drive: 0, pump: 0, lofi: 0 } },
  { id: 'lofi', name: 'Lo-fi tape', short: 'Warm, dusty, muffled', tip: 'Warm and dusty, like an old cassette: crackle, muffled highs and gentle drive. Perfect for chill hip-hop and study beats.',
    m: { tone: 0.6, space: 0.3, echo: 0.2, echoTime: '8', drive: 0.22, pump: 0.1, lofi: 0.6 } },
  { id: 'bigroom', name: 'Big room', short: 'Huge reverb, long echoes', tip: 'A huge hall with long echoes and a touch of pump, like a festival stage. Great for dance anthems and big choruses.',
    m: { tone: 0.96, space: 0.72, echo: 0.34, echoTime: '4', drive: 0.1, pump: 0.3, lofi: 0 } },
  { id: 'club', name: 'Club pump', short: 'Breathes with the kick', tip: 'Punchy and loud, and everything breathes with the kick: the classic house and EDM sound. Best with a four-on-the-floor beat.',
    m: { tone: 0.9, space: 0.24, echo: 0.16, echoTime: '8', drive: 0.28, pump: 0.75, lofi: 0 } },
  { id: 'dreamy', name: 'Dreamy', short: 'Floaty and washed out', tip: 'Soft and floaty, washed in reverb and echo. For ambient, bedroom pop and slow, chill songs.',
    m: { tone: 0.7, space: 0.8, echo: 0.5, echoTime: 'd8', drive: 0, pump: 0.12, lofi: 0.12 } },
];
const presetOn = (pr, m) => Object.keys(pr.m).every(k => (typeof pr.m[k] === 'string' ? m[k] === pr.m[k] : Math.abs(m[k] - pr.m[k]) < 0.006));

/* ---------- edits (one undo step per gesture, per control) ---------- */
function setTrack(id, field, v, label) {
  if (P().tracks[id][field] === v) return;
  BB.store.change(label, p => { p.tracks[id][field] = v; }, { group: 'mx-' + field + '-' + id, info: { track: id } });
}
function setMaster(field, v, label) {
  if (P().master[field] === v) return;
  BB.store.change(label, p => { p.master[field] = v; }, { group: 'mx-m-' + field });
}
function applyPreset(pr) {
  BB.store.change('Preset: ' + pr.name, p => { Object.assign(p.master, pr.m); });
  UI.toast(pr.name + ': ' + pr.short.toLowerCase() + '.', { action: { label: 'Undo', onClick: () => BB.store.undo() } });
}

/* ---------- live meters ---------- */
const meters = [];
/* E.level is RMS x 3.2, clamped at 1. A normal full mix reads about 0.55-0.75 on the master and single tracks
   0.1-0.5, so a gentle power curve puts a healthy master near the top of the green and only real peaks in the red. */
const CURVE = 0.75, FALL = 0.022, HOLD = 900, PFALL = 0.012;
function meter(src, title, tip) {
  const el = h('div', { class: 'mx-meter', 'data-tip': tip, 'data-tip-title': title, 'aria-hidden': 'true' }, h('i', 'mx-meter-cover'), h('i', 'mx-meter-peak'));
  const m = { el, src, lv: 0, pk: 0, pkT: 0, wl: -1, wp: -1 };
  meters.push(m);
  return m;
}
function writeMeter(m) {
  if (Math.abs(m.lv - m.wl) > 0.004) { m.el.style.setProperty('--lv', m.lv.toFixed(3)); m.wl = m.lv; }
  if (Math.abs(m.pk - m.wp) > 0.004) { m.el.style.setProperty('--pk', m.pk.toFixed(3)); m.wp = m.pk; }
}
/* Runs on 'frame' only while the Mixer is visible. A few small analyser reads and two CSS variables per meter. */
function tickMeters() {
  const E = BB.audio.E; if (!E) return;
  const now = performance.now();
  for (const m of meters) {
    const x = E.level(m.src);
    const v = x > 0.002 ? Math.pow(Math.min(1, x), CURVE) : 0;
    m.lv = v >= m.lv ? v : Math.max(v, m.lv - FALL);
    if (v >= m.pk) { m.pk = v; m.pkT = now; } else if (now - m.pkT > HOLD) m.pk = Math.max(m.lv, m.pk - PFALL);
    writeMeter(m);
  }
}
function resetMeters() { for (const m of meters) { m.lv = 0; m.pk = 0; writeMeter(m); } }

/* ---------- phones: swipes that start on a dial or fader still scroll the page ----------
   The kit's controls grab the finger at once (and a fader jumps to where you touch), which makes a
   stacked list of strips impossible to scroll. On phones this view takes the touch first: a sideways
   slide changes the control (relative, no jump), an up/down swipe scrolls. CSS sets touch-action: pan-y. */
function touchable(el, o) { el.__mx = o; return el; } // o: {get(), set(v), min, max, px()}
function touchGuard(root) {
  let g = null;
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !PHONE.matches) return;
    const el = e.target.closest && e.target.closest('.knob, .fader');
    if (!el || !el.__mx || !root.contains(el)) return;
    e.stopPropagation(); // the kit's own handler would grab the touch and jump the value
    g = { el, id: e.pointerId, x: e.clientX, y: e.clientY, v0: el.__mx.get(), on: false };
  }, true);
  root.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.on) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { g = null; return; } // a scroll
      if (Math.abs(dx) < 7) return;
      g.on = true; g.x = e.clientX; g.el.classList.add('dragging');
      try { g.el.setPointerCapture(g.id); } catch (_) { /* noop */ }
      C.select(g.el, { noScroll: true });
      return;
    }
    const o = g.el.__mx;
    o.set(BB.clamp(g.v0 + (e.clientX - g.x) / o.px() * (o.max - o.min), o.min, o.max));
    g.el.update();
  }, true);
  const end = e => { if (g && e.pointerId === g.id) { g.el.classList.remove('dragging'); g = null; } };
  root.addEventListener('pointerup', end, true);
  root.addEventListener('pointercancel', end, true);
}
const KNOB_PX = () => 210; // a 210px slide sweeps a dial end to end

/* ---------- one channel strip ---------- */
function buildStrip(t, DEF) {
  const id = t.id, name = t.name, tr = () => P().tracks[id], d = DEF.tracks[id];
  const s = { id, ctls: [] };
  const knob = (field, label, extra) => {
    const o = Object.assign({ label, size: 'md', color: t.color, def: d[field], tip: TIP[field], min: 0, max: 1,
      value: () => tr()[field], set: v => setTrack(id, field, r2(v), name + ' ' + label.toLowerCase()) }, extra);
    const k = UI.knob(o);
    k.__ctl.label = name + ' ' + label.toLowerCase(); // the HUD names the track, the dial just says "Pan"
    k.setAttribute('aria-label', name + ' ' + label.toLowerCase());
    k.classList.add('mx-' + field);
    touchable(k, { get: o.value, set: o.set, min: o.min, max: o.max, px: KNOB_PX });
    s.ctls.push(k);
    return k;
  };
  const setPan = v => setTrack(id, 'pan', Math.abs(v) < 0.04 ? 0 : r2(v), name + ' pan'); // a soft click at the centre
  const pan = knob('pan', 'Pan', { min: -1, max: 1, fmt: panFmt, set: setPan });
  pan.classList.add('mx-bipolar');
  const tone = knob('tone', 'Tone', { fmt: openPct });
  const space = knob('space', 'Space', { fmt: offPct });
  const echo = knob('echo', 'Echo', { fmt: offPct });

  let sound;
  if (t.type === 'drums') {
    sound = UI.button({ label: 'Drum kit', cls: 'mx-kitnote', tip: TIP.kit, onClick: () => { if (BB.app) BB.app.setView('beat'); } });
    s.kitName = h('span', 'mx-kit-name');
    sound.innerHTML = '';
    sound.append(s.kitName, h('span', 'mx-kit-go', 'Per pattern, on Beat ›'));
  } else {
    sound = UI.instrumentSelect(id, { small: true, tip: TIP.sound });
    s.ctls.push(sound);
  }

  const toggle = (field, word) => {
    const b = UI.toggle({ label: word + ' ' + name, tipTitle: word, text: false, cls: 'sm mx-' + field, tip: TIP[field], value: () => tr()[field],
      set: v => BB.store.change((v ? word : 'Un' + word.toLowerCase()) + ' ' + name, p => { p.tracks[id][field] = v; }, { info: { track: id } }) });
    b.append(h('span', 'btn-label', word));
    s.ctls.push(b);
    return b;
  };
  const mute = toggle('mute', 'Mute'), solo = toggle('solo', 'Solo');

  s.makeFader = orient => {
    const o = { label: name + ' volume', key: FADER_KEY[id], color: t.color, orient, def: d.vol, tip: TIP.vol, min: 0, max: 1,
      value: () => tr().vol, set: v => setTrack(id, 'vol', r2(v), name + ' volume') };
    const f = UI.fader(o);
    touchable(f, { get: o.value, set: o.set, min: 0, max: 1, px: () => f.querySelector('.fader-track').getBoundingClientRect().width || 200 });
    return f;
  };
  s.orient = PHONE.matches ? 'h' : 'v';
  s.fader = s.makeFader(s.orient);
  s.meter = meter(id, name + ' level', TIP.meter);
  s.val = h('span', 'mx-vol-val');
  s.state = h('span', { class: 'mx-state', hidden: true });
  s.el = h('div', { class: 'mx-strip c-' + t.color, 'data-track': id, role: 'group', 'aria-label': name + ' channel' },
    h('div', 'mx-head', h('span', 'mx-name', name), s.state),
    h('div', 'mx-sound', sound),
    h('div', 'mx-knobs', h('div', 'mx-pair mx-shape', pan, tone), h('div', 'mx-pair mx-sends', space, echo)),
    h('div', 'mx-ms', mute, solo),
    h('div', 'mx-vol', h('span', 'mx-vol-lbl lbl', 'Vol'), s.fader, s.meter.el, s.val));
  return s;
}

/* ---------- master section + presets ---------- */
function buildMaster() {
  const m = () => P().master, D = BB.MASTER_DEFAULT, M = { ctls: [] };
  const knob = (field, label, fmt) => {
    const o = { label, key: MASTER_KEY[field], size: 'md', def: D[field], fmt, tip: MTIP[field], min: 0, max: 1,
      value: () => m()[field], set: v => setMaster(field, r2(v), 'Master ' + label.toLowerCase()) };
    const k = UI.knob(o);
    k.__ctl.label = 'Master ' + label.toLowerCase();
    k.setAttribute('aria-label', 'Master ' + label.toLowerCase());
    k.classList.add('mx-m-' + field);
    touchable(k, { get: o.value, set: o.set, min: 0, max: 1, px: KNOB_PX });
    M.ctls.push(k);
    return k;
  };
  const space = knob('space', 'Space', offPct), echo = knob('echo', 'Echo', offPct);
  const tone = knob('tone', 'Tone', openPct), drive = knob('drive', 'Drive', offPct), pump = knob('pump', 'Pump', offPct), lofi = knob('lofi', 'Lo-fi', offPct);

  const etime = UI.seg({ label: 'Echo time', key: MASTER_KEY.echoTime, small: true, tip: MTIP.echoTime, options: ECHO_TIMES, value: () => m().echoTime,
    set: v => { if (m().echoTime !== v) BB.store.change('Echo time', p => { p.master.echoTime = v; }); } });
  etime.classList.add('mx-etime');
  BB.$$('button', etime).forEach((b, i) => {
    const o = ECHO_TIMES[i];
    b.append(h('small', null, o.word));
    b.setAttribute('data-tip-title', o.title); b.setAttribute('aria-label', o.title);
  });
  M.ctls.push(etime);
  M.ms = h('span', 'mx-et-ms');

  M.makeFader = orient => {
    const o = { label: 'Master volume', key: MASTER_KEY.volume, orient, def: D.volume, tip: MTIP.volume, tipTitle: 'Master volume', min: 0, max: 1,
      value: () => m().volume, set: v => setMaster('volume', r2(v), 'Master volume') };
    const f = UI.fader(o);
    touchable(f, { get: o.value, set: o.set, min: 0, max: 1, px: () => f.querySelector('.fader-track').getBoundingClientRect().width || 200 });
    return f;
  };
  M.orient = PHONE.matches ? 'h' : 'v';
  M.fader = M.makeFader(M.orient);
  M.meter = meter('master', 'Master level', MTIP.meter);
  M.val = h('span', 'mx-vol-val');

  M.el = h('section', { class: 'panel mx-master', 'aria-label': 'Master' },
    h('div', 'panel-head', h('h3', null, 'Master'), h('p', 'hint', 'Effects on the whole song')),
    h('div', 'mx-master-body',
      h('div', 'mx-vol mx-mvol', h('span', 'mx-vol-lbl lbl', 'Volume'), M.fader, M.meter.el, M.val),
      h('div', 'mx-fx',
        h('div', 'mx-group mx-group-space', h('span', 'lbl mx-group-lbl', 'Space & echo'),
          h('div', 'mx-row', space, echo, h('div', 'mx-et', h('span', 'lbl mx-et-lbl', 'Echo time'), etime, M.ms))),
        h('div', 'mx-group mx-group-char', h('span', 'lbl mx-group-lbl', 'Character'),
          h('div', 'mx-row', tone, drive, pump, lofi)))));

  M.presets = PRESETS.map(pr => {
    const b = UI.button({ label: pr.name, cls: 'mx-preset', tip: pr.tip + PRESET_NOTE, onClick: () => applyPreset(pr) });
    b.dataset.preset = pr.id;
    b.append(h('span', 'mx-preset-sub', pr.short));
    return b;
  });
  M.presetsEl = h('section', { class: 'panel mx-presets-panel', 'aria-label': 'Master presets' },
    h('div', 'panel-head', h('h3', null, 'Presets'), h('p', 'hint', 'One tap sets every master effect')),
    h('div', 'mx-presets', M.presets));
  return M;
}

/* ---------- the view ---------- */
let root = null, strips = [], master = null, status = null, offFrame = null;

function refreshKit() {
  const s = strips.find(x => x.kitName); if (!s) return;
  const c = BB.store.clip('drums', BB.state.scene);
  s.kitName.textContent = c ? 'Kit: ' + (BB.KITS[c.kit] || BB.KITS.lofi).name : 'No beat in scene ' + (BB.state.scene + 1);
}
function refresh() {
  if (!root) return;
  const p = P(), anySolo = BB.TRACKS.some(t => p.tracks[t.id].solo);
  for (const s of strips) {
    const tr = p.tracks[s.id];
    s.ctls.forEach(c => c.update()); s.fader.update();
    s.val.textContent = pct(tr.vol);
    const off = tr.mute || (anySolo && !tr.solo);
    s.el.classList.toggle('is-off', off);
    s.el.classList.toggle('is-solo', !!tr.solo);
    s.state.textContent = tr.solo ? 'Solo' : tr.mute ? 'Muted' : off ? 'Silent' : '';
    s.state.hidden = !s.state.textContent;
    if (off && !tr.mute) s.state.setAttribute('data-tip', TIP.silent); else s.state.removeAttribute('data-tip');
  }
  const m = p.master;
  master.ctls.forEach(c => c.update()); master.fader.update();
  master.val.textContent = pct(m.volume);
  const ms = Math.round((BEATS[m.echoTime] || 0.75) * 60 / p.bpm * 1000);
  master.ms.textContent = 'Every ' + ms + ' ms at ' + p.bpm + ' BPM';
  master.presets.forEach((b, i) => { const on = presetOn(PRESETS[i], m); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  /* the strip panel says why something is quiet, with a one-tap way out */
  const soloed = BB.TRACKS.filter(t => p.tracks[t.id].solo).map(t => t.name), muted = BB.TRACKS.filter(t => p.tracks[t.id].mute).map(t => t.name);
  const list = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0]);
  status.text.textContent = soloed.length ? 'Solo on: only ' + list(soloed) + (soloed.length > 1 ? ' play' : ' plays') : muted.length ? 'Muted: ' + list(muted) : '';
  status.clearSolo.hidden = !soloed.length;
  status.unmute.hidden = !!soloed.length || !muted.length;
  status.el.hidden = !soloed.length && !muted.length;
  refreshKit();
}
/* Faders can't change direction, so swap them when the screen crosses the phone breakpoint. */
function relayout() {
  const o = PHONE.matches ? 'h' : 'v';
  for (const x of strips.concat(master ? [master] : [])) {
    if (x.orient === o) continue;
    const f = x.makeFader(o);
    if (C.sel === x.fader) C.clear();
    x.fader.replaceWith(f); x.fader = f; x.orient = o;
  }
  refresh();
}
const vis = sel => () => (root ? BB.$$(sel, root).find(e => e.offsetParent !== null) : null) || null;
/* phones show the tutorial card at the bottom, so tall targets get a smaller phone version */
const pick = (desk, phone) => () => (PHONE.matches ? vis(phone)() : vis(desk)());

BB.views.register({
  id: 'mixer', title: 'Mixer',
  letterMode: 'plain',
  mount(el) {
    root = el;
    const DEF = BB.defaultProject();
    strips = BB.TRACKS.map(t => buildStrip(t, DEF));
    master = buildMaster();
    const all = v => BB.store.change(v === 'solo' ? 'Clear solo' : 'Unmute all', p => { BB.TRACKS.forEach(t => { p.tracks[t.id][v] = false; }); });
    status = { text: h('span', 'mx-status-text') };
    status.clearSolo = UI.button({ label: 'Hear all', cls: 'sm', tip: 'Turn off every Solo so all tracks play again.', onClick: () => all('solo') });
    status.unmute = UI.button({ label: 'Unmute all', cls: 'sm', tip: 'Bring every muted track back.', onClick: () => all('mute') });
    status.el = h('div', { class: 'mx-status', hidden: true, role: 'status' }, h('i', 'mx-status-dot'), status.text, status.clearSolo, status.unmute);
    el.append(
      h('div', 'view-head',
        h('div', 'mx-titles', h('h2', 'view-title', 'Mixer'), h('p', 'view-sub', 'Balance your tracks and add space, echo and character.')),
        UI.tourButton('mixer')),
      h('div', 'mx-board',
        h('section', { class: 'panel mx-tracks', 'aria-label': 'Tracks' },
          h('div', 'panel-head', h('h3', null, 'Tracks'),
            h('p', 'hint mx-hint-desk', 'Drag a fader up for louder. Double-click any control to reset it.'),
            h('p', 'hint mx-hint-phone', 'Slide a fader or dial sideways to change it. Press and hold anything to learn what it does.'),
            status.el),
          h('div', 'mx-strips', strips.map(s => s.el))),
        h('div', 'mx-side', master.el, master.presetsEl)));
    touchGuard(el);
    PHONE.addEventListener('change', relayout);
    BB.on('ui', d => { if ('scene' in d && BB.state.view === 'mixer') refreshKit(); });
    refresh();
  },
  render() { refresh(); },
  show() { if (!offFrame) offFrame = BB.on('frame', tickMeters); refresh(); },
  hide() { if (offFrame) { offFrame(); offFrame = null; } resetMeters(); },
  tutorial: [
    { view: 'mixer', target: pick('.mx-strips', '.mx-strip.c-drums .mx-vol'), title: 'Balance the volumes first',
      text: 'Each strip is one track. Press <b>Play</b>, then move the <b>volume faders</b> until every part is clear and nothing is too loud or buried. Drums and bass usually lead, chords sit a little lower. Keyboard: <b>A S D F G</b> pick the faders, <b>← →</b> move them.' },
    { view: 'mixer', target: vis('.mx-strip.c-chords .mx-pan'), title: 'Pan: left and right',
      text: '<b>Pan</b> moves a track toward the left or right speaker. Keep drums and bass in the middle (<b>C</b>), then nudge chords one way and keys the other. Spreading parts apart makes the whole mix sound wider.' },
    { view: 'mixer', target: vis('.mx-strip.c-melody .mx-sends'), title: 'Space and Echo: how much, and how loud',
      text: 'On each track, <b>Space</b> (reverb) and <b>Echo</b> decide how much of that track goes into the shared effects. The <b>master</b> Space and Echo knobs set how loud those effects are overall. Try lots of echo on the melody and almost none on the bass.' },
    { view: 'mixer', target: vis('.mx-strip.c-bass .mx-ms'), title: 'Mute and Solo',
      text: '<b>Mute</b> silences a track. <b>Solo</b> plays only that track so you can hear it on its own; solo two tracks to hear just those two. Press again to switch it off. Nothing is deleted, so experiment freely.' },
    { view: 'mixer', target: pick('.mx-group-char', '.mx-group-char .mx-row'), title: 'Give the song character',
      text: 'These change the whole song. <b>Drive</b> adds warm grit and loudness. <b>Pump</b> makes everything except the drums duck on each beat, the “breathing” sound of house and EDM. <b>Lo-fi</b> adds vinyl crackle and an old-radio tone. <b>Tone</b> makes it all darker or brighter.' },
    { view: 'mixer', target: vis('.mx-presets'), title: 'One-tap presets',
      text: 'Each preset sets all the master effects at once for a ready-made vibe. Your track volumes stay as they are, and <b>Undo</b> (Ctrl+Z) takes you straight back.' },
    { view: 'mixer', target: vis('.mx-preset[data-preset="club"]'), title: 'Try this',
      text: 'Press <b>Play</b> and tap <b>Club pump</b>. Then <b>Solo</b> the drums and bass together to hear the groove. Un-solo, and slowly raise the master <b>Lo-fi</b> knob. Same song, a totally different mood!' },
  ],
});
})();

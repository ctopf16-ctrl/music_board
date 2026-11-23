/* Beat Board · ui kit
   Shared controls (knob, fader, seg, select, toggle, button, stepper), the keyboard control system
   (letter picks a control, arrows change it), tooltips, toasts, sheets and guided tutorials. */
(function () {
'use strict';
const BB = window.BB;
const { h, clamp } = BB;
const UI = BB.ui = {};

/* ================= keyboard control system =================
   Any control can be given a letter. Press the letter to pick it, then:
   ← → change it (hold Shift for bigger jumps), ↑ ↓ move to the previous / next control, Enter presses it. */
const C = BB.controls = { sel: null, hudTimer: 0 };
/* spec: {key, label, adjust(dir, big), activate(), text() -> string, instant (letter presses it immediately)} */
C.add = function (el, spec) {
  el.__ctl = spec; spec.el = el;
  el.classList.add('ctl');
  if (spec.key) {
    const k = spec.key.toUpperCase();
    el.dataset.key = k;
    let badge = el.querySelector(':scope > .hk');
    if (!badge) { badge = h('span', { class: 'hk', 'aria-hidden': 'true' }); el.append(badge); }
    badge.textContent = k;
  }
  if (!el.hasAttribute('tabindex') && !/^(BUTTON|SELECT|INPUT)$/.test(el.tagName)) el.tabIndex = 0;
  return el;
};
/* hidden, or covered by an open workspace (the screen underneath is inert) */
const visible = el => el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
C.scopeEls = function () {
  const view = BB.$('.view[data-view="' + BB.state.view + '"]');
  const inView = view ? BB.$$('.ctl', view) : [];
  const global = BB.$$('.topbar .ctl');
  return global.concat(inView).filter(visible);
};
C.byKey = function (k) {
  const view = BB.$('.view[data-view="' + BB.state.view + '"]');
  const pick = root => root && BB.$$('.ctl[data-key="' + k + '"]', root).find(visible);
  return pick(view) || pick(BB.$('.topbar')) || pick(BB.$('.sheet'));
};
C.select = function (el, opts = {}) {
  if (C.sel && C.sel !== el) C.sel.classList.remove('ctl-sel');
  C.sel = el;
  if (!el) { C.hideHud(); return; }
  el.classList.add('ctl-sel');
  if (!opts.noScroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  C.showHud();
};
C.clear = () => C.select(null);
C.adjust = function (dir, big) {
  const el = C.sel; if (!visible(el)) return false;
  const s = el.__ctl; if (!s || !s.adjust) return false;
  s.adjust(dir, big); C.showHud(); return true;
};
C.activate = function () {
  const el = C.sel; if (!visible(el)) return false;
  const s = el.__ctl;
  if (s.activate) s.activate(); else if (s.adjust) s.adjust(1, false); else el.click();
  C.showHud(); return true;
};
C.move = function (dir) {
  const els = C.scopeEls(); if (!els.length) return false;
  const i = els.indexOf(C.sel);
  C.select(els[i < 0 ? (dir > 0 ? 0 : els.length - 1) : (i + dir + els.length) % els.length]);
  return true;
};
C.showHud = function () {
  const el = C.sel, hud = BB.$('#hud'); if (!el || !hud) return;
  const s = el.__ctl || {};
  const label = s.label || el.getAttribute('aria-label') || '';
  const val = s.text ? s.text() : '';
  const hint = s.adjust ? '← → change · ↑ ↓ next' : 'Enter to press · ↑ ↓ next';
  hud.innerHTML = '';
  hud.append(el.dataset.key ? h('span', 'hud-key', el.dataset.key) : '', h('b', null, label), val ? h('span', 'hud-val', val) : '', h('span', 'hud-hint', hint));
  hud.classList.add('on');
  clearTimeout(C.hudTimer); C.hudTimer = setTimeout(() => hud.classList.remove('on'), 2600);
};
C.hideHud = function () { const hud = BB.$('#hud'); if (hud) hud.classList.remove('on'); };
/* Letter key from the global handler. Returns true if something used it. */
C.letter = function (k) {
  const el = C.byKey(k); if (!el) return false;
  const s = el.__ctl;
  C.select(el);
  if (s && s.instant) C.activate();
  return true;
};

/* ================= components ================= */
const fmtNum = v => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 100) / 100);
const tipAttrs = (o, label) => ({ 'data-tip': o.tip || null, 'data-tip-title': o.tipTitle || label || null });

/* Knob. o: {label, min=0, max=1, value(), set(v), fmt(v), def, tip, key, size:'sm'|'md'|'lg', color (css var name e.g. 'drums'), step} */
UI.knob = function (o) {
  const min = o.min != null ? o.min : 0, max = o.max != null ? o.max : 1, range = max - min;
  const fmt = o.fmt || (v => Math.round((v - min) / range * 100) + '%');
  const el = h('div', Object.assign({ class: 'knob ' + (o.size || 'md') + (o.color ? ' c-' + o.color : ''), role: 'slider', tabindex: '0', 'aria-label': o.label, 'aria-valuemin': min, 'aria-valuemax': max }, tipAttrs(o, o.label)),
    h('div', 'dial', h('div', 'cap')), h('span', 'knob-label', o.label), h('span', 'knob-val'));
  const valEl = el.querySelector('.knob-val');
  const snap = v => { v = clamp(v, min, max); return o.step ? Math.round(v / o.step) * o.step : v; };
  const update = () => {
    const v = o.value(); el.style.setProperty('--v', (v - min) / range);
    const txt = fmt(v); valEl.textContent = txt; el.setAttribute('aria-valuenow', fmtNum(v)); el.setAttribute('aria-valuetext', txt);
  };
  const put = v => { o.set(snap(v)); update(); };
  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault(); el.focus({ preventScroll: true }); C.select(el, { noScroll: true });
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    drag = { x: e.clientX, y: e.clientY, v: o.value() };
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const d = (drag.y - e.clientY) + (e.clientX - drag.x) * 0.6;
    put(drag.v + d / (e.shiftKey ? 600 : 170) * range); C.showHud();
  });
  const end = () => { drag = null; el.classList.remove('dragging'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => { if (o.def != null) put(o.def); });
  const adjust = (dir, big) => put(o.value() + dir * (o.kstep || o.step || range / 50) * (big ? 5 : 1));
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') adjust(1, e.shiftKey);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') adjust(-1, e.shiftKey);
    else if (e.key === 'Home') put(min); else if (e.key === 'End') put(max);
    else return;
    e.preventDefault(); e.stopPropagation(); C.select(el, { noScroll: true });
  });
  C.add(el, { key: o.key, label: o.hudLabel || o.label, adjust, text: () => fmt(o.value()) });
  if (o.hudLabel) el.setAttribute('aria-label', o.hudLabel);
  el.update = update; update();
  return el;
};

/* Fader (vertical by default). Same options as knob plus orient:'h'|'v'. */
UI.fader = function (o) {
  const min = o.min != null ? o.min : 0, max = o.max != null ? o.max : 1, range = max - min;
  const fmt = o.fmt || (v => Math.round((v - min) / range * 100) + '%');
  const el = h('div', Object.assign({ class: 'fader ' + (o.orient === 'h' ? 'h' : 'v') + (o.color ? ' c-' + o.color : ''), role: 'slider', tabindex: '0', 'aria-label': o.label, 'aria-orientation': o.orient === 'h' ? 'horizontal' : 'vertical' }, tipAttrs(o, o.label)),
    h('div', 'fader-track', h('div', 'fader-fill'), h('div', 'fader-thumb')));
  const track = el.querySelector('.fader-track');
  const update = () => { const v = o.value(); el.style.setProperty('--v', (v - min) / range); el.setAttribute('aria-valuetext', fmt(v)); };
  const put = v => { o.set(clamp(v, min, max)); update(); };
  const fromPointer = e => {
    const r = track.getBoundingClientRect();
    const f = o.orient === 'h' ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
    return min + clamp(f, 0, 1) * range;
  };
  let drag = false;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.focus({ preventScroll: true }); C.select(el, { noScroll: true }); try { el.setPointerCapture(e.pointerId); } catch (_) { /* noop */ } drag = true; put(fromPointer(e)); });
  el.addEventListener('pointermove', e => { if (drag) { put(fromPointer(e)); C.showHud(); } });
  el.addEventListener('pointerup', () => { drag = false; }); el.addEventListener('pointercancel', () => { drag = false; });
  el.addEventListener('dblclick', () => { if (o.def != null) put(o.def); });
  const adjust = (dir, big) => put(o.value() + dir * (o.kstep || range / 50) * (big ? 5 : 1));
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') adjust(1, e.shiftKey);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') adjust(-1, e.shiftKey);
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  C.add(el, { key: o.key, label: o.hudLabel || o.label, adjust, text: () => fmt(o.value()) });
  if (o.hudLabel) el.setAttribute('aria-label', o.hudLabel);
  el.update = update; update();
  return el;
};

/* Segmented buttons. o: {label, options:[{id, label, tip, color}], value(), set(id), key, tip, small} */
UI.seg = function (o) {
  const el = h('div', Object.assign({ class: 'seg' + (o.small ? ' sm' : ''), role: 'group', 'aria-label': o.label }, tipAttrs(o, o.label)));
  const btns = o.options.map(opt => {
    const b = h('button', { class: opt.color ? 'c-' + opt.color : null, 'data-tip': opt.tip || null, 'data-tip-title': opt.tip ? opt.label : null },
      opt.color ? h('i', 'sw') : null, opt.icon ? h('span', { class: 'ico', html: opt.icon }) : null, opt.label);
    b.addEventListener('click', () => { o.set(opt.id); update(); });
    el.append(b); return b;
  });
  const update = () => { const v = o.value(); btns.forEach((b, i) => b.setAttribute('aria-pressed', o.options[i].id === v)); };
  const adjust = dir => { const i = o.options.findIndex(x => x.id === o.value()); const n = o.options[(i + dir + o.options.length) % o.options.length]; o.set(n.id); update(); };
  C.add(el, { key: o.key, label: o.label, adjust, text: () => (o.options.find(x => x.id === o.value()) || {}).label || '' });
  el.update = update; update();
  return el;
};

/* Native select (great on phones). o: {label, options:[{id, label, group}], value(), set(id), key, tip, small} */
UI.select = function (o) {
  const sel = h('select', { 'aria-label': o.label });
  const fill = () => {
    sel.innerHTML = '';
    const groups = {};
    for (const opt of (typeof o.options === 'function' ? o.options() : o.options)) {
      const op = h('option', { value: opt.id }, opt.label);
      if (opt.group) { if (!groups[opt.group]) { groups[opt.group] = h('optgroup', { label: opt.group }); sel.append(groups[opt.group]); } groups[opt.group].append(op); }
      else sel.append(op);
    }
  };
  fill();
  const el = h('span', Object.assign({ class: 'sel' + (o.small ? ' sm' : '') }, tipAttrs(o, o.label)), sel);
  /* after a mouse/touch pick, let go of focus so keyboard shortcuts work again */
  let byPointer = false;
  sel.addEventListener('pointerdown', () => { byPointer = true; });
  sel.addEventListener('change', () => { o.set(sel.value); if (byPointer) { byPointer = false; sel.blur(); } });
  sel.addEventListener('blur', () => { byPointer = false; });
  const opts = () => Array.from(sel.options);
  const update = () => { const v = String(o.value()); if (sel.value !== v) sel.value = v; };
  const adjust = dir => { const os = opts(), i = os.findIndex(x => x.value === sel.value); const n = os[(i + dir + os.length) % os.length]; o.set(n.value); update(); };
  C.add(el, { key: o.key, label: o.label, adjust, text: () => (sel.selectedOptions[0] || {}).textContent || '' });
  el.update = update; el.refill = () => { fill(); update(); }; el.select = sel; update();
  return el;
};

/* Toggle button. o: {label, icon (svg string), value(), set(bool), key, tip, cls, instant (default true)} */
UI.toggle = function (o) {
  const el = h('button', Object.assign({ class: 'btn toggle ' + (o.cls || ''), 'aria-label': o.ariaLabel || o.label }, tipAttrs(o, o.label)),
    o.icon ? h('span', { class: 'ico', html: o.icon }) : null, o.text !== false ? h('span', 'btn-label', o.label) : null);
  const update = () => el.setAttribute('aria-pressed', !!o.value());
  el.addEventListener('click', () => { o.set(!o.value()); update(); });
  C.add(el, { key: o.key, label: o.hudLabel || o.label, adjust: () => { o.set(!o.value()); update(); }, activate: () => { o.set(!o.value()); update(); }, text: () => (o.value() ? 'On' : 'Off'), instant: o.instant !== false });
  el.update = update; update();
  return el;
};

/* Plain button. o: {label, icon, onClick, key, tip, cls, text (false hides label), instant} */
UI.button = function (o) {
  const el = h('button', Object.assign({ class: 'btn ' + (o.cls || ''), 'aria-label': o.ariaLabel || o.label }, tipAttrs(o, o.label)),
    o.icon ? h('span', { class: 'ico', html: o.icon }) : null, o.text !== false ? h('span', 'btn-label', o.label) : null);
  el.addEventListener('click', e => o.onClick(e));
  C.add(el, { key: o.key, label: o.label, activate: () => o.onClick({}), instant: !!o.instant });
  return el;
};

/* − value + stepper. o: {label, min, max, step=1, value(), set(v), fmt, key, tip, unit} */
UI.stepper = function (o) {
  const step = o.step || 1, fmt = o.fmt || (v => String(v));
  const val = h('span', 'stepper-val');
  const put = v => { o.set(clamp(Math.round(v / step) * step, o.min, o.max)); update(); };
  const down = h('button', { class: 'stepper-btn', 'aria-label': 'Lower ' + o.label, onclick: e => put(o.value() - step * (e.shiftKey ? 5 : 1)) }, '−');
  const up = h('button', { class: 'stepper-btn', 'aria-label': 'Raise ' + o.label, onclick: e => put(o.value() + step * (e.shiftKey ? 5 : 1)) }, '+');
  const el = h('div', Object.assign({ class: 'stepper', role: 'spinbutton', 'aria-label': o.label, 'aria-valuemin': o.min, 'aria-valuemax': o.max }, tipAttrs(o, o.label)), down, val, o.unit ? h('span', 'stepper-unit', o.unit) : null, up);
  const update = () => { const v = o.value(); val.textContent = fmt(v); el.setAttribute('aria-valuenow', v); };
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') put(o.value() + step * (e.shiftKey ? 5 : 1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') put(o.value() - step * (e.shiftKey ? 5 : 1));
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  C.add(el, { key: o.key, label: o.label, adjust: (dir, big) => put(o.value() + dir * step * (big ? 5 : 1)), text: () => fmt(o.value()) + (o.unit ? ' ' + o.unit : '') });
  el.update = update; update();
  return el;
};

/* Scene picker used by the editors. Picking a scene makes it the one being edited, and (while playing
   in loop mode) launches that whole scene at the next bar so you hear what you edit.
   o: {track: trackId | () => trackId (marks scenes that have a clip on that track), key, label} */
UI.scenePicker = function (o = {}) {
  const el = h('div', { class: 'scenes', role: 'group', 'aria-label': o.label || 'Scene', 'data-tip': 'Scenes are the sections of your song, like Verse or Chorus. Pick one to edit it. While playing, the whole scene starts on the next bar.', 'data-tip-title': 'Scenes' });
  const btns = BB.range(BB.SCENE_COUNT).map(i => {
    const b = h('button', { class: 'scene-btn', onclick: () => pick(i) }, h('span', 'num', String(i + 1)), h('span', 'nm', ''));
    el.append(b); return b;
  });
  const pick = i => {
    BB.setState({ scene: i });
    if (BB.transport.mode === 'loop') BB.transport.launchScene(i);
    update();
  };
  const update = () => {
    const p = BB.store.p, tr = typeof o.track === 'function' ? o.track() : o.track;
    btns.forEach((b, i) => {
      b.querySelector('.nm').textContent = p.scenes[i].name;
      b.setAttribute('aria-pressed', BB.state.scene === i);
      b.setAttribute('aria-label', 'Scene ' + (i + 1) + ': ' + p.scenes[i].name);
      b.className = 'scene-btn' + (tr ? ' c-' + BB.TRACK[tr].color : '');
      b.classList.toggle('has', !!(tr && p.clips[tr][i]));
      const pos = tr && BB.transport.positionOf(tr);
      b.classList.toggle('playing', !!(pos && pos.scene === i));
    });
  };
  C.add(el, { key: o.key, label: o.label || 'Scene', adjust: dir => pick((BB.state.scene + dir + BB.SCENE_COUNT) % BB.SCENE_COUNT), text: () => (BB.state.scene + 1) + ' · ' + BB.store.p.scenes[BB.state.scene].name });
  BB.on('ui', d => { if ('scene' in d) update(); });
  BB.on('launch', update); BB.on('change', update); BB.on('transport', update);
  el.update = update; update();
  return el;
};

/* Compact scene picker (a native select) for workspace headers. Same behaviour as UI.scenePicker.
   o: {track: trackId | () => trackId (marks scenes that have a clip with a dot), key, label} */
UI.sceneSelect = function (o = {}) {
  const tr = () => (typeof o.track === 'function' ? o.track() : o.track);
  const label = i => { const p = BB.store.p, t = tr(); return (i + 1) + ' · ' + p.scenes[i].name + (t && p.clips[t][i] ? '  •' : ''); };
  const sel = UI.select({
    label: o.label || 'Scene', key: o.key, small: true,
    tip: 'The scene (song section) you are working on. Pick another to switch to it. While playing, the whole scene starts on the next bar. A dot means it already has a part here.',
    options: () => BB.range(BB.SCENE_COUNT).map(i => ({ id: String(i), label: label(i) })),
    value: () => String(BB.state.scene),
    set: v => { const i = +v; BB.setState({ scene: i }); if (BB.transport.mode === 'loop') BB.transport.launchScene(i); },
  });
  sel.classList.add('scene-sel');
  let sig = '';
  const pick = sel.update; // the plain select's update: just shows the current scene
  const sync = () => { const s = BB.range(BB.SCENE_COUNT).map(label).join('|'); if (s !== sig) { sig = s; sel.refill(); } else pick(); };
  BB.on('ui', d => { if ('scene' in d || 'noteTrack' in d) sync(); });
  BB.on('change', sync);
  sel.update = sync; sync();
  return sel;
};

/* A track's sound shaping, the same dials as its Mixer strip: volume, tone, reverb (space) and echo.
   trackId can be a function (Keys edits whichever note track is picked). o: {volKey} */
UI.trackKnobs = function (trackId, o = {}) {
  const id = () => (typeof trackId === 'function' ? trackId() : trackId);
  const name = () => BB.TRACK[id()].name, tr = () => BB.store.p.tracks[id()];
  const def = BB.defaultProject().tracks;
  const pct = v => Math.round(v * 100) + '%';
  const set = (field, label) => v => {
    v = Math.round(v * 100) / 100;
    if (tr()[field] === v) return;
    BB.store.change(name() + ' ' + label, p => { p.tracks[id()][field] = v; }, { group: 'mx-' + field + '-' + id(), info: { track: id() } });
  };
  const defs = [
    { field: 'vol', label: 'Volume', key: o.volKey, fmt: pct, tip: 'How loud this part is in the mix. The same as its fader on the Mixer screen. Double-click to reset.' },
    { field: 'tone', label: 'Tone', fmt: v => (v > 0.995 ? 'Open' : pct(v)), tip: 'Turn down to make this part darker and softer, as if it were behind a curtain. All the way up (Open) leaves it untouched.' },
    { field: 'space', label: 'Space', fmt: v => (v < 0.005 ? 'Off' : pct(v)), tip: 'How much reverb this part gets: the sound of a room or hall. More feels dreamy and far away, less stays close and punchy.' },
    { field: 'echo', label: 'Echo', fmt: v => (v < 0.005 ? 'Off' : pct(v)), tip: 'How much of this part repeats as echoes. Lovely on melodies; keep it low on drums and bass so things stay clear.' },
  ];
  const knobs = defs.map(d => {
    const k = UI.knob({ label: d.label, key: d.key, size: 'md', min: 0, max: 1, fmt: d.fmt, tip: d.tip,
      get def() { return def[id()][d.field]; }, value: () => tr()[d.field], set: set(d.field, d.label.toLowerCase()) });
    k.__ctl.label = name() + ' ' + d.label.toLowerCase();
    return { k, d };
  });
  const el = h('div', 'track-knobs', knobs.map(x => x.k));
  el.update = () => {
    const t = id();
    el.className = 'track-knobs c-' + BB.TRACK[t].color;
    knobs.forEach(({ k, d }) => { k.update(); k.__ctl.label = name() + ' ' + d.label.toLowerCase(); k.setAttribute('aria-label', name() + ' ' + d.label.toLowerCase()); });
  };
  BB.on('change', el.update);
  el.update();
  return el;
};

/* Instrument picker for a track (grouped). Changing it plays a short preview. */
UI.instrumentSelect = function (trackId, o = {}) {
  const opts = Object.entries(BB.INSTRUMENTS).sort((a, b) => BB.INSTRUMENT_GROUPS.indexOf(a[1].group) - BB.INSTRUMENT_GROUPS.indexOf(b[1].group)).map(([id, x]) => ({ id, label: x.name, group: x.group }));
  const sel = UI.select({
    label: o.label || BB.TRACK[trackId].name + ' sound', key: o.key, small: o.small, options: opts,
    tip: o.tip || 'Choose the instrument this track plays. Each one has its own character; try a few!',
    value: () => BB.store.p.tracks[trackId].inst,
    set: id => {
      BB.store.change('Change sound', p => { p.tracks[trackId].inst = id; }, { info: { track: trackId } });
      const mid = trackId === 'bass' ? 40 : trackId === 'chords' ? null : 64;
      if (mid == null) BB.preview.chord(BB.store.p.key, BB.theory.isMinorish(BB.store.p.mode) ? 'min' : 'maj', id);
      else BB.preview.note(trackId, mid + BB.store.p.key, 0.8, 0.6, id);
      const d = BB.INSTRUMENTS[id]; if (d) UI.toast(d.name + ': ' + d.desc);
    },
  });
  BB.on('change', () => sel.update());
  return sel;
};

/* Drum kit picker. o: {value(), set(id), key} */
UI.kitSelect = function (o) {
  return UI.select({
    label: 'Drum kit', key: o.key, small: o.small,
    options: Object.entries(BB.KITS).map(([id, k]) => ({ id, label: k.name })),
    tip: o.tip || 'The set of drum sounds this pattern uses. Your pattern stays the same, only the sounds change.',
    value: o.value, set: id => { o.set(id); BB.preview.drum('kick', id); setTimeout(() => BB.preview.drum('snare', id), 180); },
  });
};

/* "Show me how" button that starts a view's tutorial */
UI.tourButton = function (tourId, label = 'Tutorial') {
  return UI.button({ label, cls: 'ghost sm tour-btn', icon: UI.ICONS.help, tip: 'A short guided walkthrough of this screen. Use ← → to step through it.', onClick: () => BB.tutorial.start(tourId) });
};

/* Press and slide across keys/pads (pianos, melody strips). on(el) / off(el) */
UI.glide = function (container, selector, on, off) {
  const active = new Map();
  container.addEventListener('pointerdown', e => {
    const el = e.target.closest(selector); if (!el || !container.contains(el)) return;
    e.preventDefault(); if (!BB.audio.init()) return;
    try { container.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    active.set(e.pointerId, el); on(el, e);
  });
  container.addEventListener('pointermove', e => {
    if (!active.has(e.pointerId)) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const el = hit && hit.closest ? hit.closest(selector) : null, cur = active.get(e.pointerId);
    if (el !== cur && (!el || container.contains(el))) { if (cur) off(cur); active.set(e.pointerId, el); if (el) on(el, e); }
  });
  const end = e => { if (!active.has(e.pointerId)) return; const cur = active.get(e.pointerId); active.delete(e.pointerId); if (cur) off(cur); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => container.addEventListener(ev, end));
};

/* ================= workspaces =================
   A full-screen area that opens over a screen: the step grid, the piano roll, the pads. The transport bar stays
   on top so Play, Record and Undo still work; the screen underneath goes inert until the workspace closes
   (Close button, Esc, or the phone's Back). Append ws.el to the view's <section>, next to the main content.
   o: {id, title, color, head: [elements after the title], cls, label, closeTip, onOpen(), onClose()}
   returns {id, el, head, body, open({from}), close(), isOpen(), setColor(c)} */
const WS = UI.workspaces = {};
UI.ws = null; // the open workspace, if any
let wsSkipPop = false;
function wsMeasure() {
  const tb = BB.$('#topbar');
  const b = tb ? Math.max(0, tb.getBoundingClientRect().bottom) : 0;
  document.documentElement.style.setProperty('--ws-top', Math.round(b) + 'px');
}
UI.workspace = function (o) {
  const w = { id: o.id, from: null };
  const close = UI.button({ label: 'Close', icon: UI.ICONS.close, cls: 'ws-close',
    tip: o.closeTip || 'Close this and go back to the screen underneath. Shortcut: Esc.', onClick: () => w.close() });
  w.titleText = h('span', 'ws-title-text', o.title);
  w.head = h('div', 'ws-head', close, h('h2', 'ws-title', h('i', 'sw'), w.titleText), o.head || []);
  w.body = h('div', 'ws-body');
  w.el = h('div', { class: 'ws' + (o.cls ? ' ' + o.cls : ''), 'data-ws': o.id, role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || o.title, tabindex: '-1', hidden: true },
    h('div', 'ws-inner', w.head, w.body));
  w.setColor = c => { BB.TRACKS.forEach(t => w.el.classList.toggle('c-' + t.color, t.color === c)); };
  if (o.color) w.setColor(o.color);
  w.isOpen = () => UI.ws === w;
  w.open = (opts = {}) => {
    if (UI.ws === w) return;
    const swap = !!UI.ws;
    if (UI.ws) UI.ws.close({ keepHistory: true, swap: true });
    w.from = opts.from || (document.activeElement !== document.body ? document.activeElement : null);
    wsMeasure();
    const sec = w.el.parentElement;
    if (sec) for (const c of sec.children) if (!c.classList.contains('ws')) c.inert = true;
    w.el.hidden = false;
    w.el.classList.toggle('ws-swap', swap);
    UI.ws = w;
    document.documentElement.classList.add('ws-lock');
    document.body.classList.add('ws-open');
    BB.controls.clear(); BB.tooltip.hide();
    try {
      if (history.state && history.state.bbws) history.replaceState({ bbws: o.id }, '');
      else history.pushState({ bbws: o.id }, '');
    } catch (e) { /* sandboxed */ }
    w.el.focus({ preventScroll: true });
    if (o.onOpen) try { o.onOpen(); } catch (e) { console.error(e); }
    BB.emit('workspace', { id: o.id, open: true });
  };
  /* opts: keepHistory (another workspace or screen takes over), fromPop (the Back button closed it) */
  w.close = (opts = {}) => {
    if (UI.ws !== w) return;
    UI.ws = null;
    w.el.hidden = true;
    const sec = w.el.parentElement;
    if (sec) for (const c of sec.children) if (!c.classList.contains('ws')) c.inert = false;
    if (!opts.swap) { document.documentElement.classList.remove('ws-lock'); document.body.classList.remove('ws-open'); }
    BB.controls.clear(); BB.tooltip.hide();
    if (!opts.fromPop && !opts.keepHistory) {
      try { if (history.state && history.state.bbws) { wsSkipPop = true; history.back(); } } catch (e) { /* sandboxed */ }
    }
    if (o.onClose) try { o.onClose(); } catch (e) { console.error(e); }
    const from = w.from; w.from = null;
    if (!opts.swap && from && from.isConnected && !from.closest('[hidden], [inert]')) { try { from.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
    BB.emit('workspace', { id: o.id, open: false });
  };
  WS[o.id] = w;
  return w;
};
/* Open the workspace with this id, or close whatever is open (id null). Tutorials use this. */
UI.showWorkspace = function (id) {
  if (id == null) { if (UI.ws) UI.ws.close(); return; }
  const w = WS[id]; if (w && !w.isOpen()) w.open();
};
/* A card on a screen that opens a workspace: title, a live preview you can tap, and a footer.
   o: {title, color, pill, preview (element), tip, tipTitle, foot: [elements], button (the Open button), cls, id} */
UI.wsCard = function (o) {
  const prev = h('button', { class: 'ws-card-preview', 'aria-label': o.ariaLabel || o.title, 'data-tip': o.tip, 'data-tip-title': o.tipTitle || o.title, onclick: o.onOpen }, o.preview);
  return h('section', { class: 'panel ws-card' + (o.color ? ' c-' + o.color : '') + (o.cls ? ' ' + o.cls : ''), id: o.id || null, 'aria-label': o.title },
    h('div', 'panel-head', h('h3', null, h('i', 'sw'), o.title), o.pill || null, h('span', 'grow'), o.headExtra || null),
    prev,
    h('div', 'ws-card-foot', o.foot || [], h('span', 'grow'), o.button || null));
};
window.addEventListener('popstate', () => {
  if (wsSkipPop) { wsSkipPop = false; return; }
  if (UI.ws) { UI.ws.close({ fromPop: true }); return; }
  BB.emit('popstate');
});
window.addEventListener('resize', () => { if (UI.ws) wsMeasure(); });

/* ================= toast ================= */
UI.toast = function (text, opts = {}) {
  let wrap = BB.$('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(wrap); }
  /* opts.replace: a string id; a newer toast with the same id replaces the older one */
  if (opts.replace) BB.$$('.toast', wrap).forEach(x => { if (x.dataset.replace === opts.replace) x.remove(); });
  const t = h('div', 'toast', h('span', null, text));
  if (opts.replace) t.dataset.replace = opts.replace;
  if (opts.action) t.append(h('button', { class: 'toast-act', onclick: () => { opts.action.onClick(); t.remove(); } }, opts.action.label));
  wrap.append(t);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
  setTimeout(() => t.classList.add('out'), opts.ms || 2600);
  setTimeout(() => t.remove(), (opts.ms || 2600) + 400);
  return t;
};
BB.on('toast', d => UI.toast(d.text, d));

/* ================= sheet (dialog on desktop, bottom sheet on phones) ================= */
UI.sheet = function (o) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const body = h('div', 'sheet-body'); if (o.body) body.append(o.body);
  const actions = (o.actions || []).map(a => h('button', { class: 'btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : ''), onclick: () => { const keep = a.onClick && a.onClick(); if (!keep) close(); } }, a.label));
  const card = h('div', { class: 'sheet' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
    h('div', 'sheet-head', h('h2', null, o.title), h('button', { class: 'btn ghost icon-only', 'aria-label': 'Close', onclick: close }, h('span', { class: 'ico', html: UI.ICONS.close }))),
    body, actions.length ? h('div', 'sheet-actions', actions) : null);
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(); } }, card);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => { const f = card.querySelector('input, select, button.primary, .sheet-body button'); if (f) f.focus(); }, 30);
  return { close, el: card, body };
};

/* ================= tooltips ================= */
const Tip = BB.tooltip = { el: null, timer: 0, target: null };
function tipEl() { if (!Tip.el) { Tip.el = h('div', { id: 'tooltip', role: 'tooltip' }); document.body.append(Tip.el); } return Tip.el; }
Tip.show = function (target) {
  const text = target.getAttribute('data-tip'); if (!text) return;
  const title = target.getAttribute('data-tip-title');
  const key = target.dataset.key;
  const el = tipEl(); el.innerHTML = '';
  if (title) el.append(h('b', null, title));
  el.append(h('span', null, text));
  if (key && document.body.classList.contains('show-keys')) el.append(h('span', 'tip-key', 'Keyboard: press ', h('kbd', null, (BB.views.current() && BB.views.current().letterMode === 'notes' ? '⇧ ' : '') + key), target.__ctl && target.__ctl.adjust ? ', then ← →' : ''));
  el.classList.add('on');
  const r = target.getBoundingClientRect(), tw = el.offsetWidth, th = el.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
  if (y < 8) y = r.bottom + 10;
  x = clamp(x, 8, window.innerWidth - tw - 8);
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  Tip.target = target;
};
Tip.hide = function () { clearTimeout(Tip.timer); if (Tip.el) Tip.el.classList.remove('on'); Tip.target = null; };
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t === Tip.target) return;
  Tip.hide();
  if (t) Tip.timer = setTimeout(() => Tip.show(t), 450);
});
document.addEventListener('pointerdown', e => {
  Tip.hide();
  if (e.pointerType === 'mouse') return;
  const t = e.target.closest && e.target.closest('[data-tip]'); if (!t || t.closest('[data-no-press-tip]')) return;
  const x = e.clientX, y = e.clientY;
  const lp = setTimeout(() => {
    Tip.show(t);
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    t.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => { t.removeEventListener('click', swallow, { capture: true }); Tip.hide(); }, 3200);
  }, 550);
  const cancel = ev => { if (ev.type !== 'pointermove' || Math.hypot(ev.clientX - x, ev.clientY - y) > 8) { clearTimeout(lp); off(); } };
  const off = () => { document.removeEventListener('pointermove', cancel); document.removeEventListener('pointerup', cancel); document.removeEventListener('pointercancel', cancel); };
  document.addEventListener('pointermove', cancel); document.addEventListener('pointerup', cancel); document.addEventListener('pointercancel', cancel);
}, true);
document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && t.matches(':focus-visible')) { clearTimeout(Tip.timer); Tip.timer = setTimeout(() => Tip.show(t), 300); } });
document.addEventListener('focusout', () => Tip.hide());
window.addEventListener('scroll', () => Tip.hide(), true);

/* ================= tutorials =================
   BB.tutorial.register(id, {title, steps:[{target: selector|fn, title, text, view, task, check, doneText}]})
   task (html) + check() make a hands-on step: it waits until check() is true, shows a tick, then moves on.
   BB.tutorial.start(id). While a tour runs, ← → step through it and Esc ends it. The page stays usable. */
const Tour = BB.tutorial = { tours: {}, active: null };
Tour.register = (id, def) => { Tour.tours[id] = def; };
Tour.start = function (id, i = 0) {
  const def = Tour.tours[id]; if (!def) return;
  Tour.stop();
  Tour.active = { id, def, i };
  const shade = h('div', 'tour-spot');
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite', 'aria-label': def.title });
  Tour.active.shade = shade; Tour.active.card = card;
  document.body.append(shade, card);
  document.body.classList.add('touring');
  /* keep the spotlight on its target when the page scrolls or the layout shifts */
  Tour.active.follow = setInterval(Tour.place, 300);
  Tour.show();
};
Tour.show = function () {
  const A = Tour.active; if (!A) return;
  const st = A.def.steps[A.i];
  if (st.view && st.view !== BB.state.view && BB.app) BB.app.setView(st.view);
  if (st.before) try { st.before(); } catch (e) { console.error(e); }
  /* Open the workspace the target lives in, or close one when the target is on the screen itself.
     A step can say which with ws: 'id' | null. Targets in the transport bar leave things as they are. */
  let want = st.ws;
  if (want === undefined) {
    const t0 = typeof st.target === 'function' ? st.target() : (st.target ? BB.$(st.target) : null);
    if (t0 && !t0.closest('.topbar, #tabs')) { const w = t0.closest('.ws'); want = w ? w.dataset.ws : null; }
  }
  if (want !== undefined) UI.showWorkspace(want);
  requestAnimationFrame(() => {
    if (!Tour.active) return;
    const tgt = typeof st.target === 'function' ? st.target() : (st.target ? BB.$(st.target) : null);
    const ok = tgt && tgt.isConnected && tgt.getClientRects().length > 0 && !tgt.closest('[hidden]');
    if (ok) tgt.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = ok ? tgt.getBoundingClientRect() : null;
    const { shade, card } = A;
    A.tgt = ok ? tgt : null;
    if (r) { const pad = 6; Object.assign(shade.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); }
    else shade.style.display = 'none';
    card.innerHTML = '';
    const n = A.def.steps.length;
    card.append(...[
      h('div', 'tour-top', h('span', 'tour-count', `${A.def.title} · ${A.i + 1} of ${n}`), h('button', { class: 'btn ghost icon-only sm', 'aria-label': 'Close tutorial', onclick: Tour.stop }, h('span', { class: 'ico', html: UI.ICONS.close }))),
      h('h3', null, st.title),
      h('p', { html: st.text }),
      st.task ? h('div', { class: 'tour-task', role: 'status' }, h('span', 'tour-task-mark', ''), h('span', { class: 'tour-task-text', html: st.task })) : null,
      h('div', 'tour-actions',
        A.i > 0 ? h('button', { class: 'btn ghost', onclick: () => Tour.go(-1) }, 'Back') : h('span'),
        h('button', { class: 'btn primary', onclick: () => Tour.go(1) }, A.i === n - 1 ? 'Done' : (st.check ? 'Skip' : 'Next')))].filter(Boolean)); /* native append would print null */
    card.classList.toggle('floating', !!r && !BB.isMobile());
    if (r && !BB.isMobile()) {
      const cw = card.offsetWidth, chh = card.offsetHeight;
      let x = r.left, y = r.bottom + 14;
      if (y + chh > window.innerHeight - 10) y = r.top - chh - 14;
      if (y < 10) { y = clamp(r.top, 10, window.innerHeight - chh - 10); x = r.right + 14; if (x + cw > window.innerWidth - 10) x = r.left - cw - 14; }
      card.style.left = clamp(x, 10, window.innerWidth - cw - 10) + 'px'; card.style.top = clamp(y, 10, window.innerHeight - chh - 10) + 'px';
    } else { card.style.left = ''; card.style.top = ''; }
    /* phones: the card sits at the bottom, so scroll the target up above it */
    if (r && BB.isMobile()) {
      const overlap = r.bottom - (card.getBoundingClientRect().top - 12);
      if (overlap > 0) {
        const box = tgt.closest('.ws-body'); // inside a workspace the page is locked; scroll the workspace instead
        (box || window).scrollBy(0, Math.min(overlap, Math.max(0, r.top - (box ? box.getBoundingClientRect().top + 8 : 70))));
        const r2 = tgt.getBoundingClientRect(), pad = 6;
        Object.assign(shade.style, { left: r2.left - pad + 'px', top: r2.top - pad + 'px', width: r2.width + pad * 2 + 'px', height: r2.height + pad * 2 + 'px' });
      }
    }
    const next = card.querySelector('.btn.primary'); if (next) next.focus({ preventScroll: true });
    /* interactive step: wait until the user has done the task, then tick it and move on */
    clearInterval(A.poll);
    if (st.check) {
      const stepAt = A.i;
      const tick = () => {
        let ok = false; try { ok = !!st.check(); } catch (e) { ok = false; }
        if (!ok || !Tour.active || Tour.active.i !== stepAt) return;
        clearInterval(A.poll);
        card.classList.add('done');
        const tt = card.querySelector('.tour-task-text'); if (tt && st.doneText) tt.innerHTML = st.doneText;
        setTimeout(() => { if (Tour.active && Tour.active.i === stepAt) Tour.go(1); }, 900);
      };
      A.poll = setInterval(tick, 250);
    }
  });
};
Tour.place = function () {
  const A = Tour.active; if (!A || !A.tgt || !A.tgt.isConnected || A.shade.style.display === 'none') return;
  const r = A.tgt.getBoundingClientRect(), pad = 6;
  Object.assign(A.shade.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
};
window.addEventListener('scroll', () => { if (Tour.active) Tour.place(); }, true);
Tour.go = function (d) {
  const A = Tour.active; if (!A) return;
  const n = A.i + d;
  if (n >= A.def.steps.length) { const done = A.def.onDone; Tour.stop(); if (done) done(); return; }
  A.i = clamp(n, 0, A.def.steps.length - 1); Tour.show();
};
Tour.stop = function () { const A = Tour.active; if (!A) return; clearInterval(A.poll); clearInterval(A.follow); A.shade.remove(); A.card.remove(); Tour.active = null; document.body.classList.remove('touring'); };
Tour.key = function (e) {
  if (!Tour.active) return false;
  if (e.key === 'Escape') { Tour.stop(); return true; }
  if (e.key === 'ArrowRight' || e.key === 'Enter') { Tour.go(1); return true; }
  if (e.key === 'ArrowLeft') { Tour.go(-1); return true; }
  return false;
};
window.addEventListener('resize', () => { if (Tour.active) Tour.show(); });

/* ================= icons (inline SVG, use currentColor) ================= */
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
UI.ICONS = {
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  stop: svg('<rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor"/>'),
  rec: svg('<circle cx="12" cy="12" r="6.5" fill="currentColor"/>'),
  undo: svg('<path d="M9 7 4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  redo: svg('<path d="m15 7 5 5-5 5M19.5 12H9a5 5 0 0 0 0 10h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  metro: svg('<path d="M9 3h6l4 18H5zM12 15l5-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  chevron: svg('<path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  help: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.2" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="15" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/>'),
  download: svg('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  upload: svg('<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  save: svg('<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h0M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  midi: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/><circle cx="16" cy="11" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/><circle cx="9.5" cy="15" r="1.2" fill="currentColor"/><circle cx="14.5" cy="15" r="1.2" fill="currentColor"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  tap: svg('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l4.6 1.3a2 2 0 0 1 1.4 2.3L17 20H9.5L6 15.5a1.6 1.6 0 0 1 2.3-2.2L9 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'),
  /* view icons */
  loops: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="currentColor"/>'),
  beat: svg('<rect x="3" y="4" width="4" height="4" rx="1" fill="currentColor"/><rect x="10" y="4" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="17" y="4" width="4" height="4" rx="1" fill="currentColor"/><rect x="3" y="10" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor"/><rect x="17" y="10" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="16" width="4" height="4" rx="1" fill="currentColor"/><rect x="10" y="16" width="4" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="17" y="16" width="4" height="4" rx="1" fill="currentColor"/>'),
  keys: svg('<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4v16M13 4v16M18 4v16" stroke="currentColor" stroke-width="1.6"/><rect x="6.5" y="4" width="3" height="9" fill="currentColor"/><rect x="16.5" y="4" width="3" height="9" fill="currentColor"/>'),
  chords: svg('<rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'),
  mixer: svg('<path d="M6 4v16M12 4v16M18 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3.5" y="13" width="5" height="3" rx="1" fill="currentColor"/><rect x="9.5" y="7" width="5" height="3" rx="1" fill="currentColor"/><rect x="15.5" y="11" width="5" height="3" rx="1" fill="currentColor"/>'),
  song: svg('<rect x="2.5" y="8" width="5" height="8" rx="1.5" fill="currentColor"/><rect x="9.5" y="8" width="7" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="18.5" y="8" width="3" height="8" rx="1" fill="currentColor"/>'),
};
})();

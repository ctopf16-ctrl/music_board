/* Beat Board · MIDI keyboard support (Web MIDI: Chrome, Edge, Opera, and Firefox with permission)
   Notes go to the track you are working on: drums on the Beat screen, chords on the Chords screen,
   otherwise the note track picked on the Keys screen. Velocity is respected. */
(function () {
'use strict';
const BB = window.BB;
/* General MIDI drum notes, plus a fallback for pad controllers starting at C1 (36) */
const GM_DRUMS = { 35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tomL', 43: 'tomL', 42: 'hat', 44: 'hat', 45: 'tomH', 47: 'tomH', 48: 'tomH', 46: 'ohat', 49: 'crash', 57: 'crash', 51: 'ohat', 54: 'shaker', 69: 'shaker', 70: 'shaker', 82: 'shaker' };
const M = BB.midi = {
  access: null, inputs: [], held: {},
  supported: () => !!navigator.requestMIDIAccess,
  statusText() {
    if (!M.supported()) return 'This browser does not support MIDI. Try Chrome or Edge.';
    if (!M.access) return 'Not connected';
    return M.inputs.length ? 'Connected: ' + M.inputs.map(i => i.name).join(', ') : 'Allowed, but no keyboard found. Plug one in.';
  },
  connect() {
    if (!M.supported()) { BB.emit('toast', { text: M.statusText() }); return Promise.resolve(false); }
    return navigator.requestMIDIAccess({ sysex: false }).then(acc => {
      M.access = acc; BB.storage.set('beatboard.midi', true);
      acc.onstatechange = M.refresh; M.refresh();
      BB.emit('toast', { text: M.statusText() });
      return true;
    }).catch(() => { BB.emit('toast', { text: 'MIDI access was blocked. Allow it in your browser’s site settings.' }); return false; });
  },
  autoConnect() {
    if (!M.supported() || !BB.storage.get('beatboard.midi', false)) return;
    navigator.requestMIDIAccess({ sysex: false }).then(acc => { M.access = acc; acc.onstatechange = M.refresh; M.refresh(); }).catch(() => {});
  },
  refresh() {
    if (!M.access) return;
    M.inputs = Array.from(M.access.inputs.values());
    M.inputs.forEach(i => { i.onmidimessage = M.onMessage; });
    const chip = document.getElementById('midiChip'); if (chip) chip.hidden = !M.inputs.length;
  },
  targetTrack() {
    const v = BB.state.view;
    if (v === 'beat') return 'drums';
    if (v === 'chords') return 'chords';
    return BB.state.noteTrack || 'melody';
  },
  onMessage(ev) {
    const [st, d1, d2] = ev.data, cmd = st & 0xf0, ch = st & 0x0f;
    if (cmd === 0x90 && d2 > 0) {
      BB.audio.init();
      const vel = Math.max(0.15, d2 / 127), tr = ch === 9 ? 'drums' : M.targetTrack();
      if (tr === 'drums') { const v = GM_DRUMS[d1] || BB.DRUM_VOICES[((d1 - 36) % 10 + 10) % 10].id; BB.transport.drumHit(v, vel); return; }
      if (tr === 'chords') { BB.transport.noteOn('chords', d1, vel); M.held[d1] = 'chords'; return; }
      BB.transport.noteOn(tr, d1, vel); M.held[d1] = tr;
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      const tr = M.held[d1]; if (tr) { BB.transport.noteOff(tr, d1); delete M.held[d1]; }
    }
  },
};
})();

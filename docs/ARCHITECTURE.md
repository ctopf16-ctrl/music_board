# Beat Board architecture

A static web app with no build step. Plain `<script>` files share one global namespace, `window.BB`.
It runs from GitHub Pages or straight from `index.html`.

## Files and load order

```
index.html            page shell, loads everything below in this order
icons/                home screen icon: app-icon.svg is the source, apple-touch-icon.png (180x180) is rendered from it
css/app.css           design tokens, app frame, shared components (read it before styling)
css/views/<id>.css    one stylesheet per screen
js/core.js            helpers, events, music theory, song model, store (undo/save), UI state, view registry
js/audio.js           instruments, drum kits, BB.createEngine (mixer + effects), BB.audio (live), BB.preview
js/transport.js       clock, clip launching, song playback, live playing + recording, offline render, WAV
js/ui.js              UI kit: knob, fader, seg, select, toggle, button, stepper, scenePicker, pickers,
                      keyboard control system, tooltips, toasts, sheets, workspaces, tutorials, icons
js/library.js         starter loops for every track, chord progressions, the demo song
js/midi.js            MIDI keyboard input
js/views/<id>.js      one file per screen: loops, beat, keys, chords, mixer, song
js/app.js             boots everything: transport bar, tabs, global keys, menus, welcome tour
```

## Design language

- Look and feel: hardware studio gear. Panels (`.panel`), silkscreen-style labels (`.panel-head h3`, `.lbl`:
  mono, uppercase, letter-spaced), big friendly pads, knobs with a value ring.
- Every color is a CSS token from `css/app.css`. Never write literal colors in view CSS, except
  `rgba(0,0,0,x)` in shadows. Light and dark themes both work automatically through the tokens.
- **Track colors.** Add `.c-drums`, `.c-bass`, `.c-chords`, `.c-melody` or `.c-keys` to an element,
  then use `var(--c)` (the color) and `var(--c-ink)` (text on top of it). A dim tint is
  `color-mix(in oklab, var(--c) 15%, var(--well))`.
- Surfaces, from back to front: `--bg` (page), `--panel` (device), `--raise` (cards and panels),
  `--well` (inset areas). Text uses `--ink`, `--ink-2` (secondary) and `--ink-3`. Lines use `--line`.
- Fonts: `--font-display` (headings, chord names), `--font-body`, `--font-mono` (labels, numbers).
- `.sel` is the dropdown wrapper from `UI.select`; its styles only apply when it wraps a `<select>`. Use another name (e.g. `.is-sel`) for "selected" states.
- Shared classes: `.view-head .view-title .view-sub`, `.panel .panel-head .hint`, `.empty`, `.pill`, `.row`,
  `.grow`, `.btn` (+ `.sm .ghost .primary .danger .icon-only .toggle .colored`), `.seg`, `.sel`,
  `.pkeys .pkey.white/.black/.lit` (piano look).
- **Screens with an editor (Beat, Keys, Chords) are a hub plus workspaces.** The screen itself (the hub) holds only
  the sound controls (instrument or kit, flavor, swing, `UI.trackKnobs`) and two cards (`UI.wsCard`), each with a live
  preview. One card opens the editor workspace (where notes and timing are placed: step grid, piano roll, progression
  and rhythm), the other opens the play workspace (pads, piano, chord pads and melody strip, for freestyling). A
  workspace (`UI.workspace`) is a full-screen area over the screen; the transport bar stays on top. Keep each hub short
  enough to fit a phone screen without scrolling, and put anything that edits the pattern inside the editor workspace.
  See **Workspaces** below.
- **Phones (≤ 720px).** The tabs become a fixed bottom bar, and `--nav-h` holds its height. The transport bar is one row
  (Play, Record, Tempo, Undo, ⌄, Menu); the ⌄ button (`app.showMore(open)`) opens the rest as a second row. Screen
  subtitles (`.view-sub`) are hidden, so keep each `.view-head` to the title and its buttons. `.phone-only` hides an element above 720px. Views stack
  into one column. Workspaces cover the bottom tabs. Touch targets must be at least 40px. The page body must never scroll sideways: wide
  editors (piano roll, long patterns) scroll inside their own `overflow-x: auto` box. Hover tooltips
  become press-and-hold, and keyboard letters are hidden.
- Respect `prefers-reduced-motion` (app.css already disables animations globally).

## The song (`BB.store.p`)

```js
{
  v: 1, id, name, bpm: 90, key: 0 /* 0=C … 11=B */, mode: 'major' /* see BB.theory.MODES */, swing: 0.1,
  master: { volume, tone, space, echo, echoTime: '16'|'8'|'d8'|'4', drive, pump, lofi },   // 0..1 each
  tracks: { drums: {vol, pan, mute, solo, tone, space, echo}, bass: {..., inst}, chords: {..., inst}, melody: {...}, keys: {...} },
  scenes: [ {name: 'Intro'}, … 8 ],
  clips: { drums: [clip|null ×8], bass: [...], chords: [...], melody: [...], keys: [...] },  // index = scene
  song: [ {scene: 0, repeat: 2}, … ],   // the arrangement; repeat counts whole scene lengths
}
```

Tracks (`BB.TRACKS`) are fixed: `drums` (type drums), `bass`, `melody`, `keys` (type notes), and `chords` (type chords).

Clip formats. Steps are 16th notes, so one bar is 16 steps.
- **drums**: `{name, bars, kit, steps: {kick: [vel…], snare: […], …}, rolls: {hat: [0|2|3|4 …]}}`.
  Each steps array has `bars*16` entries, where 0 means off and 0.01–1 is the velocity. `rolls[v][i]` repeats
  that hit 2–4 times inside the step (trap hi-hat rolls). The 10 voices are in `BB.DRUM_VOICES`.
- **notes**: `{name, bars, notes: [{s: startStep, d: lengthSteps, m: midiNote, v: velocity 0..1}]}`
- **chords**: `{name, bars, rhythm, slots: [null | {r: rootPitchClass, q: quality} | {rest: true}]}`.
  There is one slot per beat (`bars*4`). A chord lasts until the next non-null slot. `q` is a key of
  `BB.theory.QUALITIES`. `rhythm = {hits: [16 strengths, one bar], feel: 'block'|'strum'|'arp'|'arpdown'|'bounce', len: 'ring'|'short'}`.
  A chord strikes when it starts and on every hit while it lasts. Presets: `BB.CHORD_RHYTHMS`, `BB.CHORD_FEELS`, `BB.CHORD_LENGTHS`;
  helpers `BB.chordRhythm(clip)` (also converts the older `clip.style`), `BB.rhythmFromPreset`, `BB.rhythmPresetId`, `BB.rhythmCount`.
  Edit one box of a progression with `BB.setChordCell(clip, startSlot, lenSlots, chord | {rest:true} | null)`: only that box changes.
  `BB.chordGridNeeded(clip)` gives the finest box size (4/2/1 beats) needed to show every change.

Helpers: `BB.newClip(trackId, {bars, kit, style, name})`, `BB.resizeClip(trackId, clip, bars)` (grows by repeating),
`BB.clipIsEmpty`, `BB.chordAt(clip, step)` (returns `{root, q, start, end, slot}`), `BB.sceneLength(p, scene)`, `BB.songTimeline(p)`.

## Changing the song (undo, save)

```js
BB.store.change('Add hit', p => {
  const c = BB.store.ensureClip('drums', scene);   // creates an empty clip if needed (only inside change)
  c.steps.kick[3] = 1;
}, { group: 'paint-123', info: { track: 'drums', scene } });
```
- **All** edits go through `change()`. It snapshots the song for undo, emits `change`, and autosaves.
- Pass the same `group` for a continuous gesture (a drag, painting cells, turning a knob) so the whole
  gesture is one undo step. For knobs use something like `group: 'knob-' + name`.
- **Never keep a reference to `BB.store.p` or any clip between events.** Undo replaces the whole object.
  Read `BB.store.p` fresh every time.
- `BB.store.clip(trackId, scene)` reads a clip (or null). `undo()`, `redo()`, `load(project)`.

## UI state and events

`BB.state = { view, scene /* scene the editors edit */, noteTrack /* note track the Keys view edits */, octave: {...}, chordStyle, chordFlavor }`.
Update it with `BB.setState({scene: 2})`, which emits `ui`.

Events (`BB.on(name, fn)`, `BB.emit(name, data)`):
| event | data | when |
|---|---|---|
| `change` | `{label, track?, scene?, all?}` | the song changed (also after undo/redo/load) |
| `ui` | the patch | `BB.state` changed |
| `transport` | `{playing?, rec?, mode?, metronome?}` | play, stop, record, mode |
| `launch` | `{}` | loop-mode clip launch states changed |
| `step` | `{abs, t, pos: {trackId: {scene, pos, len}}, song?: {block, scene, songStep, posInBlock}}` or `null` on stop | each audible 16th step (the playhead) |
| `drumhit` | `{voice, vel, live}` | a drum was tapped live |
| `note` | `{track, midi, on}` | a live note started or stopped |
| `chord` | `{root, q, on}` | a live chord started or stopped |
| `frame` | — | every animation frame (meters) |
| `theme` | colors | theme changed. `BB.colors['--ink']` etc. for canvas drawing |

The app calls view hooks for you (see below), so most views only need `render` and `step`.

## Transport (`BB.transport`, alias `TR`)

- `play()`, `stop()`, `toggle()`, `playing`, `mode` (`'loop'|'song'`), `setMode(m)`, `rec`, `setRec(b)`, `metronome`, `setMetronome(b)`, `loopSong`, `setLoopSong(b)`.
- **Loop mode** (clips play like a loop launcher): `launchClip(track, scene)`, `stopClip(track)`, `toggleClip(track, scene)`,
  `launchScene(scene)`, `stopAll()`, `isLaunched(track, scene)`, `queuedFor(track)` (a scene, `-1` meaning stop at the next bar, or `undefined`).
  While playing, launches wait for the next bar. While stopped, they apply immediately.
- **Song mode**: `playSongFrom(blockIndex)`, `timeline()` (cached `BB.songTimeline`), `songAt(abs)`.
- `positionOf(trackId)` gives the current `{scene, pos, len}` of that track's playhead, or null.
- **Live playing (also records when Record is on):**
  `drumHit(voiceId, vel)`, `noteOn(trackId, midi, vel)` / `noteOff(trackId, midi)`, `chordOn(root, q, {style})` / `chordOff()`, `allNotesOff()`.
  These play right away on the track's instrument. When recording, they write into the right clip, quantized,
  creating and launching a clip in `BB.state.scene` if needed. Always use these for anything the user plays.
- `BB.renderAudio({mode:'song'}|{mode:'scene', scene, bars, onProgress})` returns a Promise of an AudioBuffer. It creates voices just
  ahead of the render position (OfflineAudioContext suspend/resume), so it runs faster than real time and reports real progress.
  `BB.encodeWav(buffer)` returns a Blob, and `BB.download(blob, filename)` saves it.

## Sound (`js/audio.js`)

- `BB.audio.init()` must be called in a user gesture before sound (the app already does this on the first pointerdown or keydown).
- `BB.INSTRUMENTS` (id → `{name, group, desc}`), `BB.INSTRUMENT_GROUPS`, `BB.KITS` (id → `{name, desc}`).
- Auditioning: `BB.preview.note(trackId, midi, vel, dur, instId?)`, `BB.preview.drum(voiceId, kitId)`, `BB.preview.chord(root, q, instId?)`.
- The live mixer follows `BB.store.p` automatically after every `change`.
- Meters: `BB.audio.E && BB.audio.E.level(trackId | 'master')` returns 0..1. Read it on the `frame` event.

## Music theory (`BB.theory`)

`NOTE`, `MODES`, `scale(mode)`, `isMinorish(mode)`, `penta(mode)`, `pcName(pc)`, `noteName(midi)` ("C4"),
`inScale(pc, key, mode)`, `degreeOf`, `nearestDegree`, `scaleMidi(degree, tonicMidi, mode)`, `place(pc, lowMidi)`,
`QUALITIES`, `chordName(root, q)`, `chordPcs`, `voice(root, q, lo=55)` (MIDI notes),
`numeral(key, root, q)`, `diatonic(key, mode, degree, flavor)` (flavor: `'triad'|'seventh'|'sus'|'add9'`; returns `{root, q, name, numeral, degree}`).

## Library (`BB.library`)

`itemsFor(trackId)` returns `[{id, name, desc, group}]`. `apply(trackId, scene, itemId)` puts a starter loop into the song
(one undo step). `build(trackId, itemId, scene)` returns a clip without saving it. `progressions()` gives the chord progressions
for the current mode. `harmonyFor(p, scene)` gives `fn(step) → {root, q, degree, pcs}`. `surpriseDrums(kit)`. `drumInfo(id)` returns `{bpm, kit, …}`.

## UI kit (`BB.ui`, see `js/ui.js`)

All components return an element with an `.update()` method that re-reads `value()`. Call it from your `render()`.
Every option bag accepts `tip` (tooltip text), `key` (keyboard letter) and `label`. Knob, fader and toggle also take
`hudLabel`, a longer name for the keyboard HUD and screen readers (e.g. "Bass volume").
- `knob({label, min, max, step, value(), set(v), fmt(v), def, size:'sm'|'md'|'lg', color:'drums'…})`
- `fader({label, value(), set(v), min, max, orient:'v'|'h', color, def})`
- `seg({label, options:[{id, label, tip, color, icon}], value(), set(id), small})`
- `select({label, options:[{id, label, group}] | () => options, value(), set(id), small})` (native select, so it's good on phones; `.refill()`)
- `toggle({label, icon, value(), set(b), cls, text:false})`, `button({label, icon, onClick, cls, text:false, instant})`
- `stepper({label, min, max, step, value(), set(v), fmt, unit})`
- `scenePicker({track: id | () => id, key})`: the 8-scene selector shared by editors (sets `BB.state.scene` and launches the scene while playing)
- `instrumentSelect(trackId, {key, small})`, `kitSelect({value(), set(id), key, small})`
- `tourButton(viewId)`: put one in every view header
- `glide(container, selector, onEl, offEl)`: press and slide across keys/pads
- `toast(text, {action:{label, onClick}, replace: 'id', ms})` returns the toast element. A newer toast with the same `replace` id replaces the older one.
- `sheet({title, body, actions:[{label, primary, danger, onClick}], wide})` returns `{close}`
- `sceneSelect({track, key})`: a compact scene picker (native select) for workspace headers; a dot marks scenes with a clip
- `trackKnobs(trackId | () => trackId, {volKey})`: the track's Volume, Tone, Space and Echo dials (the same values as its Mixer strip)
- `workspace({...})`, `wsCard({...})`, `showWorkspace(id | null)`: see **Workspaces**
- `UI.ICONS.*`: inline SVG strings (play, stop, rec, plus, trash, copy, edit, dice, download, …)
- `BB.h(tag, attrs, ...children)`: tiny element builder (`{class, html, text, style:{}, dataset:{}, onclick, 'data-tip': …}`)

## Workspaces (`UI.workspace`)

```js
const ws = UI.workspace({
  id: 'beat-grid', title: 'Step grid', color: 'drums', cls: 'beat-ws',   // add 'ws-tight' when the head is crowded on phones
  head: [pill, h('span', 'grow'), UI.sceneSelect({ track: 'drums', key: 'S' })], // after the Close button and title
  closeTip: 'Close the step grid… Shortcut: Esc.', onOpen() {}, onClose() {},
});
ws.body.append(tools, grid);      // ws.body is a flex column that scrolls if it must; give the main editor flex: 1
el.append(ws.el);                 // into the view's <section>, next to the hub content (not inside it)
ws.open({ from: button }); ws.close(); ws.isOpen(); ws.setColor('melody');
```
- Opening makes everything else in the view's section `inert`, locks page scrolling (`html.ws-lock`), and pushes a
  history entry so the phone's Back button closes it. `Esc` closes it too (after a picked control and the view's own
  `Escape` handling). Switching screens closes it. `BB.ui.ws` is the open workspace; `BB.ui.workspaces[id]` finds one.
- Controls under an open workspace can't be picked by letter (inert counts as hidden), so a workspace may reuse a
  letter from the hub for the same kind of control (the scene picker keeps `S`). Letters must be unique among what is
  visible at once: the hub, or one workspace.
- A view's `keydown` keeps playing notes, pads and drums whatever is open, but editing keys (grid cursor, nudging notes,
  Delete) should only act while the editor workspace is open.
- `UI.wsCard({title, color, pill, preview, onOpen, tip, foot: [...], button})` is the hub card: a live preview you can
  tap, a footer (starters), and the Open button (`cls: 'colored ws-go'`; pencil icon for editors, hand icon for play).
  Add `ws-card-side` to put the button beside the preview on phones.
- Tutorials open the workspace their target lives in, or close it when the target is on the hub. Set `ws: 'id'` (or
  `null`) on a step when the target moves between workspaces (the Chords pads do) or isn't built yet.

## Keyboard (the user cares about this a lot)

Global keys are handled in `app.js`:
- `Space` play/stop. **Number pad 0–9 always taps drums** (1 kick, 2 snare, 3 clap, 4 hat, 5 open hat, 6 rim,
  7 low tom, 8 high tom, 9 crash, 0 shaker). Number-pad `.` toggles record, `+`/`−` change tempo, `*` toggles the metronome.
- **Letters pick controls.** Any control made with the UI kit and given `key: 'Q'` shows a small letter badge.
  Pressing the letter picks it (outline plus a HUD at the bottom). Then **← →** change it (Shift moves faster),
  **↑ ↓** move to the previous/next control, and **Enter** presses it. `Esc` lets go.
- **Reserved letters** (transport bar, global): **R** record, **T** tempo, **L** loop/song, **M** metronome, **K** key, **J** scale, **V** volume.
  Views may use any other letter. Letters must be unique within a view (or, with workspaces, within what is visible at once).
- `[` and `]` switch screens. `?` opens help. `Esc` lets go of a picked control, then closes an open workspace, then stops playback. Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo, Ctrl/⌘+S save.
- **Order for letters and digits:** `view.keydown(e)` runs first (return `true` if you used the key), then control
  letters, then the top-row digits 1–0 fall back to drums. With **Shift**, letters always go to controls first.
- Views where letters play notes (Keys, Chords) set `letterMode: 'notes'`. Their badges then show ⇧, and controls
  are picked with Shift+letter. Plain letters still reach controls if the view doesn't use them.
- Number-pad keys play drums, unless the view sets `numpad: true`: then `view.keydown(e)` sees them first and anything it
  doesn't use (returns false) still plays drums.
- `view.keyup(e)` is called on every keyup (release notes there). Ignore `e.repeat` for notes and pads.
- Left/Right arrows go to a picked control first. Only if nothing is picked does `view.keydown(e)` get them.
  Up/Down go to the view only when nothing is picked.

## Writing a view

```js
(function () {
'use strict';
const BB = window.BB, { h } = BB, UI = BB.ui, TR = BB.transport;
BB.views.register({
  id: 'beat', title: 'Beat',
  letterMode: 'plain',                // or 'notes'
  mount(el) { /* build DOM once into the <section> */ },
  render(evt) { /* song changed (evt.label, evt.track, evt.scene, evt.all) or the view was shown after changes: refresh */ },
  show() {}, hide() {},               // optional
  step(e) { /* playhead: e is the step entry or null on stop. Keep it cheap: toggle classes */ },
  keydown(e) { return false; },       // see Keyboard
  keyup(e) {},
  tutorial: [ { target: '#beat-grid', title: 'The step grid', text: 'Each square is a 16th note…', view: 'beat' }, … ],
});
})();
```
- Listen to `ui` (scene changes) and `launch`/`transport` with `BB.on` if your view shows those.
- Add `data-no-press-tip` to playable pads and keys so press-and-hold on a phone plays them instead of showing a tooltip.
- **Tooltips:** every interactive control needs `data-tip` (plus `data-tip-title`, or the UI kit `tip` option),
  written in plain, friendly language for someone who has never made music. Say what it does and why you'd use it.
- **Tutorials:** 5–8 steps per view. Hands-on steps add `task` (an instruction) and `check: () => bool`; the tour waits, ticks and moves on. Each `target` (a selector or function) must point at a visible element in
  your view. Put `UI.tourButton(id)` in the view header. Start with what the screen is for, and end with a "try this" idea.
- Prefix CSS selectors with `.view[data-view="<id>"]` or a unique root class so screens don't collide.
- Don't use `alert`, `confirm` or `prompt`. Use `UI.sheet` and `UI.toast`.

## Testing

A static server runs at `http://localhost:8765/` while developing (`python3 -m http.server 8765` in the repo root).
Use Playwright (`require('playwright')`, `chromium.launch()` needs no options). Check:
1. No console errors (`page.on('pageerror')`, `console` errors).
2. Desktop 1280×860 and phone 390×844 (`isMobile: true, hasTouch: true`) both look right.
   `document.documentElement.scrollWidth` must equal the viewport width (no sideways page scroll).
3. Click and keyboard paths work. `localStorage.setItem('beatboard.welcomed','true')` skips the welcome dialog.
   Go to a screen with `location.hash = '#beat'` before load, or call `BB.app.setView('beat')`. Open a workspace with
   `BB.ui.workspaces['beat-grid'].open()` (ids: `beat-grid`, `beat-pads`, `keys-editor`, `keys-piano`, `chords-editor`,
   `chords-play`) and check it too, including that the hub fits a 390×844 phone without scrolling.
4. Light and dark: `document.documentElement.setAttribute('data-theme','dark')`.

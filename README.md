# Beat Board

A music studio for making beats and songs in your browser, built for people who have never made music before.
It has a drum machine, finger-drumming pads, a piano with a note editor, chord pads that are always in tune,
a loop launcher, a mixer with effects, and a song arranger with WAV export. Every sound is synthesized live,
so there is nothing to download or install.

## Start it

- **Online:** turn on GitHub Pages (see below) and open the link it gives you.
- **On your computer:** download this repo (green **Code** button → **Download ZIP**), unzip it, and double-click `index.html`.

The first time you open it, a demo song loads and a short welcome tour is offered. Press **Play** or **Space** to hear it.

## The six screens

| Screen | What it's for |
|---|---|
| **Loops** | The home base. A grid of loops: 5 tracks across, 8 scenes down. Tap a loop to start or stop it; changes wait for the next bar so you stay in time. Tap **+** to add a ready-made loop. |
| **Beat** | Drum machine. Pick a kit, add swing and shape the drum sound. **Edit beat** opens the step grid full screen to place hits; **Play pads** opens big finger-drumming pads (your number pad works too). |
| **Keys** | Pick a track, its instrument and sound. **Edit notes** opens a full-screen note editor to draw melodies and bass lines ("Only notes in key" hides notes that would sound off); **Play piano** opens a big piano you can also play with your computer keyboard. |
| **Chords** | Pick the chord sound and flavor. **Edit chords** opens the progression full screen, with the pads to fill each box and the rhythm; **Play chords** opens eight always-in-key pads and a scale-locked melody strip. |
| **Mixer** | Volume, left/right, tone, reverb ("Space") and echo for each track, plus master character: drive, pump and lo-fi. One-tap presets. |
| **Song** | Put your scenes in order (intro, verse, chorus…), play the whole song, and export it as a WAV file. |

On Beat, Keys and Chords, the screen itself holds the sound controls and two cards with a live preview. Each card opens its
own full-screen area, so on a phone you never scroll through one long page. **Close** (or `Esc`, or your phone's Back
button) takes you back; the music keeps playing.

Every screen has a **Tutorial** button. Hover over any dial or button to see what it does; on a phone, press and hold.

## Keyboard

| Keys | What they do |
|---|---|
| `Space` | Play / stop |
| Number pad `0–9` | Tap drums from any screen: 1 kick, 2 snare, 3 clap, 4 hat, 5 open hat, 6 rim, 7–8 toms, 9 crash, 0 shaker. Hold Shift for a softer hit. On the Chords screen, 1–8 play the chord pads instead. |
| Number pad `.` `+` `−` `*` | Record on/off, tempo up/down, metronome |
| `A`–`Z` | Pick the control with that letter (the letter shows on each control) |
| `←` `→` | Change the picked control (hold Shift to move faster) |
| `↑` `↓` | Pick the previous / next control |
| `Enter` | Press the picked button |
| `Esc` | Let go of the picked control, then close a full-screen editor or pads area, then stop playback |
| `[` `]` | Previous / next screen |
| `A W S E D F T G Y H U J K` | Play the piano on the Keys screen. There, hold Shift with a letter to pick controls. |
| `Ctrl/⌘ Z`, `Ctrl/⌘ Shift Z` | Undo / redo |
| `Ctrl/⌘ S` | Save in this browser |
| `?` | Help and the full shortcut list |

Turn on **Record** (`R`), then play pads, keys or chords; what you play is added to the loop in time.
A MIDI keyboard also works (Menu → Connect a MIDI keyboard, in Chrome or Edge).

## Saving

Your current song saves automatically in this browser. Use **Menu → Save in this browser** to keep several songs,
or **Download song file** to back one up and open it on another device. **Song → Download WAV** exports audio.

## Turn on GitHub Pages (free hosting)

1. GitHub Pages is free for **public** repositories. If this repo is private, go to **Settings → General →
   Danger Zone → Change visibility → Public**. Private repos need a paid GitHub plan for Pages.
2. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   **Branch** to `main`, and the folder to `/ (root)`, then click **Save**.
3. After a minute, the page shows your link, something like `https://<your-username>.github.io/music_board/`.

## For developers

No build step and no dependencies: plain JavaScript files share one global namespace (`window.BB`).
To work on it locally, run `python3 -m http.server` in this folder and open `http://localhost:8000`.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the data model, the APIs and how each screen plugs in.
`preview/sketches.html` is the first three-idea prototype this app grew from.

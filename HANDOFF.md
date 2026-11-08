# Drill Writer — handoff

Browser app for writing marching band drill, built for Emily's high school marching band.
Hosted on GitHub Pages: `artificialfear/drill-writer` (repo to be created by Mat; Pages from main/root).

## Run / test
- No build step. Plain ES modules: `index.html`, `css/app.css`, `js/model.js`, `js/app.js`.
- Local: `python3 -m http.server` in the repo root, open http://localhost:8000.
- Tests: `python3 tests/smoke.py` (Playwright, Chromium with `channel="chromium"`). Screenshots go to `tests/shots/` (git-ignored).

## Data model (`js/model.js`)
- Units are 8-to-5 steps. `x` = steps from the 50 (negative = Side 1). `y` = steps from the FRONT sideline.
- Field: 85.33 steps deep. Hashes: HS 28.44, college 32, NFL 37.73 steps from each sideline.
- Snapping: `x` snaps to a plain grid from the 50. `y` snaps relative to the NEAREST reference line (front sideline, front hash, back hash, back sideline), so "4 steps behind Front Hash" is exact with HS hashes.
- Coordinates: `describeX` picks the nearest yard line; on an exact 4-step tie it uses the line closer to the 50 ("4 steps outside").
- Show JSON: `{app:'drill-writer', version:1, title, field:{hash}, performers:[{id,label,section}], props:[{id,label,kind,w,h,color}], sets:[{id,name,counts,note,pos:{id:{x,y}}, props:{id:{x,y,rot}}}], tempo:{bpm}}`.
- `set.counts` = counts to move INTO that set (set 1 is always 0). `normalizeShow` fills any missing positions so old files can't crash the editor.
- Step size: `n to 5 = 8 / (distance / counts)`. Flagged when bigger than 6 to 5.

## Editor (`js/app.js`)
- Edits only happen while sitting on a set; `ensureAtSet()` snaps the timeline back before any change.
- Undo/redo = JSON snapshots (150 deep). Autosave to localStorage key `drillwriter.show.v1` (per device — Save/Open JSON to move between computers).
- Form tools order performers by their projection along the new form's direction, to avoid crossing paths.
- `window.__dw` exposes state for tests.

## 3D view (`js/view3d.js`)
- Three.js r187 + OrbitControls bundled with esbuild into `vendor/three-bundle.min.js` (no CDN). Loaded with a dynamic import the first time 3D is turned on, so 2D stays light.
- Mapping: Three X = x, Z = FIELD_DEPTH/2 - y (audience toward +Z), Y up. Units stay steps; a body is ~3.3 steps tall.
- Watch-only. It reads state every frame through `getFrame()`; rebuilds bodies/props only when the performer/prop list changes. Everyone faces the front (no facing data yet). Legs swing one step per count when a performer's position changes in the current transition.
- View choice is remembered per device (`drillwriter.view`).
- Tests need `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL in headless Chromium.

## Drop a student (`js/drop.js`)
- Sets now carry `forms: [{id, type: line|arc|block|circle, ids: [ordered], cols?}]`, written by `applyTargets()` when a form tool is used. A performer belongs to at most one form per set; drawing a new form removes them from older ones.
- `planSet()` per set: use the saved form if its members are still evenly spaced (block → just the dropped student's row); otherwise `detectChain()` grows a chain of evenly spaced neighbors through the dot (longest of the candidate directions; tolerance allows curves; closed if the ends meet). No chain → only "Leave the hole".
- Fixes: close = shorter side shifts one spot toward the hole (fewest movers, existing coordinates); stretch = re-space along the polyline with fixed ends (closed loops re-space all the way round); hole = no moves. Default is close (Mat's choice).
- `applyDrop()` mutates the show and returns `{dropped, changed:[{label, sets}], newBig}`. Field editing, undo and tabs are locked while a drop is under review.
- Known limit: in long forms (e.g. a 33-person arc) close-the-gap can still move ~1/3 of the form. That's inherent; the review shows mover counts per set so Emily can pick Leave the hole where it won't be seen.

## Add a student (`planAdd` / `applyAdd` in `js/drop.js`)
- Placement is relative to an anchor performer in every set. Options: hole (nearest remembered empty spot within 12 steps), end (one interval past the form end nearer the anchor), insert (anchor's shorter side shifts out one spot; new student takes the neighbor's old spot), stretch (n+1 re-spaced, ends fixed; closed loops re-space all round), beside (first free spot one interval away). Default: hole → end → beside.
- `set.holes: [{x, y, was}]` written when a drop uses Leave the hole; removed when filled.
- Saved line/arc/circle forms get the new id inserted at the right index; a block whose row changed length is forgotten (detection takes over).
- Spots within 1 step of anyone are flagged, not blocked.

## Rehearsal mode (`js/rehearse.js`)
- Web Audio scheduler: all count-off + click sounds are scheduled up front on the AudioContext clock under one master gain (disconnect = instant stop). The drill is driven from `ctx.currentTime - (delayMs + outputLatency)`, so audio and animation can't drift.
- Sounds are synthesized (cowbell = two squares through a band-pass; click; woodblock; beep). Spoken numbers use speechSynthesis on timers (can lag; count-off only).
- Count-off pattern = array of 0/1/2 (off/on/accent), length 4 or 8, played at the tempo of the first transition × rehearsal %. Default "1 · 3 · 1 2 3 4" = [2,0,1,0,2,1,1,1] (Mat's request).
- `set.bpm` = tempo INTO that set (null = show tempo). `buildTimeline()` turns counts into beat times; this is the hook the session-2 MP3 tempo map replaces (audio would start at the From set's time after the count-off).
- Settings are per device (`drillwriter.rehearse`). Touching the field / any edit stops the rep (`pause()` stops rehearsal).
- One device + speaker runs reps for the band (Mat's choice); phones can't be kept in sync without a network.
- Test quirk: Playwright `select_option(value='2')` picked the option LABELED "2" (value 1) because set names are numbers — set selects via JS in tests.

## Student view (`student.html`, `js/student.js`, `css/student.css`)
- Read-only, phone-first. Show source: `?show=<name>` → `shows/<name>.json` (for session-3 publishing) else the editor's localStorage show (preview). `?id=` performer, `?set=` start set, `?preview=1` shows a banner and live-updates via the `storage` event.
- Drill ID remembered per show title (`drillwriter.me.<title>`).
- Field drawing shared with the editor via `js/fieldDraw.js` (drawField/shapePath/propCorners/css).
- Personal HOLD/step logic uses the student's own move; Nearby = nearest performer within 10 steps inside a 45° cone toward each field direction.
- Practice uses the same rehearsal engine + the device's saved rehearsal settings. 3D uses `create3D` with `follow` (camera + orbit target track the performer; orange cone marker).
- Point of view: `st.pov` 'performer' (default, Mat's request) | 'director', saved in `drillwriter.pov`. 2D performer view = `view.flip` (180° rotation, text stays upright; `fieldDraw.drawField` supports `v.flip`). 3D follow camera sits behind the marcher (y 15, z −12) in performer view, in front (y 24, z +38) in director view.
- Not yet: publishing, encrypted audio, offline service worker (session 3).

## Marching technique (`js/technique.js`)
- `technique(family, from, to)` → `{kind, label, hipYaw, bodyYaw, legs}`. theta = travel angle from straight forward (toward the box), + = marcher's left (Side 2). Assumes everyone faces the box (no facings yet).
- Winds: |θ| ≤ 100° → hips yaw θ, step forward (<20° forward march, ≥70° slide, else forward slide). |θ| > 100° → hips face away from travel (θ∓180°), step backward (>160° backward march, else backward slide). Battery: <45° forward, >135° backward, else crab step (hips front, legs swing sideways). Guard/DM: whole body yaw θ. Pit/no move: hold.
- 3D bodies: body (bodyYaw, bob) → hips group (hipYaw; legs + feet + pelvis) + upper body. Yaws ease toward target via `turnToward()`.
- `create3D(...).lookFrom(pos, target)` exists for tests/screens.
- Mat chose these section defaults (2026-11-07). When facings are added, "torso to the box" becomes "torso to the set's facing".

## UI (v0.8)
- Timeline (`renderTimeline`/`updatePlayhead`/`wireTimeline` in app.js): blocks use flex-grow = counts; track width ≈ 6 px per count (scrolls on long shows). Press without moving = goToSet, drag = scrub (`countAtX`), `.tl-edge` drag = change counts (one undo step). The old range input `#scrub` is kept visually hidden for keyboard/tests.
- Selection bar `#selBar` (`updateSelBar`, called at the end of `draw()` and on 2D/3D switch): hidden while dragging, playing, in 3D or during a drop review. Placed above the selection, else below, else pinned to the top — whichever doesn't cover other dots. Holds `#optInterval`/`#optCols` now.
- Quick select `#quickSel` (`renderQuickSel`, from `renderPerformers`).
- CSS gotcha: elements with `display:flex` need an explicit `[hidden]{display:none}` rule.
- Mat's agreed next UI steps after Emily's hands-on session: Write/Rehearse/Students modes, undo toasts instead of confirm(), save status, new-show wizard, "?" shortcut sheet, onion skin of next set.

## Playback rule
- Sitting on set N (N>0), Play starts at set N-1 so it shows the move INTO set N (Mat's request, 2026-11-07). Mid-move it resumes. Rehearse mode is unchanged (explicit From/To).

## App modes (v0.9)
- `state.appMode` 'write' | 'rehearse' | 'students', mirrored on `body[data-mode]`; CSS shows/hides regions. `setAppMode()` stops playback, resets the tool, renders the mode, resizes the canvas.
- Rehearse: the old sidebar tab is now `aside#tab-rehearse.rehearse-panel` (same element ids). Canvas pointer = pan only; editing keys ignored; timeline press = `pickRehearseRange(i, shift)`; `.tl-block.in-range` underlines the range.
- Students: `iframe#studentFrame` → `student.html?embed=1&preview=1&id=…&set=…` (embed hides the preview banner). Live updates use the same localStorage `storage` event. Frame is sized to the chosen device and CSS-scaled to fit (`sizePhone`). The frame is blanked when leaving Students.
- Publish button is a disabled placeholder until session 3.

## Stop
- `stopPlayback()` (editor) / `stopToStart()` (student): back to the start of the move that was playing (`lastMove` recorded during play) and set `replayHere`/`replay` so the next Play skips the "play the move INTO this set" rewind once. Cleared by goToSet/goSet/scrub.
- Students mode map: `#stuMap` redrawn every 200 ms while in Students mode, reading the iframe's `__sv` state (same origin); click → `contentWindow.__svPick(id)` (keeps the set), falling back to reloading the frame.

## Decisions Mat made
- Repo under artificialfear.
- Audio = MP3 reference recordings, packaged with the published show so students need NO setup and it works offline on iPhone + Android (decided 2026-11-07):
  - Editor loads the MP3 from Emily's computer (stays local).
  - "Publish for students" encrypts the MP3 in the browser (Web Crypto AES-GCM, random 256-bit key) → bundle = show JSON + `audio.enc`. Only the encrypted file is ever committed to the public repo. NEVER commit a plain MP3.
  - Student link/QR = `…/?show=<name>#k=<base64 key>`. The key lives only in the URL fragment (never sent to a server, never in the repo); the app saves it to localStorage after first open.
  - Service worker caches app shell + show JSON + audio.enc; decrypt at play time. Republishing updates phones on next online open.
  - Publishing for now = Mat uploads the bundle to the repo (github.com drag-and-drop, or ask Claude). No GitHub token in the browser.
  - Not DRM — anyone with the link can listen; it just keeps the MP3 from being publicly downloadable/indexed. Emily to confirm her show license covers sharing rehearsal audio with her students.
  - iOS Safari may evict site data after ~7 days unused → tell students to Add to Home Screen; reopening the link on Wi-Fi restores it. First open should be on Wi-Fi (3–8 MB per movement).
- Guard get dots/coordinates like winds and percussion. Props/equipment are separate markers without dot sheets.
- Students only see drill IDs, never names.
- Drop default = Close the gap (fewest movers).

## Roadmap
1. ✅ v0.1 — field, performers, props, sets, form tools, transforms, playback, step-size flags, per-performer coordinate table.
1b. ✅ v0.2 — 3D view with bodies, camera presets.
1c. ✅ v0.3 — Drop a student with per-set fixes and a change report.
1d. ✅ v0.4 — Add a student to finished drill; remembered empty spots.
1e. ✅ v0.5 — Rehearse: count-off + click track over a range of sets, per-set tempo.
1f. ✅ v0.6 — Student view + Preview as student (no publishing/offline yet); performer/director views.
1g. ✅ v0.7 — Marching technique: slides / crab step / travel in 3D + technique labels.
2. Session 2 — Audio + tempo map in the editor: load local MP3, waveform, count-1 offset, typed per-measure tempos then tap-along to fix rits/accels, fermatas as count holds, two-way scrubbing, playback speed, audio-delay setting, duration check.
3. Session 3 — Publish for students (encrypted bundle, link + QR, service worker/offline) + performer view (pick drill ID → own dot sheet + highlighted 2D/3D animation + synced music), printable dot sheets (PDF), collision check.
4. Later: curved paths / follow-the-leader, facings (3D bodies would turn), backward-march vs. slide in 3D, sub-sets ("3A"), Band Ninja-style roster import.

## Open items
- How students open a show: probably `shows/<name>.json` + MP3 committed to the repo, loaded by `?show=` URL param (to build in step 3).

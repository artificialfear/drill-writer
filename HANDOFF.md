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
- 3D bodies (v0.14): root → body (bodyYaw; position.y = step dip) → [merged upper-body mesh] + hips group (hipYaw; pelvis + legs). Each leg is thigh group → knee group → ankle group (shoe). The upper body (jacket, arms, head, shako, instrument) is ONE vertex-colored mesh from `upperBody(sec, tone)`, cached per section+skin tone and built with `mergeGeometries` (now exported from the vendor bundle). `instrument(key)` returns the instrument shapes plus hand/elbow points; arms are capsules from the shoulder to the elbow to the hand. Front of a marcher = +Z.
- Uniform (v0.15): one uniform for everyone, defined in `COL` (teal / black / silver). The jacket pattern is per-triangle vertex color from `jacketColor(x,y,z)` (`paint()` accepts a function of each triangle's center). Section colors no longer appear in 3D; 2D still uses them. `upperBody(sec, tone, opts)` is cached by section, tone and bass number. The bass number is parsed from the label digits (clamped 1–5) and indexes `BASS_R`. The marcher's right is −X; `SH.L`/`hands.L` are on −X. Tenor layout: four drums on an arc of radius 0.65 around (0, 0.12) plus two raised spocks in front. `stick(hand, tip)` draws a stick with its butt end behind the hand.
- Bass facing (v0.16): `technique(family, a, b, section)` takes an optional section key. For 'bass' it uses `bassFacing(x)` (+PI/2 when x < 0) and `legsFor(theta, facing)`. In 3D, `userData.side` follows the current x with a ±0.3 dead zone; the body yaw eases to the facing, and `turnToward` from +PI/2 to −PI/2 goes through 0 (facing the audience). Heads are a separate mesh (`up.head`, pivot `NECK_Y` = 2.62) in `parts.head`. Bass heads yaw toward the DM (the first performer with section 'dm'), clamped to ±1.6 rad relative to the body. Quints layout lives in `instrument('tenors')`.
- Guard look (v0.17): in `upperBody` the `guard` branch builds a black sleeveless mock-neck top, a sequinned sash (`sequins()` gives each triangle a pseudo-random shade from `SEQUIN`), and skin-colored arms. The head has long hair. Legs use `GEO.shinFlare` (`makeLeg(side, flare)`). The guard uniform changes yearly, so this is where to restyle it.
- Eyes view (v0.18): getFrame can pass `firstPerson: id`. `update()` then hides that performer's whole root and turns off OrbitControls (camera.near 0.05; fov 68/80 via `resize()`). The camera sits at `head.localToWorld(0, 0.2, 0.16)`, yaw = body yaw + head yaw + drag offset, pitch −0.09. Drag offsets live in `look`. In student.js, `st.mode` is '2d' | '3d' | 'eyes', and `.stage.eyes` hides the zoom and POV buttons.
- Drum major (v0.19): a 'dm' performer gets `userData.podium` (merged PODIUM mesh), `lift` = PODIUM_H (added in applyPose), and `arms` from `dmArms()`. The DM's arms are animated, not part of the merged upper body. `poseDm()` in update() faces the band centroid, keeps legs at REST, and eases `conduct` toward 1 while the count changed within the last 250 ms. `poseArms` → `conductHand(count)` uses ICTUS/REBOUND/READY. A virtual DM ('__dm', not pickable) is built in syncPeople when the show has none, posed at VIRTUAL_DM_SPOT {x:0, y:−4}. The student performer follow camera sits at (x, 8, z−16) looking at (x, 2, z+6).
- Uniform pass (v0.20): the jacket is ONE shared LatheGeometry (`jacket()`, profile `JACKET_PROFILE` smoothed into `JACKET_DENSE`, z-scaled 0.62) with a canvas texture painted per pixel from `jacketColor(x,y,z)`. MeshStandardMaterial gives a satin finish. The guard doesn't wear it. `paint()` flags METAL colors (brass, bronze, chrome, flute), and `upperBody` splits them into `up.metal` (MAT.metal, metalness 0.9). `scene.environment` is a PMREM'd gradient (sky/horizon/grass). The shako sits low (bottom 2.86). `plume(top, scale, seed)` builds a core plus 46 tapered TubeGeometry feathers. `ball()` picks the facet count by radius.
- Stepping: `gait(kind, stepsIntoMove, perCount)` gives thigh/knee/foot angles. Each leg's cycle u runs 0→1 over 2 counts, with the left heel striking on count 1. Stride angle = asin(per / (2·LEG)). `applyPose` snaps while moving and eases to REST otherwise. Guard silk = separate PlaneGeometry, vertices waved in `waveSilk` each frame. Picking ignores meshes with `userData.noPick` (the blob shadow). Labels sit at y 4.35 and the student pointer at y 5.2. Tone mapping uses NeutralToneMapping; labels, ring, and pointer are `toneMapped:false`.
- `create3D(...).lookFrom(pos, target)` exists for tests/screens.
- Mat chose these section defaults (2026-11-07). When facings are added, "torso to the box" becomes "torso to the set's facing".

## UI (v0.8)
- Timeline (`renderTimeline`/`updatePlayhead`/`wireTimeline` in app.js): blocks use flex-grow = counts; track width ≈ 6 px per count (scrolls on long shows). Press without moving = goToSet, drag = scrub (`countAtX`), `.tl-edge` drag = change counts (one undo step). The old range input `#scrub` is kept visually hidden for keyboard/tests.
- Selection bar `#selBar` (`updateSelBar`, called at the end of `draw()` and on 2D/3D switch): hidden while dragging, playing, in 3D or during a drop review. Placed above the selection, else below, else pinned to the top — whichever doesn't cover other dots. Holds `#optInterval`/`#optCols` now.
- Quick select `#quickSel` (`renderQuickSel`, from `renderPerformers`).
- CSS gotcha: elements with `display:flex` need an explicit `[hidden]{display:none}` rule.
- Mat's agreed next UI steps after Emily's hands-on session: Write/Rehearse/Students modes, undo toasts instead of confirm(), save status, new-show wizard, "?" shortcut sheet, onion skin of next set.

## Playback rule
- Play starts AT the current set and runs forward, in every view (Mat, 2026-11-08 — replaces the earlier 'play the move into set N' rule). Mid-move it resumes; on the last set it plays the final move. Stop returns to the set the move started from. Rehearse/Practice use explicit From/To.

## App modes (v0.9)
- `state.appMode` 'write' | 'rehearse' | 'students', mirrored on `body[data-mode]`; CSS shows/hides regions. `setAppMode()` stops playback, resets the tool, renders the mode, resizes the canvas.
- Rehearse: the old sidebar tab is now `aside#tab-rehearse.rehearse-panel` (same element ids). Canvas pointer = pan only; editing keys ignored; timeline press = `pickRehearseRange(i, shift)`; `.tl-block.in-range` underlines the range.
- Students: `iframe#studentFrame` → `student.html?embed=1&preview=1&id=…&set=…` (embed hides the preview banner). Live updates use the same localStorage `storage` event. Frame is sized to the chosen device and CSS-scaled to fit (`sizePhone`). The frame is blanked when leaving Students.
- Publish button is a disabled placeholder until session 3.

## Stop
- `stopPlayback()` (editor) / `stopToStart()` (student): back to the start of the move that was playing (`lastMove` recorded during play) and set `replayHere`/`replay` so the next Play skips the "play the move INTO this set" rewind once. Cleared by goToSet/goSet/scrub.
- Students mode map: `#stuMap` redrawn every 200 ms while in Students mode, reading the iframe's `__sv` state (same origin); click → `contentWindow.__svPick(id)` (keeps the set), falling back to reloading the frame.

## Landscape student view (v0.10)
- Mat asked for the student view to be locked landscape. Reality: only Android Chrome can lock (`requestFullscreen` + `screen.orientation.lock('landscape')`, needs a tap → done in `pickMe` and the ⛶ button). iOS Safari cannot lock from a web page, and ignores manifest orientation; the portrait prompt (`#rotateHint`, CSS `orientation: portrait` + `max-width: 640px`, body.has-main) covers it, with "Keep it upright anyway" (sessionStorage) for rotation-locked phones.
- Landscape layout = CSS grid in `@media (orientation: landscape) and (max-height: 560px)`: stage left, top/tabs/panel/controls right.
- Zoom: `st.zoom` 'me'|'all'; 'me' = auto framing `setBox(i)` (form via `formOf()` from drop.js + anyone within 8 steps + nearest yard-number row (19.2 / 66.1) + ±9 steps around the student), union of both sets during a move, eased while playing; `st.zf` multiplies it (1 = auto, 0.3–3; ≥3 → Field). + / − (`zoomBy`), pinch (two pointers), wheel, double-tap toggles. Swipe = change set (one finger only).
- `manifest.webmanifest` (start_url student.html, display fullscreen, orientation landscape) + `icons/icon-192/512.png`.

## Collision check (`js/checks.js`)
- Straight-line, constant-speed paths → exact closest approach per pair: t* = −(r0·v)/|v|². Flag if 0.02 < t* < 0.98, dist < reachA + reachB (winds/guard/DM 0.5, battery 0.65, pit 0.8 steps), and dist < min(start, end spacing) − 0.25 (so written tight spacing isn't flagged). Holds and moving-together pairs are skipped (v≈0).
- Editor caches `collisions()` per set; `changed()` clears it. Problems list (`renderProblems`, Sets tab) = collisions + big steps, clickable. Timeline/set list classes `.collide`. Field markers drawn in `draw()`; bump rings when |frac − t*|·counts < 1.2.
- Not yet in Drop/Add reports (Problems list catches anything new). Props and guard equipment swing aren't checked.

## Auto-fix (`js/fix.js`)
- Swap spots within ONE instrument (Mat's choice). For the move into set i: bottleneck assignment (binary search + augmenting-path matching) for the smallest max distance, then Hungarian on Euclidean distance (−0.3 bonus for keeping a student's own spot) → non-crossing paths. A section's swap is kept only if (collisions, big steps, worst distance) improves.
- `applySwap(show, i, perm)`: from set i onward, each student takes the other's whole track (positions + form ids remapped) — later transitions are identical, only move i changes. `proposeAll` stacks per-set swaps in order.
- `show.ok` = { 'x:i:idA:idB' | 'b:i:id': true } — problems marked intentional; filtered out of markers, timeline, set list, student chip, and auto-fix.
- Review uses `state.drop.mode = 'fix'` (same lock/panel as Drop/Add), `zoomToPaths()` frames the swapped paths.
- Holds (v0.13): `set.timing[id] = {pre, post}` for the move INTO that set. `moveTiming()` clamps so ≥1 moving count; `pathFrac()` maps move fraction → path fraction (used by `positionsAt`, 3D stepping); `moveStep()` = step size over moving counts only — use it instead of `stepSize(...counts)` everywhere; `timingText()` for labels. Collision check is piecewise-linear over the merged hold breakpoints. Auto-fix `suggestHolds()` tries, per remaining collision, the smallest k (1…counts−1) of pre or post for either student that removes that collision, lowers the set's total, and adds no new big step. `applySwap` moves timing for later sets with the path and clears it on the fixed set. Drop deletes the dropped student's timing.

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

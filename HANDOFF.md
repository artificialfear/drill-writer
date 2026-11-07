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

## Decisions Mat made
- Repo under artificialfear.
- Audio = the publishers' reference recordings on their YouTube channels. Sync to an embedded YouTube player (IFrame API currentTime), in both the editor and the student view. Do NOT commit or publish MP3s (copyright). Optional fallback: a local file the user loads on their own device, never uploaded.
- Guard get dots/coordinates like winds and percussion. Props/equipment are separate markers without dot sheets.
- Students only see drill IDs, never names.
- Drop default = Close the gap (fewest movers).

## Roadmap
1. ✅ v0.1 — field, performers, props, sets, form tools, transforms, playback, step-size flags, per-performer coordinate table.
1b. ✅ v0.2 — 3D view with bodies, camera presets.
1c. ✅ v0.3 — Drop a student with per-set fixes and a change report.
1d. ✅ v0.4 — Add a student to finished drill; remembered empty spots.
2. Audio + tempo map: YouTube link per show (IFrame API), count 1 offset, typed per-measure tempos first then tap-along to fix rits/accels, fermatas as count holds, two-way scrubbing, playback speed (drill follows), audio-delay setting. No waveform (YouTube gives no audio data) — nudge count marks by ear. Handle embedding-disabled videos and pre-roll ads.
3. Performer view (pick drill ID → own dot sheet + highlighted animation + audio), printable dot sheets (PDF), collision check.
4. Later: curved paths / follow-the-leader, facings (3D bodies would turn), backward-march vs. slide in 3D, sub-sets ("3A"), Band Ninja-style roster import.

## Open items
- How students open a show: probably `shows/<name>.json` + MP3 committed to the repo, loaded by `?show=` URL param (to build in step 3).

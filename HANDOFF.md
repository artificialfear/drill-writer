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

## Decisions Mat made
- Repo under artificialfear.
- Show audio WILL be published with the show for students (Mat accepted that the MP3 is downloadable by anyone with the link).
- Guard get dots/coordinates like winds and percussion. Props/equipment are separate markers without dot sheets.
- Students only see drill IDs, never names.

## Roadmap
1. ✅ v0.1 — field, performers, props, sets, form tools, transforms, playback, step-size flags, per-performer coordinate table.
2. Audio + tempo map: load MP3, tap-along beat marking, per-measure bpm, fermatas as count holds, two-way scrubbing.
3. Performer view (pick drill ID → own dot sheet + highlighted animation + audio), printable dot sheets (PDF), collision check.
4. Later: curved paths / follow-the-leader, guard facing, sub-sets ("3A"), Band Ninja-style roster import.

## Open items
- Mat needs to create the repo and enable Pages before the first push.
- How students open a show: probably `shows/<name>.json` + MP3 committed to the repo, loaded by `?show=` URL param (to build in step 3).

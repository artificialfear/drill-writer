# Changelog

## 0.11.1 — 2026-11-08
- Play and Space now start **from the set you're on** and run forward — in Write, 3D, the student phone and the Students preview. Paused partway through a move, they continue from there. On the last set (nothing ahead), they play the final move into it. Stop returns to the set the move started from.

## 0.11.0 — 2026-11-08
- **Collision check.** The app works out where every pair of marchers comes closest during each move and warns when they'd bump: closer than 1 step center to center for winds and guard, more room for battery (drums) and front ensemble. Spacing that's written into a set (a tight 1-step form) is not flagged — only collisions in the middle of a move.
  - Timeline: a red ✕ and red top edge on any set whose move has a collision. Sets list: ✕ before the set name.
  - Sitting on a set: a red ✕ on the field where the two meet, labeled with who and the count ("T2×M4 ct 20"), with dashed circles where each of them is at that moment.
  - While playing or scrubbing: thick red rings on the two marchers for the count or so around the bump.
  - **Problems** list in the Sets tab: every collision and every step bigger than 6 to 5 in the show. Click a collision to jump to the exact moment they meet with both selected; click a big step to go to that set with the student selected.
  - Student view: "⚠ Watch T5 around count 9" on the set where that student has a collision.

## 0.10.2 — 2026-11-08
- Student view "Me" zoom now frames the student's whole form, the people right around them, the nearest row of yard-line numbers, and at least the yard lines on either side — no more zooming out to find where you are. While playing it frames both ends of the move and eases between moves instead of jumping. + / − / pinch still zoom from there, and **Me** returns to this framing.

## 0.10.1 — 2026-11-07
- **Set slider** on the student view: a bar along the bottom of the field with a tick and number for every set. Drag the orange handle to slide through the whole show — dots move in between sets as you slide, and the handle sticks to a set when you get close so landing on one is easy. A bubble shows where you are ("Set 5" or "4 → 5"). Long shows label every 2nd or 5th set.

## 0.10.0 — 2026-11-07
- **Student view is built for landscape.** Sideways, the field fills the left of the screen and the set card, tabs and Play / Stop / Practice sit on the right.
- Holding a phone upright shows "Turn your phone sideways", with a small "Keep it upright anyway" button for students whose rotation lock is on.
- On Android, opening your dot goes full screen and locks sideways (⛶ button to do it again). iPhones don't let web pages lock rotation, so they rely on the prompt.
- **Zoom**: + / − to get closer to (or farther from) your dot, pinch on the field, scroll on a computer, double-tap to switch between Me and Field.
- Added a web-app manifest and icons ("My Drill") so Add to Home Screen opens full screen and sideways on Android — groundwork for the offline student link.
- Students mode in the editor previews sideways phones by default.

## 0.9.1 — 2026-11-07
- **Students mode**: a small field map in the side panel. Click any dot to see that student's phone (the dropdown still works). The previewed student is the red dot, and the map follows the phone's set while it plays.
- **Stop button (■)** next to Play, in the editor and on the student phone. Stop goes back to the start of the move that was playing, and the next Play replays that same move — handy for watching one move over and over. Esc also stops in the editor. In Practice / Rehearse, Stop returns to the From set.

## 0.9.0 — 2026-11-07
- **Write · Rehearse · Students** modes in the top bar.
  - **Write** is the editor, as before.
  - **Rehearse** (or press R) clears away every editing tool: big field, big count, and a side panel with From / To, tempo, repeat, and a large Go / Stop. Click a set on the timeline to make it From, Shift-click for To; the chosen range is underlined. Dragging the field pans, so nothing can be moved by accident on a tablet. Count-off and click settings are folded away below.
  - **Students** shows the real student view inside a phone frame (iPhone, Android, small phone or tablet sizes), as any performer, updating live as you edit. "Open in a new tab" and "Show the ID picker" are there too, plus a placeholder for Publish for students (next).
- The Student view and Rehearse buttons moved into the modes. Undo/Redo only show in Write.

## 0.8.2 — 2026-11-07
- Play / Space now starts at the beginning of the selected set's move: on set 5 it plays the counts into set 5 (from set 4), matching that set's block on the timeline, then keeps going. Before, pressing play on the last set jumped back to set 1. Paused in the middle of a move, it just continues. Same in the student view.

## 0.8.1 — 2026-11-07
- After Line, Arc, Block or Circle places the dots, the app switches back to Select automatically, so the next click picks a student instead of re-forming the group. A short message confirms it (Ctrl+Z undoes the form).
- Form tool hints now say "Esc = cancel".

## 0.8.0 — 2026-11-07
- **Set timeline** across the bottom: one block per set, sized by its counts, with a red playhead. Click a block to go to that set, drag along it to scrub, drag a block's right edge to change its counts (undoable). A red dot marks sets with steps bigger than 6 to 5, ✎ marks sets with notes, "hold" marks sets where nobody moves. **+ Set** adds a set after the current one.
- **Selection bar**: select dots and their tools appear right next to them — Line, Arc, Block, Circle, interval and block columns, rotate, expand/contract, flip, mirror across the 50, reverse, copy previous spots, and (for one student) Drop… and Preview. It moves out of the way of other dots.
- **Quick select**: with nothing selected, section buttons along the bottom of the field select a whole section (Shift adds) or Everyone.
- Undo / Redo moved to the top bar. The left toolbar is now just the tools and Snap.

## 0.7.0 — 2026-11-07
- 3D marchers now show marching technique. Winds keep their upper body and horn to the box while their hips, legs and feet turn toward the next dot (slides). Moving backward, the hips face away from travel and they step back (backward march / backward slide). Battery keeps drums to the box and crab steps sideways. Guard and drum major turn their whole body toward where they're going. Holds stand still.
- The student view names the technique for every move ("Slide right", "Forward slide left", "Backward march", "Crab step left"…) next to the step size, in "Next:", and on the dot sheet. Left/right are the marcher's, facing the box.
- The editor's Dot tab shows the technique under each step size.

## 0.6.1 — 2026-11-07
- Student view now opens in **Performer view** by default: the field is turned around the way a marcher sees it facing the audience (front sideline at the top, Side 1 on the right). **Director** switches to the press-box view. The phone remembers the choice.
- In 3D, Performer view puts the camera just behind and above the student, looking toward the audience; Director view looks from the front. "Field" uses the backfield or press-box camera to match.
- Nearby says "your left / your right" in Performer view (Side 1 is on your right when facing front).

## 0.6.0 — 2026-11-07
- **Student view** (`student.html`), built for phones. Students pick their drill ID once; the phone remembers it.
  - Their dot is highlighted (everyone else dimmed); "Me" zoom follows them, "Field" shows the whole band. Gray dashed arrow = where they came from, orange arrow = where they go next. Neighbors are labeled.
  - Big, readable coordinates for each set, counts, their step size (or HOLD), set notes, and what's next. Swipe the field or use ◀ ▶ to change sets.
  - ▶ Play with a personal big count (HOLD when *they* don't move) and **Practice…** with the count-off and click for a range of sets.
  - Dot sheet tab (print / save as PDF) and Nearby tab (who's toward Side 1, Side 2, in front, behind).
  - 3D view follows their marcher, with an orange marker over their head.
- **Student view** button (top bar) and **Preview as T4** (Dot tab) in the editor open it for any performer. The preview updates live as you edit in the other tab.

## 0.5.1 — 2026-11-07
- Big count now shows the set's total ("5 /16"), or counts left if you prefer (Rehearse › Big count shows).
- A bar with one segment per count fills as the move goes, with a small gap every 8 counts.
- Last 4 counts of a move turn orange so the band sees the arrival coming; the box flashes on each new set.
- Moves where nobody moves show as HOLD.
- A line under the set says what's next ("Then 16 counts to set 7", "Then hold 8 on set 6", "Stop on set 8"); during the count-off it shows the first move.
- Optional: show the big count during normal ▶ Play too.

## 0.5.0 — 2026-11-07
- **Rehearse** (button on the bottom bar, or R): run reps from any set to any later set with a count-off, a click on every count, and the drill moving in time.
- Count-off presets (default "1 · 3 · 1 2 3 4"), or tap the beats to make your own (silent / on / accent, 4 or 8 counts). Sounds: cowbell, click, woodblock, beep, or spoken numbers. "Hear count-off" to try it.
- Rehearsal tempo 50–120% (drill slows with it), accent on the first count of each set, auto-repeat with a gap and rep counter, big count display, speaker delay for Bluetooth speakers.
- Each set can have its own tempo (♩ field in the set list; blank = show tempo). Normal playback follows it too.

## 0.4.0 — 2026-11-07
- **Add a student to finished drill…** (Performers tab): pick the instrument and drill ID, choose who they march next to, then choose per set: Fill empty spot, Add at end of the form, Insert next to (shorter side steps out one spot), Stretch to fit, or a free Spot beside. Each set shows how many people move, how far the new dot is from their partner, and a warning if it lands within 1 step of someone. Preview on the field, one undo, and a report of who needs new dot sheets.
- Dropping with **Leave the hole** now remembers the empty spot (shown as a dashed circle). Adding a student fills those spots first, so nobody moves.
- Fixed "1 moves / 2 move" wording.

## 0.3.0 — 2026-11-07
- **Drop student…** (Performers tab or Dot tab): removes a student from every set and closes up only the form they were in. For each set you choose Close the gap (the form keeps its spacing; only the shorter side slides in, onto spots that already exist), Stretch to fill (same end points, form re-spaces), or Leave the hole. Preview on the field before applying.
- After a drop, a report lists exactly which students got new dots and in which sets (so only those dot sheets get reprinted), plus any moves that became bigger than 6 to 5. Copy list button. One undo reverses the whole drop.
- Line, Arc, Block and Circle now remember the form they drew, so drops rebuild it exactly. Older or hand-placed drill is handled by finding evenly spaced neighbors.
- Change a performer's instrument from the Dot tab (for alternates who play something different).
- "Remove selected" is now "Delete" (removes with no adjustments).

## 0.2.0 — 2026-11-07
- New 3D view (2D / 3D switch on the field). Marchers are simple bodies in section colors with horns, drums, keyboards or guard flags, and props show as solid blocks.
- Camera presets: press box, field level, overhead, Side 1 end zone, backfield. Drag to orbit, scroll to zoom, right-drag to pan.
- Marchers step on every count while moving and stand still on holds. Click a body to select it.
- 3D is for watching; picking a drawing tool switches back to 2D.

## 0.1.0 — 2026-11-07
- High school football field to scale (8-to-5 grid, HS/college/NFL hashes), Side 1 / Side 2 and front labeled.
- Add performers by section with drill IDs (T1, M3, G5…). Guard, battery, front ensemble and drum major get their own marker shapes.
- Props and equipment as separate markers with size, rotation and color.
- Sets with counts, notes and a warning when anyone needs a step bigger than 6 to 5.
- Form tools: line, arc, block, circle. Transforms: rotate, expand/contract, flip, mirror across the 50, reverse, copy spots from the previous set.
- Snap to 1, ½ or ¼ step. Coordinates read like a dot sheet ("Side 1: 2 steps outside 35 yd ln · 4 steps behind Front Hash").
- Playback with scrubber, tempo and paths from the previous set.
- Undo/redo, autosave on this device, Save/Open show files, light/dark theme, sample show.

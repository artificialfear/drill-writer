# Changelog

## 0.23.3 — 2026-11-11
- **Horns down now matches this band's carry position** in 3D:
  - **Flute, piccolo, clarinet, trumpet, mellophone, trombone, baritone:** held level and pointing forward the way they play, lifted so the mouthpiece or lip plate is at eye level, a few inches off the face. The clarinet is held straight out level instead of angled down.
  - **Saxophones:** lying flat across the chest, bell end to the marcher's right.
  - **Sousaphone and percussion:** unchanged.

## 0.23.2 — 2026-11-11
- **Move the field while zoomed in, without Fit:**
  - **Hold Space and drag.** Works in any tool. A quick tap of Space still plays and stops (it now acts on release).
  - **Two-finger scroll on a trackpad** moves the field, and pinching zooms. A mouse wheel still zooms.
  - **Arrow keys** move the view when nothing is selected (Shift = farther). With marchers selected they still nudge the dots.
  - Right-drag, middle-drag, and the Pan tool (H) still work as before.
  - The Select hint and the Fit button's tooltip now mention these.

## 0.23.1 — 2026-11-11
- The row of section buttons (Flute, Clarinet, …) no longer covers the front of the field. It's now one small **Select a section ▴** button in the bottom-left corner. Clicking it opens the list as a pop-up menu above the button; it closes after a pick or a click on the field. Shift still adds to the selection.

## 0.23.0 — 2026-11-11
- **Block intervals both ways.** With the Block tool active, the selection bar shows:
  - **Across:** steps between marchers left to right (1–8), plus **On the yard lines (8)** (every file on a yard line) and **On + splitting (4)** (files on the lines and halfway between). With a yard-line option, the click snaps to the nearest line or split.
  - **Deep:** steps between ranks front to back (1–6).
  - **Cols:** marchers per rank.
  - **Rank on:** where I click, or the front rank on the front sideline / front hash / back hash, or the back rank on the back hash / back sideline.
- **Line** gets the same yard-line options in its Interval list. Every dot lands on a yard line (or split), even on a 45° diagonal.
- The download reminder now waits for 3+ days of changes that aren't in a downloaded file, measured from the first change after the last download. A brand-new show is no longer nagged after a few minutes of work.

## 0.22.0 — 2026-11-10
- **Protecting work.**
  - **Save status** in the header: ✓ Saved / Saving… / ⚠ Not saved (if the browser refuses to save) / ⚠ Changed in another tab. Click it to open **Backups**.
  - **Automatic copies.** A history of the show is kept in the browser's database: every few minutes while editing, and right before anything big (New, Open, Sample, Drop, Add student, Fix, Delete set, Remove performers, Renumber, Restore, loading another tab's version). Identical copies aren't stored twice. Old copies are thinned to everything from the last 2 hours, then one per hour for 2 days, then one per day for 60 days.
  - **Backups panel:** restore any copy (the current show is copied first, and Undo brings it back) or download it as a file.
  - **Download reminder:** after 20+ changes with no file downloaded in 3+ days, a bar offers "Download a backup file". "Not now" snoozes it for a day. **Ctrl+S** downloads, and file names now include the date.
  - **New / Open / Sample no longer wipe Undo.** Ctrl+Z brings back the show you had.
  - **Two tabs editing the same show** no longer silently overwrite each other. The second tab's save shows a warning in the first, with "Load the other version" or "Keep this version".
  - The show saves immediately when the tab is closed or hidden. The app also asks the browser to keep its storage rather than clear it on its own.
- Fixes: changing the show tempo can now be undone. Removing performers also removes their timing and look entries.

## 0.21.0 — 2026-11-10
- **Facings, horns up/down, and flag work.** Select students in Write mode and press **↻ Look** in the selection bar to set what changes at the current set:
  - **Facing:** front, backfield, Side 1, Side 2, or back to their section's usual facing.
  - **Horns:** up or down. For battery the same control is **sticks out / in**.
  - **Flag** (color guard): attention, right or left shoulder, front present, right or left 45° angle, flat front, flat overhead, spinning (drop spins), or no flag.
  - Each change can happen on a chosen count of the move into that set. It defaults to the last count, on arrival.
  - Changes carry forward to later sets until changed again. "Clear changes at this set" removes them.
- **Marching technique follows the facing.** Winds facing backfield and moving toward the front do a backward march. Moving sideways while facing backfield is a slide (left or right, from the marcher's point of view). Battery and bass drums with a set facing crab or march from that facing. Labels say so, e.g. "Slide right (facing backfield)".
- **3D shows it all.**
  - Marchers turn on the count.
  - Horns snap down in front of the body: brass bells point down, the flute drops along the right side, clarinets and saxes lower. Snare and tenor sticks go in, bass mallets hang down, cymbal plates drop to the sides.
  - Guard members move between flag positions with rigged arms; the spinning position does one drop spin every 2 counts.
- **2D:** dots with a set facing get a small tick pointing their way, and horns-down / sticks-in dots get a dark center.
- **Dot tab, student phone card, and dot sheet** list the cues for each move, e.g. "Horns down on count 8", "Turn to face backfield on count 24 (arriving)", "Flag: right shoulder on count 16".
- Dropping a student removes their looks. Auto-fix swaps hand each look over with the path (the student takes on the facing and horns of the dots they inherit).

## 0.20.1 — 2026-11-08
- Flutes are real length now (about 26½″, up from about 15″), angled slightly down, with a lip plate and keys. The left hand sits a few inches down the flute from the lip plate instead of at the face, and the right hand sits on the lower keys. Piccolos get the same treatment at real piccolo length (about 12½″).

## 0.20.0 — 2026-11-08
- **Uniform pass: marchers look much more like the real band.**
  - **Shaped jacket:** a real torso shape with chest, waist, and a hem that flares over the hips. The uniform pattern is now a texture, so the teal yoke, silver band, and silver piping have crisp, smooth edges. It has a satin finish.
  - **Draped teal yoke** over each shoulder with silver piping along the edge (replacing the round pads), plus a teal stand-up collar with a silver rim.
  - **Shako worn low,** with the visor at the eyebrows, the chin strap under the chin, and hair showing at the sides and back. Silver band, top rim, and plate.
  - **Full feather plume:** a fluffy core with dozens of curving teal feathers and a little black at the base. Sousaphones still go without.
  - **Faces:** eyes, eyebrows, ears, nose, and mouth.
  - **Fuller black sleeves** that end at the wrist, so hands show. **Loose straight-leg pants** and polished black shoes.
  - **Real metal:** brass, silver, and chrome now reflect the sky and field.
- Performance: about 8,000 triangles per marcher (about 430k for a 52-person band). Small details like eyes and drum hoops use fewer facets, and the jacket mesh is shared by everyone. `v3.stats()` reports draw calls and triangles for checking phone load.

## 0.19.0 — 2026-11-08
- **Drum major on a podium.** The drum major stands on a 3-ft black podium with a silver edge, a teal band, and steps up the back. They face the center of the band wherever they stand (before, they faced the audience). The podium goes wherever the drum major's dot is.
- **Conducts in time with the drill.**
  - Uses a 4-beat pattern: 1 down, 2 in, 3 out, 4 up, with a rebound between beats. Both hands mirror each other.
  - The hand hits each beat exactly on the count, so it follows play, practice, tempo changes, and dragging the set slider.
  - Count 1 of the show is beat 1, and the move into count 1 is the prep.
  - When the drill is stopped, the arms rest up in a ready position.
- **No drum major in the show?** A stand-in drum major on a podium appears at the 50, 4 steps in front of the front sideline. It can't be clicked and isn't part of the drill; it's just there so there's someone to watch. Bass drum heads watch it too.
- **Students can see the drum major.**
  - The Performer 3D camera on student phones is lower and looks further forward, so the drum major is in the picture along with the student and their neighbors.
  - In student 3D and Eyes views, the drum major's name tag stays on so they're easy to find.

## 0.18.0 — 2026-11-08
- **Eyes view (first person) on student phones.** A third button next to 2D / 3D shows the field from the student's own eyes at their spot, looking where they'd be looking.
  - Winds look toward the box, even while sliding.
  - Guard and drum major look where their body faces.
  - Bass drums look at the drum major.
  - The view moves with the drill as it plays, practices, or scrubs.
  - Drag to glance around; the view drifts back to straight ahead about a second after letting go.
  - The student's own body is hidden so their arms and instrument don't block the field.
  - Uses a wider, eye-like field of view.
  - The zoom and Performer/Director buttons are hidden here since they don't apply.
- Fix: in a sideways (landscape) phone preview, the blue "Preview" banner covered the header buttons. It's now a small pill over the top-left corner of the field.

## 0.17.1 — 2026-11-08
- Sousaphone players wear the shako without a plume, as they do for real, so nothing pokes into the bell. The bell also sits a little higher so it clears the top of the shako.

## 0.17.0 — 2026-11-08
- **Color guard uniform** to match this year's guard:
  - Top: fitted black sleeveless mock-neck, with bare arms.
  - Sash: wide sparkly teal sequinned sash at the waist. Each facet is a slightly different shade, so it glints.
  - Pants: black flared.
  - Hair: long and worn down over the crown and down the back, with a strand in front of each shoulder.
  - Silk: teal, as before.
- Guard uniforms change every year; to update them, see `upperBody()` (the guard branch), `SEQUIN`, and `GEO.shinFlare` in `js/view3d.js`.

## 0.16.0 — 2026-11-08
- **Tenors are quints**, laid out like a real carrier seen from above: the 13″ and 14″ drums out at the sides, the 10″ and 12″ in front, and the small 6″ drum in the middle closest to the marcher. All five hang from a bar across the front of the carrier.
- **Bass drums face the 50.** On Side 1 the drum and body face Side 2, and on Side 2 they face Side 1, so the drum heads face the audience. When a bass crosses the 50 they spin (turning through facing the audience) to face it again. A small zone right on the 50 keeps them from flickering back and forth.
- **Bass heads watch the drum major.** The head turns toward the drum major wherever they are (or toward the press box if there's no drum major), limited to how far a neck can actually turn.
- Bass legs match their facing. Moving toward the audience while facing the 50 is a crab step, moving toward the 50 is a forward march, and moving away from it is a backward march.
- The Dot tab and student phones describe bass moves the same way, for example "Crab step right (facing the 50, toward Side 2)". When a move crosses the 50: "March forward … · spin at the 50, then backward march".

## 0.15.0 — 2026-11-08
- **Real band uniform in 3D.** Every marcher wears the same uniform:
  - Jacket: black, with a teal yoke and squared teal shoulder pads with silver piping. A silver band runs from the right shoulder down to the left hip, with teal above it. The collar is teal.
  - Black sleeves and pants.
  - Teal shako with silver trim and chin strap, a black visor, and a full teal feather plume.
  - The guard wears the same jacket with a teal silk. The drum major's shako and plume are a little taller.
- **Bigger, more accurate battery:**
  - Snare: a 14″ × 12″ marching snare with its top head at the belly. It sits on a T-bar carrier and has tension rods.
  - Tenors: real sixes, with 14″, 13″, 12″ and 10″ drums in an arc around the waist plus 6″ and 8″ spocks out front.
  - Bass drums: higher on the chest, sized by the bass number in the label. D1 is the smallest (about 18″) and D5 the largest (about 26″). Labels without a number default to bass 3.
  - All drums have black shells, chrome hoops and lugs, and white heads.
- **Sticks are held correctly.** Snare and tenor hands sit out to the sides with the butt end showing behind the hand, and the sticks angle inward in a V toward the center of the head. Bass players hold mallets at the sides of the drum, angled up so the felt head meets the drum.
- Left and right are fixed. The flute and saxes are held on the marcher's right, and the sousaphone rests on the left shoulder with its valves on the right.

## 0.14.0 — 2026-11-08
- **More realistic marchers in 3D.** Every marcher now has real proportions: a tapered jacket in the section color with a white cross-belt and black waist belt, arms bent to hold the instrument, white gloves, a neck and head (five skin tones, varied per student), and a black shako with a gold band, visor, chin strap, plate, and plume. The drum major wears a white shako with a tall plume and holds a conducting pose. Guard members have hair instead of a shako.
- **Real instruments in the hands:**
  - Brass: trumpet, mellophone, baritone (bell-front, sized up in that order), trombone with the slide out front, and a sousaphone wrapped over the left shoulder with its bell above the head.
  - Woodwinds: flute and piccolo held to the side, clarinet angled down, and alto, tenor, and bari saxes in increasing sizes.
  - Battery: snare, a tenor quad with spock, bass drum on its side with mallets, and crash cymbals. All drums sit on carriers and have hoops and sticks.
  - Front ensemble: a keyboard on legs with mallets.
  - Guard: a 6-ft pole with a silk that waves.
- **The legs actually march:**
  - Hip, knee, and ankle joints.
  - Glide (roll) step: toe high on the heel strike, rolling through the foot, knee bending only on the recovery, one step per count, left foot first.
  - Stride length matches the step size (an 8-to-5 stride looks longer than a 16-to-5).
  - Backward march: up on the toes.
  - Crab step: legs swing side to side.
  - Legs ease back to standing during holds.
- Soft shadows under each marcher, grass texture on the field, and gentler color tone mapping. Name tags and the student "you" marker sit a little higher to clear the sousaphone bells.
- Performance: everything above the waist (jacket, head, shako, arms, instrument) is merged into one mesh per instrument and skin tone, so a 60-person band draws about as fast as before.

## 0.13.0 — 2026-11-08
- **Holds inside a move.** Select students, then **⏱ Timing** in the selection bar to set the move into the current set as "Hold 4, then move 12" or "Move 12, then hold 4" (or both). Everything follows it: playback and 3D (they stand still during the hold, legs only step while moving), step sizes (counted over the moving counts only, so a hold can create a big step — you're warned), the collision check, the Dot tab, and the student phone ("⏱ Hold 4, then 12", and the big count shows "HOLD — go on 5" or "HOLD — you're there").
- Paths on the field show H4 at the start (hold first) or end (arrive early) of a timed move.
- **Fix… now also suggests holds.** After trying a swap within the instrument, it looks for the shortest hold — one of the two students waits before moving, or arrives early — that clears a collision without causing another one or a big step. This fixes the collisions swapping can't, like two different instruments crossing. The review shows each hold (⏱ U2: move 23, then hold 1) and the report lists it.
- Swapping spots now carries any holds along with the path.

## 0.12.0 — 2026-11-08
- **Fix… (swap spots).** Every item in the Problems list has a Fix… button, and **Fix all I can…** sits at the top. The app keeps every dot of the set exactly where it is and works out which students of the same instrument should trade spots so the largest step is as small as possible and nobody's path crosses. Each student takes the other's path for the rest of the show, so every later move looks the same — only the move into that set changes.
  - Review before applying: each set lists who trades and how many problems it fixes; the field zooms in and shows old paths (red dashed) and new paths (green).
  - Afterward, a report lists exactly whose dot sheets changed and from which set (Copy list). One undo reverses it.
  - If swapping can't help (usually two different instruments crossing), it says so.
- **OK** on any problem marks it as intentional: it stops showing on the timeline, sets list, field and student phones, and moves to a "Marked OK" list where **Undo OK** brings it back. Saved with the show.

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

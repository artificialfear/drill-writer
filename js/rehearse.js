// Drill Writer — rehearsal mode: count-off + click track + drill playback for a range of sets.
// Audio is scheduled ahead on the Web Audio clock, and the drill is driven from that same clock,
// so the click and the animation can't drift apart.
import { setStarts } from './model.js';

// ---------- Count-off patterns ----------
// Each beat: 0 = silent, 1 = normal, 2 = accent. Spoken counts use the beat's place in a bar of 4.
export const COUNTOFF_PRESETS = {
  halfQuarter: { name: '1 · 3 · 1 2 3 4 (two halves, four quarters)', beats: [2, 0, 1, 0, 2, 1, 1, 1] },
  eight:       { name: '1 2 3 4 5 6 7 8 (eight quarters)',            beats: [2, 1, 1, 1, 2, 1, 1, 1] },
  four:        { name: '1 2 3 4 (four quarters)',                     beats: [2, 1, 1, 1] },
  twoBars:     { name: '1 · · · 1 2 3 4 (whole, then quarters)',      beats: [2, 0, 0, 0, 2, 1, 1, 1] },
  none:        { name: 'No count-off',                                beats: [] }
};
export const SOUNDS = {
  cowbell:  'Cowbell',
  click:    'Click',
  woodblock:'Woodblock',
  beep:     'Beep',
  voice:    'Spoken numbers'
};

export const DEFAULT_SETTINGS = {
  preset: 'halfQuarter', beats: [...COUNTOFF_PRESETS.halfQuarter.beats],
  countSound: 'cowbell', clickOn: true, clickSound: 'click', accentSets: true,
  volume: 0.8, tempoPct: 100, repeat: false, repeatGap: 8, delayMs: 0, bigDisplay: true,
  countMode: 'up', bigInPlay: false
};

// ---------- Sounds (synthesized, so they work offline with no files) ----------
function voiceFor(ctx, gain, time, accent, kind) {
  const g = ctx.createGain(); g.connect(gain);
  const peak = accent === 2 ? 1 : 0.6;
  const env = (attack, decay) => {
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  };
  const osc = (type, freq, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, time); o.start(time); o.stop(time + dur + 0.05); return o; };
  if (kind === 'cowbell') { // classic two-square cowbell through a band-pass
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = accent === 2 ? 900 : 800; bp.Q.value = 2.5; bp.connect(g);
    const f = accent === 2 ? 1.08 : 1;
    osc('square', 587 * f, 0.4).connect(bp); osc('square', 845 * f, 0.4).connect(bp);
    env(0.002, 0.32);
  } else if (kind === 'woodblock') {
    const o = osc('triangle', accent === 2 ? 1250 : 1000, 0.12);
    o.frequency.exponentialRampToValueAtTime(accent === 2 ? 900 : 720, time + 0.08);
    o.connect(g); env(0.001, 0.09);
  } else if (kind === 'beep') {
    osc('sine', accent === 2 ? 1500 : 1000, 0.1).connect(g); env(0.004, 0.09);
  } else { // click
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200; hp.connect(g);
    osc('square', accent === 2 ? 2600 : 1900, 0.04).connect(hp); env(0.001, 0.035);
  }
}

// ---------- Timeline ----------
// Beat times for every whole count from set `from` to set `to`, honoring per-set tempos and the rehearsal %.
export function buildTimeline(show, from, to, pct) {
  const st = setStarts(show);
  const start = st[from], end = st[to];
  const bpmInto = i => (show.sets[i].bpm > 0 ? show.sets[i].bpm : show.tempo.bpm) * pct / 100;
  const beat = [];          // seconds from run start for count start+k
  let t = 0;
  for (let c = start; c <= end; c++) {
    beat.push(t);
    let i = 0; while (i < show.sets.length - 1 && st[i + 1] <= c) i++; // transition containing count c → into set i+1
    t += 60 / bpmInto(Math.min(i + 1, show.sets.length - 1));
  }
  return { start, end, beat, firstBpm: bpmInto(Math.min(from + 1, show.sets.length - 1)) };
}
export function countAt(tl, t) {
  const b = tl.beat;
  if (t <= 0) return tl.start;
  if (t >= b[b.length - 1]) return tl.end;
  let lo = 0, hi = b.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; }
  return tl.start + lo + (t - b[lo]) / (b[hi] - b[lo]);
}

// ---------- Engine ----------
export function createRehearsal({ getShow, onFrame, onState }) {
  let ctx = null, master = null, raf = 0, run = null, gapTimer = 0, voiceTimers = [];
  const stats = { scheduled: 0, reps: 0 };

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function schedule(time, accent, kind, gain, label) {
    if (kind === 'voice') {
      // speech can't be scheduled on the audio clock; fire it from a timer (may lag slightly)
      const ms = Math.max(0, (time - ctx.currentTime) * 1000 - 60);
      voiceTimers.push(setTimeout(() => {
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(String(label)); u.rate = 1.6; u.volume = gain.gain.value; speechSynthesis.speak(u);
        } catch (e) { /* no speech engine */ }
      }, ms));
    } else voiceFor(ctx, gain, time, accent, kind);
    stats.scheduled++;
  }

  function startRep(opts) {
    const show = getShow();
    const tl = buildTimeline(show, opts.from, opts.to, opts.tempoPct);
    ensureCtx();
    if (master) { try { master.disconnect(); } catch (e) {} }
    master = ctx.createGain(); master.gain.value = opts.volume; master.connect(ctx.destination);
    const beatLen = 60 / tl.firstBpm;
    const t0 = ctx.currentTime + 0.25;
    const beats = opts.beats || [];
    beats.forEach((b, i) => { if (b) schedule(t0 + i * beatLen, b, opts.countSound, master, (i % 4) + 1); });
    const tRun = t0 + beats.length * beatLen;
    if (opts.clickOn) {
      const starts = new Set(setStarts(show));
      tl.beat.forEach((bt, k) => {
        const c = tl.start + k;
        const accent = opts.accentSets && starts.has(c) ? 2 : 1;
        schedule(tRun + bt, accent, opts.clickSound === 'voice' ? 'click' : opts.clickSound, master);
      });
    }
    stats.reps++;
    run = { opts, tl, t0, tRun, beatLen, beats: beats.length, rep: stats.reps, delay: (opts.delayMs || 0) / 1000 + (ctx.outputLatency || 0) };
    onState && onState('running', run);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function frame() {
    if (!run) return;
    const now = ctx.currentTime - run.delay;
    let phase, count, beatNum = 0;
    if (now < run.tRun) {
      phase = 'countoff';
      count = run.tl.start;
      beatNum = Math.max(0, Math.floor((now - run.t0) / run.beatLen));
    } else {
      count = countAt(run.tl, now - run.tRun);
      phase = count >= run.tl.end ? 'done' : 'run';
    }
    onFrame({ phase, count, beatNum, run });
    if (phase === 'done') {
      // hold on the last set, then go again if repeating
      const opts = run.opts;
      run = null;
      if (opts.repeat) {
        onState && onState('gap', { seconds: opts.repeatGap });
        gapTimer = setTimeout(() => startRep(opts), Math.max(1, opts.repeatGap) * 1000);
      } else onState && onState('stopped');
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    clearTimeout(gapTimer); cancelAnimationFrame(raf);
    voiceTimers.forEach(clearTimeout); voiceTimers = [];
    try { speechSynthesis.cancel(); } catch (e) {}
    if (master) { try { master.disconnect(); } catch (e) {} master = null; }
    const was = !!run || !!gapTimer; run = null; gapTimer = 0;
    if (was) onState && onState('stopped');
  }

  return {
    start(opts) { stop(); stats.reps = 0; startRep(opts); },
    stop,
    preview(beats, kind, volume, bpm) { // play just the count-off, for trying sounds/patterns
      ensureCtx();
      const g = ctx.createGain(); g.gain.value = volume; g.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.1, len = 60 / bpm;
      beats.forEach((b, i) => { if (b) schedule(t0 + i * len, b, kind, g, (i % 4) + 1); });
    },
    get running() { return !!run || !!gapTimer; },
    stats
  };
}

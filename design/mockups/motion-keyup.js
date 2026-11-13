/* ==========================================================================
   sdrviz · WLT-1 · Motion study: the key-up choreography on one tile.
   Brief §7.3 (P6), spec §6.3. Two cases on the same channel (CH54 · AMTK NEC):
     A  sim-0648  MARC 433 via BWI-03, 9.6 s: squelch-open -> commit -> lock ->
        populate -> release hold -> settle -> cool 1 (+2 min) -> cool 2 (+10 min)
     B  kc-040    12:14:12.0 via ALX-01, 0.10 s: squelch-open that never commits
   Data: data/sim/day.js (transmissions, kerchunks, health, routes) and
         data/sim/scenarios/keyed.js (channel identity, CTC position).
   URL:  motion-keyup.html            plays both lanes on a loop
         ?t=0.31[&tb=0.05]            freezes lane A (and B) at t seconds from the squelch crossing
         &speed=0.25                  slow motion        &motion=reduced   reduced-motion variant
   ========================================================================== */
(function () {
  "use strict";
  const fmt = HUD.fmt, esc = HUD.esc;
  const REDUCED = HUD.motion === "reduced";
  /* ASSUMPTION shared with live-ops.js: squelch threshold = feed floor + 8 dB (no data field yet). */
  const SQ_DB = 8;
  const COMMIT = 0.25, FLASH = 0.12, TICK = 0.24, CONNECT = 0.4, SETTLE = 0.4, COOL1 = 120, COOL2 = 600, KER_HOLD = 2;
  /* t-flash (120 ms) = the frame draws at state-tx-hot (first 20 ms, held) then settles to state-tx
     with ease-instrument (100 ms). The AAR step-down 24 -> 20 -> 16 -> 13 runs inside the same 120 ms. */
  const FLASH_HOLD = 0.02, AAR_STEPS = [24, 20, 16, 13];
  /* lock: the timer never sits closer than 8 px (16 px at 2x) to the AAR glyphs (review r1 #2) */
  const TIMER_GAP = 8;
  /* lock (review r2 #2): the timer slot stays empty while the AAR steps 24 -> 13 (the 120 ms flash);
     at COMMIT + FLASH (+370 ms) the whole MM:SS.t string appears on one frame. Never a partial string.
     Reduced motion: no flash, so the timer is there from the commit frame. */
  const timerShownAt = (t) => REDUCED || t >= COMMIT + FLASH;
  const PING = 1.2; /* t-ping */

  const hash = (a, b = 0) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  /* ease-instrument cubic-bezier(0.2, 0, 0, 1), solved numerically */
  const easeInstrument = (x) => {
    x = clamp01(x);
    const bx = (u) => 3 * (1 - u) * (1 - u) * u * 0.2 + u * u * u, by = (u) => 3 * (1 - u) * u * u + u * u * u;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
    return by((lo + hi) / 2);
  };
  const loadTwin = (rel, pick) =>
    new Promise((resolve, reject) => {
      if (pick()) return resolve(pick());
      const s = document.createElement("script");
      s.src = HUD.ROOT + rel;
      s.onload = () => (pick() ? resolve(pick()) : reject(new Error("DATA NOT FOUND · " + rel)));
      s.onerror = () => reject(new Error("DATA NOT FOUND · " + rel));
      document.head.appendChild(s);
    });

  /* ---------------------------------------------------------------- data -> lanes */
  function lanes(day, scn) {
    const txs = day.transmissions.transmissions.slice().sort((a, b) => a.t_offset_s - b.t_offset_s);
    const chan = scn.channels.find((c) => c.id === "amtk-nec-road");
    const ch = { aar: 54, label: chan.label, mhz: chan.freq_mhz, railroad: chan.railroad, use: chan.use };
    const prevOf = (t0) => txs.filter((r) => r.frequency_id === chan.id && r.t_offset_s + r.duration_s < t0).pop();
    const floorOf = (fid) => day.health.feeds[fid].noise_floor_dbfs;
    const sparkAt = (abs, extra) => {
      const m0 = Math.floor(abs / 60) * 60, v = new Array(60).fill(0);
      txs.forEach((r) => {
        if (r.frequency_id !== chan.id || r.t_offset_s > abs || r.t_offset_s + r.duration_s < abs - 3600) return;
        if (extra && r.id === extra.id) return;
        const e = Math.min(r.t_offset_s + r.duration_s, abs);
        for (let i = 0; i < 60; i++) { const a = m0 - (59 - i) * 60, o = Math.min(e, a + 60) - Math.max(r.t_offset_s, a); if (o > 0) v[i] += o; }
      });
      if (extra) { const o = Math.min(abs, extra.end) - Math.max(extra.t0, m0); if (o > 0) v[59] += o; }
      return v;
    };

    const row = txs.find((r) => r.id === "sim-0648");
    const prim = row.receptions.slice().sort((a, b) => b.snr_db - a.snr_db)[0];
    const prevA = prevOf(row.t_offset_s);
    const A = {
      id: "A", row, ch, prim, t0: row.t_offset_s, dur: row.duration_s, lat: row.decode_latency_s,
      prevEnd: prevA.t_offset_s + prevA.duration_s, prevVia: HUD.feedName(prevA.receptions.slice().sort((a, b) => b.snr_db - a.snr_db)[0].feed_id),
      via: HUD.feedName(prim.feed_id), floor: floorOf(prim.feed_id), level: prim.rssi_dbfs, words: row.words, sparkAt,
      ctc: scn.ctc["r-nec"].trains.find((t) => t.train_id === row.train_id),
      route: day.routes.routes.find((r) => r.id === "r-nec"),
      feeds: scn.feeds,
    };
    const kc = day.transmissions.kerchunks.find((k) => k.id === "kc-040");
    const prevB = prevOf(kc.t_offset_s);
    const B = {
      id: "B", kc, ch, t0: kc.t_offset_s, dur: kc.duration_s,
      prevEnd: prevB.t_offset_s + prevB.duration_s, prevVia: HUD.feedName(prevB.receptions.slice().sort((a, b) => b.snr_db - a.snr_db)[0].feed_id),
      via: HUD.feedName(kc.feed_id), floor: floorOf(kc.feed_id), level: floorOf(kc.feed_id) + SQ_DB + 2, words: [], sparkAt,
    };
    return { A, B };
  }

  /* ---------------------------------------------------------------- per-t state */
  /* speech envelope from the transmission's own word timings (data/sim words[].t) */
  const speechAt = (L, ts) => {
    for (let i = 0; i < L.words.length; i++) {
      const w = L.words[i], end = i + 1 < L.words.length ? L.words[i + 1].t - 0.06 : w.t + 0.45;
      if (ts >= w.t && ts <= end) return 0.35 + 0.65 * hash(Math.round(ts * 30), i);
    }
    return 0;
  };
  /* M16 VU ballistics (~300 ms rise/fall) + peak hold 1.5 s then 20 dB/s, integrated from the squelch crossing */
  function meterAt(L, t, open) {
    if (!open) return { floor: L.floor };
    let bar = L.floor, peak = -99, peakT = 0;
    const end = Math.min(t, L.dur);
    for (let ts = 0; ts <= end + 1e-9; ts += 0.02) {
      const target = L.level + (L.words.length ? (speechAt(L, ts) - 0.55) * 8 : 0);
      bar += (target - bar) * (1 - Math.exp(-0.02 / 0.065));
      if (bar >= peak) { peak = bar; peakT = ts; } else if (ts - peakT > 1.5) peak = Math.max(bar, peak - 20 * 0.02);
    }
    return { db: bar, peak, floor: L.floor };
  }
  function waveSVG(L, el) {
    const w = 184, h = 16, env = [];
    const gain = Math.min(1, Math.max(0.45, (L.prim ? L.prim.snr_db : 15) / 30));
    for (let x = 0; x < w; x++) {
      const ts = el - (w - 1 - x) / 30;
      if (ts < 0) { env.push([0, 0]); continue; }
      const a = Math.max(0.06 + hash(x, 3) * 0.05, speechAt(L, ts) * gain);
      env.push([-a * (0.7 + 0.3 * hash(x, 5)), a]);
    }
    return '<svg class="wave-svg hud is-live" width="' + w + '" height="' + h + '">' + HUD.svg.waveform(env, w, h, { live: true }) + "</svg>";
  }

  /* lane A: a committed key-up */
  function stateA(L, t) {
    const REL = L.dur, SET = L.dur + SETTLE, abs = L.t0 + t;
    const s = { spark: L.sparkAt(abs, t >= 0 ? { id: L.row.id, t0: L.t0, end: L.t0 + L.dur } : null) };
    if (t < 0) Object.assign(s, { lastS: abs - L.prevEnd, via: L.prevVia });
    else if (t < COMMIT) Object.assign(s, { squelch: true, lastS: abs - L.prevEnd, via: L.prevVia });
    else if (t < SET) Object.assign(s, { tx: true, flash: !REDUCED && t < COMMIT + FLASH, elapsed: Math.min(t, REL), via: L.via });
    else Object.assign(s, { lastS: t - REL, via: L.via });
    s.meter = meterAt(L, Math.min(t, REL), t >= 0 && t < SET);
    return s;
  }
  /* lane B: squelch opens, closes before commit; diagonal holds 2 s; nothing else */
  function stateB(L, t) {
    const abs = L.t0 + t;
    const open = t >= 0 && t < L.dur;
    return { squelch: open, lastS: abs - L.prevEnd, via: L.prevVia, spark: L.sparkAt(abs), meter: meterAt(L, t, open),
      holdDiag: t >= L.dur && t < L.dur + KER_HOLD };
  }

  /* one tile at time t, including the motion the static CSS cannot show: flash interpolation,
     the AAR step-down during lock, and the frame retracting over t-settle */
  function tileHTML(L, t, opts = {}) {
    const s = L.id === "A" ? stateA(L, t) : stateB(L, t);
    let html = HUD.c.tile(L.ch, s, "standard");
    if (s.holdDiag) html = html.replace('data-g="idle" aria-hidden="true"></span>', 'data-g="squelch" aria-hidden="true"></span>');
    if (L.id === "A") {
      const REL = L.dur, SET = REL + SETTLE;
      if (s.tx) html = html.replace(/<\/div>$/, '<span class="tile__wave">' + waveSVG(L, Math.min(t, REL)) + "</span></div>");
      const still = opts.still || REDUCED;
      if (s.flash) {
        /* tx-hot held for 20 ms, then mixed to tx with ease-instrument over the remaining 100 ms */
        const k = t < COMMIT + FLASH_HOLD ? 100 : Math.round((1 - easeInstrument((t - COMMIT - FLASH_HOLD) / (FLASH - FLASH_HOLD))) * 100);
        const c = "color-mix(in srgb, var(--state-tx-hot) " + k + "%, var(--state-tx))";
        html = html.replace(/<span class="frame" data-frame="tx-flash"([^>]*)><\/span>/, '<span class="frame" data-frame="tx"$1 style="box-shadow: inset 0 0 0 2px ' + c + ', inset 0 0 0 4px var(--glow-tx-1), 0 0 0 2px var(--glow-tx-1), inset 0 0 0 7px var(--glow-tx-2), 0 0 0 5px var(--glow-tx-2)"></span>');
      }
      if (!still && t >= COMMIT && t < COMMIT + FLASH) {
        /* AAR steps 24 -> 13 px in place, steps(3) inside the flash; done before the timer is whole */
        const px = AAR_STEPS[Math.min(3, Math.floor((t - COMMIT) / (FLASH / 3)))];
        html = html.replace('class="tile__aar"', 'class="tile__aar" style="font-size:' + px + 'px"');
      }
      if (s.tx && !timerShownAt(t)) html = html.replace('class="tile__timer"', 'class="tile__timer" style="visibility:hidden"');
      if (!still && t >= SET && t < SET + SETTLE) {
        const op = (1 - easeInstrument((t - SET) / SETTLE)).toFixed(3);
        html = html.replace(/<\/div>$/, '<span class="frame mk-ghost" data-frame="tx" style="opacity:' + op + '"></span></div>');
      }
    }
    return html;
  }

  function phaseOf(L, t) {
    if (L.id === "A") {
      const REL = L.dur, SET = REL + SETTLE, ago = fmt.age(L.t0 - L.prevEnd);
      if (t < 0) return ["IDLE · EMBER", "CH54 last spoke " + ago.toLowerCase() + " ago. Ember underline and LAST readout; idle brackets."];
      if (t < COMMIT) return ["DETECT · SQUELCH OPEN", "Squelch line solid, audio opens, glyph diagonal, brackets brighten, meter wakes."];
      if (t < COMMIT + TICK) return REDUCED
        ? ["COMMIT · LOCK", "Reduced: flash skipped. Frame lands at tx; AAR 13 and timer appear at once."]
        : ["COMMIT · LOCK", t < COMMIT + FLASH
          ? "tx-hot → tx in 120 ms; AAR steps 24 → 13 inside it; timer slot held empty."
          : "AAR at 13. Timer appears whole at +370 ms, on the hero's clock, digit for digit."];
      if (t < COMMIT + CONNECT) return ["CONNECT", "Hero, row, slot, CTC block and map changed on one frame; the ping runs 1.2 s."];
      if (t < REL) return ["POPULATE", "Waveform runs from the audio; decode bar grows 8 px per second."];
      if (t < SET) return ["RELEASE HOLD", "Squelch closed. Nothing changes for 400 ms; a re-key continues this TX."];
      if (t < SET + SETTLE) return ["SETTLE", "Frame retracts over 400 ms; AAR home; ember underline; LAST 0S."];
      if (t < REL + L.lat + 0.5 && t < 60) return ["TRANSCRIPT FINAL", "Final text " + L.lat.toFixed(1) + " s after release; the CH tag turns from state-tx to ink."];
      if (t < REL + COOL1) return ["RECENT", "Ember in state-recent for 2 minutes after release."];
      if (t < REL + COOL2) return ["COOL 1 · +2 MIN", "Ember steps to recent-dim; LAST drops to ink-3 (one 400 ms step)."];
      return ["COOL 2 · +10 MIN", "Ember gone. The tile is idle; the LAST readout clears."];
    }
    if (t < 0) return ["IDLE · EMBER DIM", "CH54 last spoke " + fmt.age(L.t0 - L.prevEnd).toLowerCase() + " ago (recent-dim)."];
    if (t < L.dur) return ["DETECT · SQUELCH OPEN", "Identical to case A for the first " + Math.round(L.dur * 1000) + " ms."];
    if (t < COMMIT) return ["CLOSED BEFORE COMMIT", "Squelch closed at " + Math.round(L.dur * 1000) + " ms, under 250 ms. A kerchunk: no TX."];
    if (t < L.dur + KER_HOLD) return ["DIAGONAL HOLDS 2 S", "No flash, no row, no ping, no CTC, no ember. LAST stays " + fmt.age(L.t0 - L.prevEnd) + "."];
    return ["REVERT", "Glyph back to horizontal. Counted in Stats as a blip only."];
  }

  /* ---------------------------------------------------------------- connect panel (lane A) */
  function heroHTML(L, t) {
    const REL = L.dur;
    if (connectK(L, t))
      return '<span class="hero__big is-tx">' + fmt.aar(54) + '</span><span class="hero__stack"><span class="a">' + esc(L.ch.label) + '</span><span class="b">KEYED · VIA ' + esc(L.via) +
        '</span></span><span class="hero__big is-tx">' + fmt.dur(Math.min(t, REL)) + "</span>";
    const age = t < COMMIT ? L.t0 + t - L.prevEnd : t - REL;
    return '<span class="hero__text c-ink-2">LAST KEY-UP</span><span class="hero__big is-2">' + fmt.age(age) + '</span><span class="hero__text c-ink-2">AGO · CH54 · ' + esc(L.ch.label) + "</span>";
  }
  function logRow(L, t) {
    const REL = L.dur, fin = REL + L.lat;
    if (t < COMMIT) return { sig: "none", html: '<div class="txrow-empty">NO ROW UNTIL COMMIT</div>' }; /* the row exists from connectK = 1 on */
    const final = t >= fin;
    const r = L.row;
    const row = { id: r.id, clock_local: r.clock_local, aar_channel: 54, feed_id: r.feed_id, receptions: r.receptions, speaker_role: r.speaker_role, train_id: r.train_id,
      transcript: r.transcript, words: r.words, transcript_state: final ? "final" : "decoding", duration_s: Math.min(t, REL) };
    return { sig: final ? "final" : "dec", html: HUD.c.txRow(row, { live: !final, who: fmt.trainId(r.train_id), colW: 200 }) };
  }
  /* P6: ONE function and one clock for every connect surface (hero, log row, spectrum slot, CTC block,
     map). They all snap at commit (t-instant) and release together at settle; only the M14 ping ring
     animates, and it starts on the same frame. Full and reduced motion agree on this. */
  const connectK = (L, t) => (t >= COMMIT && t < L.dur + SETTLE ? 1 : 0);
  function specSVG(L, t, w = 200, h = 72) {
    /* three AAR slots around CH54, 818 Hz/px as on the 1920 wall would be too small; this is a 4x detail */
    const lo = HUD.chToMhz(53) - 0.0075, hi = HUD.chToMhz(55) + 0.0075;
    const x = (mhz) => ((mhz - lo) / (hi - lo)) * w, ref = -10, y = (db) => ((ref - db) / 60) * h;
    const open = t >= 0 && t < L.dur;
    const sq = L.floor + SQ_DB;
    let s = '<svg class="hud" width="' + w + '" height="' + h + '">';
    for (let i = 1; i < 6; i++) s += '<path class="s-hair k-grid" d="M0 ' + HUD.snap((h * i) / 6) + "H" + w + '"/>';
    const sx0 = x(HUD.chToMhz(54) - 0.0075), sx1 = x(HUD.chToMhz(54) + 0.0075), k = connectK(L, t);
    if (k > 0) s += '<g style="opacity:' + k.toFixed(3) + '"><rect class="f-wash-tx-plot" x="' + sx0 + '" y="0" width="' + (sx1 - sx0) + '" height="' + h + '"/><rect class="s-hair k-tx" x="' + (sx0 + 0.5) + '" y="0.5" width="' + (sx1 - sx0 - 1) + '" height="' + (h - 1) + '"/></g>';
    s += '<path class="s-hair ' + (open ? (L.id === "A" && t >= COMMIT ? "k-tx" : "k-idle") : "k-faint d-threshold") + '" d="M' + (sx0 + 3) + " " + HUD.snap(y(sq)) + "H" + (sx1 - 3) + '"/>';
    let d = "";
    for (let px = 0; px <= w; px += 2) {
      const mhz = lo + (px / w) * (hi - lo), dk = Math.abs(mhz - HUD.chToMhz(54)) * 1000;
      let v = L.floor + (hash(px, 9) - 0.5) * 2;
      if (open) {
        const lvl = L.words.length ? L.level + (speechAt(L, t) - 0.55) * 6 : L.level;
        v = Math.max(v, lvl + (dk < 4 ? -dk * 0.35 : dk < 7 ? -1.4 - (dk - 4) * 4 : -13.4 - (dk - 7) * 7));
      }
      d += (px ? "L" : "M") + px + " " + y(v).toFixed(1);
    }
    s += '<path class="s-emph k-line glow-1" d="' + d + '"/><path class="s-emph k-line" d="' + d + '"/>';
    s += '<text class="tx-num" x="' + ((sx0 + sx1) / 2) + '" y="' + (h + 14) + '" text-anchor="middle">54</text>';
    s += '<text class="tx-num" x="' + (x(HUD.chToMhz(53))) + '" y="' + (h + 14) + '" text-anchor="middle">53</text><text class="tx-num" x="' + x(HUD.chToMhz(55)) + '" y="' + (h + 14) + '" text-anchor="middle">55</text>';
    return s + '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '"/></svg>';
  }
  function ctcSVG(L, t) {
    /* the block MARC 433 occupies on r-nec at the keyed scenario moment (scenarios/keyed ctc.route_mi) */
    const pts = L.route.points, mi = L.ctc.route_mi;
    const i = pts.findIndex((p, k) => k < pts.length - 1 && p.route_mi <= mi && pts[k + 1].route_mi > mi);
    const a = pts[i], b = pts[i + 1], w = 200, y = 18.5, k = connectK(L, t);
    let s = '<svg class="hud" width="' + w + '" height="40">';
    s += '<path class="s-hair k-faint" d="M0 ' + y + "H" + w + '"/>';
    s += '<path class="s-active k-line" d="M12 ' + y + "H" + (w - 12) + '"/>';
    if (k > 0) s += '<g style="opacity:' + k.toFixed(3) + '"><path class="s-active k-tx glow-1" d="M12 ' + y + "H" + (w - 12) + '"/><path class="s-active k-tx" d="M12 ' + y + "H" + (w - 12) + '"/></g>';
    [[4.5, a, "start"], [w - 4.5, b, "end"]].forEach(([x, p, anc]) => {
      s += '<rect class="s-hair k-line" x="' + (x - 3.5) + '" y="' + (y - 3.5) + '" width="7" height="7" fill="var(--bg-void)"/>';
      s += '<text class="tx-lab" x="' + (anc === "start" ? 1 : w - 1) + '" y="36" text-anchor="' + anc + '">' + esc(p.name.split(" ")[0].toUpperCase()) + "</text>";
    });
    s += '<text class="tx-data' + (k ? " is-tx" : "") + '" x="' + w / 2 + '" y="9" text-anchor="middle" style="font-size:11px">' + esc(fmt.trainId(L.row.train_id)) + "</text>";
    return s + "</svg>";
  }

  /* M14 map ping on a small map inset: every feed that received sim-0648 rings once from commit,
     r 6 -> 40 px, state-tx 60% -> 0 over t-ping with ease-instrument; the primary feed's ring is 1.5 px.
     Feed and route geometry from data (scenarios/keyed feeds lat/lon, routes r-nec points). */
  function mapSVG(L, t, w = 176, h = 128) {
    const fs = L.feeds, pad = 14;
    const lat0 = Math.min(...fs.map((f) => f.lat)), lat1 = Math.max(...fs.map((f) => f.lat));
    const lon0 = Math.min(...fs.map((f) => f.lon)), lon1 = Math.max(...fs.map((f) => f.lon));
    const kx = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
    const sc = Math.min((w - 2 * pad) / ((lon1 - lon0) * kx), (h - 2 * pad) / (lat1 - lat0));
    const ox = (w - (lon1 - lon0) * kx * sc) / 2, oy = (h - (lat1 - lat0) * sc) / 2;
    const P = (lat, lon) => [ox + (lon - lon0) * kx * sc, h - oy - (lat - lat0) * sc];
    let s = '<svg class="hud" width="' + w + '" height="' + h + '" style="overflow:hidden">';
    s += '<path class="s-hair k-faint" d="' + L.route.points.map((p, i) => { const [x, y] = P(p.lat, p.lon); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + '"/>';
    /* the talking train on its route position (routes route_mi -> lat/lon by interpolation) */
    const pts = L.route.points, mi = L.ctc.route_mi;
    const i = pts.findIndex((p, k) => k < pts.length - 1 && p.route_mi <= mi && pts[k + 1].route_mi > mi);
    const u = (mi - pts[i].route_mi) / (pts[i + 1].route_mi - pts[i].route_mi);
    const [tx, ty] = P(pts[i].lat + u * (pts[i + 1].lat - pts[i].lat), pts[i].lon + u * (pts[i + 1].lon - pts[i].lon));
    const k = connectK(L, t);
    s += '<circle class="' + (k ? "f-tx" : "f-line") + '" cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="2.5"/>';
    const rx = Object.fromEntries(L.row.receptions.map((r) => [r.feed_id, r]));
    const dt = t - COMMIT;
    fs.forEach((f) => {
      const [x, y] = P(f.lat, f.lon), X = Math.round(x), Y = Math.round(y);
      const heard = !!rx[f.id], primary = f.id === L.prim.feed_id;
      if (heard && !REDUCED && dt >= 0 && dt < PING) {
        const e = easeInstrument(dt / PING);
        s += '<circle class="ping' + (primary ? " is-primary" : "") + '" cx="' + X + '" cy="' + Y + '" r="' + (6 + 34 * e).toFixed(1) + '" style="stroke-opacity:' + (0.6 * (1 - e)).toFixed(3) + '"/>';
      }
      s += '<rect class="s-hair ' + (heard ? "k-line" : "k-faint") + '" x="' + (X - 2.5) + '" y="' + (Y - 2.5) + '" width="5" height="5" fill="var(--bg-void)"/>';
      const left = x > w * 0.55; /* east-side feeds label to the west, so BAY-04 and BWI-03 never share a line */
      s += '<text class="tx-num" x="' + (X + (left ? -7 : 7)) + '" y="' + (Y + 4) + '" text-anchor="' + (left ? "end" : "start") + '">' + esc(f.short) + "</text>";
    });
    return s + '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '"/></svg>';
  }

  /* lock: collision guard. The timer is shown only whole (review r2 #2), so if it would ever sit
     closer than TIMER_GAP px to the AAR's current width it is hidden, never clipped to a partial
     string. offset* are layout px, so the same rule holds inside the 2x tile (16 px on screen). */
  function guardTimers(root) {
    root.querySelectorAll(".tile[data-tx]").forEach((tile) => {
      const aar = tile.querySelector(".tile__aar"), tm = tile.querySelector(".tile__timer");
      if (!aar || !tm || !tm.offsetWidth) return;
      const need = aar.offsetLeft + aar.offsetWidth + TIMER_GAP - tm.offsetLeft;
      if (need > 0) tm.style.visibility = "hidden";
    });
  }

  /* ---------------------------------------------------------------- piecewise timeline */
  function timeline(pieces, w) {
    /* pieces: [{a, b, w, ticks:[{t, major, label}]}]; 24 px breaks between pieces */
    let x = 0;
    pieces.forEach((p, i) => { p.x = x; x += p.w + (i < pieces.length - 1 ? 24 : 0); });
    const tx = (t) => {
      for (const p of pieces) if (t >= p.a && t <= p.b) return p.x + ((t - p.a) / (p.b - p.a)) * p.w;
      for (let i = 0; i < pieces.length - 1; i++) if (t > pieces[i].b && t < pieces[i + 1].a) return pieces[i].x + pieces[i].w + 12;
      return t < pieces[0].a ? 0 : w;
    };
    return { tx, pieces };
  }
  function timelineSVG(TL, bands, events, w) {
    let s = '<svg class="hud" width="' + w + '" height="56">';
    const yb = 22, yr = 34;
    TL.pieces.forEach((p, i) => {
      s += '<path class="s-hair k-faint" d="M' + p.x + " " + HUD.snap(yr) + "H" + (p.x + p.w) + '"/>';
      p.ticks.forEach((tk) => {
        const X = HUD.snap(TL.tx(tk.t));
        s += '<path class="s-hair ' + (tk.major ? "k-line" : "k-faint") + '" d="M' + X + " " + yr + "V" + (yr + (tk.major ? 8 : 4)) + '"/>';
        if (tk.label) s += '<text class="num" x="' + X + '" y="' + (yr + 20) + '" text-anchor="middle">' + esc(tk.label) + "</text>";
      });
      if (i < TL.pieces.length - 1) s += '<text class="brk" x="' + (p.x + p.w + 12) + '" y="' + (yr + 4) + '" text-anchor="middle">//</text>';
    });
    /* state band: hue = state, plus stroke weight */
    bands.forEach((b) => {
      TL.pieces.forEach((p) => {
        const a = Math.max(b.a, p.a), c = Math.min(b.b, p.b);
        if (c <= a) return;
        s += '<path class="' + b.cls + '" d="M' + TL.tx(a) + " " + yb + "H" + TL.tx(c) + '"/>';
      });
    });
    events.forEach((e) => {
      const X = HUD.snap(TL.tx(e.t));
      s += '<path class="s-hair k-line" d="M' + X + " " + (yb - 6) + "V" + (yb + 4) + '"/>';
      s += '<text class="lab" x="' + (X + (e.anchor === "end" ? -4 : 4)) + '" y="' + (yb - 8) + '" text-anchor="' + (e.anchor || "start") + '">' + esc(e.label) + "</text>";
    });
    s += '<g class="mk-playhead"><path class="s-active k-ink" d="M0 4V' + (yr + 10) + '"/><path d="M-5 0H5L0 5Z" fill="var(--ink)"/></g>';
    return s + "</svg>";
  }

  /* ---------------------------------------------------------------- page */
  async function main() {
    let day, scn;
    try {
      day = await loadTwin("data/sim/day.js", () => window.SDRVIZ_DAY);
      scn = await loadTwin("data/sim/scenarios/keyed.js", () => window.SDRVIZ_SCENARIOS && window.SDRVIZ_SCENARIOS.keyed);
    } catch (err) {
      return HUD.fail(err, HUD.shell("#stage", { screen: "live-ops", chips: [] }));
    }
    const { A, B } = lanes(day, scn);
    const content = HUD.shell("#stage", { screen: "live-ops", scope: ["STUDY", "KEY-UP §7.3"], clock: A.row.clock_local, chips: [], audio: "on",
      status: { html: '<span class="mk-status"></span>' } });
    const W = 1856, REL = A.dur, SET = REL + SETTLE;

    const tlA = timeline([
      { a: -0.5, b: 1.0, w: 552, ticks: [] }, { a: 1.0, b: REL - 0.2, w: 360, ticks: [] }, { a: REL - 0.2, b: SET + 0.6, w: 448, ticks: [] },
      { a: REL + COOL1 - 0.5, b: REL + COOL1 + 0.5, w: 200, ticks: [] }, { a: REL + COOL2 - 0.5, b: REL + COOL2 + 0.5, w: 200, ticks: [] },
    ], W);
    const P = tlA.pieces;
    for (let k = -0.5; k <= 1.0001; k += 0.05) P[0].ticks.push({ t: k, major: Math.abs((k * 4) - Math.round(k * 4)) < 1e-6, label: Math.abs((k * 4) - Math.round(k * 4)) < 1e-6 ? Math.round(k * 1000) + " MS" : "" });
    for (let k = 2; k <= Math.floor(REL - 0.2); k++) P[1].ticks.push({ t: k, major: true, label: k + " S" });
    for (let k = REL - 0.2; k <= SET + 0.6001; k += 0.1) P[2].ticks.push({ t: k, major: false });
    P[2].ticks.push({ t: REL, major: true, label: fmt.dur(REL) }, { t: SET, major: true, label: "+400 MS" });
    P[3].ticks.push({ t: REL + COOL1, major: true, label: "+2 MIN" });
    P[4].ticks.push({ t: REL + COOL2, major: true, label: "+10 MIN" });
    const bandsA = [
      { a: -9, b: 0, cls: "s-active k-recent" }, { a: 0, b: COMMIT, cls: "s-active k-idle" }, { a: COMMIT, b: COMMIT + FLASH, cls: REDUCED ? "s-active k-tx" : "s-active k-tx-hot" },
      { a: COMMIT + FLASH, b: SET, cls: "s-active k-tx" }, { a: SET, b: REL + COOL1, cls: "s-active k-recent" },
      { a: REL + COOL1, b: REL + COOL2, cls: "s-active k-recent" , dim: true }, { a: REL + COOL2, b: 1e9, cls: "s-hair k-idle-dim" },
    ];
    bandsA[5].cls = "s-active k-faint";
    const evA = [
      { t: 0, label: "DETECT" }, { t: COMMIT, label: "COMMIT" }, { t: COMMIT + TICK, label: "LOCK" }, { t: COMMIT + CONNECT, label: "CONNECT" },
      { t: REL, label: "RELEASE", anchor: "end" }, { t: SET, label: "SETTLE" }, { t: REL + L_lat(A), label: "FINAL" },
      { t: REL + COOL1, label: "COOL 1" }, { t: REL + COOL2, label: "COOL 2" },
    ];
    const tlB = timeline([{ a: -0.5, b: 0.6, w: 916, ticks: [] }, { a: 0.6, b: 2.6, w: 916, ticks: [] }], W);
    for (let k = -0.5; k <= 0.6001; k += 0.05) tlB.pieces[0].ticks.push({ t: k, major: Math.abs(k * 10 - Math.round(k * 10)) < 1e-6, label: Math.abs(k * 10 - Math.round(k * 10)) < 1e-6 ? Math.round(k * 1000) + " MS" : "" });
    for (let k = 0.8; k <= 2.6001; k += 0.2) tlB.pieces[1].ticks.push({ t: k, major: true, label: k.toFixed(1) + " S" });
    const bandsB = [
      { a: -9, b: 0, cls: "s-active k-faint" }, { a: 0, b: B.dur, cls: "s-active k-idle" }, { a: B.dur, b: B.dur + KER_HOLD, cls: "s-hair k-idle" }, { a: B.dur + KER_HOLD, b: 99, cls: "s-hair k-idle-dim" },
    ];
    const evB = [{ t: 0, label: "DETECT" }, { t: B.dur, label: "CLOSE" }, { t: COMMIT, label: "COMMIT WINDOW · NO TX" }, { t: B.dur + KER_HOLD, label: "REVERT", anchor: "end" }];

    const meta = (L) => L.id === "A"
      ? esc(L.row.id.toUpperCase()) + " · CH54 5454 · " + esc(fmt.trainId(L.row.train_id)) + " · VIA " + esc(L.via) + " · " + fmt.dur(L.dur) + " · KEYED " + esc(fmt.clock(L.t0, "")) + " · FINAL +" + L.lat.toFixed(1) + " S"
      : esc(L.kc.id.toUpperCase()) + " · CH54 5454 · VIA " + esc(L.via) + " · " + Math.round(L.dur * 1000) + " MS · " + esc(L.kc.clock_local) + " EST · NO TRANSMISSION";
    /* COMMIT · FLASH at +0.270 s: the last frame of the tx-hot hold (+0.250 would be the same still);
       the timer slot is visibly empty here, and first shows (whole) at +0.370 s */
    const framesA = [[-0.1, "IDLE"], [0, "DETECT"], [COMMIT + FLASH_HOLD, REDUCED ? "COMMIT" : "COMMIT · FLASH"], [COMMIT + TICK, "LOCK"], [7.4, "POPULATE"], [REL + 0.2, "HOLD"], [SET + 0.12, "SETTLE"], [REL + COOL1, "COOL 1"], [REL + COOL2, "COOL 2"]];
    const framesB = [[-0.1, "IDLE"], [0, "DETECT"], [B.dur, "CLOSE"], [COMMIT, "NO COMMIT"], [B.dur + KER_HOLD, "REVERT"]];
    const tLabel = (t) => (t >= 60 ? "+" + fmt.age(t - REL) : (t < 0 ? "−" : "+") + Math.abs(t).toFixed(3) + " S");
    const strip = (L, frames, cls) => '<div class="mk-strip ' + cls + '">' + frames.map(([t, name]) =>
      '<div class="mk-frame"><span class="cap"><span class="label">' + name + '</span><span class="mono">' + tLabel(t) + "</span></span>" + tileHTML(L, t) + "</div>").join("") + "</div>";

    content.innerHTML =
      '<div class="mk-box mk-title" style="left:0;top:0;width:1200px;height:32px"><span class="t-section">KEY-UP CHOREOGRAPHY</span><span class="t-micro">MOTION STUDY · BRIEF §7.3 · SPEC §6.3 · ONE TILE, TWO CASES · TILE SHOWN 2× AND 1×</span></div>' +
      '<div class="mk-box mk-controls" style="right:0;top:0;width:600px;height:32px">' + HUD.c.btn("PAUSE", { sm: true }).replace("<button", '<button id="mk-play"') + HUD.c.btn("RESTART", { sm: true }).replace("<button", '<button id="mk-restart"') +
        HUD.c.chip("1×", "filter", { button: true, pressed: true, cls: "mk-speed" }).replace("<button", '<button data-speed="1"') + HUD.c.chip("0.25×", "filter", { button: true, pressed: false, cls: "mk-speed" }).replace("<button", '<button data-speed="0.25"') + "</div>" +
      /* lane A */
      '<div class="mk-box mk-lanehead" style="left:0;top:48px;width:1856px;height:16px"><span class="t-panel">A · COMMITTED KEY-UP</span><span class="mono">' + meta(A) + "</span></div>" +
      '<div class="mk-box mk-zoom" id="mkA2" style="left:0;top:80px"></div>' +
      '<div class="mk-box" id="mkA1" style="left:424px;top:80px;width:200px;height:112px"></div>' +
      '<div class="mk-box mk-readout" id="mkAr" style="left:424px;top:208px;width:200px;height:96px"></div>' +
      '<div class="mk-box" style="left:648px;top:72px;width:1208px;height:16px"><span class="mk-cap">CONNECT · ONE CLOCK (P6) · HERO, LOG ROW, SPECTRUM SLOT, CTC BLOCK AND MAP CHANGE ON THE COMMIT FRAME (250 MS) · ONLY THE PING ANIMATES</span></div>' +
      '<div class="mk-box hero mk-hero" id="mkAh" style="left:648px;top:88px;width:1208px"></div>' +
      '<div class="mk-box mk-cap" style="left:648px;top:168px">TRANSCRIPT ROW</div><div class="mk-box txlog mk-log" id="mkAl" style="left:648px;top:184px"></div>' +
      '<div class="mk-box mk-cap" style="left:1232px;top:168px">MAP PING · M14 · 3 FEEDS</div><div class="mk-box mk-svgcell" id="mkAm" style="left:1232px;top:184px;width:176px;height:128px"></div>' +
      '<div class="mk-box mk-cap" style="left:1432px;top:168px">SPECTRUM SLOT · CH54 · 4× DETAIL</div><div class="mk-box mk-svgcell" id="mkAs" style="left:1432px;top:184px;width:200px;height:88px"></div>' +
      '<div class="mk-box mk-cap" style="left:1656px;top:168px">CTC BLOCK · R-NEC</div><div class="mk-box mk-svgcell" id="mkAc" style="left:1656px;top:184px;width:200px;height:40px"></div>' +
      '<div class="mk-box mk-cap" style="left:1656px;top:240px;width:200px;white-space:normal;line-height:1.4">PRIMARY FEED RING 1.5 PX · HISTORY CHIP FIRES ON THE SAME FRAME (HISTORY)</div>' +
      '<div class="mk-box mk-tl" id="mkAt" style="left:0;top:320px;width:1856px;height:56px">' + timelineSVG(tlA, bandsA, evA, W) + "</div>" +
      '<div class="mk-box" style="left:0;top:392px;width:1856px;height:136px">' + strip(A, framesA, "") + "</div>" +
      /* lane B */
      '<div class="mk-box mk-lanehead" style="left:0;top:560px;width:1856px;height:16px"><span class="t-panel">B · KERCHUNK · NEVER COMMITS</span><span class="mono">' + meta(B) + "</span></div>" +
      '<div class="mk-box mk-zoom" id="mkB2" style="left:0;top:592px"></div>' +
      '<div class="mk-box" id="mkB1" style="left:424px;top:592px;width:200px;height:112px"></div>' +
      '<div class="mk-box mk-readout" id="mkBr" style="left:424px;top:720px;width:200px;height:96px"></div>' +
      '<div class="mk-box" style="left:648px;top:592px;width:1072px;height:136px">' + strip(B, framesB, "is-8") + "</div>" +
      '<div class="mk-box mk-cap" style="left:1736px;top:584px">SPECTRUM SLOT</div><div class="mk-box mk-svgcell" id="mkBs" style="left:1736px;top:600px;width:120px;height:88px"></div>' +
      '<div class="mk-box mk-notes" style="left:648px;top:752px;width:1208px"><span>No commit, so nothing downstream: no tx-hot flash · no timer · no transcript row · no map ping · no CTC block · no hero change · no ember · LAST readout unchanged</span></div>' +
      '<div class="mk-box mk-tl" id="mkBt" style="left:0;top:832px;width:1856px;height:56px">' + timelineSVG(tlB, bandsB, evB, W) + "</div>";
    HUD.fitEmbers(content);

    /* ---------------------------------------------------------------- playback */
    const $ = (id) => document.getElementById(id);
    const qT = HUD.params.t != null ? Number(HUD.params.t) : null;
    const qTB = HUD.params.tb != null ? Number(HUD.params.tb) : qT;
    let speed = Number(HUD.params.speed || 1), playing = qT == null, tau = 0, last = performance.now();
    const seqA = [[-0.5, SET + 0.6], [REL + COOL1 - 0.5, REL + COOL1 + 0.5], [REL + COOL2 - 0.5, REL + COOL2 + 0.5]];
    const pauseA = 1.2, pauseB = 1.0;
    const tAt = (seq, pause, tau) => {
      const total = seq.reduce((s, [a, b]) => s + (b - a), 0) + pause;
      let r = tau % total;
      for (const [a, b] of seq) { if (r <= b - a) return a + r; r -= b - a; }
      return seq[seq.length - 1][1];
    };
    const seqB = [[-0.5, 2.6]];
    let rowSig = "";
    const paint = (tA, tB) => {
      $("mkA2").innerHTML = tileHTML(A, tA); $("mkA1").innerHTML = tileHTML(A, tA);
      $("mkB2").innerHTML = tileHTML(B, tB); $("mkB1").innerHTML = tileHTML(B, tB);
      HUD.fitEmbers(content);
      const [pa, wa] = phaseOf(A, tA), [pb, wb] = phaseOf(B, tB);
      $("mkAr").innerHTML = '<span class="t">t ' + tLabel(tA) + '</span><span class="ph">' + pa + '</span><span class="what">' + esc(wa) + "</span>";
      $("mkBr").innerHTML = '<span class="t">t ' + tLabel(tB) + '</span><span class="ph">' + pb + '</span><span class="what">' + esc(wb) + "</span>";
      $("mkAh").innerHTML = heroHTML(A, tA);
      const lr = logRow(A, tA);
      if (lr.sig === "dec" || lr.sig !== rowSig) {
        $("mkAl").innerHTML = lr.html;
        if (lr.sig === "final" && rowSig !== "final") { const r = $("mkAl").querySelector(".txrow"); if (r) HUD.reveal(r, 0); }
        rowSig = lr.sig;
      }
      $("mkAs").innerHTML = specSVG(A, tA); $("mkAc").innerHTML = ctcSVG(A, tA); $("mkAm").innerHTML = mapSVG(A, tA);
      guardTimers(content); $("mkBs").innerHTML = specSVG(B, tB, 120, 72);
      document.querySelector("#mkAt .mk-playhead").setAttribute("transform", "translate(" + tlA.tx(tA) + " 0)");
      document.querySelector("#mkBt .mk-playhead").setAttribute("transform", "translate(" + tlB.tx(Math.min(2.6, tB)) + " 0)");
      const st = document.querySelector(".mk-status");
      if (st) st.textContent = "MOTION STUDY · A t " + tLabel(tA) + " · B t " + tLabel(tB) + " · " + (playing ? "PLAYING " + speed + "×" : "PAUSED") + (REDUCED ? " · REDUCED MOTION" : "");
    };
    const frame = (now) => {
      if (playing) tau += ((now - last) / 1000) * speed;
      last = now;
      paint(qT != null && !playing ? qT : tAt(seqA, pauseA, tau), qTB != null && !playing ? Math.min(2.6, qTB) : tAt(seqB, pauseB, tau));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    $("mk-play").textContent = playing ? "PAUSE" : "PLAY";
    $("mk-play").addEventListener("click", () => { playing = !playing; $("mk-play").textContent = playing ? "PAUSE" : "PLAY"; if (playing && qT != null) tau = 0; });
    $("mk-restart").addEventListener("click", () => { tau = 0; rowSig = ""; playing = true; $("mk-play").textContent = "PAUSE"; });
    document.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      speed = Number(b.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    }));
    document.addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); $("mk-play").click(); } });
  }
  function L_lat(L) { return L.lat; }

  main();
})();

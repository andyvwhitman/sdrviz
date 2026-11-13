/* ==========================================================================
   sdrviz · WLT-1 · Stats / analytics (brief §9.3) · page script
   Owner: history-stats screen designer. Uses window.HUD (_shared/hud.js).
   Every figure is read from data/sim/: TODAY = scenario.stats.today (00:00 → the
   scenario moment); YESTERDAY = data/sim/stats.json "day" (the sim day repeats).

   URL: stats.html?state=listening|keyed|fault|fault-acked[&range=today|yesterday][&gray=1][&build=0]
   ========================================================================== */
(function () {
  "use strict";
  const { fmt, esc, c: C, svg: S } = HUD;
  const h5 = HUD.snap;

  const loadScript = (src) => new Promise((ok) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(true); s.onerror = () => ok(false);
    document.head.appendChild(s);
  });
  const STATES = ["listening", "keyed", "fault", "fault-acked"];
  const stateName = STATES.includes(HUD.state) ? HUD.state : "listening";
  const rangeKey = HUD.params.range === "yesterday" ? "yesterday" : "today";
  if (HUD.params.gray === "1") document.documentElement.dataset.gray = "";

  /* shell chips/status from the scenario (same rules as History) */
  function shellOpts(scn, screen, scope) {
    const faults = scn.faults || [];
    const unacked = faults.filter((f) => !f.acked);
    /* shared header chips (with the KEYED chip, brief §9.2) and status line (hud.js) */
    const chips = HUD.headerChips(scn, { txChip: true });
    const sys = scn.system;
    const status = HUD.statusFrom(scn, "RECORDING · DISK " + Math.round(sys.disk.pct) + "% · DECODER QUEUE " + sys.decoder.queue + " · MEDIAN " + sys.decoder.median_latency_s.toFixed(1) + " S");
    return { screen, scope, clock: scn.clock, zone: scn.tz.name, chips, audio: "on", status };
  }

  const svgOpen = (w, h) => '<svg class="hud" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">';
  const line = (x1, y1, x2, y2, cls) => '<path class="' + cls + '" d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '"/>';
  const text = (x, y, s, cls, anchor = "start") => '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(s) + "</text>";
  const pad2 = (n) => String(n).padStart(2, "0");
  /* one number, one format (P3, brief §4): every airtime total is HH:MM:SS from HUD.fmt.total,
     which rounds the total first (gen_sim.py total_label matches). Clip durations stay MM:SS.s. */
  const total = HUD.fmt.total;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "S");
  /* 3-bin (30 min) centred running mean; the ends average what exists */
  const mean3 = (a) => a.map((_, i) => { let v = 0, n = 0; for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < a.length) { v += a[k]; n++; } return v / n; });
  const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] || 0; };

  async function main() {
    await Promise.all([
      loadScript(HUD.ROOT + "data/sim/scenarios/" + stateName + ".js"),
      rangeKey === "yesterday" ? loadScript(HUD.ROOT + "data/sim/day.js") : Promise.resolve(true),
    ]);
    const scn = (window.SDRVIZ_SCENARIOS || {})[stateName];
    if (!scn) throw new Error("DATA NOT FOUND · data/sim/scenarios/" + stateName + ".js");
    const R = rangeKey === "yesterday" ? window.SDRVIZ_DAY.stats.day : scn.stats.today;
    const isToday = rangeKey === "today";
    const nowT = isToday ? scn.t_offset_s : null;
    const endT = isToday ? R.end_t : 86400;
    const rangeLabel = isToday ? "TODAY" : "YESTERDAY";
    const rangeSpan = "00:00–" + (isToday ? R.end.slice(0, 5) : "24:00") + " " + scn.tz.name;

    const content = HUD.shell("#stage", shellOpts(scn, "stats", ["RANGE", rangeLabel]));
    content.innerHTML =
      '<section class="st-box st-hero hero" id="st-hero"></section>' +
      '<section class="st-box st-ridge panel br" id="st-ridge" aria-label="Ridgeline"></section>' +
      '<section class="st-box st-heat panel br" id="st-heat" aria-label="Channel by hour heatmap"></section>' +
      '<section class="st-box st-talk panel br" id="st-talk" aria-label="Top talkers"></section>' +
      '<section class="st-box st-det panel br" id="st-det" aria-label="Detector board"></section>' +
      '<section class="st-box st-dec panel br" id="st-dec" aria-label="Decoder quality and feed uptime"></section>';

    /* ridges: up to 16 channels with traffic, by airtime; the rest summed as OTHER (n) */
    const chans = Object.values(R.channels).filter((c) => c.airtime_s > 0).sort((a, b) => b.airtime_s - a.airtime_s);
    const top = chans.slice(0, 16), rest = chans.slice(16);
    const nb = Math.ceil(endT / 600);
    const sumOf = (list, k, n) => Array.from({ length: n }, (_, i) => list.reduce((a, c) => a + (c[k][i] || 0), 0));
    const series = top.map((c) => ({ ch: c, aar: "CH" + pad2(c.aar_channel), label: c.label, bins: c.airtime_per_10min.slice(0, nb), hours: c.airtime_per_hour, total: c.airtime_s, totalLabel: total(c.airtime_s), share: c.airtime_share }));
    if (rest.length) {
      const tot = rest.reduce((a, c) => a + c.airtime_s, 0);
      series.push({ other: true, aar: "OTHER", label: "(" + rest.length + ")", bins: sumOf(rest, "airtime_per_10min", nb), hours: sumOf(rest, "airtime_per_hour", 24), total: tot, totalLabel: total(tot), share: rest.reduce((a, c) => a + c.airtime_share, 0) });
    }
    /* the ALL CHANNELS ridge: the same 10-min data, summed over every channel */
    const allBins = sumOf(chans, "airtime_per_10min", nb);
    const live = new Set((scn.active_transmissions || []).map((a) => a.frequency_id));

    /* shared vertical rhythm: ridge baselines and heatmap rows line up across the two panels.
       Layout (svg y): dimension row · ALL ridge (3 pitches) · 2-pitch gap · one pitch per ridge · hour ruler */
    const N = series.length;
    const BODY_H = (id) => Math.round(document.getElementById(id).getBoundingClientRect().height) - 56; /* panel pad 28 + head 28 */
    const plotTop = 20, rulerRoom = 32;
    const Hh = BODY_H("st-ridge");
    const pitch = Math.floor((Hh - plotTop - rulerRoom) / (N + 4));
    const amp = Math.round(pitch * 1.5), ampAll = pitch * 3;
    const allBase = plotTop + ampAll;
    const base = (i) => allBase + (2 + i) * pitch;

    renderHero();
    renderRidge();
    renderHeat();
    renderTalkers();
    renderDetectors();
    renderDecoder();
    HUD.buildOn(document);
    document.documentElement.dataset.ready = "1";

    /* ============================================================ hero */
    function renderHero() {
      const b = R.busiest;
      document.getElementById("st-hero").innerHTML =
        '<span class="hero__stack"><span class="a">AIRTIME ' + rangeLabel + '</span><span class="b">' + esc(rangeSpan) + "</span></span>" +
        '<span class="hero__big">' + esc(R.totals.airtime_label) + "</span>" +
        '<span class="hero__stack"><span class="a">' + esc(b.aar + " · " + b.label + " · " + b.share_label) + '</span><span class="b">BUSIEST CHANNEL · SHARE OF AIRTIME</span></span>' +
        '<span class="st-rule"></span>' +
        '<span class="hero__big is-sm">' + R.totals.count + "</span>" +
        '<span class="hero__stack"><span class="a">TRANSMISSIONS</span><span class="b">' + R.totals.blips + " BLIPS · KERCHUNKS, NOT COUNTED</span></span>" +
        '<span class="st-rule is-1920"></span>' +
        '<span class="hero__big is-sm is-1920">' + chans.length + "</span>" +
        '<span class="hero__stack is-1920"><span class="a">CHANNELS HEARD</span><span class="b">OF ' + Object.keys(R.channels).length + " MONITORED</span></span>" +
        '<span class="hero__aside">' + C.tabs([{ id: "today", name: "TODAY" }, { id: "yesterday", name: "YESTERDAY" }, { id: "7d", name: "7 D" }, { id: "custom", name: "CUSTOM" }], rangeKey) +
          C.chip("USE HISTORY RANGE", "nominal", { button: true }) + "</span>";
    }

    /* ============================================================ ridgeline (M20)
       Hidden-line plot: each ridge is a 30-min running mean of its 10-min bins, drawn as an ink
       hairline over a bg-void fill so lower ridges occlude upper ones. Channel ridges share one
       scale, clipped at the 95th percentile of all their bins, so no spike climbs more than one
       ridge up. The ALL CHANNELS ridge on top is 3 pitches tall on its own scale and carries the
       AM / PM peak dimensions (M12). Right-hand totals are the unsmoothed sim figures. */
    function renderRidge() {
      const el = document.getElementById("st-ridge");
      const peak = peakHours();
      el.innerHTML = '<div class="panel__head"><span class="t-panel">RHYTHM · AIRTIME PER 10 MIN · 30 MIN MEAN</span><span class="t-micro">ALL + ' +
        series.length + " RIDGES · " + top.length + " CHANNELS BY AIRTIME" + (rest.length ? " + OTHER" : "") +
        (HUD.size === 1440 ? " · " + chans.length + " OF " + Object.keys(R.channels).length + " HEARD" : " · ON AND OFF BANK") + "</span></div>";
      const W = Math.round(el.getBoundingClientRect().width) - 32;
      const x0 = 132, x1 = W - 100;
      const X = (t) => x0 + (t / 86400) * (x1 - x0);
      const xe = Math.min(X(endT), x1);
      const smooth = series.map((sr) => mean3(sr.bins));
      const cap = Math.max(1, quantile(smooth.flat().filter((v) => v > 0), 0.95)); /* P95 of bins with traffic */
      const allSm = mean3(allBins);
      const allMax = Math.max(1, ...allSm);
      const ridgePath = (vals, y, a, top) => {
        let d = "M" + x0 + " " + y + "L" + X(0).toFixed(1) + " " + y;
        vals.forEach((v, k) => { d += "L" + Math.min(X(k * 600 + 300), xe).toFixed(1) + " " + (y - (a * Math.min(v, top)) / top).toFixed(1); });
        return d + "L" + xe.toFixed(1) + " " + y;
      };
      let s = svgOpen(W, Hh);
      s += text(W, allBase - ampAll - 6, "HH:MM:SS  SHARE", "tx-lab", "end");
      /* hourly graticule behind the ridges; the void fills occlude it */
      for (let h = 0; h <= 24; h++) s += line(h5(X(h * 3600)), plotTop, h5(X(h * 3600)), base(N - 1), "s-hair " + (h % 6 === 0 ? "k-faint" : "k-grid"));

      /* ALL CHANNELS ridge */
      const dA = ridgePath(allSm, allBase, ampAll, allMax);
      /* it carries the room-distance read: void fill to occlude the graticule, a flat 12 % line wash
         over it (plot-slot wash, §10.3, no gradient), and the trace at stroke-active 2 px ink */
      s += '<path class="st-ridge is-all" d="' + dA + 'Z" style="stroke:none"/><path class="st-all-wash" d="' + dA + 'Z"/><path class="st-ridge is-all" d="' + dA + '" style="fill:none"/>';
      if (isToday && xe < x1) s += line(xe.toFixed(1), h5(allBase), x1, h5(allBase), "s-hair k-grid");
      s += '<text x="0" y="' + (allBase + 4) + '"><tspan class="st-ch">ALL</tspan><tspan class="st-lab" dx="8">CHANNELS</tspan></text>';
      s += text(W, allBase + 4, R.totals.airtime_label + "  100%", "st-val", "end");
      /* the shared channel scale, stated once: one pitch and a half = P95 of busy 10-min bins */
      s += text(0, allBase - 44, "RIDGE SCALE · P95", "tx-lab", "start") + text(0, allBase - 31, Math.round(cap) + " S / 10 MIN", "st-dim", "start");
      /* key for the capped mark, drawn exactly as it is on the ridges: a dashed flat between 1 px end ticks */
      s += text(0, allBase - 17, "CAPPED", "st-dim", "start") + capMark(52, 82, allBase - 21);

      /* channel ridges */
      series.forEach((sr, i) => {
        const y = base(i);
        const d = ridgePath(smooth[i], y, amp, cap);
        s += '<path class="st-ridge' + (sr.other ? " is-other" : "") + '" d="' + d + 'Z" style="stroke:none"/>';
        s += '<path class="st-ridge' + (sr.other ? " is-other" : "") + '" d="' + d + '" style="fill:none"/>';
        /* clipping made visible: wherever this ridge sits at the P95 cap, the flat is off-scale, not a
           constant value. Each run of capped bins is redrawn dash-threshold between 1 px end ticks. */
        capRuns(smooth[i], cap).forEach(([k0, k1]) => {
          const xa = Math.min(X(k0 * 600 + 300), xe), xb = Math.min(X(k1 * 600 + 300), xe);
          s += capMark(Math.round(xa), Math.max(Math.round(xb), Math.round(xa) + 4), Math.round(y - amp));
        });
        if (isToday && xe < x1) s += line(xe.toFixed(1), h5(y), x1, h5(y), "s-hair k-grid");
        s += '<text x="0" y="' + (y + 4) + '"><tspan class="st-ch">' + esc(sr.aar) + '</tspan><tspan class="st-lab" dx="8">' + esc(sr.label) + "</tspan></text>";
        s += text(W, y + 4, sr.totalLabel + "  " + Math.round(sr.share * 100) + "%", "st-val", "end");
        if (sr.ch && live.has(sr.ch.frequency_id) && nowT != null) s += line(h5(X(nowT)) + 3, y - 10, h5(X(nowT)) + 3, y + 1, "st-livetick");
      });
      /* hour ruler (M2) */
      const ry = base(N - 1) + 8;
      s += line(x0, h5(ry), x1, h5(ry), "s-hair k-faint");
      for (let h = 0; h <= 24; h++) {
        const x = h5(X(h * 3600)), major = h % 3 === 0;
        s += line(x, ry, x, ry + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint"));
        if (major) s += text(Math.round(X(h * 3600)), ry + 20, pad2(h) + ":00", "tx-num", "middle");
      }
      s += text(0, ry + 20, scn.tz.name, "tx-lab", "start");
      /* peak-hour dimension lines (M12), hung off the ALL ridge: extension lines rise from the
         ridge at the hour edges to a dimension line above its tallest point */
      const dy = plotTop - 10;
      const ridgeY = (t) => { const k = Math.max(0, Math.min(allSm.length - 1, Math.round(t / 600 - 0.5))); return allBase - (ampAll * Math.min(allSm[k], allMax)) / allMax; };
      peak.forEach((p) => {
        const a = Math.round(X(p.h * 3600)), b = Math.round(X((p.h + 1) * 3600));
        s += '<path class="s-hair k-line d-measure" d="M' + h5(a) + " " + (ridgeY(p.h * 3600) - 3).toFixed(0) + "V" + (dy - 4) + "M" + h5(b) + " " + (ridgeY((p.h + 1) * 3600 - 1) - 3).toFixed(0) + "V" + (dy - 4) + '"/>';
        s += line(a, h5(dy), b, h5(dy), "s-hair k-line");
        s += line(a + 0.5, dy - 4, a + 0.5, dy + 3, "s-hair k-line") + line(b - 0.5, dy - 4, b - 0.5, dy + 3, "s-hair k-line");
        s += text(b + 8, dy + 4, p.name + " " + pad2(p.h) + "–" + pad2(p.h + 1) + " · " + total(p.v) + " · " + p.x + "× MIDDAY", "st-val", "start");
      });
      /* now-line (state-idle) */
      if (nowT != null) {
        const xn = h5(X(nowT));
        s += line(xn, plotTop - 14, xn, ry, "s-hair k-idle");
        /* label in the empty future, level with the ALL ridge, clear of the peak dimensions */
        s += text(Math.round(X(nowT)) + 6, allBase - Math.round(ampAll / 2) + 4, "NOW " + scn.clock.slice(0, 5), "st-now", "start");
      }
      el.insertAdjacentHTML("beforeend", s + "</svg>");
    }
    /* runs of consecutive 10-min bins at or above the cap: [[first, last], ...] */
    function capRuns(vals, cap) {
      const runs = [];
      vals.forEach((v, k) => {
        if (v < cap) return;
        const r = runs[runs.length - 1];
        if (r && r[1] === k - 1) r[1] = k; else runs.push([k, k]);
      });
      return runs;
    }
    /* the capped mark: void knock-out of the solid flat, dash-threshold 2/3 in line, 1 px end ticks */
    function capMark(xa, xb, y) {
      const Y = h5(y);
      return line(xa, Y, xb, Y, "st-cap-ko") + line(xa, Y, xb, Y, "s-hair d-threshold k-line st-cap") +
        line(h5(xa), y - 3, h5(xa), y + 4, "s-hair k-line") + line(h5(xb) - 1, y - 3, h5(xb) - 1, y + 4, "s-hair k-line");
    }
    /* total airtime per hour, all channels; AM and PM peaks against the 10–14 midday mean */
    function peakHours() {
      const hours = Array.from({ length: 24 }, (_, h) => Object.values(R.channels).reduce((a, c) => a + (c.airtime_per_hour[h] || 0), 0));
      const lastFull = isToday ? Math.floor(endT / 3600) - 1 : 23;
      const mid = [10, 11, 12, 13].filter((h) => h <= lastFull).map((h) => hours[h]);
      const midday = mid.length ? mid.reduce((a, b) => a + b, 0) / mid.length : null;
      const pick = (lo, hi, name) => {
        let best = null;
        for (let h = lo; h <= Math.min(hi, lastFull); h++) if (!best || hours[h] > best.v) best = { h, v: hours[h], name };
        return best && best.v > 0 ? best : null;
      };
      const out = [pick(5, 9, "AM PEAK"), pick(15, 19, "PM PEAK")].filter(Boolean);
      out.forEach((p) => { p.x = midday ? (p.v / midday).toFixed(1) : "—"; });
      return out;
    }

    /* ============================================================ heatmap: channel × hour
       Rows share base(i) with the ridgeline: each row of cells is centred on its ridge's baseline,
       and its label sits on the same text baseline as the ridge label. */
    function renderHeat() {
      const el = document.getElementById("st-heat");
      el.innerHTML = '<div class="panel__head"><span class="t-panel">CHANNEL × HOUR</span><span class="t-micro">AIRTIME S / H · ROWS ALIGN WITH RIDGES</span></div>';
      const W = Math.round(el.getBoundingClientRect().width) - 32;
      const lx = W < 520 ? 104 : 112;
      const cw = Math.floor((W - lx - 36) / 24), gx = lx, gw = cw * 24;
      const max = Math.max(...series.map((s) => Math.max(...s.hours.slice(0, 24))));
      const hoursDone = isToday ? endT / 3600 : 24;
      const half = pitch / 2;
      let s = svgOpen(W, Hh);
      /* scale first, in the band level with the ALL ridge: the single-hue ramp as an axis (not a legend) */
      const sy = allBase - ampAll + 4, lw = Math.min(192, Math.round(gw * 0.4));
      const id = "st-ramp";
      s += '<defs><linearGradient id="' + id + '">' + HUD.RAMP.map((c, k) => '<stop offset="' + (k / (HUD.RAMP.length - 1)) + '" stop-color="' + c + '"/>').join("") + "</linearGradient></defs>";
      s += text(0, sy + 8, "SCALE", "tx-lab", "start");
      s += '<rect x="' + gx + '" y="' + sy + '" width="' + lw + '" height="6" fill="url(#' + id + ')"/>';
      s += '<rect class="s-hair k-faint" x="' + (gx + 0.5) + '" y="' + (sy + 0.5) + '" width="' + (lw - 1) + '" height="5"/>';
      s += text(gx, sy + 20, "0", "tx-num", "start") + text(gx + lw / 2, sy + 20, Math.round(max / 2) + "", "tx-num", "middle") + text(gx + lw, sy + 20, Math.round(max) + " S", "tx-num", "end");
      const hot = series.map((sr, i) => sr.hours.slice(0, 24).map((v, h) => ({ v, h, i }))).flat().sort((a, b) => b.v - a.v)[0];
      if (hot) s += text(gx + gw, sy + 8, "MAX " + series[hot.i].aar + " " + pad2(hot.h) + ":00 · " + Math.round(hot.v) + " S", "st-val", "end");
      if (nowT != null) s += text(gx + gw, sy + 20, "· = HOURS NOT YET RUN", "tx-lab", "end");
      /* hour columns */
      const hy = base(0) - half - 6;
      for (let h = 0; h < 24; h += 3) s += text(gx + h * cw + cw / 2, hy, pad2(h), "tx-num", "middle");
      series.forEach((sr, i) => {
        const yc = base(i), y0 = Math.round(yc - half) + 1, y1 = Math.round(yc + half) - 1;
        s += '<text x="0" y="' + (yc + 4) + '"><tspan class="st-ch">' + esc(sr.aar) + '</tspan><tspan class="st-lab" dx="6">' + esc(sr.label.length > 10 ? sr.label.slice(0, 10) : sr.label) + "</tspan></text>";
        for (let h = 0; h < 24; h++) {
          const x = gx + h * cw;
          if (h >= hoursDone) { s += '<rect class="f-line" style="fill:var(--grid)" x="' + (x + cw / 2 - 1) + '" y="' + (yc - 1) + '" width="2" height="2"/>'; continue; }
          const v = sr.hours[h] || 0;
          const t = v > 0 ? 0.1 + 0.9 * Math.min(1, v / max) : 0;
          s += '<rect x="' + x + '" y="' + y0 + '" width="' + (cw - 1) + '" height="' + (y1 - y0) + '" style="fill:' + (v > 0 ? HUD.rampColor(t) : "var(--ramp-1)") + ';fill-opacity:' + (v > 0 ? 1 : 0.5) + '"/>';
        }
        s += text(W, yc + 4, Math.round(sr.share * 100) + "%", "st-val", "end");
      });
      if (nowT != null) {
        const h = Math.floor(nowT / 3600), x = gx + h * cw + cw / 2, yt = base(0) - half;
        s += line(h5(x), yt - 2, h5(x), yt + 1, "s-hair k-idle");
        s += '<path class="f-idle" style="fill:var(--state-idle)" d="M' + (x - 4) + " " + (yt - 3) + "H" + (x + 4) + "L" + x + " " + (yt + 1) + 'Z"/>';
      }
      el.insertAdjacentHTML("beforeend", s + "</svg>");
    }

    /* ============================================================ top talkers */
    function renderTalkers() {
      const el = document.getElementById("st-talk");
      const tc = R.top_channels.map((id) => R.channels[id]).filter(Boolean).slice(0, 10);
      const tt = R.top_talkers.slice(0, 10);
      const cmax = Math.max(...tc.map((c) => c.airtime_s)), tmax = Math.max(...tt.map((t) => t.count));
      const col1 = tc.map((c) => '<div class="st-trow"><span class="n">CH' + pad2(c.aar_channel) + '<span class="l">' + esc(c.label) + '</span></span><span class="v">' + esc(total(c.airtime_s)) + " · " + c.count +
        '</span><span class="b"><i style="width:' + Math.max(2, Math.round((c.airtime_s / cmax) * 100)) + '%"></i></span></div>').join("");
      const col2 = tt.map((t) => '<div class="st-trow"><span class="n">' + esc(HUD.fmt.trainId(t.name)) + '</span><span class="v">' + t.count +
        '</span><span class="b"><i style="width:' + Math.max(2, Math.round((t.count / tmax) * 100)) + '%"></i></span></div>').join("");
      el.innerHTML = '<div class="panel__head"><span class="t-panel">TOP TALKERS</span><span class="t-micro">' + esc(rangeLabel) + ' · <b>SIM</b> IDENTITIES</span></div>' +
        '<div class="st-cols"><div><div class="st-colh"><span class="t-micro">CHANNELS · BY AIRTIME</span><span class="t-micro">HH:MM:SS · TX</span></div>' + col1 + "</div>" +
        '<div><div class="st-colh"><span class="t-micro">SPEAKERS · TRAINS · BY TX</span><span class="t-micro">TX</span></div>' + col2 + "</div></div>";
    }

    /* ============================================================ detector board */
    function renderDetectors() {
      const el = document.getElementById("st-det");
      const dets = R.detectors;
      const total = dets.reduce((a, d) => a + d.reports, 0), defects = dets.reduce((a, d) => a + d.defects, 0);
      const name = (d) => d.name.replace(/\s*defect detector$/i, "").replace(/^CSX detector\s*/i, "");
      const cells = dets.map((d) => {
        const last = d.last;
        const defectHTML = d.defects > 0 ? C.tag.defect() + '<span class="mono">' + d.defects + "</span>" : '<span class="z">0 DEFECTS</span>';
        return '<div class="st-dcell"' + (d.defects ? " data-defect" : "") + ">" + C.mpTag(d.mp_label) +
          '<div><div class="nm">' + esc(name(d)) + "</div>" +
          '<div class="ln"><span class="k">LAST</span>' + (last ? esc(HUD.size === 1440 ? last.clock.slice(0, 5) : last.clock) + " · " + last.axles + " AX · " + last.mph + " MPH" : '<span class="z">' + HUD.BLANK + " NO REPORT</span>") + "</div>" +
          '<div class="ln"><span class="k">RPT</span>' + d.reports + '<span class="z"> · </span>' + defectHTML + "</div></div></div>";
      }).join("");
      el.innerHTML = '<div class="panel__head"><span class="t-panel">DETECTOR BOARD</span><span class="t-micro"><b>' + dets.length + "</b> DETECTORS · <b>" + total + "</b> REPORTS · <b>" + defects + "</b> DEFECT" + (defects === 1 ? "" : "S") + " · " + esc(rangeLabel) + "</span></div>" +
        '<div class="st-dgrid">' + cells + "</div>";
    }

    /* ============================================================ decoder quality + feed uptime */
    function renderDecoder() {
      const el = document.getElementById("st-dec");
      const d = R.decoder;
      const W = Math.round(el.getBoundingClientRect().width) - 32;
      let html = '<div class="panel__head"><span class="t-panel">DECODER QUALITY</span><span class="t-micro">' + esc(d.engine.toUpperCase()) + " · <b>" + d.final_rows + "</b> FINAL ROWS</span></div>";
      const small = HUD.size === 1440;
      const latW = small ? 132 : 168;
      const hw = W - latW - 24, hh = small ? 124 : 142;
      let s = svgOpen(hw, hh);
      const hist = d.confidence_histogram;
      if (!hist || !hist.length) {
        s += text(0, 60, "N/A · ENGINE REPORTS NO CONFIDENCE", "st-dim", "start");
      } else {
        const hmax = Math.max(...hist), bw = hw / hist.length, by = hh - 38;
        hist.forEach((v, k) => {
          const bh = v ? Math.max(2, Math.round((v / hmax) * (by - 20))) : 0;
          const x = Math.round(k * bw) + 2, w = Math.round(bw) - 4;
          if (bh) s += '<rect class="st-bar" x="' + (x + 0.5) + '" y="' + (by - bh + 0.5) + '" width="' + (w - 1) + '" height="' + (bh - 1) + '"/>';
          else s += line(x, h5(by - 1), x + w, h5(by - 1), "s-hair k-grid");
          if (v) s += text(x + w / 2, by - bh - 5, String(v), "st-val", "middle");
        });
        s += line(0, h5(by), hw, h5(by), "s-hair k-faint");
        for (let k = 0; k <= 10; k++) {
          const x = h5(Math.min(hw - 1, k * bw)), major = k % 2 === 0;
          s += line(x, by, x, by + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint"));
          if (major) s += text(Math.round(Math.min(hw - 12, Math.max(8, k * bw))), by + 20, (k / 10).toFixed(1), "tx-num", "middle");
        }
        s += text(hw, by + 34, small ? "CONFIDENCE" : "TRANSCRIPT CONFIDENCE", "tx-lab", "end");
      }
      s += "</svg>";
      const lat = d.median_latency_s;
      html += '<div class="st-split"><div>' + s + '</div><div class="st-lat">' +
        '<span class="t-micro">' + (small ? "MEDIAN LATENCY" : "MEDIAN DECODE LATENCY") + '</span><span class="big">' + (lat != null ? lat.toFixed(1) : HUD.BLANK) + "<small>S</small></span>" +
        '<span class="t-micro" style="margin-top:10px">DECODED</span><span class="mono" style="font-size:13px">' + d.final_rows + ' <span class="c-ink-3">/ ' + R.totals.count + " TX</span></span>" +
        '<span class="t-micro" style="margin-top:6px">QUEUE NOW</span><span class="mono" style="font-size:13px">' + (isToday ? scn.system.decoder.queue : HUD.BLANK) + "</span></div></div>";

      /* feed uptime: solid ok, dash-stale stale, dash-offline reconnecting, hollow triangle past fault, red only for a fault now */
      html += '<div class="panel__head st-up-head"><span class="t-panel">FEED UPTIME</span><span class="t-micro">' + esc(rangeSpan) + "</span></div>";
      const rowH = 26; /* both sizes: the live readout takes two lines under its label (r3) */
      const uw = W, uh = 14 + 4 * rowH + 22, ux0 = 64, ux1 = uw - 64;
      const X = (t) => ux0 + (t / 86400) * (ux1 - ux0);
      let u = svgOpen(uw, uh);
      const feeds = Object.keys(R.feed_uptime);
      const elapsed = endT - R.start_t;
      const ry = 14 + feeds.length * rowH - 6;
      /* now-line first, so the glyphs at now paint over it */
      if (nowT != null) u += line(h5(X(nowT)), 2, h5(X(nowT)), ry, "s-hair k-idle");
      feeds.forEach((fid, i) => {
        const y = 14 + i * rowH;
        const segs = R.feed_uptime[fid].map((sg) => Object.assign({}, sg, { a: Math.max(0, sg.start_t), b: Math.min(endT, sg.end_t) })).filter((sg) => sg.b > sg.a);
        const down = segs.reduce((a, sg) => a + (sg.b - sg.a), 0);
        const isLive = (sg) => sg.active && sg.b >= endT - 1;
        u += text(0, y + 4, HUD.feedName(fid), "st-ch", "start");
        u += line(X(0), h5(y), X(endT).toFixed(1), h5(y), "st-up");
        if (isToday) u += line(X(endT).toFixed(1), h5(y), ux1, h5(y), "s-hair k-grid");
        segs.forEach((sg) => {
          /* every non-ok span is at least 8 px, in its own dash, closed by 1 px end ticks, so a
             two-minute stale still shows its geometry (and survives grayscale) at 24 h scale */
          let a = Math.round(X(sg.a)), b = Math.round(X(sg.b));
          if (b - a < 8) { const m = (a + b) / 2; a = Math.round(m - 4); b = a + 8; }
          if (isLive(sg)) { b = Math.round(X(endT)); a = Math.min(Math.round(X(sg.a)), b - 8); } /* a span live now ends at now */
          u += line(a - 1, h5(y), b + 1, h5(y), "st-gap");
          const cls = sg.state === "fault" ? (isLive(sg) ? "st-up-fault" : "st-up-stale") : sg.state === "offline" ? "st-up-off" : "st-up-stale";
          u += line(a, h5(y), b, h5(y), cls);
          const tk = sg.state === "fault" && isLive(sg) ? "k-fault" : "k-stale";
          u += line(h5(a), y - 4, h5(a), y + 4, "s-hair " + tk) + line(h5(b) - 1, y - 4, h5(b) - 1, y + 4, "s-hair " + tk);
          if (sg.state === "fault" && !isLive(sg)) u += S.glyph(Math.round((a + b) / 2), y - 9, "fault-past");
        });
        /* live now: the glyph sits on the now end of its own bar, and the label sits in the empty future
           to the right of the now-line, level with that bar (P2: present tense lives at now) */
        const live = segs.filter(isLive).sort((p, q) => (q.state === "fault") - (p.state === "fault"));
        if (live.length && nowT != null) {
          const lab = live[0], xn = Math.round(X(endT));
          u += S.glyph(xn - 4, y - 9, lab.state === "fault" ? "fault" : lab.state === "offline" ? "offline" : "stale");
          const lx = xn + 10;
          u += text(lx, y + 4, lab.label, lab.state === "fault" ? "st-fault-t" : "st-stale-t", "start");
          u += text(lx, y + 16, "SINCE " + lab.start.slice(0, 5) + " · AGE " + HUD.fmt.age(nowT - lab.start_t, "age"), "st-dim", "start");
        }
        const pct = 100 * (1 - down / elapsed);
        u += text(uw, y + 4, (pct >= 99.95 && down > 0 ? "99.9" : pct.toFixed(1)) + "%", "st-val", "end");
      });
      u += line(ux0, h5(ry), ux1, h5(ry), "s-hair k-faint");
      for (let h = 0; h <= 24; h += 3) {
        const x = h5(X(h * 3600));
        u += line(x, ry, x, ry + (h % 6 === 0 ? 8 : 4), "s-hair " + (h % 6 === 0 ? "k-line" : "k-faint"));
        if (h % 6 === 0) u += text(Math.round(X(h * 3600)), ry + 20, pad2(h), "tx-num", "middle");
      }
      u += text(uw, ry + 20, "UP", "tx-lab", "end");
      html += u + "</svg>";
      el.innerHTML = html;
    }
  }

  main().catch((e) => HUD.fail(e));
})();

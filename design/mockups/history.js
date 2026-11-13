/* ==========================================================================
   sdrviz · WLT-1 · History & playback (brief §9.2) · page script
   Owner: history-stats screen designer. Uses window.HUD (_shared/hud.js).
   Every figure on screen is read from data/sim/ (scenario twin + day twin)
   or from the seed places inlined in history.html. Nothing is typed in.

   URL: history.html?state=listening|keyed|fault|fault-acked[&size=1440][&route=r-nec][&gray=1][&build=0]
          [&range=HH:MM-HH:MM]  an earlier range on the sim day (yesterday when it has not run yet today)
          [&train=MARC%20410]    select that train's string (its seed row first, else its latest final)
          [&tx=tx-039]           select one row; with no range, its hour is the range
   Live key-ups (row.live) never reach History: they are the header chip until they release (brief §9.2, §9.7).
   ========================================================================== */
(function () {
  "use strict";
  const { fmt, esc, c: C, svg: S } = HUD;
  const h5 = HUD.snap;

  /* ------------------------------------------------------------ data loading
     The generator writes JS twins as window.SDRVIZ_SCENARIOS[name] and
     window.SDRVIZ_DAY, which file:// pages can load with a plain <script>. */
  const loadScript = (src) => new Promise((ok) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(true); s.onerror = () => ok(false);
    document.head.appendChild(s);
  });
  const STATES = ["listening", "keyed", "fault", "fault-acked"];
  const stateName = STATES.includes(HUD.state) ? HUD.state : "listening";
  if (HUD.params.gray === "1") document.documentElement.dataset.gray = "";

  /* ------------------------------------------------------------ shell from scenario */
  function shellOpts(scn, screen, scope) {
    const faults = scn.faults || [];
    const unacked = faults.filter((f) => !f.acked);
    /* shared header chips (with the KEYED chip, brief §9.2) and status line (hud.js) */
    const chips = HUD.headerChips(scn, { txChip: true });
    const sys = scn.system;
    const status = HUD.statusFrom(scn, "RECORDING · DISK " + Math.round(sys.disk.pct) + "% · DECODER QUEUE " + sys.decoder.queue + " · MEDIAN " + sys.decoder.median_latency_s.toFixed(1) + " S");
    return { screen, scope, clock: scn.clock, zone: scn.tz.name, chips, audio: "on", status };
  }

  /* ------------------------------------------------------------ geometry helpers */
  const svgOpen = (w, h, cls = "") => '<svg class="hud ' + cls + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">';
  const line = (x1, y1, x2, y2, cls) => '<path class="' + cls + '" d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '"/>';
  const text = (x, y, s, cls, anchor = "start", extra = "") => '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '"' + extra + ">" + esc(s) + "</text>";
  const hm = (t) => fmt.hm(((t % 86400) + 86400) % 86400);
  const pad2 = (n) => String(n).padStart(2, "0");
  const ROLE_TAGS = { crew: "CRW", dispatcher: "DSP", operator: "OPR", detector: "DET", yardmaster: "YDM", MOW: "MOW", unknown: "UNK" };
  const SMALL = HUD.size === 1440;
  function parseRange(v) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(v || "");
    if (!m) return null;
    const a = +m[1] * 3600 + +m[2] * 60, b = +m[3] * 3600 + +m[4] * 60;
    return b > a && b <= 86400 ? [a, b] : null;
  }
  const clockS = (t) => fmt.clock(t, "").trim();

  /* nearest route for a place that is not on any route (brief §9.0.4: margin rail of the nearest route) */
  function nearestRoute(routes, ll) {
    let best = null, bd = Infinity;
    routes.forEach((r) => r.points.forEach((p) => {
      if (p.lat == null) return;
      const d = (p.lat - ll[0]) ** 2 + ((p.lon - ll[1]) * Math.cos((ll[0] * Math.PI) / 180)) ** 2;
      if (d < bd) { bd = d; best = r.id; }
    }));
    return best;
  }

  /* train position (route miles) at time t, linear between stops (brief §9.0.5) */
  function trainMi(train, t) {
    const st = train.stops;
    if (t < st[0].t || t > st[st.length - 1].t) return null;
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i].t) {
        const a = st[i - 1], b = st[i];
        const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        return a.route_mi + (b.route_mi - a.route_mi) * f;
      }
    }
    return null;
  }

  /* native MP at route miles: piecewise linear over the route's MP points, by prefix family */
  function mpAt(route, mi) {
    const pts = route.points.filter((p) => p.mp != null);
    if (!pts.length) return null;
    let a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) if (pts[i].route_mi >= mi) { a = pts[i - 1]; b = pts[i]; break; }
    /* across a change of count, use the segment on the side mi lies on */
    if (a.prefix !== b.prefix) { if (mi - a.route_mi < b.route_mi - mi) b = a; else a = b; }
    if (a === b) {
      const same = pts.filter((p) => p.prefix === a.prefix);
      const i = same.indexOf(a), o = same[i + 1] || same[i - 1];
      if (!o) return { prefix: a.prefix, mp: a.mp };
      const k = (o.mp - a.mp) / (o.route_mi - a.route_mi);
      return { prefix: a.prefix, mp: a.mp + k * (mi - a.route_mi) };
    }
    const f = (mi - a.route_mi) / (b.route_mi - a.route_mi);
    return { prefix: a.prefix, mp: a.mp + (b.mp - a.mp) * f };
  }
  /* MP of one count (prefix pf) at route miles, linear over that count's points (extrapolates at the ends) */
  function mpAtPf(route, pf, mi) {
    const pts = route.points.filter((p) => p.prefix === pf && p.mp != null);
    if (pts.length < 2) return pts.length ? pts[0].mp : null;
    let a = pts[0], b = pts[1];
    for (let i = 1; i < pts.length; i++) { a = pts[i - 1]; b = pts[i]; if (b.route_mi >= mi) break; }
    return a.mp + ((b.mp - a.mp) * (mi - a.route_mi)) / (b.route_mi - a.route_mi);
  }
  /* inverse: route miles for a native MP of prefix pf (for ruler ticks) */
  function miAt(route, pf, mp) {
    const pts = route.points.filter((p) => p.prefix === pf && p.mp != null);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((mp - a.mp) * (mp - b.mp) <= 0 && a.mp !== b.mp) return a.route_mi + ((mp - a.mp) / (b.mp - a.mp)) * (b.route_mi - a.route_mi);
    }
    return null;
  }

  /* ------------------------------------------------------------ deterministic clip shape (M15 + spectrogram)
     The sim carries words[] with onset times; the waveform and spectrogram are drawn from them.
     Seeded by the row id so every render of a clip is identical. */
  function rng(seedStr) {
    let h = 2166136261;
    for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  function speechBursts(row) {
    const dur = row.duration_s || 1;
    const words = row.words || [];
    if (!words.length) return [];
    return words.map((w, i) => {
      const next = i + 1 < words.length ? words[i + 1].t : dur - 0.15;
      const len = Math.max(0.12, Math.min(next - w.t - 0.04, 0.09 * w.w.length + 0.08));
      return { t0: w.t, t1: w.t + len, conf: w.conf };
    });
  }
  function envelope(row, n) {
    const r = rng(row.id), dur = row.duration_s || 1, bursts = speechBursts(row);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * dur;
      let a = 0.035 + r() * 0.03; /* carrier hiss */
      bursts.forEach((b) => {
        if (t >= b.t0 && t <= b.t1) {
          const u = (t - b.t0) / (b.t1 - b.t0);
          a = Math.max(a, (0.35 + 0.55 * Math.sin(Math.PI * u)) * (0.55 + 0.45 * r()));
        }
      });
      if (row.state === "carrier_only") a = 0.05 + r() * 0.03;
      out.push([-a * (0.8 + 0.2 * r()), a]);
    }
    return out;
  }
  function drawSpectrogram(cv, row, w, h) {
    const dpr = 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const g = cv.getContext("2d");
    const r = rng(row.id + ":spec"), dur = row.duration_s || 1, bursts = speechBursts(row);
    const bins = 32, cw = 2; /* 32 rows of 125 Hz over 0–4 kHz; 2 px columns */
    const cols = Math.floor(w / cw), rh = h / bins;
    for (let c = 0; c < cols; c++) {
      const t = (c / cols) * dur;
      const b = bursts.find((q) => t >= q.t0 && t <= q.t1);
      const u = b ? (t - b.t0) / (b.t1 - b.t0) : 0;
      const f1 = 450 + 350 * Math.sin(u * 2.4 + (b ? b.t0 : 0)), f2 = 1300 + 700 * Math.sin(u * 1.7 + (b ? b.t0 * 3 : 0));
      for (let k = 0; k < bins; k++) {
        const f = (k + 0.5) * 125;
        let e = 0.06 + r() * 0.08; /* floor, clamped just under the noise (brief §3.3) */
        if (b) {
          const env = Math.sin(Math.PI * u);
          e += env * (0.75 * Math.exp(-(((f - f1) / 260) ** 2)) + 0.5 * Math.exp(-(((f - f2) / 380) ** 2)) + 0.22 * Math.exp(-(((f - 2700) / 500) ** 2)));
          e += env * 0.12 * r();
        }
        if (row.state === "carrier_only") e = 0.05 + r() * 0.06;
        g.fillStyle = HUD.rampColor(Math.min(1, e));
        g.fillRect(c * cw, h - (k + 1) * rh, cw, Math.ceil(rh));
      }
    }
  }

  /* ------------------------------------------------------------ main */
  async function main() {
    await Promise.all([
      loadScript(HUD.ROOT + "data/sim/scenarios/" + stateName + ".js"),
      loadScript(HUD.ROOT + "data/sim/day.js"),
    ]);
    const scn = (window.SDRVIZ_SCENARIOS || {})[stateName];
    const day = window.SDRVIZ_DAY;
    if (!scn || !day) throw new Error("DATA NOT FOUND · data/sim/scenarios/" + stateName + ".js");
    const places = JSON.parse(document.getElementById("hi-places").textContent);
    day.routes.derived_points.forEach((p) => { places[p.id] = [p.lat, p.lon]; });

    const txById = Object.fromEntries(day.transmissions.transmissions.map((t) => [t.id, t]));
    const H = buildView(scn.history);
    const routes = day.routes.routes;
    /* --- place every row on a route (brief §9.0.4 / M19) */
    const routeOfPlace = {};
    routes.forEach((r) => r.points.forEach((p) => { if (!(p.place_id in routeOfPlace)) routeOfPlace[p.place_id] = r.id; }));
    const trainsById = Object.fromEntries(H.trains.map((t) => [t.train_id, t]));
    const rowRoute = (row) => routeOfPlace[row.place_id] || (places[row.place_id] ? nearestRoute(routes, places[row.place_id]) : null);
    /* the route tab: ?route= wins; else ?tx= opens the route that holds that row (its train's route
       through the row's place first), else ?train= opens the train's first route; else the NEC. */
    function routeForLink() {
      const t = HUD.params.tx && H.rows.find((r) => r.id === HUD.params.tx);
      if (t) {
        const tr = t.train_id && trainsById[t.train_id];
        const own = tr && tr.routes.find((rid) => routes.find((r) => r.id === rid).points.some((p) => p.place_id === t.place_id));
        return own || rowRoute(t) || (tr && tr.routes[0]) || null;
      }
      const want = HUD.params.train && String(HUD.params.train).toLowerCase();
      const tr = want && H.trains.find((q) => q.train_id.toLowerCase() === want);
      return tr ? tr.routes[0] : null;
    }
    const routeId = routes.some((r) => r.id === HUD.params.route) ? HUD.params.route : routeForLink() || "r-nec";
    const route = routes.find((r) => r.id === routeId);

    const content = HUD.shell("#stage", shellOpts(scn, "history", ["ROUTE", route.name]));
    content.innerHTML =
      '<section class="hi-box hi-hero hero" id="hi-hero"></section>' +
      '<section class="hi-box hi-routes" id="hi-routes"></section>' +
      '<section class="hi-box hi-string" id="hi-string" aria-label="Stringline"></section>' +
      '<section class="hi-box hi-scrub" id="hi-scrub" aria-label="Time scrubber"></section>' +
      '<section class="hi-box hi-table txlog" id="hi-table" aria-label="Transcript table"></section>' +
      '<section class="hi-box hi-player br" id="hi-player" aria-label="Clip player"></section>';

    /* a junction place can sit on two counts (Washington: ≈CFP 112.6 | NEC 135.7); prefer the sourced one */
    const pointOn = (rid, pid) => {
      const pts = routes.find((r) => r.id === rid).points.filter((p) => p.place_id === pid);
      return pts.find((p) => !p.mp_approx) || pts[0] || null;
    };
    const rows = H.rows.map((row) => {
      const full = txById[row.id] || {};
      const tr = row.train_id && trainsById[row.train_id];
      let kind = "rail", mi = null;
      const detPt = row.role_tag === "DET" ? pointOn(routeId, row.place_id) : null;
      if (detPt) { kind = "det"; mi = detPt.route_mi; }
      else if (tr && tr.routes.includes(routeId)) { kind = "train"; mi = trainMi(tr, row.t_offset_s); if (mi == null) kind = "rail"; }
      const onRoute = kind !== "rail" || rowRoute(row) === routeId;
      return Object.assign({}, row, { kind, mi, onRoute, receptions: full.receptions || [], words: row.words && row.words.length ? row.words : full.words || [] });
    });
    const routeRows = rows.filter((r) => r.onRoute);

    /* --- selection for this frame. ?tx= names a row; ?train= names a string (its seed row first,
       the researched reference, else its latest final); otherwise the tracked train with the most
       recent final tick in view. */
    const trainRows = routeRows.filter((r) => r.kind === "train");
    const [pv0, pv1] = viewport(route);
    const inView = (r) => r.mi != null && r.mi > pv0 + 2 && r.mi < pv1 - 2;
    const finalWords = (r) => r.state === "final" && r.words.length;
    const wantTrain = HUD.params.train ? String(HUD.params.train).toLowerCase() : null;
    const ofTrain = wantTrain ? rows.filter((r) => r.train_id && r.train_id.toLowerCase() === wantTrain) : [];
    const pickRow = (HUD.params.tx && rows.find((r) => r.id === HUD.params.tx)) ||
      ofTrain.find((r) => !r.sim) || ofTrain.find(finalWords) || ofTrain[0] ||
      trainRows.find((r) => finalWords(r) && inView(r)) || trainRows.find(finalWords) || trainRows[0] || rows.find((r) => r.state === "final");
    const selTrain = pickRow && pickRow.train_id ? pickRow.train_id : null;
    const playing = stateName === "keyed"; /* keyed: a clip plays while live traffic is up (live ducks, §8.8) */
    const progress = playing ? 0.62 : 0;

    renderHero(H, rows);
    renderRoutes(routes, route, rows);
    renderString(route, H, rows, selTrain, pickRow, scn);
    renderScrub(scn, H, pickRow, progress);
    renderTable(H, rows, selTrain, pickRow);
    renderPlayer(pickRow, progress, playing, route);

    HUD.buildOn(document);
    document.documentElement.dataset.ready = "1";

    /* ============================================================ the History view
       Default: the scenario's 1 h ending now (scn.history), live rows excluded.
       ?range= / ?tx=: an earlier range of the sim day, built from the day twin's rows and trains.
       If that range has not run yet today it is yesterday's (the sim day repeats): shift = 86400. */
    function buildView(H0) {
      const base = { scrubber_start_t: H0.scrubber_start_t, scrubber_airtime_per_min: H0.scrubber_airtime_per_min };
      let rng = parseRange(HUD.params.range);
      let txp = HUD.params.tx && txById[HUD.params.tx];
      /* ?train= without ?range= (review r3 #1): pick that train's row as the selection does (its seed row
         first, else its latest final row before now) and derive the 1 h range from it exactly as ?tx= does.
         An unknown train keeps the default view. A link naming one train never shows another. */
      if (!rng && !txp && HUD.params.train) {
        const want = String(HUD.params.train).toLowerCase();
        const own = day.transmissions.transmissions.filter((t) => t.train_id && t.train_id.toLowerCase() === want);
        const before = own.filter((t) => t.t_offset_s + t.duration_s <= scn.t_offset_s && t.transcript_state === "final");
        txp = own.find((t) => !t.sim) || before[before.length - 1] || own[own.length - 1] || null;
      }
      if (!rng && txp) { const h = Math.floor(txp.t_offset_s / 3600) * 3600; rng = [h, h + 3600]; }
      if (!rng) return Object.assign(base, H0, { rows: H0.rows.filter((r) => !r.live), custom: false, shift: 0 });
      const [a, b] = rng;
      const now = scn.t_offset_s;
      const shift = b > now ? 86400 : 0;
      const list = day.transmissions.transmissions
        .filter((t) => t.t_offset_s >= a && t.t_offset_s < b && (shift || t.t_offset_s + t.duration_s <= now))
        .sort((p, q) => q.t_offset_s - p.t_offset_s)
        .map(rowFromDay);
      const air = list.reduce((acc, r) => acc + r.duration_s, 0);
      return Object.assign(base, {
        custom: true, shift,
        range: { start_t: a, end_t: b, start: hm(a), end: hm(b) },
        totals: { count: list.length, airtime_s: Math.round(air * 10) / 10, airtime_label: HUD.fmt.total(air) /* the one total formatter; gen_sim total_label matches */ },
        rows: list,
        trains: day.trains.trains.filter((tr) => tr.start_t <= b && tr.end_t >= a),
      });
    }
    function rowFromDay(t) {
      const ch = day.stats.day.channels[t.frequency_id] || {};
      const bank = (scn.banks || []).find((bk) => bk.id === scn.active_bank);
      const recs = t.receptions || [];
      let det = null;
      if (t.speaker_role === "detector") {
        const m = (re) => { const x = re.exec(t.transcript || ""); return x ? x[1] : null; };
        const dd = (day.stats.day.detectors || []).find((d) => d.detector_id === t.place_id);
        const defect = m(/Defect, defect\. (.+?)\. Train speed/);
        const mp = m(/milepost (\d+\.\d)/);
        det = { axles: +m(/Total axles (\d+)/) || null, mph: +m(/speed (\d+) miles/) || null, defect: !!defect, defect_text: defect,
          mp_label: dd ? dd.mp_label : mp ? "MP " + mp : null, detector_id: dd ? dd.detector_id : null };
      }
      return {
        id: t.id, t_offset_s: t.t_offset_s, clock: t.clock_local, clock_tenths: t.clock_local + "." + Math.floor((t.t_offset_s * 10) % 10),
        aar: "CH" + pad2(t.aar_channel), aar4: ch.aar4, frequency_id: t.frequency_id, label: ch.label,
        off_bank: bank ? !bank.frequency_ids.includes(t.frequency_id) : false,
        feed_id: t.feed_id, feed_label: HUD.feedName(t.feed_id) + (recs.length > 1 ? " +" + (recs.length - 1) : ""),
        role: t.speaker_role, role_tag: ROLE_TAGS[t.speaker_role] || "UNK", speaker: t.speaker, train_id: t.train_id,
        place_id: t.place_id, duration_s: t.duration_s, state: t.transcript_state, final_state: t.transcript_state, live: false,
        transcript: t.transcript, words: t.words || [], confidence: t.confidence, detector: det, sim: t.sim,
      };
    }

    /* ============================================================ hero */
    function renderHero(H, rows) {
      const chans = new Set(rows.map((r) => r.aar)).size;
      const span = (H.range.end_t - H.range.start_t) / 3600;
      const el = document.getElementById("hi-hero");
      el.innerHTML =
        '<span class="hero__big">' + esc(H.range.start + "–" + H.range.end) + '<span class="z">' + esc(scn.tz.name) + "</span></span>" +
        '<span class="hero__stack"><span class="a">RANGE · ' + span + ' H</span><span class="b">' +
          (H.custom ? (H.shift ? "YESTERDAY · " + esc(prevDate()) : "EARLIER TODAY") : "ENDS NOW · " + esc(clockS(scn.t_offset_s))) + "</span></span>" +
        '<span class="hi-rule"></span>' +
        '<span class="hero__big is-sm">' + H.totals.count + "</span>" +
        '<span class="hero__stack"><span class="a">TRANSMISSIONS</span><span class="b">ON ' + chans + " CHANNELS</span></span>" +
        '<span class="hi-rule"></span>' +
        '<span class="hero__big is-sm">' + esc(H.totals.airtime_label) + "</span>" +
        '<span class="hero__stack"><span class="a">AIRTIME</span><span class="b">HH:MM:SS · ALL CHANNELS</span></span>' +
        '<span class="hero__aside">' +
          '<span class="hi-step">' + C.chip("◂ 1 H", "nominal", { button: true }) + C.chip("1 H ▸", "nominal", { button: true }) + "</span>" +
          '<span class="hi-step">' + ["15 M", "1 H", "4 H", "24 H"].map((s) => C.chip(s, "filter", { button: true, pressed: s === span + " H" })).join("") + "</span>" +
          C.chip("TO NOW", H.custom ? "nominal" : "active", { button: true }) +
        "</span>";
    }

    function prevDate() {
      const d = new Date(scn.date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(5, 10);
    }

    /* ============================================================ route tabs + overview */
    function renderRoutes(routes, route, rows) {
      const counts = Object.fromEntries(routes.map((r) => [r.id, 0]));
      rows.forEach((r) => {
        const rr = r.kind !== "rail" ? routeId : rowRoute(r);
        if (r.kind === "rail" || rr !== routeId) { const k = rowRoute(r); if (k in counts) counts[k]++; } else counts[routeId]++;
      });
      const el = document.getElementById("hi-routes");
      const tabName = (r) => (SMALL ? r.name.replace(/^(CSX|NS) (· )?/, "").replace(/ SUB$/, "") : r.name);
      el.innerHTML = C.tabs(routes.map((r) => ({ id: r.id, name: tabName(r), n: counts[r.id] })), route.id) + '<div class="hi-over" id="hi-over"></div>';
      const over = document.getElementById("hi-over");
      const W = Math.round(over.getBoundingClientRect().width), Hh = 32;
      /* endpoint labels outside the scale, in full at every size: the bar gives way to the names
         (11 px label face with 0.1 em tracking measures about 7.7 px a character) */
      const first = route.points[0], last = route.points[route.points.length - 1];
      const endName = (p) => shortName(p);
      const room = (p) => Math.ceil(endName(p).length * 7.7) + 20;
      const L = SMALL ? room(first) : Math.max(112, room(first)), R = W - (SMALL ? room(last) : Math.max(112, room(last)));
      const x = (mi) => L + (mi / route.length_mi) * (R - L);
      const [v0, v1] = viewport(route);
      let s = svgOpen(W, Hh);
      const yb = 22;
      s += line(L, h5(yb), R, h5(yb), "s-hair k-faint");
      route.points.filter((p) => p.kind === "station").forEach((p) => { s += line(h5(x(p.route_mi)), yb - 3, h5(x(p.route_mi)), yb, "s-hair k-faint"); });
      /* where this route's transmissions sat in the range: 1 px marks above the baseline */
      rows.filter((r) => r.mi != null && r.kind !== "rail").forEach((r) => { s += line(h5(x(r.mi)), yb - 9, h5(x(r.mi)), yb - 4, "s-hair k-line"); });
      /* change of count (MP equation) */
      const eq = route.points.findIndex((p, i) => i && p.prefix && route.points[i - 1].prefix && p.prefix !== route.points[i - 1].prefix);
      if (eq > 0) { const X = h5(x(route.points[eq].route_mi)); s += line(X, yb - 12, X, yb + 4, "s-hair k-line"); }
      /* viewport bracket (M1 handles) */
      const a = Math.round(x(v0)), b = Math.round(x(v1));
      s += '<path class="s-emph k-ink" d="M' + (a + 6) + " 4H" + a + "V" + (Hh - 2) + "H" + (a + 6) + "M" + (b - 6) + " 4H" + b + "V" + (Hh - 2) + "H" + (b - 6) + '"/>';
      s += text(L - 10, yb + 4, endName(first), "hi-stn is-dim", "end");
      s += text(R + 10, yb + 4, endName(last), "hi-stn is-dim", "start");
      const vpf = (mpAt(route, (v0 + v1) / 2) || {}).prefix;
      const vl = (mi) => (vpf ? vpf + " " + mpAtPf(route, vpf, mi).toFixed(1) : "≈ " + mi.toFixed(1));
      s += text(a + 10, 13, "VIEW " + vl(v0) + " – " + vl(v1) + (SMALL ? "" : " · " + (v1 - v0).toFixed(1) + " MI"), "tx-num", "start");
      over.innerHTML = s + "</svg>";
    }
    function viewport(route) {
      if (route.id === "r-nec") {
        const a = route.points.find((p) => p.place_id === "wash-union" && p.prefix === "NEC");
        const b = route.points.find((p) => p.place_id === "baltimore-penn");
        return [a.route_mi, b.route_mi];
      }
      return [0, route.length_mi];
    }
    function mpLabel(route, mi) {
      const m = mpAt(route, mi);
      return m ? m.prefix + " " + m.mp.toFixed(1) : (mi).toFixed(1);
    }

    /* ============================================================ stringline (M19) */
    function renderString(route, H, rows, selTrain, pickRow, scn) {
      const el = document.getElementById("hi-string");
      const W = Math.round(el.getBoundingClientRect().width), HH = Math.round(el.getBoundingClientRect().height);
      const [v0, v1] = viewport(route);
      /* layout: margin rail | time axis | plot */
      const railX = 0, railW = 168, axX = 232, px0 = 248, px1 = W - 1;
      const py0 = 56, py1 = HH - 40; /* plot box: 1920 content y 184–480; 1440 y 184–368 */
      const t0 = H.range.start_t, t1 = H.range.end_t;
      const X = (mi) => px0 + ((mi - v0) / (v1 - v0)) * (px1 - px0);
      const Y = (t) => py0 + ((t - t0) / (t1 - t0)) * (py1 - py0);
      let s = svgOpen(W, HH);
      s += '<defs><clipPath id="hi-clip"><rect x="' + px0 + '" y="' + py0 + '" width="' + (px1 - px0) + '" height="' + (py1 - py0) + '"/></clipPath></defs>';

      /* graticule: station verticals and 10-min horizontals in grid tone (M3) */
      const seen = new Set();
      const stns = route.points.filter((p) => p.route_mi >= v0 - 0.01 && p.route_mi <= v1 + 0.01 && ["station", "interlocking", "yard"].includes(p.kind))
        .filter((p) => (seen.has(p.place_id) ? false : seen.add(p.place_id)));
      stns.forEach((p) => { const x = h5(X(p.route_mi)); s += line(x, py0, x, py1, "s-hair k-grid"); });
      for (let t = Math.ceil(t0 / 600) * 600; t <= t1; t += 600) { const y = h5(Y(t)); s += line(px0, y, px1, y, "s-hair k-grid"); }
      s += '<rect class="s-hair k-faint" x="' + h5(px0) + '" y="' + h5(py0) + '" width="' + (px1 - px0 - 1) + '" height="' + (py1 - py0) + '"/>';
      s += S.regMark(px0, py0);

      /* station names above the plot, staggered into two rows when they would touch */
      const lastEnd = [-1e9, -1e9];
      stns.forEach((p) => {
        const nm = shortName(p);
        const x = X(p.route_mi), w = nm.length * 7.4;
        const anchor = x + w / 2 > px1 ? "end" : x - w / 2 < px0 - 40 ? "start" : "middle";
        const tx0 = anchor === "end" ? px1 - w : anchor === "start" ? x - 4 : x - w / 2;
        const row = tx0 > lastEnd[0] + 12 ? 0 : tx0 > lastEnd[1] + 12 ? 1 : 0;
        lastEnd[row] = tx0 + w;
        const ty = row === 0 ? 30 : 16;
        s += text(Math.round(anchor === "end" ? px1 : anchor === "start" ? x - 4 : x), ty, nm, "hi-stn" + (p.mp_approx ? " is-dim" : ""), anchor);
        s += line(h5(x), ty + 4, h5(x), py0, "s-hair k-faint");
      });

      /* MP ruler under the plot: native MP, majors every 5, minors every 1 (M2) */
      const pf = (mpAt(route, (v0 + v1) / 2) || {}).prefix;
      const ry = py1 + 1;
      s += line(px0, h5(ry), px1, h5(ry), "s-hair k-faint");
      if (pf) {
        const mA = mpAtPf(route, pf, v0), mB = mpAtPf(route, pf, v1);
        const lo = Math.ceil(Math.min(mA, mB)), hi = Math.floor(Math.max(mA, mB));
        for (let m = lo; m <= hi; m++) {
          const mi = miAt(route, pf, m);
          if (mi == null || mi < v0 || mi > v1) continue;
          const x = h5(X(mi)), major = m % 5 === 0;
          s += line(x, ry, x, ry + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint"));
          if (major) s += text(Math.round(X(mi)), ry + 20, pf + " " + m, "tx-num", "middle");
        }
      }
      /* MP equation at the change of count, if inside or at the viewport edge */
      const eqi = route.points.findIndex((p, i) => i && p.prefix && route.points[i - 1].prefix && p.prefix !== route.points[i - 1].prefix);
      if (eqi > 0) {
        const pA = route.points[eqi - 1], pB = route.points[eqi];
        if (pB.route_mi >= v0 - 0.01 && pB.route_mi <= v1) {
          const x = Math.round(X(pB.route_mi));
          s += text(x + 6, ry + 34, pA.prefix + "≈ | " + pB.prefix + " " + pB.mp.toFixed(1), "tx-num", "start");
          s += line(h5(x), ry, h5(x), ry + 26, "s-hair k-line");
        }
      }
      s += text(px1, ry + 34, "TRACK MILES · NATIVE MP · " + (v1 - v0).toFixed(1) + " MI IN VIEW", "tx-lab", "end");

      /* time axis (Y = time, down = later) */
      for (let t = Math.ceil(t0 / 300) * 300; t <= t1; t += 300) {
        const y = h5(Y(t)), major = t % 600 === 0;
        s += line(px0 - (major ? 8 : 4), y, px0, y, "s-hair " + (major ? "k-line" : "k-faint"));
        /* a time label gives way only to the now label; a rail tick's data block stays left of the labels (review r3 #4) */
        if (major && (H.custom || Math.abs(Y(t) - Y(scn.t_offset_s)) > 14)) s += text(px0 - 12, Math.round(Y(t)) + 4, hm(t), "tx-num", "end");
      }
      s += text(px0 - 12, py0 - 8, scn.tz.name, "tx-lab", "end");
      const nowT = scn.t_offset_s;

      /* margin rail: everything with no string or located diamond, grouped by channel (M19) */
      const railRows = rows.filter((r) => r.onRoute && r.kind === "rail");
      const lanes = [...new Set(railRows.map((r) => r.aar))].sort();
      const laneW = Math.min(32, Math.floor(railW / Math.max(1, lanes.length)));
      let railPick = null; /* the selected row when it is a rail tick: { x, y } */
      s += text(railX, 16, "MARGIN RAIL", "tx-lab", "start");
      s += text(railX, 30, railRows.length + " TX · NO STRING · BY CH", "tx-num", "start");
      lanes.forEach((aar, i) => {
        const cx = railX + i * laneW + laneW / 2;
        s += line(h5(cx), py0, h5(cx), py1, "hi-lane");
        s += text(Math.round(cx), py0 - 8, aar.replace("CH", ""), "tx-num2", "middle", ' style="font-size:11px"');
        railRows.filter((r) => r.aar === aar).forEach((r) => {
          const y = h5(Y(r.t_offset_s));
          const sel = pickRow && r.id === pickRow.id;
          s += line(Math.round(cx - 6), y, Math.round(cx + 6), y, "hi-tick" + (sel ? " is-sel" : ""));
          if (sel) railPick = { x: Math.round(cx), y: Math.round(Y(r.t_offset_s)) };
        });
      });
      if (!lanes.length) s += text(railX, py0 + 16, "NONE IN RANGE", "tx-num", "start");

      /* strings */
      const strings = H.trains.filter((t) => t.routes.includes(route.id));
      let body = "";
      const labels = [];
      const polys = []; /* every line a label must not sit on, in screen px */
      strings.forEach((tr) => {
        const xy = tr.stops.filter((p) => p.route_id === route.id).map((p) => [X(p.route_mi), Y(p.t)]);
        const sel = tr.train_id === selTrain;
        body += '<path class="' + (sel ? "s-active k-select" : "s-hair k-line") + '" d="M' + xy.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + '"/>';
        polys.push(xy);
        /* candidate label anchors: points along the string's in-view stretch, entry first */
        const tA = Math.max(t0, tr.start_t), tB = Math.min(t1, tr.end_t), anchors = [];
        for (let t = tA; t <= tB; t += 20) {
          const mi = trainMi(tr, t);
          if (mi != null && mi >= v0 && mi <= v1) anchors.push([X(mi), Y(t)]);
        }
        if (anchors.length) labels.push({ id: tr.train_id, sel, dir: tr.direction, anchors });
      });
      if (!H.custom) polys.push([[px0, Y(scn.t_offset_s)], [px1, Y(scn.t_offset_s)]]);
      /* ticks: perpendicular 6 px on the string; detector diamonds at the detector's MP */
      const off = [];
      let ticks = "";
      rows.filter((r) => r.onRoute && r.kind !== "rail" && r.mi != null).forEach((r) => {
        const x = X(r.mi), y = Y(r.t_offset_s);
        if (r.mi < v0 || r.mi > v1) { off.push({ side: r.mi < v0 ? "l" : "r", y, r }); return; }
        if (r.kind === "det") {
          body += '<path class="hi-diamond" d="M' + x.toFixed(1) + " " + (y - 5).toFixed(1) + "l5 5l-5 5l-5 -5z" + '"/>';
          return;
        }
        const tr = trainsById[r.train_id];
        const mA = trainMi(tr, r.t_offset_s - 30) ?? r.mi, mB = trainMi(tr, r.t_offset_s + 30) ?? r.mi;
        let dx = X(mB) - X(mA), dy = Y(r.t_offset_s + 30) - Y(r.t_offset_s - 30);
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        /* M19: 6 px perpendicular tick in ink, cut into the string by a 2 px bg-void gap each side */
        const k = 3, d = "M" + (x - dy * k).toFixed(1) + " " + (y + dx * k).toFixed(1) + "L" + (x + dy * k).toFixed(1) + " " + (y - dx * k).toFixed(1);
        ticks += '<path class="hi-tick-gap" d="' + d + '"/><path class="hi-tick' + (r.train_id === selTrain ? " is-sel" : "") + '" d="' + d + '"/>';
      });
      s += '<g clip-path="url(#hi-clip)">' + body + ticks + "</g>";
      /* off-view chevrons: the transmission is on this route, outside the viewport */
      off.forEach((o) => {
        const x = o.side === "l" ? px0 + 6 : px1 - 6, y = Math.round(o.y), d = o.side === "l" ? 4 : -4;
        s += '<path class="hi-chev" d="M' + (x + d) + " " + (y - 4) + "L" + x + " " + y + "L" + (x + d) + " " + (y + 4) + '"/>';
      });
      const offL = off.filter((o) => o.side === "l").length, offR = off.length - offL;
      if (offL) s += text(px0 + 16, py0 + 14, "◂ " + offL + " OFF VIEW", "tx-num", "start");
      if (offR) s += text(px1 - 16, py0 + 14, offR + " OFF VIEW ▸", "tx-num", "end");

      /* --- label placement: boxes already taken, and how many string samples fall in a box */
      const boxes = [{ x0: px0, x1: px0 + 120, y0: py0, y1: py0 + 20 }, { x0: px1 - 120, x1: px1, y0: py0, y1: py0 + 20 }];
      const hitsLines = (q) => {
        let n = 0;
        polys.forEach((pl) => {
          for (let i = 1; i < pl.length; i++) {
            const [ax, ay] = pl[i - 1], [bx, by] = pl[i];
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
            if (Math.max(ax, bx) < q.x0 || Math.min(ax, bx) > q.x1 || Math.max(ay, by) < q.y0 || Math.min(ay, by) > q.y1) continue;
            for (let k = 0; k <= steps; k++) {
              const x = ax + ((bx - ax) * k) / steps, y = ay + ((by - ay) * k) / steps;
              if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) { n++; break; }
            }
          }
        });
        return n;
      };
      const hitsBoxes = (q) => boxes.filter((b) => q.x0 < b.x1 && q.x1 > b.x0 && q.y0 < b.y1 && q.y1 > b.y0).length;
      const inPlot = (q) => q.x0 >= px0 + 4 && q.x1 <= px1 - 4 && q.y0 >= py0 + 2 && q.y1 <= py1 - 2;
      const pad = (q, p) => ({ x0: q.x0 - p, x1: q.x1 + p, y0: q.y0 - p, y1: q.y1 + p });

      /* selected tick: data block (M8), placed first in the quadrant with the fewest lines through it */
      if (pickRow) {
        const tickIn = pickRow.mi != null && pickRow.mi >= v0 && pickRow.mi <= v1 && pickRow.kind !== "rail";
        const pt = pointOn(route.id, pickRow.place_id);
        const mp = pt ? pt.mp_label.replace("≈", "≈ ") : fmt.mp(mpLabel(route, pickRow.mi));
        const l1 = HUD.fmt.trainId(pickRow.train_id || pickRow.speaker);
        const l2 = mp + " · " + pickRow.aar;
        const blockBox = (x, y, dir, len, l2s) => {
          const dx = dir.includes("e") ? 1 : -1, dy = dir.includes("s") ? 1 : -1, k = len / Math.SQRT2;
          const ex = x + dx * k, ey = y + dy * k, tx = ex + dx * 4, ty = dy > 0 ? ey + 12 : ey - 6;
          const w = Math.max(l1.length + (pickRow.sim ? 4 : 0), l2s.length) * 6.7;
          return { x0: dx > 0 ? tx : tx - w, x1: dx > 0 ? tx + w : tx, y0: ty - 10, y1: ty + 19 };
        };
        if (tickIn) {
          const x = Math.round(X(pickRow.mi)), y = Math.round(Y(pickRow.t_offset_s));
          const best = ["ne", "se", "nw", "sw"].map((dir, i) => {
            const q = blockBox(x, y, dir, 32, l2);
            return { dir, q, score: (inPlot(q) ? 0 : 1e4) + hitsLines(pad(q, 2)) * 100 + hitsBoxes(q) * 100 + i };
          }).sort((p, q) => p.score - q.score)[0];
          s += S.dataBlock({ x, y, dir: best.dir, len: 32, l1, l2, sim: pickRow.sim });
          boxes.push(best.q);
          const r0 = 10, a = 4;
          s += '<path class="s-emph k-select" d="' + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
            "M" + (x + sx * r0) + " " + (y + sy * (r0 - a)) + "V" + (y + sy * r0) + "H" + (x + sx * (r0 - a))).join("") + '"/>';
        } else if (railPick) {
          /* a rail tick (no string): bracket it on the rail; the block carries its place MP and clock,
             and a select caret on the MP ruler shows where that is along the track */
          const { x, y } = railPick;
          const l2r = (pt ? mp : pickRow.aar) + " · " + pickRow.clock; /* the lane header carries the channel */
          /* the block stays in the margin-rail column: its right edge at least 8 px left of the time-ruler
             labels (P5: the ruler stays complete). ne first, then nw; else a vertical flagpole above the
             tick (below it near the top) with the block clamped into the column. */
          const rightLimit = px0 - 12 - 5 * 6.7 - 8;
          const w = Math.max(l1.length + (pickRow.sim ? 4 : 0), l2r.length) * 6.7;
          const k20 = 20 / Math.SQRT2;
          if (x + 10 + k20 + 4 + w <= rightLimit) s += S.dataBlock({ x: x + 10, y: y - 6, dir: "ne", len: 20, l1, l2: l2r, sim: pickRow.sim });
          else if (x - 10 - k20 - 4 - w >= railX) s += S.dataBlock({ x: x - 10, y: y - 6, dir: "nw", len: 20, l1, l2: l2r, sim: pickRow.sim });
          else {
            const up = y - 70 >= py0 - 40;
            const bx = Math.round(Math.max(railX, Math.min(x - w / 2, rightLimit - w)));
            const yEnd = up ? y - 36 : y + 30, b1 = up ? y - 56 : y + 44;
            s += '<g class="datablock-svg"><path class="s-hair k-line" d="M' + h5(x) + " " + (up ? y - 11 : y + 11) + "V" + yEnd + '"/>' +
              '<rect class="f-void" x="' + (bx - 2) + '" y="' + (b1 - 12) + '" width="' + (Math.round(w) + 4) + '" height="32"/>' +
              '<text class="tx-data" x="' + bx + '" y="' + b1 + '">' + HUD.esc(l1) + (pickRow.sim ? '<tspan class="tx-lab" dx="6">SIM</tspan>' : "") + "</text>" +
              '<text class="tx-num2" x="' + bx + '" y="' + (b1 + 15) + '">' + HUD.esc(l2r) + "</text></g>";
          }
          const r0 = 10, a = 4;
          s += '<path class="s-emph k-select" d="' + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
            "M" + (x + sx * r0) + " " + (y + sy * (r0 - a)) + "V" + (y + sy * r0) + "H" + (x + sx * (r0 - a))).join("") + '"/>';
          if (pt && pt.route_mi >= v0 && pt.route_mi <= v1) {
            const cx = Math.round(X(pt.route_mi));
            s += '<path class="hi-caret" d="M' + (cx - 5) + " " + (ry + 9) + "H" + (cx + 5) + "L" + cx + " " + (ry + 2) + 'Z"/>';
          }
        } else if (pickRow.kind !== "rail") {
          const o = off.find((q) => q.r.id === pickRow.id);
          if (o) {
            const x = o.side === "l" ? px0 + 6 : px1 - 6, dir = o.side === "l" ? "ne" : "nw";
            s += S.dataBlock({ x, y: Math.round(o.y), dir, len: 24, l1, l2: l2 + " · OFF VIEW", sim: pickRow.sim });
            boxes.push(blockBox(x, Math.round(o.y), dir, 24, l2 + " · OFF VIEW"));
          }
        }
      }

      /* string labels: walk each string from where it enters the view and take the first spot,
         on either side, that no line crosses (P5). Knocked out of the plot by a 2 px void stroke. */
      labels.forEach((l) => {
        const id = HUD.fmt.trainId(l.id), w = id.length * 6.7;
        const prefer = l.dir === "SB" ? ["la", "lb", "ra", "rb"] : ["ra", "rb", "la", "lb"];
        let best = null;
        l.anchors.forEach(([ax, ay], ai) => {
          if (best && best.score < 1) return;
          prefer.forEach((pl, pi) => {
            const right = pl[0] === "r", above = pl[1] === "a";
            /* next to the string first; one or two text rows further off only if that is crowded */
            [0, 1, 2].forEach((far) => {
              const lx = Math.round(right ? ax + 6 : ax - 6), ly = Math.round(above ? ay - 5 - 13 * far : ay + 13 + 13 * far);
              const q = { x0: right ? lx : lx - w, x1: right ? lx + w : lx, y0: ly - 9, y1: ly + 2 };
              const score = (inPlot(q) ? 0 : 1e4) + hitsBoxes(pad(q, 2)) * 1000 + hitsLines(pad(q, 1)) * 100 + far * 5 + ai * 0.01 + pi * 0.001;
              if (!best || score < best.score) best = { score, lx, ly, q, anchor: right ? "start" : "end" };
            });
          });
        });
        boxes.push(best.q);
        /* where no clean spot exists (strings converging at a plot edge), a void plate under the label */
        if (best.score >= 100 && best.score < 1000) s += '<rect class="hi-plate" x="' + (best.q.x0 - 2) + '" y="' + (best.q.y0 - 1) + '" width="' + (best.q.x1 - best.q.x0 + 4) + '" height="' + (best.q.y1 - best.q.y0 + 2) + '"/>';
        s += text(best.lx, best.ly, id, "hi-train" + (l.sel ? " is-sel" : ""), best.anchor);
      });

      /* now-line (state-idle, never red); none when the range is earlier */
      if (!H.custom) {
        const nowY = h5(Y(scn.t_offset_s));
        s += line(px0, nowY, px1, nowY, "s-hair k-idle");
        s += text(px0 - 12, Math.round(nowY) + 4, "NOW", "hi-now", "end");
        s += line(px0 - 8, nowY, px0, nowY, "s-hair k-idle");
      }
      el.innerHTML = s + "</svg>";
    }
    function shortName(p) {
      const map = { "wash-union": "WASHINGTON", "landover-int": "LANDOVER", "new-carrollton": "NEW CARROLLTON", "bowie-state": "BOWIE STATE", "west-baltimore": "W BALTIMORE", "baltimore-penn": "BALTIMORE PENN", "b-p-tunnel": "B&P TUNNEL" };
      /* seed names carry operators and long forms: "Camden Station (Camden Yards)", "College Park-University
         of Maryland", "Bayview Yard (CSX / NS)" -> CAMDEN, COLLEGE PARK, BAYVIEW YD */
      return map[p.place_id] || p.name.replace(/\s*\(.*?\)/g, "").replace(/-University.*$/i, "").replace(/ (Station|Interlocking)$/i, "")
        .replace(/ Yard$/i, " YD").replace(/ defect detector$/i, " DET").toUpperCase();
    }

    /* ============================================================ scrubber: rolling 24 h ending now */
    function renderScrub(scn, H, pickRow, progress) {
      const el = document.getElementById("hi-scrub");
      const W = Math.round(el.getBoundingClientRect().width);
      const sx0 = 72, sx1 = W; /* strip */
      const apm = H.scrubber_airtime_per_min, ts = H.scrubber_start_t, te = ts + apm.length * 60;
      const X = (t) => sx0 + ((t - ts) / (te - ts)) * (sx1 - sx0);
      const hy0 = 0, hy1 = 32;
      /* heat strip (single-hue ramp, per-minute airtime, binned to width) */
      const cv = document.createElement("canvas");
      cv.width = sx1 - sx0; cv.height = hy1 - hy0;
      cv.style.left = sx0 + "px"; cv.style.top = hy0 + "px";
      const g = cv.getContext("2d");
      /* 10-minute running mean so the strip reads as density, not a barcode */
      const mean = apm.map((_, i) => { let v = 0, n = 0; for (let k = i - 4; k <= i + 5; k++) if (k >= 0 && k < apm.length) { v += apm[k]; n++; } return v / n; });
      const max = Math.max(...mean);
      const cols = cv.width;
      for (let c = 0; c < cols; c++) {
        const a = Math.floor((c / cols) * apm.length), b = Math.max(a + 1, Math.floor(((c + 1) / cols) * apm.length));
        let v = 0; for (let i = a; i < b; i++) v = Math.max(v, mean[i]);
        const t = v / max;
        g.fillStyle = HUD.rampColor(t > 0 ? 0.04 + 0.9 * t : 0);
        g.fillRect(c, 0, 1, cv.height);
      }
      el.appendChild(cv);

      let s = svgOpen(W, 96);
      s += '<rect class="s-hair k-faint" x="' + h5(sx0) + '" y="' + h5(hy0) + '" width="' + (sx1 - sx0 - 1) + '" height="' + (hy1 - hy0 - 1) + '"/>';
      s += text(0, 13, "AIRTIME", "tx-lab", "start") + text(0, 27, "10 MIN MEAN", "tx-lab", "start");
      /* hour ruler: majors every hour (M2); DST days would add a DST dimension tick (none on 2026-11-10) */
      const ry = hy1;
      s += line(sx0, h5(ry), sx1, h5(ry), "s-hair k-faint");
      for (let t = Math.ceil(ts / 900) * 900; t <= te; t += 900) {
        const x = h5(X(t)), major = t % 3600 === 0;
        s += line(x, ry, x, ry + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint"));
        if (major) {
          const lab = hm(t);
          /* midnight carries the date; at 1440 the date replaces the label so it cannot touch 01:00 */
          s += text(Math.round(X(t)), ry + 20, SMALL && lab === "00:00" ? scn.date.slice(5) : lab, SMALL && lab === "00:00" ? "tx-lab" : "tx-num", "middle");
          if (!SMALL && lab === "00:00") s += text(Math.round(X(t)) + 22, ry + 20, scn.date.slice(5).replace("-", "·"), "tx-lab", "start");
        }
      }
      s += text(0, ry + 20, "24 H", "tx-lab", "start");
      /* range bracket: M1 brackets as handles over the selected range */
      const a = Math.round(X(H.range.start_t - H.shift)), b = Math.round(X(H.range.end_t - H.shift));
      s += '<path class="s-emph k-ink" d="M' + (a + 8) + " " + (hy0 - 4) + "H" + a + "V" + (hy1 + 4) + "H" + (a + 8) + "M" + (b - 8) + " " + (hy0 - 4) + "H" + b + "V" + (hy1 + 4) + "H" + (b - 8) + '"/>';
      /* playhead: 2 px ink line, 5 px downward triangle cap (playback, never orange) */
      if (pickRow) {
        const px = Math.round(X(pickRow.t_offset_s - H.shift + progress * pickRow.duration_s));
        s += line(px, hy0 - 1, px, hy1, "hi-playhead");
        s += '<path class="hi-cap" d="M' + (px - 5) + " " + (hy0 - 7) + "H" + (px + 5) + "L" + px + " " + (hy0 - 1) + 'Z"/>';
      }
      /* recording rail, 2 px (brief §8.9) */
      const recY = 64;
      const diskFault = scn.system.disk.state === "fault";
      s += text(0, recY + 4, "REC", "tx-lab", "start");
      s += line(sx0, recY, sx1, recY, "hi-rec" + (diskFault ? " is-fault" : ""));
      if (diskFault) s += text(sx1, recY - 6, "NOT RECORDING", "hi-fault-t", "end");
      /* feed health lane: solid when all feeds are healthy, dashed spans otherwise, past faults hollow, a fault now ends red */
      const fy = 84;
      s += text(0, fy + 4, "FEEDS", "tx-lab", "start");
      const segs = [];
      Object.entries(scn.stats.rolling_24h.feed_uptime).forEach(([fid, list]) => list.forEach((sg) => {
        const st = Math.max(ts, sg.start_t), en = Math.min(scn.t_offset_s, sg.end_t);
        if (en > ts && st < te) segs.push(Object.assign({ fid, a: st, b: Math.max(en, st) }, sg));
      }));
      s += line(sx0, h5(fy), sx1, h5(fy), "s-hair k-line");
      const nowT = scn.t_offset_s;
      const isLive = (sg) => sg.active && sg.b >= nowT - 1;
      /* geometry first: every non-ok span at least 8 px, inside the lane (never left of its origin),
         a span live now ends at now */
      segs.forEach((sg) => {
        let x0 = Math.round(X(sg.a)), x1 = Math.round(X(sg.b));
        if (isLive(sg)) { x1 = sx1; x0 = Math.min(x0, x1 - 8); }
        if (x1 - x0 < 8) { const m = (x0 + x1) / 2; x0 = Math.round(m - 4); x1 = x0 + 8; }
        if (x0 < sx0) { x1 += sx0 - x0; x0 = sx0; }
        if (x1 > sx1) { x0 -= x1 - sx1; x1 = sx1; }
        /* the fault triangle (±5 px) sits on the span's start, whole inside the lane */
        Object.assign(sg, { x0, x1, gx: Math.max(x0, sx0 + 6) });
      });
      const live = segs.filter(isLive).sort((p, q) => (q.state === "fault") - (p.state === "fault"));
      const past = segs.filter((sg) => !isLive(sg));
      past.sort((p, q) => p.a - q.a).forEach((sg) => {
        s += '<path class="s-hair f-void" style="stroke:var(--bg-void);stroke-width:3px" d="M' + (sg.x0 - 1) + " " + h5(fy) + "H" + (sg.x1 + 1) + '"/>';
        s += line(h5(sg.x0), fy - 4, h5(sg.x0), fy + 4, "s-hair k-stale") + line(h5(sg.x1) - 1, fy - 4, h5(sg.x1) - 1, fy + 4, "s-hair k-stale");
        s += line(sg.x0, h5(fy), sg.x1, h5(fy), "s-hair " + (sg.state === "offline" ? "d-offline" : "d-stale") + " k-stale");
      });
      /* past-fault triangles (review r3 #2): faults on different feeds within 6 px share ONE hollow triangle
         (as they share a label); its base sits 2 px above the tick band (ticks fy±4), so a tick never crosses it */
      const tris = [];
      past.filter((sg) => sg.state === "fault").sort((p, q) => p.gx - q.gx).forEach((sg) => {
        const t = tris[tris.length - 1];
        if (t && sg.gx - t.x <= 6) return;
        tris.push({ x: sg.gx });
      });
      tris.forEach((t) => { s += S.glyph(t.x, fy - 10, "fault-past"); });
      live.forEach((sg) => {
        s += '<path class="s-hair f-void" style="stroke:var(--bg-void);stroke-width:3px" d="M' + (sg.x0 - 1) + " " + h5(fy) + "H" + sg.x1 + '"/>';
        const tk = sg.state === "fault" ? "k-fault" : "k-stale";
        s += line(h5(sg.x0), fy - 4, h5(sg.x0), fy + 4, "s-hair " + tk) + line(h5(sg.x1) - 1, fy - 4, h5(sg.x1) - 1, fy + 4, "s-hair " + tk);
        if (sg.state === "fault") s += line(sg.x0, h5(fy), sg.x1, h5(fy), "hi-bar-fault");
        else s += line(sg.x0, h5(fy), sg.x1, h5(fy), "s-hair " + (sg.state === "offline" ? "d-offline" : "d-stale") + " k-stale");
      });
      /* the live glyph at now (one per lane: fault outranks stale), drawn last so nothing covers it */
      if (live.length) s += S.glyph(sx1 - 6, fy - 2, live[0].state === "fault" ? "fault" : live[0].state === "offline" ? "offline" : "stale");

      /* live labels: one stacked block directly left of the now glyph, hung on a 1 px bracket leader
         that meets the lane at the glyph. Two lines straddle the lane (above, then below); one line
         sits below. Present tense stays at now, never beside a past event (P2). */
      const CH = 6.7;
      let liveBox = null;
      if (live.length) {
        const lines = live.slice(0, 2).map((sg) => ({ t: HUD.feedName(sg.fid) + " · " + sg.label, cls: sg.state === "fault" ? "hi-fault-t" : "hi-stale-t" }));
        const xr = sx1 - 22, xb = xr + 5;
        const ys = lines.length === 2 ? [fy - 6, fy + 12] : [fy + 12];
        lines.forEach((q, k) => { s += text(xr, ys[k], q.t, q.cls, "end"); });
        const yt = ys[0] - 4, yb = ys[ys.length - 1] - 4;
        s += '<path class="s-hair k-line" d="M' + (xb - 3) + " " + h5(Math.min(yt, fy)) + "H" + h5(xb) + "V" + h5(Math.max(yb, fy)) + "H" + (xb - 3) + "M" + h5(xb) + " " + h5(fy) + "H" + (sx1 - 12) + '"/>';
        /* review r3 #3: a second live line that is stale/offline gets its own glyph at the now end, below the
           lane and level with its text line; its 1 px leader joins the same bracket */
        if (live.length > 1 && live[1].state !== "fault") {
          const gy = ys[1] - 4, gx = sx1 - 8;
          s += '<path class="s-hair k-line" d="M' + h5(xb) + " " + h5(gy) + "H" + (gx - 10) + '"/>';
          s += S.glyph(gx, gy, live[1].state === "offline" ? "offline" : "stale");
        }
        const wmax = Math.max(...lines.map((q) => q.t.length)) * CH;
        liveBox = { x0: xr - wmax - 8, x1: sx1 };
        if (past.some((sg) => sg.x1 > liveBox.x0 && sg.x0 < liveBox.x1 && !(live.some((l) => l.fid === sg.fid && sg.b >= l.a - 60))))
          console.warn("history: a past feed event sits under the live label block");
      }
      /* past labels: feed names, on the row under the lane, beside their own span. Spans that start
         within 10 px of each other share one label; a past span that runs straight into a live one on
         the same feed is part of that live incident and is named by the live block. */
      const groups = [];
      past.filter((sg) => !live.some((l) => l.fid === sg.fid && sg.b >= l.a - 60))
        .sort((p, q) => p.x0 - q.x0).forEach((sg) => {
          const g = groups[groups.length - 1];
          if (g && sg.x0 - g.x0 <= 10) { if (!g.names.includes(HUD.feedName(sg.fid))) g.names.push(HUD.feedName(sg.fid)); g.x1 = Math.max(g.x1, sg.x1); }
          else groups.push({ x0: sg.x0, x1: sg.x1, names: [HUD.feedName(sg.fid)] });
        });
      /* newest first, so the most recent event always keeps its name; an older label that has no room
         beside its span flips to the other side of it, and is dropped only if neither side is free */
      const taken = liveBox ? [[liveBox.x0, liveBox.x1]] : [];
      groups.slice().reverse().forEach((g) => {
        const lab = g.names.join(" · "), w = lab.length * CH;
        const free = (l, r) => l >= sx0 && r <= sx1 - 4 && taken.every(([a, b]) => r + 8 <= a || l >= b + 8);
        const tries = [["start", g.x0, g.x0, g.x0 + w], ["end", g.x0 - 6, g.x0 - 6 - w, g.x0 - 6]];
        const ok = tries.find(([, , l, r]) => free(l, r));
        if (ok) { s += text(ok[1], fy + 12, lab, "tx-num", ok[0]); taken.push([ok[2], ok[3]]); }
        else console.warn("history: no room for past feed label " + lab);
      });
      el.insertAdjacentHTML("beforeend", s + "</svg>");
    }

    /* ============================================================ table */
    function rowHTML(r, sel) {
      const state = r.state || "final";
      const isDet = r.role_tag === "DET";
      let txt;
      if (state === "decoding") txt = '<span class="decode-bar" style="--bar-w:' + Math.min(Math.round(r.duration_s * 8), 400) + 'px"></span><span class="decode-lbl">DECODING</span>';
      else if (state === "carrier_only") txt = "CARRIER ONLY · " + fmt.dur(r.duration_s);
      else if (state === "no_transcript_decoder_down") txt = "No transcript · decoder down.";
      else if (state === "failed") txt = "Decode failed · audio kept. " + C.btn("RETRY", { sm: true });
      else if (state === "undecodable") txt = "Not decoded · non-voice audio.";
      else if (isDet && r.detector) {
        const d = r.detector;
        txt = [esc(d.mp_label), d.defect ? C.tag.defect() + " " + esc(d.defect_text || "") : "NO DEFECTS", d.axles + " AX", d.mph + " MPH"].join('<span class="sep"></span>');
      } else if (r.words && r.words.length) txt = r.words.map((w) => '<span class="w' + (w.conf < 0.6 ? " lo" : "") + '">' + esc(w.w) + "</span>").join(" ");
      else txt = esc(r.transcript || "");
      if (state === "not_recorded") txt += ' <span class="not-rec">NOT RECORDED</span>';
      /* one case for every ID in a metadata column (P3): uppercase at render, detectors included */
      /* speaker column: the shared rule (HUD.speaker, spec §5.12: AMTK short form, crew suffix dropped, 16-char cut);
         a detector row names the train it read, if any */
      const spk = isDet ? (r.train_id ? HUD.speaker({ train_id: r.train_id }) : { who: "", full: "" }) : HUD.speaker({ train_id: r.train_id, speaker: r.speaker });
      const who = spk.who;
      const attrs = ['class="txrow' + (sel ? " is-selected" : "") + '"', 'data-row="' + state + '"', r.off_bank ? "data-offbank" : "", isDet ? "data-det" : "", r.detector && r.detector.defect ? "data-defect" : "", 'data-id="' + esc(r.id) + '"'].filter(Boolean).join(" ");
      return "<div " + attrs + '><span class="sel"></span><span class="c-time">' + esc(r.clock) + '</span><span class="c-aar">' + esc(r.aar4) + '</span><span class="c-chan">' + esc(r.label) +
        '</span><span class="c-feed">' + esc(r.feed_label) + '</span><span class="c-role">' + esc(r.role_tag) + '</span><span class="c-who">' + esc(who) +
        '</span><span class="c-dur">' + fmt.dur(r.duration_s) + '</span><span class="c-text">' + txt + "</span></div>";
    }
    function renderTable(H, rows, selTrain, pickRow) {
      const el = document.getElementById("hi-table");
      const mine = selTrain ? rows.filter((r) => r.train_id === selTrain) : [];
      const rest = rows.filter((r) => !mine.includes(r));
      const filters =
        '<div class="hi-filters">' +
          /* the table lists the whole range; the route tab drives the stringline only, so the chip says so */
          C.chip('ROUTE<span class="v">ALL ROUTES</span>', "filter", { button: true, pressed: false }) +
          (selTrain ? C.chip('TRAIN<span class="v">' + esc(HUD.fmt.trainId(selTrain)) + " ×</span>", "filter", { button: true, pressed: true }) : "") +
          ["BANK", "CHANNEL", "RAILROAD", "ROLE", "FEED"].map((f) => C.chip(f + " ▾", "filter", { button: true, pressed: false })).join("") +
          '<span class="hi-search"><span class="k">SEARCH</span>Transcript text</span>' +
          '<span class="t-micro hi-count"><span class="mono">' + rows.length + "</span> ROWS" + (SMALL ? "" : " · NEWEST FIRST · VIRTUALIZED") + "</span>" +
        "</div>";
      const head = '<div class="hi-thead hi-grid"><span>TIME</span><span>AAR</span><span>CHANNEL</span><span>FEED</span><span>ROLE</span><span>SPEAKER / TRAIN</span><span class="r">DUR</span><span>TEXT</span></div>';
      let body = "";
      /* rows that fit the box with two group rules and the more line; the table virtualizes the rest (brief §10.8) */
      const boxH = Math.round(el.getBoundingClientRect().height);
      const cap = Math.max(3, Math.floor((boxH - 62 - 2 * 22 - 20) / 33));
      let n = 0;
      if (mine.length) {
        const tr = trainsById[selTrain];
        /* the selected train's rows first; scrolled so the selected row is on screen */
        const room = Math.max(1, cap - 2), at = mine.findIndex((r) => pickRow && r.id === pickRow.id);
        const from = at >= room ? at - room + 1 : 0;
        const shown = mine.slice(from, from + room);
        body += '<div class="hi-group"><span class="label">ON STRING</span><span class="mono">' + esc(HUD.fmt.trainId(selTrain)) + (tr ? " · " + esc(tr.line.toUpperCase()) : "") + " · " + mine.length + " TX" +
          (shown.length < mine.length ? " · ROWS " + (from + 1) + "–" + (from + shown.length) + " OF " + mine.length : "") + '</span><span class="tag-sim">SIM</span><span class="grow"></span></div>';
        shown.forEach((r) => { body += rowHTML(r, pickRow && r.id === pickRow.id); n++; });
      }
      body += '<div class="hi-group"><span class="label">ALL IN RANGE</span><span class="mono">' + esc(H.range.start + "–" + H.range.end) + " · " + rows.length + ' TX</span><span class="grow"></span></div>';
      const room = Math.max(1, cap - n);
      rest.slice(0, room).forEach((r) => { body += rowHTML(r, pickRow && r.id === pickRow.id && !mine.length); });
      if (rest.length > room) body += '<div class="hi-more">+ ' + (rest.length - room) + " MORE ROWS BELOW</div>";
      el.innerHTML = filters + head + '<div class="hi-rows hi-grid">' + body + "</div>";
    }

    /* ============================================================ clip player */
    function renderPlayer(r, progress, playing, route) {
      const el = document.getElementById("hi-player");
      if (!r) { el.innerHTML = '<div class="empty"><div class="t-panel">NO CLIP SELECTED</div><div class="t-body">Click a tick or a row to load its clip.</div></div>'; return; }
      const pt = pointOn(route.id, r.place_id) || Object.values(routes).map((q) => q.points.find((p) => p.place_id === r.place_id)).find(Boolean);
      const recs = (r.receptions || []).slice().sort((a, b) => b.snr_db - a.snr_db);
      const ws = r.words || [];
      const textHTML = ws.length ? ws.map((w) => '<span class="' + (w.conf < 0.6 ? "lo" : "") + '">' + esc(w.w) + "</span>").join(" ") : '<span class="meta">' + esc(r.state.toUpperCase().replace(/_/g, " ")) + "</span>";
      el.innerHTML =
        '<div class="hi-phead"><span class="t-panel">CLIP</span><span class="mono">' + esc(r.clock_tenths || r.clock) + " " + esc(scn.tz.name) + "</span>" +
          '<span class="t-label">' + esc(r.aar + " · " + r.label) + "</span>" +
          '<span class="aside">' + (playing ? '<span class="hi-duck">LIVE AUDIO DUCKED −18 dB</span>' : "") + (r.sim ? C.tag.sim() : '<span class="t-micro">SEED</span>') + "</span></div>" +
        '<div class="hi-pmeta"><span><span class="k">TRAIN</span>' + esc(HUD.fmt.trainId(r.train_id || r.speaker || "")) + "</span>" +
          '<span><span class="k">MP</span>' + esc(pt ? pt.mp_label.replace("≈", "≈ ") : HUD.BLANK) + "</span>" +
          '<span><span class="k">RX</span>' + recs.map((q, i) => '<span class="' + (i === 0 ? "pri" : "") + '">' + HUD.feedName(q.feed_id) + " " + fmt.snr(q.snr_db).replace("SNR ", "") + "</span>").join(" · ") + "</span>" +
          '<span class="hi-prole"><span class="k">ROLE</span>' + esc(r.role_tag) + "</span></div>" +
        '<div class="hi-pviz" id="hi-pviz"><div class="bezel hi-wave" id="hi-wave"></div><div class="bezel hi-spec" id="hi-spec"></div></div>' +
        '<div class="hi-ptext">' + textHTML + "</div>" +
        '<div class="hi-pctl">' + C.btn("◂◂", { sm: false }) + C.btn(playing ? "❚❚ PAUSE" : "▶ PLAY", { primary: true }) + C.btn("▸▸") +
          '<span class="hi-speed">' + ["1×", "1.5×", "2×"].map((sp) => C.chip(sp, "filter", { button: true, pressed: sp === "1×" })).join("") + "</span>" +
          '<span class="hi-pos">' + fmt.dur(progress * r.duration_s) + ' <span class="of">/ ' + fmt.dur(r.duration_s) + "</span></span>" +
          '<a href="#" download>Opus ↓</a></div>';
      const viz = document.getElementById("hi-pviz");
      const W = Math.round(viz.getBoundingClientRect().width);
      /* 1920: wave 56 + spec 64; 1440: wave 44 + spec 48 (hi-pviz height set in history.css) */
      const wH = SMALL ? 44 : 56, sT = wH + 4, sH = SMALL ? 48 : 64, rY = sT + sH, vH = rY + 28;
      /* frozen waveform (M15), line tone: the live object's archive form */
      document.getElementById("hi-wave").innerHTML = '<svg class="hud wave-svg" width="' + W + '" height="' + wH + '" style="position:absolute;inset:0">' + S.waveform(envelope(r, Math.floor(W / 2)), W, wH, { live: false }) + "</svg>";
      const cv = document.createElement("canvas");
      cv.style.left = "1px"; cv.style.top = "1px";
      document.getElementById("hi-spec").appendChild(cv);
      drawSpectrogram(cv, r, W - 2, sH - 2);
      /* overlay: time ruler, kHz labels, playhead */
      let s = '<svg class="hud hi-pover" width="' + W + '" height="' + vH + '">';
      const step = r.duration_s > 8 ? 2 : r.duration_s > 4 ? 1 : 0.5;
      s += line(0, h5(rY), W, h5(rY), "s-hair k-faint");
      for (let t = 0; t <= r.duration_s + 1e-6; t += step / 2) {
        const x = h5(Math.min(W - 1, (t / r.duration_s) * W)), major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
        s += line(x, rY, x, rY + (major ? 8 : 4), "s-hair " + (major ? "k-line" : "k-faint"));
        if (major && t > 0 && (t / r.duration_s) * W < W - 24) s += text(Math.round((t / r.duration_s) * W), rY + 20, t.toFixed(t % 1 ? 1 : 0) + " S", "tx-num", "middle");
      }
      s += text(4, sT + 14, "4 KHZ", "tx-lab", "start") + text(4, rY - 4, "0", "tx-lab", "start");
      const px = Math.round(progress * (W - 2)) + 1;
      s += line(px, 0, px, rY, "hi-playhead");
      s += '<path class="hi-cap" d="M' + (px - 5) + " -6H" + (px + 5) + "L" + px + ' 0Z"/>';
      viz.insertAdjacentHTML("beforeend", s + "</svg>");
    }
  }

  main().catch((e) => HUD.fail(e));
})();

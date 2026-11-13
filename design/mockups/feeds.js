/* ==========================================================================
   sdrviz · WLT-1 · Feeds & Banks admin (brief §9.4)
   Job: "Are my receivers healthy, and what is each one listening to?"
   Owner: screen designer "feeds-banks". Uses _shared/hud.js (HUD.*); never edits it.

   URL:  feeds.html?state=listening|keyed|fault|fault-acked[&feed=alx|lnd|bwi|bay][&build=0][&gray=1]
   Data (P3, every value computed, nothing typed into the drawing):
     data/sim/scenarios/<state>.js   window.SDRVIZ_SCENARIOS[state]  (feeds, channels, banks, system, lofar)
     data/sim/day.js                 window.SDRVIZ_DAY  (routes for the coverage thumbnail, health events)
     data/seed/frequencies.json      inline in feeds.html (confidence + source links)
   ========================================================================== */
(async function () {
  "use strict";
  const H = window.HUD;
  const C = H.c;
  const esc = H.esc;
  const BLANK = H.BLANK;
  const MINUS = "−";

  if (H.params.gray === "1") document.documentElement.dataset.gray = "";

  /* ------------------------------------------------------------ data */
  const SCENARIOS = ["listening", "keyed", "fault", "fault-acked"];
  const scnName = SCENARIOS.includes(H.state) ? H.state : "listening";
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("DATA NOT FOUND · " + src.replace(H.ROOT, "")));
      document.head.appendChild(s);
    });

  let scn, day;
  try {
    await loadScript(H.ROOT + "data/sim/scenarios/" + scnName + ".js");
    await loadScript(H.ROOT + "data/sim/day.js");
    scn = window.SDRVIZ_SCENARIOS[scnName];
    day = window.SDRVIZ_DAY;
  } catch (err) {
    H.fail(err, document.getElementById("stage"));
    return;
  }
  const seedFreqs = JSON.parse(document.querySelector('script[data-path="data/seed/frequencies.json"]').textContent).frequencies;
  const SEED = Object.fromEntries(seedFreqs.map((f) => [f.id, f]));

  const feeds = scn.feeds;
  const FEED = Object.fromEntries(feeds.map((f) => [f.id, f]));
  const CHAN = Object.fromEntries(scn.channels.map((c) => [c.id, c]));
  const chNum = (c) => parseInt(String(c.aar).replace(/\D/g, ""), 10);
  const live = scn.active_transmissions || [];

  /* Which feed the inspector opens on comes from the fixture: displayed_feed_admin (+ _why).
     displayed_feed is Live Ops' front-wall feed (the bank's home feed) and is not the admin choice:
     in keyed it is LND-02, but the inspector opens on BAY-04, the sdrviz-agent feed that hears CH66. */
  const pickFeed = () => {
    const q = H.params.feed;
    if (q && FEED["feed-" + q]) return FEED["feed-" + q];
    return FEED[scn.displayed_feed_admin] || FEED[scn.displayed_feed] || feeds[0];
  };
  const sel = pickFeed();

  /* ------------------------------------------------------------ helpers */
  /* round half away from zero on a decimal-safe value (2.3975 -> 2.398, never the float round-down 2.397),
     so a card and the inspector always agree on the same fixture value */
  const roundDp = (v, d) => { const k = 10 ** d; return Math.round(v * k + Math.sign(v) * 1e-9) / k; };
  const fix = (v, d) => (v == null ? BLANK : H.fmt.num(roundDp(Number(v), d), d));
  const n1 = (v) => fix(v, 1);
  const pct = (v) => (v == null ? BLANK : Math.round(v) + "");
  const isMeasured = (f) => f.state === "ok"; /* measured values exist only while samples flow */
  const ageLabel = (s) => (s == null ? BLANK : H.fmt.age(s, "age"));
  const sinceClock = (f) => H.fmt.clock(H.fmt.parseClock(scn.clock) - Math.round(f.last_sample_age_s || 0), scn.tz.name);

  /** Feed visual state (brief §8.9 escalation, §3.5 frame rules for an object card). */
  const feedLook = (f) => {
    if (!f.enabled) return { frame: "offline", glyph: "offline", tone: "is-stale" };
    if (f.state === "fault") return { frame: f.acked ? "stale" : "fault", glyph: "fault", tone: "is-fault" };
    if (f.state === "offline") return { frame: "offline", glyph: "offline", tone: "is-stale" };
    if (f.state === "stale") return { frame: "stale", glyph: "stale", tone: "is-stale" };
    return { frame: "idle", glyph: "idle", tone: "" };
  };
  const drvName = (f) => f.driver.replace(/\s*·\s*SIM$/, "");
  const siteName = (f) => f.name.replace(f.short, "").trim().toUpperCase();
  const bankAbbr = (b) => b.name.split(/[\s-]+/)[0].slice(0, 3).toUpperCase();

  /** Small horizontal gauge in the M16 anatomy, for non-dB quantities (HOST card, agent telemetry).
      o = { w, v, min, max, major, minor, thr:[values], stale } */
  const gauge = (o) => {
    const w = o.w || 120, x = (v) => Math.round(((Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min)) * (w - 1));
    let s = '<svg class="fb-gauge" width="' + w + '" height="12" viewBox="0 0 ' + w + ' 12" aria-hidden="true">';
    for (let v = o.min; v <= o.max + 1e-9; v += o.minor) {
      const major = Math.abs((v - o.min) / o.major - Math.round((v - o.min) / o.major)) < 1e-6;
      s += '<rect class="tick" x="' + x(v) + '" y="' + (major ? 2 : 4) + '" width="1" height="' + (major ? 4 : 2) + '"/>';
    }
    s += '<rect class="base" x="0" y="9" width="' + w + '" height="1"/>';
    (o.thr || []).forEach((t) => (s += '<path class="thr" d="M' + (x(t) + 0.5) + ' 0V12"/>'));
    if (o.v != null) s += '<rect class="bar' + (o.stale ? " is-stale" : "") + '" x="0" y="8" width="' + Math.max(1, x(o.v)) + '" height="2"/>';
    return s + "</svg>";
  };

  /* ------------------------------------------------------------ shell */
  const hdr = scn.header;
  const chips = HUD.headerChips(scn, { txChip: true }); /* shared (hud.js): same chip set on every screen */
  const dec = scn.system.decoder;

  /* status line (§8.1, §8.9): the latest UNACKED event on the left; an acked fault leaves the left side
     and only counts on the right (`1 ACK'D FAULT`). Events come from scn.faults + scn.degraded, and the
     text is the fixture's own status_line entry for that object. */
  let status = { text: "" };
  const ackedCount = scn.faults.filter((f) => f.acked).length;
  const openEvents = scn.faults.filter((f) => !f.acked).concat(scn.degraded)
    .sort((a, b) => H.fmt.parseClock(b.since) - H.fmt.parseClock(a.since));
  if (openEvents.length) {
    const ev = openEvents[0];
    const msg = scn.status_line.find((l) => l.startsWith(ev.short + " · ") && !/ · ACK'D$/.test(l));
    status = { text: msg, fault: ev.state === "fault", acked: ackedCount };
  } else if (ackedCount) {
    status = { text: "NO UNACKNOWLEDGED EVENTS", acked: ackedCount };
  } else {
    let last = null;
    Object.values(day.health.feeds).forEach((hf) =>
      (hf.events || []).forEach((e) => { if (e.t <= scn.t_offset_s && (!last || e.t > last.e.t)) last = { e, short: hf.short }; }));
    status = { text: last ? last.short + " · " + (last.e.state === "ok" ? "RECOVERED" : last.e.label) + " · " + H.fmt.clock(last.e.clock, scn.tz.name) : "NO SYSTEM EVENTS SINCE 00:00 " + scn.tz.name };
  }

  const content = H.shell("#stage", {
    screen: "feeds",
    scope: ["FEED", sel.short],
    clock: scn.clock,
    zone: scn.tz.name,
    chips,
    audio: "on",
    status,
  });

  /* ------------------------------------------------------------ hero (64 px) */
  const enabled = feeds.filter((f) => f.enabled);
  const nominal = enabled.filter((f) => f.state === "ok").length;
  const monitored = scn.channels.filter((c) => c.monitored);
  const unbanked = scn.channels.filter((c) => !c.banks.length);
  const unheard = scn.channels.filter((c) => !c.monitored);
  const activeBank = scn.banks.find((b) => b.id === scn.active_bank);

  /* hero (§9.4): FEEDS NOMINAL n/m, then the worst current values in the fixture's own ranking
     (header.feeds_hero_ranked: unacked fault > acked fault > offline > stale). */
  const ranked = (hdr.feeds_hero_ranked || []).map((r) => FEED[r.feed_id]);
  const verify = "FEEDS NOMINAL " + nominal + "/" + enabled.length + (ranked.length ? " · " + ranked[0].short + " · " + ranked[0].label + " " + ranked[0].in_state_label : "");
  if (verify !== hdr.feeds_hero) console.warn("feeds hero disagrees with fixture:", verify, "≠", hdr.feeds_hero);
  let hero = '<div class="hero fb-hero" data-fixture-hero="' + esc(hdr.feeds_hero) + '">';
  hero += '<span class="hero__text">FEEDS NOMINAL</span><span class="hero__big">' + nominal + "/" + enabled.length + "</span>";
  ranked.forEach((f, i) => {
    const look = feedLook(f);
    const reason = f.label;
    const sub = f.state === "fault"
      ? "SINCE " + H.fmt.clock(f.since, scn.tz.name) + (f.acked ? " · ACK'D" : " · UNACKNOWLEDGED")
      : "SINCE " + H.fmt.clock(f.since, scn.tz.name);
    if (i === 0) hero += '<span class="fb-rule"></span>';
    hero += '<span class="fb-worst">' + C.glyph(look.glyph) + '<span class="hero__stack"><span class="a ' + look.tone + '">' + esc(f.short + " · " + reason) + '</span><span class="b">' + esc(sub) + "</span></span>" +
      '<span class="fb-age' + (f.state === "stale" ? " is-stale" : "") + '">' + esc(f.state === "stale" ? f.in_state_label : f.in_state_label) + "</span></span>";
  });
  hero += '<span class="hero__aside">';
  if (live.length) {
    /* §9.0.1 / P4: only active-bank key-ups are orange here, in key-up order (oldest first);
       off-bank traffic is a quiet ink-2 count from the fixture's view (off_bank_label). */
    const view = scn.views[scn.active_bank];
    const inBank = live.filter((t) => activeBank.frequency_ids.includes(t.frequency_id)).sort((a, b) => b.elapsed_s - a.elapsed_s);
    const recCount = live.reduce((n, t) => n + t.receptions.length, 0);
    if (inBank.length) hero += '<span class="fb-keyed-k">KEYED</span><span class="fb-keyed-list">' + inBank.map((t) => esc(t.aar4)).join('<span class="sep"></span>') + "</span>";
    if (view.off_bank_label) hero += '<span class="fb-offbank">' + esc(view.off_bank_label) + "</span>";
    hero += '<span class="hero__stack"><span class="a">' + recCount + ' RECEPTIONS</span><span class="b">ON ' + new Set(live.flatMap((t) => t.receptions.map((r) => r.feed_id))).size + " FEEDS</span></span>";
    hero += '<span class="fb-rule"></span>';
  }
  hero += '<span class="hero__stack"><span class="a">' + esc(activeBank.name) + '</span><span class="b">ACTIVE BANK · HOME ' + esc(H.feedName(activeBank.home_feed)) + "</span></span>";
  hero += '<span class="fb-rule"></span>';
  hero += '<span class="hero__stack"><span class="a">' + monitored.length + " CH MONITORED</span><span class=\"b\">" + unheard.length + " NOT HEARD · " + unbanked.length + " UNBANKED</span></span>";
  hero += "</span></div>";

  /* ------------------------------------------------------------ left: HOST + feed cards */
  const host = scn.system.host;
  const disk = scn.system.disk;
  const hostLook = host.state === "fault" ? { frame: "fault", glyph: "fault" } : host.state === "degraded" ? { frame: "stale", glyph: "stale" } : { frame: "idle", glyph: "idle" };
  let left = '<div class="fb-col fb-col--feeds">';
  left += '<article class="fb-card" aria-label="Host, backend">' +
    '<span class="frame" data-frame="' + hostLook.frame + '"></span>' +
    '<header class="fb-card__head">' + C.glyph(hostLook.glyph) + '<span class="fb-card__site" style="color:var(--ink)">HOST</span><span class="fb-card__site">BACKEND</span>' +
    '<span class="fb-card__drv"><span class="t-micro">UPTIME</span> ' + H.fmt.age(host.uptime_s) + "</span></header>" +
    '<div class="fb-mini">' +
    '<div><span class="k">CPU</span><span class="v">' + pct(host.cpu_pct) + '<span class="u">%</span></span>' + gauge({ w: 120, v: host.cpu_pct, min: 0, max: 100, major: 20, minor: 10 }) + "</div>" +
    '<div><span class="k">SOC TEMP</span><span class="v">' + n1(host.soc_temp_c) + '<span class="u">°C</span></span>' + gauge({ w: 120, v: host.soc_temp_c, min: 30, max: 90, major: 10, minor: 5, thr: [80, 85] }) + "</div>" +
    '<div><span class="k">DISK</span><span class="v">' + pct(disk.pct) + '<span class="u">%</span></span>' + gauge({ w: 120, v: disk.pct, min: 0, max: 100, major: 20, minor: 10, thr: [85, 97] }) + "</div>" +
    '<div><span class="k">THROTTLED</span><span class="v is-set">' + (host.throttled ? "YES" : "NO") + "</span></div>" +
    '<div><span class="k">UNDER-VOLTAGE</span><span class="v is-set">' + (host.under_voltage ? "YES" : "NO") + "</span></div>" +
    '<div><span class="k">ASR QUEUE</span><span class="v">' + dec.queue + '<span class="u">· ' + n1(dec.median_latency_s) + " S</span></span></div>" +
    "</div></article>";

  const rxFor = (f) => {
    const rs = [];
    live.forEach((t) => t.receptions.forEach((r) => { if (r.feed_id === f.id) rs.push({ t, r }); }));
    return rs.sort((a, b) => b.r.snr_db - a.r.snr_db);
  };

  const telemetryLine = (f) => {
    const items = [["device_temp_c", "DEV TEMP", "°C"], ["host_cpu_pct", "HOST CPU", "%"], ["device_drops", "DROPS", ""]];
    if (f.driver === "rtl_tcp" || !f.telemetry) {
      return '<div class="fb-tel">' + items.slice(0, 2).map(([, k]) => '<span><span class="k">' + k + '</span><span class="v is-blank">' + BLANK + '</span></span>').join("") +
        '<span class="na">N/A · RTL_TCP</span></div>';
    }
    return '<div class="fb-tel">' + items.map(([key, k, u]) => {
      const v = f.telemetry[key];
      return '<span><span class="k">' + k + '</span><span class="v' + (v == null ? " is-blank" : "") + '">' + (v == null ? BLANK : (key === "device_drops" ? v : key === "host_cpu_pct" ? pct(v) : n1(v)) + (u ? " " + u : "")) + "</span></span>";
    }).join("") + '<span class="tag-sim">SIM</span></div>';
  };

  feeds.forEach((f) => {
    const look = feedLook(f);
    const unacked = f.state === "fault" && !f.acked;
    const meas = isMeasured(f);
    const isSel = f.id === sel.id;
    let stateLine;
    if (f.state === "ok") {
      stateLine = '<span class="k">HEARS</span>' + f.hears.length + ' CH<span class="sep"></span><span class="k">LAST SAMPLE</span>' + H.fmt.age(f.last_sample_age_s);
    } else {
      stateLine = '<span class="' + look.tone + '">' + esc(f.label) + "</span><span class=\"sep\"></span>" +
        '<span class="' + look.tone + '">' + esc(f.in_state_label) + "</span>" +
        (f.state === "fault" ? '<span class="sep"></span><span class="k">SINCE</span>' + esc(H.fmt.clock(f.since, scn.tz.name)) + (f.acked ? '<span class="sep"></span>ACK\'D' : "") : "");
    }
    const rx = rxFor(f);
    const rxLine = live.length
      ? '<div class="fb-rx' + (rx.length ? "" : " is-none") + '"><span class="k">RX</span>' +
        (rx.length
          ? rx.map(({ t, r }) => '<span class="r">' + C.glyph("tx") + esc(t.aar) + " <small>" + Math.round(r.snr_db) + " dB</small>" + (t.feed_id === f.id ? "<b>PRIMARY</b>" : "") + "</span>").join("")
          : '<span class="t-micro">NO KEY-UP HEARD</span>') + "</div>"
      : "";
    left += '<article class="fb-card' + (unacked ? " has-wash" : "") + (isSel ? " is-selected" : "") + '" tabindex="0" aria-label="' + esc(f.name + ", " + (f.state === "ok" ? "nominal" : f.label.toLowerCase())) + '">' +
      '<span class="frame" data-frame="' + look.frame + '"' + (unacked ? " data-onset" : "") + "></span><span class=\"sel\"></span>" +
      '<header class="fb-card__head">' + C.glyph(look.glyph) + '<span class="fb-card__id">' + esc(f.short) + '</span><span class="fb-card__site">' + esc(siteName(f)) + "</span>" + (f.sim ? C.tag.sim() : "") +
      '<span class="fb-card__drv is-slot" title="' + esc(drvName(f)) + '">' + esc(drvName(f)) + "</span>" + C.toggle("ENABLED", f.enabled) + "</header>" +
      '<div class="fb-card__state">' + stateLine + "</div>" +
      '<div class="fb-mini is-row">' +
      '<div><span class="k">RATE<span class="u">MS/s</span></span><span class="v' + (meas ? "" : " is-blank") + '">' + (meas ? fix(f.sample_rate_measured_msps, 3) : BLANK) + "</span></div>" +
      '<div><span class="k">CENTRE<span class="u">MHz</span></span><span class="v is-set">' + H.fmt.freq(f.center_mhz) + "</span></div>" +
      '<div><span class="k">GAIN<span class="u">dB</span></span><span class="v is-set">' + n1(f.gain_db) + "</span></div>" +
      '<div><span class="k">PPM</span><span class="v is-set">' + fix(f.ppm, 0) + "</span></div>" +
      '<div><span class="k">SNR<span class="u">dB</span></span><span class="v' + (f.snr_db == null ? " is-blank" : "") + '">' + (f.snr_db == null ? BLANK : Math.round(f.snr_db)) + "</span></div>" +
      '<div><span class="k">' + (meas ? "LAST" : "AGE") + '</span><span class="v' + (meas ? "" : " is-stale") + '">' + (meas ? H.fmt.age(f.last_sample_age_s) : ageLabel(f.last_sample_age_s)) + "</span></div>" +
      "</div>" + telemetryLine(f) + rxLine + "</article>";
  });
  left += "</div>";

  /* ------------------------------------------------------------ centre: feed inspector */
  const IW = 570; /* inner width */
  const look = feedLook(sel);
  const selUnacked = sel.state === "fault" && !sel.acked;
  const selMeas = isMeasured(sel);
  const BAND = H.BAND;
  const pxCh = (ch, w) => Math.round(((ch - BAND.first) / (BAND.last - BAND.first)) * (w - 1));
  const slotW = (w) => w / (BAND.last - BAND.first + 1);
  const heardNums = sel.hears.map((id) => chNum(CHAN[id]));
  const bankNums = activeBank.frequency_ids.map((id) => chNum(CHAN[id]));
  const rxSel = rxFor(sel);

  /* deterministic idle ripple (smoothed, α-style), so the floor reads calm, not boiling (brief §7.5) */
  const ripple = (() => {
    let s = 0;
    for (const c of sel.id) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    const raw = Array.from({ length: IW }, () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 - 0.5) * 3.2; });
    return raw.map((_, i) => (raw[Math.max(0, i - 1)] + raw[i] * 2 + raw[Math.min(IW - 1, i + 1)]) / 4);
  })();

  /* Plot geometry: a 28 px left gutter carries the axis labels (dB, minutes) outside the plot,
     so a cell at CH07..CH10 never sits under a label. Spectrum, ruler and waterfall share x. */
  const GX = 28, PW = IW - GX;
  const xCh = (ch) => GX + pxCh(ch, PW);
  const SW_ = slotW(PW);
  const SPEC_H = 96, DB_MIN = -80;
  const yDb = (db) => Math.round((Math.min(0, Math.max(DB_MIN, db)) / DB_MIN) * SPEC_H);
  let spec = '<svg class="hud fb-svg" width="' + IW + '" height="' + (SPEC_H + 40) + '" viewBox="0 0 ' + IW + " " + (SPEC_H + 40) + '">';
  [-20, -40, -60].forEach((db) => (spec += '<text class="num" x="' + (GX - 4) + '" y="' + (yDb(db) + 4) + '" text-anchor="end">' + MINUS + -db + "</text>"));
  spec += '<g transform="translate(' + GX + ' 0)">';
  spec += '<rect x="0" y="0" width="' + PW + '" height="' + SPEC_H + '" fill="var(--bg-void)"/>';
  /* M3 graticule: 10 × 8 divisions, minor ticks on the centre axes only */
  let g = "";
  for (let i = 1; i < 10; i++) g += "M" + H.snap((PW * i) / 10) + " 0V" + SPEC_H;
  for (let j = 1; j < 8; j++) g += "M0 " + H.snap((SPEC_H * j) / 8) + "H" + PW;
  let mt = "";
  for (let i = 1; i < 50; i++) mt += "M" + H.snap((PW * i) / 50) + " " + (SPEC_H / 2 - 2) + "v4";
  for (let j = 1; j < 40; j++) mt += "M" + (PW / 2 - 2) + " " + H.snap((SPEC_H * j) / 40) + "h4";
  spec += '<g class="graticule"><path class="s-hair k-grid" d="' + g + '"/><path class="s-hair k-faint" d="' + mt + '"/></g>';
  spec += '<text class="num" x="' + (PW - 6) + '" y="14" text-anchor="end">10 dB/div · 135 kHz/div</text>';
  /* TX slots (wash-tx-plot + 1 px state-tx), under the trace; no text on the wash */
  rxSel.forEach(({ t }) => {
    const x = xCh(chNum(t)) - GX - SW_ / 2;
    spec += '<rect class="f-wash-tx-plot" x="' + x.toFixed(1) + '" y="0" width="' + SW_.toFixed(1) + '" height="' + SPEC_H + '"/>' +
      '<rect class="s-hair k-tx" x="' + (Math.round(x) + 0.5) + '" y="0.5" width="' + Math.max(1, Math.round(SW_) - 1) + '" height="' + (SPEC_H - 1) + '"/>';
  });
  if (selMeas) {
    let d = "";
    for (let x = 0; x < PW; x++) {
      const chf = BAND.first + (x / (PW - 1)) * (BAND.last - BAND.first);
      let p = Math.pow(10, (sel.noise_floor_dbfs + ripple[x]) / 10);
      rxSel.forEach(({ t, r }) => { const dd = chf - chNum(t); p += Math.pow(10, r.rssi_dbfs / 10) * Math.exp(-((dd / 0.2) ** 2)); });
      d += (x ? "L" : "M") + x + " " + (yDb(10 * Math.log10(p)) + 0.5);
    }
    spec += '<path class="s-emph k-line glow-1" d="' + d + '"/><path class="s-emph k-line" d="' + d + '"/>';
    spec += '<path class="s-hair k-idle-dim" d="M0 ' + (yDb(sel.noise_floor_dbfs) + 0.5) + 'h6"/>';
  } else {
    spec += '<text class="lab" x="' + PW / 2 + '" y="' + (SPEC_H / 2 + 4) + '" text-anchor="middle">NO SAMPLES · LAST ' + esc(sinceClock(sel)) + "</text>";
  }
  spec += '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (PW - 1) + '" height="' + (SPEC_H - 1) + '"/>';
  spec += H.svg.regMark(0, 0);
  spec += "</g>"; /* the M2 ruler is appended after the waterfall pass, once the off-bank labels are known */

  /* LOFAR waterfall: 120 rows × 30 s = 60 min, newest at top (waterfall scrolls down, P8).
     A row with samples is painted with the feed's measured floor (one flat ramp tone, same mapping
     as the cells); a row without samples stays bg-void. "No samples" comes from last_sample_age_s
     and from the day's per-minute health state, so a gap earlier in the hour is a gap too, never a zero. */
  const lof = scn.lofar_60m;
  const WF_H = lof.rows;
  const hf = (day.health.feeds || {})[sel.id] || {};
  const floorDb = sel.noise_floor_dbfs ?? hf.noise_floor_dbfs; /* while faulted the live value is null: use the feed's configured floor */
  /* one ramp mapping for floor and cells: −52 dBFS (just below the quietest floor, −49) to −10 dBFS, so a
     measured quiet floor (about −45) lands on a low but visible ground tone and void stays void */
  const lofT = H.lofarT; /* shared mapping, hud.js */
  const gapRows = selMeas ? 0 : Math.ceil((sel.last_sample_age_s || 0) / lof.row_s);
  /* health is per minute and coarser than a 30 s row, so a row that holds a measured cell has samples */
  const minuteState = (hf.series_1m || {}).state;
  const cells = lof.cells[sel.id] || {};
  const cellRows = new Set(Object.values(cells).flatMap((rows) => rows.map(([row]) => row)));
  const sampled = Array.from({ length: WF_H }, (_, r) => {
    if (r < gapRows) return false;
    if (!minuteState || cellRows.has(r)) return true;
    return minuteState[Math.floor((scn.t_offset_s - (r + 0.5) * lof.row_s) / 60)] === "ok";
  });
  const runs = []; /* [first row, end row, sampled] */
  sampled.forEach((v, r) => (runs.length && runs[runs.length - 1][2] === v ? (runs[runs.length - 1][1] = r + 1) : runs.push([r, r + 1, v])));
  const bankHeard = heardNums.filter((c) => bankNums.includes(c));
  const guideChs = [...new Set(bankHeard.concat(Object.keys(cells).map(Number)))].sort((a, b) => a - b);

  /* the 120 data rows sit 1 px inside the plot frame (P8: no hairline ever covers the newest row) */
  const WF_IN = 1;
  let wf = '<svg class="hud fb-svg" width="' + IW + '" height="' + (WF_H + 2 * WF_IN) + '" viewBox="0 0 ' + IW + " " + (WF_H + 2 * WF_IN) + '">';
  for (let r = 30; r < WF_H; r += 30) {
    wf += '<path class="s-hair k-faint" d="M' + (GX - 3) + " " + (r + WF_IN + 0.5) + 'h3"/>' +
      '<text class="num" x="' + (GX - 5) + '" y="' + (r + WF_IN + 4) + '" text-anchor="end">' + (r * lof.row_s) / 60 + "M</text>";
  }
  wf += '<g transform="translate(' + GX + " " + WF_IN + ')">';
  wf += '<rect x="0" y="0" width="' + PW + '" height="' + WF_H + '" fill="var(--bg-void)"/>';
  const floorFill = floorDb == null ? null : H.rampColor(lofT(floorDb));
  if (floorDb == null) console.warn("feeds: no noise floor in fixture for", sel.id);
  let guides = "";
  runs.filter((rn) => rn[2]).forEach(([a, b]) => {
    if (floorFill) wf += '<rect x="0" y="' + a + '" width="' + PW + '" height="' + (b - a) + '" fill="' + floorFill + '"/>';
    guideChs.forEach((ch) => {
      const x = xCh(ch) - GX;
      guides += "M" + H.snap(x - SW_ / 2) + " " + a + "V" + b + "M" + H.snap(x + SW_ / 2) + " " + a + "V" + b;
    });
  });
  if (guides) wf += '<path class="s-hair k-grid" d="' + guides + '"/>';
  /* live key-ups carry their TX slot down from the spectrum (brief §3.3, Do #8): same x and width,
     height = elapsed rows, at least 4 px so it reads as a shape; over the floor and under the cells, so a
     cell is never covered. The outline is open at the top: the frame above row 0 closes it. */
  rxSel.forEach(({ t }) => {
    const x = xCh(chNum(t)) - GX - SW_ / 2;
    const hh = Math.min(WF_H, Math.max(4, Math.ceil((t.elapsed_s || 0) / lof.row_s)));
    wf += '<rect class="f-wash-tx-plot" x="' + x.toFixed(1) + '" y="0" width="' + SW_.toFixed(1) + '" height="' + hh + '"/>';
    const xl = Math.round(x) + 0.5, xr = xl + Math.max(1, Math.round(SW_) - 1);
    wf += '<path class="s-hair k-tx" d="M' + xl + " 0V" + (hh - 0.5) + "H" + xr + "V0" + '"/>';
  });
  let dropped = 0;
  Object.entries(cells).forEach(([ch, rows]) => {
    const x = xCh(+ch) - GX - SW_ / 2;
    rows.forEach(([row, lvl]) => {
      if (!sampled[row]) { dropped++; return; }
      wf += '<rect x="' + x.toFixed(1) + '" y="' + row + '" width="' + SW_.toFixed(1) + '" height="1" fill="' + H.rampColor(lofT(lvl)) + '"/>';
    });
  });
  if (dropped) console.warn("feeds: lofar cells inside a no-samples row, not drawn:", dropped);
  /* void runs: a dotted edge where the void meets measured ground, and the words once */
  runs.filter((rn) => !rn[2]).forEach(([a, b]) => {
    /* the dotted edges sit inside the void run, never on a sampled row; a run of 2 rows or fewer gets one line */
    const edges = b - a <= 2 ? [a + 0.5] : [a > 0 ? a + 0.5 : null, b < WF_H ? b - 0.5 : null].filter((y) => y != null);
    edges.forEach((y) => (wf += '<path class="s-hair k-stale d-offline" d="M0 ' + y + "H" + PW + '"/>'));
    const words = a === 0 && !selMeas
      ? "NO SAMPLES SINCE " + sinceClock(sel)
      : "NO SAMPLES · " + H.fmt.clock(H.fmt.parseClock(scn.clock) - b * lof.row_s, scn.tz.name).slice(0, 5) + "–" + H.fmt.clock(H.fmt.parseClock(scn.clock) - a * lof.row_s, scn.tz.name).slice(0, 5);
    wf += '<text class="lab" x="' + (PW - 8) + '" y="' + Math.min(WF_H - 4, b + 14) + '" text-anchor="end">' + esc(words) + "</text>";
  });
  wf += '<rect class="s-hair k-faint" x="0.5" y="-0.5" width="' + (PW - 1) + '" height="' + (WF_H + 1) + '"/>';
  wf += H.svg.regMark(0, -1) + "</g></svg>"; /* the mark sits on the frame line, above row 0 */

  /* Off-bank labels on the inspector ruler (ink-3, the Live Ops off-bank treatment): every live
     slot and every waterfall column that the shared ruler does not number gets its AAR number. */
  const offLab = [...new Set(rxSel.map(({ t }) => chNum(t)).concat(guideChs))].filter((c) => !bankHeard.includes(c)).sort((a, b) => a - b);
  /* the shared ruler centres its numbers; an off-bank number that would touch a neighbour slides
     sideways just enough (never onto the next number), so CH12 next to CH14 reads "12 14" */
  const LW = 2 * 6.6, GAP = 4, LIM = 8; /* GAP = the §11.7 4 px clearance */
  const extraLabels = [];
  const labs = bankHeard.map((c) => ({ c, x: xCh(c) + 0.5, fixed: true }))
    .concat(offLab.map((c) => ({ c, x: xCh(c) + 0.5, fixed: false }))).sort((a, b) => a.c - b.c);
  labs.forEach((l, i) => {
    if (l.fixed) return;
    const prev = labs[i - 1], next = labs[i + 1];
    if (next && next.x - l.x < LW + GAP) l.x = Math.max(xCh(l.c) + 0.5 - LIM, next.x - LW - GAP);
    if (prev && l.x - prev.x < LW + GAP) l.x = Math.min(xCh(l.c) + 0.5 + LIM, prev.x + LW + GAP);
    if ((next && next.x - l.x < LW) || (prev && l.x - prev.x < LW)) console.warn("feeds: ruler labels still touch at CH", l.c);
    extraLabels.push({ x: l.x - GX, text: H.fmt.aar(l.c).slice(0, 2) });
  });
  /* M2 ruler: bank numerals + off-bank numerals win; a MHz numeral that would touch one is dropped (spec §11.7) */
  spec += '<g transform="translate(' + GX + ' 0)">' + H.svg.freqRuler({ x: 0, y: SPEC_H, w: PW, h: 40, hears: heardNums, bank: bankNums, extraLabels }) + "</g>";
  spec += "</svg>";

  /* 15-minute sample-rate stability (one value per minute) */
  const HALF = 273;
  const sr = sel.sample_rate_15m;
  const SR_W = HALF - 44, SR_H = 70, SR_MIN = 2.39, SR_MAX = 2.4;
  const ySr = (v) => Math.round(((SR_MAX - Math.max(SR_MIN, Math.min(SR_MAX, v))) / (SR_MAX - SR_MIN)) * (SR_H - 1));
  const xSr = (i) => Math.round((i / (sr.length - 1)) * (SR_W - 1));
  let srs = '<svg class="hud fb-svg" width="' + HALF + '" height="' + (SR_H + 22) + '" viewBox="0 0 ' + HALF + " " + (SR_H + 22) + '">';
  [SR_MAX, (SR_MIN + SR_MAX) / 2, SR_MIN].forEach((v) => {
    srs += '<path class="s-hair ' + (v === SR_MAX ? "k-faint d-threshold" : "k-grid") + '" d="M0 ' + (ySr(v) + 0.5) + "H" + SR_W + '"/>' +
      '<text class="num" x="' + (SR_W + 6) + '" y="' + (ySr(v) + 4) + '">' + v.toFixed(3) + "</text>";
  });
  let segs = [], cur = "";
  sr.forEach((v, i) => {
    if (v > 0) cur += (cur ? "L" : "M") + xSr(i) + " " + (ySr(v) + 0.5);
    else if (cur) { segs.push(cur); cur = ""; }
  });
  if (cur) segs.push(cur);
  segs.forEach((d) => (srs += '<path class="s-hair k-line" d="' + d + '"/>'));
  sr.forEach((v, i) => { if (v > 0) srs += '<rect class="f-line" x="' + (xSr(i) - 1) + '" y="' + (ySr(v) - 1) + '" width="3" height="3"/>'; });
  const zeros = sr.map((v, i) => (v > 0 ? null : i)).filter((v) => v != null);
  if (zeros.length) {
    const a = Math.max(0, zeros[0] - 1), b = zeros[zeros.length - 1] + (zeros[zeros.length - 1] < sr.length - 1 ? 1 : 0);
    srs += '<path class="s-hair k-stale d-offline" d="M' + xSr(a) + " " + (SR_H - 0.5) + "H" + xSr(b) + '"/>' +
      '<text class="lab" x="' + xSr(b) + '" y="' + (SR_H - 6) + '" text-anchor="end">NO SAMPLES</text>';
  }
  srs += '<text class="num" x="0" y="' + (SR_H + 16) + '">' + MINUS + "15M</text>" +
    '<text class="num" x="' + SR_W + '" y="' + (SR_H + 16) + '" text-anchor="end">NOW</text>';
  srs += "</svg>";

  /* coverage thumbnail: rotated like the Map (DC left, Baltimore right), rings every 5 km, M23 hatch */
  const placesStations = day.routes.routes.flatMap((r) => r.points);
  const union = placesStations.find((p) => p.place_id === "wash-union");
  const penn = placesStations.find((p) => /penn/i.test(p.place_id) && /balt/i.test(p.place_id)) || placesStations.find((p) => /Baltimore Penn/i.test(p.name));
  const lat0 = sel.lat, lon0 = sel.lon, kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
  const km = (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
  const [ux, uy] = km(union.lat, union.lon), [bx, by] = km(penn.lat, penn.lon);
  const phi = Math.atan2(by - uy, bx - ux);
  const CV_H = 92, R = sel.coverage_radius_km, sc = (CV_H / 2 - 6) / R, cx = HALF / 2, cy = CV_H / 2;
  const proj = (lat, lon) => {
    const [x, y] = km(lat, lon);
    const xr = x * Math.cos(phi) + y * Math.sin(phi), yr = -x * Math.sin(phi) + y * Math.cos(phi);
    return [cx + xr * sc, cy - yr * sc];
  };
  const fill = (look.frame === "fault") ? " is-fault" : "";
  let cv = '<svg class="hud fb-svg" width="' + HALF + '" height="' + CV_H + '" viewBox="0 0 ' + HALF + " " + CV_H + '">';
  cv += '<defs><clipPath id="fb-cv-box"><rect x="1" y="1" width="' + (HALF - 2) + '" height="' + (CV_H - 2) + '"/></clipPath>' +
    '<clipPath id="fb-cv-ring"><circle cx="' + cx + '" cy="' + cy + '" r="' + R * sc + '"/></clipPath></defs>';
  cv += '<rect x="0" y="0" width="' + HALF + '" height="' + CV_H + '" fill="var(--bg-void)"/>';
  let hatch = "";
  /* M23 (spec §11.14): rest +45° ("/"), unacked fault −45° ("\") in state-fault-dim, same 8 px pitch */
  const faultHatch = !!fill;
  for (let k = -CV_H; k < HALF + CV_H; k += 8) hatch += faultHatch ? "M" + k + " 0L" + (k + CV_H) + " " + CV_H : "M" + k + " " + CV_H + "L" + (k + CV_H) + " 0";
  cv += '<g clip-path="url(#fb-cv-ring)"><path class="hatch' + fill + '" d="' + hatch + '"/></g>';
  cv += '<g clip-path="url(#fb-cv-box)">';
  day.routes.routes.forEach((r) => {
    const d = r.points.map((p, i) => { const [x, y] = proj(p.lat, p.lon); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("");
    cv += '<path class="' + (r.id === "r-nec" ? "s-hair k-line" : "s-hair k-faint") + '" d="' + d + '"/>';
  });
  for (let rk = 5; rk < R; rk += 5) cv += '<circle class="s-hair k-faint" cx="' + cx + '" cy="' + cy + '" r="' + rk * sc + '"/>';
  cv += '<circle class="s-hair k-line d-threshold" cx="' + cx + '" cy="' + cy + '" r="' + R * sc + '"/>';
  cv += "</g>";
  cv += H.svg.regMark(cx, cy, look.glyph === "fault" ? "fault" : look.frame === "stale" ? "stale" : "line"); /* red stays on the object until the fault clears */

  /* Label placement, one simple rule: try right, left, above, below, and take the first spot that
     stays inside the box, clear of the ring edge, the routes and every label already placed. */
  const RR = R * sc, PAD = 3, CHW = 6.7, ASC = 8, DSC = 2;
  const routePts = [];
  day.routes.routes.forEach((r) => {
    const pts = r.points.map((p) => proj(p.lat, p.lon));
    pts.slice(1).forEach(([x2, y2], i) => {
      const [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
      for (let k = 0; k <= n; k++) routePts.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
    });
  });
  const taken = [];
  const boxOf = (x, y, w, anchor) => {
    const x0 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    return { x0: x0 - 1, x1: x0 + w + 1, y0: y - ASC - 1, y1: y + DSC + 1 };
  };
  const cost = (bx) => {
    let c = 0;
    if (bx.x0 < PAD || bx.x1 > HALF - PAD || bx.y0 < PAD || bx.y1 > CV_H - PAD) c += 1000;
    const nx_ = Math.max(bx.x0, Math.min(cx, bx.x1)), ny_ = Math.max(bx.y0, Math.min(cy, bx.y1));
    const near = Math.hypot(nx_ - cx, ny_ - cy);
    const far = Math.max(...[[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x0, bx.y1], [bx.x1, bx.y1]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
    if (near < RR && far > RR) c += 300;          /* crosses the ring edge */
    else if (far <= RR) c += 150;                 /* sits on the hatch */
    taken.forEach((t) => { if (bx.x0 < t.x1 && bx.x1 > t.x0 && bx.y0 < t.y1 && bx.y1 > t.y0) c += 500; });
    routePts.forEach(([x, y]) => { if (x > bx.x0 && x < bx.x1 && y > bx.y0 && y < bx.y1) c += 2; });
    return c;
  };
  const place = (text, cands, cls) => {
    const w = text.length * CHW;
    let best = null;
    cands.forEach((cd) => { const bx = boxOf(cd.x, cd.y, w, cd.a), c = cost(bx); if (!best || c < best.c) best = { c, cd, bx }; });
    taken.push(best.bx);
    return '<text class="' + cls + ' fb-halo" x="' + best.cd.x.toFixed(1) + '" y="' + best.cd.y.toFixed(1) + '" text-anchor="' + best.cd.a + '">' + esc(text) + "</text>";
  };
  const around = (x, y, d) => [d, d + 6].flatMap((e) => [
    { x: x + e, y: y + 4, a: "start" }, { x: x - e, y: y + 4, a: "end" },
    { x, y: y - e, a: "middle" }, { x: x + 2, y: y - e, a: "start" }, { x: x - 2, y: y - e, a: "end" },
    { x, y: y + e + 8, a: "middle" }, { x: x + 2, y: y + e + 8, a: "start" }, { x: x - 2, y: y + e + 8, a: "end" },
  ]);

  /* north indicator (the view is turned): in the corner with the least going on, tick and letter inside */
  const nx = Math.sin(phi), ny = -Math.cos(phi), NC = 20;
  const corners = [[HALF - NC, CV_H - NC], [NC, CV_H - NC], [HALF - NC, NC], [NC, NC]];
  const nBox = ([x, y]) => ({ x0: x - NC + 4, x1: x + NC - 4, y0: y - NC + 4, y1: y + NC - 4 });
  const [ncx, ncy] = corners.map((k) => [k, cost(nBox(k))]).sort((p, q) => p[1] - q[1])[0][0];
  taken.push(nBox([ncx, ncy]));
  cv += '<path class="s-hair k-line" d="M' + (ncx - nx * 4).toFixed(1) + " " + (ncy - ny * 4).toFixed(1) + "l" + (nx * 10).toFixed(1) + " " + (ny * 10).toFixed(1) + '"/>' +
    '<text class="lab" x="' + (ncx + nx * 12).toFixed(1) + '" y="' + (ncy + ny * 12 + 4).toFixed(1) + '" text-anchor="middle">N</text>';

  /* ring distance: on the outer (threshold) ring, just outside the hatch */
  const ringC = [-45, -135, 45, 135].map((deg) => {
    const t = (deg * Math.PI) / 180, x = cx + Math.cos(t) * (RR + 3), y = cy + Math.sin(t) * (RR + 3);
    return { x: x + (Math.cos(t) > 0 ? 1 : -1), y: y + (Math.sin(t) > 0 ? 9 : -1), a: Math.cos(t) > 0 ? "start" : "end" };
  });
  cv += place(sel.coverage_radius_km + " KM", ringC, "num");

  /* the other feeds: site dot + id */
  feeds.filter((f) => f.id !== sel.id).forEach((f) => {
    const [x, y] = proj(f.lat, f.lon);
    if (x < 0 || x > HALF || y < 0 || y > CV_H) return;
    taken.push({ x0: x - 3, x1: x + 3, y0: y - 3, y1: y + 3 });
  });
  feeds.filter((f) => f.id !== sel.id).forEach((f) => {
    const [x, y] = proj(f.lat, f.lon);
    if (x < 0 || x > HALF || y < 0 || y > CV_H) return;
    cv += '<circle class="site" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2"/>' + place(f.short, around(x, y, 6), "num");
  });
  cv += '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (HALF - 1) + '" height="' + (CV_H - 1) + '"/>' + H.svg.regMark(0, 0) + "</svg>";

  /* telemetry the client measures or set itself (available on every driver) */
  const deficit = selMeas ? ((sel.sample_rate_msps - sel.sample_rate_measured_msps) / sel.sample_rate_msps) * 100 : null;
  const kvBlank = (k) => '<div class="kv is-blank"><span class="k">' + esc(k) + '</span><span class="v">' + BLANK + "</span></div>";
  const conn = sel.state === "fault" ? '<span class="is-fault" style="color:var(--state-fault)">' + esc(sel.label.replace("FAULT · ", "")) + "</span>" : sel.state === "offline" ? "RECONNECTING" : "CONNECTED";
  const measured = [
    C.kv("CONNECTION", conn),
    selMeas ? C.kv("RATE MEASURED", fix(sel.sample_rate_measured_msps, 4), { unit: "MS/s" }) : kvBlank("RATE MEASURED"),
    selMeas ? C.kv("RATE DEFICIT", fix(deficit, 2), { unit: "%" }) : kvBlank("RATE DEFICIT"),
    selMeas ? C.kv("NOISE FLOOR", n1(sel.noise_floor_dbfs), { unit: "dBFS" }) : kvBlank("NOISE FLOOR"),
    selMeas ? C.kv("SNR", Math.round(sel.snr_db), { unit: "dB" }) : kvBlank("SNR"),
    C.kv(selMeas ? "LAST SAMPLE" : "LAST SAMPLE AGE", selMeas ? H.fmt.age(sel.last_sample_age_s) : '<span class="is-stale">' + ageLabel(sel.last_sample_age_s) + "</span>"),
  ].join("");
  const asSet = [
    C.kv("DRIVER", esc(drvName(sel)), { sim: drvName(sel) !== sel.driver }),
    C.kv("CENTRE", H.fmt.freq(sel.center_mhz), { unit: "MHz" }),
    C.kv("RATE SET", fix(sel.sample_rate_msps, 3), { unit: "MS/s" }),
    C.kv("GAIN", n1(sel.gain_db), { unit: "dB" }),
    C.kv("PPM", fix(sel.ppm, 0)),
    C.kv("HEARS", sel.hears.length, { unit: "CH" }),
  ].join("");

  /* driver-dependent: rtl_tcp has no status channel (12-byte greeting, then raw I/Q) */
  const TEL = [["device_temp_c", "DEVICE TEMP", "°C", { min: 0, max: 100, major: 20, minor: 10 }], ["host_cpu_pct", "REMOTE HOST CPU", "%", { min: 0, max: 100, major: 20, minor: 10 }],
    ["host_temp_c", "REMOTE HOST TEMP", "°C", { min: 0, max: 100, major: 20, minor: 10 }], ["device_drops", "DEVICE DROPS", "", null]];
  const isRtl = sel.driver === "rtl_tcp" || !sel.telemetry;
  const telHtml = TEL.map(([key, k, u, gs]) => {
    if (isRtl) return C.kv(k, null, { na: "RTL_TCP", meter: gs ? { w: HALF } : null });
    const v = sel.telemetry[key];
    if (v === undefined) return '<div class="kv is-blank"><span class="k">' + k + '</span><span class="v">' + BLANK + '<span class="fb-nr">NOT REPORTED</span></span>' + (gs ? gauge(Object.assign({ w: HALF, v: null }, gs)) : "") + "</div>";
    if (v === null) return '<div class="kv is-blank"><span class="k">' + k + '</span><span class="v">' + BLANK + ' <span class="tag-sim">SIM</span></span>' + (gs ? gauge(Object.assign({ w: HALF, v: null }, gs)) : "") + "</div>";
    const val = key === "device_drops" ? String(v) : key === "host_cpu_pct" ? pct(v) : n1(v);
    return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + val + (u ? '<span class="u">' + u + "</span>" : "") + ' <span class="tag-sim">SIM</span></span>' +
      (gs ? gauge(Object.assign({ w: HALF, v, stale: !selMeas }, gs)) : "") + "</div>";
  });

  const kindParts = ["FEED", '<span class="mono">' + esc(drvName(sel)) + "</span>", esc(sel.site.toUpperCase()), "R " + sel.coverage_radius_km + " KM"];
  if (sel.state !== "ok") kindParts.unshift('<span class="' + look.tone + '">' + esc(sel.label) + " · " + esc(sel.in_state_label) + "</span>");
  const headRight = selUnacked
    ? C.btn("ACK", { primary: true, sm: true })
    : sel.state === "fault" && sel.acked
      ? C.chip("ACK'D " + esc(H.fmt.clock(sel.acked_at, scn.tz.name).slice(0, 8)), "acked", { glyph: "fault" })
      : "";

  let insp = '<div class="fb-col fb-col--insp"><section class="fb-insp br" aria-label="Feed inspector">';
  insp += '<header class="fb-insp__head">' + C.glyph(look.glyph) + '<span class="t-panel">' + esc(sel.short + " · " + siteName(sel)) + "</span>" + (sel.sim ? C.tag.sim() : "") + '<span class="grow"></span>' + headRight + "</header>";
  insp += '<div class="fb-insp__kind">' + kindParts.join('<span class="sep"></span>') + "</div>";
  insp += '<div class="fb-sec" style="top:70px"><h4>SPECTRUM · ' + esc(sel.short) + '<span class="r">' +
    (selMeas ? "FLOOR " + n1(sel.noise_floor_dbfs) + " dBFS · SNR " + Math.round(sel.snr_db) + " dB" : BLANK) + '</span></h4><div class="fb-plot">' + spec + "</div></div>";
  insp += '<div class="fb-sec" style="top:244px"><h4>WATERFALL · LAST 60 MIN<span class="r">' + lof.row_s + ' S/ROW · <span class="label">NEWEST AT TOP</span></span></h4><div class="fb-plot">' + wf + "</div></div>";
  insp += '<div class="fb-sec" style="top:404px;right:auto;width:' + HALF + 'px"><h4>SAMPLE RATE · 15 MIN<span class="r">' +
    (selMeas ? fix(sel.sample_rate_measured_msps, 4) + " MS/s" : BLANK) + '</span></h4><div class="fb-plot">' + srs + "</div></div>";
  insp += '<div class="fb-sec" style="top:404px;left:auto;width:' + HALF + 'px"><h4>COVERAGE<span class="r">R ' + sel.coverage_radius_km + ' KM · <span class="label">RINGS 5 KM</span></span></h4><div class="fb-plot">' + cv + "</div></div>";
  insp += '<div class="fb-sec" style="top:534px"><h4>TELEMETRY · ALL DRIVERS<span class="r"><span class="label">MEASURED BY SDRVIZ · OR AS SET</span></span></h4>' +
    '<div class="fb-kv2"><div><div class="colhead">MEASURED</div>' + measured + '</div><div><div class="colhead">AS SET</div>' + asSet + "</div></div></div>";
  insp += '<div class="fb-sec" style="top:742px"><h4>DEVICE + REMOTE HOST<span class="r"><span class="label">' +
    (isRtl ? "RTL_TCP SENDS NO STATUS · 12-BYTE GREETING, THEN I/Q" : esc(drvName(sel).toUpperCase()) + " · AGENT-ERA FIELDS") + "</span></span></h4>" +
    '<div class="fb-kv2">' + telHtml.join("") + "</div></div>";
  insp += '<div class="fb-sec" style="bottom:12px"><div class="fb-disc"><span class="disclosure" role="button" tabindex="0" aria-expanded="false">RECEIVER PARAMETERS</span>' +
    '<span class="t-micro">GAIN · SQUELCH DEFAULTS · FFT SIZE · PPM CORRECTION</span></div></div>';
  insp += "</section></div>";

  /* ------------------------------------------------------------ right: banks */
  const keyedIds = new Set(live.map((t) => t.frequency_id));
  const levLook = (c) => {
    if (keyedIds.has(c.id)) return "is-tx";
    if (!c.monitored || c.coverage.state === "offline") return "is-off";
    if (c.coverage.state === "stale") return "is-stale";
    return "";
  };
  const glyphFor = (c) => (keyedIds.has(c.id) ? "tx" : !c.monitored || c.coverage.state === "offline" ? "offline" : c.coverage.state === "stale" ? "stale" : "idle");

  let banks = '<div class="fb-col fb-col--banks"><div class="fb-banks">';
  banks += '<div class="fb-ph"><span class="t-panel">BANKS</span><span class="mono">' + scn.banks.length + '</span><span class="t-micro">ONE LEVER PER CHANNEL · M = MUTE, GLOBAL</span>' + C.btn("+ NEW BANK", { sm: true }) + "</div>";
  banks += '<div style="margin-top:8px">';
  scn.banks.forEach((b) => {
    const chs = b.frequency_ids.map((id) => CHAN[id]);
    const notHeard = chs.filter((c) => !c.monitored).length;
    const stale = chs.filter((c) => c.monitored && c.coverage.state === "stale").length;
    const noFeeds = chs.filter((c) => c.monitored && c.coverage.state === "offline").length;
    const levers = [...chs].sort((a, b2) => chNum(a) - chNum(b2)).map((c) =>
      '<span class="lever-wrap ' + levLook(c) + '" title="' + esc(c.aar + " · " + c.label) + '">' + C.lever("M", false, H.fmt.aar(chNum(c)).slice(0, 2)) + "</span>").join("");
    const notes = [];
    if (b.id === scn.active_bank) notes.push(C.chip("LIVE OPS", "active"));
    const cov = [];
    if (stale) cov.push('<span style="color:var(--state-stale)"><span class="mono">' + stale + "</span> STALE</span>");
    if (noFeeds) cov.push('<span class="mono">' + noFeeds + "</span> NO FEEDS");
    if (notHeard) cov.push('<span class="is-dim"><span class="mono">' + notHeard + "</span> NOT HEARD</span>");
    if (b.frequency_ids.length > 20) cov.push("EXCEEDS LIVE OPS STANDARD CAPACITY AT 1920 × 1080 (20)");
    else if (b.frequency_ids.length > 15) cov.push("EXCEEDS LIVE OPS COMPACT CAPACITY AT 1440 × 900 (15)");
    banks += '<div class="fb-bank"><div class="fb-bank__meta"><span class="fb-bank__name"><span class="mono" style="font:500 11px/1 var(--font-data);color:var(--ink-2);letter-spacing:0">' + bankAbbr(b) + "</span>" + esc(b.name) + (b.sim ? C.tag.sim() : "") + "</span>" +
      '<span class="fb-bank__sub">' + b.frequency_ids.length + ' <span class="label">CH · HOME</span> ' + esc(H.feedName(b.home_feed)) + "</span></div>" +
      '<div class="fb-bank__levers">' + levers + "</div>" +
      '<div class="fb-bank__note">' + notes.join("") + (cov.length ? "<div>" + cov.join('<span class="sep"></span>') + "</div>" : "") + "</div></div>";
  });
  banks += "</div>";

  /* membership table */
  const bankHead = scn.banks.map((b) => "<span>" + bankAbbr(b) + "</span>").join("");
  const confWord = { high: "HIGH", med: "MED", low: "LOW" };
  const linkIcon = '<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path class="ln" d="M3.5 0.5H8.5V5.5M8.5 0.5L3 6M6.5 8.5H0.5V2.5"/></svg>';
  const row = (c) => {
    const s = SEED[c.id] || {};
    const k = keyedIds.has(c.id);
    const off = !c.monitored || c.coverage.state === "offline";
    const boxes = scn.banks.map((b) => C.check("", b.frequency_ids.includes(c.id)).replace('role="checkbox"', 'role="checkbox" aria-label="' + esc(b.name) + '"')).join("");
    return '<div class="fb-tr' + (k ? " is-tx has-wash" : "") + (off && !k ? " is-off" : "") + '" data-id="' + esc(c.id) + '">' + C.glyph(glyphFor(c)) +
      '<span class="ch">' + esc(c.aar) + '</span><span class="mhz">' + H.fmt.freq(c.freq_mhz) + '</span><span></span><span class="lbl">' + esc(c.label) + "</span>" +
      '<a class="conf" href="' + esc((s.sources || [])[0] || "#") + '" target="_blank" rel="noopener" title="Source">' + (confWord[s.confidence] || BLANK) + linkIcon + "</a>" +
      '<span class="fb-bk">' + boxes + "</span></div>";
  };
  const headRow = '<div class="fb-tr is-head"><span></span><span>CH</span><span>MHz</span><span></span><span>CHANNEL</span><span>CONF</span><span class="fb-bk">' + bankHead + "</span></div>";
  const byAar = (a, b) => chNum(a) - chNum(b) || a.id.localeCompare(b.id);
  const banked = scn.channels.filter((c) => c.banks.length).sort(byAar);
  const unb = unbanked.sort(byAar);
  const perCol = Math.ceil((banked.length + unb.length + 2) / 2);
  const col1 = banked.slice(0, perCol);
  const col2 = banked.slice(perCol);
  /* shared frequency: the same MHz on two channels (161.070) */
  const byMhz = {};
  scn.channels.forEach((c) => (byMhz[c.freq_mhz] = (byMhz[c.freq_mhz] || []).concat(c)));
  const shared = Object.values(byMhz).filter((v) => v.length > 1);
  const renderCol = (list, extra) => {
    let h = headRow, idx = 1, dims = "";
    for (let i = 0; i < list.length; i++) {
      h += row(list[i]);
      idx++;
      const pair = shared.find((p) => p.includes(list[i]) && p.includes(list[i + 1]));
      if (pair) {
        h += row(list[i + 1]);
        idx++;
        i++;
        const suffix = pair.map((c) => H.fmt.aar(chNum(c)) + " " + H.feedName(scn.feeds.find((f) => f.hears.includes(c.id))?.id)).join(" · ");
        h += '<div class="fb-tr is-note"><span><span>SAME FREQ · DIFFERENT FEEDS</span><span class="mono">' + esc(suffix) + "</span></span></div>";
        /* M12 dimension bracket: extension lines from the MHz values, 4 px tick ends, leader to the note */
        const y1 = (idx - 2) * 24 + 12, y2 = (idx - 1) * 24 + 12, yN = idx * 24 + 12, X = 130.5;
        dims += '<svg class="fb-dim" style="left:0;top:0" width="160" height="' + (yN + 12) + '"><path class="ext" d="M120 ' + (y1 + 0.5) + "H" + X + "M120 " + (y2 + 0.5) + "H" + X + '"/>' +
          '<path d="M' + X + " " + y1 + "V" + y2 + "M" + (X - 4) + " " + (y1 + 0.5) + "h8M" + (X - 4) + " " + (y2 + 0.5) + "h8M" + X + " " + y2 + "V" + (yN + 0.5) + "h6" + '"/></svg>';
        idx++;
      }
    }
    if (extra) h += extra;
    return '<div class="fb-tbl">' + h + dims + "</div>";
  };
  const unbHtml = '<div class="fb-tr is-grp"><span>UNBANKED<span class="mono">' + unb.length + " · MONITORED IN NO BANK</span></span></div>" + unb.map(row).join("");
  banks += '<div class="fb-ph" style="position:absolute;top:216px;left:0;right:0"><span class="t-panel">CHANNELS · BANK MEMBERSHIP</span><span class="t-micro">CLICK TO TOGGLE · B OPENS THE BANK MENU · DRAG OPTIONAL</span></div>';
  banks += '<div class="fb-tables" style="top:248px">' + renderCol(col1) + renderCol(col2, unbHtml) + "</div>";

  /* bank editor: forms per brief §9.4 (underline fields, typed confirmation for destructive actions) */
  const edit = scn.banks.find((b) => b.id === "bank-harbor") || scn.banks[scn.banks.length - 1];
  const biggest = Math.max(...scn.banks.map((b) => b.frequency_ids.length));
  banks += '<div class="fb-edit"><div class="fb-ph"><span class="t-panel">BANK · ' + esc(edit.name.toUpperCase()) + "</span>" + (edit.sim ? C.tag.sim() : "") + '<span class="t-micro">' + edit.frequency_ids.length + " CH</span></div>" +
    '<div class="fb-edit__row">' + C.field({ label: "BANK NAME", value: edit.name, text: true, width: 168 }) +
    C.field({ label: "HOME FEED", value: H.feedName(edit.home_feed), unit: "▾", width: 88 }) + C.btn("SAVE", { primary: true }) + '<span class="fb-vr"></span>' +
    C.field({ label: "TYPE THE BANK NAME TO DELETE", text: true, placeholder: edit.name, width: 176, hint: "Channels stay monitored and recorded." }) +
    C.btn("DELETE BANK", { disabled: true }) + "</div>" +
    '<div class="fb-cap">LIVE OPS CAPACITY<span class="sep"></span>STANDARD <span class="mono">20</span> AT <span class="mono">1920 × 1080</span><span class="sep"></span>COMPACT <span class="mono">15</span> AT <span class="mono">1440 × 900</span><span class="sep"></span>LARGEST BANK <span class="mono">' + biggest + "</span></div></div>";
  banks += "</div></div>";

  H.mount(content, hero + left + insp + banks);
  document.title = "SDRVIZ · FEEDS & BANKS · " + scnName.toUpperCase();
  H.buildOn(document);
})();

/* ==========================================================================
   sdrviz · WLT-1 · shared HUD helpers (vanilla JS, no build step)
   Owner: film-graphics-designer (lead). Screen designers: include, never edit.
   Spec: design/spec.md §9 documents every function here.

   window.HUD
     .state .size .motion .params      query-string state (§9.1)
     .fmt.*                             brief §4 formatting rules (§9.2)
     .load(path) .loadScenario(name)    data loading that works on file:// (§9.3)
     .resolveTile(state)                brief §3.5 five-layer precedence (§9.4)
     .c.*                               HTML component builders (strings)
     .svg.*                             SVG component builders (strings)
     .shell(stage, opts)                header + nav + status line + title block
     .startClock(el, t, zone)           header clock (frozen unless ?live=1)
     .mount(el, html) .buildOn() .reveal(el) .firePings(root)
   ========================================================================== */
(function () {
  "use strict";

  const HUD = {};
  const doc = document.documentElement;
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  /* repo root, resolved from this file's location: design/mockups/_shared/hud.js */
  HUD.ROOT = new URL("../../../", SCRIPT_SRC).href;
  HUD.BUILD = "MOCK-S2";

  /* ------------------------------------------------------------------ 1 params */
  const qs = new URLSearchParams(location.search);
  HUD.params = Object.fromEntries(qs.entries());
  HUD.state = qs.get("state") || doc.dataset.defaultState || "listening";
  HUD.size = qs.get("size") === "1440" ? 1440 : 1920;
  const prefersReduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  HUD.motion = qs.get("motion") || (prefersReduced ? "reduced" : "full");
  HUD.live = qs.get("live") === "1";
  doc.dataset.state = HUD.state;
  doc.dataset.size = String(HUD.size);
  doc.dataset.motion = HUD.motion;

  /* ------------------------------------------------------------------ 2 formatters (brief §4) */
  const MINUS = "−";
  const BLANK = "— — —";
  const pad = (n, w = 2) => String(Math.trunc(n)).padStart(w, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  HUD.esc = esc;
  HUD.BLANK = BLANK;

  HUD.fmt = {
    blank: BLANK,
    /** 160.92 -> "160.920" */
    freq: (mhz) => (mhz == null ? BLANK : Number(mhz).toFixed(3)),
    /** 54 -> "5454", 8 -> "0808" (AAR TX/RX pair) */
    aar: (ch) => (ch == null ? BLANK : pad(ch) + pad(ch)),
    /** 54 -> "CH54" */
    ch: (ch) => (ch == null ? BLANK : "CH" + pad(ch)),
    /** signed number with a true minus sign */
    num: (v, digits = 1) => (v == null || Number.isNaN(v) ? BLANK : (v < 0 ? MINUS : "") + Math.abs(v).toFixed(digits)),
    dbfs: (v) => (v == null ? BLANK : HUD.fmt.num(v, 1) + " dBFS"),
    snr: (v) => (v == null ? BLANK : "SNR " + Math.round(v) + " dB"),
    /** "BAA33.7" | "NEC 113.6" | ("NEC", 113.6) -> "NEC 113.6"; no prefix -> "≈ 4.2" */
    mp: (a, b) => {
      const p = HUD.fmt.mpParts(a, b);
      return p ? (p.derived ? "≈" + (p.prefix ? p.prefix + " " : " ") + p.num : p.prefix + " " + p.num) : BLANK;
    },
    mpParts: (a, b) => {
      if (a == null) return null;
      if (b != null) return { prefix: String(a).toUpperCase(), num: Number(b).toFixed(1), derived: false };
      /* "BAA33.7" native; "4.2" derived (no count); "≈CFP 85.6" derived but keeps its native count (routes.json) */
      const m = String(a).trim().match(/^(≈)?\s*([A-Za-z]+)?\s*(\d+(?:\.\d+)?)/);
      if (!m) return null;
      return { prefix: m[2] ? m[2].toUpperCase() : "", num: Number(m[3]).toFixed(1), derived: !!m[1] || !m[2] };
    },
    /** seconds-of-day | "14:07:30" -> "14:07:30 EST"; zone "UTC" shifts +5 h (EST) */
    clock: (t, zone = "EST") => {
      let s = typeof t === "string" ? HUD.fmt.parseClock(t) : Number(t);
      if (s == null || Number.isNaN(s)) return BLANK;
      if (zone === "UTC") s += 5 * 3600; /* EST = UTC-5 on 2026-11-08 */
      s = ((Math.floor(s) % 86400) + 86400) % 86400;
      return pad(s / 3600) + ":" + pad((s % 3600) / 60) + ":" + pad(s % 60) + " " + zone;
    },
    /** "14:07:30" -> 50850 */
    parseClock: (str) => {
      const m = String(str).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
    },
    /** clock without seconds: "07:00" */
    hm: (t) => HUD.fmt.clock(t, "").slice(0, 5),
    /** duration under 1 h: 7.4 -> "00:07.4" */
    dur: (s) => {
      if (s == null) return BLANK;
      const tenths = Math.floor(s * 10 + 1e-6);
      return pad(tenths / 600) + ":" + pad((tenths % 600) / 10) + "." + (tenths % 10);
    },
    /** totals: 6760 -> "01:52:40" */
    total: (s) => {
      if (s == null) return BLANK;
      const n = Math.round(s); /* round the total first, as gen_sim duration_label does */
      return pad(n / 3600) + ":" + pad((n % 3600) / 60) + ":" + pad(n % 60);
    },
    /** ages (brief §4): 48 -> "48S"; 240 -> "4M"; 4320 -> "1H 12M"; 183600 -> "2D 3H".
        form "age" adds seconds under 10 min: 72 -> "1M 12S". */
    age: (s, form = "last") => {
      if (s == null) return BLANK;
      s = Math.max(0, Math.floor(s));
      if (s < 60) return s + "S";
      if (s < 3600) {
        const m = Math.floor(s / 60);
        return form === "age" && s < 600 ? m + "M " + (s % 60) + "S" : m + "M";
      }
      if (s < 86400) return Math.floor(s / 3600) + "H " + Math.floor((s % 3600) / 60) + "M";
      return Math.floor(s / 86400) + "D " + Math.floor((s % 86400) / 3600) + "H";
    },
    pct: (v) => (v == null ? BLANK : Math.round(v) + "%"),
    /** train / speaker identifiers are uppercase everywhere (brief §1.2, M8): "Amtrak 53" -> "AMTRAK 53".
        Every screen prints a train id through this, so data blocks, CTC, stringline and logs cannot drift. */
    trainId: (id) => (id == null ? "" : String(id).trim().replace(/\s+/g, " ").toUpperCase()),
  };

  /* seed constants: feed ids -> callsigns, speaker roles -> tags (brief §9.0.7; POL dropped, decision #13) */
  HUD.FEEDS = { "feed-alx": "ALX-01", "feed-lnd": "LND-02", "feed-bwi": "BWI-03", "feed-bay": "BAY-04" };
  HUD.feedName = (id) => HUD.FEEDS[id] || String(id || "").toUpperCase();
  HUD.ROLES = { crew: "CRW", dispatcher: "DSP", operator: "OPR", detector: "DET", yardmaster: "YDM", mow: "MOW", MOW: "MOW", unknown: "UNK" };
  HUD.role = (r) => HUD.ROLES[r] || "UNK";
  HUD.SCREENS = [
    { id: "live-ops", name: "LIVE OPS", file: "live-ops.html" },
    { id: "history", name: "HISTORY", file: "history.html" },
    { id: "stats", name: "STATS", file: "stats.html" },
    { id: "feeds", name: "FEEDS & BANKS", file: "feeds.html" },
    { id: "map", name: "MAP", file: "map.html" },
  ];
  /* AAR band: ch n = 160.110 + 0.015 n MHz; ch07 160.215 ... ch97 161.565 (91 channels) */
  HUD.BAND = { lo: 160.215, hi: 161.565, first: 7, last: 97, step: 0.015 };
  HUD.chToMhz = (ch) => +(160.11 + 0.015 * ch).toFixed(3);
  HUD.mhzToCh = (mhz) => Math.round((mhz - 160.11) / 0.015);

  /* waterfall ramp (brief §3.3) for canvas drawing: t in 0..1 -> "rgb(r g b)" */
  HUD.RAMP = ["#04070A", "#0A1F28", "#124A5A", "#2C8FA8", "#7FD8EC", "#E8FBFF"];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const RAMP_RGB = HUD.RAMP.map(hex);
  HUD.rampColor = (t) => {
    t = Math.min(1, Math.max(0, t)) * (RAMP_RGB.length - 1);
    const i = Math.min(RAMP_RGB.length - 2, Math.floor(t));
    const f = t - i, a = RAMP_RGB[i], b = RAMP_RGB[i + 1];
    return "rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(" ") + ")";
  };

  /** 60-minute LOFAR strip / waterfall cell mapping (Live Ops, Feeds, System share it): dBFS -> 0..1 on the ramp.
      -52 dBFS = void, -10 dBFS = white; a -45 dBFS floor sits just above void. */
  HUD.lofarT = (dbfs) => Math.min(1, Math.max(0, (dbfs + 52) / 42));

  /* ------------------------------------------------------------------ 3 data loading
     file:// blocks fetch in Chromium, so data is found in this order:
       1. window.SDRVIZ_DATA[path]           (already registered)
       2. <script type="application/json" data-path="data/sim/...json"> inline in the page
       3. <script src="ROOT/path.js">        JS twin: SDRVIZ_DATA["path"] = {...}; (injected here)
       4. fetch(ROOT/path)                    works when served over http
     path is repo-relative, e.g. "data/sim/scenarios/keyed.json". */
  window.SDRVIZ_DATA = window.SDRVIZ_DATA || {};
  const injectScript = (src) =>
    new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve(true);
      s.onerror = () => { s.remove(); resolve(false); };
      document.head.appendChild(s);
    });

  /* tools/gen_sim.py twins (spec §8.4): scenarios/<name>.js -> SDRVIZ_SCENARIOS[name];
     day.js -> SDRVIZ_DAY = { routes, trains, transmissions, stats, health, banks }. */
  const simTwin = (path) => {
    let m = path.match(/^data\/sim\/scenarios\/([\w-]+)\.json$/);
    if (m) return { src: "data/sim/scenarios/" + m[1] + ".js", pick: () => (window.SDRVIZ_SCENARIOS || {})[m[1]] };
    m = path.match(/^data\/sim\/(routes|trains|transmissions|stats|health|banks)\.json$/);
    if (m) return { src: "data/sim/day.js", pick: () => (window.SDRVIZ_DAY || {})[m[1]] };
    return null;
  };

  HUD.load = async function (path) {
    const reg = window.SDRVIZ_DATA;
    if (reg[path]) return reg[path];
    const inline = document.querySelector('script[type="application/json"][data-path="' + path + '"]');
    if (inline) return (reg[path] = JSON.parse(inline.textContent));
    const twin = simTwin(path);
    if (twin) {
      if (twin.pick()) return (reg[path] = twin.pick());
      if (await injectScript(HUD.ROOT + twin.src) && twin.pick()) return (reg[path] = twin.pick());
    }
    if (await injectScript(HUD.ROOT + path + ".js") && reg[path]) return reg[path];
    try {
      const r = await fetch(HUD.ROOT + path);
      if (r.ok) return (reg[path] = await r.json());
    } catch (e) { /* file:// */ }
    throw new Error("DATA NOT FOUND · " + path);
  };
  HUD.loadScenario = (name = HUD.state) => HUD.load("data/sim/scenarios/" + name + ".json");
  HUD.loadSim = (name) => HUD.load("data/sim/" + name + ".json");
  HUD.loadSeed = (name) => HUD.load("data/seed/" + name + ".json");

  /** Visible, non-red notice for a missing fixture (a mockup problem, not an equipment fault). */
  HUD.fail = function (err, where) {
    const host = where || document.querySelector(".hud-content") || document.body;
    const el = document.createElement("div");
    el.className = "empty br";
    el.style.cssText = "position:absolute;inset:auto 0 0 0;top:40%;";
    el.innerHTML = '<div class="t-panel">MOCKUP DATA MISSING</div><div class="t-data-12">' + esc(err && err.message ? err.message : err) +
      '</div><div class="t-body">Run <span class="mono">uv run python tools/gen_sim.py</span>, or serve the repo over http.</div>';
    host.appendChild(el);
    console.error(err);
  };

  /* ------------------------------------------------------------------ 4 tile state resolver (brief §3.5)
     input  s = { tx, flash, commit, squelch, elapsed, fault:{reason, acked, onset}|null,
                  coverage:"ok"|"partial"|"stale"|"offline", feeds:[bool...], offlineLabel,
                  ageS, lastS, via, selected, muted, solo }
     output   { frame, glyph, status:{text, cls}, reason, ember, wash, aria } */
  HUD.resolveTile = function (s = {}, ch = {}) {
    const fault = s.fault || null;
    const cov = s.coverage || "ok";
    const unacked = fault && !fault.acked;
    let frame = "idle";
    if (unacked) frame = "fault";
    else if (s.tx) frame = s.flash && !s.muted ? "tx-flash" : "tx";
    else if (s.squelch) frame = "squelch";
    else if (fault || cov === "stale") frame = "stale"; /* acked fault, not tx/squelch: dashed stale frame */
    else if (cov === "offline") frame = "offline";

    let glyph = "idle";
    if (fault) glyph = "fault";
    else if (s.tx) glyph = "tx";
    else if (s.squelch) glyph = "squelch";
    else if (cov === "offline") glyph = "offline";
    else if (cov === "stale") glyph = "stale";

    let ember = null;
    if (!s.tx && s.lastS != null) ember = s.lastS < 120 ? "recent" : s.lastS < 600 ? "recent-dim" : null;

    let status = { text: "", cls: "" };
    if (s.tx) status = { text: "", cls: "" }; /* timer occupies the right zone */
    else if (s.reconnecting) status = { text: "AGE " + HUD.fmt.age(s.ageS, "age"), cls: "is-stale" };
    else if (cov === "offline") status = { text: s.offlineLabel || "NO FEEDS", cls: "is-stale" };
    else if (cov === "stale") status = { text: "AGE " + HUD.fmt.age(s.ageS, "age"), cls: "is-stale" };
    else if (ember) status = { text: "LAST " + HUD.fmt.age(s.lastS), cls: ember === "recent-dim" ? "is-dim" : "" };

    const wash = frame === "fault" || frame === "tx" || frame === "tx-flash";
    const words = ["Channel " + (ch.aar ?? ""), ch.label || ""];
    if (fault) words.push("fault, " + fault.reason.toLowerCase() + (fault.acked ? ", acknowledged" : ""));
    if (s.tx) words.push("transmitting", Math.floor(s.elapsed || 0) + " seconds");
    else if (s.squelch) words.push("squelch open");
    else if (cov === "stale") words.push("stale");
    else if (cov === "offline") words.push((s.offlineLabel || "no feeds").toLowerCase());
    if (s.via && (s.tx || ember)) words.push("via " + s.via);
    if (cov === "partial" && s.feeds) words.push(s.feeds.filter(Boolean).length + " of " + s.feeds.length + " feeds");
    return { frame, glyph, ember, status, wash, reason: fault ? "FAULT · " + fault.reason : "", aria: words.filter(Boolean).join(", ") };
  };

  /* ------------------------------------------------------------------ 5 HTML builders */
  const C = (HUD.c = {});

  C.glyph = (g = "idle", cls = "") => '<span class="glyph ' + cls + '" data-g="' + g + '" aria-hidden="true"></span>';

  /** M25 coverage pips: feeds = [true, true, false, true] */
  C.pips = (feeds = [], cls = "", withCount = true) => {
    const ok = feeds.filter(Boolean).length;
    const p = '<span class="pips ' + cls + '">' + feeds.map((f) => (f ? "<i></i>" : '<i class="is-bad"></i>')).join("") + "</span>";
    return withCount ? p + '<span class="pips-n"><span class="mono">' + ok + "/" + feeds.length + '</span> <span class="label">FEEDS</span></span>' : p;
  };

  /** M16 level meter as SVG. o = { w:120, db, peak, floor, tx, muted, na } (dBFS, -60..0) */
  C.meter = (o = {}) => {
    const w = o.w || 120, x = (db) => Math.round(((Math.max(-60, Math.min(0, db)) + 60) / 60) * (w - 1));
    let s = '<svg class="meter-svg' + (o.na ? " is-na" : "") + '" width="' + w + '" height="12" viewBox="0 0 ' + w + ' 12" aria-hidden="true">';
    for (let d = -60; d <= 0; d += 5) {
      const major = d % 10 === 0;
      s += '<rect class="tick' + (major ? " major" : "") + '" x="' + x(d) + '" y="' + (major ? 2 : 4) + '" width="1" height="' + (major ? 4 : 2) + '"/>';
    }
    s += '<rect class="base" x="0" y="9" width="' + w + '" height="1"/>';
    if (!o.na) {
      if (o.db != null) {
        const bw = Math.max(1, x(o.db));
        const cls = "bar" + (o.tx ? " is-tx" : "") + (o.muted ? " is-muted" + (o.tx ? "" : " is-idle") : "");
        s += o.muted
          ? '<rect class="' + cls + '" x="0.5" y="7.5" width="' + (bw - 1) + '" height="2"/>'
          : '<rect class="' + cls + '" x="0" y="8" width="' + bw + '" height="2"/>';
        if (o.peak != null) s += '<rect class="peak" x="' + x(o.peak) + '" y="2" width="1" height="8"/>';
      }
      if (o.floor != null) s += '<rect class="floor" x="' + x(o.floor) + '" y="6" width="1" height="4"/>';
    }
    return s + "</svg>";
  };

  /** M22 sparkline: 60 values (seconds of airtime per minute, oldest first; last = current minute).
      59 past columns at x 0..58, 4 px gap, current minute at x 63. Full scale 30 s/min. */
  C.spark = (vals = [], o = {}) => {
    const v = vals.slice(-60);
    while (v.length < 60) v.unshift(0);
    const h = (s) => (s > 0 ? Math.max(1, Math.round((Math.min(s, 30) / 30) * 14)) : 0);
    let s = '<svg class="spark-svg" width="64" height="14" viewBox="0 0 64 14" aria-hidden="true">';
    v.forEach((sec, i) => {
      const x = i < 59 ? i : 63, hh = h(sec);
      if (hh) s += '<rect class="col' + (i === 59 && o.live ? " is-now" : "") + '" x="' + x + '" y="' + (14 - hh) + '" width="1" height="' + hh + '"/>';
      else s += '<rect class="col is-zero" x="' + x + '" y="13" width="1" height="1"/>';
    });
    return s + "</svg>";
  };

  /** M21 lever row. o = { m, s, r } booleans; letters M / S / R */
  C.levers = (o = {}, cls = "") =>
    '<span class="levers ' + cls + '">' +
    [["M", "m", "Mute"], ["S", "s", "Solo"], ["R", "r", "Record"]]
      .map(([L, k, name]) => '<button class="lever" aria-pressed="' + !!o[k] + '" aria-label="' + name + '"><b>' + L + "</b></button>")
      .join("") + "</span>";

  /** One lever with its AAR number above (banks admin). */
  C.lever = (letter, on, aar) =>
    '<span style="display:inline-block">' + (aar != null ? '<span class="lever-aar">' + esc(aar) + "</span>" : "") +
    '<button class="lever" aria-pressed="' + !!on + '"><b>' + esc(letter) + "</b></button></span>";

  /** Channel tile. ch = { aar, label, mhz, railroad, use, suffix }, s = state (see resolveTile) + { meter, spark, levers, showLevers, variant, wave }
      s.wave: an SVG string (HUD.svg.waveform inside <svg class="hud">) shown in the standard TX tile's freed band. */
  C.tile = (ch = {}, s = {}, variant = s.variant || "standard") => {
    const r = HUD.resolveTile(s, ch);
    const attrs = [
      'class="tile tile--' + variant + (r.wash ? " has-wash" : "") + '"',
      'role="button" tabindex="0"',
      'aria-label="' + esc(r.aria) + '"',
      'data-frame="' + r.frame + '"',
      s.tx ? "data-tx" : "",
      r.ember ? 'data-ember="' + r.ember + '"' : "",
      'data-coverage="' + (s.coverage || "ok") + '"',
      s.fault ? 'data-fault="' + (s.fault.acked ? "acked" : "unacked") + '"' : "",
      s.selected ? "data-selected" : "",
      s.muted ? "data-muted" : "",
      s.solo ? "data-solo" : "",
      s.showLevers ? "data-levers" : "",
      s.focused ? "data-focused" : "",
    ].filter(Boolean).join(" ");
    const blanked = s.coverage === "offline";
    const aarTxt = variant === "strip" ? HUD.fmt.ch(ch.aar) : HUD.fmt.aar(ch.aar);
    const suffix = ch.suffix ? "<small>" + esc(ch.suffix) + "</small>" : "";
    const frameAttrs = (s.commit ? " data-commit" : "") + (s.fault && s.fault.onset && !s.fault.acked ? " data-onset" : "");
    const meterO = Object.assign({ w: variant === "compact" ? 64 : 120, tx: !!s.tx, muted: !!s.muted }, s.meter || {});
    if (!(s.tx || s.squelch)) { meterO.db = null; meterO.peak = null; } /* squelch closed: no bar (M16) */
    if (blanked) meterO.floor = null;
    const pipsHTML = s.coverage === "partial" && s.feeds ? C.pips(s.feeds, "tile__pips", true) : "";

    /* footer (standard only) */
    let footLeft;
    const railroad = esc((ch.railroad || "").toUpperCase());
    const showVia = s.via && (s.tx || r.ember);
    if (r.reason) footLeft = '<span class="is-fault">' + esc(r.reason) + "</span>";
    else if (showVia && (pipsHTML || s.muted || s.solo)) footLeft = "VIA " + esc(s.via);
    else if (showVia) footLeft = railroad + '<span class="sep"></span>VIA ' + esc(s.via);
    else if (pipsHTML || s.muted || s.solo) footLeft = railroad;
    else footLeft = railroad + (ch.use ? '<span class="sep"></span>' + esc(ch.use.toUpperCase()) : "");
    const tags = (s.muted ? '<span class="tag-muted">MUTED</span>' : "") + (s.solo ? '<span class="tag-solo">SOLO</span>' : "");

    let h = "<div " + attrs + ">";
    h += '<span class="frame" data-frame="' + r.frame + '"' + frameAttrs + "></span>";
    h += '<span class="sel"></span>';
    h += C.glyph(r.glyph, "tile__glyph");
    h += '<span class="tile__label">' + esc(ch.label || "") + "</span>";
    h += '<span class="tile__ember"></span>';
    h += '<span class="tile__status ' + r.status.cls + '">' + esc(r.status.text) + "</span>";
    if (variant !== "standard" && s.coverage === "partial" && s.feeds) h += C.pips(s.feeds, "tile__pips2", false);
    h += '<span class="tile__aar">' + (blanked && variant !== "strip" ? esc(aarTxt) : esc(aarTxt)) + suffix + "</span>";
    if (variant !== "standard" && r.reason) h += '<span class="tile__reason">' + esc(r.reason) + "</span>";
    h += '<span class="tile__mhz">' + (blanked ? BLANK : HUD.fmt.freq(ch.mhz)) + "</span>";
    if (variant === "standard") h += '<span class="tile__spark">' + (blanked ? "" : C.spark(s.spark || [], { live: !!s.tx })) + "</span>";
    h += '<span class="tile__timer">' + HUD.fmt.dur(s.elapsed || 0) + "</span>";
    if (variant !== "strip") h += '<span class="tile__meter">' + C.meter(meterO) + "</span>";
    if (variant !== "strip") h += '<span class="tile__levers">' + C.levers(s.levers || { m: s.muted, s: s.solo }) + "</span>";
    if (variant === "standard" && s.wave) h += '<span class="tile__wave">' + s.wave + "</span>"; /* M15, §5.6 */
    if (variant === "standard") h += '<span class="tile__foot"><span class="grow">' + footLeft + "</span>" + tags + pipsHTML + "</span>";
    return h + "</div>";
  };

  /** Bracketed chip. kind: nominal | active | armed | degraded | fault | acked | offline | tx | filter */
  C.chip = (text, kind = "nominal", o = {}) => {
    const tag = o.button ? "button" : "span";
    const g = o.glyph ? C.glyph(o.glyph) : "";
    return "<" + tag + ' class="chip ' + (o.cls || "") + '" data-chip="' + kind + '"' + (o.onset ? " data-onset" : "") +
      (o.pressed != null ? ' aria-pressed="' + !!o.pressed + '"' : "") + ">" + g + text + "</" + tag + ">";
  };

  C.tag = {
    sim: () => '<span class="tag-sim">SIM</span>',
    defect: () => '<span class="tag-defect">DEFECT</span>',
  };

  /** M8 data block (HTML). l1 "MARC 410", l2 "NEC 113.6 · CH54" */
  C.dataBlock = (l1, l2, o = {}) =>
    '<span class="datablock' + (o.tx ? " is-tx" : "") + (o.lg ? " is-lg" : "") + '"><span class="l1">' + esc(l1) +
    (o.sim ? ' <span class="tag-sim">SIM</span>' : "") + '</span><br><span class="l2">' + esc(l2) + "</span></span>";

  /** M9 milepost tag. "NEC 113.6" | "BAA33.7" | "4.2" (derived, shows ≈) */
  C.mpTag = (mp) => {
    const p = HUD.fmt.mpParts(mp);
    if (!p) return "";
    const [i, d] = p.num.split(".");
    return '<span class="mp-tag' + (p.derived ? " is-derived" : "") + '" aria-label="milepost ' + esc(HUD.fmt.mp(mp)) + '"><span class="p">' +
      (p.derived ? "≈" + esc(p.prefix) : esc(p.prefix)) + '</span><span class="i">' + i + '</span><span class="d">.' + d + "</span></span>";
  };
  C.mpInline = (mp) => {
    const p = HUD.fmt.mpParts(mp);
    return '<span class="mp-inline' + (p && p.derived ? " is-derived" : "") + '">' + esc(HUD.fmt.mp(mp)) + "</span>";
  };

  /** M10 title block. o = { screen, scope:[k, v], clock, zone, build, sim, osm } */
  C.titleBlock = (o = {}) => {
    const cells = [
      '<div><span class="v is-sheet">WLT-1</span></div>',
      '<div><span class="k">SCREEN</span><span class="v">' + esc(o.screen || "") + "</span></div>",
    ];
    if (o.scope) cells.push('<div><span class="k">' + esc(o.scope[0]) + '</span><span class="v">' + esc(o.scope[1]) + "</span></div>");
    cells.push('<div><span class="v hud-tb-clock">' + esc(o.clock || BLANK) + "</span></div>");
    cells.push('<div><span class="k">BUILD</span><span class="v">' + esc(o.build || HUD.BUILD) + "</span>" + (o.sim !== false ? '<span class="tag-sim">SIM</span>' : "") + "</div>");
    if (o.osm) cells.push('<div><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>');
    return '<div class="title-block">' + cells.join("") + "</div>";
  };

  /** Key/value row. v may be HTML. o = { unit, na:"RTL_TCP", meter:{...} } */
  C.kv = (k, v, o = {}) => {
    if (o.na) {
      return '<div class="kv is-na"><span class="k">' + esc(k) + '</span><span class="v">' + BLANK + '<span class="na">N/A · ' + esc(o.na) + "</span></span>" +
        (o.meter ? C.meter(Object.assign({ w: o.meter.w || 200, na: true })) : "") + "</div>";
    }
    return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + v + (o.unit ? '<span class="u">' + esc(o.unit) + "</span>" : "") +
      (o.sim ? ' <span class="tag-sim">SIM</span>' : "") + "</span>" + (o.meter ? C.meter(o.meter) : "") + "</div>";
  };

  /** Underline field. o = { label, value, unit, text, state:"default|focus|error|disabled|readonly", error, hint, type, placeholder } */
  C.field = (o = {}) => {
    const st = o.state || "default";
    /* "autofocus": the field the page opens on (login). Underline emphasis only, no ring (brief §8.5, spec §5.21). */
    const attrs = (st === "disabled" ? " disabled" : "") + (st === "readonly" ? " readonly" : "") + (st === "focus" ? " data-focus" : "") +
      (st === "autofocus" ? ' autofocus data-focus="auto"' : "");
    return '<label class="field' + (st === "error" ? " is-error" : "") + '"' + (o.width ? ' style="width:' + o.width + 'px"' : "") + '><span class="field__label">' + esc(o.label || "") + "</span>" +
      '<span style="position:relative;display:flex;align-items:baseline;gap:6px"><input class="field__input' + (o.text ? " field__input--text" : "") + '" type="' + (o.type || "text") + '" value="' + esc(o.value ?? "") + '"' +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") + attrs + ">" +
      (st === "autofocus" ? '<span class="field__caret" aria-hidden="true"></span>' : "") + (o.unit ? '<span class="field__unit">' + esc(o.unit) + "</span>" : "") + "</span>" +
      (st === "error" && o.error ? '<span class="field__error">' + esc(o.error) + "</span>" : "") + (o.hint ? '<span class="field__hint">' + esc(o.hint) + "</span>" : "") + "</label>";
  };
  C.check = (label, on) => '<span class="check" role="checkbox" tabindex="0" aria-checked="' + !!on + '"><i></i>' + esc(label) + "</span>";
  C.toggle = (label, on) => '<span class="toggle" role="switch" tabindex="0" aria-checked="' + !!on + '"><i></i>' + esc(label) + "</span>";
  C.btn = (label, o = {}) => '<button class="btn' + (o.primary ? " btn--primary" : "") + (o.sm ? " btn--sm" : "") + '"' + (o.disabled ? " disabled" : "") + ">" + esc(label) + "</button>";
  C.tabs = (items, selected) =>
    '<div class="tabs" role="tablist">' + items.map((it) => {
      const t = typeof it === "string" ? { id: it, name: it } : it;
      return '<button class="tab" role="tab" aria-selected="' + (t.id === selected) + '">' + esc(t.name) + (t.n != null ? '<span class="n">' + esc(t.n) + "</span>" : "") + "</button>";
    }).join("") + "</div>";

  /** Detector transcript -> structured parts (fallback when the row has no `detector` object). */
  HUD.parseDetector = (text, mpPrefix = "") => {
    const t = String(text || "");
    const mp = (t.match(/milepost\s+(\d+(?:\.\d+)?)/i) || [])[1];
    const ax = (t.match(/axles\s+(\d+)/i) || [])[1];
    const mph = (t.match(/speed\s+(\d+)/i) || [])[1];
    let defect = null;
    const d = t.match(/defect,\s*defect\.\s*([^.]+)\./i);
    if (d) defect = d[1].replace(/,/g, "").replace(/\bsouth\b/i, "S").replace(/\bnorth\b/i, "N").replace(/\beast\b/i, "E").replace(/\bwest\b/i, "W").toUpperCase();
    return { mp: mp ? (mpPrefix ? mpPrefix + " " : "≈ ") + Number(mp).toFixed(1) : null, axles: ax ? +ax : null, mph: mph ? +mph : null, defect };
  };

  /** Speaker cell (spec §5.12): train id, symbol or speaker, upper-cased; crew suffix dropped; operator short
      forms (Amtrak -> AMTK); cut at a word boundary past 16 mono-12 characters (the 120 px column). */
  const OPERATOR_SHORT = { amtrak: "AMTK" };
  HUD.speaker = (r = {}, given) => {
    if (HUD.role(r.speaker_role) === "DET" && !given) return { who: "", full: "" };
    const src = given || r.train_id || r.symbol || r.speaker || "";
    if (!src) return { who: "", full: "" };
    const full = String(src).replace(/\s+(engineer|conductor)$/i, "").toUpperCase();
    let who = full.split(/\s+/).map((w) => OPERATOR_SHORT[w.toLowerCase()] || w).join(" ");
    while (who.length > 16 && who.includes(" ")) who = who.slice(0, who.lastIndexOf(" "));
    return { who, full: String(r.speaker || src) };
  };

  /** Transcript row. r = seed/sim transmission row; o = { live, offbank, selected, who, mpPrefix, play, colW } */
  C.txRow = (r = {}, o = {}) => {
    const state = r.transcript_state || "final";
    const roleTag = HUD.role(r.speaker_role);
    const isDet = roleTag === "DET";
    const feed = r.feed_id ? HUD.feedName(r.feed_id) + (r.receptions && r.receptions.length > 1 ? " +" + (r.receptions.length - 1) : "") : "";
    const spk = HUD.speaker(r, o.who);
    const who = spk.who;
    const whoTitle = spk.full ? ' title="' + esc(spk.full) + '"' : "";
    let text = "";
    let det = null;
    if (state === "decoding") {
      const w = Math.min(Math.round((r.duration_s || 1) * 8), o.colW || 320);
      text = '<span class="decode-bar" style="--bar-w:' + w + 'px"></span><span class="decode-lbl">DECODING</span>';
    } else if (state === "carrier_only") text = "CARRIER ONLY · " + HUD.fmt.dur(r.duration_s);
    else if (state === "no_transcript_decoder_down") text = "No transcript · decoder down.";
    else if (state === "failed") text = "Decode failed · audio kept. " + C.btn("RETRY", { sm: true });
    else if (state === "undecodable") text = "Not decoded · non-voice audio.";
    else if (isDet) {
      det = r.detector || HUD.parseDetector(r.transcript, o.mpPrefix);
      /* each field is one non-breaking unit; a wrap only falls at a separator (brief §9.1.5) */
      const parts = [esc(det.mp || BLANK)];
      if (det.defect) parts.push(C.tag.defect(), esc(det.defect));
      else parts.push("NO DEFECTS");
      if (det.axles != null) parts.push(det.axles + " AX");
      if (det.mph != null) parts.push(det.mph + " MPH");
      text = parts.map((p) => '<span class="fld">' + p + "</span>").join('<span class="sep"></span>');
    } else if (r.words && r.words.length) {
      text = r.words.map((w) => '<span class="w' + (w.conf != null && w.conf < 0.6 ? " lo" : "") + '">' + esc(w.w) + "</span>").join(" ");
    } else text = esc(r.transcript || "");
    if (state === "not_recorded") text += ' <span class="not-rec">NOT RECORDED</span>';
    else if (o.play) text += ' <span class="play">▶ ' + HUD.fmt.dur(r.duration_s) + "</span>";
    const inlineWho = who ? '<span class="who-inline"' + whoTitle + ">" + esc(who) + "</span>" : "";
    const attrs = ['class="txrow' + (o.selected ? " is-selected" : "") + (o.live && !o.offbank ? " has-wash" : "") + '"', 'data-row="' + state + '"',
      o.live ? "data-live" : "", o.offbank ? "data-offbank" : "", isDet ? "data-det" : "", det && det.defect ? "data-defect" : "", r.id ? 'data-id="' + esc(r.id) + '"' : ""].filter(Boolean).join(" ");
    return "<div " + attrs + '><span class="sel"></span><span class="c-time">' + esc(String(r.clock_local || "").slice(0, 8)) + '</span><span class="c-ch">' + HUD.fmt.ch(r.aar_channel) +
      '</span><span class="c-feed">' + esc(feed) + '</span><span class="c-role">' + roleTag + '</span><span class="c-who"' + (who ? whoTitle : "") + ">" + esc(who) +
      '</span><span class="c-text">' + (isDet ? "" : inlineWho) + text + "</span></div>";
  };

  /** Inspector panel. o = { kind, title, sim, log, sections:[{ title, html }] } */
  C.inspector = (o = {}) =>
    '<aside class="inspector br" aria-label="Inspector"><div class="inspector__head">' + (o.glyph ? C.glyph(o.glyph) : "") +
    '<span class="t-panel">' + esc(o.title || "") + "</span>" + (o.sim ? C.tag.sim() : "") +
    (o.log ? C.chip("LOG +" + o.log, "active") : "") + C.chip("ESC", "nominal", { button: true }) + "</div>" +
    (o.kind ? '<div class="inspector__kind">' + esc(o.kind) + "</div>" : "") + (o.lead || "") +
    (o.sections || []).map((s) => '<section class="inspector__sec"><h4>' + esc(s.title) + "</h4>" + s.html + "</section>").join("") + "</aside>";

  /* ------------------------------------------------------------------ 6 SVG builders (return strings for inside an <svg class="hud">) */
  const S = (HUD.svg = {});
  const h5 = (v) => Math.round(v) + 0.5; /* half-pixel snap for 1 px strokes */
  HUD.snap = h5;

  /** M6 glyph in SVG at (cx, cy). */
  S.glyph = (cx, cy, g = "idle") => {
    const cls = { idle: "f-idle", squelch: "f-idle", tx: "f-tx", fault: "f-fault" }[g];
    const pts = { idle: [[-6, 0], [0, 0], [6, 0]], squelch: [[-6, 6], [0, 0], [6, -6]], tx: [[0, -6], [0, 0], [0, 6]], stale: [[-6, 0], [0, 0], [6, 0]] }[g];
    if (g === "offline") return '<path class="s-emph k-stale" d="M' + (cx - 5.5) + " " + (cy - 5.5) + "L" + (cx + 5.5) + " " + (cy + 5.5) + "M" + (cx + 5.5) + " " + (cy - 5.5) + "L" + (cx - 5.5) + " " + (cy + 5.5) + '"/>';
    if (g === "fault" || g === "fault-past") {
      const tri = "M" + cx + " " + (cy - 5) + "L" + (cx + 5) + " " + (cy + 4) + "L" + (cx - 5) + " " + (cy + 4) + "Z";
      return g === "fault" ? '<path class="f-fault" d="' + tri + '"/>' : '<path class="s-hair k-stale" d="' + tri + '"/>';
    }
    return pts.map(([dx, dy]) => (g === "stale"
      ? '<circle class="s-hair k-stale" cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="2"/>'
      : '<circle class="' + cls + '" cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="2.5"/>')).join("");
  };

  /** M4 registration mark: circle r 6, crosshair 4 px past it. state: line | stale | fault */
  S.regMark = (x, y, state = "line") => {
    const k = { line: "k-line", stale: "k-stale", fault: "k-fault" }[state] || "k-line";
    const X = h5(x), Y = h5(y);
    return '<g class="regmark"><circle class="s-hair ' + k + '" cx="' + X + '" cy="' + Y + '" r="6"/><path class="s-hair ' + k + '" d="M' + (X - 10) + " " + Y + "H" + (X + 10) + "M" + X + " " + (Y - 10) + "V" + (Y + 10) + '"/></g>';
  };

  /** M14 ping ring; call HUD.firePings(root) to animate once and remove after t-ping. */
  S.ping = (x, y, primary = false) => '<circle class="ping' + (primary ? " is-primary" : "") + '" cx="' + x + '" cy="' + y + '" r="6"/>';

  /** M8 data block with leader. o = { x, y, dir:"ne|e|se|s|sw|w|nw|n", len:24, l1, l2, tx, sim } */
  S.dataBlock = (o) => {
    const dirs = { ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1], n: [0, -1] };
    const [dx, dy] = dirs[o.dir || "ne"];
    const len = o.len || 24, k = dx && dy ? len / Math.SQRT2 : len;
    const ex = o.x + dx * k, ey = o.y + dy * k;
    const anchor = dx < 0 ? "end" : "start", tx = ex + (dx < 0 ? -4 : dx > 0 ? 4 : 0);
    const ty = dy > 0 ? ey + 12 : ey - 6;
    return '<g class="datablock-svg"><path class="s-hair ' + (o.tx ? "k-tx" : "k-line") + '" d="M' + o.x + " " + o.y + "L" + ex + " " + ey + '"/>' +
      '<text class="tx-data' + (o.tx ? " is-tx" : "") + '" x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '">' + esc(o.l1) + (o.sim ? '<tspan class="tx-lab" dx="6">SIM</tspan>' : "") + "</text>" +
      '<text class="tx-num2" x="' + tx + '" y="' + (ty + 15) + '" text-anchor="' + anchor + '">' + esc(o.l2) + "</text></g>";
  };

  /** M9 milepost tag in SVG, top-left at (x, y). */
  S.mpTag = (x, y, mp) => {
    const p = HUD.fmt.mpParts(mp);
    if (!p) return "";
    const [i, d] = p.num.split(".");
    return '<g class="mp-tag-svg"><rect class="s-hair k-line" x="' + h5(x) + '" y="' + h5(y) + '" width="31" height="47"/>' +
      '<text class="tx-lab" x="' + (x + 16) + '" y="' + (y + 15) + '" text-anchor="middle" style="letter-spacing:.04em">' + (p.derived ? "≈" + esc(p.prefix) : esc(p.prefix)) + "</text>" +
      '<text class="tx-data" style="font-size:11px" x="' + (x + 16) + '" y="' + (y + 28) + '" text-anchor="middle">' + i + "</text>" +
      '<text class="tx-num2" style="font-size:11px" x="' + (x + 16) + '" y="' + (y + 41) + '" text-anchor="middle">.' + d + "</text></g>";
  };

  /** M2 frequency ruler across [BAND.lo, BAND.hi]. o = { x, y, w, h:32, hears:[ch...], bank:[ch...], majorLabels:true,
      extraLabels:[{ x, text }] }
      every channel: 4 px line-faint; every 10th: 8 px line + MHz numeral;
      heard by displayed feed: 8 px line-faint; in active bank and heard: 12 px line + channel number.
      extraLabels: more channel numerals (e.g. off-bank, ink-3) at ruler-local x, same row as the bank numerals.
      Collision rule (spec §11.7, rev 3): channel numerals win. A MHz numeral is dropped when its text box
      comes within RULER_CLEAR px of any channel numeral's box, at every ruler height. */
  const RULER_CLEAR = 4;
  const MONO_ADV = 0.6; /* JetBrains Mono advance width per em */
  const textBox = (cx, base, chars, fs) => {
    const w = chars * fs * MONO_ADV;
    return { l: cx - w / 2, r: cx + w / 2, t: base - fs * 0.8, b: base + fs * 0.2 };
  };
  const boxesNear = (a, b, gap) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;
  HUD.rulerBoxesNear = boxesNear;
  S.freqRuler = (o) => {
    const { x = 0, y = 0, w } = o, H = o.h || 32;
    const hears = new Set(o.hears || []), bank = new Set(o.bank || []);
    const px = (ch) => x + Math.round(((ch - HUD.BAND.first) / (HUD.BAND.last - HUD.BAND.first)) * (w - 1));
    const CH_BASE = y + 23, CH_FS = 11, MHZ_BASE = y + H - 3, MHZ_FS = 11;
    const chBoxes = [];
    let ticks = "", nums = "", mhz = "";
    for (let ch = HUD.BAND.first; ch <= HUD.BAND.last; ch++) {
      const X = h5(px(ch)), major = ch % 10 === 0, inBank = bank.has(ch) && hears.has(ch), heard = hears.has(ch);
      let len = 4, k = "k-faint";
      if (inBank) { len = 12; k = "k-line"; } else if (major) { len = 8; k = "k-line"; } else if (heard) { len = 8; k = "k-faint"; }
      ticks += '<path class="s-hair ' + k + '" d="M' + X + " " + y + "V" + (y + len) + '"/>';
      if (inBank) {
        nums += '<text class="tx-num2" style="font-size:11px" x="' + X + '" y="' + CH_BASE + '" text-anchor="middle">' + pad(ch) + "</text>";
        chBoxes.push(textBox(X, CH_BASE, 2, CH_FS));
      }
    }
    (o.extraLabels || []).forEach((l) => {
      const lx = x + l.x;
      nums += '<text class="tx-num" style="font-size:11px" x="' + lx.toFixed(1) + '" y="' + CH_BASE + '" text-anchor="middle">' + esc(l.text) + "</text>";
      chBoxes.push(textBox(lx, CH_BASE, String(l.text).length, CH_FS));
    });
    if (o.majorLabels !== false) {
      for (let ch = HUD.BAND.first; ch <= HUD.BAND.last; ch++) {
        if (ch % 10 !== 0) continue;
        const X = h5(px(ch)), label = HUD.chToMhz(ch).toFixed(3);
        const b = textBox(X, MHZ_BASE, label.length, MHZ_FS);
        if (chBoxes.some((c) => boxesNear(b, c, RULER_CLEAR))) continue; /* the channel numeral wins */
        mhz += '<text class="tx-num" x="' + X + '" y="' + MHZ_BASE + '" text-anchor="middle">' + label + "</text>";
      }
    }
    return '<g class="ruler"><path class="s-hair k-faint" d="M' + x + " " + h5(y) + "H" + (x + w) + '"/>' + ticks + nums + mhz + "</g>";
  };

  /** Generic M2 ruler. o = { x, y, w, min, max, minor, major, label:(v)=>str, flip } (ticks hang down from y unless flip) */
  S.ruler = (o) => {
    const { x = 0, y = 0, w, min, max, minor, major } = o;
    const px = (v) => x + Math.round(((v - min) / (max - min)) * (w - 1));
    const dir = o.flip ? -1 : 1;
    let s = '<g class="ruler"><path class="s-hair k-faint" d="M' + x + " " + h5(y) + "H" + (x + w) + '"/>';
    const n = Math.round((max - min) / minor);
    for (let i = 0; i <= n; i++) {
      const v = min + i * minor, X = h5(px(v));
      const isMajor = Math.abs(((v - min) / major) - Math.round((v - min) / major)) < 1e-6;
      s += '<path class="s-hair ' + (isMajor ? "k-line" : "k-faint") + '" d="M' + X + " " + y + "V" + (y + dir * (isMajor ? 8 : 4)) + '"/>';
      if (isMajor && o.label) s += '<text class="tx-num" x="' + X + '" y="' + (y + (o.flip ? -12 : 20)) + '" text-anchor="middle">' + esc(o.label(v)) + "</text>";
    }
    return s + "</g>";
  };

  /** M15 waveform: env = [[min, max], ...] in -1..1, drawn as a 1 px min/max envelope. */
  S.waveform = (env, w, h, o = {}) => {
    const mid = h / 2, step = w / Math.max(1, env.length);
    let d = "";
    env.forEach(([lo, hi], i) => { const X = h5(i * step); d += "M" + X + " " + (mid - hi * mid).toFixed(1) + "V" + (mid - lo * mid).toFixed(1); });
    const core = '<path class="s-hair ' + (o.live ? "k-tx" : "k-line") + '" d="' + d + '"/>';
    return o.live ? '<path class="s-hair k-tx glow-1" d="' + d + '"/>' + core : core;
  };

  /* ------------------------------------------------------------------ 7 shell (brief §8.1) */
  /** Header chip set from a scenario (spec §5.20), identical on every screen:
      FEEDS (fault + glyph + onset | acked + glyph | degraded + stale glyph | nominal), ASR, DISK, HOST,
      and off Live Ops the one orange KEYED chip (o.txChip, brief §9.2). */
  HUD.headerChips = function (scn, o = {}) {
    const h = scn.header || {}, faults = scn.faults || [], unacked = faults.some((f) => !f.acked);
    const chips = [];
    if (unacked) chips.push({ text: h.feeds_chip, kind: "fault", glyph: "fault", onset: true });
    else if (faults.length) chips.push({ text: h.feeds_chip, kind: "acked", glyph: "fault" });
    else if (h.feeds_chip_state === "stale" || (scn.degraded || []).length) chips.push({ text: h.feeds_chip, kind: "degraded", glyph: "stale" });
    else chips.push({ text: h.feeds_chip, kind: "nominal" });
    const dec = (scn.system && scn.system.decoder) || { state: "ok" };
    chips.push(dec.state === "ok" ? { text: "ASR OK" } : dec.state === "fault" ? { text: h.asr_chip || "ASR FAULT", kind: "fault", glyph: "fault" } : { text: h.asr_chip || "ASR BACKLOG " + dec.queue, kind: "degraded" });
    if (h.disk_chip) chips.push({ text: h.disk_chip, kind: "degraded" });
    if (h.host_chip) chips.push({ text: h.host_chip, kind: "degraded" });
    const act = scn.active_transmissions || [];
    if (o.txChip && act.length) {
      const on = act.filter((a) => !a.off_bank).map((a) => a.aar), off = act.length - on.length;
      chips.push({ text: "KEYED · " + on.join(" · ") + (off ? " · +" + off + " OFF-BANK" : ""), kind: "tx", glyph: "tx" });
    }
    return chips;
  };

  /** Status line from a scenario (spec §5.1): unacked fault state-fault, stale state-stale, the rest ink-2,
      joined by the · separator; acked faults counted on the right. Empty: `fallback` text, else NO OPEN EVENTS. */
  HUD.statusFrom = function (scn, fallback) {
    const lines = scn.status_line || [], faults = scn.faults || [];
    if (!lines.length) return fallback ? { text: fallback } : {};
    const cls = (m) => (/FAULT/.test(m) && !/ACK'D/.test(m) ? "c-fault" : /STALE|BACKLOG/.test(m) ? "c-stale" : "c-ink-2");
    return { html: lines.map((m) => '<span class="' + cls(m) + '">' + esc(m) + "</span>").join('<span class="sep"></span>'),
      fault: faults.some((f) => !f.acked), acked: faults.filter((f) => f.acked).length };
  };
  /** Mount header, nav, content and status line into a .hud-stage element.
      o = { screen:"live-ops", scope:["BANK","NEC CORRIDOR"], clock, zone, chips:[{text, kind, glyph}], audio:"on|arm|muted",
            status:{ text, fault, acked }, osm, sim }   returns the .hud-content element */
  HUD.shell = function (stage, o = {}) {
    stage = typeof stage === "string" ? document.querySelector(stage) : stage;
    const scr = HUD.SCREENS.find((s) => s.id === o.screen) || { name: String(o.screen || "").toUpperCase() };
    const keep = new URLSearchParams();
    if (HUD.state) keep.set("state", HUD.state);
    if (HUD.size !== 1920) keep.set("size", HUD.size);
    const nav = HUD.SCREENS.map((s) => '<a class="tab tab--bare" role="tab" style="border:0" aria-selected="' + (s.id === o.screen) + '" href="' + s.file + "?" + keep + '">' + s.name + "</a>").join("");
    const chips = (o.chips || [{ text: "FEEDS 4/4" }, { text: "ASR OK" }]).map((c) => C.chip(c.text, c.kind || "nominal", c)).join("");
    const audio = { on: C.chip("AUDIO ON", "active", { button: true }), arm: C.chip("AUDIO · CLICK TO ENABLE", "armed", { button: true }), muted: C.chip("AUDIO MUTED", "nominal", { button: true }) }[o.audio || "on"];
    const zone = o.zone || "EST";
    const clock = HUD.fmt.clock(o.clock ?? "00:00:00", zone);
    const st = o.status || {};
    stage.classList.add("hud-stage");
    stage.innerHTML =
      '<header class="hud-header"><div class="hud-header__left"><span class="hud-mark">SDRVIZ</span><span class="hud-screen-name">' + esc(scr.name) + "</span></div>" +
      '<nav class="hud-nav" role="tablist" aria-label="Screens">' + nav + "</nav>" +
      '<div class="hud-header__right">' + chips + audio + '<button class="hud-clock" title="Toggle UTC">' + clock + "</button>" +
      C.chip("MOTION " + (HUD.motion === "reduced" ? "REDUCED" : "FULL"), "nominal", { button: true, cls: "hud-motion" }) + "</div></header>" +
      '<main class="hud-content"></main>' +
      '<footer class="hud-status"><span class="hud-status__msg' + (st.fault ? " is-fault" : "") + '">' + (st.html || esc(st.text || "") || '<span class="c-ink-3">NO OPEN EVENTS</span>') + "</span>" +
      (st.acked ? '<span class="hud-status__ack">' + st.acked + " ACK'D FAULT" + (st.acked > 1 ? "S" : "") + "</span>" : "") +
      C.titleBlock({ screen: scr.name, scope: o.scope, clock, sim: o.sim, osm: o.osm }) + "</footer>";
    HUD.startClock(stage.querySelector(".hud-clock"), o.clock ?? "00:00:00", zone);
    return stage.querySelector(".hud-content");
  };

  /** Header clock. Frozen at the scenario moment unless ?live=1. Click toggles EST/UTC everywhere. */
  HUD.startClock = function (el, t, zone = "EST") {
    if (!el) return;
    let s = typeof t === "string" ? HUD.fmt.parseClock(t) : t;
    let z = zone;
    const paint = () => {
      const txt = HUD.fmt.clock(s, z);
      el.textContent = txt;
      document.querySelectorAll(".hud-tb-clock").forEach((n) => (n.textContent = txt));
    };
    paint();
    el.addEventListener("click", () => { z = z === "UTC" ? zone : "UTC"; paint(); });
    if (HUD.live) setInterval(() => { s += 1; paint(); }, 1000);
  };

  /* ------------------------------------------------------------------ 8 mount, build-on, reveal, pings */
  /** Insert HTML and size ember underlines to their labels. */
  HUD.mount = function (el, html) {
    el = typeof el === "string" ? document.querySelector(el) : el;
    if (html != null) el.innerHTML = html;
    HUD.fitEmbers(el);
    return el;
  };
  HUD.fitEmbers = function (root = document) {
    const fit = () => root.querySelectorAll(".tile").forEach((t) => {
      const lab = t.querySelector(".tile__label"), em = t.querySelector(".tile__ember");
      if (lab && em) em.style.setProperty("--ember-w", Math.min(lab.scrollWidth, lab.clientWidth || lab.scrollWidth) + "px");
    });
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  };

  /** Screen build-on (brief §7.4). Skipped under reduced motion or ?build=0. */
  HUD.buildOn = function (root = document) {
    if (HUD.motion === "reduced" || qs.get("build") === "0") return;
    root.querySelectorAll(".tile").forEach((t, i) => t.style.setProperty("--i", String(i)));
    doc.classList.add("is-building");
    setTimeout(() => doc.classList.remove("is-building"), 700);
  };

  /** M24 cosmetic reveal: 30 ms per word, 400 ms cap, stepped. Rows older than 60 s get none (pass ageS). */
  HUD.reveal = function (row, ageS = 0) {
    const words = [...row.querySelectorAll(".c-text .w")];
    if (HUD.motion === "reduced" || ageS > 60 || !words.length) return;
    const per = Math.min(30, 400 / words.length);
    words.forEach((w) => w.classList.add("is-hidden"));
    words.forEach((w, i) => setTimeout(() => w.classList.remove("is-hidden"), Math.round(i * per)));
  };

  /** Fire every .ping in root once; remove after t-ping (no accumulation, brief §10.8). */
  HUD.firePings = function (root = document) {
    root.querySelectorAll(".ping:not(.is-firing)").forEach((p) => {
      if (HUD.motion === "reduced") return p.remove();
      p.classList.add("is-firing");
      setTimeout(() => p.remove(), 1200);
    });
  };

  window.HUD = HUD;
})();

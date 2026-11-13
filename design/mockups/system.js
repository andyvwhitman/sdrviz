/* ==========================================================================
   sdrviz · WLT-1 · System states (brief §8.4 system-down, §8.5 login,
   §8.6 connecting / first data / reconnecting, §8.7 empty states, §9.6)
   Owner: screen designer "feeds-banks". Uses _shared/hud.js (HUD.*); never edits it.

   URL:  system.html?state=login | login-error | loading | connecting | empty-bank | reconnecting | no-link
         [&build=0] [&gray=1]
   Data: data/sim/scenarios/listening.js (03:40 EST) is the moment behind every in-shell state,
         data/sim/scenarios/system.js (window.SDRVIZ_SCENARIOS.system) for every system-state number:
         first-data wait, backoff, link-drop age / clock / retry, and the empty bank;
         data/sim/day.js for routes and health events. Nothing is typed into the drawing (P3).
   ========================================================================== */
(async function () {
  "use strict";
  const H = window.HUD;
  const C = H.c;
  const esc = H.esc;
  const BLANK = H.BLANK;

  if (H.params.gray === "1") document.documentElement.dataset.gray = "";
  const ALIAS = { nolink: "no-link", empty: "empty-bank", "login-err": "login-error" };
  const state = ALIAS[H.state] || H.state;
  const stage = document.getElementById("stage");

  /* ------------------------------------------------------------ login (no shell) */
  if (state === "login" || state === "login-error") {
    const err = state === "login-error";
    stage.className = "sy-login";
    const ruler = '<svg class="hud sy-login__ruler" width="1856" height="40" viewBox="0 0 1856 40">' +
      H.svg.freqRuler({ x: 0, y: 0, w: 1856, h: 32, hears: [], bank: [] }) + "</svg>";
    stage.innerHTML =
      '<section class="sy-login__panel br" aria-label="Sign in">' +
      '<div class="t-mark">SDRVIZ</div>' +
      '<div class="sy-login__sub">WAYSIDE LISTENING TABLE · NEC DC–BAL</div>' +
      '<form class="sy-login__form" onsubmit="return false">' +
      /* the error line is reserved in both states (min-height), so the panel never reflows */
      C.field({ label: "WLT-1 · AUTHORIZATION", type: "password", value: err ? "railroad" : "", state: err ? "error" : "autofocus", error: "Password not accepted." })
        .replace(/<\/label>$/, err ? "</label>" : '<span class="field__error sy-err-slot" aria-hidden="true"></span></label>') +
      C.btn("ENTER", { primary: true }) +
      "</form></section>" + ruler;
    document.title = "SDRVIZ · " + (err ? "LOGIN · NOT ACCEPTED" : "LOGIN");
    H.buildOn(document);
    return;
  }

  /* ------------------------------------------------------------ data */
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("DATA NOT FOUND · " + src.replace(H.ROOT, "")));
      document.head.appendChild(s);
    });
  let scn, day, sys;
  try {
    await loadScript(H.ROOT + "data/sim/scenarios/listening.js");
    await loadScript(H.ROOT + "data/sim/day.js");
    scn = window.SDRVIZ_SCENARIOS.listening;
    day = window.SDRVIZ_DAY;
  } catch (err) {
    H.fail(err, stage);
    return;
  }
  /* system-state fixture: no silent fallback. If it is missing, say so and draw the numbers as blanks. */
  try {
    await loadScript(H.ROOT + "data/sim/scenarios/system.js");
    sys = window.SDRVIZ_SCENARIOS.system;
  } catch (err) { /* reported below */ }
  if (!sys) {
    console.warn("sdrviz system.html: fixture data/sim/scenarios/system.js missing; system-state numbers are blank");
    sys = { link_drop: {}, backoff_s: [], empty_bank: { id: "bank-new", name: BLANK, frequency_ids: [], home_feed: scn.displayed_feed } };
  }
  const num = (v) => (v == null ? BLANK : v);
  /* NO LINK (brief §8.4): the content dims to 20 % (.is-down) under one 72 px word and one sentence of cause */
  function alarm(content) {
    content.classList.add("is-down");
    const al = document.createElement("div");
    al.className = "alarm";
    al.setAttribute("role", "alert");
    al.innerHTML = '<span class="t-alarm">NO LINK</span><span class="t-body">Backend unreachable for ' + num(dropAge) + " s; retrying every " +
      num(sys.backoff_cap_s) + " s.</span>";
    content.appendChild(al);
  }

  const blank = state === "loading" || state === "connecting";
  const drop = (sys.link_drop || {})[state];   /* reconnecting | no-link */
  const linkDown = state === "reconnecting" || state === "no-link";
  const dropAge = drop ? drop.drop_age_s : null;
  if (linkDown && !drop) console.warn("sdrviz system.html: no link_drop." + state + " in the system fixture");
  const zone = scn.tz.name;
  const CHAN = Object.fromEntries(scn.channels.map((c) => [c.id, c]));
  const FEED = Object.fromEntries(scn.feeds.map((f) => [f.id, f]));
  const chNum = (c) => parseInt(String(c.aar).replace(/\D/g, ""), 10);

  const banks = state === "empty-bank" ? scn.banks.concat(sys.empty_bank) : scn.banks;
  const bank = state === "empty-bank" ? sys.empty_bank : banks.find((b) => b.id === scn.active_bank);
  const feed = FEED[bank.home_feed || scn.displayed_feed];

  /* ------------------------------------------------------------ shell */
  const hdr = scn.header;
  let chips = blank
    ? [{ text: "FEEDS " + BLANK }, { text: "ASR " + BLANK }]
    : [{ text: hdr.feeds_chip }, { text: scn.system.decoder.state === "ok" ? "ASR OK" : hdr.asr_chip, kind: scn.system.decoder.state === "ok" ? "nominal" : "degraded" }];
  if (linkDown) chips.push({ text: "RECONNECTING", kind: "offline" });

  /* the retry shown is the fixture's own (retry_n, retry_in_s); it is checked against the backoff
     arithmetic (attempts at 1, 3, 7, 15, 23 … s after the drop) and any disagreement is logged */
  if (drop && sys.backoff_s && sys.backoff_s.length) {
    let t = 0, n = 0;
    while (t <= drop.drop_age_s) { t += sys.backoff_s[Math.min(n, sys.backoff_s.length - 1)]; n++; }
    if (n !== drop.retry_n || t - drop.drop_age_s !== drop.retry_in_s)
      console.warn("system fixture retry disagrees with backoff:", { n, inS: t - drop.drop_age_s }, drop);
  }
  let status;
  if (state === "loading") status = { text: "WAITING FOR FIRST DATA · " + num(sys.first_data_wait_s) + "S" };
  else if (state === "connecting") status = { text: "CONNECTING · BACKEND" };
  else if (linkDown) {
    const d = drop || {};
    const since = d.drop_clock ? H.fmt.clock(d.drop_clock, zone).slice(0, 8) : BLANK;
    const retryTxt = "RETRY " + num(d.retry_n) + " IN " + num(d.retry_in_s) + "S";
    status = state === "no-link"
      ? { text: "NO LINK · BACKEND UNREACHABLE · SINCE " + since + " · " + retryTxt, fault: true }
      : { text: "BACKEND LINK LOST · SINCE " + since + " · RECONNECTING · " + retryTxt };
  } else {
    let last = null;
    Object.values(day.health.feeds).forEach((hf) =>
      (hf.events || []).forEach((e) => { if (e.t <= scn.t_offset_s && (!last || e.t > last.e.t)) last = { e, short: hf.short }; }));
    status = { text: last ? last.short + " · " + (last.e.state === "ok" ? "RECOVERED" : last.e.label) + " · " + H.fmt.clock(last.e.clock, zone) : "" };
  }

  /* ------------------------------------------------------------ Live Ops wall, reused (spec §13.2, §13.4 #10)
     Link-down and empty-bank frames are the Live Ops screen in a system state, so they are built by the
     Live Ops builders (live-ops.js, loaded as a library) and only then dimmed. One front wall, one CTC strip.
     W.link = { dropAge } tells the builders the link dropped: waterfall and LOFAR rows newer than the drop
     stay void above a dash-offline edge, the sweep stops, every tile reads AGE from the drop (brief §8.6). */
  const LO = window.LiveOps;
  if (LO && (linkDown || state === "empty-bank")) {
    const W = LO.buildWorld(scn, day);
    const base = LO.shellOpts(W);
    if (linkDown) {
      W.link = { dropAge: dropAge == null ? 0 : dropAge };
      base.chips.push({ text: "RECONNECTING", kind: "offline" });
    }
    let heroH, tabsH, tilesH;
    if (state === "empty-bank") {
      /* a new bank with no channels: same wall on its home feed; the tile area carries the empty statement (brief §8.7) */
      W.scn = Object.assign({}, scn, { banks });
      W.bank = bank; W.bankId = bank.id;
      W.view = Object.assign({}, scn.views[scn.active_bank], { tile_ids: [] });
      W.disp = FEED[bank.home_feed] || W.disp;
      base.scope = ["BANK", bank.name.toUpperCase()];
      const [hx, hy, hw, hh] = LO.G.hero;
      heroH = '<div class="lo-box hero lo-hero" style="left:' + hx + "px;top:" + hy + "px;width:" + hw + "px;height:" + hh + 'px">' +
        '<span class="hero__text c-ink-2">NO CHANNELS IN THIS BANK</span><span class="hero__aside">' +
        C.chip("FEED · " + esc(W.disp.short) + " ▾", "active", { button: true }) + "</span></div>";
      const [tx, ty, tw, th] = LO.G.tiles;
      tilesH = '<div class="lo-box" style="left:' + tx + "px;top:" + ty + "px;width:" + tw + "px;height:" + th + 'px"><div class="sy-empty br"><div class="empty" style="position:absolute;inset:0">' +
        '<span class="t-panel">BANK EMPTY</span><span class="t-body">Add channels in <a href="feeds.html?state=listening">Feeds &amp; Banks</a>.</span></div></div></div>';
    }
    base.status = status;
    const content = H.shell(stage, base);
    content.classList.add("lo-content");
    content.innerHTML = (heroH || LO.heroHTML(W)) + LO.frontWallHTML(W) + (tabsH || LO.tabsHTML(W)) + (tilesH || LO.tilesHTML(W)) + LO.logHTML(W) + LO.ctcHTML(W);
    LO.drawWaterfall(W, content.querySelector(".lo-fall canvas"));
    LO.drawLofar(W, content.querySelector(".lo-lofar canvas"));
    LO.fitLog(content.querySelector(".lo-log"));
    LO.ctcLabelPass(content);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { LO.fitLog(content.querySelector(".lo-log")); LO.ctcLabelPass(content); });
    if (state === "no-link") alarm(content);
    document.title = "SDRVIZ · SYSTEM · " + state.toUpperCase();
    H.buildOn(document);
    return;
  }

  /* ------------------------------------------------------------ blank shell (loading, connecting)
     LAYOUT REFERENCE ONLY: with every value blank there is nothing to draw but empty boxes; the build
     renders these from the same Live Ops components with blank values (index.html says so). */
  const content = H.shell(stage, {
    screen: "live-ops",
    scope: ["BANK", blank ? BLANK : bank.name.toUpperCase()],
    clock: scn.clock,
    zone,
    chips,
    audio: "on",
    status,
  });

  /* ------------------------------------------------------------ hero strip (64) */
  let hero = '<div class="hero sy-abs sy-hero">';
  const view = scn.views[bank.id];
  if (blank) {
    hero += '<span class="hero__text">LAST KEY-UP</span><span class="hero__big is-blank">' + BLANK + "</span>";
  } else if (!bank.frequency_ids.length) {
    hero += '<span class="hero__text is-2">NO CHANNELS IN THIS BANK</span>';
  } else {
    const hv = view.hero;
    hero += '<span class="hero__text">LAST KEY-UP</span><span class="hero__big is-2">' + esc(hv.age_label) + '</span><span class="hero__text">AGO · ' + esc(hv.aar) + " · " + esc(hv.label) + "</span>";
  }
  hero += '<span class="hero__aside">' + C.chip("FEED · " + (blank ? BLANK : feed.short) + " ▾", blank ? "nominal" : "active", { button: true }) + "</span></div>";

  /* ------------------------------------------------------------ front wall */
  const SW = 1656, SH = 72, DB_MIN = -80;
  const hears = blank ? [] : feed.hears.map((id) => chNum(CHAN[id]));
  const inBank = blank ? [] : bank.frequency_ids.map((id) => chNum(CHAN[id]));
  let seed = 1919;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  let spec = '<svg class="hud sy-svg sy-abs sy-wall-spec" width="' + SW + '" height="' + SH + '" viewBox="0 0 ' + SW + " " + SH + '">';
  let g = "";
  for (let i = 1; i < 10; i++) g += "M" + H.snap((SW * i) / 10) + " 0V" + SH;
  for (let j = 1; j < 8; j++) g += "M0 " + H.snap((SH * j) / 8) + "H" + SW;
  spec += '<g class="graticule"><path class="s-hair k-grid" d="' + g + '"/></g>';
  spec += '<text class="num" x="' + (SW - 8) + '" y="14" text-anchor="end">10 dB/div · 135 kHz/div</text>';
  if (!blank) {
    const raw = Array.from({ length: SW }, () => (rnd() - 0.5) * 3.2);
    let d = "";
    for (let x = 0; x < SW; x++) {
      const v = feed.noise_floor_dbfs + (raw[Math.max(0, x - 1)] + 2 * raw[x] + raw[Math.min(SW - 1, x + 1)]) / 4;
      d += (x ? "L" : "M") + x + " " + (Math.round((v / DB_MIN) * SH) + 0.5);
    }
    spec += '<path class="s-emph k-line glow-1" d="' + d + '"/><path class="s-emph k-line" d="' + d + '"/>';
  }
  spec += '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (SW - 1) + '" height="' + (SH - 1) + '"/>' + H.svg.regMark(0, 0) + "</svg>";
  const ruler = '<svg class="hud sy-svg sy-abs sy-wall-ruler" width="' + SW + '" height="32" viewBox="0 0 ' + SW + ' 32">' +
    H.svg.freqRuler({ x: 0, y: 0, w: SW, h: 32, hears, bank: inBank }) + "</svg>";

  /* live waterfall: 120 rows = 60 s; at 03:40 nothing keyed in the last minute, so the clamped floor reads near-black */
  const wf = '<canvas class="sy-abs sy-wall-wf bezel" width="' + SW + '" height="120"></canvas>';
  /* LAST 60 MIN strip (120 rows × 30 s): rows with samples carry the feed's floor as one flat ramp tone
     (−52..−10 dBFS, the Feeds inspector mapping), faint guides mark the columns that have marks or are
     heard in this bank, and rows newer than the link drop stay void above a dotted edge (P3, P5). */
  const LW_ = 184, lof = scn.lofar_60m, LROWS = lof.rows;
  const lofT = H.lofarT; /* shared mapping, hud.js */
  const lx = (ch) => ((ch - H.BAND.first) / (H.BAND.last - H.BAND.first)) * (LW_ - 1);
  const lcells = blank ? {} : (lof.cells || {})[feed.id] || {};
  const voidRows = blank ? LROWS : linkDown && dropAge != null ? Math.ceil(dropAge / lof.row_s) : 0;
  const lguides = [...new Set(hears.filter((c) => inBank.includes(c)).concat(Object.keys(lcells).map(Number)))];
  let lofar = '<svg class="hud sy-svg sy-abs sy-lofar" width="' + LW_ + '" height="' + LROWS + '" viewBox="0 0 ' + LW_ + " " + LROWS + '">' +
    '<rect x="0" y="0" width="' + LW_ + '" height="' + LROWS + '" fill="var(--bg-void)"/>';
  if (voidRows < LROWS) {
    lofar += '<rect x="0" y="' + voidRows + '" width="' + LW_ + '" height="' + (LROWS - voidRows) + '" fill="' + H.rampColor(lofT(feed.noise_floor_dbfs)) + '"/>';
    if (lguides.length) lofar += '<path class="s-hair k-grid" d="' + lguides.map((c) => "M" + H.snap(lx(c)) + " " + voidRows + "V" + LROWS).join("") + '"/>';
    Object.entries(lcells).forEach(([ch, rows]) => rows.forEach(([row, lvl]) => {
      if (row < voidRows) return;
      lofar += '<rect x="' + (lx(+ch) - 1).toFixed(1) + '" y="' + row + '" width="2" height="1" fill="' + H.rampColor(lofT(lvl)) + '"/>';
    }));
    if (voidRows) lofar += '<path class="s-hair k-stale d-offline" d="M0 ' + (voidRows + 0.5) + "H" + LW_ + '"/>';
  }
  lofar += '<rect class="s-hair k-faint" x="0.5" y="0.5" width="' + (LW_ - 1) + '" height="' + (LROWS - 1) + '"/>' + H.svg.regMark(0, 0) + "</svg>";
  const lofarRuler = '<svg class="hud sy-svg sy-abs sy-lofar-ruler" width="184" height="16" viewBox="0 0 184 16">' +
    H.svg.freqRuler({ x: 0, y: 0, w: 184, h: 16, hears, bank: [], majorLabels: false }) + "</svg>";
  const lofarLab = '<div class="sy-abs sy-lofar-lab"><span>LAST 60 MIN</span><span class="mono">' + (blank ? BLANK : feed.short) + "</span></div>";

  /* ------------------------------------------------------------ bank tabs + tiles */
  const tabs = blank ? "" : '<div class="sy-abs sy-tabs">' + C.tabs(banks.map((b) => ({ id: b.id, name: b.name.toUpperCase(), n: b.frequency_ids.length })), bank.id) + "</div>";
  let tiles;
  if (blank) {
    tiles = '<div class="sy-abs sy-tiles br"><div class="sy-blank-panel"><span class="t-panel">CHANNELS</span><span class="mono">' + BLANK + "</span></div></div>";
  } else if (!bank.frequency_ids.length) {
    tiles = '<div class="sy-abs sy-tiles"><div class="sy-empty br"><div class="empty" style="position:absolute;inset:0">' +
      '<span class="t-panel">BANK EMPTY</span><span class="t-body">Add channels in <a href="feeds.html?state=listening">Feeds &amp; Banks</a>.</span></div></div></div>';
  } else {
    const fl = (c) => {
      const f = FEED[c.heard_by[0]];
      return f ? f.noise_floor_dbfs : null;
    };
    const t = view.tile_ids.map((id) => {
      const c = CHAN[id];
      const cov = c.coverage || {};
      const st = {
        coverage: cov.state || "ok",
        feeds: cov.pips ? cov.pips.map((p) => p.state === "ok") : null,
        lastS: linkDown ? null : c.last_heard ? c.last_heard.age_s : null,
        via: c.last_heard ? c.last_heard.via : null,
        spark: c.spark_60m,
        meter: { floor: fl(c) },
        offlineLabel: c.coverage && c.coverage.state === "offline" ? "NO FEEDS" : null,
        reconnecting: linkDown,
        ageS: linkDown ? dropAge : null,
      };
      return C.tile({ aar: chNum(c), label: c.label, mhz: c.freq_mhz, railroad: c.railroad, use: c.use }, st, "standard");
    }).join("");
    tiles = '<div class="sy-abs sy-tiles"><div class="tile-grid" style="--tile-cols:5">' + t + "</div></div>";
  }

  /* ------------------------------------------------------------ transcript log */
  let log = '<section class="sy-abs sy-log txlog" aria-live="polite"><div class="txlog__head"><span class="t-panel">TRANSCRIPT</span>' +
    (blank ? "" : '<span class="t-micro">' + scn.transcript.count_today + " TODAY</span>") + '<span class="grow"></span>' + C.chip("BANK ONLY", "filter", { button: true, pressed: false }) + "</div>";
  if (blank) log += '<div class="txrow-empty">' + BLANK + "</div>";
  else {
    log += scn.transcript.rows.slice(0, 14).map((r) => C.txRow({
      id: r.id, clock_local: r.clock, aar_channel: chNum(r), feed_id: r.feed_id, receptions: r.receptions || [],
      speaker_role: r.role, speaker: r.speaker, train_id: r.train_id, transcript: r.transcript, duration_s: r.duration_s,
      transcript_state: r.state, words: r.words,
      detector: r.detector ? { mp: r.detector.mp_label, axles: r.detector.axles, mph: r.detector.mph, defect: r.detector.defect ? r.detector.defect_text : null } : null,
    }, { offbank: !bank.frequency_ids.includes(r.frequency_id) })).join("");
  }
  log += "</section>";

  /* ------------------------------------------------------------ CTC strip (M18, reduced) */
  let ctc = '<svg class="hud sy-svg sy-abs sy-ctc" width="1856" height="120" viewBox="0 0 1856 120">';
  day.routes.routes.forEach((r, i) => {
    const y = i * 24 + 12;
    ctc += '<text class="lab2" x="0" y="' + (y + 4) + '">' + esc(r.name) + "</text>";
    if (blank) { ctc += '<text class="num" x="176" y="' + (y + 4) + '">' + BLANK + "</text>"; return; }
    const st = r.points.filter((p) => ["station", "interlocking", "yard"].includes(p.kind)); /* M18: station and interlocking boxes */
    const x0 = 176, x1 = 1848, step = (x1 - x0) / Math.max(1, st.length - 1);
    const xs = st.map((_, k) => Math.round(x0 + k * step));
    ctc += '<path class="s-hair k-faint" d="M' + x0 + " " + (y + 0.5) + "H" + x1 + '"/>';
    ((scn.ctc[r.id] || {}).trains || []).forEach((tr) => {
      const k = st.findIndex((p, j) => j < st.length - 1 && tr.route_mi >= p.route_mi && tr.route_mi <= st[j + 1].route_mi);
      if (k < 0) return;
      ctc += '<path class="s-active k-line" d="M' + xs[k] + " " + y + "H" + xs[k + 1] + '"/>' +
        '<text class="num2" x="' + (xs[k] + 6) + '" y="' + (y - 4) + '">' + esc(HUD.fmt.trainId(tr.train_id)) + "</text>";
    });
    xs.forEach((x) => (ctc += '<rect class="box" x="' + (x - 3.5) + '" y="' + (y - 3.5) + '" width="7" height="7"/>'));
  });
  ctc += "</svg>";

  H.mount(content, hero + spec + ruler + wf + lofarLab + lofarRuler + lofar + tabs + tiles + log + ctc);

  /* waterfall canvas: per-channel slot noise on the clamped floor (single-hue ramp).
     120 rows = 60 s at 2 rows/s; with the link down, rows newer than the drop never arrived and stay void. */
  const cv = content.querySelector(".sy-wall-wf");
  if (cv && !blank) {
    const ctx = cv.getContext("2d");
    const slot = SW / 91, rowsPerS = 120 / 60;
    const gap = linkDown && dropAge != null ? Math.ceil(dropAge * rowsPerS) : 0;
    for (let row = gap; row < 120; row++)
      for (let k = 0; k < 91; k++) {
        ctx.fillStyle = H.rampColor(0.02 + rnd() * 0.07);
        ctx.fillRect(Math.floor(k * slot), row, Math.ceil(slot), 1);
      }
    if (gap) {
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--state-stale").trim();
      ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.moveTo(0, gap + 0.5); ctx.lineTo(SW, gap + 0.5); ctx.stroke();
    }
  }

  /* ------------------------------------------------------------ system-down (brief §8.4) */
  if (state === "no-link") alarm(content);

  document.title = "SDRVIZ · SYSTEM · " + state.toUpperCase();
  H.buildOn(document);
})();

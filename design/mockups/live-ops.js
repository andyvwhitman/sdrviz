/* ==========================================================================
   sdrviz · WLT-1 · Live Ops mockup (page-local). Builds on _shared/hud.js.
   Brief §9.1, §8.1, §8.3, §8.9, §7.3. Spec §4.3 (geometry), §5 (components).

   URL:  live-ops.html?state=listening|keyed|fault|fault-acked[&size=1440]
                      [&bank=<bank id>][&inspect=feed-lnd|<channel id>][&build=0][&motion=reduced]
         &bank overrides the scenario's active_bank (default). Tiles, ruler labels, hero,
         off-bank count, log off-bank tags and the home feed all follow views[<bank id>].

   Every number on screen is read or computed from data/sim:
     data/sim/scenarios/<state>.js   window.SDRVIZ_SCENARIOS[state]  (the frame's moment)
     data/sim/day.js                 window.SDRVIZ_DAY (transmissions, health, routes)
   The only drawing constants that are not in the data are flagged ASSUMPTION below.
   ========================================================================== */
(function () {
  "use strict";

  const fmt = HUD.fmt;
  const esc = HUD.esc;
  const STATES = ["listening", "keyed", "fault", "fault-acked"];

  /* ---------------------------------------------------------------- geometry
     Content-relative boxes [x, y, w, h] (content origin = stage 32, 56). Spec §4.3. */
  const G = HUD.size === 1440
    ? {
        W: 1376, hero: [0, 0, 1376, 64],
        spec: [0, 80, 1176, 56], ruler: [0, 136, 1176, 24], fall: [0, 160, 1176, 96],
        lofar: [1192, 160, 184, 96], lofarRuler: [1192, 144, 184, 16], lofarHead: [1192, 80, 184, 56],
        tabs: [0, 272, 792, 32], tiles: [0, 320, 792, 348], cols: 3, variant: "compact",
        log: [816, 272, 560, 396], ctc: [0, 684, 1376, 120], fallRows: 96, lofarRows: 96,
      }
    : {
        W: 1856, hero: [0, 0, 1856, 64],
        spec: [0, 80, 1656, 72], ruler: [0, 152, 1656, 32], fall: [0, 184, 1656, 120],
        lofar: [1672, 184, 184, 120], lofarRuler: [1672, 168, 184, 16], lofarHead: [1672, 80, 184, 88],
        tabs: [0, 320, 1072, 32], tiles: [0, 368, 1072, 480], cols: 5, variant: "standard",
        log: [1096, 320, 760, 528], ctc: [0, 864, 1856, 120], fallRows: 120, lofarRows: 120,
      };

  /* ASSUMPTION (no field in data/sim yet): squelch threshold = feed noise floor + 8 dB.
     Proposed to the lead as a per-channel `squelch_dbfs` in the generator. */
  const SQUELCH_OVER_FLOOR_DB = 8;
  /* Spectrum vertical scale: M3 graticule 10 dB/div, reference level at the top. */
  const REF_DBFS = -10, DB_DIVS = 6;

  /* ---------------------------------------------------------------- helpers */
  const box = (r, cls = "", html = "") =>
    '<div class="lo-box ' + cls + '" style="left:' + r[0] + "px;top:" + r[1] + "px;width:" + r[2] + "px;height:" + r[3] + 'px">' + html + "</div>";
  const chNum = (aar) => Number(String(aar).replace(/\D/g, ""));
  /* deterministic 0..1 hash (no Math.random anywhere: frames must be reproducible) */
  const hash = (a, b = 0) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const loadTwin = (rel, pick) =>
    new Promise((resolve, reject) => {
      const got = pick();
      if (got) return resolve(got);
      const s = document.createElement("script");
      s.src = HUD.ROOT + rel;
      s.onload = () => (pick() ? resolve(pick()) : reject(new Error("DATA NOT FOUND · " + rel)));
      s.onerror = () => reject(new Error("DATA NOT FOUND · " + rel));
      document.head.appendChild(s);
    });

  /* AAR band <-> plot x. The band edges (160.215, 161.565) sit on the first and last pixel. */
  const BAND_W = HUD.BAND.hi - HUD.BAND.lo;
  const fx = (mhz, w) => ((mhz - HUD.BAND.lo) / BAND_W) * (w - 1);
  const slotPx = (w) => (HUD.BAND.step / BAND_W) * (w - 1);

  /* Narrowband FM occupied shape: attenuation in dB at a distance d (kHz) from centre. */
  const nfmShape = (dk) => (dk < 4 ? -dk * 0.35 : dk < 7 ? -1.4 - (dk - 4) * 4 : -13.4 - (dk - 7) * 7);

  /* ---------------------------------------------------------------- main */
  async function main() {
    const state = STATES.includes(HUD.state) ? HUD.state : "listening";
    let scn, day;
    try {
      scn = await loadTwin("data/sim/scenarios/" + state + ".js", () => window.SDRVIZ_SCENARIOS && window.SDRVIZ_SCENARIOS[state]);
      day = await loadTwin("data/sim/day.js", () => window.SDRVIZ_DAY);
    } catch (err) {
      const content = HUD.shell("#stage", { screen: "live-ops", clock: "00:00:00" });
      return HUD.fail(err, content);
    }
    const W = buildWorld(scn, day);
    const content = HUD.shell("#stage", shellOpts(W));
    content.classList.add("lo-content");
    content.innerHTML =
      heroHTML(W) + frontWallHTML(W) + tabsHTML(W) + tilesHTML(W) + logHTML(W) + ctcHTML(W) + inspectorHTML(W);
    drawWaterfall(W, content.querySelector(".lo-fall canvas"));
    drawLofar(W, content.querySelector(".lo-lofar canvas"));
    HUD.fitEmbers(content);
    fitLog(content.querySelector(".lo-log"));
    ctcLabelPass(content);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitLog(content.querySelector(".lo-log")); ctcLabelPass(content); });
    HUD.buildOn(content);
  }

  /* ---------------------------------------------------------------- world model (all from data) */
  function buildWorld(scn, day) {
    const t = scn.t_offset_s;
    const feeds = Object.fromEntries(scn.feeds.map((f) => [f.id, f]));
    const chans = Object.fromEntries(scn.channels.map((c) => [c.id, c]));
    /* active bank: ?bank= override, else the scenario's; the view carries that bank's home feed (brief §9.1.2) */
    const bankId = HUD.params.bank && scn.views[HUD.params.bank] ? HUD.params.bank : scn.active_bank;
    const bank = scn.banks.find((b) => b.id === bankId);
    const view = scn.views[bankId];
    const disp = feeds[view.displayed_feed || scn.displayed_feed];
    const nominalFloor = (fid) => {
      const f = feeds[fid];
      if (f && f.noise_floor_dbfs != null) return f.noise_floor_dbfs;
      const h = day.health && day.health.feeds && day.health.feeds[fid];
      return h ? h.noise_floor_dbfs : -45;
    };
    /* the displayed feed delivers samples only when ok; otherwise the wall freezes at its last sample */
    const dispLive = disp.state === "ok";
    const wallT = dispLive ? t : t - (disp.last_sample_age_s || 0);

    /* day transmissions, repeated across midnight (the sim day repeats, meta.period) */
    const txAll = day.transmissions.transmissions;
    const txNear = (from, to) => {
      const out = [];
      for (const k of [-86400, 0, 86400]) {
        for (const r of txAll) {
          const s = r.t_offset_s + k, e = s + r.duration_s;
          if (e >= from && s <= to) out.push(Object.assign({}, r, { _s: s, _e: e }));
        }
      }
      return out;
    };
    const lastHour = txNear(t - 3600, t);

    /* channels that are transmitting now, from the scenario */
    const active = scn.active_transmissions.map((a) => Object.assign({}, a, { ch: chNum(a.aar) }));

    /* per-minute airtime for M22 (60 columns; the last is the current minute) */
    const minuteStart = Math.floor(t / 60) * 60;
    const sparkFor = (fid) => {
      const v = new Array(60).fill(0);
      for (const r of lastHour) {
        if (r.frequency_id !== fid) continue;
        const e = Math.min(r._e, t);
        for (let i = 0; i < 60; i++) {
          const a = minuteStart - (59 - i) * 60, b = a + 60;
          const o = Math.min(e, b) - Math.max(r._s, a);
          if (o > 0) v[i] += o;
        }
      }
      return v.map((x) => Math.round(x * 10) / 10);
    };

    /* shared frequency suffix (M7): another channel on the same MHz */
    const suffixFor = (c) => {
      const twin = scn.channels.some((o) => o.id !== c.id && o.freq_mhz === c.freq_mhz);
      return twin && c.heard_by.length === 1 ? HUD.feedName(c.heard_by[0]) : "";
    };

    return { scn, day, t, feeds, chans, bankId, bank, view, disp, dispLive, wallT, nominalFloor, txNear, active, sparkFor, suffixFor, state: HUD.state };
  }

  /* ---------------------------------------------------------------- shell (header, status line) */
  function shellOpts(W) {
    const { scn } = W;
    /* shared header chips and status line (hud.js), so every screen's shell reads the same */
    const chips = HUD.headerChips(scn);
    const status = HUD.statusFrom(scn);
    return {
      screen: "live-ops",
      scope: ["BANK", W.bank.name.toUpperCase()],
      clock: scn.clock,
      zone: scn.tz && scn.tz.name ? scn.tz.name : "EST",
      chips,
      audio: "on",
      status,
    };
  }

  /* ---------------------------------------------------------------- hero (brief §9.1.1) */
  function heroHTML(W) {
    const { view, scn, chans } = W;
    const hero = view.hero;
    let left = "";
    if (hero.mode === "keyed") {
      left =
        '<span class="hero__big is-tx">' + esc(hero.aar4) + "</span>" +
        '<span class="hero__stack"><span class="a">' + esc(hero.label) + '</span><span class="b">' + esc(hero.line) + "</span></span>" +
        '<span class="hero__big is-tx">' + esc(hero.timer) + "</span>" +
        (hero.others_label ? '<span class="hero__list">' + esc(hero.others_label) + "</span>" : "");
    } else {
      /* idle: the age is recomputed from the channel's last_heard with the brief §4 age rule */
      const ch = Object.values(chans).find((c) => c.aar === hero.aar);
      const age = ch && ch.last_heard ? fmt.age(ch.last_heard.age_s) : hero.age_label;
      left =
        '<span class="hero__text c-ink-2">LAST KEY-UP</span><span class="hero__big is-2">' + esc(age) + "</span>" +
        '<span class="hero__text c-ink-2">AGO · ' + esc(hero.aar) + " · " + esc(hero.label) + "</span>";
    }
    /* right: off-bank count, then the displayed feed selector (+ the key-up it can't hear) */
    let aside = "";
    if (view.off_bank_label) {
      const m = view.off_bank_label.match(/^(\+\d+ OFF-BANK)(.*)$/);
      aside += '<span class="lo-offbank">' + esc(m ? m[1] : view.off_bank_label) + (m ? '<span class="mono">' + esc(m[2]) + "</span>" : "") + "</span>";
    }
    const disp = W.disp;
    const fault = scn.faults.find((f) => f.object === disp.id);
    const selKind = fault ? (fault.acked ? "acked" : "fault") : disp.state === "stale" ? "degraded" : "active";
    aside += HUD.c.chip(esc(view.displayed_feed_label) + " ▾", selKind, { button: true, glyph: fault ? "fault" : null });
    if (view.selector_extra_label) aside += HUD.c.chip(esc(view.selector_extra_label), "nominal");
    return box(G.hero, "hero lo-hero", left + '<span class="hero__aside">' + aside + "</span>");
  }

  /* ---------------------------------------------------------------- front wall */
  function frontWallHTML(W) {
    const { disp, scn, active } = W;
    const floor = W.nominalFloor(disp.id);
    const hearsCh = disp.hears.map((id) => chNum(W.chans[id].aar));
    const bankCh = W.bank.frequency_ids.map((id) => chNum(W.chans[id].aar));
    const onWall = W.dispLive ? active.filter((a) => a.receptions.some((r) => r.feed_id === disp.id)) : [];
    const frozenCls = W.dispLive ? "" : " lo-wall-frozen";

    /* --- spectrum trace (M3 graticule, M17 squelch lines, TX slots, M13 sweep) */
    const [sx, sy, sw, sh] = G.spec;
    const yDb = (db) => ((REF_DBFS - db) / (DB_DIVS * 10)) * sh;
    let s = '<svg class="hud" width="' + sw + '" height="' + sh + '" viewBox="0 0 ' + sw + " " + sh + '">';
    /* graticule: 10 frequency divisions (135 kHz/div), 10 dB/div; minor ticks on the centre axes only */
    let g = "";
    for (let i = 1; i < 10; i++) g += "M" + HUD.snap((sw * i) / 10) + " 0V" + sh;
    for (let j = 1; j < DB_DIVS; j++) g += "M0 " + HUD.snap((sh * j) / DB_DIVS) + "H" + sw;
    s += '<path class="s-hair k-grid graticule" d="' + g + '"/>';
    let m = "";
    const cy = HUD.snap((sh * Math.floor(DB_DIVS / 2)) / DB_DIVS), cx = HUD.snap(sw / 2);
    for (let i = 0; i <= 50; i++) { const x = HUD.snap((sw * i) / 50); m += "M" + x + " " + (cy - 2) + "V" + (cy + 2); }
    for (let j = 0; j <= DB_DIVS * 5; j++) { const y = HUD.snap((sh * j) / (DB_DIVS * 5)); m += "M" + (cx - 2) + " " + y + "H" + (cx + 2); }
    s += '<path class="s-hair k-faint graticule" d="' + m + '"/>';

    /* TX slots: 1 px state-tx outline over a wash-tx-plot slot (never any text on it) */
    const sp = slotPx(sw);
    onWall.forEach((a) => {
      const x0 = Math.round(fx(HUD.chToMhz(a.ch), sw) - sp / 2);
      s += '<rect class="f-wash-tx-plot" x="' + x0 + '" y="0" width="' + Math.round(sp) + '" height="' + sh + '"/>';
      s += '<rect class="s-hair k-tx" x="' + (x0 + 0.5) + '" y="0.5" width="' + (Math.round(sp) - 1) + '" height="' + (sh - 1) + '"/>';
    });

    /* squelch lines: dash-threshold across each heard channel's slot; solid while open */
    const sq = floor + SQUELCH_OVER_FLOOR_DB;
    hearsCh.forEach((ch) => {
      const open = onWall.some((a) => a.ch === ch);
      const xc = fx(HUD.chToMhz(ch), sw);
      s += '<path class="s-hair ' + (open ? "k-tx" : "k-faint d-threshold") + '" d="M' + Math.round(xc - sp / 2 + 2) + " " + HUD.snap(yDb(sq)) + "H" + Math.round(xc + sp / 2 - 2) + '"/>';
    });

    /* the trace: noise floor (alpha 0.2 smoothed, so it doesn't boil) plus the carriers this feed hears now */
    const sigs = onWall.map((a) => ({ mhz: HUD.chToMhz(a.ch), db: a.receptions.find((r) => r.feed_id === disp.id).rssi_dbfs }));
    let d = "";
    let sm = 0;
    for (let x = 0; x <= sw; x += 2) {
      const mhz = HUD.BAND.lo + (x / (sw - 1)) * BAND_W;
      const n = (hash(x, 7) - 0.5) * 3.2;
      sm = x === 0 ? n : sm + 0.2 * (n - sm) * 2.2;
      let v = floor + sm;
      sigs.forEach((sg) => { v = Math.max(v, sg.db + nfmShape(Math.abs(mhz - sg.mhz) * 1000) + (hash(x, 11) - 0.5) * 0.8); });
      d += (x ? "L" : "M") + x + " " + yDb(v).toFixed(1);
    }
    const traceK = W.dispLive ? "k-line" : "k-stale";
    if (W.dispLive) s += '<path class="s-emph k-line glow-1" d="' + d + '"/>';
    s += '<path class="s-emph ' + traceK + '" d="' + d + '"/>';
    s += HUD.svg.regMark(0, 0, "line") + "</svg>";

    /* the sweep runs only while listening live; a backend link drop stops it with everything else (brief §8.6) */
    const listening = W.dispLive && !W.link && !scn.active_transmissions.length && !scn.channels.some((c) => c.state === "squelch");
    const sweep = '<div class="sweep' + (listening ? "" : " is-paused") + '" style="--sweep-w:' + sw + 'px"></div>';
    /* M3 scale label in a plot corner, never over a TX slot (no text on a plot wash) */
    const LBL_W = 250;
    const slots = onWall.map((a) => { const x = fx(HUD.chToMhz(a.ch), sw); return [x - sp / 2 - 4, x + sp / 2 + 4]; });
    const clear = (a, b) => slots.every(([u, v]) => b < u || a > v);
    const corner = [["right:6px;bottom:5px", sw - LBL_W, sw], ["left:16px;bottom:5px", 0, LBL_W], ["right:6px;top:5px", sw - LBL_W, sw]].find(([, a, b]) => clear(a, b)) || ["right:6px;bottom:5px"];
    const scale = '<span class="lo-scale" style="' + corner[0] + '">REF <span class="mono">' + fmt.num(REF_DBFS, 0) + '</span> dBFS · <span class="mono">10</span> dB/div · <span class="mono">135</span> kHz/div</span>';
    const age = W.dispLive ? "" : '<span class="lo-scale" style="left:16px;top:5px">FROZEN · AGE <span class="mono">' + fmt.age(disp.last_sample_age_s, "age") + "</span></span>";
    let html = box(G.spec, "lo-plot lo-spec" + frozenCls, s + (W.dispLive ? sweep : "") + '<span class="lo-bezel"></span>' + scale + age);

    /* --- M2 frequency ruler (labels for active-bank channels this feed hears) */
    const [rx, ry, rw, rh] = G.ruler;
    html += box(G.ruler, "lo-plot" + frozenCls, '<svg class="hud" width="' + rw + '" height="' + rh + '">' + HUD.svg.freqRuler({ x: 0, y: 0, w: rw, h: rh, hears: hearsCh, bank: bankCh }) + "</svg>");

    /* --- waterfall: canvas + TX slot overlay + time ticks */
    const [, , ww, wh] = G.fall;
    let o = '<svg class="hud" width="' + ww + '" height="' + wh + '">';
    onWall.forEach((a) => {
      const x0 = Math.round(fx(HUD.chToMhz(a.ch), ww) - sp / 2), hh = Math.min(wh, Math.round(a.elapsed_s * 2));
      o += '<rect class="f-wash-tx-plot" x="' + x0 + '" y="0" width="' + Math.round(sp) + '" height="' + hh + '"/>';
      o += '<rect class="s-hair k-tx" x="' + (x0 + 0.5) + '" y="0.5" width="' + (Math.round(sp) - 1) + '" height="' + (hh - 1) + '"/>';
    });
    for (let sec = 10; sec * 2 < wh; sec += 10) {
      const y = HUD.snap(sec * 2), major = sec % 20 === 0;
      o += '<path class="s-hair ' + (major ? "k-line" : "k-faint") + '" d="M1 ' + y + "H" + (major ? 9 : 5) + '"/>';
      if (major) o += '<text class="tx-num" x="13" y="' + (y + 4) + '">' + sec + " S</text>";
    }
    o += "</svg>";
    let msg = "";
    if (!W.dispLive) {
      const f = scn.faults.find((x) => x.object === disp.id);
      const label = f ? f.label : disp.label;
      const acked = f && f.acked;
      const glyph = f ? HUD.c.glyph("fault") : HUD.c.glyph("stale");
      msg = '<div class="lo-wallmsg' + (f ? (acked ? " is-acked" : "") : " is-stale") + '" style="left:' + Math.round(ww / 2) + "px;top:" + Math.round(wh / 2) + 'px">' +
        '<span class="m1">' + glyph + "<span>" + esc(disp.short + " · " + label) + (acked ? '<span class="m1a"> · ACK\'D</span>' : "") + "</span></span>" +
        '<span class="m2"><span class="label">FROZEN AT LAST SAMPLE</span> ' + esc(fmt.clock(W.wallT, "").trim()) + ' · <span class="label">AGE</span> ' + esc(fmt.age(disp.last_sample_age_s, "age")) + "</span></div>";
    }
    html += box(G.fall, "lo-plot lo-fall" + frozenCls, '<canvas width="' + ww + '" height="' + wh + '"></canvas>' + o + '<span class="lo-bezel"></span>' + msg);

    /* --- LOFAR strip: head (ramp legend + label), mini ruler, canvas */
    const minutes = G.lofarRows / 2;
    const clamp = rampClamp(W);
    const [, , lw, lhh] = G.lofarHead;
    const rTop = HUD.size === 1440 ? 14 : 18, nTop = rTop + 10;
    let head = '<span class="lo-scale" style="left:0;top:0">WATERFALL RAMP · dBFS</span>' +
      '<span class="lo-ramp" style="top:' + rTop + 'px"></span>' +
      '<span class="lo-scale" style="left:0;top:' + nTop + 'px"><span class="mono">' + fmt.num(clamp.lo, 0) + "</span></span>" +
      '<span class="lo-scale" style="right:0;top:' + nTop + 'px"><span class="mono">' + fmt.num(clamp.hi, 0) + "</span></span>" +
      '<span class="lo-scale" style="left:0;bottom:4px">LAST ' + minutes + ' MIN</span>' +
      '<span class="lo-scale" style="right:0;bottom:4px">' + esc(disp.short) + "</span>";
    html += box(G.lofarHead, "lo-lofar-head" + frozenCls, head);
    let mr = '<svg class="hud" width="184" height="16">';
    for (let ch = 10; ch <= 90; ch += 10) {
      const x = HUD.snap(1 + (ch - HUD.BAND.first) * 2 + 1);
      mr += '<path class="s-hair ' + (ch % 20 === 10 ? "k-line" : "k-faint") + '" d="M' + x + " 16V" + (ch % 20 === 10 ? 10 : 12) + '"/>';
      if (ch % 20 === 10) mr += '<text class="tx-num" x="' + x + '" y="9" text-anchor="middle">' + ch + "</text>";
    }
    html += box(G.lofarRuler, "lo-plot" + frozenCls, mr + "</svg>");
    html += box(G.lofar, "lo-plot lo-lofar" + frozenCls, '<canvas width="184" height="' + G.lofarRows + '"></canvas><span class="lo-bezel"></span>');
    return html;
  }

  /* waterfall/LOFAR clamp: just under the floor, just over the strongest signal in view (brief §3.3) */
  function rampClamp(W) {
    const floor = W.nominalFloor(W.disp.id);
    let top = -Infinity;
    W.txNear(W.wallT - G.fallRows / 2, W.wallT).forEach((r) => r.receptions.forEach((x) => { if (x.feed_id === W.disp.id) top = Math.max(top, x.rssi_dbfs); }));
    const cells = (W.scn.lofar_60m.cells || {})[W.disp.id] || {};
    Object.values(cells).forEach((rows) => rows.forEach(([, db]) => (top = Math.max(top, db))));
    return { lo: Math.floor(floor - 4), hi: Math.ceil(Math.max(top, floor + 30) + 2) };
  }

  function drawWaterfall(W, cv) {
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const w = cv.width, h = cv.height, disp = W.disp.id, floor = W.nominalFloor(disp);
    const { lo, hi } = rampClamp(W);
    const span = h / 2;
    const recs = W.txNear(W.wallT - span, W.wallT)
      .map((r) => ({ s: r._s, e: Math.min(r._e, W.wallT), mhz: HUD.chToMhz(r.aar_channel), rx: r.receptions.find((x) => x.feed_id === disp) }))
      .filter((r) => r.rx);
    const img = ctx.createImageData(w, h);
    const ramp = HUD.RAMP.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    const col = (tt) => {
      tt = Math.min(1, Math.max(0, tt)) * (ramp.length - 1);
      const i = Math.min(ramp.length - 2, Math.floor(tt)), f = tt - i;
      return ramp[i].map((v, k) => v + (ramp[i + 1][k] - v) * f);
    };
    const absRow0 = Math.floor(W.wallT * 2);
    /* link drop: rows newer than the drop never arrived; they stay bg-void above a dash-offline edge (no fake rows) */
    const gap = W.link ? Math.min(h, Math.ceil(W.link.dropAge * 2)) : 0;
    for (let r = 0; r < h; r++) {
      if (r < gap) {
        for (let x = 0; x < w; x++) { const p = (r * w + x) * 4; img.data[p] = ramp[0][0]; img.data[p + 1] = ramp[0][1]; img.data[p + 2] = ramp[0][2]; img.data[p + 3] = 255; }
        continue;
      }
      const tr = W.wallT - r / 2;
      const on = recs.filter((x) => x.s <= tr && x.e >= tr);
      for (let x = 0; x < w; x++) {
        let v = floor + (hash(x, absRow0 - r) - 0.5) * 4;
        if (on.length) {
          const mhz = HUD.BAND.lo + (x / (w - 1)) * BAND_W;
          on.forEach((sg) => { v = Math.max(v, sg.rx.rssi_dbfs + nfmShape(Math.abs(mhz - sg.mhz) * 1000) + (hash(x * 3, absRow0 - r) - 0.5) * 2); });
        }
        const c = col((v - lo) / (hi - lo)), p = (r * w + x) * 4;
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (gap) linkGapEdge(ctx, w, gap);
  }

  /* dash-offline edge under the rows a link drop never delivered (brief §8.6); state-stale so it meets 3:1 */
  function linkGapEdge(ctx, w, row) {
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--state-stale").trim();
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 5]);
    ctx.beginPath(); ctx.moveTo(0, row + 0.5); ctx.lineTo(w, row + 0.5); ctx.stroke();
    ctx.restore();
  }

  function drawLofar(W, cv) {
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const h = cv.height, disp = W.disp.id, floor = W.nominalFloor(disp);
    const cells = (W.scn.lofar_60m.cells || {})[disp] || {};
    const shade = (db) => HUD.rampColor(HUD.lofarT(db)); /* shared LOFAR mapping (Live Ops = Feeds = System) */
    /* a row is one 30 s max-hold; empty cells sit on the floor */
    const heard = new Set(W.disp.hears.map((id) => chNum(W.chans[id].aar)));
    const gap = W.link ? Math.min(h, Math.ceil(W.link.dropAge / W.scn.lofar_60m.row_s)) : 0;
    for (let ch = HUD.BAND.first; ch <= HUD.BAND.last; ch++) {
      const x = 1 + (ch - HUD.BAND.first) * 2;
      for (let r = gap; r < h; r++) {
        ctx.fillStyle = shade(floor + (hash(ch * 31, r) - 0.5) * (heard.has(ch) ? 4 : 3));
        ctx.fillRect(x, r, 2, 1);
      }
      (cells[String(ch)] || []).forEach(([row, db]) => {
        if (row < h && row >= gap) { ctx.fillStyle = shade(db); ctx.fillRect(x, row, 2, 1); }
      });
    }
    if (gap) linkGapEdge(ctx, cv.width, gap);
  }

  /* ---------------------------------------------------------------- bank tabs + tiles */
  function tabsHTML(W) {
    const items = W.scn.banks.map((b) => ({ id: b.id, name: b.name, n: b.frequency_ids.length }));
    const variant = G.variant.toUpperCase();
    const n = W.view.tile_ids.length;
    return box(G.tabs, "lo-tabs", HUD.c.tabs(items, W.bankId) +
      '<span class="t-micro"><span class="mono">' + n + "</span> TILES · " + variant + "</span>");
  }

  function tileState(W, c) {
    const inspect = HUD.params.inspect;
    const healthy = c.coverage.pips.map((p) => p.state === "ok");
    const s = {
      tx: c.state === "tx",
      squelch: c.state === "squelch",
      elapsed: c.tx ? c.tx.elapsed_s : 0,
      fault: c.channel_fault ? { reason: c.channel_fault.reason || c.channel_fault.label || "", acked: !!c.channel_fault.acked } : null,
      coverage: c.coverage.state,
      feeds: healthy,
      offlineLabel: c.status_readout && /NO FEEDS|RECONNECTING|DISABLED/.test(c.status_readout) ? c.status_readout : undefined,
      lastS: c.last_heard ? c.last_heard.age_s : null,
      via: c.tx ? c.tx.via : c.last_heard ? c.last_heard.via : null,
      spark: W.sparkFor(c.id),
      selected: inspect === c.id,
    };
    if (c.coverage.state === "stale") {
      s.ageS = Math.min(...c.coverage.pips.map((p) => W.feeds[p.feed_id].last_sample_age_s || 0));
    }
    /* M16 meter: floor from a healthy feed that hears it (displayed feed first); TX level = primary reception */
    const okFeeds = c.coverage.pips.filter((p) => p.state === "ok").map((p) => p.feed_id);
    const ff = okFeeds.includes(W.disp.id) ? W.disp.id : okFeeds[0];
    const meter = { floor: ff ? W.nominalFloor(ff) : null };
    if (c.tx) {
      const prim = c.tx.receptions.find((r) => r.feed_id === c.tx.primary_feed) || c.tx.receptions[0];
      meter.db = prim.rssi_dbfs; meter.peak = Math.max(...c.tx.receptions.map((r) => r.rssi_dbfs));
    }
    s.meter = meter;
    /* link drop (brief §8.6): values freeze; every status readout shows AGE counting from the drop */
    if (W.link) Object.assign(s, { reconnecting: true, ageS: W.link.dropAge, lastS: null });
    return s;
  }

  /* M15 envelope from the transmission's own word timings (data/sim words[].t), newest at the right. */
  function waveSVG(W, c) {
    const row = W.day.transmissions.transmissions.find((r) => r.id === c.tx.tx_id);
    const words = row && row.words ? row.words : [];
    const w = 184, h = 16, pxPerS = 30, el = c.tx.elapsed_s;
    const prim = c.tx.receptions.find((r) => r.feed_id === c.tx.primary_feed) || c.tx.receptions[0];
    const gain = Math.min(1, Math.max(0.45, (prim.snr_db || 15) / 30));
    const env = [];
    for (let x = 0; x < w; x++) {
      const ts = el - (w - 1 - x) / pxPerS; /* seconds since squelch crossing at this column */
      if (ts < 0) { env.push([0, 0]); continue; }
      let a = 0.06 + hash(x, 3) * 0.05; /* carrier hiss */
      words.forEach((wd, i) => {
        const end = i + 1 < words.length ? words[i + 1].t - 0.06 : wd.t + 0.45;
        if (ts >= wd.t && ts <= end) a = Math.max(a, (0.35 + 0.65 * hash(x * 7, i)) * gain);
      });
      env.push([-a * (0.7 + 0.3 * hash(x, 5)), a]);
    }
    return '<svg class="wave-svg hud is-live" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' + HUD.svg.waveform(env, w, h, { live: true }) + "</svg>";
  }

  function tilesHTML(W) {
    const html = W.view.tile_ids.map((id) => {
      const c = W.chans[id];
      const ch = { aar: chNum(c.aar), label: c.label, mhz: c.freq_mhz, railroad: c.railroad, use: c.use, suffix: W.suffixFor(c) };
      let t = HUD.c.tile(ch, tileState(W, c), G.variant);
      if (c.tx && G.variant === "standard") t = t.replace(/<\/div>$/, '<span class="tile__wave">' + waveSVG(W, c) + "</span></div>");
      return t;
    }).join("");
    return box(G.tiles, "", '<div class="tile-grid" style="--tile-cols:' + G.cols + '">' + html + "</div>");
  }

  /* ---------------------------------------------------------------- transcript log (brief §9.1.4, §9.7) */
  function logHTML(W) {
    const { scn } = W;
    const live = Object.fromEntries(scn.active_transmissions.map((a) => [a.id, a]));
    const rows = scn.transcript.rows.map((r) => {
      const n = Number(((r.feed_label || "").match(/\+(\d+)/) || [0, 0])[1]);
      const a = live[r.id];
      const det = r.detector ? { mp: r.detector.mp_label, axles: r.detector.axles, mph: r.detector.mph, defect: r.detector.defect ? (r.detector.defect_text || "DEFECT") : null } : null;
      const row = {
        id: r.id, clock_local: r.clock, aar_channel: chNum(r.aar), feed_id: r.feed_id,
        receptions: new Array(n + 1).fill(0), speaker_role: r.role || "unknown", speaker: r.speaker, train_id: r.train_id,
        transcript: r.transcript, words: r.words, transcript_state: r.state,
        duration_s: a ? a.elapsed_s : r.duration_s, detector: det,
      };
      const who = r.role === "detector" ? (r.train_id || "") : (r.train_id || String(r.speaker || "").replace(/\s+(engineer|conductor)$/i, ""));
      /* off-bank follows the active bank: the scenario flag for its own bank, else bank membership */
      const offbank = W.bankId === scn.active_bank ? !!r.off_bank : !W.bank.frequency_ids.includes(r.frequency_id);
      return HUD.c.txRow(row, { live: !!r.live, offbank, colW: G.log[2] - 360, who: fmt.trainId(who) });
    }).join("");
    const head =
      '<div class="txlog__head"><span class="t-panel">TRANSCRIPT</span><span class="t-micro">NEWEST FIRST</span><span class="grow"></span>' +
      '<span class="mono">' + scn.transcript.count_today + '</span><span class="t-micro">TODAY</span>' +
      HUD.c.chip("BANK ONLY", "filter", { button: true, pressed: false }) + "</div>";
    return box(G.log, "txlog lo-log", head + '<div class="lo-rows" aria-live="polite">' + rows + "</div>");
  }

  /* drop rows that would be cut by the log's bottom edge (the log scrolls; the frame shows whole rows) */
  function fitLog(log) {
    if (!log) return;
    const limit = log.getBoundingClientRect().bottom;
    log.querySelectorAll(".txrow").forEach((r) => { r.style.display = ""; });
    log.querySelectorAll(".txrow").forEach((r) => { if (r.getBoundingClientRect().bottom > limit) r.style.display = "none"; });
  }

  /* ---------------------------------------------------------------- CTC track strip (M18) */
  function ctcHTML(W) {
    const routes = W.day.routes.routes;
    const byId = Object.fromEntries(routes.map((r) => [r.id, r]));
    const order = ["r-nec", "r-capital", "r-metro", "r-manassas", "r-phila"];
    const [, , cw, chh] = G.ctc;
    const X0 = HUD.size === 1440 ? 120 : 144, X1 = cw - 16;
    const ROW = 24;

    /* nodes: consecutive duplicate places (MP equations) collapse into one node with both counts */
    const nodesOf = (r) => {
      const out = [];
      r.points.forEach((p) => {
        const last = out[out.length - 1];
        if (last && last.place_id === p.place_id) { last.eq = [last.mp_label, p.mp_label]; return; }
        out.push(Object.assign({}, p));
      });
      return out;
    };
    const N = {}; order.forEach((id) => (N[id] = nodesOf(byId[id])));
    /* schematic x: NEC evenly spaced across the strip; other routes hang off their junctions at NEC spacing */
    const nec = N["r-nec"], sp = (X1 - X0) / (nec.length - 1);
    const necX = (pid) => X0 + nec.findIndex((n) => n.place_id === pid) * sp;
    nec.forEach((n, i) => (n.x = X0 + i * sp));
    const place = (id, startX, spacing) => N[id].forEach((n, i) => (n.x = startX + i * spacing));
    const xWas = necX("wash-union"), xAlx = necX("alexandria"), xBal = necX("baltimore-penn");
    place("r-capital", xWas, (xBal - xWas) / (N["r-capital"].length - 1));
    place("r-metro", xWas, sp);
    place("r-manassas", xAlx - (N["r-manassas"].length - 1) * sp, sp);
    place("r-phila", xBal, sp);

    const talkDet = new Set();
    order.forEach((id) => ((W.scn.ctc[id] && W.scn.ctc[id].detectors_talking) || []).forEach((d) => talkDet.add(d.place_id || d)));
    /* Row geometry (24 px): track and markers in the top 11 px (track y 6.5, markers 3–10),
       labels below on baseline 21 (cap top ≈ 13), so no marker ever touches a glyph. */
    const TRK = 6.5, BASE = 21;
    let s = '<svg class="hud" width="' + cw + '" height="' + chh + '">';
    let labels = "";
    /* a label candidate; the label pass (ctcLabelPass) measures, ranks and knocks out */
    const cand = (row, prio, html, extra) => (labels += '<g class="lo-lab" data-row="' + row + '" data-prio="' + prio + '"' + (extra || "") + ">" + html + "</g>");

    /* junction ties (data: routes.junctions) */
    const ties = [], tieXs = [];
    W.day.routes.junctions.forEach((j) => {
      const rows = j.routes.map((rid) => order.indexOf(rid)).filter((i) => i >= 0).sort((a, b) => a - b);
      const x = HUD.snap(necX(j.place_id));
      if (rows.length < 2) return;
      ties.push({ x, r0: rows[0], r1: rows[rows.length - 1] });
      tieXs.push(x);
      s += '<path class="s-hair k-faint" d="M' + x + " " + (rows[0] * ROW + TRK) + "V" + (rows[rows.length - 1] * ROW + TRK) + '"/>';
    });
    /* review r2 #1: a label centred on a tie column would knock the tie out. Such labels are set
       beside the tie instead (left, end at x - 8; else right, start at x + 8), decided in the label pass. */
    const tieAt = (ri, x) => { const t = ties.find((t) => ri >= t.r0 && ri <= t.r1 && Math.abs(t.x - HUD.snap(x)) < 1); return t ? ' data-tie="' + t.x + '"' : ""; };

    order.forEach((rid, ri) => {
      const r = byId[rid], nodes = N[rid], y0 = ri * ROW, ty = y0 + TRK;
      /* route name: fixed column, top priority in its row */
      cand(ri, 0, '<text class="lo-rt" x="0" y="' + (y0 + 11) + '">' + esc(r.name) + "</text>");
      s += '<path class="s-hair k-faint" d="M' + Math.round(nodes[0].x) + " " + ty + "H" + Math.round(nodes[nodes.length - 1].x) + '"/>';

      /* occupied blocks (tracked passenger trains only; freight is never positioned) */
      const trains = ((W.scn.ctc[rid] || {}).trains || []);
      trains.forEach((tr) => {
        let i = nodes.findIndex((n, k) => k < nodes.length - 1 && n.route_mi <= tr.route_mi && nodes[k + 1].route_mi > tr.route_mi);
        if (i < 0) i = tr.route_mi >= nodes[nodes.length - 1].route_mi ? nodes.length - 2 : 0;
        const a = nodes[i].x + 5, b = nodes[i + 1].x - 5, k = tr.talking ? "k-tx" : "k-line";
        if (tr.talking) s += '<path class="s-active k-tx glow-1" d="M' + a + " " + ty + "H" + b + '"/>';
        s += '<path class="s-active ' + k + '" d="M' + a + " " + ty + "H" + b + '"/>';
        const cx = (a + b) / 2;
        let t = '<text class="lo-tr' + (tr.talking ? " is-tx" : "") + '" x="' + cx + '" y="' + (y0 + BASE) + '" text-anchor="middle">' + esc(fmt.trainId(tr.train_id)) + "</text>";
        /* geometry carrier for "talking" (grayscale test): a small vertical M6 glyph before the train id,
           placed by the label pass once the id is measured */
        if (tr.talking) t += [-4, 0, 4].map((dy) => '<circle class="f-tx lo-talkdot" cx="0" cy="' + (y0 + BASE - 4 + dy) + '" r="1.75"/>').join("");
        cand(ri, tr.talking ? 1 : 2, t);
      });

      nodes.forEach((n, ni) => {
        const X = HUD.snap(n.x);
        /* reach: a centred name may run 3/4 of the pitch toward each neighbour node (1.5x pitch overall),
           so it stays visibly centred on its own node; the gap rule keeps it off a neighbour's name. */
        const reach = [nodes[ni - 1], nodes[ni + 1]].map((m) => (m ? Math.abs(m.x - n.x) * 0.75 : 1e4));
        const reachAttr = ' data-reach="' + reach.map((v) => v.toFixed(1)).join(",") + '" data-nx="' + n.x.toFixed(1) + '"';
        if (n.kind === "detector") {
          const k = talkDet.has(n.place_id) ? "k-tx" : "k-line";
          s += '<path class="s-hair ' + k + '" d="M' + X + " " + (ty - 3.5) + "L" + (X + 3.5) + " " + ty + "L" + X + " " + (ty + 3.5) + "L" + (X - 3.5) + " " + ty + 'Z" fill="var(--bg-void)"/>';
        } else if (n.kind === "signal" || n.kind === "tunnel" || n.kind === "bridge") {
          s += '<path class="s-hair k-faint" d="M' + X + " " + (ty - 3) + "V" + (ty + 3) + '"/>';
        } else {
          s += '<rect class="s-hair k-line" x="' + (Math.round(n.x) - 3.5) + '" y="' + (ty - 3.5) + '" width="7" height="7" fill="var(--bg-void)"/>';
        }
        /* labels: MP equation (priority 3), then stations and yards (priority 4) */
        if (n.eq) {
          const a = n.eq[0].replace(/\s*[\d.]+$/, "").replace(/^≈(.*)$/, "$1≈");
          cand(ri, 3, '<text class="lo-eq" x="' + n.x + '" y="' + (y0 + BASE) + '" text-anchor="middle">' + esc(a + " | " + n.eq[1]) + "</text>", tieAt(ri, n.x));
        } else if (["station", "yard"].includes(n.kind)) {
          const name = n.name.replace(/\s*\(.*\)$/, "").replace(/ Station$/, "").toUpperCase();
          const short = n.short ? ' data-short="' + esc(n.short.toUpperCase()) + '"' : "";
          cand(ri, 4, '<text class="lo-st" x="' + n.x + '" y="' + (y0 + BASE) + '" text-anchor="middle">' + esc(name) + "</text>", tieAt(ri, n.x) + short + reachAttr);
        }
      });
    });
    /* knockouts sit above ties and rails, below the labels */
    s += '<g class="lo-ko"></g><g class="lo-labs" data-ties="' + tieXs.join(",") + '">' + labels + "</g>";
    return box(G.ctc, "lo-plot lo-ctc", s + "</svg>");
  }

  /* CTC label pass (review r1 #6, r3 #1). Per row, accept labels by priority
     (route name > talking train > other trains > MP equation > stations). Rules:
       - gap: 8 px between label extents (text box + knockout), measured both ways whichever was placed first;
         16 px when either label sits beside a tie or a tie runs between them (a tie is not separation).
       - reach: a centred station name may run 3/4 of the pitch toward each neighbour node (1.5x pitch
         overall). Too wide: use routes.json `short`; still too wide: drop. A name is never centred
         across neighbouring nodes.
       - beside a tie: end at x - 8, else start at x + 8; never on the tie.
     Accepted labels get a bg-void knockout 2 px around their glyphs, so a tie or rail never crosses a letter.
     Measured from the rendered text (getBBox), so it holds at both sizes and after fonts load. */
  const CTC_GAP = 8, CTC_KO = 2;
  function ctcLabelPass(root) {
    const svg = root && root.querySelector(".lo-ctc svg");
    if (!svg) return;
    const W = Number(svg.getAttribute("width"));
    const ko = svg.querySelector(".lo-ko");
    ko.innerHTML = "";
    const tieXs = (svg.querySelector(".lo-labs").dataset.ties || "").split(",").filter(Boolean).map(Number);
    const all = Array.from(svg.querySelectorAll(".lo-lab"));
    all.forEach((g) => {
      g.style.display = "";
      const t = g.querySelector("text");
      if (!t.dataset.full) t.dataset.full = t.textContent;
      t.textContent = t.dataset.full;
    });
    /* place the talking dots 5 px left of their train id */
    all.forEach((g) => {
      const dots = g.querySelectorAll(".lo-talkdot");
      if (!dots.length) return;
      const b = g.querySelector("text").getBBox();
      dots.forEach((d) => d.setAttribute("cx", (b.x - 5).toFixed(1)));
    });
    const tieBetween = (p, q) => tieXs.some((x) => x > Math.min(p[1], q[1]) && x < Math.max(p[0], q[0]));
    const rows = {};
    all.forEach((g, i) => (rows[g.dataset.row] = rows[g.dataset.row] || []).push({ g, i, p: Number(g.dataset.prio) }));
    Object.values(rows).forEach((list) => {
      const kept = [];
      const extent = (g) => { const b = g.getBBox(); return [b.x - CTC_KO, b.x + b.width + CTC_KO]; };
      const clear = (g, tie) => {
        const e = extent(g);
        if (e[0] + CTC_KO < 0 || e[1] - CTC_KO > W) return null; /* the text itself stays inside the strip */
        return kept.every((k) => {
          const gap = tie || k.tie || tieBetween(e, k.e) ? 2 * CTC_GAP : CTC_GAP;
          return e[1] + gap <= k.e[0] || e[0] >= k.e[1] + gap;
        }) ? e : null;
      };
      /* a centred name must stay within its reach of the node; returns false when even the short form is too wide */
      const fitReach = (g) => {
        if (!g.dataset.reach) return true;
        const [rl, rr] = g.dataset.reach.split(",").map(Number), nx = Number(g.dataset.nx);
        const t = g.querySelector("text");
        const ok = () => { const b = t.getBBox(); return nx - b.x <= rl + 0.5 && b.x + b.width - nx <= rr + 0.5; };
        if (ok()) return true;
        if (g.dataset.short) { t.textContent = g.dataset.short; if (ok()) return true; }
        return false;
      };
      list.sort((a, b) => a.p - b.p || a.i - b.i).forEach((c) => {
        const t = c.g.querySelector("text");
        let e = null;
        if (c.g.dataset.tie) {
          /* beside the tie, never on it: left first, then right; full name, then the short form */
          const tx = Number(c.g.dataset.tie);
          const names = [t.dataset.full].concat(c.g.dataset.short ? [c.g.dataset.short] : []);
          for (const nm of names) {
            t.textContent = nm;
            t.setAttribute("text-anchor", "end"); t.setAttribute("x", tx - CTC_GAP);
            if ((e = clear(c.g, true))) break;
            t.setAttribute("text-anchor", "start"); t.setAttribute("x", tx + CTC_GAP);
            if ((e = clear(c.g, true))) break;
          }
        } else if (fitReach(c.g)) e = clear(c.g, false);
        if (!e) { c.g.style.display = "none"; return; }
        kept.push({ e, tie: !!c.g.dataset.tie, name: t.textContent });
        const b = t.getBBox();
        const x0 = Math.min(e[0] + CTC_KO, b.x), y0 = b.y + 2; /* text bbox includes the ascender gap; knock out the glyph band */
        ko.insertAdjacentHTML("beforeend", '<rect class="f-void" x="' + (x0 - CTC_KO).toFixed(1) + '" y="' + (y0 - CTC_KO).toFixed(1) +
          '" width="' + (e[1] - x0 + CTC_KO).toFixed(1) + '" height="' + (b.height - 2 + 2 * CTC_KO).toFixed(1) + '"/>');
      });
      /* audit: per row, neighbouring kept labels and their gap (html[data-ctc-audit]) */
      kept.sort((a, b) => a.e[0] - b.e[0]);
      const gaps = kept.slice(1).map((k, i) => Math.round(k.e[0] - kept[i].e[1]));
      (window.CTC_AUDIT = window.CTC_AUDIT || []).push({ row: list[0].g.dataset.row, names: kept.map((k) => k.name), gaps });
    });
    document.documentElement.dataset.ctcAudit = JSON.stringify(window.CTC_AUDIT.slice(-Object.keys(rows).length));
  }

  /* ---------------------------------------------------------------- inspector (brief §8.3) */
  function inspectorHTML(W) {
    const id = HUD.params.inspect;
    if (!id) return "";
    const r = [G.W - 480, 0, 480, G.hero[3] + (HUD.size === 1440 ? 740 : 920)];
    if (W.feeds[id]) return '<div class="lo-box lo-insp" style="left:' + r[0] + "px;top:0;width:480px;bottom:0\">" + feedInspector(W, W.feeds[id]) + "</div>";
    if (W.chans[id]) return '<div class="lo-box lo-insp" style="left:' + r[0] + "px;top:0;width:480px;bottom:0\">" + channelInspector(W, W.chans[id]) + "</div>";
    return "";
  }

  function feedInspector(W, f) {
    const fault = W.scn.faults.find((x) => x.object === f.id);
    const kv = HUD.c.kv;
    const glyph = fault ? "fault" : f.state === "stale" ? "stale" : f.state === "offline" ? "offline" : "idle";
    let lead = '<div class="lo-lead">';
    if (fault || f.state !== "ok") {
      lead += '<div class="row">' + HUD.c.glyph(glyph) + '<span class="reason' + (fault ? "" : " c-stale") + '">' + esc(f.label) + "</span></div>";
      lead += '<div class="sub">SINCE ' + esc(f.since) + " · " + esc(fmt.age(f.in_state_s, "age")) + (fault && fault.acked ? " · ACK'D " + esc(fault.acked_at) : "") + "</div>";
    }
    lead += "</div>";
    const rate = f.sample_rate_15m || [];
    const cw = 440, chh = 40;
    let chart = '<svg class="hud" width="' + cw + '" height="' + (chh + 4) + '">';
    const yR = (v) => HUD.snap(2 + (1 - v / f.sample_rate_msps) * (chh - 4));
    chart += '<path class="s-hair k-faint d-threshold" d="M0 ' + yR(f.sample_rate_msps * 0.9) + "H" + cw + '"/>';
    let d = "";
    rate.forEach((v, i) => { const x0 = Math.round((i * cw) / rate.length), x1 = Math.round(((i + 1) * cw) / rate.length); d += (i ? "L" : "M") + x0 + " " + yR(v) + "H" + x1; });
    chart += '<path class="s-hair k-line" d="' + d + '"/>' + HUD.svg.ruler({ x: 0, y: chh + 3, w: cw, min: -15, max: 0, minor: 1, major: 5, flip: true }) + "</svg>";
    const sections = [
      { title: "STATE", html:
        kv("STATE", fault ? '<span class="c-fault">' + esc(f.label) + "</span>" : esc(f.state.toUpperCase())) +
        kv("SINCE", esc(f.since || fmt.blank)) +
        kv("EPISODE START", esc(f.episode_start || fmt.blank)) +
        kv("LAST SAMPLE", "AGE " + esc(fmt.age(f.last_sample_age_s, "age"))) +
        (fault ? kv("ACKNOWLEDGED", fault.acked ? esc(fault.acked_at) : '<span class="c-ink-3">NOT YET</span>') : "") },
      { title: "RECEIVER · " + f.driver.toUpperCase(), html:
        kv("CENTRE", fmt.freq(f.center_mhz), { unit: "MHz" }) +
        kv("SAMPLE RATE", f.sample_rate_msps.toFixed(1), { unit: "MS/s" }) +
        kv("MEASURED", f.sample_rate_measured_msps != null ? f.sample_rate_measured_msps.toFixed(4) : fmt.blank, { unit: "MS/s" }) +
        kv("GAIN", f.gain_db.toFixed(1), { unit: "dB" }) + kv("PPM", String(f.ppm)) +
        kv("NOISE FLOOR", f.noise_floor_dbfs != null ? fmt.num(f.noise_floor_dbfs) : fmt.blank, { unit: f.noise_floor_dbfs != null ? "dBFS" : "" }) +
        '<div class="lo-chart">' + chart + '<span class="t-micro">SAMPLE RATE · LAST <span class="mono">15</span> MIN · 90% LINE DASHED</span></div>' },
      { title: "TELEMETRY", html: (f.telemetry_na || []).map((k) => kv(k.replace(/_c$/, "").replace(/_pct$/, "").replace(/_/g, " ").toUpperCase(), "", { na: "RTL_TCP" })).join("") },
      { title: "HEARS · " + f.hears.length + " CHANNELS", html: '<div class="lo-hears">' + f.hears.map((id) => { const c = W.chans[id]; return "<span><b>" + esc(c.aar) + "</b>" + esc(c.label) + "</span>"; }).join("") + "</div>" },
      { title: "ACTIONS", html: '<div class="insp-btns">' + HUD.c.btn(fault && fault.acked ? "ACK'D" : "ACK", { primary: !!fault && !fault.acked, disabled: !fault || fault.acked }) + HUD.c.btn("OPEN IN FEEDS & BANKS") + "</div>" },
    ];
    return HUD.c.inspector({ title: f.name.toUpperCase(), kind: "FEED · " + f.site.toUpperCase(), glyph, sim: f.sim, lead, sections }).replace('class="inspector br"', 'class="inspector br lo-insp"');
  }

  function channelInspector(W, c) {
    const kv = HUD.c.kv;
    const tx = c.tx;
    const a = tx ? W.scn.active_transmissions.find((x) => x.id === tx.tx_id) : null;
    let lead = '<div class="lo-lead"><div class="row"><span class="big' + (tx ? " is-tx" : "") + '">' + esc(c.aar4) + "</span>" +
      (tx ? '<span class="big is-tx" style="margin-left:auto">' + esc(fmt.dur(tx.elapsed_s)) + "</span>" : "") + "</div>" +
      '<div class="sub">' + fmt.freq(c.freq_mhz) + " MHz · " + esc(c.railroad.toUpperCase()) + " · " + esc(c.use.toUpperCase()) + "</div>";
    if (tx) lead += '<div class="lo-wave" style="position:relative;height:16px;margin-top:4px">' + waveSVG(W, c) + "</div>";
    lead += "</div>";
    const sections = [];
    if (tx && a) {
      sections.push({ title: "TRANSMISSION · " + a.id.toUpperCase(), html:
        kv("KEYED AT", esc(a.clock_tenths)) + kv("ELAPSED", esc(fmt.dur(tx.elapsed_s))) +
        kv("TALKER", esc(a.train_id || a.speaker || fmt.blank) + (a.train_id ? ' <span class="tag-sim">SIM</span>' : "")) +
        kv("ROLE", esc(a.role_tag)) + kv("TRANSCRIPT", '<span class="c-ink-2">DECODING</span>') });
      const rx = '<div class="lo-rx is-head"><span></span><span>FEED</span><span>SNR dB</span><span>RSSI dBFS</span><span>DIST km</span></div>' +
        tx.receptions.map((r) => '<div class="lo-rx">' + (r.feed_id === tx.primary_feed ? HUD.c.glyph("tx") : "<span></span>") +
          '<span class="f">' + esc(HUD.feedName(r.feed_id)) + "</span><span>" + r.snr_db.toFixed(1) + "</span><span>" + fmt.num(r.rssi_dbfs) + "</span><span>" + r.dist_km.toFixed(1) + "</span></div>").join("");
      sections.push({ title: "RECEPTIONS · " + tx.receptions.length + " · PRIMARY " + esc(tx.via), html: rx });
    }
    sections.push({ title: "COVERAGE", html: c.coverage.pips.map((p) => kv(p.short, esc(p.state.toUpperCase()))).join("") });
    sections.push({ title: "BANKS", html: W.scn.banks.map((b) => '<div style="padding:2px 0">' + HUD.c.check(b.name, c.banks.includes(b.id)) + "</div>").join("") });
    sections.push({ title: "LEVERS", html: '<div style="padding-top:6px">' + HUD.c.levers({ m: false, s: false, r: true }) + "</div>" });
    return HUD.c.inspector({ title: c.aar + " · " + c.label, kind: "CHANNEL · " + c.heard_by.length + " FEEDS HEAR IT", glyph: c.state === "tx" ? "tx" : "idle", lead, sections })
      .replace('class="inspector br"', 'class="inspector br lo-insp"');
  }

  /* One front wall to port (spec §13.2): System's link-down and empty-bank frames call these same builders,
     then dim, so the build has one Live Ops wall, not two. A page that sets <html data-lo-module> loads this
     file as a library and runs its own main. W.link = { dropAge } marks a backend link drop (brief §8.6). */
  window.LiveOps = { G, loadTwin, buildWorld, shellOpts, heroHTML, frontWallHTML, tabsHTML, tilesHTML, logHTML, ctcHTML,
    drawWaterfall, drawLofar, fitLog, ctcLabelPass };
  if (!("loModule" in document.documentElement.dataset)) main();
})();

/* ==========================================================================
   sdrviz · WLT-1 · component sheet (brief §12 item 5)
   Page-local script for design/mockups/components.html. Builds on _shared/hud.js;
   every value comes from window.SDRVIZ_COMPONENTS (components-data.py output).

   Two things are fixtures, because data/sim/ never produces them. Both are
   labelled FIXTURE on the sheet and reported to the lead:
     1. a channel fault (CH66 CSX BE, reason SQ STUCK, the brief §3.5 example);
     2. the transcript row states partial, no_transcript_decoder_down and
        not_recorded, drawn as state overrides on real rows.
   ========================================================================== */
(function () {
  "use strict";

  const D = window.SDRVIZ_COMPONENTS;
  const sheet = document.getElementById("sheet");
  if (!D) return HUD.fail(new Error("DATA NOT FOUND · design/mockups/components-data.js"), sheet);

  const C = HUD.c, F = HUD.fmt, esc = HUD.esc, M = D.moments;
  const FIXTURE_FAULT = { reason: "SQ STUCK", acked: false };
  const FIXTURE_TAG = '<span class="cs-fixture" title="data/sim has no channel fault; reason from brief §3.5">FIXTURE · REASON</span>';

  /* ------------------------------------------------------------------ data adapters */

  const chNum = (aar) => Number(String(aar).replace(/\D/g, ""));
  const feedOf = (m, fid) => M[m].feeds.find((f) => f.id === fid) || {};

  /** Builder channel object; adds the feed suffix when two channels share an AAR number (M7). */
  function chOf(m, cid) {
    const c = M[m].channels[cid];
    const shared = Object.values(M[m].channels).filter((o) => o.aar === c.aar).length > 1;
    return { aar: chNum(c.aar), label: c.label, mhz: c.freq_mhz, railroad: c.railroad, use: c.use,
             suffix: shared ? HUD.feedName(c.heard_by[0]) : "" };
  }

  /** Scenario channel record -> HUD.resolveTile state (+ the exact readout text from data). */
  function stateOf(m, cid, o = {}) {
    const c = M[m].channels[cid];
    const tx = c.tx, lh = c.last_heard, cov = c.coverage;
    /* brief §7.3: squelch-open until the 250 ms commit. The "squelch" moment is sim-0648 + 100 ms;
       elapsed_s is rounded to 0.1 s in data, so the phase is taken from the moment, not the number. */
    const squelch = !!tx && M[m].scenario === "squelch";
    const prim = tx ? tx.receptions.find((r) => r.feed_id === tx.primary_feed) : null;
    const okPip = cov.pips.find((p) => p.state === "ok") || cov.pips[0];
    const floorFeed = tx ? tx.primary_feed : okPip && okPip.feed_id;
    const s = {
      tx: !!tx && !squelch,
      squelch,
      flash: !!o.flash,
      elapsed: tx ? tx.elapsed_s : 0,
      coverage: cov.state,
      feeds: cov.pips.map((p) => p.state === "ok"),
      offlineLabel: c.status_readout,
      lastS: lh && (!tx || squelch) ? lh.age_s : null,
      via: tx ? tx.via : lh && lh.via,
      meter: { db: prim ? prim.rssi_dbfs : null, peak: prim ? prim.rssi_dbfs : null,
               floor: floorFeed ? feedOf(m, floorFeed).noise_floor_dbfs : null },
      spark: M[m].spark[cid] || [],
      fault: o.fault || null,
      selected: !!o.selected, focused: !!o.focused, muted: !!o.muted, solo: !!o.solo,
      showLevers: !!o.levers,
      levers: o.muted ? { m: true } : undefined,
    };
    /* gen_sim sets status_readout null for TX and for idle (LAST clears with the ember at 10 min,
       spec §5.5). Squelch-open has not committed yet, so the previous readout still holds there. */
    const emberLast = lh && lh.age_s < 600 ? "LAST " + lh.age_label : "";
    const status = tx && !squelch ? "" : c.status_readout || (squelch ? emberLast : "");
    return { c, s, status };
  }

  /** Tile HTML with the status readout set verbatim from data/sim (see report: HUD.fmt.age vs gen_sim labels). */
  function tileHTML(m, cid, variant, o = {}) {
    const { s, status } = stateOf(m, cid, o);
    const host = document.createElement("div");
    host.innerHTML = C.tile(chOf(m, cid), s, variant);
    const st = host.querySelector(".tile__status");
    if (st && !s.tx) st.textContent = status;
    return host.innerHTML;
  }

  /** The five resolved layers, for the engineer's reading of each cell. */
  function layers(m, cid, o = {}, withOverlay = true) {
    const { s, status } = stateOf(m, cid, o);
    const r = HUD.resolveTile(s, chOf(m, cid));
    const dash = "—";
    const overlays = ["selected", "focused", "muted", "solo"].filter((k) => o[k]).map((k) => k.toUpperCase());
    if (s.coverage === "partial") overlays.push("PIPS");
    return [
      ["FRAME", s.fault && s.fault.acked && r.frame === "stale" ? "stale (acked fault)" : r.frame], ["GLYPH", r.glyph],
      ["STATUS", s.tx ? "TIMER " + F.dur(s.elapsed) : status || dash],
      ["REASON", r.reason || dash], ["EMBER", r.ember || dash],
    ].concat(withOverlay ? [["OVERLAY", overlays.join(" · ") || dash]] : []);
  }

  const momentLine = (m) => m + " · " + M[m].clock_tenths;
  const chLine = (m, cid) => { const c = M[m].channels[cid]; return c.aar + " · " + c.label; };

  /* ------------------------------------------------------------------ sheet chrome */

  const BOARDS = [
    { id: "tiles", n: "C1", title: "TILE STATES", sub: "STANDARD 200 × 112 · 1:1", render: boardTiles },
    { id: "tiles-small", n: "C2", title: "TILE STATES", sub: "COMPACT 200 × 56 · STRIP 384 × 28 · 1:1", render: boardTilesSmall },
    { id: "combos", n: "C3", title: "COMBINATION FRAMES", sub: "BRIEF §3.5 · 1 OF 2 · 1:1", render: () => boardCombos(COMBOS.slice(0, 4), KEY_LAYERS) },
    { id: "combos-2", n: "C4", title: "COMBINATION FRAMES", sub: "BRIEF §3.5 · 2 OF 2 · 1:1", render: () => boardCombos(COMBOS.slice(4), KEY_OVERLAYS) },
    { id: "rows", n: "C5", title: "TRANSCRIPT ROWS", sub: "BRIEF §9.7 · LOG 760 PX AT 1920", render: () => boardRows(760) },
    { id: "rows-1440", n: "C6", title: "TRANSCRIPT ROWS", sub: "BRIEF §9.7 · LOG 560 PX AT 1440 · SPEAKER FOLDS INLINE", render: () => boardRows(560) },
    { id: "instruments", n: "C7", title: "METER · GLYPH · LEVER", sub: "M16 · M6 · M21 · M22 · M25", render: boardInstruments },
    { id: "controls", n: "C8", title: "CHIPS · INPUTS · N/A", sub: "SPEC §5.20 · §5.22 · §5.25", render: boardControls },
    { id: "readouts", n: "C9", title: "DATA BLOCK · MILEPOST · TITLE BLOCK", sub: "M8 · M7 · M9 · M10", render: boardReadouts },
  ];

  function board(b, sources) {
    const nav = BOARDS.map((o) => '<a class="tab tab--bare" role="tab" style="border:0" aria-selected="' + (o.id === b.id) +
      '" href="components.html?state=' + o.id + '">' + o.n + "</a>").join("");
    const body = b.render();
    const used = [...new Set(sources.list)];
    const msg = used.length
      ? '<span class="label">SOURCES</span> ' + used.map((m) => esc(m + " " + M[m].clock_tenths)).join(" · ") + " · <span class=\"label\">ALL TIMES EST · " + esc(D.meta.date) + "</span>"
      : '<span class="label">SOURCES</span> data/sim/transmissions.json · data/sim/routes.json · data/sim/scenarios/keyed.json';
    return '<section class="cs-board" id="b-' + b.id + '" data-board="' + b.id + '">' +
      '<header class="cs-head"><div class="cs-head__mark"><span class="hud-mark">SDRVIZ</span><span class="hud-screen-name">COMPONENT SHEET</span></div>' +
      '<div class="cs-head__title"><span class="cs-n">' + b.n + '</span><span class="cs-title">' + b.title + '</span><span class="t-label">' + b.sub + "</span></div>" +
      '<nav class="cs-nav" role="tablist" aria-label="Boards">' + nav + "</nav></header>" +
      '<div class="cs-body">' + body + "</div>" +
      '<footer class="hud-status cs-foot"><span class="hud-status__msg">' + msg + "</span>" +
      C.titleBlock({ screen: "COMPONENTS", scope: ["BOARD", b.n + " " + b.title], clock: "SIM DAY " + D.meta.date }) + "</footer></section>";
  }

  /* moments used by the board being built (for the status-line source list) */
  const sources = { list: [] };
  const use = (m) => { sources.list.push(m); return m; };

  /* ------------------------------------------------------------------ C1 / C2 tile states */

  const STATES = [
    { key: "idle", name: "IDLE", m: "listening", cid: "amtk-nec-road", note: "Brackets idle-dim · horizontal glyph · no readout: LAST clears with the ember at 10 min" },
    { key: "squelch", name: "SQUELCH-OPEN", m: "squelch", cid: "amtk-nec-road", note: "First 250 ms of sim-0648 · diagonal glyph · brackets state-idle · meter bar idle" },
    { key: "tx-flash", name: "TX · FLASH FRAME", m: "flash", cid: "amtk-nec-road", o: { flash: true }, note: "Commit at 250 ms · 120 ms frame in state-tx-hot, then TX" },
    { key: "tx", name: "TX", m: "keyed", cid: "amtk-nec-road", note: "2 px frame + wash · vertical glyph · 32 px timer promoted" },
    { key: "recent", name: "RECENT", m: "fault", cid: "amtk-auto-train", note: "Ember under 2 min · 2 px state-recent underline + LAST" },
    { key: "recent-dim", name: "RECENT-DIM", m: "keyed", cid: "amtk-k-tower", note: "Ember 2–10 min · underline recent-dim · LAST in ink-3" },
    { key: "partial", name: "PARTIAL COVERAGE", m: "fault", cid: "amtk-nec-road", note: "M25 pips · 2 of 4 feeds healthy · footer shortens to railroad" },
    { key: "stale", name: "STALE", m: "fault", cid: "csx-be-disp", note: "4/4 dashed frame · hollow glyph · AGE readout" },
    { key: "reconnecting", name: "OFFLINE · RECONNECTING", m: "reconnect", cid: "csx-landover", note: "1/5 dotted frame · × glyph · values blanked · shared-freq suffix" },
    { key: "no-feeds", name: "DISABLED · NO FEEDS", m: "listening", cid: "amtk-mow-47", note: "No feed hears CH47 · dotted frame · NO FEEDS" },
    { key: "fault", name: "CHANNEL FAULT", m: "listening", cid: "csx-be-disp", o: { fault: FIXTURE_FAULT }, fixture: true, note: "1 px red frame + wash · triangle · FAULT · reason in footer" },
    { key: "fault-acked", name: "CHANNEL FAULT · ACK'D", m: "listening", cid: "csx-be-disp", o: { fault: { ...FIXTURE_FAULT, acked: true } }, fixture: true, note: "Frame drops to the 4/4 stale dash · triangle and reason stay red" },
  ];

  function dataLines(st) {
    const c = M[st.m].channels[st.cid];
    const lines = [chLine(st.m, st.cid) + (c.aar && chOf(st.m, st.cid).suffix ? " · " + chOf(st.m, st.cid).suffix : ""), momentLine(st.m)];
    const { s } = stateOf(st.m, st.cid, st.o);
    if (c.tx) lines.push((s.squelch ? "SQUELCH " : "TX ") + c.tx.timer + " · VIA " + c.tx.via + " · " + F.dbfs(s.meter.db));
    else if (c.coverage.state === "partial") lines.push(c.coverage.label + " · " + c.coverage.pips.filter((p) => p.state !== "ok").map((p) => p.short + " " + p.state.toUpperCase()).join(" · "));
    else if (c.last_heard) lines.push("LAST " + c.last_heard.age_label + " · " + c.last_heard.tx_id + " · VIA " + c.last_heard.via);
    else lines.push("HEARD BY " + (c.heard_by.length || "NO") + " FEEDS");
    return lines;
  }

  function stateCell(st, i, variant, withLayers) {
    use(st.m);
    const lay = withLayers ? '<dl class="cs-layers">' + layers(st.m, st.cid, st.o, false).map(([k, v]) => "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl>" : "";
    return '<div class="cs-cell cs-cell--' + variant + '"><div class="cs-cell__h"><span class="cs-idx">' + String(i + 1).padStart(2, "0") + '</span><span class="cs-name">' + st.name + "</span>" + (st.fixture ? FIXTURE_TAG : "") + "</div>" +
      '<div class="cs-plate cs-plate--' + variant + '">' + tileHTML(st.m, st.cid, variant, st.o) + "</div>" +
      '<div class="cs-data">' + dataLines(st).map((l) => "<div>" + l + "</div>").join("") + "</div>" + lay + "</div>";
  }

  function boardTiles() {
    const cells = STATES.map((st, i) => stateCell(st, i, "standard", true)).join("");
    return '<div class="cs-grid6">' + cells + "</div>" + anatomyStandard();
  }

  function boardTilesSmall() {
    return '<div class="cs-sub"><span class="t-label">COMPACT 200 × 56</span><span class="cs-rule"></span><span class="cs-note">Used when a bank does not fit standard (Freight at 1440). The fault reason replaces MHz and meter on row 2. Partial coverage: pips only; the n/N FEEDS count is in the aria-label and the inspector.</span></div>' +
      '<div class="cs-grid6 cs-grid6--tight">' + STATES.map((st, i) => stateCell(st, i, "compact", false)).join("") + "</div>" +
      '<div class="cs-sub"><span class="t-label">STRIP 384 × 28</span><span class="cs-rule"></span><span class="cs-note">Last resort, two per row. The fault reason replaces the MHz. Partial: pips only, count in aria-label.</span></div>' +
      '<div class="cs-grid4">' + STATES.map((st, i) => stateCell(st, i, "strip", false)).join("") + "</div>";
  }

  /** 2x anatomy of a standard tile, with M12-style callouts (dimensions from spec §5.6).
      Leaders leave each part horizontally to the tile edge, then angle out to the label column,
      so no leader crosses the tile's content. */
  function anatomyStandard() {
    const m = use("fault"), cid = "amtk-auto-train";
    const K = 2, X0 = 640, Y0 = 44, W = 200 * K, H = 112 * K;
    const pts = [
      { t: "M6 GLYPH · 18 × 18 AT 8, 7", x: 8, y: 16, side: "l" },
      { t: "EMBER · 2 PX · LABEL WIDTH", x: 32, y: 26, side: "l" },
      { t: "M7 AAR · MONO 500 24 · STEPS TO 13 IN TX", x: 8, y: 44, side: "l" },
      { t: "MHZ · MONO 12 · INK-2", x: 8, y: 63, side: "l" },
      { t: "M16 METER · 120 × 12 · 2 PX PER DB", x: 8, y: 92, side: "l" },
      { t: "FOOTER · 11 · RAILROAD · VIA · FAULT REASON · PIPS", x: 8, y: 104, side: "l" },
      { t: "LABEL · BARLOW SC 600 13 · MAX 96 · 150 IN TX", x: 40, y: 8, side: "t" },
      { t: "STATUS · MONO 11 · RIGHT 8 · TX TIMER 32 TAKES THIS ZONE", x: 150, y: 8, side: "t" },
      { t: "M22 SPARK · 64 × 14 · 59 MIN + GAP + NOW", x: 192, y: 49, side: "r" },
      { t: "M21 LEVERS · 24 × 24 HIT · X 128–200 · Y 72–96", x: 200, y: 84, side: "r" },
      { t: "M1 BRACKETS · 8 PX ARMS · 1 PX IDLE-DIM", x: 200, y: 108, side: "r" },
    ];
    let svg = '<svg class="hud cs-anat__svg" width="1856" height="312" aria-hidden="true">';
    const dot = (px, py) => '<circle class="f-line" cx="' + px + '" cy="' + py + '" r="1.5"/>';
    ["l", "r"].forEach((side) => {
      const arr = pts.filter((p) => p.side === side);
      const colX = side === "l" ? X0 - 96 : X0 + W + 96, edge = side === "l" ? X0 - 16 : X0 + W + 16;
      arr.forEach((p, i) => {
        const px = X0 + p.x * K, py = Y0 + p.y * K;
        const ly = Y0 + 8 + i * ((H - 16) / Math.max(arr.length - 1, 1));
        svg += '<path class="s-hair k-faint" d="M' + HUD.snap(px) + " " + HUD.snap(py) + "H" + HUD.snap(edge) + "L" + HUD.snap(colX) + " " + HUD.snap(ly) + '"/>' + dot(px, py);
        svg += '<text class="tx-lab" x="' + (colX + (side === "l" ? -6 : 6)) + '" y="' + (ly + 4) + '" text-anchor="' + (side === "l" ? "end" : "start") + '">' + p.t + "</text>";
      });
    });
    pts.filter((p) => p.side === "t").forEach((p, i) => {
      const px = X0 + p.x * K, py = Y0 + p.y * K, end = i === 0;
      svg += '<path class="s-hair k-faint" d="M' + HUD.snap(px) + " " + HUD.snap(py) + "V" + (Y0 - 26) + '"/>' + dot(px, py);
      svg += '<text class="tx-lab" x="' + (px + (end ? -6 : 6)) + '" y="' + (Y0 - 28) + '" text-anchor="' + (end ? "end" : "start") + '">' + p.t + "</text>";
    });
    /* dimension lines (M12): extension lines dash-measure, 4 px tick ends, centred value */
    const wy = Y0 + H + 22, hx = X0 + W + 40;
    svg += '<path class="s-hair k-faint d-measure" d="M' + HUD.snap(X0) + " " + (Y0 + H + 6) + "V" + (wy + 4) + "M" + HUD.snap(X0 + W - 1) + " " + (Y0 + H + 6) + "V" + (wy + 4) + '"/>';
    svg += '<path class="s-hair k-line" d="M' + X0 + " " + HUD.snap(wy) + "H" + (X0 + W) + "M" + HUD.snap(X0) + " " + (wy - 4) + "V" + (wy + 4) + "M" + HUD.snap(X0 + W - 1) + " " + (wy - 4) + "V" + (wy + 4) + '"/>';
    svg += '<rect class="f-void" x="' + (X0 + W / 2 - 18) + '" y="' + (wy - 7) + '" width="36" height="14"/><text class="tx-num2" x="' + (X0 + W / 2) + '" y="' + (wy + 4) + '" text-anchor="middle">200</text>';
    svg += '<path class="s-hair k-faint d-measure" d="M' + (X0 + W + 20) + " " + HUD.snap(Y0) + "H" + (hx + 4) + "M" + (X0 + W + 20) + " " + HUD.snap(Y0 + H - 1) + "H" + (hx + 4) + '"/>';
    svg += '<path class="s-hair k-line" d="M' + HUD.snap(hx) + " " + Y0 + "V" + (Y0 + H) + "M" + (hx - 4) + " " + HUD.snap(Y0) + "H" + (hx + 4) + "M" + (hx - 4) + " " + HUD.snap(Y0 + H - 1) + "H" + (hx + 4) + '"/>';
    svg += '<rect class="f-void" x="' + (hx - 14) + '" y="' + (Y0 + H / 2 - 8) + '" width="28" height="16"/><text class="tx-num2" x="' + hx + '" y="' + (Y0 + H / 2 + 4) + '" text-anchor="middle">112</text>';
    svg += "</svg>";
    return '<div class="cs-anat"><div class="cs-anat__h"><span class="t-label">ANATOMY · 2×</span><span class="cs-note">' + esc(chLine(m, cid)) + " · " + esc(momentLine(m)) +
      " · levers shown, as on hover, focus or selection. Positions in tile px from the top-left (spec §5.6).</span></div>" +
      '<div class="cs-anat__stage">' + svg + '<div class="cs-anat__tile" style="left:' + X0 + "px;top:" + Y0 + 'px">' + tileHTML(m, cid, "standard", { levers: true }) + "</div></div></div>";
  }

  /* ------------------------------------------------------------------ C3 / C4 combination frames */

  const COMBOS = [
    { name: "SELECTED + TX", m: "keyed", cid: "amtk-nec-road", o: { selected: true },
      rule: "Selection is an outer 14 px bracket set 4 px outside, so it never touches the 2 px TX frame or its glow. Selection also shows the levers." },
    { name: "FOCUSED + SELECTED", m: "fault", cid: "amtk-auto-train", o: { selected: true, focused: true },
      rule: "Focus is a rounded 1.5 px ring at 2 px offset; selection is square brackets. Both draw together and never read as each other." },
    { name: "SELECTED + FAULT", m: "listening", cid: "csx-be-disp", o: { selected: true, fault: FIXTURE_FAULT }, fixture: true,
      rule: "Unacked fault owns the frame (1 px red + wash). Brackets sit outside it. The reason keeps the footer." },
    { name: "RECENT + STALE", m: "recent-stale", cid: "ns-hag-disp", o: {},
      rule: "Stale owns the frame (4/4 dashes) and the readout. ALX-01 is stale on rate, not silence: samples still arrive, so the readout gives RATE 84% (the feed label's wording) instead of a dead AGE 0S. The ember is history and stays true: underline under the label." },
    { name: "TX + CHANNEL FAULT · UNACKED", m: "keyed", cid: "csx-be-disp", o: { fault: FIXTURE_FAULT }, fixture: true,
      rule: "Unacked fault wins the frame (red, 1 px) and the glyph (triangle). The orange timer stays promoted, so TX is still readable." },
    { name: "TX + CHANNEL FAULT · ACK'D", m: "keyed", cid: "csx-be-disp", o: { fault: { ...FIXTURE_FAULT, acked: true } }, fixture: true,
      rule: "An acked fault drops out of the frame layer, so TX draws (orange 2 px). The triangle and the reason stay red until the condition clears." },
    { name: "MUTED + TX", m: "keyed", cid: "csx-road", o: { muted: true, levers: true },
      rule: "TX shows in full but never flashes. MUTED tag in ink-2, M lever lit, meter bar drawn as a 1 px outline." },
    { name: "PARTIAL COVERAGE + TX", m: "partial-tx", cid: "csx-road", o: {},
      rule: "CH08 keyed while LND-02 reconnects and BAY-04 is stale: heard on BWI-03 only. Pips right-aligned; footer shortens to VIA." },
  ];

  /* brief §3.5, as a key under each matrix ("→" = then; first match wins) */
  const chain = (...xs) => xs.map((x) => "<b>" + x + "</b>").join("<i>→</i>");
  const list = (...xs) => xs.map((x) => "<b>" + x + "</b>").join("<i>·</i>");
  const KEY_LAYERS = ["FIVE LAYERS · FIRST MATCH WINS", [
    ["FRAME", chain("unacked fault", "tx (tx-flash on commit, not muted)", "squelch", "acked fault | stale (4/4 dash)", "offline", "idle")],
    ["GLYPH", chain("fault (acked or not)", "tx", "squelch", "offline", "stale", "idle")],
    ["STATUS", chain("TX timer", "RECONNECTING / NO FEEDS", "AGE · or RATE n% when only rate-stale", "LAST", "nothing")],
    ["FAULT REASON", chain("FAULT · reason in state-fault, acked or not") + "<i>·</i>footer (standard) · row 2 (compact, strip) · row 1 under TX (compact)"],
    ["EMBER", chain("recent < 2 min", "recent-dim < 10 min") + "<i>·</i>regardless of frame · none while TX"],
  ]];
  const KEY_OVERLAYS = ["OVERLAYS · NEVER REPLACE A LAYER", [
    ["SELECTED", list("14 px outer brackets, 1.5 px state-select, 4 px outside") + "<i>·</i>no fill · shows levers"],
    ["FOCUSED", list("1.5 px ring, 2 px offset, 2 px radius") + "<i>·</i>rounded, so never read as selection"],
    ["MUTED", list("no tx-hot flash", "MUTED tag ink-2", "M lever lit", "meter as 1 px outline")],
    ["SOLO", list("SOLO tag in ink") + "<i>·</i>header SOLO n chip explains the silence elsewhere"],
    ["PARTIAL", list("M25 pips right-aligned", "n/N FEEDS 11 ink-2") + "<i>·</i>only when coverage is partial"],
  ]];

  function boardCombos(list, key) {
    const head = '<div class="cs-combo cs-combo--head"><span>COMBINATION</span><span>STANDARD 200 × 112</span><span>COMPACT 200 × 56</span><span>STRIP 384 × 28</span><span>RESOLVED LAYERS</span></div>';
    const rows = list.map((cb) => {
      use(cb.m);
      const st = { m: cb.m, cid: cb.cid, o: cb.o, fixture: cb.fixture };
      const plates = ["standard", "compact", "strip"].map((v) => '<div class="cs-plate cs-plate--' + v + '">' + tileHTML(cb.m, cb.cid, v, cb.o) + "</div>").join("");
      const lay = '<dl class="cs-layers cs-layers--wide">' + layers(cb.m, cb.cid, cb.o).map(([k, v]) => "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl>";
      return '<div class="cs-combo"><div class="cs-combo__name"><div class="cs-name">' + cb.name + (cb.fixture ? " " + FIXTURE_TAG : "") + '</div><div class="cs-data">' + dataLines(st).map((l) => "<div>" + l + "</div>").join("") + "</div></div>" +
        plates + '<div class="cs-combo__rule">' + lay + '<p class="cs-rulep">' + esc(cb.rule) + "</p></div></div>";
    }).join("");
    const k = '<div class="cs-sub cs-sub--sp"><span class="t-label">' + key[0] + '</span><span class="cs-rule"></span><span class="cs-note">brief §3.5</span></div>' +
      '<dl class="cs-key">' + key[1].map(([a, b]) => "<dt>" + a + "</dt><dd>" + b + "</dd>").join("") + "</dl>";
    return head + rows + k;
  }

  /* ------------------------------------------------------------------ C5 / C6 transcript rows */

  const R = D.rows;
  const withState = (id, state, extra = {}) => Object.assign({}, R[id], { transcript_state: state }, extra);
  const prefixOf = (id) => { const mp = D.place_mp[R[id].place_id]; return mp ? (mp.match(/^[A-Z]+/) || [""])[0] : ""; };

  function partialOf(id) {
    /* Future streaming: the hypothesis so far. Fixture: the first 60% of the real words, ink-3, no reveal. */
    const words = R[id].words.slice(0, Math.ceil(R[id].words.length * 0.6));
    return withState(id, "partial", { words: words.map((w) => ({ w: w.w, conf: 1 })) });
  }

  const ROWS = [
    { state: "decoding", mod: "live", row: () => withState("sim-0648", "decoding"), o: { live: true }, src: "sim-0648 · keyed 14:07:30 · CH54 still keyed", note: "M24 bar 8 px/s · 9.6 s → 77 px · CH tag state-tx · wash" },
    { state: "decoding", mod: "live · off-bank", row: () => withState("sim-0647", "decoding"), o: { live: true, offbank: true }, src: "sim-0647 · keyed · CH66 not in Commuter", note: "No wash off-bank · CH tag stays state-tx while live" },
    { state: "final", mod: "live", row: () => R["sim-0648"], o: { live: true }, src: "sim-0648 · text lands while CH54 is still keyed", note: "CH tag back to ink on final · wash stays · low-conf words ink inside a wash" },
    { state: "partial", mod: "future streaming", row: () => partialOf("sim-0650"), o: {}, src: "sim-0650 words 1–8 of 13", fixture: true, note: "ink-3 · replaced in place · no animation · ≤ 4/s" },
    { state: "final", mod: "low-confidence word", row: () => R["sim-0650"], o: { play: true }, src: "sim-0650 · 14:07:35 · conf < 0.6: “433,”", note: "Barlow 15 ink · words under 0.6 in ink-3" },
    { state: "final", mod: "selected", row: () => R["sim-0649"], o: { selected: true, play: true }, src: "sim-0649 · 14:07:27 · conf < 0.6: “stopping”", note: "Outer square brackets, as tiles" },
    { state: "final", mod: "off-bank", row: () => R["sim-0647"], o: { offbank: true }, src: "sim-0647 · CH66 CSX BE · BAY-04", note: "CH tag ink-2 · no wash" },
    { state: "carrier_only", mod: "", row: () => R["sim-0652"], o: { play: true }, src: "sim-0652 · 14:07:46 · 1.3 s", note: "Squelch ≥ 250 ms, no speech · audio playable" },
    { state: "kerchunk", mod: "no row", row: null, src: D.kerchunk.id + " · " + D.kerchunk.clock_local + " · " + D.kerchunk.duration_s.toFixed(2) + " s", note: "Squelch < 250 ms · diagonal glyph 2 s · counted as a blip" },
    { state: "no_transcript_decoder_down", mod: "", row: () => withState("sim-0645", "no_transcript_decoder_down"), o: {}, src: "sim-0645 · 14:06:50", fixture: true, note: "Re-queued · decodes in place later" },
    { state: "failed", mod: "", row: () => R["sim-0633"], o: {}, src: "sim-0633 · 13:39:26 · CH22", note: "Never red · RETRY · repeated failures raise ASR FAULT" },
    { state: "undecodable", mod: "", row: () => R["sim-0223"], o: {}, src: "sim-0223 · 06:38:24 · CH82", note: "Non-voice audio · no claim of digital or encrypted" },
    { state: "not_recorded", mod: "", row: () => withState("sim-0646", "not_recorded"), o: {}, src: "sim-0646 · 14:07:01", fixture: true, note: "Storage fault · NOT RECORDED in place of play" },
    { state: "final", mod: "detector", row: () => R["tx-001"], o: { mpPrefix: prefixOf("tx-001") }, src: "tx-001 · SEED · det-st-denis BAA6.7", note: "Structured mono row · DET role" },
    { state: "final", mod: "detector · DEFECT", row: () => R["tx-064"], o: { mpPrefix: prefixOf("tx-064") }, src: "tx-064 · SEED · det-hyattsville BAA33.7", note: "Boxed DEFECT: 1 px ink frame · weight 500 · never red" },
  ];

  function kerchunkGhost() {
    const k = D.kerchunk;
    const ch = Object.values(M.listening.channels).find((c) => c.id === k.frequency_id);
    return '<div class="cs-ghost">' + C.glyph("squelch") + '<span class="t-micro">NO ROW</span><span class="mono">' +
      esc(k.clock_local) + " · " + esc(ch ? ch.aar + " " + ch.label : k.frequency_id) + " · " + esc(HUD.feedName(k.feed_id)) + " · " + F.dur(k.duration_s) + "</span></div>";
  }

  /* detector fields, speaker short forms and the inline speaker now live in HUD.c.txRow (spec §5.12). */

  function boardRows(w) {
    /* C6 is a true 1440 x 900 frame: no ruler; the fold note rides in the left header instead. */
    const narrow = w !== 760;
    const ruler = narrow ? "" : colRuler();
    const fold = narrow ? '<span class="cs-note"> · same rows as C5 · spec §5.12</span>' : "";
    let h = '<div class="cs-rows' + (narrow ? " cs-rows--narrow" : "") + '" style="--log-w:' + w + 'px">';
    h += '<div class="cs-rows__a cs-rows__hd"><span class="t-label">STATE · MODIFIER</span><span><span class="t-label">SOURCE · RULE</span>' + fold + '</span></div><div class="cs-rows__log">' + ruler +
      '<div class="txlog"><div class="txlog__head"><span class="t-panel">TRANSCRIPT</span><span class="t-micro">BANK · COMMUTER</span></div></div></div>';
    ROWS.forEach((r, i) => {
      const row = r.row && r.row();
      const body = row ? C.txRow(row, Object.assign({ colW: w === 760 ? 380 : 300 }, r.o)) : kerchunkGhost();
      h += '<div class="cs-rows__a"><div class="cs-rows__st"><div><span class="cs-idx">' + String(i + 1).padStart(2, "0") + '</span> <span class="cs-state">' + r.state + "</span></div>" +
        "<div>" + (r.mod ? '<span class="cs-mod">' + esc(r.mod) + "</span> " : "") + (r.fixture ? '<span class="cs-fixture">FIXTURE</span>' : "") + "</div></div>" +
        '<div><div class="cs-src">' + esc(r.src) + '</div><div class="cs-rule2">' + esc(r.note) + "</div></div></div>" +
        '<div class="cs-rows__log"><div class="txlog">' + body + "</div></div>";
    });
    return h + "</div>";
  }

  /** Column widths of the 760 px log (spec §5.12) as an M2-style dimension ruler. */
  function colRuler() {
    const cols = [["TIME", 64], ["CH", 40], ["FEED", 72], ["ROLE", 32], ["SPEAKER", 120]];
    let x = 8, s = '<svg class="hud cs-colruler" width="760" height="40" aria-hidden="true"><path class="s-hair k-faint" d="M0 32.5H760"/>';
    cols.forEach(([k, cw], i) => {
      s += '<path class="s-hair k-line" d="M' + HUD.snap(x) + " 28V38M" + HUD.snap(x + cw) + ' 28V38"/>';
      s += '<path class="s-hair k-faint" d="M' + HUD.snap(x) + " " + (i % 2 ? 24 : 12) + 'V28"/>';
      s += '<text class="tx-lab" x="' + (x + 4) + '" y="' + (i % 2 ? 24 : 12) + '">' + k + " " + cw + "</text>";
      x += cw + 12;
    });
    s += '<path class="s-hair k-line" d="M' + HUD.snap(x) + ' 28V38"/><path class="s-hair k-faint" d="M' + HUD.snap(x) + ' 12V28"/><text class="tx-lab" x="' + (x + 4) + '" y="12">TEXT · REMAINDER · BARLOW 15/20 · GAP 12</text>';
    return s + "</svg>";
  }

  /* ------------------------------------------------------------------ C7 instruments */

  function meterRow(label, o, vals, src) {
    return '<div class="cs-mrow"><span class="cs-name">' + label + '</span><span class="cs-mrow__m">' + C.meter(Object.assign({ w: 120 }, o)) + "</span>" +
      '<span class="cs-mrow__m">' + C.meter(Object.assign({}, o, { w: 64 })) + '</span><span class="cs-data">' + vals + '</span><span class="cs-src">' + esc(src) + "</span></div>";
  }

  const x4 = (label, svg, spark) => '<div class="cs-x4row"><span class="cs-name">' + label + '</span><div class="cs-x4' + (spark ? " cs-x4--spark" : "") + '">' + svg + "</div></div>";

  function boardInstruments() {
    const kN = use("keyed"), sq = use("squelch"), li = use("listening");
    const k54 = stateOf(kN, "amtk-nec-road").s.meter, k08 = stateOf(kN, "csx-road").s.meter;
    const q54 = stateOf(sq, "amtk-nec-road").s.meter, l54 = stateOf(li, "amtk-nec-road").s.meter;
    const v = (mt) => (mt.db != null ? F.dbfs(mt.db) + " · " : "") + "FLOOR " + F.dbfs(mt.floor);
    const meters =
      meterRow("CLOSED", { floor: l54.floor }, v(l54), "listening · CH54 · floor of ALX-01, its first healthy feed") +
      meterRow("SQUELCH-OPEN", { db: q54.db, peak: q54.peak, floor: q54.floor }, v(q54), "squelch · CH54 · BWI-03 RSSI") +
      meterRow("TX", { db: k54.db, peak: k54.peak, floor: k54.floor, tx: true }, v(k54), "keyed · CH54 · sim-0648 via BWI-03") +
      meterRow("MUTED · TX", { db: k08.db, peak: k08.peak, floor: k08.floor, tx: true, muted: true }, v(k08), "keyed · CH08 · sim-0649 via LND-02") +
      meterRow("N/A", { na: true }, "SCALE ONLY · NO BAR · NO FLOOR", "rtl_tcp has no device level");

    /* 4x meter anatomy */
    const x = (db) => Math.round(((db + 60) / 60) * 119);
    const K = 4, ox = 24, oy = 40;
    let an = '<svg class="hud" width="820" height="130" aria-hidden="true">';
    const call = (px, py, lx, ly, t, anchor = "start") => {
      an += '<path class="s-hair k-faint" d="M' + HUD.snap(ox + px * K) + " " + HUD.snap(oy + py * K) + "L" + HUD.snap(lx) + " " + HUD.snap(ly) + '"/>';
      an += '<text class="tx-lab" x="' + (lx + (anchor === "end" ? -4 : 4)) + '" y="' + (ly + 4) + '" text-anchor="' + anchor + '">' + t + "</text>";
    };
    call(x(-60), 3, ox, 12, "−60 · MAJOR 1 × 4 EVERY 10 DB");
    call(x(-55), 5, ox + 200, 12, "MINOR 1 × 2 EVERY 5 DB");
    call(x(k54.peak), 2, ox + 400, 12, "PEAK HOLD 1 × 8 INK · 1.5 S");
    call(x(k54.floor), 10, ox + 40, oy + 48 + 30, "FLOOR 1 × 4 IDLE-DIM · EVERY 10 S");
    call(70, 9, ox + 300, oy + 48 + 30, "BAR 2 PX · VU ~300 MS");
    call(119, 9.5, ox + 470, oy + 48 + 30, "RAIL 1 PX GRID · 0");
    an += '<foreignObject x="' + ox + '" y="' + oy + '" width="480" height="48"><div xmlns="http://www.w3.org/1999/xhtml" class="cs-x4">' +
      C.meter({ w: 120, db: k54.db, peak: k54.peak, floor: k54.floor, tx: true }) + "</div></foreignObject></svg>";

    /* glyph set */
    const G = [
      ["idle", "", "IDLE · ARMED", "state-idle"], ["idle", "is-dim", "IDLE · DIM", "state-idle-dim"], ["squelch", "", "SQUELCH-OPEN", "state-idle"],
      ["tx", "", "TX", "state-tx"], ["stale", "", "STALE", "state-stale"], ["offline", "", "OFFLINE", "state-stale (§11.1)"],
      ["fault", "", "FAULT", "state-fault"], ["fault-past", "", "PAST FAULT", "state-stale"],
    ];
    const glyphs = G.map(([g, cls, name, tok]) => {
      const svg = '<svg class="hud" width="24" height="24" aria-hidden="true">' + HUD.svg.glyph(12, 12, g) + "</svg>";
      return '<div class="cs-gcell"><div class="cs-gbig">' + C.glyph(g, cls + " cs-g72") + "</div>" +
        '<div class="cs-gsizes"><span>' + C.glyph(g, cls) + '<i>18</i></span><span class="chip cs-chipg" data-chip="nominal">' + C.glyph(g, cls) + '<i>14</i></span><span>' + svg + "<i>SVG</i></span></div>" +
        '<div class="cs-name">' + name + '</div><div class="cs-src">' + tok + "</div></div>";
    }).join("");

    /* levers */
    const lv = (label, html, note) => '<div class="cs-lv"><div class="cs-lv__w">' + html + '</div><div class="cs-name">' + label + '</div><div class="cs-src">' + note + "</div></div>";
    const bank = M[kN].view.tile_ids.slice(0, 8).map((cid) => C.lever("R", true, M[kN].channels[cid].aar4)).join("");
    const levers =
      lv("OFF", C.levers({}), "square line-faint · letter ink-3") +
      lv("ON", C.levers({ m: true, s: true, r: true }), "square line · letter + pip ink") +
      lv("HOVER", '<span class="levers"><button class="lever cs-force-hover" aria-pressed="false"><b>M</b></button></span>', "square line · 80 ms") +
      lv("FOCUS", '<span class="levers"><button class="lever cs-force-focus" aria-pressed="false"><b>S</b></button></span>', "rounded ring 1.5 px") +
      lv("DISABLED", '<span class="levers"><button class="lever" disabled><b>R</b></button></span>', "dotted state-offline") +
      '<div class="cs-lv cs-lv--bank"><div class="cs-lv__w cs-lv__w--bank">' + bank + '</div><div class="cs-name">BANK LEVER ROW · R</div><div class="cs-src">Commuter bank · keyed · AAR above each lever</div></div>';

    /* sparkline + pips */
    const sp = (m, cid, live) => '<div class="cs-sp"><span class="cs-sp__s">' + C.spark(M[m].spark[cid], { live }) + '</span><span class="cs-data">' + esc(chLine(m, cid)) + " · " +
      M[m].spark[cid].reduce((a, b) => a + b, 0).toFixed(1) + " S IN 60 MIN" + (live ? " · NOW " + M[m].spark[cid][59].toFixed(1) + " S" : "") + '</span><span class="cs-src">' + momentLine(m) + "</span></div>";
    const pp = (m, cid) => { const c = M[use(m)].channels[cid]; return '<div class="cs-sp"><span class="cs-sp__s">' + C.pips(c.coverage.pips.map((p) => p.state === "ok"), "", true) + '</span><span class="cs-data">' +
      esc(chLine(m, cid)) + " · " + c.coverage.pips.map((p) => p.short + " " + p.state.toUpperCase()).join(" · ") + '</span><span class="cs-src">' + momentLine(m) + "</span></div>"; };

    return '<div class="cs-instr">' +
      '<div class="cs-panel cs-panel--meter"><div class="cs-sub"><span class="t-label">M16 LEVEL METER</span><span class="cs-rule"></span><span class="cs-note">−60 to 0 dBFS · 120 standard · 64 compact</span></div>' +
      '<div class="cs-mrow cs-mrow--hd"><span>STATE</span><span>120</span><span>64</span><span>VALUES</span><span>SOURCE</span></div>' + meters +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">ANATOMY · 4×</span><span class="cs-rule"></span><span class="cs-note">TX · CH54 · keyed</span></div>' + an +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">STATES · 4×</span><span class="cs-rule"></span><span class="cs-note">same values as the 1:1 rows above</span></div>' +
      x4("CLOSED", C.meter({ w: 120, floor: l54.floor })) + x4("SQUELCH-OPEN", C.meter({ w: 120, db: q54.db, peak: q54.peak, floor: q54.floor })) +
      x4("TX", C.meter({ w: 120, db: k54.db, peak: k54.peak, floor: k54.floor, tx: true })) + x4("MUTED · TX", C.meter({ w: 120, db: k08.db, peak: k08.peak, floor: k08.floor, tx: true, muted: true })) +
      x4("N/A", C.meter({ w: 120, na: true })) + x4("M22 · CH54 · KEYED", C.spark(M[kN].spark["amtk-nec-road"], { live: true }), true) + "</div>" +
      '<div class="cs-panel cs-panel--glyph"><div class="cs-sub"><span class="t-label">M6 POSITION-LIGHT GLYPH</span><span class="cs-rule"></span><span class="cs-note">Arrangement, not color · 72 view · 18 tile · 14 chip · SVG</span></div>' +
      '<div class="cs-glyphs">' + glyphs + "</div>" +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">M21 LEVERS</span><span class="cs-rule"></span><span class="cs-note">16 × 16 visible · 24 × 24 hit · pip above</span></div><div class="cs-levers">' + levers + "</div>" +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">M22 SPARKLINE · M25 PIPS</span><span class="cs-rule"></span><span class="cs-note">1 px per minute · full scale 30 s · pips only when partial</span></div>' +
      sp(kN, "amtk-nec-road", true) + sp(kN, "csx-road", true) + pp("fault", "amtk-nec-road") + pp("partial-tx", "csx-road") + "</div></div>";
  }

  /* ------------------------------------------------------------------ C8 controls */

  function boardControls() {
    const chipRow = (m, kind, glyph, why) => {
      const h = M[use(m)].header;
      return '<div class="cs-chiprow"><span class="cs-name">' + kind.toUpperCase() + "</span><span>" + C.chip(h.feeds_chip, kind, { glyph }) + "</span>" +
        '<span class="cs-data">' + (M[m].status_line.length ? M[m].status_line.map(esc).join("<br>") : "no faults · no degraded feeds") + '</span><span class="cs-src">' + momentLine(m) + " · " + why + "</span></div>";
    };
    const sysChips =
      chipRow("keyed", "nominal", null, "header.feeds_chip_state ok") +
      chipRow("degraded", "degraded", "stale", "state stale · no fault") +
      chipRow("fault", "fault", "fault", "unacked fault") +
      chipRow("fault-acked", "acked", "fault", "acked · triangle kept");
    /* ASR · DISK · HOST (brief §8.9). The sim day never degrades these (SoC max 64.9 °C, decoder queue <= 1,
       disk <= 41.9 %), so every non-nominal chip is a FIXTURE with the brief's own wording. The nominal column
       is real: ASR shows as "ASR"; DISK and HOST are null in data/sim because they show only when not nominal. */
    const sy = M.keyed.system, hd = M.keyed.header;
    const hidden = (why) => '<span class="cs-hidden">NOT SHOWN</span><div class="cs-src">' + why + "</div>";
    const cell = (text, kind, glyph, why) => C.chip(text, kind, glyph ? { glyph } : {}) + (why ? '<div class="cs-src">' + why + "</div>" : "");
    const SYS = [
      ["ASR", cell(hd.asr_chip, "nominal") + '<div class="cs-src">asr_chip · queue ' + sy.decoder.queue + " · " + F.num(sy.decoder.median_latency_s, 1) + " s</div>",
        cell("ASR BACKLOG 12", "degraded", "stale", "queue > 10 or latency > 30 s"), cell("ASR FAULT", "fault", "fault", "worker crashed or silent 30 s"), cell("ASR FAULT · ACK'D", "acked", "fault", "triangle kept · ink-2 · no red frame")],
      ["DISK", hidden("disk_chip null · " + F.num(sy.disk.pct, 1) + " % used"),
        cell("DISK 87%", "degraded", "stale", "shown from 85 %"), cell("DISK FAULT · NOT RECORDING", "fault", "fault", "≥ 97 % or a write error"), cell("DISK FAULT · NOT RECORDING · ACK'D", "acked", "fault", "reason kept until it clears")],
      ["HOST", hidden("host_chip null · SoC " + F.num(sy.host.soc_temp_c, 1) + " °C"),
        cell("HOST 81°C", "degraded", "stale", "SoC ≥ 80 °C or throttled"), cell("HOST FAULT · 85°C", "fault", "fault", "SoC ≥ 85 °C or under-voltage"), cell("HOST FAULT · 85°C · ACK'D", "acked", "fault", "triangle kept · ink-2")],
    ];
    const sysMatrix = '<div class="cs-sysrow cs-sysrow--hd"><span>OBJECT</span><span>NOMINAL · KEYED ' + M.keyed.clock_tenths + "</span><span>DEGRADED</span><span>FAULT</span><span>ACK'D</span></div>" +
      SYS.map(([obj, nom, deg, flt, ack]) => '<div class="cs-sysrow"><span class="cs-name">' + obj + "</span><div>" + nom + "</div><div>" + deg + "</div><div>" + flt + "</div><div>" + ack + "</div></div>").join("") +
      '<div class="cs-sysrow cs-sysrow--log"><span class="cs-name">LOG HEAD</span><div class="txlog cs-loghead"><div class="txlog__head"><span class="t-panel">TRANSCRIPT</span>' +
      C.glyph("fault") + '<span class="cs-logfault">DECODER DOWN · SINCE 14:02</span></div></div><span class="cs-src">ASR FAULT unacked · new rows read “No transcript · decoder down.” (C5 row 10) · time from brief §8.9</span></div>';
    const kv = M.keyed.view;
    const other = [
      [C.chip(M.keyed.header.asr_chip, "nominal"), "NOMINAL", "asr_chip · keyed"],
      [C.chip("AUDIO ON", "active", { button: true }), "ACTIVE", "audio"],
      [C.chip(esc(kv.displayed_feed_label) + " ▾", "active", { button: true }), "ACTIVE", "displayed feed · keyed"],
      [C.chip(esc(kv.selector_extra_label), "nominal"), "NOMINAL", "selector extra · keyed"],
      [C.chip(esc(kv.off_bank_label), "nominal"), "NOMINAL", "off-bank · keyed"],
      [C.chip("AUDIO · CLICK TO ENABLE", "armed", { button: true }), "ARMED", "autoplay gate"],
      [C.chip(esc(M.reconnect.feeds.find((f) => f.id === "feed-lnd").short) + " · RECONNECTING", "offline", { glyph: "offline" }), "OFFLINE", "reconnect 14:05:30"],
      [C.chip(esc(kv.hero.aar4) + " · " + esc(kv.hero.timer), "tx", { glyph: "tx" }), "TX", "History header · keyed"],
      [C.chip("BANK ONLY", "filter", { button: true, pressed: true }), "FILTER ON", ""],
      [C.chip("BANK ONLY", "filter", { button: true, pressed: false }), "FILTER OFF", ""],
    ].map(([h, k, s]) => '<div class="cs-chipcell"><div>' + h + '</div><div class="cs-name">' + k + '</div><div class="cs-src">' + s + "</div></div>").join("");
    use("reconnect");

    const bwi = feedOf("keyed", "feed-bwi"), lnd = feedOf("keyed", "feed-lnd");
    const fieldCell = (label, html) => '<div class="cs-fcell">' + html + '<div class="cs-name">' + label + "</div></div>";
    const fields =
      fieldCell("DEFAULT", C.field({ label: "GAIN", value: F.num(bwi.gain_db, 1), unit: "dB", width: 160 })) +
      fieldCell("HOVER", C.field({ label: "PPM", value: F.num(bwi.ppm, 0), unit: "ppm", width: 160 }).replace('class="field__input', 'class="field__input cs-force-hover')) +
      fieldCell("FOCUS", C.field({ label: "CENTER", value: F.freq(bwi.center_mhz), unit: "MHz", state: "focus", width: 160 })) +
      fieldCell("ERROR", C.field({ label: "CALLSIGN", value: lnd.short, text: true, state: "error", error: lnd.short + " is already in use by " + lnd.name.replace(lnd.short + " ", "") + ".", width: 160 })) +
      fieldCell("READONLY", C.field({ label: "DRIVER", value: bwi.driver, state: "readonly", width: 160 })) +
      fieldCell("DISABLED", C.field({ label: "SAMPLE RATE", value: bwi.sample_rate_msps.toFixed(1), unit: "MS/s", state: "disabled", width: 160 })) +
      fieldCell("TEXT · BARLOW 15", C.field({ label: "SITE", value: bwi.site, text: true, width: 420 })) +
      fieldCell("CHECK · TOGGLE · BUTTONS", '<div class="cs-ctl">' + C.check("ENABLED", bwi.enabled) + C.check("RECORD CLIPS", false) + C.toggle("BANK ONLY", true) + C.toggle("UTC", false) + "</div>" +
        '<div class="cs-ctl">' + C.btn("SAVE", { primary: true }) + C.btn("CANCEL") + C.btn("RETRY", { sm: true }) + C.btn("DELETE", { disabled: true }) + "</div>");

    /* N/A · RTL_TCP: an rtl_tcp feed next to the sdrviz-agent feed (SIM) */
    const NA = { device_temp_c: "DEVICE TEMP", host_cpu_pct: "HOST CPU", host_temp_c: "HOST TEMP", device_drops: "DEVICE DROPS" };
    const feedCard = (f) => {
      const tel = f.telemetry || {};
      const rows = [
        C.kv("SAMPLE RATE", f.sample_rate_measured_msps.toFixed(4), { unit: "MS/s" }),
        C.kv("GAIN", F.num(f.gain_db, 1), { unit: "dB" }),
        C.kv("NOISE FLOOR", F.num(f.noise_floor_dbfs, 1), { unit: "dBFS" }),
        C.kv("SNR", F.num(f.snr_db, 1), { unit: "dB" }),
      ];
      Object.entries(NA).forEach(([k, label]) => {
        if (f.telemetry_na && f.telemetry_na.includes(k)) rows.push(C.kv(label, "", { na: "RTL_TCP", meter: k === "device_temp_c" ? { w: 200 } : null }));
        else if (tel[k] != null) rows.push(C.kv(label, k === "device_drops" ? String(tel[k]) : F.num(tel[k], 1), { unit: { device_temp_c: "°C", host_cpu_pct: "%", host_temp_c: "°C", device_drops: "" }[k], sim: true }));
        /* a field the agent does not report in data/sim is not drawn (no reason to give) */
      });
      return '<div class="cs-feedcard br"><div class="cs-feedcard__h">' + C.glyph("idle") + '<span class="t-panel">' + esc(f.short) + '</span><span class="t-micro">' + esc(f.driver.replace(" · SIM", "")) + "</span>" +
        (f.sim ? C.tag.sim() : "") + "</div>" + rows.join("") + "</div>";
    };
    const bay = feedOf("keyed", "feed-bay");

    return '<div class="cs-ctrls">' +
      '<div class="cs-panel"><div class="cs-sub"><span class="t-label">SYSTEM CHIPS · FEEDS</span><span class="cs-rule"></span><span class="cs-note">24 px · mono 12 · 4 px bracket arms · the four states the header passes through in the sim day</span></div>' +
      '<div class="cs-chiprow cs-chiprow--hd"><span>STATE</span><span>CHIP</span><span>STATUS LINE AT THAT MOMENT</span><span>SOURCE</span></div>' + sysChips +
      '<div class="cs-sub cs-sub--sp cs-sub--4"><span class="t-label">SYSTEM CHIPS · ASR · DISK · HOST</span><span class="cs-rule"></span><span class="cs-fixture">FIXTURE</span><span class="cs-note">degraded, fault and ack\'d: the sim day never leaves nominal</span></div>' + sysMatrix +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">INPUTS</span><span class="cs-rule"></span><span class="cs-note">Underline only · label 11 above · the underline never turns red · values BWI-03 · keyed</span></div><div class="cs-fields">' + fields + "</div></div>" +
      '<div class="cs-panel cs-panel--na"><div class="cs-sub"><span class="t-label">N/A · RTL_TCP</span><span class="cs-rule"></span><span class="cs-note">Never zero, never hidden · meters draw scale only</span></div>' +
      '<div class="cs-feedcards">' + feedCard(bwi) + feedCard(bay) + "</div>" +
      '<p class="cs-rulep">' + esc(bwi.short) + " runs " + esc(bwi.driver) + ", which reports no device telemetry: each missing field keeps its row, shows " + F.blank + " in ink-3 and says why. " +
      esc(bay.short) + " runs " + esc(bay.driver) + " (simulated), so its telemetry carries SIM. Values: keyed " + M.keyed.clock_tenths + ".</p>" +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">OTHER CHIP KINDS</span><span class="cs-rule"></span><span class="cs-note">spec §5.20</span></div><div class="cs-chips">' + other + "</div></div></div>";
  }

  /* ------------------------------------------------------------------ C9 readouts */

  function boardReadouts() {
    const kN = use("keyed");
    const T = Object.fromEntries(D.trains.map((t) => [t.train_id, t]));
    const db = (t) => ({ l1: t.data_block[0].replace(" · SIM", ""), l2: t.data_block[1], tx: t.talking, sim: t.sim });

    /* M8 on a plot plate: three tracked trains + the 8 leader offsets */
    let svg = '<svg class="hud cs-dbsvg" width="880" height="300" aria-hidden="true"><rect class="f-void" x="0" y="0" width="880" height="300"/>';
    for (let gx = 40; gx < 880; gx += 80) svg += '<path class="s-hair k-grid" d="M' + HUD.snap(gx) + ' 0V300"/>';
    for (let gy = 20; gy < 300; gy += 80) svg += '<path class="s-hair k-grid" d="M0 ' + HUD.snap(gy) + 'H880"/>';
    const place = (t, x, y, dir) => { const d = db(t); svg += HUD.svg.glyph(x, y, d.tx ? "tx" : "idle") + HUD.svg.dataBlock({ x: x + (dir.includes("w") ? -8 : 8), y: y + (dir.includes("s") ? 8 : -8), dir, l1: d.l1, l2: d.l2, tx: d.tx, sim: d.sim }); };
    place(T["MARC 433"], 110, 210, "ne");
    place(T["MARC 432"], 380, 120, "se");
    place(T["MARC 861"], 530, 210, "ne");
    /* compass rosette */
    const rx = 770, ry = 150;
    svg += HUD.svg.glyph(rx, ry, "idle");
    [["ne", 1, -1], ["e", 1, 0], ["se", 1, 1], ["s", 0, 1], ["sw", -1, 1], ["w", -1, 0], ["nw", -1, -1], ["n", 0, -1]].forEach(([n, dx, dy]) => {
      const k = dx && dy ? 24 / Math.SQRT2 : 24, sx = rx + dx * 10, sy = ry + dy * 10;
      svg += '<path class="s-hair k-line" d="M' + sx + " " + sy + "L" + (sx + dx * k) + " " + (sy + dy * k) + '"/>';
      svg += '<text class="tx-lab" x="' + (sx + dx * (k + 12)) + '" y="' + (sy + dy * (k + 12) + 4) + '" text-anchor="middle">' + n.toUpperCase() + "</text>";
    });
    svg += '<text class="tx-lab" x="' + rx + '" y="' + (ry + 76) + '" text-anchor="middle">8 LEADER OFFSETS · 24 PX</text></svg>';
    const t433 = T["MARC 433"];

    /* M7 AAR readouts, incl. the shared 161.070 pair */
    const ch = (m, cid) => chOf(m, cid);
    const aar = (c) => '<span class="aar">' + F.aar(c.aar) + (c.suffix ? '<span class="suffix">' + esc(c.suffix) + "</span>" : "") + '<span class="aar-mhz">' + F.freq(c.mhz) + " MHz</span></span>";
    const aars = [ch(kN, "amtk-nec-road"), ch(kN, "csx-landover"), ch(kN, "ns-bayview")].map((c) => '<div class="cs-aar">' + aar(c) + "</div>").join("");

    /* M9 milepost posts */
    const P = D.mp_points;
    const posts = [
      "r-nec:wash-union", "r-nec:odenton", "r-nec:quantico", "r-capital:det-hyattsville", "r-capital:det-st-denis", "r-phila:bayview-yd", "r-metro:det-kensington",
    ].map((k) => P[k]).filter(Boolean);
    const derived = P["r-nec:rippon"];
    const mpCell = (p) => '<div class="cs-mp">' + C.mpTag(p.label) + '<div class="cs-name">' + esc(p.prefix) + '</div><div class="cs-src">' + esc(p.name) + "</div>" + C.mpInline(p.label) + "</div>";
    const derivedCell = '<div class="cs-mp">' + C.mpTag(derived.label) + '<div class="cs-name">DERIVED ≈</div><div class="cs-src">' + esc(derived.name) + "</div>" + C.mpInline(derived.label) + "</div>";
    let svgPosts = '<svg class="hud" width="' + (posts.length * 48) + '" height="52" aria-hidden="true">' + posts.map((p, i) => HUD.svg.mpTag(i * 48 + 2, 2, p.label)).join("") + "</svg>";

    /* M10 title blocks inside real status lines */
    const sl = (msgHTML, opts, ack) => '<div class="cs-statusline"><footer class="hud-status"><span class="hud-status__msg' + (opts.fault ? " is-fault" : "") + '">' + msgHTML + "</span>" +
      (ack ? '<span class="hud-status__ack">' + ack + "</span>" : "") + C.titleBlock(opts.tb) + "</footer></div>";
    const f = use("fault"), fa = use("fault-acked");
    const clock = (m) => F.clock(M[m].clock);
    const lines =
      '<div class="cs-tbl"><span class="cs-name">LIVE OPS · KEYED</span>' + sl("", { tb: { screen: "LIVE OPS", scope: ["BANK", M[kN].view.name.toUpperCase()], clock: clock(kN) } }) + "</div>" +
      '<div class="cs-tbl"><span class="cs-name">LIVE OPS · FAULT</span>' + sl(esc(M[f].status_line[0]) + ' <span class="c-ink-2">· ' + esc(M[f].status_line[1]) + "</span>", { fault: true, tb: { screen: "LIVE OPS", scope: ["BANK", M[f].view.name.toUpperCase()], clock: clock(f) } }) + "</div>" +
      '<div class="cs-tbl"><span class="cs-name">LIVE OPS · ACK\'D</span>' + sl(M[fa].status_line.map(esc).join(" · "), { tb: { screen: "LIVE OPS", scope: ["BANK", M[fa].view.name.toUpperCase()], clock: clock(fa) } }, "1 ACK'D FAULT") + "</div>" +
      '<div class="cs-tbl"><span class="cs-name">MAP · OSM CELL</span>' + sl(esc(D.map.corner_readout), { tb: { screen: "MAP", scope: ["EXTENT", "QUANTICO–PERRYVILLE"], clock: clock(kN), osm: true } }) + "</div>";

    /* 3x anatomy of one post */
    const big = posts[1];
    const mpBig = '<div class="cs-mpbig"><div class="cs-mpbig__post">' + C.mpTag(big.label) + '</div><div class="cs-mpbig__k">' +
      "<div>PREFIX · BARLOW SC 500 11 · INK-3 · NATIVE COUNT</div><div>INTEGER · MONO 11 · INK</div><div>DECIMAL · MONO 11 · INK-2</div></div></div>";

    return '<div class="cs-read">' +
      '<div class="cs-sub"><span class="t-label">M8 DATA BLOCK + LEADER</span><span class="cs-rule"></span><span class="cs-note">Tracked trains at keyed ' + M[kN].clock_tenths + " · line 1 state-tx while talking · ≈ marks a derived MP · SIM on every simulated train</span></div>" +
      '<div class="cs-dbwrap"><div class="bezel">' + svg + "</div>" +
      '<div class="cs-dblg"><div class="cs-name">INSPECTOR FORM · LG</div>' + C.dataBlock(db(t433).l1, db(t433).l2, { tx: true, sim: true, lg: true }) +
      '<div class="cs-src">' + esc(t433.line) + " · " + esc(t433.direction) + " · " + t433.speed_mph + " MPH · next " + esc(t433.next_stop.toUpperCase()) + "</div></div>" +
      '<div class="cs-dblg"><div class="cs-name">M7 AAR READOUT</div><div class="cs-src">161.070 is shared by two channels, so each gains a feed suffix</div><div class="cs-aars">' + aars + "</div></div></div>" +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">M9 MILEPOST TAG</span><span class="cs-rule"></span><span class="cs-note">32 × 48 post · 1 px line · native counts from routes.json; NEC falls from Washington to Perryville</span></div>' +
      '<div class="cs-mps">' + posts.map(mpCell).join("") + derivedCell + '<div class="cs-mp cs-mp--svg">' + svgPosts + '<div class="cs-name">SVG FORM</div><div class="cs-src">HUD.svg.mpTag · map, stringline</div></div>' + mpBig + "</div>" +
      '<div class="cs-sub cs-sub--sp"><span class="t-label">M10 TITLE BLOCK · IN THE STATUS LINE</span><span class="cs-rule"></span><span class="cs-note">24 px · 1 px line-faint cell rules · keys 11 ink-3 · values mono ink-2 · Map adds the OSM cell</span></div>' + lines + "</div>";
  }

  /* ------------------------------------------------------------------ mount */

  const wanted = HUD.state === "all" || !BOARDS.some((b) => b.id === HUD.state) ? BOARDS : BOARDS.filter((b) => b.id === HUD.state);
  sheet.innerHTML = wanted.map((b) => { sources.list = []; return board(b, sources); }).join("");
  document.documentElement.dataset.board = wanted.length === 1 ? wanted[0].id : "all";
  HUD.fitEmbers(sheet);
})();

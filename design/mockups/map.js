/* map.js — WLT-1 Map screen mockup (brief §9.5; spec §4.5, §5.13–5.16, §5.30).

   Every number on screen comes from data:
     data/sim/scenarios/<state>.json   feeds, trains, active transmissions, header, status line
     data/seed/places.json             stations (37), detectors (13), feed sites
     data/sim/routes.json              route chains + native mileposts (MP ticks, schematic, train tails)
     data/geo/{rail,water}.geojson     OSM line work (tools/fetch_geo.py), © OpenStreetMap contributors

   URL: ?state=listening|keyed|fault|fault-acked  &mode=schematic  &motion=1 (map ping; &t=<ms> freezes it)
        &select=<train id>  &size=1440  &build=0

   Projection: Lambert conformal conic, parallels 38.3 / 39.45, central meridian −77 (NAD83 Maryland,
   EPSG:26985), turned by a computed planar angle so the Union Station → Baltimore Penn chord is level,
   then fitted to the union of two 20 mi circles (brief §9.5). Vanilla JS so the mockup is self-contained;
   Stage 3 uses d3-geo with the same parameters (see the note in the summary on rotate vs center). */
(async function () {
  "use strict";

  const esc = HUD.esc, fmt = HUD.fmt, P = HUD.params;
  const MODE = P.mode === "schematic" ? "schematic" : "geo";
  const DEMO = P.motion === "1";
  const FREEZE = P.t != null && P.t !== "" ? Number(P.t) : null;
  const W = HUD.size === 1440 ? 1376 : 1856, H = HUD.size === 1440 ? 804 : 984;
  const RAD = Math.PI / 180, EARTH_KM = 6371.0088, MI_KM = 1.609344;
  const TERMINALS = new Set(["wash-union", "baltimore-penn"]);

  /* ------------------------------------------------------------------ data */
  async function loadScenario(name) {
    try { return await HUD.loadScenario(name); } catch (e) { /* twin below */ }
    /* REQUEST: gen_sim writes scenarios/<name>.js registering SDRVIZ_SCENARIOS[name]; HUD.load expects
       <path>.js registering SDRVIZ_DATA[<path>]. Until one side changes, inject the existing twin here. */
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = HUD.ROOT + "data/sim/scenarios/" + name + ".js";
      s.onload = s.onerror = resolve;
      document.head.appendChild(s);
    });
    const d = window.SDRVIZ_SCENARIOS && window.SDRVIZ_SCENARIOS[name];
    if (!d) throw new Error("DATA NOT FOUND · data/sim/scenarios/" + name + ".json");
    return d;
  }

  let scn, places, routesDoc, rail, water;
  try {
    [scn, places, routesDoc, rail, water] = await Promise.all([
      loadScenario(HUD.state), HUD.loadSeed("places"), HUD.loadSim("routes"),
      HUD.load("data/geo/rail.geojson"), HUD.load("data/geo/water.geojson"),
    ]);
  } catch (err) {
    HUD.shell("#stage", { screen: "map", osm: true });
    HUD.fail(err);
    return;
  }

  /* fonts must be in before text is measured for the label placer */
  const FONTS = ['400 12px "JetBrains Mono"', '500 12px "JetBrains Mono"', '400 11px "JetBrains Mono"', '500 48px "JetBrains Mono"',
    '500 11px "Barlow Semi Condensed"', '600 13px "Barlow Semi Condensed"', '600 13px "Rajdhani"'];
  if (document.fonts) {
    await Promise.race([Promise.all(FONTS.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
  }

  const routes = routesDoc.routes;
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const placeById = {};
  for (const k of ["stations", "landmarks", "detectors", "feeds"]) for (const p of places[k]) placeById[p.id] = p;
  for (const p of routesDoc.derived_points || []) placeById[p.id] = p;
  const feeds = scn.feeds;
  const feedById = Object.fromEntries(feeds.map((f) => [f.id, f]));
  const trains = scn.trains.positions;
  const active = scn.active_transmissions || [];

  /* counts are computed, then checked against the scenario's own summary */
  const COUNT = { feeds: feeds.length, stations: places.stations.length, detectors: places.detectors.length, trains: scn.trains.tracked_count };
  for (const k of ["feeds", "stations", "detectors"]) if (scn.map && scn.map[k] !== COUNT[k]) console.warn("map count mismatch", k, scn.map[k], COUNT[k]);

  /* ------------------------------------------------------------------ geometry helpers */
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const f1 = (v) => Math.round(v * 10) / 10;
  const dPath = (pts, close) => pts.length ? "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + (close ? "Z" : "") : "";

  function dest(lon, lat, brgDeg, km) {
    const d = km / EARTH_KM, b = brgDeg * RAD, p = lat * RAD, l = lon * RAD;
    const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
    const l2 = l + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
    return [l2 / RAD, p2 / RAD];
  }
  function geoKm(a, b) {
    const p1 = a[1] * RAD, p2 = b[1] * RAD, dp = p2 - p1, dl = (b[0] - a[0]) * RAD;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
  }
  const geoCircle = (lon, lat, km, step = 4) => { const o = []; for (let b = 0; b < 360; b += step) o.push(dest(lon, lat, b, km)); return o; };

  /* Lambert conformal conic (spherical, as d3.geoConicConformal) + planar angle + fit */
  function makeProjection() {
    const p1 = 38.3 * RAD, p2 = 39.45 * RAD, lam0 = -77;
    const tany = (y) => Math.tan((Math.PI / 2 + y) / 2);
    const n = Math.log(Math.cos(p1) / Math.cos(p2)) / Math.log(tany(p2) / tany(p1));
    const F = (Math.cos(p1) * Math.pow(tany(p1), n)) / n;
    const raw = (lon, lat) => {
      const r = F / Math.pow(tany(lat * RAD), n), t = n * (lon - lam0) * RAD;
      return [r * Math.sin(t), -(F - r * Math.cos(t))];               /* y down */
    };
    const rawInv = (x, y) => {
      const fy = F + y, r = Math.sign(n) * Math.hypot(x, fy);
      return [Math.atan2(x, fy) / n / RAD + lam0, (2 * Math.atan(Math.pow(F / r, 1 / n)) - Math.PI / 2) / RAD];
    };
    let a = 0, k = 1, tx = 0, ty = 0;
    const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const proj = (lon, lat) => { const [x, y] = rot(raw(lon, lat)); return [x * k + tx, y * k + ty]; };
    proj.invert = (X, Y) => {
      const x = (X - tx) / k, y = (Y - ty) / k;
      return rawInv(x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a));
    };
    proj.fit = (from, to, pts) => {
      /* brief §9.5 steps 1–4: chord angle φ at angle 0, turn by −φ, re-fit, assert */
      const A = raw(...from), B = raw(...to);
      a = -Math.atan2(B[1] - A[1], B[0] - A[0]);
      const r = pts.map((p) => rot(raw(p[0], p[1])));
      const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      k = Math.min(W / (x1 - x0), H / (y1 - y0));
      tx = W / 2 - (k * (x0 + x1)) / 2;
      ty = H / 2 - (k * (y0 + y1)) / 2;
      const U = proj(...from), V = proj(...to);
      if (!(V[0] > U[0] && Math.abs(V[1] - U[1]) <= 0.02 * H)) { a += Math.PI; proj.fit(from, to, pts); }
    };
    proj.angle = () => a / RAD;
    proj.pan = (dx, dy) => { tx += dx; ty += dy; };   /* a d3-zoom translate, k unchanged */
    return proj;
  }

  const proj = makeProjection();
  const UNION = placeById["wash-union"], PENN = placeById["baltimore-penn"];
  const R20 = 0.2895 * RAD * EARTH_KM; /* 20 mi as an arc of 0.2895° */
  proj.fit([UNION.lon, UNION.lat], [PENN.lon, PENN.lat],
    [...geoCircle(UNION.lon, UNION.lat, R20, 2), ...geoCircle(PENN.lon, PENN.lat, R20, 2)]);
  /* select: pan (k unchanged) so the selected train or feed lands in the centre of the canvas the 480 px
     inspector leaves uncovered (brief §8.3); the layout below is then solved for the panned view */
  const INSPECTOR_W = 480;
  const normId = (s) => String(s || "").toLowerCase().replace(/[\s_-]+/g, "");
  const PAN = (() => {
    if (MODE !== "geo" || !P.select) return null;
    const id = normId(P.select);
    const hit = scn.trains.positions.find((t) => normId(t.train_id) === id) || scn.feeds.find((f) => normId(f.short) === id || normId(f.id) === id);
    if (!hit) return null;
    const at = proj(hit.lon, hit.lat), dx = Math.round((W - INSPECTOR_W) / 2 - at[0]), dy = Math.round(H / 2 - at[1]);
    proj.pan(dx, dy);
    return { dx, dy };
  })();
  const pxPerKm = (() => { const c = proj.invert(W / 2, H / 2), e = dest(c[0], c[1], 90, 10); return dist2(proj(...c), proj(...e)) / 10; })();
  console.info("map: planar angle", proj.angle().toFixed(2), "deg ·", pxPerKm.toFixed(2), "px/km");

  /* ------------------------------------------------------------------ rail index + snapping */
  const railLines = rail.features.map((f) => ({ cls: f.properties.class, name: f.properties.name || "", pts: f.geometry.coordinates.map((c) => proj(c[0], c[1])) }));

  function nearestOn(p, filter, maxPx = 40) {
    let best = null;
    for (const line of railLines) {
      if (filter && !filter(line)) continue;
      const L = line.pts;
      for (let i = 0; i < L.length - 1; i++) {
        const a = L[i], b = L[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
        const q = [a[0] + dx * t, a[1] + dy * t], d = dist2(p, q);
        if (d <= maxPx && (!best || d < best.d)) {
          const len = Math.sqrt(len2);
          best = { line, i, t, pt: q, d, dir: [dx / len, dy / len] };
        }
      }
    }
    return best;
  }
  const paramLess = (a, b) => a.i < b.i || (a.i === b.i && a.t <= b.t);
  function slice(line, a, b) { /* sub-polyline from param a to param b, starting at a */
    const L = line.pts, at = (q) => lerp(L[q.i], L[q.i + 1], q.t);
    const fwd = paramLess(a, b), s = fwd ? a : b, e = fwd ? b : a;
    const out = [at(s)];
    for (let i = s.i + 1; i <= e.i; i++) out.push(L[i]);
    out.push(at(e));
    return fwd ? out : out.reverse();
  }

  /* route helpers: lat/lon at a route mile; parse "≈CFP 85.6" */
  function routeLatLon(route, mi) {
    const pts = route.points;
    if (mi <= pts[0].route_mi) return [pts[0].lon, pts[0].lat];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (mi >= a.route_mi && mi <= b.route_mi) {
        const t = b.route_mi > a.route_mi ? (mi - a.route_mi) / (b.route_mi - a.route_mi) : 0;
        return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
      }
    }
    const z = pts[pts.length - 1];
    return [z.lon, z.lat];
  }
  const parseMp = (label) => {
    const m = String(label || "").match(/^(≈)?\s*([A-Z]+)\s*(\d+(?:\.\d+)?)/);
    return m ? { derived: !!m[1], prefix: m[2], v: Number(m[3]) } : null;
  };

  /* ------------------------------------------------------------------ text measure + label boxes */
  const ctx = document.createElement("canvas").getContext("2d");
  const FONT = {
    mono12: ['400 12px "JetBrains Mono"', 0], mono11: ['400 11px "JetBrains Mono"', 0], monoB12: ['500 12px "JetBrains Mono"', 0],
    lab11: ['500 11px "Barlow Semi Condensed"', 0.1], line11: ['500 11px "Barlow Semi Condensed"', 0.16], term13: ['600 13px "Rajdhani"', 0.12],
  };
  const textW = (s, f) => { ctx.font = FONT[f][0]; const px = parseFloat(FONT[f][0].match(/(\d+)px/)[1]); return ctx.measureText(String(s).toUpperCase()).width + String(s).length * FONT[f][1] * px; };
  const textWExact = (s, f) => { ctx.font = FONT[f][0]; return ctx.measureText(String(s)).width; };

  function Boxes() {
    const list = [];
    return {
      list,
      add(b, pad = 0) { list.push({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }); },
      hits(b, margin = 4) {
        if (b.x0 < margin || b.y0 < margin || b.x1 > W - margin || b.y1 > H - margin) return Infinity;
        let n = 0;
        for (const o of list) if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) n++;
        return n;
      },
    };
  }

  /* a rotated label as a strip of small squares along its baseline: close to its true footprint, so a
     diagonal name does not claim the whole bounding box (and the track or link it labels) */
  function labelStrip(c, angRad, w, h) {
    const n = Math.max(1, Math.ceil(w / h)), ux = Math.cos(angRad), uy = Math.sin(angRad), out = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, x = c[0] + ux * t * w, y = c[1] + uy * t * w;
      out.push({ x0: x - h / 2, y0: y - h / 2, x1: x + h / 2, y1: y + h / 2 });
    }
    return out;
  }
  const stripFree = (boxes, list, margin) => list.every((b) => boxes.hits(b, margin) === 0);

  /* exact 2D tests for the schematic placer and the collision audit (polygons are simple, usually convex) */
  const cross3 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  function segX(a, b, c, d) { /* proper or touching intersection of segments ab and cd */
    const d1 = cross3(c, d, a), d2 = cross3(c, d, b), d3 = cross3(a, b, c), d4 = cross3(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const polyEdges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const segPoly = (a, b, poly) => inPoly(a, poly) || inPoly(b, poly) || polyEdges(poly).some(([c, d]) => segX(a, b, c, d));
  const polyPoly = (P1, P2) => inPoly(P1[0], P2) || inPoly(P2[0], P1) || polyEdges(P1).some(([a, b]) => polyEdges(P2).some(([c, d]) => segX(a, b, c, d)));
  const rectPoly = (b) => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  /* a rotated text run: origin at the baseline start, cap height 9 above, 3 below */
  function textPoly(ox, oy, angRad, w, anchor = "start", pad = 2) {
    const ux = Math.cos(angRad), uy = Math.sin(angRad), vx = -uy, vy = ux;
    const s0 = anchor === "end" ? -w : anchor === "middle" ? -w / 2 : 0, s1 = s0 + w;
    const at = (s, t) => [ox + ux * s + vx * t, oy + uy * s + vy * t];
    /* 2 px clear of the ink on every side, so a leader can never run along a label's edge (a collinear leader
       touches nothing under strict segment tests) */
    return [at(s0 - pad, -10 - pad), at(s1 + pad, -10 - pad), at(s1 + pad, 4 + pad), at(s0 - pad, 4 + pad)];
  }
  /* the ink box of an 11 px uppercase run (caps ≈ 8 px), 1 px clear: for name-to-name tests, where the 2 px leader
     clearance of textPoly would make two parallel 45° names "collide" without their glyphs touching */
  function tightPoly(ox, oy, angRad, w, anchor = "start") {
    const ux = Math.cos(angRad), uy = Math.sin(angRad), vx = -uy, vy = ux;
    const s0 = anchor === "end" ? -w : anchor === "middle" ? -w / 2 : 0, s1 = s0 + w;
    const at = (s, t) => [ox + ux * s + vx * t, oy + uy * s + vy * t];
    return [at(s0 - 1, -9), at(s1 + 1, -9), at(s1 + 1, 2), at(s0 - 1, 2)];
  }
  /* rail polylines inside the canvas, as segments, for the geo placer's soft cost and the audit */
  const segRect = (a, b, r) => {
    if (Math.max(a[0], b[0]) < r.x0 || Math.min(a[0], b[0]) > r.x1 || Math.max(a[1], b[1]) < r.y0 || Math.min(a[1], b[1]) > r.y1) return false;
    return segPoly(a, b, rectPoly(r));
  };
  const railInView = railLines.map((l) => ({ ...l, segs: l.pts.slice(1).map((b, i) => [l.pts[i], b]).filter(([a, b]) => Math.max(a[0], b[0]) > 0 && Math.min(a[0], b[0]) < W && Math.max(a[1], b[1]) > 0 && Math.min(a[1], b[1]) < H) })).filter((l) => l.segs.length);
  const railSegs = railInView.flatMap((l) => l.segs);
  const padRect = (b, p) => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });
  const overlap = (A, B) => A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;
  /* rail as a hard obstacle for names (brief §9.5: labels never collide at default zoom) */
  const railUnderRect = (b) => railSegs.some(([a, c]) => segRect(a, c, b));
  function railUnderPoly(poly) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const bb = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    return railSegs.some(([a, c]) => segRect(a, c, bb) && segPoly(a, c, poly));
  }
  /* the glyph box of a centred, rotated name (text-anchor middle, dy 4 → caps from −4 to +4 about c), plus pad */
  function namePoly(c, ang, w, pad) {
    const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    const at = (s, t) => [c[0] + ux * s + vx * t, c[1] + uy * s + vy * t];
    return [at(-w / 2 - pad, -4 - pad), at(w / 2 + pad, -4 - pad), at(w / 2 + pad, 4 + pad), at(-w / 2 - pad, 4 + pad)];
  }
  /* polyline length of a leader */
  const leadLen = (g) => g.lead.slice(1).reduce((n, p, k) => n + dist2(g.lead[k], p), 0);

  /* M8 data block geometry, mirroring HUD.svg.dataBlock (leader 24 px at 45°, tag 4 px past the end),
     plus a glyph slot before line 1 and a state class on line 2.
     REQUEST: HUD.svg.dataBlock options { glyph, l2Class, from } so screens need not mirror it. */
  const DIRS = { ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1], e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };
  function blockGeom(o) {
    const [dx, dy] = DIRS[o.dir], len = o.len || 24, k = dx && dy ? len / Math.SQRT2 : len;
    let sx = o.x + dx * (o.from || 0) / (dx && dy ? Math.SQRT2 : 1), sy = o.y + dy * (o.from || 0) / (dx && dy ? Math.SQRT2 : 1);
    /* o.v: an orthogonal (vertical) run before the 45° leg, Beck style; the leader becomes a dogleg */
  const v = o.v || 0, kx = o.x, ky = o.y + dy * v;
  if (v) { sx = o.x; sy = o.y + dy * (o.from || 0); }
  const ex = kx + dx * k, ey = ky + dy * k, left = dx < 0 || (dx === 0 && !!o.flip);   /* flip: a flagpole whose block ends flush at the pole */
    const tx = ex + (dx < 0 ? -4 : dx > 0 ? 4 : 0);
    /* a vertical (n/s) leader is a flagpole: the block sits wholly past its end, flush left with it,
       so the pole never runs through a glyph */
    const ty = dx === 0 ? (dy > 0 ? ey + 14 : ey - 21) : dy > 0 ? ey + 12 : ey - 6;
    const gw = o.glyph ? 18 : 0;
    const w1 = textWExact(o.l1, "mono12") + (o.sim ? 6 + textW("SIM", "lab11") : 0);
    const w2 = textWExact(o.l2, "mono12");
    const w = Math.max(w1 + gw, w2);
    const x0 = left ? tx - w : tx;
    const lead = v ? [[sx, sy], [kx, ky], [ex, ey]] : [[sx, sy], [ex, ey]];
    return { ...o, sx, sy, ex, ey, tx, ty, left, gw, w1, w2, w, lead, box: { x0: x0 - 2, y0: ty - 12, x1: x0 + w + 2, y1: ty + 19 } };
  }
  function blockSvg(g) {
    /* schematic leaders are ink-3, never the route tone: in a 0°/45° diagram a k-line diagonal reads as track */
    /* geo leaders too (review r3 #4): a k-line leader beside a rail reads as a spur */
    const kLead = g.tx_ ? "k-tx" : "k-ink3", b = g.box;
    /* knockout: a bg-void plate (2 px past the type, no stroke, no rounding) so no hairline runs through a block */
    let s = '<g class="datablock-svg"><rect class="mp-f-void" x="' + f1(b.x0) + '" y="' + f1(b.y0 + 1) + '" width="' + f1(b.x1 - b.x0) + '" height="' + f1(b.y1 - b.y0 - 1) + '"/>' +
      '<path class="s-hair ' + kLead + '" fill="none" d="' + dPath(g.lead) + '"/>';
    /* line 1: [glyph] text [SIM]; anchored so the whole tag sits on the leader's side */
    const l1x = g.left ? g.tx - g.w1 : g.tx + g.gw;
    if (g.glyph) s += glyphSvg(l1x - 11, g.ty - 4, g.glyph);
    s += '<text class="tx-data' + (g.tx_ ? " is-tx" : "") + '" x="' + f1(l1x) + '" y="' + f1(g.ty) + '">' + esc(g.l1) +
      (g.sim ? '<tspan class="tx-lab" dx="6">SIM</tspan>' : "") + "</text>";
    s += '<text class="tx-num2 ' + (g.l2Class || "") + '" x="' + f1(g.tx) + '" y="' + f1(g.ty + 15) +
      '" text-anchor="' + (g.left ? "end" : "start") + '">' + esc(g.l2) + "</text></g>";
    return s;
  }
  function glyphSvg(cx, cy, g) {
    /* HUD.svg.glyph at a 6 px pitch; idle uses the dim armed tone on the map */
    const s = HUD.svg.glyph(f1(cx), f1(cy), g === "idle-dim" ? "idle" : g);
    return g === "idle-dim" ? s.replace(/f-idle/g, "mp-f-idle-dim") : s;
  }
  /* the leader is reserved too, so no leader crosses another label */
  const leaderBoxes = (g) => {
    const out = [], n = Math.max(1, Math.ceil(dist2([g.sx, g.sy], [g.ex, g.ey]) / 6));
    for (let k = 1; k <= n; k++) { const q = lerp([g.sx, g.sy], [g.ex, g.ey], k / n); out.push({ x0: q[0] - 2, y0: q[1] - 2, x1: q[0] + 2, y1: q[1] + 2 }); }
    return out;
  };
  /* Geo placer. Cost per candidate: text over text 10, each leader cell on a label 1, each rail line through
     the block 3 (a soft obstacle: blocks prefer open water or an empty quadrant), each step of leader length 0.5.
     The lowest cost wins; ties go to the earlier (shorter, preferred-direction) candidate. */
  /* Exact block hygiene on top of the cost: no block within 4 px of another block, no leader within 2 px of
     another block, no block within 2 px of another leader, and no leader is longer than 64 px (a long leader falls back to another
     quadrant instead). Leaders crossing a rail line cost 2 each (soft). */
  const LEAD_MAX = 64;
  const placedGeo = [], hardNames = [];
  const legsOfG = (g) => g.lead.slice(1).map((p, k) => [g.lead[k], p]);
  const geoClash = (g) => {
    const box2 = padRect(g.box, 2), legs = legsOfG(g);
    const over = (A, B) => A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;
    return placedGeo.some((h) => over(box2, padRect(h.box, 2)) || legs.some(([a, b]) => segRect(a, b, padRect(h.box, 2))) || legsOfG(h).some(([a, b]) => segRect(a, b, box2)));
  };
  const railCross = (g) => legsOfG(g).reduce((n, [a, b]) => n + railSegs.filter(([c, d]) => segX(a, b, c, d)).length, 0);
  /* review r3 #4: a leader may cross rail but never run along it. Sample each leg every px; a sample is "along"
     when it lies within 4 px of a rail segment running within 25° of the leg. A run of more than 8 px along rail is a
     hard reject (a straight crossing at 45° stays near the rail for ~11 px but is never parallel, so it passes). */
  const segDist = (p, a, c) => {
    const vx = c[0] - a[0], vy = c[1] - a[1], L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  };
  const COS25 = Math.cos(25 * Math.PI / 180);
  function railAlong(g) {
    for (const [a, b] of legsOfG(g)) {
      const L = dist2(a, b);
      if (L < 8) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      const bb = { x0: Math.min(a[0], b[0]) - 4, y0: Math.min(a[1], b[1]) - 4, x1: Math.max(a[0], b[0]) + 4, y1: Math.max(a[1], b[1]) + 4 };
      const near = railSegs.filter(([c, d]) => {
        if (!segRect(c, d, bb)) return false;
        const l = dist2(c, d) || 1;
        return Math.abs(((d[0] - c[0]) * ux + (d[1] - c[1]) * uy) / l) >= COS25;
      });
      if (!near.length) continue;
      let run = 0;
      for (let k = 0; k <= L; k++) {
        const q = [a[0] + ux * k, a[1] + uy * k];
        run = near.some(([c, d]) => segDist(q, c, d) <= 4) ? run + 1 : 0;
        if (run > 8) return true;
      }
    }
    return false;
  }
  function placeBlock(boxes, base, dirs = ["ne", "nw", "se", "sw", "e", "w", "n", "s"], lens = [24, 40, 56, 72], soft = null) {
    let best = null;
    const claim = (g) => { boxes.add(g.box); leaderBoxes(g).forEach((b) => boxes.add(b)); placedGeo.push(g); return g; };
    /* pass 1: names claimed before the blocks (terminals, rank < 3) are hard, no block plate or leader may cover
       them; pass 2 (only if pass 1 found nothing): they cost like any other label, so blocks never stack instead */
    for (const strictNames of [true, false]) {
    if (best) break;
    lens.forEach((len, li) => dirs.forEach((dir) => {
      const g = blockGeom({ ...base, dir, len: Math.min(len, LEAD_MAX + (base.from || 0)) });
      if (leadLen(g) > LEAD_MAX + 0.01 || geoClash(g) || railAlong(g)) return;
      if (strictNames && hardNames.some((r) => overlap(g.box, r) || legsOfG(g).some(([a, b]) => segRect(a, b, r)))) return;
      const hard = boxes.hits(g.box) * 10 + leaderBoxes(g).reduce((a, b) => a + boxes.hits(b, 0), 0);
      if (hard === Infinity) return;
      const coversName = strictNames ? 0 : hardNames.filter((r) => overlap(g.box, r) || legsOfG(g).some(([a, b]) => segRect(a, b, r))).length;
      const n = hard + 50 * coversName + (soft ? 3 * soft(g.box) : 0) + 2 * railCross(g) + li * 0.5;
      if (!best || n < best.n) best = { g, n };
    }));
    }
    if (!best) console.warn("map: no clean geo block slot", base.l1);
    return claim(best ? best.g : blockGeom({ ...base, dir: dirs[0], len: lens[0] }));
  }

  /* ------------------------------------------------------------------ scenario-derived state */
  const txByFeed = {};             /* feed id → [transmission] (every reception, brief §9.0.3) */
  for (const t of active) for (const r of t.receptions || []) (txByFeed[r.feed_id] = txByFeed[r.feed_id] || []).push(t);
  const DEMO_TX = DEMO ? active.find((t) => t.train_id) : null;   /* the replayed key-up: CH54 · MARC 433 */

  function feedLook(f, demoMs) {
    const hearing = (txByFeed[f.id] || []).filter((t) => !(DEMO_TX && t === DEMO_TX && demoMs < 250));
    const fault = f.state === "fault", stale = f.state === "stale", offline = f.state === "offline";
    let glyph = "idle-dim";
    if (fault) glyph = "fault";
    else if (offline) glyph = "offline";
    else if (stale) glyph = "stale";
    else if (hearing.length) glyph = "tx";
    else if (DEMO_TX && demoMs >= 0 && demoMs < 250 && (DEMO_TX.receptions || []).some((r) => r.feed_id === f.id)) glyph = "squelch";
    const l2 = fault ? f.label : stale ? "STALE · AGE " + (f.in_state_label || fmt.age(f.last_sample_age_s, "age")) :
      f.coverage_radius_km + " KM · " + fmt.snr(f.snr_db);
    return { fault, stale, acked: !!f.acked, glyph, l2, l2Class: fault ? "mp-l2-fault" : stale ? "mp-l2-stale" : "", mark: fault ? "fault" : stale ? "stale" : "line" };
  }

  /* ------------------------------------------------------------------ shell */
  const anyUnacked = (scn.faults || []).some((f) => !f.acked), anyAcked = (scn.faults || []).some((f) => f.acked);
  const feedChipKind = anyUnacked ? "fault" : anyAcked ? "acked" : (scn.degraded || []).length ? "degraded" : "nominal";
  /* shared header chips (KEYED chip off Live Ops, brief §9.2) and status line (hud.js) */
  const chips = HUD.headerChips(scn, { txChip: true });
  const status = HUD.statusFrom(scn, "MAP · " + (MODE === "geo" ? "GEO" : "SCHEMATIC") + " · DEFAULT VIEW · ZOOM 1.0×");
  const content = HUD.shell("#stage", {
    screen: "map", scope: ["MODE", MODE === "geo" ? "GEO" : "SCHEMATIC"], clock: scn.clock, zone: (scn.tz && scn.tz.name) || "EST",
    chips, audio: "on", status, osm: true, sim: scn.sim !== false,
  });

  /* ------------------------------------------------------------------ static layers: geo */
  const boxesGeo = Boxes(), boxesSch = Boxes();
  const defs = [];
  const geo = [];   /* strings, bottom to top */

  /* 1 graticule every 0.1°, coordinate numerals at the canvas edges (M11 style) */
  const grat = [];
  for (let lat = 38.3; lat <= 39.81; lat += 0.1) { const pts = []; for (let lon = -78.0; lon <= -75.7; lon += 0.02) pts.push(proj(lon, lat)); grat.push({ pts, lab: lat.toFixed(1) + " N" }); }
  for (let lon = -78.0; lon <= -75.69; lon += 0.1) { const pts = []; for (let lat = 38.3; lat <= 39.8; lat += 0.02) pts.push(proj(lon, lat)); grat.push({ pts, lab: Math.abs(lon).toFixed(1) + " W" }); }
  geo.push('<g class="graticule">' + grat.map((g) => '<path class="s-hair k-grid" d="' + dPath(g.pts) + '"/>').join("") + "</g>");

  /* 2 shorelines: the line is the shore, no fill */
  geo.push('<g class="mp-water">' + water.features.map((f) => '<path class="s-hair k-faint" d="' + dPath(f.geometry.coordinates.map((c) => proj(c[0], c[1]))) + '"/>').join("") + "</g>");

  /* 3 coverage: M5 range rings every 5 km (10 KM labels where they cross north) + M23 clipped hatch */
  const cov = [];
  /* M5 label where the ring crosses north; dropped if it would sit on another feed's label (greedy, §9.5) */
  function ringLabel(f, km) {
    const n = proj(...dest(f.lon, f.lat, 0, km)), text = km + " KM", w = textWExact(text, "mono11");
    const box = { x0: n[0] + 2, y0: n[1] - 15, x1: n[0] + w + 6, y1: n[1] - 1 };
    if (boxesGeo.hits(box) !== 0) return "";
    boxesGeo.add(box);
    return '<text class="mp-coord" x="' + f1(n[0] + 4) + '" y="' + f1(n[1] - 4) + '">' + text + "</text>";
  }
  feeds.forEach((f, i) => {
    const look = feedLook(f, -1), c = proj(f.lon, f.lat);
    const ringD = (km) => dPath(geoCircle(f.lon, f.lat, km, 3).map((p) => proj(...p)), true);
    const pat = "mp-hatch-" + i, clip = "mp-cov-" + i;
    /* M23 (spec §11.14, ruled): rest hatch +45° (rising, "/") in line-faint; an unacked fault turns it −45° ("\")
       in state-fault-dim at the same 8 px pitch, so it reads by pattern in grayscale. ACK returns it to the rest hatch. */
    const unackedFault = look.fault && !look.acked;
    const hatchK = unackedFault ? "k-fault-dim" : "k-faint";
    defs.push('<pattern id="' + pat + '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(' + (unackedFault ? 45 : -45) + ') translate(0 ' + i * 2 + ')">' +
      '<path class="s-hair ' + hatchK + '" d="M0 0.5H8"/></pattern>');
    defs.push('<clipPath id="' + clip + '"><path d="' + ringD(f.coverage_radius_km) + '"/></clipPath>');
    let s = '<g class="mp-cov" data-feed="' + f.id + '"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + pat + ')" clip-path="url(#' + clip + ')"' + (hatchK === "k-faint" ? ' class="hatch-rest"' : "") + "/>";
    /* brief §9.5: a stale or faulted feed's contour sits in its dashed state (dash-stale 4 4), acked or not.
       Only the hatch tells unacked fault (state-fault-dim, −45°) from acked (line-faint, +45°). */
    const degraded = look.stale || look.fault, dash = degraded ? " d-stale" : "";
    for (let km = 5; km < f.coverage_radius_km; km += 5) {
      s += '<path class="s-hair k-faint' + dash + '" d="' + ringD(km) + '"/>';
      if (km % 10 === 0) s += ringLabel(f, km);
    }
    s += '<path class="s-hair ' + (degraded ? "k-stale d-stale" : "k-line d-threshold") + '" d="' + ringD(f.coverage_radius_km) + '"/>';
    s += ringLabel(f, f.coverage_radius_km) + "</g>";
    cov.push(s);
  });
  geo.push(cov.join(""));

  /* 4 rail: NEC 1.5 px line, other lines 1 px line, freight-only dashed 6 3 (label and dash, never hue) */
  const railCls = { nec: "s-emph k-line", passenger: "s-hair k-line", freight: "s-hair k-line d-measure" };
  geo.push('<g class="mp-rail">' + ["freight", "passenger", "nec"].map((cls) =>
    railLines.filter((l) => l.cls === cls).map((l) => '<path class="' + railCls[cls] + '" d="' + dPath(l.pts) + '"/>').join("")).join("") + "</g>");

  /* 5 mileposts: every 5 mi on route lines, unlabelled at k < 2 (derived from route points, ≈) */
  const mpTicks = [];
  for (const r of routes) {
    const seen = new Set();
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = parseMp(r.points[i].mp_label), b = parseMp(r.points[i + 1].mp_label);
      if (!a || !b || a.prefix !== b.prefix || a.v === b.v) continue;
      const lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v);
      for (let m = Math.ceil(lo / 5) * 5; m <= hi; m += 5) {
        const key = a.prefix + m;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = (m - a.v) / (b.v - a.v), mi = r.points[i].route_mi + t * (r.points[i + 1].route_mi - r.points[i].route_mi);
        const sn = nearestOn(proj(...routeLatLon(r, mi)), (l) => l.cls !== "freight" || r.id === "r-phila", 30);
        if (!sn) continue;
        const nx = -sn.dir[1], ny = sn.dir[0];
        mpTicks.push('<path class="s-hair k-line" d="M' + f1(sn.pt[0]) + " " + f1(sn.pt[1]) + "l" + f1(nx * 5) + " " + f1(ny * 5) + '"/>');
      }
    }
  }
  geo.push('<g class="mp-ticks">' + mpTicks.join("") + "</g>");

  /* station + detector positions snapped to the drawn line */
  const stationPos = {};
  for (const s of places.stations) {
    const p = proj(s.lon, s.lat), sn = nearestOn(p, null, 30);
    stationPos[s.id] = sn ? { pt: sn.pt, dir: sn.dir } : { pt: p, dir: [1, 0] };
  }
  const detPos = {};
  for (const d of places.detectors) {
    const p = proj(d.lon, d.lat), sn = nearestOn(p, null, 25);
    detPos[d.id] = sn ? sn.pt : p;
  }

  /* ------------------------------------------------------------------ fixed overlays (HTML) */
  const readoutHTML = () => {
    const tr = COUNT.trains;
    let s = '<div class="mp-readout" aria-label="' + esc(scn.map && scn.map.corner_readout) + '"><div class="mp-readout__row"><span class="hero__big">' + tr + "</span>" +
      '<span class="hero__stack"><span class="a">TRAIN' + (tr === 1 ? "" : "S") + ' TRACKED <span class="tag-sim">SIM</span></span>' +
      '<span class="b">' + COUNT.feeds + " FEEDS · " + COUNT.stations + " STATIONS · " + COUNT.detectors + " DETECTORS</span></span></div>";
    s += '<div class="mp-onair" id="mp-onair"></div></div>';
    return s;
  };
  const onAirHTML = (demoMs) => {
    const rows = active.filter((t) => !(DEMO_TX && t === DEMO_TX && demoMs < 0));
    if (!rows.length) return "";
    return '<div class="mp-onair__head">ON AIR · ' + rows.length + "</div>" + rows.map((t) => {
      const demo = DEMO_TX && t === DEMO_TX;
      const g = demo && demoMs < 250 ? "squelch" : "tx";
      const el = demo ? Math.max(0, demoMs) / 1000 : t.elapsed_s;
      const who = fmt.trainId(t.train_id || t.speaker || "");
      return '<div class="mp-onair__row">' + HUD.c.glyph(g) + '<span class="ch">' + esc(t.aar) + '</span><span>' + esc(who) + '</span><span class="via">VIA ' +
        esc(t.feed_label) + '</span><span class="tm">' + fmt.dur(el) + "</span></div>";
    }).join("");
  };
  const modeChips = '<div class="mp-ctl">' +
    HUD.c.chip("GEO", "filter", { button: true, pressed: MODE === "geo", cls: "mp-mode" }) +
    HUD.c.chip("SCHEMATIC", "filter", { button: true, pressed: MODE === "schematic", cls: "mp-mode" }) +
    '<span class="mp-zoom"><span class="k">ZOOM</span>1.0×</span></div>';

  content.innerHTML =
    '<div class="mp-frame"><div class="mp-canvas bezel">' +
    '<svg class="hud mp-svg" id="mp-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Map of the DC–Baltimore corridor"></svg>' +
    readoutHTML() + modeChips +
    '<div class="mp-attrib"><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>' +
    '<div class="mp-cursor" id="mp-cursor"><span class="k">POINTER</span>' + fmt.blank + "</div>" +
    "</div>" +
    '<svg class="hud mp-origin" viewBox="-10.5 -10.5 21 21">' + HUD.svg.regMark(-0.5, -0.5, "line") + "</svg></div>";
  const canvas = content.querySelector(".mp-canvas");
  const svg = content.querySelector("#mp-svg");
  const onair = content.querySelector("#mp-onair");
  onair.innerHTML = onAirHTML(FREEZE ?? 1e9);

  /* register the overlays as obstacles for the label placer */
  const cr = canvas.getBoundingClientRect();
  for (const el of canvas.querySelectorAll(".mp-readout, .mp-ctl, .mp-attrib, .mp-cursor")) {
    const r = el.getBoundingClientRect();
    const b = { x0: r.left - cr.left, y0: r.top - cr.top, x1: r.right - cr.left, y1: r.bottom - cr.top };
    boxesGeo.add(b, 8);
    boxesSch.add(b, 8);
  }

  /* a selection opens the inspector over the right 480 px: nothing is labelled under it */
  if (PAN) boxesGeo.add({ x0: W - INSPECTOR_W, y0: 0, x1: W, y1: H }, 8);

  /* scale bar: M2 rulers sharing one baseline, km numerals above, mi numerals below */
  const scaleKm = 20, sx = 24, sy = H - 70;
  const kmW = Math.round(scaleKm * pxPerKm), miW = Math.round(10 * MI_KM * pxPerKm);
  const scale = '<g class="mp-scale">' +
    HUD.svg.ruler({ x: sx, y: sy, w: kmW + 1, min: 0, max: scaleKm, minor: 1, major: 5, label: (v) => String(v), flip: true }) +
    '<text class="tx-lab" x="' + (sx + kmW + 12) + '" y="' + (sy - 8) + '">KM</text>' +
    HUD.svg.ruler({ x: sx, y: sy + 1, w: miW + 1, min: 0, max: 10, minor: 1, major: 5, label: (v) => String(v) }) +
    '<text class="tx-lab" x="' + (sx + miW + 12) + '" y="' + (sy + 16) + '">MI</text></g>';
  boxesGeo.add({ x0: sx - 8, y0: sy - 26, x1: sx + Math.max(kmW, miW) + 36, y1: sy + 26 }, 4);
  const nt = (() => { /* north: direction of +lat at the canvas centre */
    const c = proj.invert(W / 2, H / 2), a = proj(...c), b = proj(c[0], c[1] + 0.05), d = dist2(a, b);
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  })();
  const nx0 = W - 48, ny0 = 92;
  const north = '<g class="mp-north"><circle class="s-hair k-faint" cx="' + nx0 + '" cy="' + ny0 + '" r="2"/><path class="s-hair k-line" d="M' + nx0 + " " + ny0 + "l" + f1(nt[0] * 22) + " " + f1(nt[1] * 22) + '"/>' +
    '<text class="tx-lab" x="' + f1(nx0 + nt[0] * 32) + '" y="' + f1(ny0 + nt[1] * 32 + 4) + '" text-anchor="middle">N</text></g>';
  boxesGeo.add({ x0: nx0 - 30, y0: ny0 - 34, x1: nx0 + 34, y1: ny0 + 6 });

  /* graticule numerals where lines meet the bezel, skipping occupied corners */
  /* Each edge numeral must read as one coordinate, never as a pair (P3): candidates are ranked by how squarely
     their line meets the edge, and a numeral is kept only if it is 24 px clear of every numeral already on that
     edge and 16 px clear of any rail line crossing the bezel. */
  const edgeX = (pts, yEdge) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a[1] - yEdge) * (b[1] - yEdge) < 0) {
        const t = (yEdge - a[1]) / (b[1] - a[1]), d = dist2(a, b);
        out.push({ x: a[0] + (b[0] - a[0]) * t, square: Math.abs(b[1] - a[1]) / d });
      }
    }
    return out;
  };
  const gratLab = [];
  for (const [yEdge, ly] of [[0, 14], [H, H - 6]]) {
    const railX = railLines.flatMap((l) => edgeX(l.pts, yEdge).map((c) => c.x));
    const cands = grat.flatMap((g) => edgeX(g.pts, yEdge).map((c) => ({ ...c, lab: g.lab }))).sort((p, q) => q.square - p.square);
    const kept = [];
    for (const c of cands) {
      if (c.x < 8 || c.x > W - 60) continue;
      const lx = c.x + 4, w = textWExact(c.lab, "mono11");
      const box = { x0: lx - 2, y0: ly - 10, x1: lx + w + 2, y1: ly + 2 };
      if (kept.some((k) => box.x0 < k.x1 + 24 && box.x1 > k.x0 - 24)) continue;
      if (railX.some((x) => x > box.x0 - 16 && x < box.x1 + 16)) continue;
      if (boxesGeo.hits(box, 0) !== 0) continue;
      kept.push(box);
      boxesGeo.add(box);
      /* the data-block knockout: a bg-void plate 2 px past the type, so no shore or hatch line runs through it */
      gratLab.push('<rect class="mp-f-void" x="' + f1(box.x0) + '" y="' + f1(box.y0) + '" width="' + f1(box.x1 - box.x0) + '" height="' + f1(box.y1 - box.y0) + '"/>' +
        '<text class="mp-coord" x="' + f1(lx) + '" y="' + ly + '">' + c.lab + "</text>");
    }
  }
  geo.push('<g class="graticule">' + gratLab.join("") + "</g>");

  /* ------------------------------------------------------------------ trains (geo + schematic positions) */
  const TAIL_MI = 0.6 / MI_KM; /* 600 m */
  const trainGeo = trains.map((t) => {
    const route = routeById[t.route_id];
    const raw = proj(t.lon, t.lat);
    const pick = (l) => l.cls !== "freight";
    const head = nearestOn(raw, pick, 40) || { pt: raw, line: null, dir: [1, 0] };
    let sign = t.direction === "SB" ? -1 : 1;
    const nxt = route && t.next_stop ? route.points.find((p) => p.place_id === t.next_stop) : null;
    if (nxt) sign = Math.sign(nxt.route_mi - t.route_mi) || sign;
    let tail = null;
    if (route) {
      const back = proj(...routeLatLon(route, t.route_mi - sign * TAIL_MI));
      const bs = head.line ? nearestOn(back, (l) => l === head.line, 40) : null;
      tail = bs ? slice(head.line, head, bs) : [head.pt, back];
    }
    /* heading: from tail toward head */
    let hd = head.dir;
    if (tail && tail.length > 1) { const z = tail[tail.length - 1], d = dist2(head.pt, z) || 1; hd = [(head.pt[0] - z[0]) / d, (head.pt[1] - z[1]) / d]; }
    /* trains beyond the default view (e.g. VRE south of Lorton) pin to the bezel as an edge marker */
    const E = 22, inView = head.pt[0] >= E && head.pt[0] <= W - E && head.pt[1] >= E && head.pt[1] <= H - E;
    if (!inView) {
      const c = [W / 2, H / 2], v = [head.pt[0] - c[0], head.pt[1] - c[1]];
      const k = Math.min(Math.abs((W / 2 - E) / (v[0] || 1e-9)), Math.abs((H / 2 - E) / (v[1] || 1e-9)));
      const d = Math.hypot(v[0], v[1]);
      return { t, pt: [c[0] + v[0] * k, c[1] + v[1] * k], tail: null, hd: [v[0] / d, v[1] / d], off: true };
    }
    return { t, pt: head.pt, tail, hd };
  });

  /* ------------------------------------------------------------------ geo labels: line names, stations */
  const LINE_LABELS = [
    { name: "Northeast Corridor", text: "NORTHEAST CORRIDOR", short: "NEC", at: [-76.36, 39.37] },
    { name: "Capital Subdivision", text: "CSX CAPITAL SUB", short: "CSX CAPITAL", at: [-76.90, 39.035] },
    { name: "CSX RF&P Subdivision", text: "CSX RF&P SUB", short: "CSX RF&P", at: [-77.17, 38.73] },
    { name: "Metropolitan Subdivision", text: "CSX METROPOLITAN SUB", short: "CSX METRO SUB", at: [-77.17, 39.11] },
    { name: "NS Washington District", text: "NS · VRE MANASSAS", short: "NS · VRE", at: [-77.27, 38.79] },
    { name: "Philadelphia Subdivision", text: "CSX PHILADELPHIA SUB", short: "CSX PHILA SUB", at: [-76.36, 39.43] },
    { name: "Popes Creek Subdivision", text: "CSX POPES CREEK SUB", short: "CSX POPES CREEK", at: [-76.83, 38.80] },
    { name: "Old Main Line Subdivision", text: "CSX OLD MAIN LINE", short: "CSX OML", at: [-76.86, 39.31] },
  ];
  /* trains and feeds claim label space before stations (they are the data) */
  trainGeo.forEach((g) => boxesGeo.add({ x0: g.pt[0] - 7, y0: g.pt[1] - 7, x1: g.pt[0] + 7, y1: g.pt[1] + 7 }));
  feeds.forEach((f) => { const c = proj(f.lon, f.lat); boxesGeo.add({ x0: c[0] - 11, y0: c[1] - 11, x1: c[0] + 11, y1: c[1] + 11 }); });
  for (const o of places.stations) { const q = stationPos[o.id].pt, r = TERMINALS.has(o.id) ? 8 : 5; boxesGeo.add({ x0: q[0] - r, y0: q[1] - r, x1: q[0] + r, y1: q[1] + r }); }
  const stationMarks = [], stationLabels = [], termLabelsGeo = [], termPlaced = [], geoNamesDropped = [], geoNamesOffView = [];
  const TERM_LAB = { "wash-union": ["WASHINGTON", "UNION STATION"], "baltimore-penn": ["BALTIMORE", "PENN STATION"] };
  const labelGlyphs = [];   /* placed station and line names as glyph polygons, for the railUnderLabel audit */
  /* map short forms for the longest station names (full names stay in the inspector) */
  const SHORT = { "college-park": "College Park", "bwi": "BWI Airport", "lorton-auto-train": "Lorton Auto Train" };
  const shortName = (s) => (SHORT[s.id] || s.name).replace(/\s*\(.*?\)\s*/g, "").replace(/ Station$/, "").replace(/^Washington Union$/, "Washington Union Station").toUpperCase();
  /* name priority (review r3 #3 / #5), geo and schematic alike: terminals 0 > Amtrak stops 1 > the station the
     talking train is at or next to 2 (active_transmissions place_id, the train's next_stop) > MARC / VRE stops by the
     number of lines serving them 3 > others. Ranks 0-2 claim their slot before any data block. */
  const talkAdj = new Set();
  for (const tx of active) {
    if (!tx.train_id) continue;
    if (tx.place_id) talkAdj.add(tx.place_id);
    const tp = trains.find((q) => q.train_id === tx.train_id);
    if (tp && tp.next_stop) talkAdj.add(tp.next_stop);
  }
  const nameRank = (id) => {
    const st = placeById[id];
    const lines = (st && st.lines) || [];
    if (TERMINALS.has(id)) return 0;
    if (lines.some((l) => /^Amtrak/.test(l))) return 1;
    if (talkAdj.has(id)) return 2;
    return 3 + (10 - Math.min(9, lines.length)) / 10;
  };
  const termLabelsEarly = () => places.stations.filter((x) => TERMINALS.has(x.id)).forEach((x) => placeTerminalLabel(x));
  const namesEarly = () => places.stations.filter((x) => !TERMINALS.has(x.id) && nameRank(x.id) < 3)
    .sort((a, b) => nameRank(a.id) - nameRank(b.id)).forEach((x) => { earlyDone.add(x.id); placeStationLabel(x); });
  const earlyDone = new Set(), earlyLab = {};

  /* reception links (keyed): feed → talking train, dimension-line dash. The paths are reserved before any
     data block is placed, so no block sits on a link; the labels are placed after the blocks. */
  const linkGeom = [];
  for (const tx of active) {
    if (!tx.train_id) continue;
    const tg = trainGeo.find((g) => g.t.train_id === tx.train_id);
    if (!tg || tg.off) continue;
    for (const r of tx.receptions) {
      const f = feedById[r.feed_id];
      if (!f) continue;
      const a = proj(f.lon, f.lat), b = tg.pt, d = dist2(a, b), ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      linkGeom.push({ tx, r, primary: r.feed_id === tx.feed_id, d, ux, uy, A: [a[0] + ux * 12, a[1] + uy * 12], B: [b[0] - ux * 9, b[1] - uy * 9], lab: null });
    }
  }
  for (const L of linkGeom) {
    const n = Math.ceil(dist2(L.A, L.B) / 8);
    for (let k = 1; k < n; k++) { const q = lerp(L.A, L.B, k / n); boxesGeo.add({ x0: q[0] - 2, y0: q[1] - 2, x1: q[0] + 2, y1: q[1] + 2 }); }
  }

  const trainBlockBase = (tg, talking) => ({
    x: tg.pt[0], y: tg.pt[1], from: 7, l1: fmt.trainId(tg.t.train_id), sim: tg.t.sim, l2: tg.t.data_block[1], tx_: talking, glyph: talking ? "tx" : null,
  });
  termLabelsEarly();   /* the two terminals anchor the map: labelled before any data block */
  namesEarly();        /* Amtrak stops and the talking train's stations: before the blocks, so no block takes them */

  /* rail lines are a soft obstacle for blocks: count the distinct lines that pass through a block box */
  const railThrough = (box) => railInView.reduce((n, l) => n + (l.segs.some(([a, b]) => segRect(a, b, box)) ? 1 : 0), 0);

  /* place each train's block once, with the widest variant (TX glyph) so the layout never jumps on key-up */
  const trainBlockDir = trainGeo.map((tg) => placeBlock(boxesGeo, trainBlockBase(tg, true), undefined, undefined, railThrough));
  const feedBlocks = feeds.map((f) => {
    const c = proj(f.lon, f.lat), look = feedLook(f, -1);
    return placeBlock(boxesGeo, { x: c[0], y: c[1], from: 10, l1: f.short, sim: f.sim, l2: look.l2, l2Class: look.l2Class, glyph: "tx" }, ["sw", "se", "nw", "ne", "w", "e", "s", "n"], undefined, railThrough);
  });

  /* link labels: distance and SNR (the feed is named at the link's far end). Placed after the data blocks (their
     paths were reserved before, so no block sits on a link), the primary (strongest) link first: it slides along its length (0.5, 0.35, 0.65, 0.25 …) and is never the
     one left without a number. Secondaries take what is left. */
  const linkOrder = linkGeom.slice().sort((a, b) => b.primary - a.primary);
  for (const L of linkOrder) {
    const full = L.r.dist_km.toFixed(1) + " KM · " + fmt.snr(L.r.snr_db);
    const ang = Math.atan2(L.uy, L.ux) / RAD, up = ang > 90 || ang < -90 ? ang + 180 : ang;
    /* the primary link keeps a number: if the full label finds no slot it steps further off the link, then drops to
       the SNR alone (the distance is on the inspector); a secondary simply drops */
    const tries = L.primary ? [[full, [0, 4]], [fmt.snr(L.r.snr_db), [0, 4, 8]]] : [[full, [0]]];
    const ts = L.primary ? [0.5, 0.35, 0.65, 0.25, 0.75, 0.42, 0.58, 0.3, 0.7, 0.2, 0.8] : [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.8];
    search: for (const [text, extra] of tries) {
      const w = textWExact(text, "mono11");
      if (w > L.d * 0.9) continue;
      for (const more of extra) for (const [t, side] of ts.flatMap((t) => [[t, 1], [t, -1]])) {
        /* the strip's cells are axis-aligned, so a diagonal link needs a little more stand-off to clear its own path */
        const off = 9 + more + 4 * Math.abs(Math.sin(2 * up * RAD));
        const m = lerp(L.A, L.B, t), nx = Math.sin(up * RAD) * side, ny = -Math.cos(up * RAD) * side, c = [m[0] + nx * off, m[1] + ny * off];
        const sq = labelStrip(c, up * RAD, w + 4, 10);
        if (stripFree(boxesGeo, sq)) { sq.forEach((b) => boxesGeo.add(b)); L.lab = { c, up, text }; break search; }
      }
    }
    if (L.primary && !L.lab) console.warn("map: primary link label could not be placed", full);
  }

  /* an early name a block still had to cover (relaxed pass) is re-placed around the block, or dropped; never overlapped */
  for (const [id, e] of Object.entries(earlyLab)) {
    if (!placedGeo.some((g) => overlap(e.box, g.box) || legsOfG(g).some(([a, b]) => segRect(a, b, e.box)))) continue;
    stationLabels[e.li] = ""; labelGlyphs[e.gi] = { kind: "removed", text: "", poly: [[0, 0], [0, 0], [0, 0]], rect: { x0: -9, y0: -9, x1: -9, y1: -9 } };
    placeStationLabel(places.stations.find((x) => x.id === id));   /* stays in earlyDone: the main pass skips it */
  }

  const lineLab = [];
  function placeLineLabels() {
  /* Each line is named once, set on the straight chord through the track near `at` (no textPath, so a
     fragmented or curving OSM way can never truncate or jumble the name). Rail is a hard obstacle: the glyph
     box, padded 4 px, may touch no rail segment, its own line included. The name slides along the line to a
     clear, straight stretch; failing that it takes its short form; failing that it is dropped. */
  LINE_LABELS.forEach((L) => {
    const onLine = (l) => l.name === L.name;
    const pref = proj(...L.at);
    const cands = [];
    for (const line of railLines) if (onLine(line)) for (let i = 0; i < line.pts.length; i++) {
      const q = line.pts[i];
      if (q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H) cands.push(q);
    }
    cands.sort((a, b) => dist2(a, pref) - dist2(b, pref));
    for (const text of [L.text, L.short].filter(Boolean)) {
      const tw = textW(text, "line11"), half = tw / 2 + 10;
      for (const q of cands.slice(0, 400)) {
        const a = nearestOn(q, onLine, 2);
        if (!a) continue;
        const b0 = nearestOn([a.pt[0] - a.dir[0] * half, a.pt[1] - a.dir[1] * half], onLine, 10);
        const b1 = nearestOn([a.pt[0] + a.dir[0] * half, a.pt[1] + a.dir[1] * half], onLine, 10);
        if (!b0 || !b1 || dist2(b0.pt, b1.pt) < half * 1.8) continue;   /* the track must run straight under the name */
        let [p0, p1] = [b0.pt, b1.pt];
        if (p0[0] > p1[0]) [p0, p1] = [p1, p0];
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), m = lerp(p0, p1, 0.5);
        for (const off of [10, 13, 16]) for (const side of [1, -1]) {
          const nx = Math.sin(ang) * side, ny = -Math.cos(ang) * side;
          const c = [m[0] + nx * off, m[1] + ny * off], sq = labelStrip(c, ang, tw, 10);
          if (!stripFree(boxesGeo, sq, 16) || railUnderPoly(namePoly(c, ang, tw, 4))) continue;
          sq.forEach((b) => boxesGeo.add(b));
          labelGlyphs.push({ kind: "line", text, poly: namePoly(c, ang, tw, 2) });
          lineLab.push('<text class="mp-linelab" text-anchor="middle" dy="4" transform="translate(' + f1(c[0]) + " " + f1(c[1]) + ") rotate(" + f1(ang / RAD) + ')">' + esc(text) + "</text>");
          return;
        }
      }
    }
  });
  }

  /* stations: 6 px perpendicular bar; terminals 13 px display (brief §9.5 layer 6) */
  const stationOrder = places.stations.slice().sort((a, b) => nameRank(a.id) - nameRank(b.id));
  for (const s of places.stations) {
    const { pt, dir } = stationPos[s.id], term = TERMINALS.has(s.id), h = term ? 6 : 3;
    const nx = -dir[1], ny = dir[0];
    stationMarks.push('<path class="s-emph k-ink" d="M' + f1(pt[0] - nx * h) + " " + f1(pt[1] - ny * h) + "L" + f1(pt[0] + nx * h) + " " + f1(pt[1] + ny * h) + '"/>');
    if (term) stationMarks.push('<rect class="s-hair k-ink" x="' + f1(pt[0] - 4.5) + '" y="' + f1(pt[1] - 4.5) + '" width="9" height="9" transform="rotate(' + f1(Math.atan2(dir[1], dir[0]) / RAD) + " " + f1(pt[0]) + " " + f1(pt[1]) + ')"/>');
  }
  /* priority: terminals, then line names, then the other station names (station marks were reserved with the data) */
  let linesDone = false;
  for (const s of stationOrder) {
    if (TERMINALS.has(s.id) || earlyDone.has(s.id)) continue;   /* labelled with the data, above */
    if (!linesDone) { placeLineLabels(); linesDone = true; }
    placeStationLabel(s);
  }
  /* Station names: rail is a hard obstacle (glyph box + 4 px may touch no rail segment, the station's own line
     included). Both perpendicular sides of the bar first, stepping out; then the corner slots; else the name is
     dropped (greedy by priority, drop rather than overlap, brief §9.5). */
  function placeStationLabel(s) {
    const { pt, dir } = stationPos[s.id], term = TERMINALS.has(s.id);
    const name = shortName(s), f = term ? "term13" : "lab11", w = textW(name, f), cap = term ? 9 : 8;
    const nx = -dir[1], ny = dir[0], ext = Math.abs(nx) * w / 2 + Math.abs(ny) * cap / 2;
    const cands = [];
    for (const d of term ? [11, 15, 20] : [7, 10, 14]) for (const side of [1, -1]) {
      const cx = pt[0] + nx * side * (d + ext), cy = pt[1] + ny * side * (d + ext);
      cands.push([cx - pt[0], cy - pt[1] + cap / 2, "middle"]);
    }
    cands.push(...(term ?   /* corner slots, clear of the mark */
      [[11, -10, "start"], [-11, -10, "end"], [11, 21, "start"], [-11, 21, "end"], [0, -14, "middle"], [0, 26, "middle"]] :
      [[8, -8, "start"], [-8, -8, "end"], [8, 16, "start"], [-8, 16, "end"], [10, 4, "start"], [-10, 4, "end"], [0, -12, "middle"], [0, 20, "middle"]]));
    for (const [dx, dy, anchor] of cands) {
      const x = pt[0] + dx, y = pt[1] + dy;
      const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const glyph = { x0, y0: y - cap, x1: x0 + w, y1: y + 0.5 };
      const box = { x0: x0 - 2, y0: y - cap - 3, x1: x0 + w + 2, y1: y + 3 };
      /* 10 px from any data block, so a name never reads as a third word of a block's line */
      if (boxesGeo.hits(box) !== 0 || railUnderRect(padRect(glyph, 4)) || placedGeo.some((g) => overlap(padRect(glyph, 10), g.box))) continue;
      boxesGeo.add(box);
      if (earlyDone.has(s.id)) { hardNames.push(box); earlyLab[s.id] = { box, li: stationLabels.length, gi: labelGlyphs.length }; }
      labelGlyphs.push({ kind: "station", text: name, poly: rectPoly(padRect(glyph, 2)), rect: padRect(glyph, 2) });
      stationLabels.push('<text class="' + (term ? "mp-term" : "mp-stn") + '" x="' + f1(x) + '" y="' + f1(y) + '" text-anchor="' + anchor + '">' + esc(name) + "</text>");
      return;
    }
    if (pt[0] < 0 || pt[0] > W || pt[1] < 0 || pt[1] > H) geoNamesOffView.push(name); else geoNamesDropped.push(name);
  }
  /* Terminal names (review r3 #1): never dropped. Two-line 13 px display label, as in the schematic. A slot may cross
     rail, on a bg-void knockout plate 2 px past the type; the cleanest slot wins (no data, then least rail under it).
     A label set more than 12 px from its box carries a 1 px ink-3 tie to it. */
  function placeTerminalLabel(s) {
    const { pt } = stationPos[s.id];
    if (pt[0] < 0 || pt[0] > W || pt[1] < 0 || pt[1] > H) { termPlaced.push(s.id + " (off view)"); geoNamesOffView.push(shortName(s)); return; }   /* panned away */
    const [a, b] = TERM_LAB[s.id] || [shortName(s), ""];
    const wa = textW(a, "term13"), wb = b ? textW(b, "term13") : 0, cap = 9, LH = 17;
    const cands = [[12, -24, "start"], [-12, -24, "end"], [12, 18, "start"], [-12, 18, "end"], [0, -36, "middle"], [0, 28, "middle"],
      [20, -40, "start"], [-20, -40, "end"], [20, 34, "start"], [-20, 34, "end"], [0, -52, "middle"], [0, 44, "middle"], [-24, -56, "end"], [24, -56, "start"], [24, 50, "start"], [-24, 50, "end"]];
    let best = null;
    cands.forEach(([dx, dy, anchor], k) => {
      const x = pt[0] + dx, y = pt[1] + dy;
      const g = [a, b].filter(Boolean).map((t, i) => { const w = i ? wb : wa, x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2; return { x0, y0: y + i * LH - cap, x1: x0 + w, y1: y + i * LH + 0.5 }; });
      const box = { x0: Math.min(...g.map((r) => r.x0)) - 2, y0: g[0].y0 - 3, x1: Math.max(...g.map((r) => r.x1)) + 2, y1: g[g.length - 1].y1 + 3 };
      const outside = box.x0 < 4 || box.x1 > W - 4 || box.y0 < 4 || box.y1 > H - 4;
      const own = { x0: pt[0] - 8, y0: pt[1] - 8, x1: pt[0] + 8, y1: pt[1] + 8 };
      const data = boxesGeo.hits(box) - (overlap(box, own) ? 1 : 0);   /* its own mark box does not count */
      const rail = g.reduce((n, r) => n + railSegs.filter(([p, q]) => segRect(p, q, padRect(r, 2))).length, 0);
      const score = (outside ? 1e6 : 0) + Math.max(0, Math.min(data, 99)) * 1000 + rail * 10 + k;
      if (!best || score < best.score) best = { score, x, y, anchor, g, box, rail };
    });
    const { x, y, anchor, g, box } = best;
    boxesGeo.add(box);
    hardNames.push(box);
    termPlaced.push(s.id);
    let svg = '<rect class="mp-f-void" x="' + f1(box.x0) + '" y="' + f1(box.y0 + 1) + '" width="' + f1(box.x1 - box.x0) + '" height="' + f1(box.y1 - box.y0 - 2) + '"/>';
    const nx = Math.max(box.x0, Math.min(pt[0], box.x1)), ny = Math.max(box.y0, Math.min(pt[1], box.y1)), d = Math.hypot(nx - pt[0], ny - pt[1]);
    if (d > 12) { const ux = (nx - pt[0]) / d, uy = (ny - pt[1]) / d; svg = '<path class="s-hair k-ink3" d="M' + f1(pt[0] + ux * 8) + " " + f1(pt[1] + uy * 8) + "L" + f1(nx) + " " + f1(ny) + '"/>' + svg; }
    [a, b].filter(Boolean).forEach((t, i) => { svg += '<text class="mp-term" x="' + f1(x) + '" y="' + f1(y + i * LH) + '" text-anchor="' + anchor + '">' + esc(t) + "</text>"; });
    termLabelsGeo.push(svg);
    g.forEach((r) => labelGlyphs.push({ kind: "terminal", text: a + (b ? " " + b : ""), poly: rectPoly(padRect(r, 2)), rect: padRect(r, 2) }));
  }
  const detMarks = places.detectors.map((d) => { const p = detPos[d.id]; return '<path class="s-hair k-line mp-f-void" d="M' + f1(p[0]) + " " + f1(p[1] - 4.5) + "l4.5 4.5l-4.5 4.5l-4.5 -4.5Z" + '"/>'; });

  geo.push('<g class="mp-linelabs">' + lineLab.join("") + "</g>");
  geo.push('<g class="mp-dets">' + detMarks.join("") + "</g>");
  geo.push('<g class="mp-stations">' + stationMarks.join("") + stationLabels.join("") + termLabelsGeo.join("") + "</g>");
  geo.push(scale + north);

  /* ------------------------------------------------------------------ schematic layout (Beck 0°/45°) */
  const SCH = (() => {
    const keep = (p) => p.kind === "station" || p.kind === "detector";
    const items = (rid) => {
      const out = [];
      for (const p of routeById[rid].points) if (keep(p) && (!out.length || out[out.length - 1].place_id !== p.place_id)) out.push(p);
      return out;
    };
    const ys = Math.round(H * 0.5), L = 112, R = W - 96, rise = 172;   /* spine–branch gap: with leaders capped at 64 px, three block rows above the spine (plus a Capital Sub block under its own line) at both sizes */
    const pos = {};
    const put = (rid, p, xy) => { pos[rid + ":" + p.place_id] = { p, rid, xy }; };
    /* evenly spaced stations (brief §9.5); a detector is not a station, so it sits between its neighbours by route mile */
    const spine = items("r-nec"), stns = spine.filter((p) => p.kind !== "detector"), step = (R - L) / (stns.length - 1);
    stns.forEach((p, i) => put("r-nec", p, [L + i * step, ys]));
    spine.forEach((p, k) => {
      if (p.kind !== "detector") return;
      const a = spine.slice(0, k).reverse().find((q) => q.kind !== "detector"), b = spine.slice(k + 1).find((q) => q.kind !== "detector");
      const xa = pos["r-nec:" + a.place_id].xy[0], xb = pos["r-nec:" + b.place_id].xy[0];
      put("r-nec", p, [xa + ((p.route_mi - a.route_mi) / (b.route_mi - a.route_mi || 1)) * (xb - xa), ys]);
    });
    const X = (id) => pos["r-nec:" + id].xy[0];
    const xw = X("wash-union"), xp = X("baltimore-penn"), xa = X("alexandria");
    const cap = items("r-capital").filter((p) => p.place_id !== "wash-union");
    cap.forEach((p, i) => put("r-capital", p, [xw + rise + (i * (xp - xw - rise)) / (cap.length - 1), ys - rise]));
    const met = items("r-metro").filter((p) => p.place_id !== "wash-union"), mstep = Math.min(56, (ys - rise - 24) / met.length);
    met.forEach((p, i) => put("r-metro", p, [xw, ys - (i + 1) * mstep - (i ? 0 : 0)]));
    const man = items("r-manassas").filter((p) => p.place_id !== "alexandria").reverse(); /* backlick, burke, manassas */
    man.forEach((p, i) => put("r-manassas", p, [xa - rise - i * step, ys - rise]));
    /* Philadelphia Sub branches off at Baltimore Penn on its own 45° connector, so it never reads as a
       continuation of the Capital Sub (which ends at Camden, directly above Penn) */
    /* its own (lower) rise at 1440, so its three detector names keep their spacing before the canvas edge */
    const phRise = W < 1600 ? 112 : rise, phl = items("r-phila"), x0p = xp + phRise;
    phl.forEach((p, i) => put("r-phila", p, [x0p + (i * (R - x0p)) / Math.max(1, phl.length - 1), ys - phRise]));
    const chains = {
      "r-nec": spine.map((p) => "r-nec:" + p.place_id),
      "r-capital": ["r-nec:wash-union", ...cap.map((p) => "r-capital:" + p.place_id)],
      "r-metro": ["r-nec:wash-union", ...met.map((p) => "r-metro:" + p.place_id)],
      "r-manassas": [...man.slice().reverse().map((p) => "r-manassas:" + p.place_id), "r-nec:alexandria"],
      "r-phila": ["r-nec:baltimore-penn", ...phl.map((p) => "r-phila:" + p.place_id)],
    };
    return { pos, chains, ys, rise, step, xw, xp, xa, L, R, mstep };
  })();

  /* geo position of every schematic item (for the morph) */
  for (const it of Object.values(SCH.pos)) {
    const id = it.p.place_id;
    it.geo = stationPos[id] ? stationPos[id].pt : detPos[id] ? detPos[id] : proj(it.p.lon, it.p.lat);
  }
  /* train position in schematic: interpolate by route mile between that route's items */
  function trainSch(t) {
    const its = Object.values(SCH.pos).filter((it) => it.rid === t.route_id || (t.route_id === "r-capital" && it.p.place_id === "wash-union" && it.rid === "r-nec"))
      .map((it) => ({ mi: it.rid === t.route_id ? it.p.route_mi : 0, xy: it.xy })).sort((a, b) => a.mi - b.mi);
    if (!its.length) return null;
    if (t.route_mi <= its[0].mi) return { xy: its[0].xy, dir: [1, 0] };
    for (let i = 0; i < its.length - 1; i++) {
      const a = its[i], b = its[i + 1];
      if (t.route_mi >= a.mi && t.route_mi <= b.mi) {
        const d = dist2(a.xy, b.xy) || 1;
        return { xy: lerp(a.xy, b.xy, (t.route_mi - a.mi) / (b.mi - a.mi || 1)), dir: [(b.xy[0] - a.xy[0]) / d, (b.xy[1] - a.xy[1]) / d] };
      }
    }
    return { xy: its[its.length - 1].xy, dir: [1, 0] };
  }
  trainGeo.forEach((g) => { g.sch = trainSch(g.t); });

  /* schematic static layer: labels, route names, MP-equation mark, coverage strip.
     Every label is registered as its true footprint (a rotated polygon for the 45° names, never an axis-aligned
     box); route chains and placed leaders are segments. The train placer treats all of them as hard obstacles. */
  const SO = { polys: [], segs: [] };
  const soPoly = (poly, kind) => SO.polys.push({ poly, kind });
  const soRect = (b, kind) => soPoly(rectPoly(b), kind);
  const polyFree = (poly) => SO.polys.every((o) => o.kind === "pennpad" || !polyPoly(poly, o.poly));
  const sch = [];
  const stripRows = [];
  let schEqPoly = null;
  const schNames = [];   /* deferred station / detector names (placed after the train blocks) */
  const softHits = (poly) => schNames.reduce((n, nm) => n + (polyPoly(poly, nm.cands[0].poly) ? 1 : 0), 0);
  {
    const S = SCH, lab = [];
    const put = (svgText, poly, kind = "label") => { lab.push(svgText); soPoly(poly, kind); };
    boxesSch.list.forEach((b) => soRect(b, "overlay"));
    for (const keys of Object.values(S.chains)) {
      const pts = keys.map((k) => S.pos[k].xy);
      for (let i = 0; i < pts.length - 1; i++) SO.segs.push({ a: pts[i], b: pts[i + 1], kind: "route" });
    }
    /* enlarged terminals first: two-line 13 px display labels (Washington here, Baltimore Penn by slot search below) */
    const termLab = { "wash-union": ["WASHINGTON", "UNION STATION"], "baltimore-penn": ["BALTIMORE", "PENN STATION"] };
    for (const id of TERMINALS) soRect({ x0: S.pos["r-nec:" + id].xy[0] - 9, y0: S.pos["r-nec:" + id].xy[1] - 9, x1: S.pos["r-nec:" + id].xy[0] + 9, y1: S.pos["r-nec:" + id].xy[1] + 9 }, "mark");
    /* Washington: the two-line terminal name sits right on its box (UNION STATION 7 px over the spine), and the
       M18 MP-equation mark (RF&P, CSX derived, meets the NEC count here) rides above it, right-aligned. Up there the
       45° Manassas branch is further left than the mark is wide, so no route line can reach it at either size. */
    const eq = routeById["r-nec"].points.find((p) => p.place_id === "wash-union" && p.equation);
    {
      const [x, y] = S.pos["r-nec:wash-union"].xy, [a, b] = termLab["wash-union"];
      put('<text class="mp-term" x="' + f1(x - 16) + '" y="' + f1(y - 24) + '" text-anchor="end">' + a + "</text>", textPoly(x - 16, y - 24, 0, textW(a, "term13"), "end"));
      put('<text class="mp-term" x="' + f1(x - 16) + '" y="' + f1(y - 7) + '" text-anchor="end">' + b + "</text>", textPoly(x - 16, y - 7, 0, textW(b, "term13"), "end"));
      if (eq) {
        schEqPoly = textPoly(x - 16, y - 43, 0, textWExact(eq.equation, "mono11"), "end");
        put('<text class="mp-mp" x="' + f1(x - 16) + '" y="' + f1(y - 43) + '" text-anchor="end">' + esc(eq.equation) + "</text>", schEqPoly);
      }
    }
    /* Baltimore Penn is labelled after the train blocks (data first, as in geo): its station names and the
       Philadelphia connector leave no clean leader for a train at West Baltimore if the name claims the slot first */
    /* Station and detector names are placed AFTER the train blocks (data first, brief §9.5: drop lower-priority labels
       rather than overlapping them). Here each name gets its candidate slots, default first: RF&P names hang below the
       spine at 45° (clear of the Manassas connector); NEC names east of Washington, branch and detector names rise above
       at −45°, parallel to the Capital and Philadelphia connectors; Metropolitan names sit left of the line. Every branch
       leaves the spine upward, so the band below the NEC is the trains' own. Then the mirrored Beck slots and the other
       side. The default footprints steer the block search (a block that would displace a name costs more). */
    for (const it of Object.values(S.pos)) {
      const [x, y] = it.xy, id = it.p.place_id, det = it.p.kind === "detector";
      if (TERMINALS.has(id) && it.rid === "r-nec") continue;
      const place = placeById[id];
      const name = det ? (it.p.mp_label || "").replace("≈", "≈ ") : shortName(place || { name: it.p.name });
      const w = det ? textWExact(name, "mono11") : textW(name, "lab11"), cls = det ? "mp-mp" : "mp-stn";
      const below = { svg: '<text class="' + cls + '" transform="translate(' + f1(x + 4) + " " + f1(y + 12) + ') rotate(45)">' + esc(name) + "</text>", poly: textPoly(x + 4, y + 12, Math.PI / 4, w), tight: tightPoly(x + 4, y + 12, Math.PI / 4, w) };
      const above = { svg: '<text class="' + cls + '" transform="translate(' + f1(x + 4) + " " + f1(y - 10) + ') rotate(-45)">' + esc(name) + "</text>", poly: textPoly(x + 4, y - 10, -Math.PI / 4, w), tight: tightPoly(x + 4, y - 10, -Math.PI / 4, w) };
      /* the mirrored Beck slots: the name ends at the station, rising from the lower left or falling from the upper left */
      const belowL = { svg: '<text class="' + cls + '" text-anchor="end" transform="translate(' + f1(x - 4) + " " + f1(y + 12) + ') rotate(-45)">' + esc(name) + "</text>", poly: textPoly(x - 4, y + 12, -Math.PI / 4, w, "end"), tight: tightPoly(x - 4, y + 12, -Math.PI / 4, w, "end") };
      const aboveL = { svg: '<text class="' + cls + '" text-anchor="end" transform="translate(' + f1(x - 4) + " " + f1(y - 10) + ') rotate(45)">' + esc(name) + "</text>", poly: textPoly(x - 4, y - 10, Math.PI / 4, w, "end"), tight: tightPoly(x - 4, y - 10, Math.PI / 4, w, "end") };
      let cands;
      if (it.rid === "r-metro") {
        cands = [{ svg: '<text class="' + cls + '" x="' + f1(x - 14) + '" y="' + f1(y + 4) + '" text-anchor="end">' + esc(name) + "</text>", poly: textPoly(x - 14, y + 4, 0, w, "end"), tight: tightPoly(x - 14, y + 4, 0, w, "end") },
          { svg: '<text class="' + cls + '" x="' + f1(x + 14) + '" y="' + f1(y + 4) + '">' + esc(name) + "</text>", poly: textPoly(x + 14, y + 4, 0, w), tight: tightPoly(x + 14, y + 4, 0, w) }];
      } else if (it.rid === "r-nec" && !det && x < S.xw) cands = [below, belowL, above, aboveL];
      else cands = [above, aboveL, below, belowL];
      /* priority: stations by the number of lines serving them, then detectors (k ≥ 2 in the geo tiers) */
      schNames.push({ name, cands, rank: det ? 9 : nameRank(id), x });
      soRect({ x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5 }, "mark");
    }
    /* route names. The spine is two counts: RF&P (CSX) south-west of Washington, NEC east of Union Station */
    const lw = (t) => textW(t, "line11");
    put('<text class="mp-linelab" x="' + f1(S.L - 16) + '" y="' + f1(S.ys + 4) + '" text-anchor="end">RF&amp;P</text>', textPoly(S.L - 16, S.ys + 4, 0, lw("RF&P"), "end"));
    put('<text class="mp-linelab" x="' + f1(S.R + 16) + '" y="' + f1(S.ys + 4) + '">NEC</text>', textPoly(S.R + 16, S.ys + 4, 0, lw("NEC")));
    {
      const top = S.pos[S.chains["r-metro"].slice(-1)[0]].xy, t = "CSX METROPOLITAN SUB";
      put('<text class="mp-linelab" x="' + f1(top[0]) + '" y="' + f1(top[1] - 18) + '" text-anchor="middle">' + t + "</text>", textPoly(top[0], top[1] - 18, 0, lw(t), "middle"));
      const c0 = S.pos[S.chains["r-manassas"][0]].xy, tm = "NS · VRE MANASSAS";
      put('<text class="mp-linelab" x="' + f1(c0[0] - 16) + '" y="' + f1(c0[1] + 4) + '" text-anchor="end">' + tm + "</text>", textPoly(c0[0] - 16, c0[1] + 4, 0, lw(tm), "end"));
    }
    /* Capital and Philadelphia: named along their 45° connector, inside the triangle it makes with the spine,
       slid along the connector until clear (the Washington end also carries the MP-equation mark) */
    /* a connector too short for the full name (Philadelphia at 1440) takes the short form; never over a line */
    for (const [rid, texts] of [["r-capital", ["CSX CAPITAL SUB"]], ["r-phila", ["CSX PHILADELPHIA SUB", "CSX PHILA SUB"]]]) {
      const [a, b] = [S.pos[S.chains[rid][0]].xy, S.pos[S.chains[rid][1]].xy];
      let done = false;
      /* either side of the connector, slid along it; it keeps 8 px from any station name's footprint, so a route name
         and a parallel station name never read as one two-line label */
      for (const text of texts) for (const side of [-1, 1]) for (const t of [0.5, 0.58, 0.66, 0.42, 0.74, 0.34, 0.82]) {
        if (done) break;
        const m = lerp(a, b, t), cx = m[0] + 9 * side, cy = m[1] + 9 * side, ang = -Math.PI / 4;
        const ox = cx - 4 * Math.sin(ang), oy = cy + 4 * Math.cos(ang);
        const poly = textPoly(ox, oy, ang, lw(text), "middle"), wide = textPoly(ox, oy, ang, lw(text), "middle", 8);
        if (!polyFree(poly) || softHits(wide) || SO.segs.some((sg) => segPoly(sg.a, sg.b, poly))) continue;
        put('<text class="mp-linelab" text-anchor="middle" transform="translate(' + f1(cx) + " " + f1(cy) + ') rotate(-45)" dy="4">' + esc(text) + "</text>", poly);
        done = true;
      }
    }
    sch.push(lab.join(""));

    /* coverage strip: which spine points each feed reaches (distance ≤ nominal radius). The glyph and the tinted
       tick are drawn in the dynamic layer, from the same feedLook() as the geo feed sites. */
    const spineItems = S.chains["r-nec"].map((k) => S.pos[k]);
    /* the strip sits on the bottom of the canvas, leaving a band under the hanging station names for blocks */
    const y0 = H - feeds.length * 22 - 46;
    const head = "NEC · RF&P POINTS INSIDE EACH FEED’S NOMINAL RADIUS";
    let strip = '<text class="tx-lab" x="' + f1(S.L - 16) + '" y="' + (y0 - 22) + '" text-anchor="end">COVERAGE</text>' +
      '<text class="tx-lab" x="' + f1(S.L) + '" y="' + (y0 - 22) + '">' + esc(head) + "</text>";
    soRect({ x0: S.L - 100, y0: y0 - 34, x1: S.L + textW(head, "lab11") + 8, y1: y0 - 18 }, "strip");
    feeds.forEach((f, i) => {
      const y = y0 + i * 22, look = feedLook(f, -1);
      const inside = spineItems.map((it) => geoKm([f.lon, f.lat], [it.p.lon, it.p.lat]) <= f.coverage_radius_km);
      strip += '<text class="mp-feedlab' + (look.fault ? " mp-fault" : look.stale ? " mp-stale" : "") + '" x="' + f1(S.L - 16) + '" y="' + y + '" text-anchor="end">' + esc(f.short) + "</text>";
      const k = look.fault ? "k-faint" : look.stale ? "k-stale d-stale" : "k-line";
      let run = null;
      const flush = (end) => { if (run != null) strip += '<path class="s-hair ' + k + '" d="M' + f1(spineItems[run].xy[0]) + " " + (y - 4) + "H" + f1(spineItems[end].xy[0]) + '"/>'; run = null; };
      const ticks = [];
      inside.forEach((ok, j) => {
        if (ok) { if (run == null) run = j; ticks.push(spineItems[j].xy[0]); strip += '<path class="s-hair ' + k + '" d="M' + f1(spineItems[j].xy[0]) + " " + (y - 8) + "V" + y + '"/>'; }
        else flush(j - 1);
      });
      flush(inside.length - 1);
      const n = ticks.length;
      strip += '<text class="' + (look.fault ? "mp-coord mp-l2-fault" : look.stale ? "mp-coord mp-l2-stale" : "mp-coord") + '" x="' + (W - 24) + '" y="' + y + '" text-anchor="end">' +
        (look.fault ? esc(f.label) : (look.stale ? "STALE · " : "") + n + "/" + inside.length) + "</text>";
      stripRows.push({ f, y, gx: S.L - 92, gy: y - 4, ticks });
      soRect({ x0: S.L - 100, y0: y - 12, x1: W, y1: y + 4 }, "strip");
    });
    sch.push('<g class="mp-strip">' + strip + "</g>");
  }

  /* Baltimore Penn terminal label. Only slots that read as attached to the terminal box: the two corner slots
     that touch it (above-left, above-right), or a centred / set-back slot carrying a 1 px tie to the square, above
     or below the spine. Each slot also carries a keep-out 12 px past the type that no data block may enter, so the
     name can never stack with a block into one paragraph (the box test alone allowed a 6 px gap). The label is
     committed before the train blocks: the train search runs once per slot and takes the first it can solve. */
  const PENN_GAP = 12;
  const pennSlots = (() => {
    const [x, y] = SCH.pos["r-nec:baltimore-penn"].xy, a = "BALTIMORE", b = "PENN STATION", out = [];
    const cands = [[16, 24, "start"], [-16, 24, "end"], [-16, -34, "end"], [16, -34, "start"],
      [0, -52, "middle"], [0, -70, "middle"], [-28, -70, "middle"], [0, -88, "middle"], [-28, -88, "middle"], [-40, -88, "middle"], [0, -106, "middle"], [-28, -106, "middle"],
      [0, 40, "middle"], [0, 58, "middle"], [0, 76, "middle"], [0, 94, "middle"], [-28, 76, "middle"], [-28, 94, "middle"], [0, 112, "middle"]];
    for (const [dx, dy, anchor] of cands) {
      const pa = textPoly(x + dx, y + dy, 0, textW(a, "term13"), anchor), pb = textPoly(x + dx, y + dy + 17, 0, textW(b, "term13"), anchor);
      const tie = anchor !== "middle" ? null : dy < 0 ? [[x, y - 9], [x, y + dy + 21]] : [[x, y + 9], [x, y + dy - 13]];
      const clean = [pa, pb].every((q) => polyFree(q) && !SO.segs.some((sg) => segPoly(sg.a, sg.b, q))) &&
        (!tie || (!SO.polys.some((o) => o.kind !== "mark" && segPoly(tie[0], tie[1], o.poly)) && !SO.segs.some((sg) => segX(tie[0], tie[1], sg.a, sg.b))));
      if (!clean) continue;
      const xs = [...pa, ...pb].map((p) => p[0]), ys = [...pa, ...pb].map((p) => p[1]);
      /* textPoly is already 2 px past the ink; the keep-out adds the rest of the 12 px */
      const pad = rectPoly({ x0: Math.min(...xs) - (PENN_GAP - 2), y0: Math.min(...ys) - (PENN_GAP - 2), x1: Math.max(...xs) + (PENN_GAP - 2), y1: Math.max(...ys) + (PENN_GAP - 2) });
      out.push({ pa, pb, pad, tie, svg: (tie ? '<path class="s-hair k-ink3" d="M' + x + " " + f1(tie[0][1]) + "V" + f1(tie[1][1]) + '"/>' : "") +
        '<text class="mp-term" x="' + f1(x + dx) + '" y="' + f1(y + dy) + '" text-anchor="' + anchor + '">' + a + "</text>" +
        '<text class="mp-term" x="' + f1(x + dx) + '" y="' + f1(y + dy + 17) + '" text-anchor="' + anchor + '">' + b + "</text>" });
    }
    /* prefer slots that displace no station name (stable sort keeps the order above) */
    return out.map((sl, k) => ({ sl, k, n: softHits(sl.pa) + softHits(sl.pb) })).sort((a, b) => a.n - b.n || a.k - b.k).map((o) => o.sl);
  })();
  const pennOn = (sl) => { soPoly(sl.pa, "label"); soPoly(sl.pb, "label"); soPoly(sl.pad, "pennpad"); if (sl.tie) SO.segs.push({ a: sl.tie[0], b: sl.tie[1], kind: "tie", penn: true }); };
  const pennOff = (sl) => { SO.polys = SO.polys.filter((o) => o.poly !== sl.pa && o.poly !== sl.pb && o.poly !== sl.pad); SO.segs = SO.segs.filter((o) => !o.penn); };

  /* schematic train blocks. Hard obstacles only, no penalty fallback: a candidate is taken only if its block
     touches no label, line, train mark or other block, and its leader crosses no label, line, mark or leader.
     Candidates, shortest leader first: a straight 45° leader, then an orthogonal run off the spine followed
     by a 45° leg (Beck dogleg). Talking trains first, then by route mile. */
  /* Leader length is the cost, and 64 px is a hard cap: a 45° leader of 48 px or less first, then the orthogonal
     flagpole (n/s, block flush past its end), then a short Beck dogleg, and only then a 45° leg of 49–64 px. A long
     diagonal on a 0°/45° diagram reads as a branch, so none is drawn. (from = 7: the leader stops ≥ 2 px short
     of the train mark, so it never joins the line.) */
  const SCH_LEAD_MAX = 64, SCH_LEAD_PREF = 48, SCH_FROM = 7, SCH_BLOCK_GAP = 3;
  const blockPad = (b) => ({ x0: b.x0 - 8, y0: b.y0 - SCH_BLOCK_GAP, x1: b.x1 + 8, y1: b.y1 + SCH_BLOCK_GAP });
  const SCH_CANDS = (() => {
    const out = [], over = (d) => (d > SCH_LEAD_PREF ? 200 : 0), LENS = [24, 31, 39, 47, 55, 63, 71];
    for (const len of LENS) for (const dir of ["ne", "nw", "se", "sw"]) { const d = len - SCH_FROM; out.push({ dir, len, v: 0, d, cost: d + over(d) * 1.5 }); }
    for (const len of LENS) for (const dir of ["n", "s"]) for (const flip of [false, true]) { const d = len - SCH_FROM; out.push({ dir, len, v: 0, flip, d, cost: d + 6 + (flip ? 1 : 0) + over(d) }); }
    for (let v = 15; v <= SCH_LEAD_MAX; v += 8) for (const len of [16, 24, 32]) for (const dir of ["ne", "nw", "se", "sw"]) {
      const d = v - SCH_FROM + len;
      out.push({ dir, len, v, d, cost: d + 12 + over(d) });
    }
    return out.filter((c) => c.d <= SCH_LEAD_MAX).sort((a, b) => a.cost - b.cost);
  })();
  const trainMarkSch = trainGeo.map((tg) => (tg.sch ? rectPoly({ x0: tg.sch.xy[0] - 7, y0: tg.sch.xy[1] - 5, x1: tg.sch.xy[0] + 7, y1: tg.sch.xy[1] + 5 }) : null));
  const legsOf = (g) => g.lead.slice(1).map((p, k) => [g.lead[k], p]);
  /* returns { hard } if a fixed obstacle is hit, else the set of trains whose block or leader is in the way */
  function schCheck(g) {
    const b = g.box, owners = new Set();
    if (b.x0 < 4 || b.y0 < 4 || b.x1 > W - 4 || b.y1 > H - 4) return { hard: true };
    const bp = rectPoly(b), legs = legsOf(g);
    const hit = (o, test) => { if (!test) return false; if (o.owner == null) return true; owners.add(o.owner); return false; };
    for (const o of SO.polys) if (hit(o, polyPoly(bp, o.poly) || (o.kind !== "pennpad" && legs.some(([a, c]) => segPoly(a, c, o.poly))))) return { hard: true };
    for (const sg of SO.segs) if (hit(sg, segPoly(sg.a, sg.b, bp) || legs.some(([a, c]) => segX(a, c, sg.a, sg.b)))) return { hard: true };
    if (trainMarkSch.some((p) => p && polyPoly(bp, p))) return { hard: true };
    if (legs.some(([a, c]) => trainMarkSch.some((p) => p && p !== g.ownMark && segPoly(a, c, p)))) return { hard: true };
    return { hard: false, owners };
  }
  const schClean = (g) => { const r = schCheck(g); return !r.hard && r.owners.size === 0; };
  const trainBlockSch = trainGeo.map(() => null);
  const schIdx = trainGeo.map((tg, i) => i).filter((i) => trainGeo[i].sch);
  const schBase = (i) => ({ ...trainBlockBase(trainGeo[i], true), x: trainGeo[i].sch.xy[0], y: trainGeo[i].sch.xy[1], ownMark: trainMarkSch[i] });
  const schPut = (i, g) => { trainBlockSch[i] = g; SO.polys.push({ poly: rectPoly(blockPad(g.box)), kind: "block", owner: i }); legsOf(g).forEach(([a, b]) => SO.segs.push({ a, b, kind: "leader", owner: i })); };
  const schLift = (i) => { trainBlockSch[i] = null; SO.polys = SO.polys.filter((o) => o.owner !== i); SO.segs = SO.segs.filter((o) => o.owner !== i); };
  const firstClean = (i) => { for (const c of SCH_CANDS) { const g = blockGeom({ ...schBase(i), ...c }); if (schClean(g)) return g; } return null; };

  /* 0 exact search first (forward checking): each train's domain is its statically clean candidates, cheapest
     first; placing one prunes every other domain of what it would now touch, and the train with the fewest options
     goes next. The first complete assignment wins (every train clean). It runs once per Baltimore Penn label slot.
     A node budget bounds it; the hard-obstacle greedy + repair below is only the fallback. */
  const pairClash = (g, h) => {
    /* blocks keep 8 px (side by side) and 3 px (stacked) past their 2 px knockout from each other and from other
       leaders: ≥ 20 px between two blocks on one row, ≥ 10 px between rows, so two blocks never read as one */
    const bg = g.poly || (g.poly = rectPoly(blockPad(g.box))), bh = h.poly || (h.poly = rectPoly(blockPad(h.box))), lg = legsOf(g), lh = legsOf(h);
    return polyPoly(bg, bh) || lg.some(([a, b]) => segPoly(a, b, bh) || lh.some(([c, d]) => segX(a, b, c, d))) || lh.some(([a, b]) => segPoly(a, b, bg));
  };
  let dfsNodes = 0;
  const schTrace = [];
  const DFS_BUDGET = 8000, NAME_COST = 100;   /* a displaced station name costs about two leaders' worth of length */
  /* branch and bound: minimise the summed rank (leader length + displaced names); forward checking prunes every other
     domain of what a choice would touch; the most constrained train goes next; a node budget bounds it and the best
     complete assignment found so far wins */
  let best = null, bestCost = Infinity;
  const dfs = (doms, chosen, cost) => {
    const open = Object.keys(doms).map(Number);
    if (!open.length) { if (cost < bestCost) { bestCost = cost; best = chosen; } return; }
    const lb = open.reduce((n, j) => n + doms[j][0].rank, cost);
    if (lb >= bestCost) return;
    const i = open.reduce((p, q) => (doms[q].length < doms[p].length ? q : p));
    const rest = lb - doms[i][0].rank;
    for (const g of doms[i]) {
      if (rest + g.rank >= bestCost || ++dfsNodes > DFS_BUDGET) return;
      const next = {};
      let dead = false;
      for (const j of open) {
        if (j === i) continue;
        next[j] = doms[j].filter((h) => !pairClash(g, h));
        if (!next[j].length) { dead = true; break; }
      }
      if (!dead) dfs(next, { ...chosen, [i]: g }, cost + g.rank);
    }
  };
  const solve = () => {
    /* each candidate's rank: leader length (SCH_CANDS order) plus 40 per station name it would displace */
    /* a displaced Amtrak stop or talking-train station (rank < 3) weighs 10 ordinary names, so a lower-priority neighbour gives way first */
    const nameCost = (g) => {
      const bp = rectPoly(blockPad(g.box)), legs = legsOf(g);
      const hit = (q) => polyPoly(bp, q.tight) || legs.some(([a, b]) => segPoly(a, b, q.poly));
      /* 1 per default slot taken; a high-priority name also costs 4 per slot of its taken, so blocks leave it a slot */
      return schNames.reduce((n, nm) => n + (hit(nm.cands[0]) ? 1 : 0) + (nm.rank < 3 ? 4 * nm.cands.filter(hit).length : 0), 0);
    };
    const doms = Object.fromEntries(schIdx.map((i) => [i, SCH_CANDS.map((c) => { const g = blockGeom({ ...schBase(i), ...c }); g.rank = c.cost; return g; }).filter(schClean)
      .map((g) => { g.names = nameCost(g); g.rank += NAME_COST * g.names; return g; }).sort((a, b) => a.rank - b.rank).slice(0, 60)]));
    const empty = Object.entries(doms).filter(([, d]) => !d.length).map(([i]) => trainGeo[i].t.train_id);
    if (empty.length) { schTrace.push("empty:" + empty); return false; }
    dfsNodes = 0; best = null; bestCost = Infinity;
    dfs(doms, {}, 0);
    schTrace.push(best ? "ok · cost " + Math.round(bestCost) + " · " + dfsNodes + " nodes" : dfsNodes > DFS_BUDGET ? "budget" : "exhausted");
    if (!best) return false;
    for (const [i, g] of Object.entries(best)) schPut(Number(i), g);
    return true;
  };
  let dfsOk = false, pennSlot = null;
  const trySlots = () => {
    for (const sl of pennSlots) {
      pennOn(sl);
      if (solve()) { dfsOk = true; pennSlot = sl; return true; }
      pennOff(sl);
    }
    return false;
  };
  trySlots();
  if (!pennSlot && pennSlots.length) { pennSlot = pennSlots[0]; pennOn(pennSlot); }
  if (pennSlot) sch.push(pennSlot.svg); else console.warn("map: no clean slot for the Baltimore Penn label");

  /* 1 greedy, in the best of three orders (left-to-right, right-to-left, most constrained first) */
  const freeCount = Object.fromEntries(schIdx.map((i) => [i, SCH_CANDS.filter((c) => schClean(blockGeom({ ...schBase(i), ...c }))).length]));
  const byX = (i, j) => trainGeo[i].sch.xy[0] - trainGeo[j].sch.xy[0];
  const orders = [schIdx.slice().sort(byX), schIdx.slice().sort((i, j) => byX(j, i)), schIdx.slice().sort((i, j) => freeCount[i] - freeCount[j] || byX(i, j))];
  let bestRun = dfsOk ? { placed: {}, unplaced: [], cost: 0 } : null;
  for (const order of dfsOk ? [] : orders) {
    const run = { placed: {}, unplaced: [], cost: 0 };
    for (const i of order) {
      const g = firstClean(i);
      if (!g) { run.unplaced.push(i); continue; }
      schPut(i, g); run.placed[i] = g; run.cost += (g.len || 0) + (g.v || 0);
    }
    order.forEach(schLift);
    if (!bestRun || run.unplaced.length < bestRun.unplaced.length || (run.unplaced.length === bestRun.unplaced.length && run.cost < bestRun.cost)) bestRun = run;
  }
  if (!dfsOk) for (const [i, g] of Object.entries(bestRun.placed)) schPut(Number(i), g);
  let schUnplaced = bestRun.unplaced.slice();

  /* 2 repair: for a train left over, take the cheapest slot that only other trains' blocks are in the way of,
     lift those trains, place this one, and re-place them; keep the move only if every lifted train lands clean */
  for (let pass = 0; pass < 3 && schUnplaced.length; pass++) {
    for (const u of schUnplaced.slice()) {
      for (const c of SCH_CANDS) {
        const g = blockGeom({ ...schBase(u), ...c }), r = schCheck(g);
        if (r.hard || !r.owners.size) continue;
        const lifted = [...r.owners], before = Object.fromEntries(lifted.map((i) => [i, trainBlockSch[i]]));
        lifted.forEach(schLift);
        schPut(u, g);
        const again = lifted.sort(byX).map((i) => { const h = firstClean(i); if (h) schPut(i, h); return h; });
        if (again.every(Boolean)) { schUnplaced = schUnplaced.filter((x) => x !== u); break; }
        lifted.forEach(schLift); schLift(u);
        lifted.forEach((i) => schPut(i, before[i]));
      }
    }
  }
  /* no long-leader fallback: a block that cannot sit clean within 64 px is not drawn; the audit names it */
  for (const i of schUnplaced) console.warn("map: schematic block could not be placed cleanly", trainGeo[i].t.train_id);

  /* station and detector names, after the data: by priority, default side, then the other side, else dropped
     (brief §9.5). A name touches no label, block, leader, route line, tie or train mark. */
  const namesDropped = [], nameSvg = [], dropWhy = {};
  for (const nm of schNames.slice().sort((a, b) => a.rank - b.rank || a.x - b.x)) {
    /* ink box (tight, 1 px) against other names, blocks (already 3 px past their knockout) and train marks; the
       2 px leader clearance (textPoly) against labels, leaders, ties and route lines */
    const tightKinds = new Set(["name", "block"]);
    const nameHit = (q, o) => (tightKinds.has(o.kind) ? polyPoly(q.tight, o.poly) : polyPoly(q.poly, o.poly));
    const c = nm.cands.find((q) => SO.polys.every((o) => o.kind === "pennpad" || !nameHit(q, o)) &&
      !SO.segs.some((sg) => segPoly(sg.a, sg.b, q.poly)) && !trainMarkSch.some((m) => m && polyPoly(q.tight, m)));
    if (!c) {
      namesDropped.push(nm.name);
      dropWhy[nm.name] = nm.cands.map((q) => [...new Set([...SO.polys.filter((o) => o.kind !== "pennpad" && nameHit(q, o)).map((o) => o.kind + (o.owner != null ? ":" + trainGeo[o.owner].t.train_id : "")),
        ...SO.segs.filter((sg) => segPoly(sg.a, sg.b, q.poly)).map((sg) => "seg:" + sg.kind + (sg.owner != null ? ":" + trainGeo[sg.owner].t.train_id : "")),
        ...(trainMarkSch.some((m) => m && polyPoly(q.tight, m)) ? ["trainmark"] : [])])].join("+"));
      continue;
    }
    SO.polys.push({ poly: c.tight, pad: c.poly, kind: "name" });
    nameSvg.push(c.svg);
  }
  sch.push('<g class="mp-names">' + nameSvg.join("") + "</g>");

  /* collision audit, independent of the placers: counts what is actually drawn */
  function auditSchematic() {
    const blocks = trainBlockSch.map((g, i) => (g ? { g, i } : null)).filter(Boolean);
    const labels = SO.polys.filter((o) => o.kind === "label" || o.kind === "strip" || o.kind === "overlay" || o.kind === "name").map((o) => (o.pad ? { ...o, poly: o.pad } : o));
    let leaderLeader = 0, leaderLabel = 0, blockLabel = 0, leaderBlock = 0;
    for (const A of blocks) {
      const la = legsOf(A.g);
      for (const B of blocks) {
        if (B.i <= A.i) continue;
        const lb = legsOf(B.g);
        for (const [a, b] of la) for (const [c, d] of lb) if (segX(a, b, c, d)) leaderLeader++;
      }
      for (const [a, b] of la) {
        leaderLabel += labels.filter((o) => segPoly(a, b, o.poly)).length;
        leaderBlock += blocks.filter((B) => B !== A && segPoly(a, b, rectPoly(B.g.box))).length;
      }
      blockLabel += labels.filter((o) => polyPoly(rectPoly(A.g.box), o.poly)).length;
    }
    return { leaderLeader, leaderLabel, leaderBlock, blockLabel };
  }

  /* ------------------------------------------------------------------ dynamic layer (morph u, demo ms) */
  /* ease-instrument cubic-bezier(0.2, 0, 0, 1) for frozen frames */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; } return Y((lo + hi) / 2); };
  }
  const EASE = bezier(0.2, 0, 0, 1), EASE_IO = bezier(0.4, 0, 0.2, 1);

  const selectId = P.select ? P.select.toLowerCase().replace(/[\s_-]+/g, "") : null;
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isSel = (t) => selectId && norm(t.train_id) === selectId;
  const selFeed = selectId ? feeds.find((f) => norm(f.short) === selectId || norm(f.id) === selectId) : null;
  const bracket = (X, Y, o = 12, a = 14) => '<path class="s-emph k-select" d="M' + (X - o) + " " + (Y - o + a / 2) + "v" + -a / 2 + "h" + a / 2 + "M" + (X + o - a / 2) + " " + (Y - o) + "h" + a / 2 + "v" + a / 2 +
    "M" + (X + o) + " " + (Y + o - a / 2) + "v" + a / 2 + "h" + -a / 2 + "M" + (X - o + a / 2) + " " + (Y + o) + "h" + -a / 2 + "v" + -a / 2 + '"/>';

  function dynamic(u, demoMs) {
    const out = [];
    const geoOnly = u === 0, schOnly = u === 1;
    /* route chains: invisible in geo (OSM lines carry the track), grow in as the OSM layer fades */
    for (const [rid, keys] of Object.entries(SCH.chains)) {
      const pts = keys.map((k) => lerp(SCH.pos[k].geo, SCH.pos[k].xy, EASE_IO(u)));
      if (u > 0) out.push('<path class="' + (rid === "r-nec" ? "s-emph" : "s-hair") + ' k-line" style="opacity:' + Math.min(1, u * 1.6).toFixed(2) + '" d="' + dPath(pts) + '"/>');
    }
    /* schematic station marks + terminals + detectors */
    if (u > 0) {
      for (const it of Object.values(SCH.pos)) {
        const [x, y] = lerp(it.geo, it.xy, EASE_IO(u)), id = it.p.place_id, op = Math.min(1, u * 1.6).toFixed(2);
        if (it.p.kind === "detector") { out.push('<path class="s-hair k-line mp-f-void" style="opacity:' + op + '" d="M' + f1(x) + " " + f1(y - 4.5) + 'l4.5 4.5l-4.5 4.5l-4.5 -4.5Z"/>'); continue; }
        if (TERMINALS.has(id) && it.rid === "r-nec") { out.push('<rect class="s-emph k-ink mp-f-void" style="opacity:' + op + '" x="' + f1(x - 7) + '" y="' + f1(y - 7) + '" width="14" height="14"/>'); continue; }
        if (TERMINALS.has(id)) continue;
        const vert = it.rid === "r-metro";
        out.push('<path class="s-emph k-ink" style="opacity:' + op + '" d="' + (vert ? "M" + f1(x - 4) + " " + f1(y) + "h8" : "M" + f1(x) + " " + f1(y - 4) + "v8") + '"/>');
      }
    }
    /* reception links (geometry and label slots precomputed above) */
    if (geoOnly) {
      for (const L of linkGeom) {
        let op = 1;
        if (DEMO_TX && L.tx === DEMO_TX) op = demoMs < 250 ? 0 : Math.min(1, EASE((demoMs - 250) / 400));
        if (op <= 0) continue;
        const o = ' style="opacity:' + op.toFixed(2) + '"';
        out.push('<path class="' + (L.primary ? "s-emph" : "s-hair") + ' k-tx d-measure"' + o + ' d="M' + f1(L.A[0]) + " " + f1(L.A[1]) + "L" + f1(L.B[0]) + " " + f1(L.B[1]) + '"/>');
        if (L.lab) out.push('<text class="mp-tx-lab"' + o + ' transform="translate(' + f1(L.lab.c[0]) + " " + f1(L.lab.c[1]) + ") rotate(" + f1(L.lab.up) + ')" dy="4" text-anchor="middle">' + esc(L.lab.text) + "</text>");
      }
    }
    /* trains */
    const blocks = [];
    trainGeo.forEach((tg, i) => {
      const t = tg.t;
      let talking = !!t.talking;
      if (DEMO_TX && DEMO_TX.train_id === t.train_id) talking = demoMs >= 250;
      const pos = tg.sch ? lerp(tg.pt, tg.sch.xy, EASE_IO(u)) : tg.pt;
      const hd = tg.sch ? (u < 0.5 ? tg.hd : tg.sch.dir) : tg.hd;
      const ang = Math.atan2(hd[1], hd[0]) / RAD;
      const fill = talking ? "f-tx" : "mp-f-ink";
      if (geoOnly && tg.tail && tg.tail.length > 1) {
        const z = tg.tail[tg.tail.length - 1], gid = "mp-tail-" + i;
        out.push('<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + f1(pos[0]) + '" y1="' + f1(pos[1]) + '" x2="' + f1(z[0]) + '" y2="' + f1(z[1]) + '">' +
          '<stop offset="0" stop-color="' + (talking ? "var(--state-tx)" : "var(--ink)") + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + (talking ? "var(--state-tx)" : "var(--ink)") + '" stop-opacity="0"/></linearGradient>');
        out.push('<path class="mp-tail" stroke="url(#' + gid + ')" d="' + dPath(tg.tail) + '"/>');
      }
      const tr = 'transform="translate(' + f1(pos[0]) + " " + f1(pos[1]) + ") rotate(" + f1(ang) + ')"';
      if (talking && !(tg.off && u === 0)) {
        out.push('<rect class="s-hair k-tx glow-2" ' + tr + ' x="-5" y="-2" width="10" height="4"/><rect class="s-hair k-tx glow-1" ' + tr + ' x="-5" y="-2" width="10" height="4"/>');
      }
      if (tg.off && u === 0) out.push('<path class="' + fill + '" ' + tr + ' d="M6 0L-3 -5L-3 5Z"/>');   /* edge marker: points off-view */
      else out.push('<rect class="' + fill + '" ' + tr + ' x="-5" y="-2" width="10" height="4"/>');
      if (isSel(t)) out.push(bracket(pos[0], pos[1]));
      if (geoOnly || schOnly) {
        const g = schOnly ? trainBlockSch[i] : trainBlockDir[i];
        if (g) blocks.push(blockSvg(blockGeom({ ...trainBlockBase(tg, talking), x: g.x, y: g.y, dir: g.dir, len: g.len, v: g.v, flip: g.flip, sch: schOnly })));
      }
    });
    out.push(blocks.join(""));   /* blocks after every glyph, so text halos knock out any leader beneath */
    /* coverage strip (schematic): the same feedLook() as the geo feed sites, so one key-up reads the same in both
       modes; on each receiving feed's row the tick nearest the talking train turns state-tx */
    if (u > 0) {
      const op = Math.min(1, u * 1.6).toFixed(2);
      let s = '<g class="mp-strip-dyn" style="opacity:' + op + '">';
      for (const row of stripRows) {
        const look = feedLook(row.f, demoMs ?? 1e9);
        s += glyphSvg(row.gx, row.gy, look.glyph);
        for (const tx of active) {
          if (!tx.train_id || (DEMO_TX && tx === DEMO_TX && !(demoMs >= 250))) continue;
          if (!(tx.receptions || []).some((r) => r.feed_id === row.f.id) || !row.ticks.length) continue;
          const tg = trainGeo.find((g) => g.t.train_id === tx.train_id);
          if (!tg || !tg.sch) continue;
          const tx0 = tg.sch.xy[0], near = row.ticks.reduce((a, b) => (Math.abs(b - tx0) < Math.abs(a - tx0) ? b : a));
          s += '<path class="s-emph k-tx" d="M' + f1(near) + " " + (row.y - 10) + "V" + (row.y + 2) + '"/>';
        }
      }
      out.push(s + "</g>");
    }
    /* feeds (geo only): registration mark, glyph, data block */
    if (u < 1) {
      const op = (1 - Math.min(1, u * 1.6)).toFixed(2);
      let s = '<g style="opacity:' + op + '">';
      feeds.forEach((f, i) => {
        const c = proj(f.lon, f.lat), look = feedLook(f, demoMs ?? 1e9);
        s += HUD.svg.regMark(c[0], c[1], look.mark);
        if (f === selFeed) s += bracket(Math.round(c[0]), Math.round(c[1]), 16, 14);
        if (geoOnly) {
          const g = feedBlocks[i];
          s += blockSvg(blockGeom({ x: g.x, y: g.y, dir: g.dir, len: g.len, from: 10, l1: f.short, sim: f.sim, l2: look.l2, l2Class: look.l2Class, glyph: look.glyph }));
        }
      });
      out.push(s + "</g>");
    }
    return out.join("");
  }

  /* ------------------------------------------------------------------ mount */
  svg.innerHTML = "<defs>" + defs.join("") + "</defs>" +
    '<g class="mp-geo" id="mp-geo">' + geo.join("") + "</g>" +
    '<g class="mp-sch" id="mp-sch">' + sch.join("") + "</g>" +
    '<g id="mp-dyn"></g><g id="mp-pings"></g>';
  const gGeo = svg.querySelector("#mp-geo"), gSch = svg.querySelector("#mp-sch"), gDyn = svg.querySelector("#mp-dyn"), gPing = svg.querySelector("#mp-pings");
  let U = MODE === "schematic" ? 1 : 0;
  let demoMs = DEMO ? (FREEZE ?? -1) : null;
  function paint() {
    gGeo.style.opacity = String(1 - U);
    gGeo.style.display = U === 1 ? "none" : "";
    gSch.style.opacity = String(U);
    gSch.style.display = U === 0 ? "none" : "";
    gDyn.innerHTML = dynamic(U, demoMs);
    if (DEMO) onair.innerHTML = onAirHTML(demoMs);
  }
  paint();

  /* M14 ping: once per TX commit, every receiving feed, primary at 1.5 px (brief §7.3 Connect phase) */
  function pingsAt(ms) {
    if (!DEMO_TX) return "";
    /* geo: from the feed site; schematic: from that feed's strip glyph */
    const at = (f) => { const row = stripRows.find((x) => x.f === f); return U === 1 && row ? [row.gx, row.gy] : proj(f.lon, f.lat); };
    return DEMO_TX.receptions.map((r) => {
      const f = feedById[r.feed_id], c = at(f), primary = r.feed_id === DEMO_TX.feed_id;
      if (ms == null) return HUD.svg.ping(f1(c[0]), f1(c[1]), primary);
      const p = Math.max(0, Math.min(1, (ms - 250) / 1200));
      if (ms < 250 || p >= 1) return "";
      const e = EASE(p);
      return '<circle class="ping' + (primary ? " is-primary" : "") + '" cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + f1(6 + 34 * e) + '" style="stroke-opacity:' + (0.6 * (1 - e)).toFixed(3) + '"/>';
    }).join("");
  }

  /* demo caption */
  if (DEMO) {
    const cap = document.createElement("div");
    cap.className = "mp-demo";
    cap.innerHTML = '<span class="k">MAP PING · KEY-UP REPLAY</span><span class="v">' + esc(DEMO_TX.aar) + " · " + esc(fmt.trainId(DEMO_TX.train_id)) + "</span>" +
      '<span class="k">T</span><span class="v" id="mp-demo-t">—</span>' + HUD.c.chip("REPLAY", "nominal", { button: true, cls: "mp-replay" });
    canvas.appendChild(cap);
    const tEl = cap.querySelector("#mp-demo-t");
    const phase = (ms) => (ms < 0 ? "IDLE" : ms < 250 ? "DETECT" : ms < 650 ? "COMMIT · CONNECT" : ms < 1450 ? "PING" : "POPULATE");
    const label = (ms) => (ms < 0 ? "— — —" : "+" + Math.round(ms) + " MS · " + phase(ms));
    if (FREEZE != null) {
      gPing.innerHTML = pingsAt(FREEZE);
      tEl.textContent = label(FREEZE);
    } else {
      let t0 = null, raf = null, pinged = false;
      const tick = (now) => {
        demoMs = now - t0;
        if (!pinged && demoMs >= 250) { gPing.innerHTML = pingsAt(null); HUD.firePings(gPing); pinged = true; }
        paint();
        tEl.textContent = label(demoMs);
        if (demoMs >= 5000) start();                    /* loops: one key-up every 5 s, ping fires once per loop */
        else raf = requestAnimationFrame(tick);
      };
      const start = () => { cancelAnimationFrame(raf); gPing.innerHTML = ""; pinged = false; t0 = performance.now(); demoMs = 0; raf = requestAnimationFrame(tick); };
      cap.querySelector(".mp-replay").addEventListener("click", start);
      setTimeout(start, HUD.motion === "reduced" ? 0 : 600);
    }
  }

  /* GEO / SCHEMATIC toggle: 600 ms ease-in-out morph of the same network */
  content.querySelectorAll(".mp-mode").forEach((b) => b.addEventListener("click", () => {
    const target = b.textContent.trim() === "SCHEMATIC" ? 1 : 0;
    if (target === U) return;
    content.querySelectorAll(".mp-mode").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (HUD.motion === "reduced") { U = target; paint(); return; }
    const from = U, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 600);
      U = from + (target - from) * p;
      if (p >= 1) U = target;
      paint();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));

  /* M11 pointer readout: lat/long, plus the nearest route MP within 250 m */
  const cursorEl = content.querySelector("#mp-cursor");
  const mpIndex = [];
  for (const r of routes) for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i], b = r.points[i + 1], pa = parseMp(a.mp_label), pb = parseMp(b.mp_label);
    if (!pa || !pb || pa.prefix !== pb.prefix) continue;
    mpIndex.push({ a: [a.lon, a.lat], b: [b.lon, b.lat], pa, pb });
  }
  canvas.addEventListener("pointermove", (e) => {
    if (U !== 0) return;
    const r = canvas.getBoundingClientRect(), ll = proj.invert(e.clientX - r.left, e.clientY - r.top);
    let best = null;
    for (const s of mpIndex) {
      for (let k = 0; k <= 20; k++) {
        const q = lerp(s.a, s.b, k / 20), d = geoKm(ll, q);
        if (d <= 0.25 && (!best || d < best.d)) best = { d, v: s.pa.v + (s.pb.v - s.pa.v) * (k / 20), prefix: s.pa.prefix, derived: s.pa.derived || s.pb.derived };
      }
    }
    cursorEl.innerHTML = '<span class="k">POINTER</span>' + ll[1].toFixed(4) + " N · " + Math.abs(ll[0]).toFixed(4) + " W" +
      (best ? " · " + (best.derived ? "≈" : "") + best.prefix + " " + best.v.toFixed(1) : "");
  });
  canvas.addEventListener("pointerleave", () => { cursorEl.innerHTML = '<span class="k">POINTER</span>' + fmt.blank; });

  /* inspector for a selected train: its data block enlarged (the Map hero datum, brief §9.5) */
  const sel = trains.find(isSel);
  if (sel) {
    const route = routeById[sel.route_id], ch = Number(String(sel.channel).replace(/\D/g, ""));
    const tx = active.find((t) => t.train_id === sel.train_id);
    const next = sel.next_stop ? placeById[sel.next_stop] : null;
    const kv = HUD.c.kv;
    const sections = [
      { title: "POSITION", html: '<div class="mp-insp-mp">' + HUD.c.mpTag(sel.mp_label.replace("≈", "")) + "<div style=\"flex:1\">" +
        kv("ROUTE", esc(countName(route, sel))) + kv("DIRECTION", esc(sel.direction)) + kv("SPEED", String(sel.speed_mph), { unit: "MPH" }) +
        kv("NEXT STOP", next ? esc(shortName(next)) + " · " + esc(fmt.clock(sel.next_stop_t, scn.tz.name).slice(0, 5)) : fmt.blank) + "</div></div>" },
      { title: "CHANNEL", html: kv("CHANNEL", esc(sel.channel) + " · " + fmt.aar(ch)) + kv("FREQUENCY", fmt.freq(HUD.chToMhz(ch)), { unit: "MHz" }) },
    ];
    if (tx) sections.push({ title: "RECEPTIONS · " + tx.receptions.length, html: tx.receptions.map((r) =>
      kv(HUD.feedName(r.feed_id) + (r.feed_id === tx.feed_id ? " · PRIMARY" : ""), fmt.snr(r.snr_db) + " · " + fmt.dbfs(r.rssi_dbfs) + " · " + r.dist_km.toFixed(1) + " KM")).join("") });
    canvas.insertAdjacentHTML("beforeend", HUD.c.inspector({
      title: fmt.trainId(sel.train_id), kind: "TRACKED TRAIN · " + sel.line, glyph: tx ? "tx" : null, sim: sel.sim,
      lead: heroLead(fmt.trainId(sel.train_id), tx ? "is-tx" : "", sel.sim, sel.data_block[1]), sections,
    }));
  }

  /* inspector for a selected feed site: same hero treatment, then site, state and what it is hearing now */
  if (selFeed && !sel) {
    const f = selFeed, look = feedLook(f, 1e9), kv = HUD.c.kv, heard = txByFeed[f.id] || [];
    const sections = [
      { title: "SITE", html: kv("LOCATION", f.lat.toFixed(4) + " N · " + Math.abs(f.lon).toFixed(4) + " W") + kv("COVERAGE RADIUS", String(f.coverage_radius_km), { unit: "KM" }) +
        kv("CENTRE", fmt.freq(f.center_mhz), { unit: "MHz" }) },
      { title: "STATE", html: kv("STATE", esc(look.fault ? f.label : look.stale ? "STALE" : "OK")) +
        (look.fault || look.stale ? kv("IN STATE", esc(f.in_state_label || fmt.blank)) : kv("SNR", fmt.snr(f.snr_db))) +
        kv("LAST SAMPLE", esc(fmt.age(f.last_sample_age_s, "age"))) + (look.fault ? kv("ACK", f.acked ? "ACK'D" : "UNACKED") : "") },
      /* brief §8.3: the inspector carries ACK for faults. Same block as the Live Ops feed inspector. */
      ...(look.fault ? [{ title: "ACTIONS", html: '<div class="insp-btns">' + HUD.c.btn(f.acked ? "ACK'D" : "ACK", { primary: !f.acked, disabled: !!f.acked }) + HUD.c.btn("OPEN IN FEEDS & BANKS") + "</div>" }] : []),
      { title: "HEARING NOW · " + heard.length, html: heard.length ? heard.map((t) => {
        const r = t.receptions.find((x) => x.feed_id === f.id);
        return kv(esc(t.aar) + " · " + esc(fmt.trainId(t.train_id || t.speaker || "")) + (t.feed_id === f.id ? " · PRIMARY" : ""), fmt.snr(r.snr_db) + " · " + fmt.dbfs(r.rssi_dbfs) + " · " + r.dist_km.toFixed(1) + " KM");
      }).join("") : kv("ON AIR", fmt.blank) },
    ];
    const cls = look.fault ? "mp-hero-fault" : look.stale ? "mp-hero-stale" : look.glyph === "tx" ? "is-tx" : "";
    canvas.insertAdjacentHTML("beforeend", HUD.c.inspector({
      title: f.short, kind: "FEED SITE · " + f.site, glyph: look.glyph === "idle-dim" ? "idle" : look.glyph, sim: f.sim,
      lead: heroLead(f.short, cls, f.sim, look.l2), sections,
    }));
  }
  /* the selected item's data block is the Map hero (brief §9.5): ID at hero__big 48 px, SIM and line 2 at 13 px */
  function heroLead(id, cls, sim, l2) {
    return '<div class="mp-insp-lead"><div class="hero__big mp-insp-hero ' + cls + '">' + esc(id) + "</div>" +
      '<div class="mp-insp-sub">' + (sim ? '<span class="tag-sim">SIM</span>' : "") + "<span>" + esc(l2) + "</span></div></div>";
  }

  /* review r3 #6: a train's ROUTE row names the count it is on. A two-count route ("NEC · RF&P") shows the train's own
     count: NEC for a train on the NEC count, "CFP · RF&P" for one on the RF&P (CFP) count. */
  function countName(route, t) {
    if (!route) return t.route_id;
    const parts = route.name.split(" · ");
    if (parts.length < 2 || !t.prefix) return route.name;
    if (parts.includes(t.prefix)) return t.prefix;
    return t.prefix + " · " + parts.filter((x) => x !== "NEC").join(" · ");
  }

  /* collision audit (console.assert must log 0 leader-leader and leader-label hits) */
  {
    const a = auditSchematic();
    const geoBlocks = [...trainBlockDir, ...feedBlocks];
    const railInBlocks = geoBlocks.filter((g) => railThrough(g.box) > 0).length;
    /* extended audit (round 3) */
    const rdist = (A, B) => Math.hypot(Math.max(0, B.x0 - A.x1, A.x0 - B.x1), Math.max(0, B.y0 - A.y1, A.y0 - B.y1));
    const bboxOf = (poly, inset = 0) => { const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]); return { x0: Math.min(...xs) + inset, y0: Math.min(...ys) + inset, x1: Math.max(...xs) - inset, y1: Math.max(...ys) - inset }; };
    const schBlocks = trainBlockSch.filter(Boolean);
    const pennGlyph = pennSlot ? [bboxOf(pennSlot.pa, 2), bboxOf(pennSlot.pb, 2)] : [];
    const pennGap = schBlocks.length && pennGlyph.length ? Math.floor(Math.min(...schBlocks.flatMap((g) => pennGlyph.map((r) => rdist(r, padRect(g.box, -2)))))) : null;
    const routeSegs = SO.segs.filter((o) => o.kind === "route");
    const eqRoute = schEqPoly ? routeSegs.filter((sg) => segPoly(sg.a, sg.b, schEqPoly)).length : null;
    const railUnderLabel = labelGlyphs.filter((L) => L.kind !== "terminal" && L.kind !== "removed" && (L.rect ? railUnderRect(L.rect) : railUnderPoly(L.poly))).map((L) => L.text);
    const geoNamesByRank = geoNamesDropped.slice();   /* placement order = priority order */
    const geoBlockBlock = geoBlocks.reduce((n, g, k) => n + geoBlocks.slice(k + 1).filter((h) => g.box.x0 < h.box.x1 && g.box.x1 > h.box.x0 && g.box.y0 < h.box.y1 && g.box.y1 > h.box.y0).length, 0);
    const geoLeaderNearBlock = geoBlocks.reduce((n, g) => n + geoBlocks.filter((h) => h !== g && legsOfG(g).some(([p0, p1]) => segRect(p0, p1, padRect(h.box, 2)))).length, 0);
    const maxLead = (list) => Math.round(Math.max(0, ...list.map(leadLen)));
    const selObj = (() => {
      if (!selectId || MODE !== "geo") return null;
      const tg = trainGeo.find((g) => isSel(g.t)), pt = tg ? tg.pt : selFeed ? proj(selFeed.lon, selFeed.lat) : null;
      if (!pt) return null;
      const r = tg ? 12 : 16;
      return { id: P.select, at: pt.map(Math.round), pan: PAN, bracketInUncovered: pt[0] - r >= 0 && pt[0] + r <= W - INSPECTOR_W && pt[1] - r >= 0 && pt[1] + r <= H };
    })();
    const audit = { mode: MODE, state: HUD.state, size: HUD.size, schematic: { ...a, maxLeader: maxLead(schBlocks), pennGap, eqRoute }, schematicSearch: dfsOk ? "exact · " + schTrace[schTrace.length - 1] : "greedy", pennLabel: pennSlot ? pennSlots.indexOf(pennSlot) : -1, schematicUnplaced: schUnplaced.map((i) => trainGeo[i].t.train_id + "@" + trainGeo[i].sch.xy.map(Math.round)),
      schematicNamesDropped: namesDropped, schematicDropWhy: dropWhy,
      geo: { railUnderLabel: railUnderLabel.length, railUnderLabelNames: railUnderLabel, labelsPlaced: labelGlyphs.filter((L) => L.kind !== "removed").length, terminalsPlaced: termPlaced.length, namesDropped: geoNamesByRank, namesOffView: geoNamesOffView, maxLeader: maxLead(geoBlocks), leaderNearBlock: geoLeaderNearBlock, blockBlock: geoBlockBlock, blocksWithRailBehindKnockout: railInBlocks },
      select: selObj, primaryLinkLabels: linkGeom.filter((L) => L.primary).map((L) => !!L.lab) };
    const n = a.leaderLeader + a.leaderLabel;
    console.assert(n === 0, "map: schematic leader collisions", JSON.stringify(a));
    audit.pass = n === 0 && termPlaced.length >= 2;   /* review r3 #2: the audit fails if a terminal is unnamed in geo */
    console.assert(termPlaced.length >= 2, "map: a terminal name is missing in geo", termPlaced);
    console.info("map: collision audit", JSON.stringify(audit));
    document.documentElement.dataset.audit = JSON.stringify(audit);
  }

  HUD.buildOn(content);
})();

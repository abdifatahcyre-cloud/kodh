/* KODH geometry: turns 4 GPS brick positions + tape lengths into the true plot shape.
   Corners are A, B, C, D in walking order. Sides: AB, BC, CD, DA. Diagonal: AC (optional). */
(function (root) {
  const R_LAT = 110540, R_LNG = 111320;

  // --- local metric coordinates (metres) around an origin ---
  function makeFrame(latlngs) {
    let lat0 = 0, lng0 = 0;
    latlngs.forEach(p => { lat0 += p[0]; lng0 += p[1]; });
    lat0 /= latlngs.length; lng0 /= latlngs.length;
    const k = Math.cos(lat0 * Math.PI / 180);
    return {
      toXY: p => [(p[1] - lng0) * R_LNG * k, (p[0] - lat0) * R_LAT],
      toLL: q => [lat0 + q[1] / R_LAT, lng0 + q[0] / (R_LNG * k)]
    };
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function polygonArea(pts) {            // shoelace, metres²
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function areaLatLng(lls) { const f = makeFrame(lls); return polygonArea(lls.map(f.toXY)); }
  function sideLengthsLatLng(lls) {
    const f = makeFrame(lls), p = lls.map(f.toXY);
    return p.map((a, i) => dist(a, p[(i + 1) % p.length]));
  }

  // two circles: centre p r1, centre q r2 -> two intersection points (or null)
  function circles(p, r1, q, r2) {
    const d = dist(p, q);
    if (d < 1e-9 || d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) return null;
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d;
    const mx = p[0] + a * ux, my = p[1] + a * uy;
    return [[mx - h * uy, my + h * ux], [mx + h * uy, my - h * ux]];
  }
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Quadrilateral from 4 sides + diagonal AC. Returns [A,B,C,D] counter-clockwise, or null.
  function shapeWithDiagonal(s) {
    const A = [0, 0], B = [s.AB, 0];
    const cC = circles(A, s.AC, B, s.BC);
    if (!cC) return null;
    const C = cC[0][1] >= 0 ? cC[0] : cC[1];          // C above AB (CCW)
    const cD = circles(A, s.DA, C, s.CD);
    if (!cD) return null;
    // D on the opposite side of AC from B
    const D = cross(A, C, cD[0]) * cross(A, C, B) < 0 ? cD[0] : cD[1];
    return [A, B, C, D];
  }

  // Quadrilateral from 4 sides with the angle at A free (no diagonal).
  function shapeWithAngle(s, theta) {
    const A = [0, 0], B = [s.AB, 0], D = [s.DA * Math.cos(theta), s.DA * Math.sin(theta)];
    const cC = circles(B, s.BC, D, s.CD);
    if (!cC) return null;
    // pick the C that keeps the polygon convex-ish (on the far side of BD from A)
    const C = cross(B, D, cC[0]) * cross(B, D, A) < 0 ? cC[0] : cC[1];
    return [A, B, C, D];
  }

  // Best rigid fit (rotate + move, no stretching) of shape onto target points.
  function rigidFit(shape, target) {
    const n = shape.length;
    const cs = [0, 0], ct = [0, 0];
    for (let i = 0; i < n; i++) { cs[0] += shape[i][0]; cs[1] += shape[i][1]; ct[0] += target[i][0]; ct[1] += target[i][1]; }
    cs[0] /= n; cs[1] /= n; ct[0] /= n; ct[1] /= n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = shape[i][0] - cs[0], y = shape[i][1] - cs[1];
      const u = target[i][0] - ct[0], v = target[i][1] - ct[1];
      sxx += x * u + y * v; sxy += x * v - y * u;
    }
    const ang = Math.atan2(sxy, sxx), c = Math.cos(ang), si = Math.sin(ang);
    const out = shape.map(p => {
      const x = p[0] - cs[0], y = p[1] - cs[1];
      return [ct[0] + c * x - si * y, ct[1] + si * x + c * y];
    });
    const res = out.map((p, i) => dist(p, target[i]));
    const rms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / n);
    return { pts: out, residuals: res, rms };
  }
  const mirror = shape => shape.map(p => [p[0], -p[1]]);

  /* Main entry.
     gps: [[lat,lng] x4] for A,B,C,D.  sides: {AB,BC,CD,DA, AC?} in metres.
     Returns { ok, fitted:[[lat,lng]x4], residuals, rms, area, method, warnings[] } */
  function fitPlot(gps, sides) {
    const warnings = [];
    if (!gps || gps.length !== 4) return { ok: false, error: 'Need 4 corners.' };
    const f = makeFrame(gps), target = gps.map(f.toXY);
    const need = ['AB', 'BC', 'CD', 'DA'];
    const haveSides = need.every(k => sides && sides[k] > 0);
    if (!haveSides) {
      // GPS only: keep GPS shape as is
      return { ok: true, method: 'gps', fitted: gps.slice(), residuals: [0, 0, 0, 0], rms: 0,
        area: polygonArea(target), warnings: ['No tape lengths: shape comes from GPS only (sizes approximate).'] };
    }
    let best = null;
    const tryShape = (shape, method) => {
      if (!shape) return;
      [shape, mirror(shape)].forEach(sh => {
        const r = rigidFit(sh, target);
        if (!best || r.rms < best.rms) best = Object.assign(r, { method, shape: sh });
      });
    };
    if (sides.AC > 0) {
      tryShape(shapeWithDiagonal(sides), 'tape+diagonal');
      if (!best) return { ok: false, error: 'These lengths cannot make a closed shape. Re-check the tape numbers.' };
    } else {
      for (let t = 0.05; t < Math.PI - 0.05; t += 0.01) tryShape(shapeWithAngle(sides, t), 'tape');
      if (!best) return { ok: false, error: 'These lengths cannot make a closed shape. Re-check the tape numbers.' };
      warnings.push('No diagonal: corner angles were estimated from GPS. Add the A–C diagonal for an exact shape.');
    }
    const worst = Math.max.apply(null, best.residuals);
    if (worst > 8) warnings.push('A brick is ' + worst.toFixed(1) + ' m away from where the tape says it should be. Check the corner order (A→B→C→D around the plot) or re-capture that brick.');
    return { ok: true, method: best.method, fitted: best.pts.map(f.toLL), residuals: best.residuals,
      rms: best.rms, area: polygonArea(best.pts), warnings };
  }

  const api = { makeFrame, polygonArea, areaLatLng, sideLengthsLatLng, fitPlot, rigidFit, shapeWithDiagonal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KGeo = api;
})(this);

// Tests for the KODH plot-fitting geometry.
const G = require('./geo.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// A true plot: 20 x 30 m slightly skewed, rotated 25°, near Jijiga.
const lat0 = 9.35, lng0 = 42.795, k = Math.cos(lat0 * Math.PI / 180);
const toLL = (x, y) => [lat0 + y / 110540, lng0 + x / (111320 * k)];
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const trueXY = [[0, 0], [20, 0], [21.5, 30], [-0.5, 29]].map(p => rot(p, 0.44)).map(p => [p[0] + 40, p[1] - 15]);
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sides = { AB: d(trueXY[0], trueXY[1]), BC: d(trueXY[1], trueXY[2]), CD: d(trueXY[2], trueXY[3]), DA: d(trueXY[3], trueXY[0]), AC: d(trueXY[0], trueXY[2]) };
const trueArea = G.polygonArea(trueXY);

// seeded noise
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const noisy = trueXY.map(p => toLL(p[0] + 3 * gauss(), p[1] + 3 * gauss()));

// 1. with diagonal: exact sizes
let r = G.fitPlot(noisy, sides);
ok(r.ok && r.method === 'tape+diagonal', 'fit with diagonal works');
const fl = G.sideLengthsLatLng(r.fitted);
ok(Math.abs(fl[0] - sides.AB) < 0.05 && Math.abs(fl[1] - sides.BC) < 0.05 && Math.abs(fl[2] - sides.CD) < 0.05 && Math.abs(fl[3] - sides.DA) < 0.05, 'fitted side lengths equal tape: ' + fl.map(x => x.toFixed(2)).join(', '));
ok(Math.abs(r.area - trueArea) < 0.5, 'area exact: ' + r.area.toFixed(1) + ' vs ' + trueArea.toFixed(1));
const truthLL = trueXY.map(p => toLL(p[0], p[1]));
const fr = G.makeFrame(truthLL);
const posErr = r.fitted.map((p, i) => d(fr.toXY(p), fr.toXY(truthLL[i])));
ok(Math.max(...posErr) < 6, 'position error with 3 m GPS noise: max ' + Math.max(...posErr).toFixed(2) + ' m');

// 2. without diagonal
const s2 = Object.assign({}, sides); delete s2.AC;
r = G.fitPlot(noisy, s2);
const fl2 = G.sideLengthsLatLng(r.fitted);
ok(r.ok && Math.abs(fl2[0] - sides.AB) < 0.1 && Math.abs(fl2[2] - sides.CD) < 0.1, 'fit without diagonal keeps tape sides');
ok(Math.abs(r.area - trueArea) / trueArea < 0.06, 'area without diagonal within 6%: ' + r.area.toFixed(1));

// 3. clockwise corner order also works (mirror)
const rev = [noisy[0], noisy[3], noisy[2], noisy[1]];
r = G.fitPlot(rev, { AB: sides.DA, BC: sides.CD, CD: sides.BC, DA: sides.AB, AC: sides.AC });
ok(r.ok && r.rms < 5, 'clockwise walking order fits, rms ' + r.rms.toFixed(2));

// 4. impossible lengths rejected
r = G.fitPlot(noisy, { AB: 5, BC: 5, CD: 5, DA: 5, AC: 40 });
ok(!r.ok, 'impossible lengths rejected');

// 5. wrong order gives warning
const wrong = [noisy[0], noisy[2], noisy[1], noisy[3]];
r = G.fitPlot(wrong, sides);
ok(r.ok && r.warnings.some(w => /order/.test(w)), 'wrong corner order warns');

process.exit(fails ? 1 : 0);

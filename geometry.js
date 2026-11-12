/* Geometry construction tools (GeoGebra-style).
 * Every construction is a dependent object: it stores references to its parents and is
 * re-computed each frame, so dragging a free point updates everything built on it. */
window.WBGeo = function (env) {
'use strict';
const { objs, uid, CM } = env;
const GEO = '#0b3d91', TAU = Math.PI * 2, FAR = 1e5;
let cache = new Map(), idx = null;
const reset = () => { cache = new Map(); idx = null; };
const O = id => { if (!idx) idx = new Map(objs().map(o => [o.id, o])); return idx.get(id); };
const ev = o => {
  if (!o) return null; if (cache.has(o.id)) return cache.get(o.id);
  cache.set(o.id, null); let r = null; try { r = compute(o); } catch (e) { r = null; } cache.set(o.id, r); return r;
};
const P = id => ev(O(id));
const pp = id => { const r = P(id); return r && r.t === 'p' ? r : null; };
const nrm = a => ((a % TAU) + TAU) % TAU;
const mang = (a, b) => Math.atan2(-(b.y - a.y), b.x - a.x);          // maths angle (y up)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pt = (x, y) => ({ t: 'p', x, y });
const rot = (x, y, f) => [x * Math.cos(f) + y * Math.sin(f), -x * Math.sin(f) + y * Math.cos(f)];
const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const UNIT = env.unit == null ? ' cm' : env.unit, dp = env.dec || 2;
const cm = v => (v / CM).toFixed(dp);
const lineP = (a, b, mode = 'line') => (a.x === b.x && a.y === b.y) ? null : { t: 'l', mode, ax: a.x, ay: a.y, bx: b.x, by: b.y };

/* ───── intersections ───── */
function segsOf(r) {
  if (r.t === 'l') return [[r.ax, r.ay, r.bx, r.by, r.mode === 'vec' ? 'seg' : r.mode]];
  if (r.t === 'poly' || r.t === 'pl') {
    const q = r.pts, s = []; for (let i = 0; i < q.length - 1; i++) s.push([q[i].x, q[i].y, q[i + 1].x, q[i + 1].y, 'seg']);
    if (r.t === 'poly' && q.length > 2) s.push([q[q.length - 1].x, q[q.length - 1].y, q[0].x, q[0].y, 'seg']); return s;
  }
  return null;
}
const okT = (m, v) => m === 'line' || (m === 'ray' ? v >= -1e-9 : (v >= -1e-9 && v <= 1 + 1e-9));
function ll(s1, s2) {
  const [x1, y1, x2, y2, m1] = s1, [x3, y3, x4, y4, m2] = s2, d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return okT(m1, t) && okT(m2, u) ? pt(x1 + t * (x2 - x1), y1 + t * (y2 - y1)) : null;
}
const inArc = (c, p) => c.a0 == null || nrm(mang(c, p) - c.a0) <= c.a1 - c.a0 + 1e-9;
function lc(s, c) {
  const [ax, ay, bx, by, m] = s, dx = bx - ax, dy = by - ay, fx = ax - c.x, fy = ay - c.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r, D = B * B - 4 * A * C;
  if (D < 0) return []; const q = Math.sqrt(D), ts = D < 1e-9 ? [-B / (2 * A)] : [(-B - q) / (2 * A), (-B + q) / (2 * A)];
  return ts.filter(t => okT(m, t)).map(t => pt(ax + t * dx, ay + t * dy)).filter(p => inArc(c, p));
}
function cc(c1, c2) {
  const d = dist(c1, c2); if (d < 1e-9 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d, mx = c1.x + a * ux, my = c1.y + a * uy;
  return [pt(mx + h * uy, my - h * ux), pt(mx - h * uy, my + h * ux)].filter(p => inArc(c1, p) && inArc(c2, p));
}
function intersect(A, B) {
  const sa = segsOf(A), sb = segsOf(B), out = [];
  if (sa && sb) { for (const x of sa) for (const y of sb) { const p = ll(x, y); if (p) out.push(p); } return out; }
  if (sa && B.t === 'c') return sa.flatMap(s => lc(s, B));
  if (sb && A.t === 'c') return sb.flatMap(s => lc(s, A));
  if (A.t === 'c' && B.t === 'c') return cc(A, B);
  return out;
}

/* ───── evaluation ───── */
function xform(o) {
  const a = pp(o.refs[0]); if (!a) return null;
  const aux = o.refs[1] && P(o.refs[1]), n = o.num;
  switch (o.xf) {
    case 'reflLine': { if (!aux || aux.t !== 'l') return null; const dx = aux.bx - aux.ax, dy = aux.by - aux.ay, l2 = dx * dx + dy * dy, t = ((a.x - aux.ax) * dx + (a.y - aux.ay) * dy) / l2, fx = aux.ax + t * dx, fy = aux.ay + t * dy; return pt(2 * fx - a.x, 2 * fy - a.y); }
    case 'reflPt': if (!aux || aux.t !== 'p') return null; return pt(2 * aux.x - a.x, 2 * aux.y - a.y);
    case 'inv': { if (!aux || aux.t !== 'c') return null; const dx = a.x - aux.x, dy = a.y - aux.y, d2 = dx * dx + dy * dy; if (d2 < 1e-9) return null; const k = aux.r * aux.r / d2; return pt(aux.x + dx * k, aux.y + dy * k); }
    case 'rot': { if (!aux || aux.t !== 'p') return null; const [x, y] = rot(a.x - aux.x, a.y - aux.y, n * Math.PI / 180); return pt(aux.x + x, aux.y + y); }
    case 'trans': if (!aux || aux.t !== 'l') return null; return pt(a.x + aux.bx - aux.ax, a.y + aux.by - aux.ay);
    case 'dil': if (!aux || aux.t !== 'p') return null; return pt(aux.x + (a.x - aux.x) * n, aux.y + (a.y - aux.y) * n);
  }
  return null;
}
function circum(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)); if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}
function perimeter(r) { const q = r.pts; let s = 0; for (let i = 0; i < q.length - 1; i++) s += dist(q[i], q[i + 1]); if (r.t === 'poly') s += dist(q[q.length - 1], q[0]); return s; }
function area(r) { let s = 0; const q = r.pts; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
const ptsOf = o => o.refs.map(pp);
function compute(o) {
  const R = o.refs || [];
  switch (o.kind) {
    case 'pt': return pt(o.x, o.y);
    case 'ptOn': {
      const r = P(R[0]); if (!r) return null;
      if (r.t === 'l') { let t = o.t; if (r.mode === 'seg' || r.mode === 'vec') t = Math.min(1, Math.max(0, t)); else if (r.mode === 'ray') t = Math.max(0, t); return pt(r.ax + t * (r.bx - r.ax), r.ay + t * (r.by - r.ay)); }
      if (r.t === 'c') return pt(r.x + r.r * Math.cos(o.th), r.y - r.r * Math.sin(o.th));
      return null;
    }
    case 'mid': {
      if (R.length === 2) { const a = pp(R[0]), b = pp(R[1]); return a && b ? pt((a.x + b.x) / 2, (a.y + b.y) / 2) : null; }
      const r = P(R[0]); if (!r) return null; if (r.t === 'l') return pt((r.ax + r.bx) / 2, (r.ay + r.by) / 2); if (r.t === 'c') return pt(r.x, r.y); return null;
    }
    case 'inter': { const A = P(R[0]), B = P(R[1]); if (!A || !B) return null; const p = intersect(A, B)[o.i]; return p || null; }
    case 'polar': { const a = pp(R[0]); return a ? pt(a.x + o.r * Math.cos(o.th), a.y - o.r * Math.sin(o.th)) : null; }
    case 'ptX': return xform(o);
    case 'regv': {
      const a = pp(R[0]), b = pp(R[1]); if (!a || !b) return null; const th = TAU / o.n; let x = a.x, y = a.y;
      for (let j = 0; j < o.k; j++) { const [dx, dy] = rot(b.x - a.x, b.y - a.y, j * th); x += dx; y += dy; } return pt(x, y);
    }
    case 'line': case 'seg': case 'ray': case 'vec': { const a = pp(R[0]), b = pp(R[1]); return a && b ? lineP(a, b, o.kind) : null; }
    case 'perp': case 'par': { const p = pp(R[0]), L = P(R[1]); if (!p || !L || L.t !== 'l') return null; const dx = L.bx - L.ax, dy = L.by - L.ay; return lineP(p, pt(p.x + (o.kind === 'perp' ? -dy : dx), p.y + (o.kind === 'perp' ? dx : dy))); }
    case 'perpBis': {
      let a, b; if (R.length === 1) { const s = P(R[0]); if (!s || s.t !== 'l') return null; a = pt(s.ax, s.ay); b = pt(s.bx, s.by); } else { a = pp(R[0]); b = pp(R[1]); }
      if (!a || !b) return null; const m = pt((a.x + b.x) / 2, (a.y + b.y) / 2); return lineP(m, pt(m.x - (b.y - a.y), m.y + (b.x - a.x)));
    }
    case 'angBis': {
      const [a, b, c] = ptsOf(o); if (!a || !b || !c) return null; const u = unit(a.x - b.x, a.y - b.y), v = unit(c.x - b.x, c.y - b.y);
      let wx = u[0] + v[0], wy = u[1] + v[1]; if (Math.hypot(wx, wy) < 1e-6) { wx = -u[1]; wy = u[0]; } return lineP(b, pt(b.x + wx, b.y + wy));
    }
    case 'tan': {
      const p = pp(R[0]), c = P(R[1]); if (!p || !c || c.t !== 'c') return null; const d = dist(p, c);
      if (Math.abs(d - c.r) < 1e-6) { if (o.i) return null; return lineP(p, pt(p.x - (p.y - c.y), p.y + (p.x - c.x))); }
      if (d < c.r) return null; const al = Math.asin(c.r / d) * (o.i ? -1 : 1), u = unit(c.x - p.x, c.y - p.y);
      return lineP(p, pt(p.x + u[0] * Math.cos(al) - u[1] * Math.sin(al), p.y + u[0] * Math.sin(al) + u[1] * Math.cos(al)));
    }
    case 'poly': case 'polyline': { const q = ptsOf(o); if (q.some(x => !x)) return null; return { t: o.kind === 'poly' ? 'poly' : 'pl', pts: q }; }
    case 'circ2': { const c = pp(R[0]), q = pp(R[1]); return c && q ? { t: 'c', x: c.x, y: c.y, r: dist(c, q) } : null; }
    case 'circR': { const c = pp(R[0]); return c ? { t: 'c', x: c.x, y: c.y, r: o.r } : null; }
    case 'circR2': {
      const f = P(R[0]); if (!f) return null;
      if (f.t === 'l') { const c = pp(R[1]); return c ? { t: 'c', x: c.x, y: c.y, r: Math.hypot(f.bx - f.ax, f.by - f.ay) } : null; }
      const b = pp(R[1]), c = pp(R[2]); return f.t === 'p' && b && c ? { t: 'c', x: c.x, y: c.y, r: dist(f, b) } : null;
    }
    case 'circ3': { const [a, b, c] = ptsOf(o); if (!a || !b || !c) return null; const k = circum(a, b, c); return k && { t: 'c', ...k }; }
    case 'semi': { const a = pp(R[0]), b = pp(R[1]); if (!a || !b) return null; const m = pt((a.x + b.x) / 2, (a.y + b.y) / 2), a0 = mang(m, a); return { t: 'c', x: m.x, y: m.y, r: dist(a, b) / 2, a0, a1: a0 + Math.PI }; }
    case 'arc': case 'sector': {
      const [c, s, e] = ptsOf(o); if (!c || !s || !e) return null; const a0 = mang(c, s), sw = nrm(mang(c, e) - a0);
      return { t: 'c', x: c.x, y: c.y, r: dist(c, s), a0, a1: a0 + (sw < 1e-9 ? 1e-6 : sw), sector: o.kind === 'sector' };
    }
    case 'arc3': case 'sector3': {
      const [a, b, c] = ptsOf(o); if (!a || !b || !c) return null; const k = circum(a, b, c); if (!k) return null;
      const aA = mang(k, a), aB = mang(k, b), aC = mang(k, c), dB = nrm(aB - aA), dC = nrm(aC - aA);
      const a0 = dB < dC ? aA : aC, a1 = dB < dC ? aA + dC : aC + nrm(aA - aC);
      return { t: 'c', ...k, a0, a1, sector: o.kind === 'sector3' };
    }
    case 'ellipse': case 'hyper': {
      const [f1, f2, q] = ptsOf(o); if (!f1 || !f2 || !q) return null; const d1 = dist(q, f1), d2 = dist(q, f2), c = dist(f1, f2) / 2, rt = Math.atan2(f2.y - f1.y, f2.x - f1.x);
      const m = pt((f1.x + f2.x) / 2, (f1.y + f2.y) / 2);
      if (o.kind === 'ellipse') { const a = (d1 + d2) / 2; return a > c + 1e-6 ? { t: 'cn', k: 'e', x: m.x, y: m.y, a, b: Math.sqrt(a * a - c * c), rt } : null; }
      const a = Math.abs(d1 - d2) / 2; return a > 1e-6 && a < c - 1e-6 ? { t: 'cn', k: 'h', x: m.x, y: m.y, a, b: Math.sqrt(c * c - a * a), rt } : null;
    }
    case 'parab': {
      const f = pp(R[0]), L = P(R[1]); if (!f || !L || L.t !== 'l') return null; const [ux, uy] = unit(L.bx - L.ax, L.by - L.ay);
      let nx = -uy, ny = ux; const s = (f.x - L.ax) * nx + (f.y - L.ay) * ny; if (Math.abs(s) < 1e-6) return null; if (s < 0) { nx = -nx; ny = -ny; }
      const p = Math.abs(s); return { t: 'cn', k: 'p', x: f.x - nx * p / 2, y: f.y - ny * p / 2, ux, uy, nx, ny, p };
    }
    case 'angle': {
      const [a, b, c] = ptsOf(o); if (!a || !b || !c) return null; const a0 = mang(b, a), sw = nrm(mang(b, c) - a0);
      return { t: 'ang', x: b.x, y: b.y, a0, a1: a0 + sw, deg: sw * 180 / Math.PI };
    }
    case 'angle2': {
      const A = P(R[0]), B = P(R[1]); if (!A || !B || A.t !== 'l' || B.t !== 'l') return null; const v = ll([A.ax, A.ay, A.bx, A.by, 'line'], [B.ax, B.ay, B.bx, B.by, 'line']); if (!v) return null;
      const a0 = Math.atan2(-(A.by - A.ay), A.bx - A.ax), sw = nrm(Math.atan2(-(B.by - B.ay), B.bx - B.ax) - a0); return { t: 'ang', x: v.x, y: v.y, a0, a1: a0 + sw, deg: sw * 180 / Math.PI };
    }
    case 'meas': {
      const beside = (ax, ay, bx, by) => { const L = Math.hypot(bx - ax, by - ay) || 1; let nx = -(by - ay) / L, ny = (bx - ax) / L; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } const k = 20 / env.z(); return [(ax + bx) / 2 + nx * k, (ay + by) / 2 + ny * k]; };
      const r = R.map(P); if (r.some(x => !x)) return null; let v, x, y, txt;
      if (o.mt === 'dist') {
        const [A, B] = r;
        if (A.t === 'p' && B && B.t === 'p') { v = dist(A, B); [x, y] = beside(A.x, A.y, B.x, B.y); }
        else if (A.t === 'l') { v = Math.hypot(A.bx - A.ax, A.by - A.ay); [x, y] = beside(A.ax, A.ay, A.bx, A.by); }
        else if (A.t === 'c') { v = TAU * A.r * (A.a0 == null ? 1 : (A.a1 - A.a0) / TAU); x = A.x; y = A.y - A.r - 12; }
        else if (A.t === 'poly' || A.t === 'pl') { v = perimeter(A); x = A.pts[0].x; y = A.pts[0].y - 14; } else return null;
        txt = `${o.name} = ${cm(v)}${UNIT}`;
      } else if (o.mt === 'area') {
        const A = r[0]; if (A.t === 'poly') { v = area(A); x = A.pts.reduce((s, q) => s + q.x, 0) / A.pts.length; y = A.pts.reduce((s, q) => s + q.y, 0) / A.pts.length; }
        else if (A.t === 'c') { v = Math.PI * A.r * A.r; x = A.x; y = A.y; } else return null;
        txt = `${o.name} = ${(v / CM / CM).toFixed(dp)}${UNIT ? UNIT + '²' : ''}`;
      } else {
        const A = r[0]; if (A.t !== 'l') return null; const dx = A.bx - A.ax; [x, y] = beside(A.ax, A.ay, A.bx, A.by);
        txt = Math.abs(dx) < 1e-9 ? `${o.name} = undefined` : `${o.name} = ${(-(A.by - A.ay) / dx).toFixed(2)}`;
      }
      return { t: 'txt', x: x + (o.ox || 0), y: y + (o.oy || 0), text: txt };
    }
  }
  return null;
}

/* ───── geometry of drawn curves ───── */
function conicLines(r) {
  const out = [], push = (ax, ay, f) => { const [x, y] = rot(ax, ay, -f); return [r.x + x, r.y + y]; };
  void push;
  const R2 = (lx, ly) => { const c = Math.cos(r.rt), s = Math.sin(r.rt); return [r.x + lx * c - ly * s, r.y + lx * s + ly * c]; };
  if (r.k === 'e') { const l = []; for (let i = 0; i <= 120; i++) { const t = i / 120 * TAU; l.push(R2(r.a * Math.cos(t), r.b * Math.sin(t))); } out.push(l); }
  else if (r.k === 'h') for (const sg of [1, -1]) { const l = []; for (let i = -60; i <= 60; i++) { const t = i / 60 * 4; l.push(R2(sg * r.a * Math.cosh(t), r.b * Math.sinh(t))); } out.push(l); }
  else { const l = []; for (let i = -150; i <= 150; i++) { const t = i / 150 * 2500; l.push([r.x + t * r.ux + (t * t / (2 * r.p)) * r.nx, r.y + t * r.uy + (t * t / (2 * r.p)) * r.ny]); } out.push(l); }
  return out;
}
const extent = r => {                             // visible endpoints of a line-like prim
  const [ux, uy] = unit(r.bx - r.ax, r.by - r.ay);
  if (r.mode === 'line') return [r.ax - ux * FAR, r.ay - uy * FAR, r.ax + ux * FAR, r.ay + uy * FAR];
  if (r.mode === 'ray') return [r.ax, r.ay, r.ax + ux * FAR, r.ay + uy * FAR];
  return [r.ax, r.ay, r.bx, r.by];
};
function inPolyG(p, q) { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { if ((q[i].y > p.y) !== (q[j].y > p.y) && p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x) c = !c; } return c; }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function hit(o, p, tol) {
  const r = ev(o); if (!r) return false; const z = env.z();
  switch (r.t) {
    case 'p': return Math.hypot(p.x - r.x, p.y - r.y) <= tol + 4 / z;
    case 'l': { const e = extent(r); return segDist(p.x, p.y, e[0], e[1], e[2], e[3]) <= tol; }
    case 'c': { const d = dist(p, r); if (r.sector && d < r.r && inArc(r, p)) return true; return Math.abs(d - r.r) <= tol && inArc(r, p); }
    case 'poly': case 'pl': if (r.t === 'poly' && inPolyG(p, r.pts)) return true; return (segsOf(r) || []).some(s => segDist(p.x, p.y, s[0], s[1], s[2], s[3]) <= tol);
    case 'cn': return conicLines(r).some(l => { for (let i = 0; i < l.length - 1; i++) if (segDist(p.x, p.y, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]) <= tol) return true; return false; });
    case 'txt': return Math.abs(p.x - r.x) < 50 / z && Math.abs(p.y - r.y) < 10 / z;
    case 'ang': { const m = (r.a0 + r.a1) / 2; return Math.abs(p.x - (r.x + 46 / z * Math.cos(m) + (o.ox || 0))) < 26 / z && Math.abs(p.y - (r.y - 46 / z * Math.sin(m) + (o.oy || 0))) < 11 / z; }
  }
  return false;
}
function gbox(o) {
  const r = ev(o); if (!r) return { x: 0, y: 0, w: 0, h: 0 };
  const bb = pts => { const xs = pts.map(q => q.x ?? q[0]), ys = pts.map(q => q.y ?? q[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
  switch (r.t) {
    case 'p': case 'ang': return { x: r.x, y: r.y, w: 0, h: 0 };
    case 'txt': return { x: r.x - 40, y: r.y - 8, w: 80, h: 16 };
    case 'l': return bb([[r.ax, r.ay], [r.bx, r.by]]);
    case 'c': return { x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r };
    case 'poly': case 'pl': return bb(r.pts);
    case 'cn': return bb(conicLines(r)[0].filter((_, i, a) => i % 6 === 0).slice(0, 40));
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

/* ───── drawing ───── */
function draw(c, o, z, f) {
  const r = ev(o); if (!r) return; if (o.hidden && !f.ghost) return;
  const col = o.color || GEO, lw = 2 / z; c.save();
  if (o.hidden) c.globalAlpha = .28;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
  const halo = () => { if (f.sel) { c.save(); c.strokeStyle = 'rgba(30,136,229,.4)'; c.lineWidth = 9 / z; c.stroke(); c.restore(); } };
  const label = (x, y, extra) => {
    if (!o.lbl && !(extra && f.sel)) return;
    const txt = (o.lbl ? o.name : '') + (extra && f.sel ? (o.lbl ? '  ' : '') + extra : '');
    c.save(); c.font = `700 ${14 / z}px Quicksand,sans-serif`; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.lineJoin = 'round';
    c.lineWidth = 4 / z; c.strokeStyle = 'rgba(255,255,255,.92)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); c.restore();
  };
  switch (r.t) {
    case 'p': {
      const R0 = 5.5 / z;
      if (f.sel || f.hover) { c.beginPath(); c.arc(r.x, r.y, 13 / z, 0, TAU); c.fillStyle = f.sel ? 'rgba(30,136,229,.28)' : 'rgba(0,4,85,.12)'; c.fill(); }
      c.save(); c.shadowColor = 'rgba(0,0,40,.35)'; c.shadowBlur = 5; c.shadowOffsetY = 1;
      c.beginPath(); c.arc(r.x, r.y, R0 + 2 / z, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.restore();
      c.beginPath(); c.arc(r.x, r.y, R0, 0, TAU); c.fillStyle = col; c.fill();
      c.beginPath(); c.arc(r.x - R0 * .28, r.y - R0 * .3, R0 * .32, 0, TAU); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
      label(r.x + 10 / z, r.y - 10 / z, env.coords ? env.coords(r) : null); break;
    }
    case 'l': {
      const e = extent(r); c.beginPath(); c.moveTo(e[0], e[1]); c.lineTo(e[2], e[3]); halo(); c.stroke();
      if (r.mode === 'vec') { const a = Math.atan2(r.by - r.ay, r.bx - r.ax), L = 14 / z; c.beginPath(); c.moveTo(r.bx, r.by); c.lineTo(r.bx - L * Math.cos(a - .4), r.by - L * Math.sin(a - .4)); c.lineTo(r.bx - L * Math.cos(a + .4), r.by - L * Math.sin(a + .4)); c.closePath(); c.fill(); }
      label((r.ax + r.bx) / 2 + 6 / z, (r.ay + r.by) / 2 - 6 / z); break;
    }
    case 'c': {
      c.beginPath();
      if (r.a0 == null) c.arc(r.x, r.y, r.r, 0, TAU);
      else { if (r.sector) { c.moveTo(r.x, r.y); c.lineTo(r.x + r.r * Math.cos(r.a0), r.y - r.r * Math.sin(r.a0)); } c.arc(r.x, r.y, r.r, -r.a0, -r.a1, true); if (r.sector) c.closePath(); }
      if (r.sector) { c.save(); c.fillStyle = 'rgba(11,61,145,.1)'; c.fill(); c.restore(); }
      halo(); c.stroke(); label(r.x, r.y - r.r - 6 / z); break;
    }
    case 'poly': case 'pl': {
      c.beginPath(); r.pts.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); if (r.t === 'poly') { c.closePath(); c.save(); c.fillStyle = 'rgba(11,61,145,.1)'; c.fill(); c.restore(); }
      halo(); c.stroke(); break;
    }
    case 'cn': { for (const l of conicLines(r)) { c.beginPath(); l.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); halo(); c.stroke(); } break; }
    case 'ang': {
      const rad = 28 / z; c.beginPath(); c.moveTo(r.x, r.y); c.arc(r.x, r.y, rad, -r.a0, -r.a1, true); c.closePath(); c.save(); c.fillStyle = 'rgba(220,60,60,.18)'; c.fill(); c.restore();
      c.lineWidth = 1.5 / z; c.stroke(); const m = (r.a0 + r.a1) / 2;
      c.font = `${14 / z}px Quicksand,sans-serif`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(r.deg.toFixed(1) + '°', r.x + 46 / z * Math.cos(m) + (o.ox || 0), r.y - 46 / z * Math.sin(m) + (o.oy || 0)); break;
    }
    case 'txt': {
      c.font = `${15 / z}px Quicksand,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; const w = c.measureText(r.text).width + 10 / z;
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(r.x - w / 2, r.y - 10 / z, w, 20 / z);
      if (f.sel) { c.strokeStyle = '#1e88e5'; c.lineWidth = 1 / z; c.strokeRect(r.x - w / 2, r.y - 10 / z, w, 20 / z); }
      c.fillStyle = col; c.fillText(r.text, r.x, r.y); break;
    }
  }
  c.restore();
}

/* ───── editing helpers ───── */
function collectFree(o, s, seen = new Set()) {
  if (!o || seen.has(o.id)) return; seen.add(o.id);
  if (o.kind === 'pt') { s.add(o.id); return; } if (o.kind === 'ptOn') return;
  (o.refs || []).forEach(r => collectFree(O(r), s, seen));
}
function reparam(o, p) {
  const r = P(o.refs[0]); if (!r) return;
  if (r.t === 'l') o.t = ((p.x - r.ax) * (r.bx - r.ax) + (p.y - r.ay) * (r.by - r.ay)) / ((r.bx - r.ax) ** 2 + (r.by - r.ay) ** 2);
  else if (r.t === 'c') o.th = mang(r, p);
}
function moveMany(list, dx, dy, mv, p) {
  const free = new Set();
  for (const o of list) {
    if (o.type !== 'geo') { mv(o, dx, dy); continue; }
    if (o.kind === 'ptOn') { if (list.length === 1 && p) reparam(o, p); continue; }
    if (o.kind === 'meas' || o.kind === 'angle' || o.kind === 'angle2') { o.ox = (o.ox || 0) + dx; o.oy = (o.oy || 0) + dy; continue; }   // a measurement moves on its own
    collectFree(o, free);
  }
  for (const id of free) { const q = O(id); if (q) { q.x += dx; q.y += dy; } }
}
function withDependents(ids) {
  const out = new Set(ids); let ch = true;
  while (ch) { ch = false; for (const o of objs()) if (o.type === 'geo' && !out.has(o.id) && (o.refs || []).some(r => out.has(r))) { out.add(o.id); ch = true; } }
  return out;
}
const isPoint = o => o.type === 'geo' && !!ev(o) && ev(o).t === 'p';


/* ───── tool icons (24×24, drawn in currentColor) ───── */
const ICON_BODY = (() => {
  const D = (x, y, r = 1.9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#3b5bff" stroke="none"/>`;
  const H = (x, y, r = 2.1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`;
  const T = (x, y, s, t) => `<text x="${x}" y="${y}" font-family="Quicksand,Arial,sans-serif" font-size="${s}" font-weight="700" fill="currentColor" stroke="none">${t}</text>`;
  const AH = (x, y, a) => `<path d="M${x} ${y}l${(-5.5 * Math.cos(a - .45)).toFixed(2)} ${(-5.5 * Math.sin(a - .45)).toFixed(2)}M${x} ${y}l${(-5.5 * Math.cos(a + .45)).toFixed(2)} ${(-5.5 * Math.sin(a + .45)).toFixed(2)}"/>`;
  const F = 'fill="#3b5bff" fill-opacity=".22"';
  return {
    '': `<path d="M6 3.5v15.2l4-3.7 2.6 5.4 2.4-1.2-2.6-5.2 5.4-.2z" fill="currentColor" fill-opacity=".18"/>`,
    showHide: `<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${D(12, 12, 1.2)}`,
    showLabel: `<path d="M5 20L12 4l7 16M7.8 14.5h8.4"/>`,
    delete: `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>`,
    point: `<circle cx="12" cy="12" r="6" stroke-opacity=".35"/>${D(12, 12, 3.2)}`,
    pointOn: `<path d="M3 19L21 5"/><circle cx="12" cy="12" r="3.2" fill="#fff"/>${D(12, 12, 1.8)}`,
    intersect: `<path d="M3 5l18 14M3 19L21 5"/>${H(12, 12, 2.7)}<circle cx="12" cy="12" r="2.7"/>`,
    midpoint: `<path d="M4 18L20 6"/>${D(4, 18, 2)}${D(20, 6, 2)}<circle cx="12" cy="12" r="3" fill="#fff"/>${D(12, 12, 1.5)}`,
    line: `<path d="M2.5 19.5L21.5 4.5"/>${D(8, 15)}${D(16, 9)}`,
    segment: `<path d="M5 18L19 6"/>${D(5, 18, 2.2)}${D(19, 6, 2.2)}`,
    segLen: `<path d="M4 17L15 8"/>${D(4, 17)}${D(15, 8)}${T(16, 21, 10, '3')}`,
    ray: `<path d="M5 18L20 5.5"/>${AH(20.5, 5.1, -.7)}${D(5, 18, 2.2)}`,
    polyline: `<path d="M3.5 17l6-9 5.5 7 5.5-9"/>${D(3.5, 17)}${D(9.5, 8)}${D(15, 15)}${D(20.5, 6)}`,
    vector: `<path d="M4 19L19 6"/><path d="M20.5 4.8l-6.2.9 4.2 4.5z" fill="currentColor"/>`,
    vecFrom: `<path d="M7 17L19 7"/><path d="M20.5 5.8l-5.6.6 3.6 4z" fill="currentColor"/>${D(7, 17, 2.4)}<path d="M3 21l2-2" stroke-dasharray="1.6 2"/>`,
    perp: `<path d="M3 19h18M12 3.5V19M12 14.5h4.5V19"/>`,
    par: `<path d="M3 9.5L19 3M5 21L21 14.5"/><path d="M9.5 6.2l1.6-.7M13 18.6l1.6-.7" stroke-width="1.2"/>`,
    perpBis: `<path d="M3 18h18M12 3v18"/><path d="M12 14.5h3.5V18" stroke-width="1.3"/>${D(5, 18, 1.8)}${D(19, 18, 1.8)}`,
    angBis: `<path d="M4 20h17M4 20L15 4"/><path d="M4 20L21 10" stroke-dasharray="2.4 2.2"/><path d="M10 20a6.5 6.5 0 0 0-1.2-3.6" stroke-width="1.3"/>`,
    tangent: `<circle cx="12" cy="14" r="6"/><path d="M2 8h20"/>${D(12, 8, 2.1)}`,
    polygon: `<path d="M4.5 17.5l2.5-11 11 2.5 1.5 8.5z" ${F}/>${D(4.5, 17.5)}${D(7, 6.5)}${D(18, 9)}${D(19.5, 17.5)}`,
    regPoly: `<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" ${F}/>${D(12, 3, 1.7)}${D(19.8, 7.5, 1.7)}`,
    circ2: `<circle cx="11" cy="12" r="8"/>${D(11, 12)}${D(19, 12)}`,
    circR: `<circle cx="11" cy="13" r="7.5"/>${D(11, 13, 1.9)}<path d="M11 13h7.5" stroke-dasharray="1.8 1.8"/>${T(14.5, 8, 8, 'r')}`,
    compassC: `<path d="M12 3.5v3.5M12 7L7 21M12 7l5 14M9.2 16h5.6"/><circle cx="12" cy="4.3" r="1.6" fill="currentColor"/>`,
    circ3: `<circle cx="12" cy="12" r="8.5"/>${D(12, 3.5)}${D(19.4, 16.2)}${D(4.6, 16.2)}`,
    semi: `<path d="M3.5 16a8.5 8.5 0 0 1 17 0z" ${F}/>${D(3.5, 16)}${D(20.5, 16)}`,
    arc: `<path d="M4 18A9.5 9.5 0 0 1 20 18"/>${D(12, 12.5, 1.8)}${D(4, 18, 1.8)}${D(20, 18, 1.8)}`,
    sector: `<path d="M12 19L4.5 9a9.5 9.5 0 0 1 15 0z" ${F}/>${D(12, 19)}`,
    arc3: `<path d="M3.5 18A9.5 9.5 0 0 1 20.5 18"/>${D(3.5, 18, 1.9)}${D(12, 8.6, 1.9)}${D(20.5, 18, 1.9)}`,
    sector3: `<path d="M12 19L4.5 9a9.5 9.5 0 0 1 15 0z" ${F}/>${D(4.5, 9)}${D(12, 3.7)}${D(19.5, 9)}`,
    ellipse: `<ellipse cx="12" cy="12" rx="9.5" ry="6"/>${D(8, 12, 1.7)}${D(16, 12, 1.7)}`,
    hyper: `<path d="M3.5 4c2.5 4 2.5 12 0 16M20.5 4c-2.5 4-2.5 12 0 16"/>${D(9.5, 12, 1.7)}${D(14.5, 12, 1.7)}`,
    parab: `<path d="M4.5 3.5C7 16 10 20.5 12 20.5S17 16 19.5 3.5"/>${D(12, 12, 1.8)}<path d="M3 3h18" stroke-dasharray="1.8 2" stroke-width="1.2"/>`,
    angle: `<path d="M4 20h16M4 20L16 5"/><path d="M11 20a7 7 0 0 0-2.2-5.1" />${D(4, 20, 1.7)}`,
    angleSize: `<path d="M3 20h11M3 20L11 6"/><path d="M8 20a5 5 0 0 0-1.2-3.4"/>${T(11.5, 14, 7, '45°')}`,
    dist: `<path d="M5 19L19 5"/>${D(5, 19, 2)}${D(19, 5, 2)}${T(4, 8.5, 9, 'd')}`,
    area: `<path d="M4 18l3-12 12 3 1.5 9z" fill="currentColor" fill-opacity=".28"/>${T(8.5, 15, 8, 'A')}`,
    slope: `<path d="M3 20L20 5"/><path d="M9 15.8h9V7.8" stroke-dasharray="1.8 2" stroke-width="1.3"/>${T(5, 10, 8.5, 'm')}`,
    reflLine: `<path d="M12 2v20" stroke-dasharray="2.4 2.4" stroke-width="1.3"/><path d="M3 18l1.5-9 5.5 5z" ${F}/><path d="M21 18l-1.5-9-5.5 5z" ${F} stroke-opacity=".55"/>`,
    reflPt: `<path d="M12 2v20" stroke-dasharray="2.4 2.4" stroke-width="1.3"/>${D(5, 12, 2.2)}${D(19, 12, 2.2)}<path d="M7.5 12h9" stroke-width="1"/>`,
    inv: `<circle cx="9" cy="12" r="6"/>${D(9, 12, 1.4)}${D(13.5, 12, 1.8)}${D(20, 12, 1.8)}<path d="M9 12h11" stroke-width="1" stroke-dasharray="1 2"/>`,
    rotate: `<path d="M19 12a7 7 0 1 1-2.4-5.3"/><path d="M17.8 2.8l-.9 4.6 4.5-1z" fill="currentColor"/>${D(12, 12, 1.9)}`,
    translate: `<rect x="3" y="13" width="6.5" height="6.5" ${F}/><rect x="14.5" y="4.5" width="6.5" height="6.5" stroke-dasharray="2 1.8"/><path d="M10.5 12.5l3-2.5M13.8 10.2l-.1-2.4M13.8 10.2l-2.4.2" stroke-width="1.4"/>`,
    dilate: `<path d="M5 19l3-5 3.5 5z" ${F}/><path d="M5 19l6-10 7 10z" stroke-dasharray="2 2"/>${D(5, 19, 1.8)}`,
  };
})();
const icon = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_BODY[id] != null ? ICON_BODY[id] : ICON_BODY.point}</svg>`;

/* ───── naming / creation ───── */
function nextName(kind) {
  const used = new Set(objs().filter(o => o.type === 'geo').map(o => o.name));
  const pts = ['pt', 'ptOn', 'mid', 'inter', 'polar', 'ptX', 'regv'].includes(kind);
  const pool = pts ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : kind === 'angle' || kind === 'angle2' ? 'αβγδεζηθικλμνξπρστφχψω' : kind === 'meas' ? 'dsvwxyzuabcefghijklmnopqrt' : 'fghijklmnopqrstuvwxyzabcde';
  for (let n = 0; n < 40; n++) for (const ch of pool) { const nm = ch + (n ? n : ''); if (!used.has(nm)) return nm; }
  return uid();
}
const mk = (kind, props = {}) => {
  const o = { id: uid(), type: 'geo', kind, ...props };
  o.name = nextName(kind); o.lbl = ['pt', 'ptOn', 'mid', 'inter', 'polar', 'ptX', 'regv'].includes(kind);
  objs().push(o); reset(); return o;       // added immediately so later names/refs resolve
};

/* ───── tool catalogue ───── */
const fx = (...ty) => refs => refs.length < ty.length ? ty[refs.length] : null;
const either = (a, b) => (refs, pr) => !refs.length ? [a, b] : refs.length === 1 ? (pr[0].t === (a === 'P' ? 'p' : 'x') ? b : a) : null;
const isPt = r => r && r.t === 'p';
const TX = (id, label, xf, auxType, num) => ({ id, cat: 'Transform', label, next: fx('X', auxType),
  num, make: (r, c) => transform(r[0], xf, r[1], c.num) });
function transform(id, xf, aux, num) {
  const o = O(id), pr = P(id); if (!o || !pr) return null;
  if (pr.t === 'p') return [mk('ptX', { refs: [id, aux], xf, num })];
  if (xf === 'inv') { env.toast('Inversion works on points only'); return null; }
  if (!o.refs || o.refs.some(r => !pp(r))) { env.toast("This object can't be transformed"); return null; }
  const map = {}, out = [];
  for (const r of new Set(o.refs)) { const n = mk('ptX', { refs: [r, aux], xf, num }); map[r] = n.id; out.push(n); }
  const props = { ...o, id: uid(), refs: o.refs.map(r => map[r]) }; delete props.name; delete props.hidden;
  if (o.kind === 'circR') { props.refs = [map[o.refs[0]]]; props.r = xf === 'dil' ? o.r * Math.abs(num) : o.r; }
  const n = mk(o.kind, props); n.color = o.color; out.push(n); return out;
}
const TOOLS = [
  { id: 'point', cat: 'Points', label: 'Point', next: fx('P'), make: () => [] },
  { id: 'pointOn', cat: 'Points', label: 'Point on object', next: fx('ON'), make: () => [] },
  { id: 'intersect', cat: 'Points', label: 'Intersect', next: fx('I', 'I'), make: r => { const n = intersect(P(r[0]), P(r[1])).length; if (!n) { env.toast('No intersection found'); return null; } return Array.from({ length: Math.min(n, 4) }, (_, i) => mk('inter', { refs: r, i })); } },
  { id: 'midpoint', cat: 'Points', label: 'Midpoint or centre', next: (refs, pr) => !refs.length ? 'M' : refs.length === 1 && pr[0].t === 'p' ? 'P' : null, make: r => [mk('mid', { refs: r })] },

  { id: 'line', cat: 'Lines', label: 'Line', next: fx('P', 'P'), make: r => [mk('line', { refs: r })] },
  { id: 'segment', cat: 'Lines', label: 'Segment', next: fx('P', 'P'), make: r => [mk('seg', { refs: r })] },
  { id: 'segLen', cat: 'Lines', label: 'Segment with length', next: fx('P'), num: { msg: 'Segment length' + UNIT.replace(' ', ' (') + (UNIT ? ')' : ''), def: 3 }, make: (r, c) => { const b = mk('polar', { refs: [r[0]], r: c.num * CM, th: 0 }); return [b, mk('seg', { refs: [r[0], b.id] })]; } },
  { id: 'ray', cat: 'Lines', label: 'Ray', next: fx('P', 'P'), make: r => [mk('ray', { refs: r })] },
  { id: 'polyline', cat: 'Lines', label: 'Polyline', next: () => 'P', open: true, minPts: 2, make: r => [mk('polyline', { refs: r })] },
  { id: 'vector', cat: 'Lines', label: 'Vector', next: fx('P', 'P'), make: r => [mk('vec', { refs: r })] },
  { id: 'vecFrom', cat: 'Lines', label: 'Vector from point', next: fx('V', 'P'), make: r => { const q = mk('ptX', { refs: [r[1], r[0]], xf: 'trans' }); return [q, mk('vec', { refs: [r[1], q.id] })]; } },

  { id: 'perp', cat: 'Special lines', label: 'Perpendicular line', next: either('P', 'L'), make: (r, c) => [mk('perp', { refs: c.pt(r[0]) ? r : [r[1], r[0]] })] },
  { id: 'par', cat: 'Special lines', label: 'Parallel line', next: either('P', 'L'), make: (r, c) => [mk('par', { refs: c.pt(r[0]) ? r : [r[1], r[0]] })] },
  { id: 'perpBis', cat: 'Special lines', label: 'Perpendicular bisector', next: (refs, pr) => !refs.length ? ['P', 'S'] : refs.length === 1 && pr[0].t === 'p' ? 'P' : null, make: r => [mk('perpBis', { refs: r })] },
  { id: 'angBis', cat: 'Special lines', label: 'Angle bisector', next: fx('P', 'P', 'P'), hint: ['first point', 'vertex', 'third point'], make: r => [mk('angBis', { refs: r })] },
  { id: 'tangent', cat: 'Special lines', label: 'Tangents', next: either('P', 'C'), make: (r, c) => { const x = c.pt(r[0]) ? r : [r[1], r[0]]; const a = [mk('tan', { refs: x, i: 0 })]; if (c.P(x[0]) && Math.abs(c.dist(c.P(x[0]), c.P(x[1])) - c.P(x[1]).r) > 1e-6) a.push(mk('tan', { refs: x, i: 1 })); return a; } },

  { id: 'polygon', cat: 'Polygons', label: 'Polygon', next: () => 'P', closeOnFirst: true, minPts: 3, make: r => [mk('poly', { refs: r })] },
  { id: 'regPoly', cat: 'Polygons', label: 'Regular polygon', next: fx('P', 'P'), num: { msg: 'Number of vertices', def: 5, int: true, min: 3 }, make: (r, c) => { const out = []; const ids = [r[0], r[1]]; for (let k = 2; k < c.num; k++) { const v = mk('regv', { refs: [r[0], r[1]], n: c.num, k }); out.push(v); ids.push(v.id); } out.push(mk('poly', { refs: ids })); return out; } },

  { id: 'circ2', cat: 'Circles & arcs', label: 'Circle: centre & point', next: fx('P', 'P'), hint: ['centre', 'a point on the circle'], make: r => [mk('circ2', { refs: r })] },
  { id: 'circR', cat: 'Circles & arcs', label: 'Circle: centre & radius', next: fx('P'), hint: ['centre'], num: { msg: 'Radius' + UNIT.replace(' ', ' (') + (UNIT ? ')' : ''), def: 2 }, make: (r, c) => [mk('circR', { refs: r, r: c.num * CM })] },
  { id: 'compassC', cat: 'Circles & arcs', label: 'Compass', next: (refs, pr) => !refs.length ? ['P', 'S'] : refs.length === 1 ? (pr[0].t === 'p' ? 'P' : 'P') : refs.length === 2 && pr[0].t === 'p' ? 'P' : null, hint: ['segment or first point', 'second point / centre', 'centre'], make: r => [mk('circR2', { refs: r })] },
  { id: 'circ3', cat: 'Circles & arcs', label: 'Circle through 3 points', next: fx('P', 'P', 'P'), make: r => [mk('circ3', { refs: r })] },
  { id: 'semi', cat: 'Circles & arcs', label: 'Semicircle', next: fx('P', 'P'), make: r => [mk('semi', { refs: r })] },
  { id: 'arc', cat: 'Circles & arcs', label: 'Arc: centre, start, end', next: fx('P', 'P', 'P'), hint: ['centre', 'start point', 'end point'], make: r => [mk('arc', { refs: r })] },
  { id: 'sector', cat: 'Circles & arcs', label: 'Sector: centre, start, end', next: fx('P', 'P', 'P'), hint: ['centre', 'start point', 'end point'], make: r => [mk('sector', { refs: r })] },
  { id: 'arc3', cat: 'Circles & arcs', label: 'Arc through 3 points', next: fx('P', 'P', 'P'), make: r => [mk('arc3', { refs: r })] },
  { id: 'sector3', cat: 'Circles & arcs', label: 'Sector through 3 points', next: fx('P', 'P', 'P'), make: r => [mk('sector3', { refs: r })] },

  { id: 'ellipse', cat: 'Conics', label: 'Ellipse', next: fx('P', 'P', 'P'), hint: ['focus 1', 'focus 2', 'point on ellipse'], make: r => [mk('ellipse', { refs: r })] },
  { id: 'hyper', cat: 'Conics', label: 'Hyperbola', next: fx('P', 'P', 'P'), hint: ['focus 1', 'focus 2', 'point on hyperbola'], make: r => [mk('hyper', { refs: r })] },
  { id: 'parab', cat: 'Conics', label: 'Parabola', next: fx('P', 'L'), hint: ['focus', 'directrix (a line)'], make: r => [mk('parab', { refs: r })] },

  { id: 'angle', cat: 'Measure', label: 'Angle', next: (refs, pr) => !refs.length ? ['P', 'L'] : pr[0].t === 'l' ? (refs.length === 1 ? 'L' : null) : refs.length < 3 ? 'P' : null, hint: ['first point (or a line)', 'vertex', 'third point'], make: r => [mk(P(r[0]).t === 'l' ? 'angle2' : 'angle', { refs: r })] },
  { id: 'angleSize', cat: 'Measure', label: 'Angle with given size', next: fx('P', 'P'), hint: ['start point', 'vertex'], num: { msg: 'Angle (degrees)', def: 45 }, make: (r, c) => { const a = mk('ptX', { refs: [r[0], r[1]], xf: 'rot', num: c.num }); return [a, mk('angle', { refs: [r[0], r[1], a.id] })]; } },
  { id: 'dist', cat: 'Measure', label: 'Distance or length', next: (refs, pr) => !refs.length ? 'D' : refs.length === 1 && pr[0].t === 'p' ? 'P' : null, make: r => [mk('meas', { refs: r, mt: 'dist' })] },
  { id: 'area', cat: 'Measure', label: 'Area', next: fx('A'), make: r => [mk('meas', { refs: r, mt: 'area' })] },
  { id: 'slope', cat: 'Measure', label: 'Slope', next: fx('L'), make: r => [mk('meas', { refs: r, mt: 'slope' })] },

  TX('reflLine', 'Reflect about line', 'reflLine', 'L'),
  TX('reflPt', 'Reflect about point', 'reflPt', 'P'),
  TX('inv', 'Reflect about circle', 'inv', 'C'),
  TX('rotate', 'Rotate around point', 'rot', 'P', { msg: 'Rotation angle (degrees, anticlockwise)', def: 90 }),
  TX('translate', 'Translate by vector', 'trans', 'V'),
  TX('dilate', 'Dilate from point', 'dil', 'P', { msg: 'Dilation factor', def: 2 }),

  { id: 'showHide', cat: 'General', label: 'Show / hide object', special: 'vis' },
  { id: 'showLabel', cat: 'General', label: 'Show / hide label', special: 'lbl' },
  { id: 'delete', cat: 'General', label: 'Delete object', special: 'del' },
];
const CATS = ['General', 'Points', 'Lines', 'Special lines', 'Polygons', 'Measure', ...new Set(TOOLS.map(t => t.cat))].filter((c, i, a) => a.indexOf(c) === i && TOOLS.some(t => t.cat === c));
const DESC = { P: 'a point', L: 'a line', S: 'a segment', C: 'a circle', Y: 'a polygon', O: 'an object', X: 'an object', D: 'a point, segment, circle or polygon', A: 'a polygon or circle', M: 'a point, segment or circle', V: 'a vector', I: 'an object to intersect', ON: 'an object to place the point on' };
function match(n, r, o) {
  if (!r) return false;
  switch (n) {
    case 'P': return r.t === 'p'; case 'L': return r.t === 'l'; case 'S': return r.t === 'l' && (o.kind === 'seg' || o.kind === 'vec');
    case 'C': return r.t === 'c'; case 'Y': return r.t === 'poly'; case 'V': return o.kind === 'vec';
    case 'O': return r.t !== 'txt' && r.t !== 'ang'; case 'ON': return r.t === 'l' || r.t === 'c';
    case 'X': return ['p', 'l', 'c', 'poly', 'pl'].includes(r.t); case 'I': return ['l', 'c', 'poly', 'pl'].includes(r.t);
    case 'D': return ['p', 'l', 'c', 'poly', 'pl'].includes(r.t); case 'A': return r.t === 'poly' || r.t === 'c';
    case 'M': return r.t === 'p' || (r.t === 'l' && (o.kind === 'seg' || o.kind === 'vec')) || r.t === 'c';
  }
  return false;
}

/* ───── tool engine ───── */
const state = { tool: null, refs: [], created: [], before: null, ghost: false };
const T = () => TOOLS.find(t => t.id === state.tool);
function setTool(id) { cancel(); state.tool = id; state.ghost = id === 'showHide'; env.changed(); }
function cancel() {
  if (state.created.length) { const dead = new Set(state.created); env.setObjs(objs().filter(o => !dead.has(o.id))); }
  state.refs = []; state.created = []; state.before = null; reset(); env.changed();
}
function hintText() {
  const t = T(); if (!t) return '';
  if (t.special) return t.label + ': click an object';
  const need = t.next(state.refs, state.refs.map(P));
  if (!need) return t.label;
  const n = state.refs.length, d = t.hint?.[n] || [].concat(need).map(x => DESC[x]).join(' or ');
  let h = `${t.label}: select ${d}`;
  if (t.closeOnFirst && n >= 3) h += ' — click the first point to close';
  if (t.open && n >= 2) h += ' — double-click to finish';
  return h;
}
function pick(need, p, z) {
  const tol = 9 / z, needs = [].concat(need), list = objs().filter(o => o.type === 'geo').reverse();
  const ok = o => !o.hidden || state.ghost;
  if (needs.some(n => n === 'P' || ['M', 'D', 'O', 'X'].includes(n))) { const e = list.find(o => ok(o) && ev(o)?.t === 'p' && hit(o, p, tol)); if (e) return e.id; }
  for (const n of needs) if (n !== 'P' && n !== 'ON') { const e = list.find(o => ok(o) && match(n, ev(o), o) && (ev(o).t !== 'p') && hit(o, p, tol)); if (e) return e.id; }
  if (needs.includes('ON') || needs.includes('P')) {
    const on = list.find(o => ok(o) && ['l', 'c'].includes(ev(o)?.t) && hit(o, p, tol));
    if (on) {
      const r = ev(on), n = r.t === 'l' ? { t: ((p.x - r.ax) * (r.bx - r.ax) + (p.y - r.ay) * (r.by - r.ay)) / ((r.bx - r.ax) ** 2 + (r.by - r.ay) ** 2) } : { th: mang(r, p) };
      const q = mk('ptOn', { refs: [on.id], ...n }); state.created.push(q.id); return q.id;
    }
  }
  if (needs.includes('P')) { const q = mk('pt', { x: p.x, y: p.y }); state.created.push(q.id); return q.id; }
  return null;
}
function click(p, z) {
  const t = T(); if (!t) return false;
  if (t.special) {
    const e = objs().filter(o => o.type === 'geo').reverse().find(o => (!o.hidden || state.ghost) && hit(o, p, 9 / z));
    if (!e) return true;
    env.action(() => {
      if (t.special === 'vis') e.hidden = !e.hidden; else if (t.special === 'lbl') e.lbl = !e.lbl;
      else { const ids = withDependents([e.id]); env.setObjs(objs().filter(o => !ids.has(o.id))); }
    }); reset(); env.changed(); return true;
  }
  if (!state.refs.length) { state.before = env.snap(); state.created = []; }
  const need = t.next(state.refs, state.refs.map(P)); if (!need) return true;
  // polygon: clicking the first point closes it
  if (t.closeOnFirst && state.refs.length >= 3) { const e = objs().filter(o => o.type === 'geo').reverse().find(o => ev(o)?.t === 'p' && hit(o, p, 9 / z)); if (e && e.id === state.refs[0]) { finish(); return true; } }
  const id = pick(need, p, z);
  if (!id) { env.toast('Select ' + [].concat(need).map(x => DESC[x]).join(' or ')); return true; }
  state.refs.push(id); state.lastP = p; reset();
  if (!t.next(state.refs, state.refs.map(P))) finish(); else env.changed();
  return true;
}
function finish() {
  const t = T(); if (!t) return;
  if (t.minPts && state.refs.length < t.minPts) return;
  const refs = [...state.refs], before = state.before, created = state.created;
  const done = num => {
    const mkn = objs().length;
    const out = t.make(refs, { num, P, dist, pt: id => P(id)?.t === 'p' });
    if (out === null) { state.refs = [], state.created = created; cancel(); return; }
    void mkn; state.refs = []; state.created = []; state.before = null; reset(); env.commit(before); env.changed();
  };
  if (t.num) { state.refs = []; env.ask(t.num, v => { v == null ? (state.created = created, cancel()) : done(v); }); }
  else done();
}
const dblclick = () => { const t = T(); if (t && t.open) { /* the 2nd click of the double-click added a duplicate point: drop it */ const last = state.refs.length > 2 && state.refs[state.refs.length - 1] === state.refs[state.refs.length - 2]; if (last) state.refs.pop(); finish(); } };
function preview(c, z, hover) {
  const t = T(); if (!t || t.special) return;
  c.save(); c.lineWidth = 1.5 / z;
  for (const id of state.refs) { const r = P(id); if (!r) continue; c.strokeStyle = '#e53935'; c.beginPath(); if (r.t === 'p') c.arc(r.x, r.y, 9 / z, 0, TAU); else { const b = gbox(O(id)); c.rect(b.x, b.y, b.w, b.h); } c.stroke(); }
  if (['polygon', 'polyline', 'angle', 'arc3', 'sector3', 'circ3'].includes(t.id)) {
    const pp = state.refs.map(P).filter(q => q && q.t === 'p');
    if (t.id === 'polygon') { const fp = hover ? pp.concat([hover]) : pp; if (fp.length > 2) { c.beginPath(); fp.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.closePath(); c.fillStyle = 'rgba(11,61,145,.16)'; c.fill(); } }
    if (pp.length > 1) { c.setLineDash([]); c.strokeStyle = GEO; c.lineWidth = 2 / z; c.beginPath(); pp.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.stroke(); c.lineWidth = 1.5 / z; }
    if (t.id === 'polygon' && pp.length > 1 && hover) { c.setLineDash([3 / z, 5 / z]); c.strokeStyle = 'rgba(11,61,145,.45)'; c.beginPath(); c.moveTo(hover.x, hover.y); c.lineTo(pp[0].x, pp[0].y); c.stroke(); c.setLineDash([]); }
  }
  const last = state.refs.length && P(state.refs[state.refs.length - 1]);
  if (last && last.t === 'p' && hover) { c.setLineDash([6 / z, 5 / z]); c.strokeStyle = GEO; c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(hover.x, hover.y); c.stroke(); }
  c.restore();
}

return { icon, TOOLS, CATS, state, setTool, cancel, click, finish, dblclick, preview, draw, hit, gbox, reset, moveMany, withDependents, isPoint, hintText, ev, O, P };
};

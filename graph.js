/* Rishit's Canvas – Graph calculator.
 * Expressions are plotted from graph-math.js; geometry constructions reuse the engine in geometry.js
 * (engine world = graph units × U, y pointing down, exactly like the whiteboard). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const M = window.GMath, RES = M.RESERVED;
const U = 100, TAU = Math.PI * 2;
const COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#111111', '#e2007a', '#00a3b5'];
const LS = 'rmcanvas.graph.v1';
let uidN = 0; const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 5);
const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'html') e.innerHTML = v; else if (v != null) e.setAttribute(k, v); }
  for (const c of [].concat(kids)) e.append(c); return e;
};

/* ───────── State ───────── */
const cv = $('#gcv'), ctx = cv.getContext('2d'), stage = $('#gstage');
let W = 0, H = 0, dpr = 1;
let rows = [], geoObjs = [], selIds = new Set(), focusId = null;
const S = { grid: true, minor: true, xaxis: true, yaxis: true, nums: true, polar: false, deg: false, snap: false, label: true, dec: 4 };
const view = { ox: 0, oy: 0, ppu: 100 };
let scope = { __fn: {} }, comp = new Map();
let hist = [], fut = [], base = '';
let hover = null, geo = null, panelTab = 'algebra';
const zW = () => view.ppu / U;                                   // screen px per engine world unit
const toW = (sx, sy) => ({ x: (sx - view.ox) / zW(), y: (sy - view.oy) / zW() });
const mx = sx => (sx - view.ox) / view.ppu, my = sy => (view.oy - sy) / view.ppu;
const sxOf = x => view.ox + x * view.ppu, syOf = y => view.oy - y * view.ppu;
const F = (v, d = S.dec) => M.fmt(v, d);

const newRow = (text = '') => ({ id: uid(), text, color: COLORS[rows.length % COLORS.length], hidden: false, val: null, min: null, max: null });

/* ───────── History ───────── */
const snapStr = () => JSON.stringify({ rows: rows.map(r => ({ ...r })), geo: geoObjs });
function pushHist(before) { if (before === snapStr()) return; hist.push(before); if (hist.length > 100) hist.shift(); fut.length = 0; syncUndo(); save(); }
function restoreStr(s) {
  const d = JSON.parse(s); rows = d.rows; geoObjs = d.geo; selIds = new Set([...selIds].filter(id => geoObjs.some(o => o.id === id)));
  ensureTail(); renderRows(); recompute(); renderGeoRows(); syncUndo(); save();
}
function undo() { if (!hist.length) return; fut.push(snapStr()); restoreStr(hist.pop()); base = snapStr(); }
function redo() { if (!fut.length) return; hist.push(snapStr()); restoreStr(fut.pop()); base = snapStr(); }
function action(fn) { const b = snapStr(); fn(); pushHist(b); base = snapStr(); recompute(); renderGeoRows(); }
function syncUndo() { $('#undoBtn').disabled = !hist.length; $('#redoBtn').disabled = !fut.length; }

/* ───────── Toast / modal ───────── */
const toastEl = $('#toast'); let toastT;
function toast(msg, ms = 1500) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms); }
let onModalCancel = null;
function closeModal() { $('#modal').hidden = true; if (onModalCancel) { const f = onModalCancel; onModalCancel = null; f(); } }
$('#modal').addEventListener('pointerdown', e => { if (e.target === $('#modal')) closeModal(); });
function askNumber(spec, cb) {
  $('#modalMsg').textContent = spec.msg; const row = $('#modalBtns'); row.replaceChildren();
  const inp = h('input', { type: 'number', value: spec.def, step: spec.int ? 1 : 'any', class: 'num' });
  const ok = () => { let v = parseFloat(inp.value); if (isNaN(v)) return; if (spec.int) v = Math.round(v); if (spec.min != null && v < spec.min) v = spec.min; onModalCancel = null; $('#modal').hidden = true; cb(v); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') closeModal(); });
  row.append(inp, h('button', { on: { click: closeModal } }, ['Cancel']), h('button', { class: 'primary', on: { click: ok } }, ['OK']));
  onModalCancel = () => cb(null); $('#modal').hidden = false; inp.focus(); inp.select();
}
function confirmBox(msg, label, cb) {
  $('#modalMsg').textContent = msg; const row = $('#modalBtns'); row.replaceChildren();
  row.append(h('button', { on: { click: closeModal } }, ['Cancel']), h('button', { class: 'primary', on: { click: () => { onModalCancel = null; $('#modal').hidden = true; cb(); } } }, [label]));
  onModalCancel = () => {}; $('#modal').hidden = false;
}

/* ───────── Evaluate algebra lines ───────── */
function scan() {
  const vars = new Set(), fns = new Set();
  for (const r of rows) {
    const t = r.text || '';
    let m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*\(\s*[A-Za-z][^)]*\)\s*=(?!=)/.exec(t);
    if (m && !RES.has(m[1]) && !/^[xy]$/.test(m[1])) { fns.add(m[1]); continue; }
    m = /^\s*([A-Za-z](?:_\w+)?|[A-Za-z]{2,})\s*=(?!=)/.exec(t.replace(/\{[^{}]*\}\s*$/, ''));
    if (m && !/^[xyr]$/.test(m[1]) && !RES.has(m[1])) vars.add(m[1]);
  }
  return { vars, fns };
}
const PLOTVARS = new Set(['x', 'y', 't', 'theta', 'r']);
function recompute() {
  const K = scan(); comp = new Map();
  for (const r of rows) comp.set(r.id, M.analyze(r.text, K));
  const E = { __fn: {} };
  for (const r of rows) {
    const a = comp.get(r.id);
    if (a.kind === 'var' && a.lit != null) { if (r.val == null) r.val = a.lit; E[a.name] = r.val; }
    if (a.kind === 'def') E.__fn[a.name] = (...args) => { const L = Object.create(E); a.params.forEach((p, i) => { L[p] = args[i]; }); return a.f(L); };
  }
  const vr = rows.filter(r => comp.get(r.id).kind === 'var' && comp.get(r.id).lit == null);
  for (let pass = 0; pass <= vr.length; pass++) for (const r of vr) { const a = comp.get(r.id); try { E[a.name] = a.f(E); } catch (e) { E[a.name] = NaN; } }
  scope = E;
  for (const r of rows) {
    const a = comp.get(r.id); if (!a.free) continue;
    const miss = [...a.free].filter(n => !(n in E) && !(E.__fn && E.__fn[n]) && !PLOTVARS.has(n) && !(n in M.CONST) && !RES.has(n));
    if (miss.length && a.kind !== 'error') { a.miss = miss; }
    if (a.kind === 'param' || a.kind === 'polar') { /* t / theta are plot variables */ }
  }
  poiKey = ''; updAllRows(); dirty();
}
const E_ = () => scope;
const safe = (f, E) => { try { const v = f(E); return v; } catch (e) { return NaN; } };

/* ───────── View ───────── */
function homeView() { const p = clamp(Math.min(W, H) / 8.5, 36, 110); return { ox: W / 2, oy: H / 2, ppu: p }; }
let anim = null;
function animateTo(t, ms = 300) {
  const f = { ...view }, t0 = performance.now(); cancelAnimationFrame(anim);
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    view.ppu = Math.exp(Math.log(f.ppu) + (Math.log(t.ppu) - Math.log(f.ppu)) * e);
    if (t.anchor) { view.ox = t.anchor.x - (t.anchor.x - f.ox) * view.ppu / f.ppu; view.oy = t.anchor.y - (t.anchor.y - f.oy) * view.ppu / f.ppu; }
    else { view.ox = f.ox + (t.ox - f.ox) * e; view.oy = f.oy + (t.oy - f.oy) * e; }
    dirty(); if (k < 1) anim = requestAnimationFrame(step); else save();
  };
  anim = requestAnimationFrame(step);
}
function zoomAt(f, sx, sy, animate) {
  const np = clamp(view.ppu * f, 0.02, 2e6); f = np / view.ppu;
  if (animate) { animateTo({ ppu: np, anchor: { x: sx, y: sy } }, 240); return; }
  view.ox = sx - (sx - view.ox) * f; view.oy = sy - (sy - view.oy) * f; view.ppu = np; dirty(); saveSoon();
}
function resize() {
  const r = stage.getBoundingClientRect(), nw = Math.round(r.width), nh = Math.round(r.height);
  if (!nw || !nh) return; dpr = window.devicePixelRatio || 1;
  const first = !W; if (!first) { view.ox += (nw - W) / 2; view.oy += (nh - H) / 2; }
  W = nw; H = nh; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (first && !loadedView) Object.assign(view, homeView());
  dirty();
}
let loadedView = false;
new ResizeObserver(resize).observe(stage);

/* ───────── Rendering ───────── */
let needs = false;
function dirty() { if (geo) geo.reset(); if (!needs) { needs = true; requestAnimationFrame(frame); } }
function niceStep(ppu) {
  const raw = 90 / ppu, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * mag * ppu >= 70) return { step: m * mag, sub: m === 2 ? 4 : 5 };
  return { step: 10 * mag, sub: 5 };
}
const decOf = step => Math.max(0, Math.min(8, -Math.floor(Math.log10(step) + 1e-9)));
function axisNum(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-4) return v.toExponential(1).replace('e+', 'e').replace(/\.0e/, 'e');
  let s = v.toFixed(decOf(step)); if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s;
}
function drawGrid() {
  const { ox, oy, ppu } = view, { step, sub } = niceStep(ppu), sp = step * ppu;
  const x0 = mx(0), x1 = mx(W), y1 = my(0), y0 = my(H);
  const line = (a, b, c, d) => { ctx.moveTo(a, b); ctx.lineTo(c, d); };
  const crisp = v => Math.round(v) + .5;
  if (S.grid && !S.polar) {
    if (S.minor) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(12,16,53,.09)'; ctx.lineWidth = .6;
      const ms = step / sub; let ko = Math.ceil(x0 / ms), ke = Math.floor(x1 / ms);
      if ((ke - ko) < 400) for (let k = ko; k <= ke; k++) { if (k % sub === 0) continue; const x = crisp(sxOf(k * ms)); line(x, 0, x, H); }
      ko = Math.ceil(y0 / ms); ke = Math.floor(y1 / ms);
      if ((ke - ko) < 400) for (let k = ko; k <= ke; k++) { if (k % sub === 0) continue; const y = crisp(syOf(k * ms)); line(0, y, W, y); }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.strokeStyle = 'rgba(12,16,53,.2)'; ctx.lineWidth = 1;
    for (let k = Math.ceil(x0 / step); k <= Math.floor(x1 / step); k++) { const x = crisp(sxOf(k * step)); line(x, 0, x, H); }
    for (let k = Math.ceil(y0 / step); k <= Math.floor(y1 / step); k++) { const y = crisp(syOf(k * step)); line(0, y, W, y); }
    ctx.stroke();
  }
  if (S.grid && S.polar) {
    const R = Math.hypot(Math.max(Math.abs(ox), Math.abs(W - ox)), Math.max(Math.abs(oy), Math.abs(H - oy))) / ppu;
    const rin = Math.max(0, Math.hypot(Math.min(Math.abs(ox), Math.abs(W - ox)) * (ox > 0 && ox < W ? 0 : 1), Math.min(Math.abs(oy), Math.abs(H - oy)) * (oy > 0 && oy < H ? 0 : 1)) / ppu);
    const ring = (rad) => { ctx.moveTo(ox + rad * ppu, oy); ctx.arc(ox, oy, rad * ppu, 0, TAU); };
    if (S.minor) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(12,16,53,.09)'; ctx.lineWidth = .6; const ms = step / sub;
      for (let k = Math.max(1, Math.floor(rin / ms)); k * ms <= R && k < 1500; k++) if (k % sub) ring(k * ms);
      for (let a = 0; a < 24; a++) if (a % 2) { const t = a * Math.PI / 12; line(ox, oy, ox + Math.cos(t) * R * ppu, oy - Math.sin(t) * R * ppu); }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.strokeStyle = 'rgba(12,16,53,.2)'; ctx.lineWidth = 1;
    for (let k = Math.max(1, Math.floor(rin / step)); k * step <= R && k < 500; k++) ring(k * step);
    for (let a = 0; a < 12; a++) { const t = a * Math.PI / 6; line(ox, oy, ox + Math.cos(t) * R * ppu, oy - Math.sin(t) * R * ppu); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#0c1035'; ctx.lineWidth = 1.8;
  if (S.xaxis && oy >= -2 && oy <= H + 2) { ctx.beginPath(); line(0, Math.round(oy), W, Math.round(oy)); ctx.stroke(); }
  if (S.yaxis && ox >= -2 && ox <= W + 2) { ctx.beginPath(); line(Math.round(ox), 0, Math.round(ox), H); ctx.stroke(); }
  if (S.nums) {
    ctx.font = '600 13px Figtree,sans-serif'; ctx.fillStyle = '#4b5078'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    const lab = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
    const ly = clamp(oy + 5, 4, H - 20); ctx.textBaseline = 'top'; ctx.textAlign = 'right';
    if (S.xaxis || S.grid) {
      const every = Math.max(1, Math.ceil(38 / sp));
      for (let k = Math.ceil(x0 / step); k <= Math.floor(x1 / step); k++) { if (k % every) continue; const x = sxOf(k * step); if (k === 0 && !S.yaxis) continue; lab(axisNum(k * step, step), x - 4, ly); }
    }
    let lx = ox - 6, al = 'right'; if (ox < 40) { lx = 8; al = 'left'; if (ox > -2) lx = ox + 7; } else if (ox > W - 8) { lx = W - 8; al = 'right'; }
    ctx.textAlign = al;
    if (S.yaxis || S.grid) {
      for (let k = Math.ceil(y0 / step); k <= Math.floor(y1 / step); k++) { if (k === 0) continue; if (k % Math.max(1, Math.ceil(26 / sp))) continue; lab(axisNum(k * step, step), lx, syOf(k * step) + 4); }
    }
  }
}
function pathFn(a, swap) {
  const E = scope, n = swap ? H : W; let prev = null, open = false;
  ctx.beginPath();
  for (let p = -2; p <= n + 2; p += .5) {
    const t = swap ? my(p) : mx(p);
    if (swap) { E.y = t; } else E.x = t;
    if (a.dom && !safe(a.dom, E)) { prev = null; continue; }
    const v = safe(a.f, E); if (typeof v !== 'number' || !isFinite(v)) { prev = null; continue; }
    const q = swap ? sxOf(v) : syOf(v);
    if (prev !== null && Math.abs(q - prev) > 6 * (swap ? W : H)) prev = null;
    const c = Math.max(-1e6, Math.min(1e6, q)), X = swap ? c : p, Y = swap ? p : c;
    if (prev === null) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    prev = q;
  }
  ctx.stroke();
}
function pathParam(fx, fy, v, lo, hi, n, dom, polar) {
  const E = scope; let pen = false; ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = lo + (hi - lo) * i / n; E[v] = t; if (v === 'theta') E.t = t;
    if (dom && !safe(dom, E)) { pen = false; continue; }
    let X, Y;
    if (polar) { const r = safe(fx, E); X = r * Math.cos(t); Y = r * Math.sin(t); } else { X = safe(fx, E); Y = safe(fy, E); }
    if (!isFinite(X) || !isFinite(Y)) { pen = false; continue; }
    const sx = sxOf(X), sy = syOf(Y); if (Math.abs(sx) > 1e7 || Math.abs(sy) > 1e7) { pen = false; continue; }
    if (pen) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); pen = true; }
  }
  ctx.stroke();
}
function pathImplicit(a, cell = 5) {
  const E = scope, nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1, g = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) { E.y = my(j * cell); for (let i = 0; i < nx; i++) { E.x = mx(i * cell); let v = safe(a.F, E); if (a.dom && !safe(a.dom, E)) v = NaN; g[j * nx + i] = v; } }
  ctx.beginPath();
  const ip = (x1, y1, v1, x2, y2, v2) => { const t = v1 / (v1 - v2); return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v00 = g[j * nx + i], v10 = g[j * nx + i + 1], v11 = g[(j + 1) * nx + i + 1], v01 = g[(j + 1) * nx + i];
    if (!isFinite(v00 + v10 + v11 + v01)) continue;
    const x = i * cell, y = j * cell, P = [];
    if ((v00 < 0) !== (v10 < 0)) P.push(ip(x, y, v00, x + cell, y, v10));
    if ((v10 < 0) !== (v11 < 0)) P.push(ip(x + cell, y, v10, x + cell, y + cell, v11));
    if ((v01 < 0) !== (v11 < 0)) P.push(ip(x, y + cell, v01, x + cell, y + cell, v11));
    if ((v00 < 0) !== (v01 < 0)) P.push(ip(x, y, v00, x, y + cell, v01));
    if (P.length === 2) { ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); }
    else if (P.length === 4) { ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.moveTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); }
  }
  ctx.stroke();
}
let shadeCv = null;
function shade(a, col) {
  const cell = 3, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell), E = scope;
  if (!shadeCv) shadeCv = document.createElement('canvas'); shadeCv.width = nx; shadeCv.height = ny;
  const c = shadeCv.getContext('2d'), im = c.createImageData(nx, ny), rgb = hex(col);
  for (let j = 0; j < ny; j++) { E.y = my(j * cell + cell / 2); for (let i = 0; i < nx; i++) { E.x = mx(i * cell + cell / 2); let ok = false; try { ok = a.test(E) && (!a.dom || a.dom(E)); } catch (e) { } if (ok) { const k = (j * nx + i) * 4; im.data[k] = rgb[0]; im.data[k + 1] = rgb[1]; im.data[k + 2] = rgb[2]; im.data[k + 3] = 46; } } }
  c.putImageData(im, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(shadeCv, 0, 0, nx * cell, ny * cell);
}
const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function dot(x, y, col, r = 6) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,40,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * .28, y - r * .3, r * .32, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
}
function drawRows() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of rows) {
    if (r.hidden) continue; const a = comp.get(r.id); if (!a || a.kind === 'error' || a.miss) continue;
    ctx.strokeStyle = r.color; ctx.fillStyle = r.color; ctx.lineWidth = r.id === focusId ? 3.4 : 2.6; ctx.setLineDash([]);
    const E = scope;
    switch (a.kind) {
      case 'fn': pathFn(a, false); break;
      case 'def': if (a.plot) pathFn({ f: E2 => a.f(Object.assign(Object.create(E2), { [a.params[0]]: E2.x })), dom: a.dom }, false); break;
      case 'xfn': pathFn(a, true); break;
      case 'polar': pathParam(a.f, null, 'theta', 0, 12 * Math.PI, 3600, a.dom, true); break;
      case 'param': pathParam(a.fx, a.fy, 't', -10, 10, 4000, a.dom, false); break;
      case 'implicit': pathImplicit(a); break;
      case 'ineq': shade(a, r.color); if (a.F) { ctx.lineWidth = 2; if (a.strict) ctx.setLineDash([8, 6]); pathImplicit({ F: a.F, dom: a.dom }); ctx.setLineDash([]); } break;
      case 'point': {
        const X = safe(a.fx, E), Y = safe(a.fy, E); if (!isFinite(X) || !isFinite(Y)) break;
        const sx = sxOf(X), sy = syOf(Y);
        if (r.id === focusId || (hover && hover.row === r.id)) { ctx.beginPath(); ctx.arc(sx, sy, 14, 0, TAU); ctx.fillStyle = r.color + '33'; ctx.fill(); }
        dot(sx, sy, r.color);
        if (r.id === focusId || (hover && hover.row === r.id)) label(`(${F(X)}, ${F(Y)})`, sx + 11, sy - 11, r.color);
        break;
      }
    }
  }
  ctx.setLineDash([]);
}
function label(txt, x, y, col = '#000455') {
  ctx.save(); ctx.font = '700 13.5px Figtree,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.93)'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.restore();
}

/* points of interest for the selected function */
let poiKey = '', poiList = [];
const fnRows = () => rows.filter(r => { const a = comp.get(r.id); return !r.hidden && a && !a.miss && (a.kind === 'fn' || (a.kind === 'def' && a.plot)); });
function evalFn(r, x) {
  const a = comp.get(r.id), E = scope; E.x = x;
  if (a.dom && !safe(a.dom, E)) return NaN;
  if (a.kind === 'def') return safe(v => a.f(Object.assign(Object.create(E), { [a.params[0]]: x })), E);
  return safe(a.f, E);
}
function computePOI(r) {
  const key = r.id + '|' + rows.map(q => q.text).join('~') + '|' + Math.round(view.ox) + '|' + Math.round(view.oy) + '|' + view.ppu.toFixed(3) + '|' + JSON.stringify(Object.values(scope).filter(v => typeof v === 'number'));
  if (key === poiKey) return poiList; poiKey = key; const out = [];
  const x0 = mx(0), x1 = mx(W), N = 700, dx = (x1 - x0) / N, f = x => evalFn(r, x);
  const xs = [], ys = []; for (let i = 0; i <= N; i++) { xs.push(x0 + i * dx); ys.push(f(xs[i])); }
  const bis = (g, a, b) => { let ga = g(a); for (let k = 0; k < 45; k++) { const m = (a + b) / 2, gm = g(m); if ((gm < 0) === (ga < 0)) { a = m; ga = gm; } else b = m; } return (a + b) / 2; };
  const add = (x, y, kind) => { if (!isFinite(x) || !isFinite(y)) return; if (out.some(p => Math.abs(p.x - x) < dx * 1.5 && Math.abs(p.y - y) < Math.abs(y) * 1e-3 + dx)) return; out.push({ x, y, kind }); };
  for (let i = 0; i < N; i++) {
    const a = ys[i], b = ys[i + 1]; if (!isFinite(a) || !isFinite(b)) continue;
    if (a === 0) add(xs[i], 0, 'Zero'); else if ((a < 0) !== (b < 0) && Math.abs(a - b) < 1e4 * Math.max(1, Math.abs(a))) { const xr = bis(f, xs[i], xs[i + 1]); if (Math.abs(f(xr)) < 1e-3 * Math.max(1, Math.abs(a), Math.abs(b))) add(xr, 0, 'Zero'); }
  }
  const d = x => M.deriv1(f, x);
  const hh = dx;
  for (let i = 1; i < N - 1; i++) {
    const a = ys[i - 1], b = ys[i], c = ys[i + 1]; if (!isFinite(a + b + c)) continue;
    if ((b - a) * (c - b) < 0) {
      let lo = xs[i - 1], hi = xs[i + 1]; for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, up = b > a; if ((f(m1) > f(m2)) === up) hi = m2; else lo = m1; }
      const xm = (lo + hi) / 2, ym = f(xm); if (isFinite(ym) && Math.abs(d(xm)) < 1e-2 * Math.max(1, Math.abs(ym))) add(xm, ym, b > a ? 'Maximum' : 'Minimum');
    }
  }
  void hh;
  if (x0 < 0 && x1 > 0) { const y0 = f(0); if (isFinite(y0)) add(0, y0, 'Y-intercept'); }
  for (const q of fnRows()) {
    if (q.id === r.id) continue;
    const g = x => f(x) - evalFn(q, x);
    let pa = g(xs[0]);
    for (let i = 0; i < N; i++) { const pb = g(xs[i + 1]); if (isFinite(pa) && isFinite(pb) && (pa < 0) !== (pb < 0) && Math.abs(pa - pb) < 1e3) { const xr = bis(g, xs[i], xs[i + 1]), yr = f(xr); if (Math.abs(g(xr)) < 1e-4 * Math.max(1, Math.abs(yr))) add(xr, yr, 'Intersection'); } pa = pb; }
  }
  poiList = out.slice(0, 40); return poiList;
}
function drawPOI() {
  const r = rows.find(q => q.id === focusId); if (!r || r.hidden || !fnRows().includes(r)) return;
  for (const p of computePOI(r)) {
    const x = sxOf(p.x), y = syOf(p.y); if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const hot = hover && hover.poi === p;
    ctx.beginPath(); ctx.arc(x, y, hot ? 8 : 6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#6b6f8d'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fillStyle = '#6b6f8d'; ctx.fill();
  }
}
function drawGeo() {
  ctx.save(); ctx.translate(view.ox, view.oy); const z = zW(); ctx.scale(z, z);
  const passes = [false, true];
  for (const pass of passes) for (const o of geoObjs) {
    if ((pass) !== (o.type === 'geo' && geo.isPoint(o))) continue;
    geo.draw(ctx, o, z, { sel: selIds.has(o.id), ghost: geo.state.ghost, hover: hover && hover.geo === o.id });
  }
  if (geo.state.tool) geo.preview(ctx, z, hover && hover.w ? hover.w : null);
  ctx.restore();
}
function frame() {
  needs = false; if (!W) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  drawGrid(); drawRows(); drawPOI(); drawGeo(); drawTrace();
}
function drawTrace() {
  if (!hover || !hover.trace) return; const t = hover.trace, x = sxOf(t.x), y = syOf(t.y);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fillStyle = t.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
}

/* ───────── Algebra rows ───────── */
const rowsEl = $('#rows'), els = new Map();
const PLUS = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 2v14M2 9h14"/></svg>';
function ensureTail() { if (!rows.length || rows[rows.length - 1].text.trim() !== '') rows.push(newRow()); }
function renderRows() {
  rowsEl.replaceChildren(); els.clear();
  for (const r of rows) rowsEl.append(makeRow(r));
  updAllRows();
}
function makeRow(r) {
  const inp = h('input', { class: 'expr', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', placeholder: 'Input…', value: r.text, 'aria-label': 'Expression' });
  if (kpOpen && coarse()) inp.setAttribute('inputmode', 'none');
  const dotEl = h('div', { class: 'dot', title: 'Show / hide' }), res = h('div', { class: 'res' }), err = h('div', { class: 'err' }), sl = h('div', { class: 'sl', hidden: '' });
  const el = h('div', { class: 'row', 'data-id': r.id }, [dotEl, h('div', { class: 'body' }, [inp, res, sl, err]),
    h('button', { class: 'xbtn', title: 'Delete', 'aria-label': 'Delete expression', on: { click: () => delRow(r.id) } }, ['×'])]);
  el.style.setProperty('--c', r.color); els.set(r.id, { el, inp, dotEl, res, err, sl, r, errT: 0 });
  dotEl.addEventListener('pointerdown', e => e.preventDefault());
  dotEl.addEventListener('click', e => {
    if (!r.text.trim()) { inp.focus(); return; }
    const b = snapStr(); r.hidden = !r.hidden; pushHist(b); base = snapStr(); updRow(r); dirty();
  });
  inp.addEventListener('focus', () => { focusId = r.id; lastInp = inp; for (const o of els.values()) o.el.classList.toggle('focus', o.r.id === r.id); base = snapStr(); dirty(); });
  inp.addEventListener('input', () => {
    r.text = inp.value; r.val = null; const o = els.get(r.id); o.err.textContent = ''; clearTimeout(o.errT);
    if (r.text.trim() && rows[rows.length - 1] === r) { const nr = newRow(); rows.push(nr); rowsEl.append(makeRow(nr)); }
    recompute(); o.errT = setTimeout(() => updRow(r, true), 700); saveSoon();
  });
  inp.addEventListener('change', () => commitRow(r));
  inp.addEventListener('keydown', e => rowKey(e, r, inp));
  return el;
}
let lastInp = null;
function rowKey(e, r, inp) {
  const i = rows.indexOf(r);
  if (e.key === 'Enter') { e.preventDefault(); commitRow(r); const nx = rows[i + 1]; if (nx) els.get(nx.id).inp.focus(); }
  else if (e.key === 'ArrowDown' && rows[i + 1]) { e.preventDefault(); els.get(rows[i + 1].id).inp.focus(); }
  else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); els.get(rows[i - 1].id).inp.focus(); }
  else if (e.key === 'Backspace' && !inp.value && i > 0 && i < rows.length - 1) { e.preventDefault(); delRow(r.id); els.get(rows[i - 1].id).inp.focus(); }
  else if (e.key === 'Escape') inp.blur();
  e.stopPropagation();
}
function commitRow(r) {
  const o = els.get(r.id); if (!o) return;
  const a = comp.get(r.id);
  if (a && a.miss && a.miss.length) {                                      // undefined names become sliders
    const have = scan().vars, names = a.miss.filter(n => /^[A-Za-z](_\w+)?$/.test(n) && !PLOTVARS.has(n) && !have.has(n));
    if (names.length) {
      const i = rows.indexOf(r);
      names.forEach((n, k) => { const nr = newRow(n + '=1'); nr.color = COLORS[(rows.length + k) % COLORS.length]; rows.splice(i + k, 0, nr); });
      renderRows(); recompute(); const o2 = els.get(r.id); if (o2 && document.activeElement !== o2.inp) o2.inp.focus();
    }
  }
  pushHist(base); base = snapStr(); updRow(r, true); save();
}
function delRow(id) {
  const b = snapStr(); rows = rows.filter(r => r.id !== id); ensureTail(); renderRows(); pushHist(b); base = snapStr(); if (focusId === id) focusId = null; recompute();
}
function updAllRows() { for (const o of els.values()) updRow(o.r); }
function updRow(r, showErr) {
  const o = els.get(r.id); if (!o) return; const a = comp.get(r.id) || { kind: 'empty' };
  const empty = !r.text.trim();
  o.el.style.setProperty('--c', r.color); o.el.classList.toggle('off', r.hidden); o.el.classList.toggle('focus', r.id === focusId);
  const bad = a.kind === 'error' || (a.miss && a.miss.length);
  o.el.classList.toggle('bad', !!bad && !empty && (showErr || document.activeElement !== o.inp));
  if (empty) o.dotEl.innerHTML = PLUS, o.dotEl.classList.add('plus'); else { o.dotEl.classList.remove('plus'); if (!o.dotEl.firstChild || o.dotEl.firstChild.tagName !== 'I') o.dotEl.replaceChildren(h('i')); }
  let res = '', err = '';
  const E = scope;
  if (a.kind === 'value') { const v = safe(a.f, E); res = '= ' + F(v); }
  else if (a.kind === 'var' && a.lit == null) { res = '= ' + F(E[a.name]); }
  else if (a.kind === 'def' && !a.plot) res = '';
  else if (a.kind === 'error' && (showErr || document.activeElement !== o.inp)) err = a.msg;
  else if (a.miss && a.miss.length && (showErr || document.activeElement !== o.inp)) err = 'Press Enter to add a slider for ' + a.miss.join(', ');
  o.res.textContent = res; o.err.textContent = err;
  const isSlider = a.kind === 'var' && a.lit != null;
  o.sl.hidden = !isSlider;
  if (isSlider) buildSlider(o, r, a);
}
function buildSlider(o, r, a) {
  const v = r.val != null ? r.val : a.lit;
  if (r.min == null) { const m = Math.max(10, Math.ceil(Math.abs(v) * 1.5 / 10) * 10); r.min = -m; r.max = m; }
  if (!o.sl.firstChild) {
    const mn = h('input', { type: 'number', 'aria-label': 'Minimum', title: 'Minimum' }), mxx = h('input', { type: 'number', 'aria-label': 'Maximum', title: 'Maximum' });
    const rg = h('input', { type: 'range', 'aria-label': 'Value' }), play = h('button', { class: 'play', title: 'Animate', 'aria-label': 'Animate' }, ['▶']);
    o.sl.append(h('div', { class: 'sl1' }, [rg, play]), h('div', { class: 'sl2' }, [mn, mxx])); o.slEls = { mn, mxx, rg, play };
    const setV = (val, push) => { r.val = val; const t = comp.get(r.id); const nm = t && t.name; r.text = nm + '=' + F(val, 6).replace('−', '-'); o.inp.value = r.text; r._lit = val; recompute(); if (push) { pushHist(base); base = snapStr(); } else saveSoon(); };
    rg.addEventListener('input', () => setV(parseFloat(rg.value)));
    rg.addEventListener('change', () => { pushHist(base); base = snapStr(); });
    rg.addEventListener('pointerdown', () => { base = snapStr(); });
    mn.addEventListener('change', () => { r.min = parseFloat(mn.value); if (!(r.min < r.max)) r.max = r.min + 1; updRow(r); save(); });
    mxx.addEventListener('change', () => { r.max = parseFloat(mxx.value); if (!(r.max > r.min)) r.min = r.max - 1; updRow(r); save(); });
    play.addEventListener('click', () => togglePlay(r, o));
  }
  const { mn, mxx, rg } = o.slEls, step = r.step || (r.max - r.min) / 400;
  if (document.activeElement !== mn) mn.value = r.min; if (document.activeElement !== mxx) mxx.value = r.max;
  rg.min = r.min; rg.max = r.max; rg.step = step; rg.value = v;
}
const playing = new Map();
function togglePlay(r, o) {
  if (playing.has(r.id)) { cancelAnimationFrame(playing.get(r.id).raf); playing.delete(r.id); o.slEls.play.textContent = '▶'; return; }
  const st = { dir: 1, raf: 0, t: performance.now() }; playing.set(r.id, st); o.slEls.play.textContent = '❚❚';
  const tick = now => {
    const dt = (now - st.t) / 1000; st.t = now; const span = r.max - r.min; let v = (r.val != null ? r.val : r.min) + st.dir * span / 8 * dt;
    if (v >= r.max) { v = r.max; st.dir = -1; } else if (v <= r.min) { v = r.min; st.dir = 1; }
    r.val = v; const t = comp.get(r.id); r.text = t.name + '=' + F(v, 4).replace('−', '-'); o.inp.value = r.text; r._lit = v; o.slEls.rg.value = v; recompute();
    st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}

/* ───────── Geometry constructions ───────── */
geo = window.WBGeo({
  objs: () => geoObjs, uid, CM: U, unit: '', dec: 2, z: () => zW(),
  snap: () => snapStr(), commit: b => { pushHist(b); base = snapStr(); renderGeoRows(); dirty(); },
  action: fn => action(fn), setObjs: a => { geoObjs = a; },
  toast: m => toast(m), ask: (spec, cb) => askNumber(spec, cb), changed: () => geoChanged(),
  coords: r => `(${F(r.x / U, 2)}, ${F(-r.y / U, 2)})`,
});
function geoChanged() {
  const hint = $('#hint'), on = !!geo.state.tool; hint.hidden = !on; if (on) hint.textContent = geo.hintText();
  for (const o of geoObjs) if (!o._seen) { o._seen = true; if (!S.label && o.type === 'geo') o.lbl = false; }
  cv.style.cursor = on ? 'crosshair' : 'default'; renderGeoRows(); syncToolChips(); dirty();
}
const gx = v => v / U, gy = v => -v / U;
function describe(o, r) {
  const f2 = v => F(v, 2), n = o.name;
  switch (r.t) {
    case 'p': return `<b>${n}</b> = (${f2(gx(r.x))}, ${f2(gy(r.y))})`;
    case 'l': {
      const dx = r.bx - r.ax, dy = -(r.by - r.ay);
      if (r.mode === 'seg') return `<b>${n}</b> = ${f2(Math.hypot(dx, dy) / U)}`;
      if (r.mode === 'vec') return `<b>${n}</b> = (${f2(dx / U)}, ${f2(dy / U)})`;
      if (Math.abs(dx) < 1e-9) return `<b>${n}</b>: x = ${f2(gx(r.ax))}`;
      const m = dy / dx, c = gy(r.ay) - m * gx(r.ax); return `<b>${n}</b>: y = ${f2(m)}x ${c < 0 ? '−' : '+'} ${f2(Math.abs(c))}${r.mode === 'ray' ? ' (ray)' : ''}`;
    }
    case 'c': { const sq = (v, nm) => Math.abs(v) < 5e-3 ? nm + '²' : `(${nm} ${v > 0 ? '−' : '+'} ${f2(Math.abs(v))})²`;
      return r.a0 == null ? `<b>${n}</b>: ${sq(gx(r.x), 'x')} + ${sq(gy(r.y), 'y')} = ${f2((r.r / U) ** 2)}` : `<b>${n}</b>: arc, r = ${f2(r.r / U)}`; }
    case 'poly': case 'pl': { let a = 0; const q = r.pts; for (let i = 0; i < q.length; i++) { const p = q[i], s = q[(i + 1) % q.length]; a += p.x * s.y - s.x * p.y; } return r.t === 'poly' ? `<b>${n}</b>: polygon, area = ${f2(Math.abs(a) / 2 / U / U)}` : `<b>${n}</b>: polyline`; }
    case 'ang': return `<b>${n}</b> = ${F(r.deg, 2)}°`;
    case 'cn': return `<b>${n}</b>: conic`;
    case 'txt': return r.text.replace(n, '<b>' + n + '</b>');
  }
  return n;
}
function renderGeoRows() {
  const box = $('#geoRows'); box.replaceChildren(); const list = geoObjs.filter(o => o.type === 'geo');
  $('#geoHead').hidden = !list.length;
  for (const o of list) {
    const r = geo.ev(o); if (!r) continue;
    const el = h('div', { class: 'row geo' + (selIds.has(o.id) ? ' sel' : '') + (o.hidden ? ' off' : '') }, [
      h('div', { class: 'dot', title: 'Show / hide', on: { click: () => action(() => { o.hidden = !o.hidden; }) } }, [h('i')]),
      h('div', { class: 'body', on: { click: () => { selIds = new Set([o.id]); renderGeoRows(); dirty(); } } }, [h('div', { class: 'res', html: describe(o, r) })]),
      h('button', { class: 'xbtn', title: 'Delete', on: { click: () => delGeo([o.id]) } }, ['×'])]);
    el.style.setProperty('--c', o.color || '#0b3d91'); box.append(el);
  }
}
function delGeo(ids) {
  action(() => { const all = geo.withDependents(ids); geoObjs = geoObjs.filter(o => !all.has(o.id)); selIds = new Set(); }); dirty();
}
function buildTools() {
  const p = $('#toolsPane'); p.replaceChildren();
  p.append(h('h3', {}, ['General']), h('div', { class: 'grid' }, [h('button', { class: 'chip wide', 'data-tool': '', html: geo.icon('') + '<span>Move / select</span>', on: { click: () => { geo.setTool(null); } } })]));
  for (const cat of geo.CATS) {
    if (cat === 'General') { const g = $('.grid', p); for (const t of geo.TOOLS.filter(t => t.cat === cat)) g.append(chip(t)); continue; }
    p.append(h('h3', {}, [cat]), h('div', { class: 'grid' }, geo.TOOLS.filter(t => t.cat === cat).map(chip)));
  }
  syncToolChips();
}
const chip = t => h('button', { class: 'chip', 'data-tool': t.id, html: geo.icon(t.id) + '<span>' + t.label + '</span>', on: { click: () => { geo.setTool(geo.state.tool === t.id ? null : t.id); } } });
function syncToolChips() { for (const c of document.querySelectorAll('#toolsPane .chip')) c.classList.toggle('on', (c.dataset.tool || null) === (geo.state.tool || null)); }

/* ───────── Pointer interaction ───────── */
const ptrs = new Map(); let drag = null, pinch = null;
const posOf = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const snapV = v => { if (!S.snap) return v; const { step, sub } = niceStep(view.ppu), s = step / sub; return Math.round(v / s) * s; };
const snapW = p => S.snap ? { x: snapV(p.x / U) * U, y: -snapV(-p.y / U) * U } : p;
const geoAt = p => {
  const z = zW(), all = [...geoObjs].reverse(); const vis = o => o.type === 'geo' && (!o.hidden || geo.state.ghost);
  return all.find(o => vis(o) && geo.isPoint(o) && geo.hit(o, p, 6 / z)) || all.find(o => vis(o) && geo.hit(o, p, 6 / z));
};
const litPointAt = (s) => {
  for (const r of rows) { const a = comp.get(r.id); if (r.hidden || !a || a.kind !== 'point' || !a.lit) continue; const x = sxOf(safe(a.fx, scope)), y = syOf(safe(a.fy, scope)); if (Math.hypot(x - s.x, y - s.y) < 12) return r; }
  return null;
};
cv.addEventListener('pointerdown', e => {
  if (narrow() && !panel.classList.contains('collapsed')) { panel.classList.add('collapsed'); e.preventDefault(); return; }   // tap outside the panel only closes it
  cv.setPointerCapture(e.pointerId); const s = posOf(e); ptrs.set(e.pointerId, s); closeSettings(); closeKeypadFocus();
  cancelAnimationFrame(anim);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; return; }
  const p = toW(s.x, s.y);
  if (geo.state.tool) { drag = { t: 'click', sx: s.x, sy: s.y, ox: view.ox, oy: view.oy, moved: false, p }; return; }
  const lp = litPointAt(s); if (lp) { drag = { t: 'lit', row: lp, before: snapStr() }; focusId = lp.id; return; }
  const o = geoAt(p);
  if (o) { if (!selIds.has(o.id)) selIds = new Set([o.id]); renderGeoRows(); drag = { t: 'move', last: p, before: snapStr(), moved: false, o }; dirty(); return; }
  if (selIds.size) { selIds = new Set(); renderGeoRows(); }
  drag = { t: 'pan', sx: s.x, sy: s.y, ox: view.ox, oy: view.oy }; cv.style.cursor = 'grabbing';
  if (focusId && document.activeElement && document.activeElement.classList.contains('expr')) document.activeElement.blur();
  focusId = null; for (const q of els.values()) q.el.classList.remove('focus'); dirty();
});
cv.addEventListener('pointermove', e => {
  const s = posOf(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, s);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const np = clamp(view.ppu * d / pinch.d, 0.02, 2e6), f = np / view.ppu;
    view.ox = cx - (cx - view.ox) * f + (cx - pinch.cx); view.oy = cy - (cy - view.oy) * f + (cy - pinch.cy); view.ppu = np; pinch = { d, cx, cy }; dirty(); return;
  }
  if (!drag) { updateHover(s, e); return; }
  if (drag.t === 'pan') { view.ox = drag.ox + s.x - drag.sx; view.oy = drag.oy + s.y - drag.sy; dirty(); }
  else if (drag.t === 'click') {
    if (!drag.moved && Math.hypot(s.x - drag.sx, s.y - drag.sy) > 6) drag.moved = true;
    if (drag.moved) { view.ox = drag.ox + s.x - drag.sx; view.oy = drag.oy + s.y - drag.sy; dirty(); }
  } else if (drag.t === 'move') {
    const p = toW(s.x, s.y); if (!drag.moved && Math.hypot(p.x - drag.last.x, p.y - drag.last.y) * zW() < 3) return;
    const o = drag.o;
    if (o.kind === 'pt' && S.snap) { const q = snapW(p); o.x = q.x; o.y = q.y; }
    else geo.moveMany([o], p.x - drag.last.x, p.y - drag.last.y, () => {}, snapW(p));
    drag.last = p; drag.moved = true; dirty(); renderGeoRowsSoon();
  } else if (drag.t === 'lit') {
    const r = drag.row, X = snapV(mx(s.x)), Y = snapV(my(s.y)), d = Math.max(2, Math.min(6, Math.ceil(Math.log10(view.ppu)) + 2));
    r.text = `(${+X.toFixed(d)}, ${+Y.toFixed(d)})`; const o = els.get(r.id); if (o) o.inp.value = r.text; recompute();
  }
});
const endPtr = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (!drag) return; const d = drag; drag = null; cv.style.cursor = geo.state.tool ? 'crosshair' : 'default';
  if (d.t === 'click' && !d.moved && e.type === 'pointerup') { geo.click(snapW(d.p), zW()); dirty(); }
  if (d.t === 'move') { if (d.moved) { pushHist(d.before); base = snapStr(); } renderGeoRows(); }
  if (d.t === 'lit') { pushHist(d.before); base = snapStr(); }
  if (d.t === 'pan') saveSoon();
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { hover = null; $('#tip').hidden = true; dirty(); });
cv.addEventListener('dblclick', () => { if (geo.state.tool) { geo.dblclick(); dirty(); } });
cv.addEventListener('wheel', e => { e.preventDefault(); const s = posOf(e), k = e.ctrlKey ? 0.012 : (e.deltaMode ? 0.05 : 0.0016); zoomAt(Math.exp(-e.deltaY * k), s.x, s.y); }, { passive: false });
let rgrT = 0; const renderGeoRowsSoon = () => { if (!rgrT) rgrT = setTimeout(() => { rgrT = 0; renderGeoRows(); }, 120); };
function updateHover(s) {
  const p = toW(s.x, s.y), tip = $('#tip'); let newH = { w: p }, txt = null, tx = s.x, ty = s.y;
  if (geo.state.tool) { hover = newH; tip.hidden = true; dirty(); return; }
  const o = geoAt(p); if (o) { newH.geo = o.id; cv.style.cursor = 'pointer'; } else cv.style.cursor = litPointAt(s) ? 'pointer' : 'default';
  const lp = litPointAt(s); if (lp) newH.row = lp.id;
  const fr = rows.find(q => q.id === focusId);
  if (fr && fnRows().includes(fr)) for (const q of poiList) { if (Math.hypot(sxOf(q.x) - s.x, syOf(q.y) - s.y) < 11) { newH.poi = q; txt = `${q.kind}  (${F(q.x)}, ${F(q.y)})`; tx = sxOf(q.x); ty = syOf(q.y); break; } }
  if (!txt && !o && !lp) {
    let best = null;
    for (const r of fnRows()) { const y = evalFn(r, mx(s.x)); if (!isFinite(y)) continue; const d = Math.abs(syOf(y) - s.y); if (d < 8 && (!best || d < best.d)) best = { d, r, y }; }
    if (best) { newH.trace = { x: mx(s.x), y: best.y, color: best.r.color }; txt = `(${F(mx(s.x))}, ${F(best.y)})`; tx = s.x; ty = syOf(best.y); cv.style.cursor = 'pointer'; }
  }
  hover = newH;
  if (txt) { tip.textContent = txt; tip.style.left = tx + 'px'; tip.style.top = ty + 'px'; tip.hidden = false; } else tip.hidden = true;
  dirty();
}
function closeKeypadFocus() { /* keep keypad open while tapping the canvas */ }

/* ───────── Floating buttons, settings, fullscreen ───────── */
$('#homeBtn').addEventListener('click', () => animateTo(homeView(), 420));
$('#zinBtn').addEventListener('click', () => zoomAt(1.4, W / 2, H / 2, true));
$('#zoutBtn').addEventListener('click', () => zoomAt(1 / 1.4, W / 2, H / 2, true));
$('#fsBtn').addEventListener('click', () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => toast('Full screen is not available here'));
  else toast('Full screen is not supported on this device');
});
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => $('#fsBtn').classList.toggle('on', !!(document.fullscreenElement || document.webkitFullscreenElement))));
const setEl = $('#settings');
function closeSettings() { if (!setEl.hidden) { setEl.hidden = true; $('#setBtn').classList.remove('on'); } }
$('#setBtn').addEventListener('click', e => { e.stopPropagation(); if (setEl.hidden) { renderSettings(); setEl.hidden = false; $('#setBtn').classList.add('on'); } else closeSettings(); });
document.addEventListener('pointerdown', e => { if (!setEl.hidden && !setEl.contains(e.target) && !e.target.closest('#setBtn')) closeSettings(); }, true);
function renderSettings() {
  setEl.replaceChildren();
  const sw = (label, key, extra) => { const el = h('div', { class: 'srow' + (S[key] ? ' on' : '') + (extra && extra() ? ' dis' : ''), role: 'switch', tabindex: '0', 'aria-checked': String(!!S[key]) }, [h('span', {}, [label]), h('span', { class: 'sw' })]); el.addEventListener('click', () => { S[key] = !S[key]; applySettings(); renderSettings(); }); el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); } }); return el; };
  const seg = (items, cur, set) => h('div', { class: 'seg' }, items.map(([v, l]) => h('button', { class: cur === v ? 'on' : '', on: { click: () => { set(v); applySettings(); renderSettings(); } } }, [l])));
  setEl.append(
    h('h3', {}, ['Grid & axes']),
    sw('Grid', 'grid'), sw('Minor gridlines', 'minor', () => !S.grid), sw('X axis', 'xaxis'), sw('Y axis', 'yaxis'), sw('Axis numbers', 'nums'),
    seg([[false, 'Cartesian'], [true, 'Polar']], S.polar, v => { S.polar = v; }),
    h('h3', {}, ['Calculation']),
    seg([[false, 'Radians'], [true, 'Degrees']], S.deg, v => { S.deg = v; }),
    seg([[2, '2 dp'], [4, '4 dp'], [6, '6 dp']], S.dec, v => { S.dec = v; }),
    h('h3', {}, ['Points']),
    sw('Snap points to grid', 'snap'), sw('Label new points', 'label'),
    h('div', { class: 'sbtns' }, [
      h('button', { on: { click: () => { animateTo(homeView(), 400); closeSettings(); } } }, ['Reset view']),
      h('button', { class: 'danger', on: { click: () => { closeSettings(); confirmBox('Clear every expression and construction?', 'Clear all', clearAll); } } }, ['Clear all'])]));
}
function applySettings() {
  M.setAngle(S.deg ? 'deg' : 'rad'); poiKey = ''; recompute(); renderGeoRows(); save();
}
function clearAll() { const b = snapStr(); rows = []; geoObjs = []; selIds = new Set(); focusId = null; ensureTail(); renderRows(); recompute(); renderGeoRows(); pushHist(b); base = snapStr(); }

/* ───────── Panels, rail, keypad ───────── */
function autoScroll(el) { let t; el.addEventListener('scroll', () => { el.classList.add('scrolling'); clearTimeout(t); t = setTimeout(() => el.classList.remove('scrolling'), 900); }, { passive: true }); }
['#algebra', '#toolsPane', '#settings'].forEach(q => autoScroll($(q)));
const panel = $('#panel');
function showPanel(name) {
  if (name === 'tools' && !geo.TOOLS.length) return;
  const same = panelTab === name && !panel.classList.contains('collapsed');
  panelTab = name; document.querySelectorAll('.rb').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  $('#algebra').hidden = name !== 'algebra'; $('#toolsPane').hidden = name !== 'tools';
  if (name === 'algebra' && geo.state.tool) geo.setTool(null);
  panel.classList.remove('collapsed'); if (same && narrow()) panel.classList.add('collapsed');
  if (name === 'tools') setKeypad(false);
  $('#kbBtn').hidden = name === 'tools';
}
const narrow = () => matchMedia('(max-width:760px)').matches, coarse = () => matchMedia('(pointer:coarse)').matches;
document.querySelectorAll('.rb').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.panel)));
$('#collapseBtn').addEventListener('click', () => panel.classList.add('collapsed'));
$('#openPanelBtn').addEventListener('click', () => showPanel(panelTab));
$('#clearBtn').addEventListener('click', () => confirmBox('Clear every expression and construction?', 'Clear all', clearAll));

let kpOpen = false, kpTab = '123';
const kp = $('#kpad');
function setKeypad(on) {
  kpOpen = on; kp.hidden = !on; $('#kbBtn').classList.toggle('on', on);
  if (on) { buildKeypad(); } for (const o of els.values()) { if (on && coarse()) o.inp.setAttribute('inputmode', 'none'); else o.inp.removeAttribute('inputmode'); }
}
$('#kbBtn').addEventListener('click', () => { setKeypad(!kpOpen); if (kpOpen && !lastInp) { const o = els.get(rows[rows.length - 1].id); o.inp.focus(); } });
const K = (label, ins, cls = '') => ({ label, ins, cls });
const NUM_KEYS = [
  K('x', 'x'), K('y', 'y'), K('7', '7'), K('8', '8'), K('9', '9'), K('÷', '/', 'op'),
  K('x<sup>2</sup>', '^2'), K('x<sup>n</sup>', '^'), K('4', '4'), K('5', '5'), K('6', '6'), K('×', '*', 'op'),
  K('√', 'sqrt(‸)', 'op'), K('π', 'pi'), K('1', '1'), K('2', '2'), K('3', '3'), K('−', '-', 'op'),
  K('(', '('), K(')', ')'), K('0', '0'), K('.', '.'), K(',', ','), K('+', '+', 'op'),
  K('&lt;', '<'), K('&gt;', '>'), K('≤', '<='), K('≥', '>='), K('=', '='), K('|a|', 'abs(‸)'),
  K('!', '!'), K('θ', 'theta'), K('←', '@left', 'op'), K('→', '@right', 'op'), K('⌫', '@bs', 'op'), K('↵', '@enter', 'go'),
];
const FN_SECTIONS = [
  ['Trigonometry', [['sin', 'sin(‸)'], ['cos', 'cos(‸)'], ['tan', 'tan(‸)'], ['csc', 'csc(‸)'], ['sec', 'sec(‸)'], ['cot', 'cot(‸)'], ['°', '°'], ['sin²', 'sin^2(‸)']]],
  ['Inverse trigonometry', [['sin⁻¹', 'asin(‸)'], ['cos⁻¹', 'acos(‸)'], ['tan⁻¹', 'atan(‸)'], ['csc⁻¹', 'acsc(‸)'], ['sec⁻¹', 'asec(‸)'], ['cot⁻¹', 'acot(‸)'], ['atan2', 'atan2(‸, x)']]],
  ['Hyperbolic', [['sinh', 'sinh(‸)'], ['cosh', 'cosh(‸)'], ['tanh', 'tanh(‸)'], ['csch', 'csch(‸)'], ['sech', 'sech(‸)'], ['coth', 'coth(‸)'], ['sinh⁻¹', 'asinh(‸)'], ['cosh⁻¹', 'acosh(‸)'], ['tanh⁻¹', 'atanh(‸)']]],
  ['Exponential & logarithm', [['eˣ', 'e^(‸)'], ['exp', 'exp(‸)'], ['ln', 'ln(‸)'], ['log', 'log(‸)'], ['log₂', 'log2(‸)'], ['logₐ', 'log(‸, 2)'], ['10ˣ', '10^(‸)'], ['xʸ', '^(‸)']]],
  ['Roots & absolute value', [['√', 'sqrt(‸)'], ['∛', 'cbrt(‸)'], ['ⁿ√', 'root(‸, 3)'], ['|x|', 'abs(‸)'], ['sign', 'sign(‸)'], ['x²', '^2'], ['x³', '^3'], ['1/x', '1/(‸)']]],
  ['Calculus', [['d/dx', 'deriv(‸, x, x)'], ['f′(x)', "'"], ['∫ₐᵇ', 'integral(‸, t, 0, 1)'], ['∫ₐˣ', 'integral(‸, t, 0, x)'], ['Σ', 'sum(‸, k, 1, 10)'], ['Π', 'prod(‸, k, 1, 10)'], ['lim', 'limit(‸, x, 0)'], ['∞', 'infinity']]],
  ['Rounding & numbers', [['floor', 'floor(‸)'], ['ceil', 'ceil(‸)'], ['round', 'round(‸)'], ['trunc', 'trunc(‸)'], ['fract', 'fract(‸)'], ['mod', 'mod(‸, 2)'], ['gcd', 'gcd(‸, 12)'], ['lcm', 'lcm(‸, 12)'], ['min', 'min(‸, 0)'], ['max', 'max(‸, 0)']]],
  ['Combinatorics & special', [['n!', '!'], ['nCr', 'nCr(‸, 2)'], ['nPr', 'nPr(‸, 2)'], ['Γ(x)', 'gamma(‸)'], ['erf', 'erf(‸)'], ['e', 'e'], ['τ', 'tau'], ['φ', 'phi']]],
];
const ABC_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'λ', 'μ', 'ρ', 'σ', 'φ', 'ω', 'Δ'];
function buildKeypad() {
  kp.replaceChildren();
  const tabs = h('div', { class: 'ktabs' }, [['123', '123'], ['fn', 'f(x)'], ['abc', 'ABC']].map(([id, l]) => h('button', { class: 'ktab' + (kpTab === id ? ' on' : ''), on: { click: () => { kpTab = id; buildKeypad(); } } }, [l])));
  tabs.append(h('button', { class: 'kx', title: 'Close keypad', 'aria-label': 'Close keypad', type: 'button', on: { click: () => setKeypad(false) } }, ['×']));
  const body = h('div', { class: 'kbody' }); kp.append(tabs, body); autoScroll(body);
  const key = (k) => { const b = h('button', { class: 'k ' + k.cls, html: k.label, type: 'button' }); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => press(k.ins)); return b; };
  if (kpTab === '123') body.append(h('div', { class: 'kgrid', style: 'grid-template-columns:repeat(6,1fr)' }, NUM_KEYS.map(key)));
  if (kpTab === 'fn') for (const [t, items] of FN_SECTIONS) body.append(h('div', { class: 'kh' }, [t]), h('div', { class: 'kgrid', style: 'grid-template-columns:repeat(4,1fr)' }, items.map(([l, i]) => key(K(l, i, 'fn')))));
  if (kpTab === 'abc') {
    ABC_ROWS.forEach((row, ri) => { const ks = [...row].map(c => K(c, c)); if (ri === 2) ks.push(K('⌫', '@bs', 'op')); body.append(h('div', { class: 'kgrid', style: 'grid-template-columns:repeat(10,1fr);margin-bottom:5px;' + (ri === 1 ? 'padding:0 5%' : ri === 2 ? '' : '') }, ks.map(key))); });
    body.append(h('div', { class: 'kgrid', style: 'grid-template-columns:repeat(6,1fr);margin-bottom:5px' }, GREEK.map(g => key(K(g, g)))),
      h('div', { class: 'kgrid', style: 'grid-template-columns:1fr 1fr 3fr 1.4fr' }, [key(K('_', '_')), key(K("'", "'")), key(K('space', ' ')), key(K('↵', '@enter', 'go'))]));
  }
}
function press(ins) {
  let inp = lastInp && document.contains(lastInp) ? lastInp : null;
  if (!inp) { const o = els.get(rows[rows.length - 1].id); inp = o.inp; }
  inp.focus();
  if (ins === '@enter') { const r = rows.find(q => els.get(q.id).inp === inp); if (r) rowKey({ key: 'Enter', preventDefault() {}, stopPropagation() {} }, r, inp); return; }
  let s = inp.selectionStart, e = inp.selectionEnd, v = inp.value;
  if (ins === '@left') { inp.setSelectionRange(Math.max(0, s - 1), Math.max(0, s - 1)); return; }
  if (ins === '@right') { inp.setSelectionRange(s + 1, s + 1); return; }
  if (ins === '@bs') { if (s === e && s > 0) s--; inp.value = v.slice(0, s) + v.slice(e); inp.setSelectionRange(s, s); inp.dispatchEvent(new Event('input')); return; }
  let caret = ins.indexOf('‸'), txt = ins.replace('‸', '');
  const sel = v.slice(s, e); if (caret >= 0 && sel) { txt = ins.replace('‸', sel); caret = -1; }   // wrap the selection
  inp.value = v.slice(0, s) + txt + v.slice(e);
  const pos = s + (caret >= 0 ? caret : txt.length); inp.setSelectionRange(pos, pos); inp.dispatchEvent(new Event('input'));
}

/* ───────── Sidebar ───────── */
const sidebar = $('#sidebar'), scrim = $('#scrim');
function toggleSidebar(open) { open = open ?? !sidebar.classList.contains('open'); sidebar.classList.toggle('open', open); scrim.hidden = !open; }
$('#sidebarBtn').addEventListener('click', () => toggleSidebar()); scrim.addEventListener('click', () => toggleSidebar(false));
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
$('#exportPng').addEventListener('click', () => { frame(); cv.toBlob(b => download(b, 'graph.png')); toggleSidebar(false); });
$('#saveJson').addEventListener('click', () => { download(new Blob([JSON.stringify(serialize())], { type: 'application/json' }), 'graph.json'); toggleSidebar(false); });
$('#openJson').addEventListener('click', () => $('#fileJson').click());
$('#fileJson').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { load(JSON.parse(t)); toggleSidebar(false); toast('Graph file opened'); } catch (er) { toast('Not a valid graph file', 1800); } }); e.target.value = ''; });

/* ───────── Save / load ───────── */
const serialize = () => ({ v: 1, rows: rows.map(({ id, text, color, hidden, val, min, max }) => ({ id, text, color, hidden, val, min, max })), geo: geoObjs, S, view: { ...view } });
let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 400); };
function save() { try { localStorage.setItem(LS, JSON.stringify(serialize())); } catch (e) { } }
function load(d) {
  if (!d || !Array.isArray(d.rows)) throw new Error('bad');
  rows = d.rows.map(r => ({ ...newRow(), ...r })); geoObjs = Array.isArray(d.geo) ? d.geo : []; Object.assign(S, d.S || {});
  if (d.view && d.view.ppu) { Object.assign(view, d.view); loadedView = true; }
  M.setAngle(S.deg ? 'deg' : 'rad'); selIds = new Set(); focusId = null; hist = []; fut = []; ensureTail(); renderRows(); recompute(); renderGeoRows(); syncUndo(); base = snapStr(); dirty();
}

/* ───────── Keyboard ───────── */
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === 'escape') { geo.cancel(); geo.setTool(null); selIds = new Set(); closeSettings(); toggleSidebar(false); renderGeoRows(); dirty(); return; }
  if (typing) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if ((k === 'delete' || k === 'backspace') && selIds.size) { e.preventDefault(); delGeo([...selIds]); }
  else if (k === 'enter' && geo.state.tool) geo.finish();
  else if (k === '+' || k === '=') zoomAt(1.25, W / 2, H / 2, true);
  else if (k === '-') zoomAt(1 / 1.25, W / 2, H / 2, true);
  else if (k === '0' && !mod) animateTo(homeView(), 350);
});
$('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);

/* ───────── Init ───────── */
(function init() {
  buildTools();
  let d = null; try { d = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { }
  if (d) { try { load(d); } catch (e) { d = null; } }
  if (!d) { rows = [newRow()]; renderRows(); recompute(); }
  base = snapStr(); syncUndo(); renderGeoRows();
  if (narrow()) panel.classList.add('collapsed');
  resize();
  window.__g = { get rows() { return rows; }, get geo() { return geoObjs; }, get view() { return view; }, S, comp: () => comp, scope: () => scope, sel: () => selIds, E: () => scope };
})();
})();

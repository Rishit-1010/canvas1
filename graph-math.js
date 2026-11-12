/* Graph calculator maths: tokenizer, parser, compiler and numeric calculus.
 * analyze(text, known) turns one algebra line into a plottable description. */
window.GMath = (() => {
'use strict';
const PI = Math.PI, D2R = PI / 180;
let DEG = false;
const setAngle = m => { DEG = m === 'deg'; };

/* ───── special functions ───── */
const G = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function gamma(z) {
  if (z < 0.5) return PI / (Math.sin(PI * z) * gamma(1 - z));
  z -= 1; let x = 0.99999999999980993; for (let i = 0; i < 8; i++) x += G[i] / (z + i + 1);
  const t = z + 7.5; return Math.sqrt(2 * PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
const fact = n => { if (n >= 0 && Number.isInteger(n)) { if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; } return gamma(n + 1); };
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; };
const nCr = (n, r) => { if (r < 0 || r > n) return 0; r = Math.min(r, n - r); let v = 1; for (let i = 1; i <= r; i++) v = v * (n - r + i) / i; return Math.round(v); };
const nPr = (n, r) => { if (r < 0 || r > n) return 0; let v = 1; for (let i = 0; i < r; i++) v *= (n - i); return v; };
const pow = (a, b) => {
  if (a < 0 && !Number.isInteger(b)) {
    for (const d of [3, 5, 7, 9, 11]) { const n = b * d; if (Math.abs(n - Math.round(n)) < 1e-9) return (Math.round(n) % 2 === 0 ? 1 : -1) * Math.pow(-a, b); }
    return NaN;
  }
  return Math.pow(a, b);
};
const tr = f => x => f(DEG ? x * D2R : x), itr = f => x => { const v = f(x); return DEG ? v / D2R : v; };
const sinh = Math.sinh, cosh = Math.cosh;
const FN = {
  sin: tr(Math.sin), cos: tr(Math.cos), tan: tr(Math.tan),
  csc: tr(x => 1 / Math.sin(x)), sec: tr(x => 1 / Math.cos(x)), cot: tr(x => 1 / Math.tan(x)),
  asin: itr(Math.asin), acos: itr(Math.acos), atan: itr(Math.atan),
  acsc: itr(x => Math.asin(1 / x)), asec: itr(x => Math.acos(1 / x)), acot: itr(x => PI / 2 - Math.atan(x)),
  sinh, cosh, tanh: Math.tanh, csch: x => 1 / sinh(x), sech: x => 1 / cosh(x), coth: x => cosh(x) / sinh(x),
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  acsch: x => Math.asinh(1 / x), asech: x => Math.acosh(1 / x), acoth: x => Math.atanh(1 / x),
  exp: Math.exp, ln: Math.log, log2: Math.log2, log10: Math.log10,
  log: (x, b) => b == null ? Math.log10(x) : Math.log(x) / Math.log(b),
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
  root: (x, n) => (x < 0 && n % 2 !== 0) ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n),
  floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, fract: x => x - Math.floor(x),
  round: (x, n) => { n = n || 0; const m = Math.pow(10, n); return Math.round(x * m) / m; },
  mod: (a, b) => ((a % b) + b) % b, gcd, lcm: (a, b) => (!a || !b) ? 0 : Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b),
  min: Math.min, max: Math.max, hypot: Math.hypot, atan2: (y, x) => itr(Math.atan2)(y, x) ,
  nCr, nPr, gamma, erf, factorial: fact,
  deg: x => x / D2R, rad: x => x * D2R,
};
['asin', 'acos', 'atan', 'acsc', 'asec', 'acot', 'asinh', 'acosh', 'atanh', 'acsch', 'asech', 'acoth'].forEach(n => { FN['arc' + n.slice(1)] = FN[n]; });
FN.sgn = FN.sign; FN.ncr = nCr; FN.npr = nPr; FN.lg = FN.log10; FN.arctan2 = FN.atan2;
const CONST = { pi: PI, e: Math.E, tau: 2 * PI, phi: (1 + Math.sqrt(5)) / 2, infinity: Infinity, inf: Infinity };
const SPECIAL = new Set(['sum', 'prod', 'integral', 'int', 'deriv', 'limit', 'lim']);
const RESERVED = new Set([...Object.keys(FN), ...Object.keys(CONST), ...SPECIAL]);
const WORDS = [...RESERVED, 'theta'];

/* ───── tokenizer ───── */
function norm(s) {
  return s.replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, ' pi ').replace(/θ/g, ' theta ')
    .replace(/√/g, ' sqrt ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/²/g, '^2').replace(/³/g, '^3').replace(/∞/g, ' infinity ')
    .replace(/∫/g, ' integral ').replace(/∑/g, ' sum ').replace(/∏/g, ' prod ');
}
function tokenize(src, isKnown) {
  const s = norm(src), T = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    let m;
    if ((m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i)))) { T.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-zΑ-Ωα-ω]+(?:_\{[A-Za-z0-9]+\}|_[A-Za-z0-9]+)?/.exec(s.slice(i)))) {
      let w = m[0].replace(/[{}]/g, ''); i += m[0].length;
      for (const p of splitWord(w, isKnown)) T.push({ t: 'id', v: p }); continue;
    }
    if ('+-*/^(),!\'<>=°|{}'.includes(c)) {
      if ((c === '<' || c === '>') && s[i + 1] === '=') { T.push({ t: 'op', v: c + '=' }); i += 2; continue; }
      T.push({ t: 'op', v: c }); i++; continue;
    }
    throw new Error('Unexpected "' + c + '"');
  }
  return T;
}
function splitWord(w, isKnown) {
  if (isKnown(w) || w.includes('_')) return [w];
  const out = []; let i = 0;
  while (i < w.length) {
    let best = null;
    for (let l = Math.min(w.length - i, 10); l >= 2; l--) { const sub = w.slice(i, i + l); if (isKnown(sub)) { best = sub; break; } }
    if (!best) best = w[i];
    out.push(best); i += best.length;
  }
  return out;
}

/* ───── parser ───── */
class Parser {
  constructor(toks, known) { this.t = toks; this.i = 0; this.k = known; }
  peek() { return this.t[this.i]; } next() { return this.t[this.i++]; }
  isOp(v) { const k = this.peek(); return !!k && k.t === 'op' && k.v === v; }
  expect(v) { if (!this.isOp(v)) throw new Error('Expected "' + v + '"'); this.i++; }
  isFn(n) { return !!FN[n] || this.k.fns.has(n); }
  relation() {
    const parts = [this.add()], ops = [];
    while (this.peek() && this.peek().t === 'op' && ['<', '>', '<=', '>=', '='].includes(this.peek().v)) { ops.push(this.next().v); parts.push(this.add()); }
    if (this.peek()) throw new Error('Unexpected "' + (this.peek().v) + '"');
    return { parts, ops };
  }
  add() { let l = this.mul(); while (this.isOp('+') || this.isOp('-')) { const o = this.next().v; l = { n: 'bin', o, l, r: this.mul() }; } return l; }
  startsPrimary() { const k = this.peek(); return !!k && (k.t === 'num' || k.t === 'id' || (k.t === 'op' && k.v === '(')); }
  mul() {
    let l = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) { const o = this.next().v; l = { n: 'bin', o, l, r: this.unary() }; }
      else if (this.startsPrimary()) l = { n: 'bin', o: '*', l, r: this.unary() };
      else break;
    }
    return l;
  }
  unary() { if (this.isOp('-')) { this.next(); return { n: 'neg', a: this.unary() }; } if (this.isOp('+')) { this.next(); return this.unary(); } return this.power(); }
  power() { const b = this.postfix(); if (this.isOp('^')) { this.next(); return { n: 'bin', o: '^', l: b, r: this.unary() }; } return b; }
  postfix() {
    let a = this.primary();
    for (;;) {
      if (this.isOp('!') && !(this.t[this.i + 1] && this.t[this.i + 1].v === '=')) { this.next(); a = { n: 'fact', a }; }
      else if (this.isOp('°')) { this.next(); a = { n: 'bin', o: '*', l: a, r: { n: 'num', v: D2R } }; }
      else break;
    }
    return a;
  }
  args() {
    this.expect('('); const a = [];
    if (this.isOp(')')) { this.next(); return a; }
    for (;;) { a.push(this.add()); if (this.isOp(',')) { this.next(); continue; } break; }
    this.expect(')'); return a;
  }
  primary() {
    const k = this.next(); if (!k) throw new Error('Unfinished expression');
    if (k.t === 'num') return { n: 'num', v: k.v };
    if (k.t === 'op' && k.v === '(') {
      const first = this.add();
      if (this.isOp(',')) { const items = [first]; while (this.isOp(',')) { this.next(); items.push(this.add()); } this.expect(')'); return { n: 'tuple', items }; }
      this.expect(')'); return { n: 'par', a: first };
    }
    if (k.t === 'op' && k.v === '|') { const a = this.add(); this.expect('|'); return { n: 'call', name: 'abs', args: [a] }; }
    if (k.t !== 'id') throw new Error('Unexpected "' + k.v + '"');
    const name = k.v;
    if (SPECIAL.has(name)) return { n: 'sp', name: ({ int: 'integral', lim: 'limit' })[name] || name, args: this.args() };
    if (this.k.fns.has(name) && this.isOp("'")) {
      let order = 0; while (this.isOp("'")) { this.next(); order++; }
      return { n: 'dcall', name, order, args: this.args() };
    }
    if (this.isFn(name)) {
      let pw = null;
      if (this.isOp('^')) { this.next(); pw = this.unary0(); }
      const args = this.isOp('(') ? this.args() : [this.power()];
      if (pw && pw.n === 'neg' && pw.a.n === 'num' && pw.a.v === 1 && FN['a' + name]) return { n: 'call', name: 'a' + name, args };   // sin^-1(x)
      const call = { n: 'call', name, args };
      return pw ? { n: 'bin', o: '^', l: call, r: pw } : call;
    }
    return { n: 'var', name };
  }
  unary0() { if (this.isOp('-')) { this.next(); return { n: 'neg', a: this.unary0() }; } return this.postfix(); }
}

/* ───── numeric calculus ───── */
function deriv1(f, x) {
  const h = 1e-3 * Math.max(1, Math.abs(x));
  return (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h);
}
function derivN(f, n, x) {
  if (n <= 0) return f(x); if (n === 1) return deriv1(f, x);
  const h = 4e-3 * Math.max(1, Math.abs(x)); return (derivN(f, n - 1, x + h) - derivN(f, n - 1, x - h)) / (2 * h);
}
function simpson(f, a, b) {
  if (a === b) return 0; let sign = 1; if (a > b) { [a, b] = [b, a]; sign = -1; }
  if (!isFinite(a) || !isFinite(b)) {            // infinite limits via x = tan substitution
    const g = u => { const x = Math.tan(u), c = Math.cos(u); return f(x) / (c * c); };
    const lo = isFinite(a) ? Math.atan(a) : -PI / 2 + 1e-9, hi = isFinite(b) ? Math.atan(b) : PI / 2 - 1e-9; return sign * simpson(g, lo, hi);
  }
  const rec = (a, b, fa, fm, fb, whole, tol, d) => {
    const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2, flm = f(lm), frm = f(rm);
    const l = (m - a) / 6 * (fa + 4 * flm + fm), r = (b - m) / 6 * (fm + 4 * frm + fb);
    if (d <= 0 || Math.abs(l + r - whole) <= 15 * tol) return l + r + (l + r - whole) / 15;
    return rec(a, m, fa, flm, fm, l, tol / 2, d - 1) + rec(m, b, fm, frm, fb, r, tol / 2, d - 1);
  };
  const N = 16; let tot = 0, h = (b - a) / N;
  for (let i = 0; i < N; i++) { const x0 = a + i * h, x1 = x0 + h, fa = f(x0), fb = f(x1), fm = f((x0 + x1) / 2); tot += rec(x0, x1, fa, fm, fb, h / 6 * (fa + 4 * fm + fb), 1e-9 / N, 14); }
  return sign * tot;
}

/* ───── compiler: AST → function(E) ───── */
function compile(node, bound, free, known) {
  const c = n => compile(n, bound, free, known);
  switch (node.n) {
    case 'num': { const v = node.v; return () => v; }
    case 'par': return c(node.a);
    case 'neg': { const a = c(node.a); return E => -a(E); }
    case 'fact': { const a = c(node.a); return E => fact(a(E)); }
    case 'tuple': { const it = node.items.map(c); const f = E => it.map(g => g(E)); f.tuple = true; return f; }
    case 'var': {
      const nm = node.name;
      if (!bound.has(nm) && !known.vars.has(nm) && nm in CONST) { const v = CONST[nm]; return () => v; }
      if (!bound.has(nm)) free.add(nm);
      return E => { const v = E[nm]; return v === undefined ? NaN : v; };
    }
    case 'bin': {
      const l = c(node.l), r = c(node.r);
      switch (node.o) {
        case '+': return E => l(E) + r(E); case '-': return E => l(E) - r(E);
        case '*': return E => l(E) * r(E); case '/': return E => l(E) / r(E);
        default: return E => pow(l(E), r(E));
      }
    }
    case 'call': {
      const nm = node.name, a = node.args.map(c);
      if (FN[nm]) {
        const f = FN[nm];
        if (a.length === 1) { const a0 = a[0]; return E => f(a0(E)); }
        return E => f(...a.map(g => g(E)));
      }
      free.add(nm);
      return E => { const f = E.__fn && E.__fn[nm]; return f ? f(...a.map(g => g(E))) : NaN; };
    }
    case 'dcall': {
      const nm = node.name, a = c(node.args[0]), ord = node.order;
      return E => { const f = E.__fn && E.__fn[nm]; if (!f) return NaN; return derivN(x => f(x), ord, a(E)); };
    }
    case 'sp': return special(node, bound, free, known);
  }
  throw new Error('Cannot evaluate');
}
function special(node, bound, free, known) {
  const A = node.args, nm = node.name;
  const idName = n => { if (!n || n.n !== 'var') throw new Error(nm + ' needs a variable name'); return n.name; };
  if (nm === 'sum' || nm === 'prod') {
    if (A.length !== 4) throw new Error(nm + '(expr, k, from, to)');
    const k = idName(A[1]), b2 = new Set(bound); b2.add(k);
    const body = compile(A[0], b2, free, known), lo = compile(A[2], bound, free, known), hi = compile(A[3], bound, free, known);
    return E => { const L = Object.create(E); let s = nm === 'sum' ? 0 : 1; const a = Math.round(lo(E)), b = Math.round(hi(E)); if (b - a > 200000) return NaN; for (let i = a; i <= b; i++) { L[k] = i; s = nm === 'sum' ? s + body(L) : s * body(L); } return s; };
  }
  if (nm === 'integral') {
    let k = 'x', ex = A[0], lo, hi;
    if (A.length === 4) { k = idName(A[1]); lo = A[2]; hi = A[3]; } else if (A.length === 3) { lo = A[1]; hi = A[2]; } else throw new Error('integral(expr, x, from, to)');
    const b2 = new Set(bound); b2.add(k);
    const body = compile(ex, b2, free, known), l = compile(lo, bound, free, known), h = compile(hi, bound, free, known);
    return E => { const L = Object.create(E); return simpson(t => { L[k] = t; return body(L); }, l(E), h(E)); };
  }
  if (nm === 'deriv') {
    if (A.length < 2) throw new Error('deriv(expr, x, at)');
    const k = idName(A[1]), b2 = new Set(bound); b2.add(k);
    const body = compile(A[0], b2, free, known), at = A[2] ? compile(A[2], bound, free, known) : (free.add(k), E => E[k]);
    return E => { const L = Object.create(E); return derivN(t => { L[k] = t; return body(L); }, 1, at(E)); };
  }
  if (nm === 'limit') {
    if (A.length !== 3) throw new Error('limit(expr, x, to)');
    const k = idName(A[1]), b2 = new Set(bound); b2.add(k);
    const body = compile(A[0], b2, free, known), to = compile(A[2], bound, free, known);
    return E => {
      const L = Object.create(E), a = to(E), f = t => { L[k] = t; return body(L); };
      if (!isFinite(a)) { const s = a > 0 ? 1 : -1, v1 = f(s * 1e6), v2 = f(s * 1e8); return Math.abs(v1 - v2) < 1e-3 * Math.max(1, Math.abs(v2)) ? v2 : (Math.abs(v2) > Math.abs(v1) ? s * Infinity * Math.sign(v2) : NaN); }
      const h = 1e-7 * Math.max(1, Math.abs(a)), l = f(a - h), r = f(a + h);
      if (Math.abs(l - r) <= 1e-4 * Math.max(1, Math.abs(l), Math.abs(r))) return (l + r) / 2;
      return NaN;
    };
  }
  throw new Error('Unknown function');
}

/* ───── analysis of one algebra line ───── */
const cmp = { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b + 1e-12, '>=': (a, b) => a >= b - 1e-12, '=': (a, b) => Math.abs(a - b) < 1e-9 };
const DEF_RE = /^\s*([A-Za-z](?:_\w+)?|[A-Za-z]{2,})\s*\(\s*([A-Za-z](?:_\w+)?(?:\s*,\s*[A-Za-z](?:_\w+)?)*)\s*\)\s*=(?!=)/;

function build(src, known) {
  const isKnown = w => RESERVED.has(w) || w === 'theta' || known.vars.has(w) || known.fns.has(w);
  const toks = tokenize(src, isKnown), P = new Parser(toks, known), free = new Set();
  const rel = P.relation();
  const fs = rel.parts.map(p => compile(p, new Set(), free, known));
  return { rel, fs, free, parts: rel.parts };
}
function domainOf(txt, known) {
  if (!txt) return null;
  const items = txt.split(';').join(',').split(',').filter(s => s.trim());
  const tests = items.map(s => { const b = build(s, known); if (!b.rel.ops.length) throw new Error('Restriction needs a comparison'); return chainTest(b); });
  return E => tests.every(t => t(E));
}
function chainTest(b) {
  return E => { for (let i = 0; i < b.rel.ops.length; i++) if (!cmp[b.rel.ops[i]](b.fs[i](E), b.fs[i + 1](E))) return false; return true; };
}
const isVar = (n, name) => n && (n.n === 'var' || (n.n === 'par' && false)) && (name ? n.name === name : true);
const lit = n => { while (n && n.n === 'par') n = n.a; if (!n) return null; if (n.n === 'num') return n.v; if (n.n === 'neg' && n.a.n === 'num') return -n.a.v; return null; };

function analyze(text, known) {
  let src = (text || '').trim(); if (!src) return { kind: 'empty' };
  try {
    let dom = null; const m = /\{([^{}]*)\}\s*$/.exec(src);
    if (m) { src = src.slice(0, m.index).trim(); dom = domainOf(m[1], known); }
    const d = DEF_RE.exec(src);
    if (d && !RESERVED.has(d[1]) && !/^[xy]$/.test(d[1])) {
      const params = d[2].split(',').map(s => s.trim()), k2 = { vars: new Set([...known.vars, ...params]), fns: new Set(known.fns) };
      const body = src.slice(d[0].length), toks = tokenize(body, w => RESERVED.has(w) || k2.vars.has(w) || k2.fns.has(w));
      const P = new Parser(toks, k2), free = new Set(), ast = P.relation();
      if (ast.ops.length) throw new Error('A function definition cannot contain a comparison');
      const f = compile(ast.parts[0], new Set(params), free, k2);
      return { kind: 'def', name: d[1], params, f, free, dom, plot: params.length === 1 && !f.tuple };
    }
    const b = build(src, known), { rel, fs, free } = b;
    const hasX = free.has('x'), hasY = free.has('y'), hasT = free.has('t') && !known.vars.has('t');
    const named = (n) => n && n.n === 'var' ? n.name : null;
    if (!rel.ops.length) {
      const f = fs[0];
      if (f.tuple) {
        if (f.length === 0) throw new Error('Empty point');
        const items = b.parts[0].items || [];
        if (items.length !== 2) throw new Error('Points need two coordinates');
        if (hasT) return { kind: 'param', fx: compile(items[0], new Set(), new Set(), known), fy: compile(items[1], new Set(), new Set(), known), free, dom };
        if (hasX || hasY) throw new Error('Use t as the parameter, e.g. (cos(t), sin(t))');
        return { kind: 'point', fx: compile(items[0], new Set(), new Set(), known), fy: compile(items[1], new Set(), new Set(), known), free, lit: items.map(lit).every(v => v != null) ? items.map(lit) : null };
      }
      if (hasY && !hasX) throw new Error('Write an equation such as y = …');
      if (hasX) return { kind: 'fn', f, free, dom };
      return { kind: 'value', f, free, plain: b.parts[0] };
    }
    if (rel.ops.length === 1 && rel.ops[0] === '=') {
      const [L, R] = rel.parts, [fl, fr] = fs, ln = named(L);
      const rf = new Set(); compile(R, new Set(), rf, known);
      if (ln === 'y' && !rf.has('y')) return { kind: 'fn', f: fr, free, dom };
      if (ln === 'x' && !rf.has('x')) return { kind: 'xfn', f: fr, free, dom };
      if (ln === 'r' && !known.vars.has('r')) return { kind: 'polar', f: fr, free, dom };
      if (ln && ln !== 'x' && ln !== 'y' && !rf.has('x') && !rf.has('y')) {
        if (ln in CONST || RESERVED.has(ln)) throw new Error('"' + ln + '" is a built-in name');
        const fr2 = fr; const free2 = new Set(rf);
        return { kind: 'var', name: ln, f: fr2, free: free2, lit: lit(R) };
      }
      if (!hasX && !hasY) throw new Error('Nothing to graph');
      const F = E => fl(E) - fr(E); return { kind: 'implicit', F, free, dom };
    }
    if (!hasX && !hasY) throw new Error('Nothing to graph');
    const test = chainTest(b);
    const F = rel.ops.length === 1 ? (E => fs[0](E) - fs[1](E)) : null;
    return { kind: 'ineq', test, F, strict: rel.ops.length === 1 && (rel.ops[0] === '<' || rel.ops[0] === '>'), free, dom };
  } catch (e) { return { kind: 'error', msg: e.message || String(e) }; }
}

/* ───── formatting ───── */
function fmt(v, dec = 4) {
  if (typeof v !== 'number' || isNaN(v)) return 'undefined';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-6) return v.toExponential(Math.min(dec, 6)).replace(/\.?0+e/, 'e').replace('e+', '×10^').replace('e', '×10^');
  let s = v.toFixed(dec); if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return (s === '-0' ? '0' : s).replace('-', '−');
}

return { analyze, fmt, setAngle, FN, CONST, RESERVED, WORDS, derivN, simpson, deriv1, tokenize };
})();

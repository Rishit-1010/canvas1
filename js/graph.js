/**
 * graph.js – Graphing Calculator engine
 * Inspired by Desmos / GeoGebra Classic.
 * Uses math.js for expression parsing & evaluation.
 * Canvas 2D rendering with pan/zoom, grid, multiple expressions.
 */

const Graph = (() => {
  let canvas, ctx, container;
  let width = 0, height = 0, dpr = 1;

  // View (world coordinates)
  let xMin = -10, xMax = 10, yMin = -10, yMax = 10;
  let showGrid = true, showMinorGrid = true, showAxes = true, showLabels = true, equalAspect = true;

  // Expressions
  let expressions = [];
  let activeExprId = null;

  // Interaction
  let isPanning = false;
  let panStart = null;

  // Keypad
  let keypadOpen = false;
  let currentKeypadTab = 'basic';

  // Colors for expressions
  const EXPR_COLORS = [
    '#2563eb', '#dc2626', '#16a34a', '#ca8a04',
    '#7c3aed', '#db2777', '#0891b2', '#ea580c'
  ];

  function init() {
    canvas = document.getElementById('graph-canvas');
    container = document.getElementById('graph-canvas-container');
    resize();
    window.addEventListener('resize', () => {
      if (document.getElementById('graph-view').classList.contains('active')) resize();
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    document.getElementById('graph-home').addEventListener('click', resetView);
    document.getElementById('graph-zoom-in').addEventListener('click', () => zoom(0.8));
    document.getElementById('graph-zoom-out').addEventListener('click', () => zoom(1.25));

    document.getElementById('btn-toggle-eq-sidebar').addEventListener('click', toggleEqSidebar);
    document.getElementById('btn-toggle-keypad').addEventListener('click', toggleKeypad);
    document.getElementById('btn-add-expression').addEventListener('click', () => addExpression(''));

    setupSettings();

    document.querySelectorAll('.keypad-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.keypad-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentKeypadTab = tab.dataset.tab;
        renderKeypad();
      });
    });

    addExpression('y = x');
    addExpression('y = x^2');
    renderKeypad();
    render();
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    width = rect.width;
    height = rect.height;
    const result = Utils.setupHiDPICanvas(canvas, width, height);
    ctx = result.ctx;
    dpr = result.dpr;
    if (equalAspect) enforceAspect();
    render();
  }

  function enforceAspect() {
    const aspect = width / height;
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const currentAspect = xRange / yRange;
    if (Math.abs(currentAspect - aspect) > 0.01) {
      const midY = (yMin + yMax) / 2;
      const newYRange = xRange / aspect;
      yMin = midY - newYRange / 2;
      yMax = midY + newYRange / 2;
    }
  }

  function worldToScreen(wx, wy) {
    const sx = ((wx - xMin) / (xMax - xMin)) * width;
    const sy = height - ((wy - yMin) / (yMax - yMin)) * height;
    return { x: sx, y: sy };
  }

  function screenToWorld(sx, sy) {
    const wx = xMin + (sx / width) * (xMax - xMin);
    const wy = yMin + ((height - sy) / height) * (yMax - yMin);
    return { x: wx, y: wy };
  }

  function onPointerDown(e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    isPanning = true;
    const rect = canvas.getBoundingClientRect();
    panStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      xMin, xMax, yMin, yMax
    };
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!isPanning || !panStart) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const dx = (sx - panStart.x) / width * (panStart.xMax - panStart.xMin);
    const dy = (panStart.y - sy) / height * (panStart.yMax - panStart.yMin);
    xMin = panStart.xMin - dx;
    xMax = panStart.xMax - dx;
    yMin = panStart.yMin - dy;
    yMax = panStart.yMax - dy;
    render();
  }

  function onPointerUp(e) {
    isPanning = false;
    panStart = null;
    canvas.style.cursor = 'default';
    canvas.releasePointerCapture?.(e.pointerId);
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    zoomAt(factor, sx, sy);
  }

  function zoom(factor) {
    zoomAt(factor, width / 2, height / 2);
  }

  function zoomAt(factor, sx, sy) {
    const world = screenToWorld(sx, sy);
    const newXRange = (xMax - xMin) * factor;
    const newYRange = (yMax - yMin) * factor;
    const rx = (world.x - xMin) / (xMax - xMin);
    const ry = (world.y - yMin) / (yMax - yMin);
    xMin = world.x - rx * newXRange;
    xMax = world.x + (1 - rx) * newXRange;
    yMin = world.y - ry * newYRange;
    yMax = world.y + (1 - ry) * newYRange;
    render();
  }

  function resetView() {
    xMin = -10; xMax = 10; yMin = -10; yMax = 10;
    if (equalAspect) enforceAspect();
    render();
  }

  function addExpression(text = '') {
    const id = Utils.uid();
    const color = EXPR_COLORS[expressions.length % EXPR_COLORS.length];
    const expr = {
      id,
      text: text || '',
      color,
      visible: true,
      error: null,
      compiled: null
    };
    expressions.push(expr);
    activeExprId = id;
    renderEqList();
    if (text) compileExpression(expr);
    render();
    setTimeout(() => {
      const input = document.querySelector(`.eq-input[data-id="${id}"]`);
      if (input) input.focus();
    }, 50);
  }

  function removeExpression(id) {
    expressions = expressions.filter(e => e.id !== id);
    renderEqList();
    render();
  }

  function compileExpression(expr) {
    expr.error = null;
    expr.compiled = null;
    let src = expr.text.trim();
    if (!src) return;

    try {
      src = src.replace(/π/g, 'pi').replace(/θ/g, 'theta');
      if (src.includes('=')) {
        const parts = src.split('=');
        src = parts[parts.length - 1].trim();
      }
      const compiled = math.compile(src);
      compiled.evaluate({ x: 0 });
      expr.compiled = compiled;
    } catch (err) {
      expr.error = err.message || 'Invalid expression';
    }
  }

  function renderEqList() {
    const list = document.getElementById('eq-list');
    list.innerHTML = '';
    expressions.forEach((expr) => {
      const item = document.createElement('div');
      item.className = 'eq-item';
      item.innerHTML = `
        <div class="eq-color" style="background:${expr.color}" data-id="${expr.id}"></div>
        <div class="eq-input-wrap">
          <input class="eq-input" data-id="${expr.id}" value="${escapeHtml(expr.text)}" placeholder="Input..." />
          ${expr.error ? `<div style="font-size:11px;color:#dc2626;padding:2px 4px">${escapeHtml(expr.error)}</div>` : ''}
        </div>
        <div class="eq-actions">
          <button class="eq-action-btn" data-action="toggle" data-id="${expr.id}" title="Show/Hide">
            ${expr.visible ? '👁' : '👁‍🗨'}
          </button>
          <button class="eq-action-btn" data-action="delete" data-id="${expr.id}" title="Delete">×</button>
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll('.eq-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const expr = expressions.find(ex => ex.id === id);
        if (expr) {
          expr.text = e.target.value;
          compileExpression(expr);
          renderEqList();
          render();
        }
      });
      input.addEventListener('focus', () => { activeExprId = input.dataset.id; });
    });

    list.querySelectorAll('.eq-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.action === 'delete') removeExpression(id);
        else if (btn.dataset.action === 'toggle') {
          const expr = expressions.find(e => e.id === id);
          if (expr) {
            expr.visible = !expr.visible;
            renderEqList();
            render();
          }
        }
      });
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }

  function render() {
    if (!ctx || width === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (showGrid) drawGrid();
    if (showAxes) drawAxes();
    if (showLabels) drawLabels();

    expressions.forEach(expr => {
      if (expr.visible && expr.compiled) plotExpression(expr);
    });
  }

  function drawGrid() {
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xStep = niceStep(xRange / 12);
    const yStep = niceStep(yRange / 12);

    ctx.save();
    if (showMinorGrid) {
      ctx.strokeStyle = 'rgba(0,4,85,0.06)';
      ctx.lineWidth = 1;
      const minorX = xStep / 5;
      const minorY = yStep / 5;
      for (let x = Math.ceil(xMin / minorX) * minorX; x <= xMax; x += minorX) {
        const s = worldToScreen(x, 0);
        ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, height); ctx.stroke();
      }
      for (let y = Math.ceil(yMin / minorY) * minorY; y <= yMax; y += minorY) {
        const s = worldToScreen(0, y);
        ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(width, s.y); ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(0,4,85,0.12)';
    ctx.lineWidth = 1;
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const s = worldToScreen(x, 0);
      ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, height); ctx.stroke();
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const s = worldToScreen(0, y);
      ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(width, s.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAxes() {
    ctx.save();
    ctx.strokeStyle = '#000455';
    ctx.lineWidth = 1.5;
    if (yMin <= 0 && yMax >= 0) {
      const s = worldToScreen(0, 0);
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(width, s.y);
      ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const s = worldToScreen(0, 0);
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabels() {
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xStep = niceStep(xRange / 10);
    const yStep = niceStep(yRange / 10);

    ctx.save();
    ctx.fillStyle = '#5c6378';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      if (Math.abs(x) < xStep * 0.01) continue;
      const s = worldToScreen(x, 0);
      const labelY = (yMin <= 0 && yMax >= 0) ? worldToScreen(0, 0).y + 4 : height - 14;
      ctx.fillText(formatNum(x), s.x, labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      if (Math.abs(y) < yStep * 0.01) continue;
      const s = worldToScreen(0, y);
      const labelX = (xMin <= 0 && xMax >= 0) ? worldToScreen(0, 0).x - 6 : 30;
      ctx.fillText(formatNum(y), labelX, s.y);
    }
    ctx.restore();
  }

  function niceStep(rough) {
    const exp = Math.floor(Math.log10(rough));
    const frac = rough / Math.pow(10, exp);
    let nice;
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, exp);
  }

  function formatNum(n) {
    if (Math.abs(n) < 1e-6) return '0';
    if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
    return parseFloat(n.toPrecision(4)).toString();
  }

  function plotExpression(expr) {
    const steps = Math.min(width * 2, 2000);
    const dx = (xMax - xMin) / steps;
    ctx.save();
    ctx.strokeStyle = expr.color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let started = false;
    let prevY = null;

    for (let i = 0; i <= steps; i++) {
      const x = xMin + i * dx;
      let y;
      try {
        y = expr.compiled.evaluate({ x });
        if (typeof y !== 'number' || !isFinite(y)) {
          started = false;
          continue;
        }
      } catch {
        started = false;
        continue;
      }

      const s = worldToScreen(x, y);
      if (prevY !== null && Math.abs(y - prevY) > (yMax - yMin) * 0.5) {
        started = false;
      }
      prevY = y;

      if (!started) {
        ctx.moveTo(s.x, s.y);
        started = true;
      } else {
        ctx.lineTo(s.x, s.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function toggleKeypad() {
    keypadOpen = !keypadOpen;
    document.getElementById('keypad').classList.toggle('open', keypadOpen);
  }

  function renderKeypad() {
    const grid = document.getElementById('keypad-grid');
    grid.innerHTML = '';
    const layouts = {
      basic: [
        ['7', '8', '9', '÷', '(', ')'],
        ['4', '5', '6', '×', '^', '√'],
        ['1', '2', '3', '−', 'π', 'e'],
        ['0', '.', '=', '+', 'x', '⌫']
      ],
      functions: [
        ['sin', 'cos', 'tan', 'ln', 'log', 'abs'],
        ['asin', 'acos', 'atan', 'exp', 'floor', 'ceil'],
        ['sinh', 'cosh', 'tanh', 'min', 'max', 'round'],
        ['!', 'nCr', 'nPr', 'mod', 'gcd', '⌫']
      ],
      trig: [
        ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'],
        ['asin', 'acos', 'atan', 'π', 'θ', '°'],
        ['sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh'],
        ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', '(', ')', '⌫']
      ],
      calc: [
        ['d/dx', '∫', 'lim', 'Σ', '∞', '∂'],
        ['f′', 'f″', '∇', 'Δ', '→', '⌫'],
        ['x²', 'x³', 'xⁿ', '√', '∛', 'ⁿ√'],
        ['|x|', '⌊x⌋', '⌈x⌉', '(', ')', '=']
      ],
      abc: [
        ['a', 'b', 'c', 'd', 'e', 'f'],
        ['g', 'h', 'i', 'j', 'k', 'l'],
        ['m', 'n', 'o', 'p', 'q', 'r'],
        ['s', 't', 'u', 'v', 'w', 'x'],
        ['y', 'z', 'A', 'B', 'C', '⌫']
      ]
    };

    const rows = layouts[currentKeypadTab] || layouts.basic;
    grid.style.gridTemplateColumns = `repeat(${rows[0].length}, 1fr)`;

    rows.forEach(row => {
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'key';
        if (['+', '−', '×', '÷', '^', '='].includes(key)) btn.classList.add('op');
        if (key.length > 1 && key !== '⌫') btn.classList.add('fn');
        btn.textContent = key;
        btn.addEventListener('click', () => insertKey(key));
        grid.appendChild(btn);
      });
    });
  }

  function insertKey(key) {
    const map = {
      '×': '*', '÷': '/', '−': '-', 'π': 'pi', '√': 'sqrt(',
      '⌫': 'BACKSPACE', 'sin⁻¹': 'asin(', 'cos⁻¹': 'acos(', 'tan⁻¹': 'atan(',
      'x²': '^2', 'x³': '^3', 'xⁿ': '^', '∛': 'cbrt(', '∞': 'Infinity'
    };
    let insert = map[key] || key;

    let input = document.querySelector(`.eq-input[data-id="${activeExprId}"]`);
    if (!input) {
      addExpression('');
      input = document.querySelector(`.eq-input[data-id="${activeExprId}"]`);
    }
    if (!input) return;

    if (insert === 'BACKSPACE') {
      const start = input.selectionStart;
      if (start > 0) {
        input.value = input.value.slice(0, start - 1) + input.value.slice(input.selectionEnd);
        input.setSelectionRange(start - 1, start - 1);
      }
    } else {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.slice(0, start) + insert + input.value.slice(end);
      const newPos = start + insert.length;
      input.setSelectionRange(newPos, newPos);
    }
    input.dispatchEvent(new Event('input'));
    input.focus();
  }

  function setupSettings() {
    const toggles = {
      'set-grid': (v) => { showGrid = v; },
      'set-minor-grid': (v) => { showMinorGrid = v; },
      'set-axes': (v) => { showAxes = v; },
      'set-aspect': (v) => { equalAspect = v; if (v) enforceAspect(); },
      'set-labels': (v) => { showLabels = v; }
    };
    Object.entries(toggles).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      el.addEventListener('click', () => {
        el.classList.toggle('on');
        fn(el.classList.contains('on'));
        render();
      });
    });

    document.getElementById('btn-settings').addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('settings-panel');
      panel.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#settings-panel') && !e.target.closest('#btn-settings')) {
        document.getElementById('settings-panel').classList.remove('open');
      }
    });
  }

  function toggleEqSidebar() {
    const side = document.getElementById('eq-sidebar');
    const icon = document.getElementById('eq-toggle-icon');
    side.classList.toggle('collapsed');
    if (side.classList.contains('collapsed')) {
      icon.innerHTML = `<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>`;
    } else {
      icon.innerHTML = `<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>`;
    }
    setTimeout(resize, 280);
  }

  function exportPNG() {
    const tmp = document.createElement('canvas');
    tmp.width = width * dpr;
    tmp.height = height * dpr;
    const tctx = tmp.getContext('2d');
    tctx.scale(dpr, dpr);
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, width, height);
    tctx.drawImage(canvas, 0, 0, width, height);
    Utils.downloadDataURL(tmp.toDataURL('image/png'), `graph-${Date.now()}.png`);
  }

  function serialize() {
    return {
      expressions: expressions.map(e => ({
        text: e.text,
        color: e.color,
        visible: e.visible
      })),
      view: { xMin, xMax, yMin, yMax },
      settings: { showGrid, showMinorGrid, showAxes, showLabels, equalAspect }
    };
  }

  function load(data) {
    if (data.expressions) {
      expressions = [];
      data.expressions.forEach(e => {
        const expr = {
          id: Utils.uid(),
          text: e.text,
          color: e.color,
          visible: e.visible !== false,
          error: null,
          compiled: null
        };
        compileExpression(expr);
        expressions.push(expr);
      });
      renderEqList();
    }
    if (data.view) {
      ({ xMin, xMax, yMin, yMax } = data.view);
    }
    if (data.settings) {
      ({ showGrid, showMinorGrid, showAxes, showLabels, equalAspect } = data.settings);
    }
    render();
  }

  return {
    init,
    resize,
    exportPNG,
    serialize,
    load,
    addExpression
  };
})();

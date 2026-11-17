/**
 * whiteboard.js – Full whiteboard engine
 * Canvas 2D based. Supports pen, eraser (pixel), shapes, select, pan/zoom,
 * text, backdrop patterns, basic geometry tools, multi-board, undo/redo.
 *
 * Rendering uses requestAnimationFrame + high-DPI.
 * WebGL can be swapped in later for very large boards.
 */

const Whiteboard = (() => {
  let canvas, ctx, container;
  let width = 0, height = 0;
  let dpr = 1;

  // View transform
  let offsetX = 0, offsetY = 0, scale = 1;

  // Tools
  let currentTool = 'pen';
  let penColor = '#000455';
  let penThickness = 3;
  let eraserSize = 20;
  let strokeStyle = 'solid';
  let currentShape = 'line';
  let selectMode = 'rect';
  let textFont = 'Inter';
  let textSize = 24;
  let textColor = '#000455';
  let bgColor = '#ffffff';
  let bgPattern = 'none';
  let bgImage = null;

  // Drawing state
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let currentPath = [];
  let freeformPoints = [];

  // Layers / strokes
  let strokes = [];
  let undoStack = [];
  let redoStack = [];

  // Boards
  let boards = [{ strokes: [], bgColor: '#ffffff', bgPattern: 'none', bgImage: null }];
  let boardIndex = 0;

  // Temporary shape preview
  let shapeStart = null;
  let shapeCurrent = null;

  // Pan state
  let panStart = null;

  function init() {
    canvas = document.getElementById('wb-canvas');
    container = document.getElementById('wb-canvas-container');
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    document.querySelectorAll('#wb-tool-group .tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = btn.dataset.tool;
        if (tool === 'clear') {
          showClearConfirm();
          return;
        }
        setTool(tool, btn);
      });
    });

    document.getElementById('wb-undo').addEventListener('click', undo);
    document.getElementById('wb-redo').addEventListener('click', redo);
    document.getElementById('wb-home').addEventListener('click', resetView);
    document.getElementById('wb-zoom-in').addEventListener('click', () => zoomAt(1.2));
    document.getElementById('wb-zoom-out').addEventListener('click', () => zoomAt(1 / 1.2));
    document.getElementById('wb-fit').addEventListener('click', resetView);

    document.getElementById('wb-prev-board').addEventListener('click', () => switchBoard(boardIndex - 1));
    document.getElementById('wb-next-board').addEventListener('click', () => switchBoard(boardIndex + 1));
    document.getElementById('wb-add-board').addEventListener('click', addBoard);
    document.getElementById('wb-delete-board').addEventListener('click', deleteBoard);

    document.getElementById('pen-thickness').addEventListener('input', (e) => {
      penThickness = +e.target.value;
      document.getElementById('pen-thickness-val').textContent = penThickness;
    });
    buildColorSwatches('pen-swatches', (c) => { penColor = c; });
    document.getElementById('pen-custom-color').addEventListener('click', () => openColorPicker((c) => { penColor = c; }));

    document.getElementById('eraser-size').addEventListener('input', (e) => {
      eraserSize = +e.target.value;
      document.getElementById('eraser-size-val').textContent = eraserSize;
    });

    buildShapeGrid();
    document.querySelectorAll('.stroke-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        strokeStyle = btn.dataset.stroke;
      });
    });

    buildGeoTools();
    buildFontList();
    document.getElementById('text-size').addEventListener('input', (e) => {
      textSize = +e.target.value;
      document.getElementById('text-size-val').textContent = textSize;
    });
    buildColorSwatches('text-swatches', (c) => { textColor = c; });

    buildColorSwatches('bg-swatches', (c) => {
      bgColor = c;
      boards[boardIndex].bgColor = c;
      render();
    });
    buildPatterns();
    document.getElementById('bg-image-btn').addEventListener('click', () => {
      document.getElementById('bg-image-input').click();
    });
    document.getElementById('bg-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          bgImage = img;
          boards[boardIndex].bgImage = img.src;
          render();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    document.querySelectorAll('#popover-select .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectMode = btn.dataset.select;
        Utils.hideAllPopovers();
      });
    });

    document.getElementById('confirm-cancel').addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.remove('open');
    });
    document.getElementById('confirm-ok').addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.remove('open');
      clearBoard();
    });

    setupColorPicker();
    render();
    updateBoardLabel();
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const result = Utils.setupHiDPICanvas(canvas, width, height);
    ctx = result.ctx;
    dpr = result.dpr;
    render();
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale
    };
  }

  function setTool(tool, btnEl) {
    currentTool = tool;
    document.querySelectorAll('#wb-tool-group .tool-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    if (tool === 'move') canvas.style.cursor = 'grab';
    else if (tool === 'eraser') canvas.style.cursor = 'cell';
    else if (tool === 'text') canvas.style.cursor = 'text';
    else canvas.style.cursor = 'crosshair';

    Utils.hideAllPopovers();
    const popMap = {
      pen: 'popover-pen',
      eraser: 'popover-eraser',
      shapes: 'popover-shapes',
      tools: 'popover-tools',
      text: 'popover-text',
      backdrop: 'popover-backdrop',
      select: 'popover-select'
    };
    if (popMap[tool] && btnEl) {
      Utils.showPopover(document.getElementById(popMap[tool]), btnEl, { x: 0, y: -8 });
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    isDrawing = true;
    lastX = world.x;
    lastY = world.y;
    currentPath = [{ x: world.x, y: world.y }];
    freeformPoints = [{ x: world.x, y: world.y }];

    if (currentTool === 'move') {
      canvas.style.cursor = 'grabbing';
      panStart = { x: sx, y: sy, ox: offsetX, oy: offsetY };
      return;
    }

    if (currentTool === 'shapes' || currentTool === 'tools') {
      shapeStart = world;
      shapeCurrent = world;
      return;
    }

    if (currentTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        pushUndo();
        strokes.push({
          type: 'text',
          x: world.x,
          y: world.y,
          text,
          font: textFont,
          size: textSize,
          color: textColor
        });
        render();
      }
      isDrawing = false;
      return;
    }

    if (currentTool === 'select' && selectMode === 'freeform') {
      freeformPoints = [{ x: world.x, y: world.y }];
    }
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (currentTool === 'move' && panStart) {
      offsetX = panStart.ox + (sx - panStart.x);
      offsetY = panStart.oy + (sy - panStart.y);
      render();
      return;
    }

    if (currentTool === 'pen') {
      currentPath.push({ x: world.x, y: world.y });
      ctx.save();
      applyViewTransform();
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setDash(ctx, strokeStyle, penThickness);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(world.x, world.y);
      ctx.stroke();
      ctx.restore();
      lastX = world.x;
      lastY = world.y;
      return;
    }

    if (currentTool === 'eraser') {
      ctx.save();
      applyViewTransform();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(world.x, world.y, eraserSize / 2 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      currentPath.push({ x: world.x, y: world.y });
      lastX = world.x;
      lastY = world.y;
      return;
    }

    if (currentTool === 'shapes' || currentTool === 'tools') {
      shapeCurrent = world;
      render();
      return;
    }

    if (currentTool === 'select' && selectMode === 'freeform') {
      freeformPoints.push({ x: world.x, y: world.y });
      render();
      ctx.save();
      applyViewTransform();
      ctx.strokeStyle = '#000455';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.beginPath();
      freeformPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    canvas.releasePointerCapture?.(e.pointerId);

    if (currentTool === 'move') {
      canvas.style.cursor = 'grab';
      panStart = null;
      return;
    }

    if (currentTool === 'pen' && currentPath.length > 1) {
      pushUndo();
      strokes.push({
        type: 'path',
        points: currentPath.slice(),
        color: penColor,
        thickness: penThickness,
        strokeStyle
      });
      render();
    }

    if (currentTool === 'eraser' && currentPath.length > 0) {
      pushUndo();
      strokes.push({
        type: 'erase',
        points: currentPath.slice(),
        size: eraserSize
      });
      render();
    }

    if ((currentTool === 'shapes' || currentTool === 'tools') && shapeStart && shapeCurrent) {
      pushUndo();
      strokes.push({
        type: 'shape',
        shape: currentShape,
        x1: shapeStart.x, y1: shapeStart.y,
        x2: shapeCurrent.x, y2: shapeCurrent.y,
        color: penColor,
        thickness: penThickness,
        strokeStyle
      });
      shapeStart = null;
      shapeCurrent = null;
      render();
    }

    currentPath = [];
    freeformPoints = [];
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, sx, sy);
  }

  function zoomAt(factor, sx, sy) {
    if (sx === undefined) {
      sx = width / 2;
      sy = height / 2;
    }
    const world = screenToWorld(sx, sy);
    scale = Utils.clamp(scale * factor, 0.1, 20);
    offsetX = sx - world.x * scale;
    offsetY = sy - world.y * scale;
    render();
  }

  function resetView() {
    offsetX = 0;
    offsetY = 0;
    scale = 1;
    render();
  }

  function applyViewTransform() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  }

  function setDash(ctx, style, thickness) {
    if (style === 'dashed') ctx.setLineDash([thickness * 3, thickness * 2]);
    else if (style === 'dotted') ctx.setLineDash([thickness, thickness * 1.5]);
    else ctx.setLineDash([]);
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, width, height);
    } else if (bgPattern !== 'none') {
      drawPattern(bgPattern);
    }

    applyViewTransform();

    strokes.forEach(s => drawStroke(s));

    if (shapeStart && shapeCurrent && (currentTool === 'shapes' || currentTool === 'tools')) {
      drawShapePreview(currentShape, shapeStart, shapeCurrent);
    }
  }

  function drawPattern(type) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,4,85,0.12)';
    ctx.lineWidth = 1;
    const step = 24;
    if (type === 'grid') {
      for (let x = 0; x < width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    } else if (type === 'dots') {
      ctx.fillStyle = 'rgba(0,4,85,0.25)';
      for (let x = step / 2; x < width; x += step) {
        for (let y = step / 2; y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (type === 'lines') {
      for (let y = step; y < height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStroke(s) {
    if (s.type === 'path') {
      if (s.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setDash(ctx, s.strokeStyle || 'solid', s.thickness);
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    } else if (s.type === 'erase') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      s.points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    } else if (s.type === 'shape') {
      drawShape(s.shape, s.x1, s.y1, s.x2, s.y2, s.color, s.thickness, s.strokeStyle);
    } else if (s.type === 'text') {
      ctx.font = `${s.size}px ${s.font}, sans-serif`;
      ctx.fillStyle = s.color;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, s.x, s.y);
    }
  }

  function drawShape(shape, x1, y1, x2, y2, color, thickness, style) {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setDash(ctx, style || 'solid', thickness);

    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const w = maxX - minX, h = maxY - minY;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

    ctx.beginPath();
    switch (shape) {
      case 'line':
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        break;
      case 'arrow':
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 12 + thickness;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        return;
      case 'rect':
      case 'square':
        if (shape === 'square') {
          const side = Math.max(w, h);
          ctx.rect(minX, minY, side, side);
        } else {
          ctx.rect(minX, minY, w, h);
        }
        break;
      case 'circle':
        const r = Math.max(w, h) / 2;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      case 'ellipse':
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case 'triangle':
        ctx.moveTo(cx, minY);
        ctx.lineTo(maxX, maxY);
        ctx.lineTo(minX, maxY);
        ctx.closePath();
        break;
      case 'parallelogram':
        ctx.moveTo(minX + w * 0.25, minY);
        ctx.lineTo(maxX, minY);
        ctx.lineTo(maxX - w * 0.25, maxY);
        ctx.lineTo(minX, maxY);
        ctx.closePath();
        break;
      case 'rhombus':
        ctx.moveTo(cx, minY);
        ctx.lineTo(maxX, cy);
        ctx.lineTo(cx, maxY);
        ctx.lineTo(minX, cy);
        ctx.closePath();
        break;
      case 'trapezium':
        ctx.moveTo(minX + w * 0.2, minY);
        ctx.lineTo(maxX - w * 0.2, minY);
        ctx.lineTo(maxX, maxY);
        ctx.lineTo(minX, maxY);
        ctx.closePath();
        break;
      case 'iso-trapezium':
        ctx.moveTo(minX + w * 0.25, minY);
        ctx.lineTo(maxX - w * 0.25, minY);
        ctx.lineTo(maxX, maxY);
        ctx.lineTo(minX, maxY);
        ctx.closePath();
        break;
      default:
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  function drawShapePreview(shape, start, cur) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    drawShape(shape, start.x, start.y, cur.x, cur.y, penColor, penThickness, strokeStyle);
    ctx.restore();
  }

  function pushUndo() {
    undoStack.push(Utils.clone(strokes));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(Utils.clone(strokes));
    strokes = undoStack.pop();
    boards[boardIndex].strokes = strokes;
    render();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(Utils.clone(strokes));
    strokes = redoStack.pop();
    boards[boardIndex].strokes = strokes;
    render();
  }

  function switchBoard(idx) {
    if (idx < 0 || idx >= boards.length) return;
    boards[boardIndex].strokes = strokes;
    boards[boardIndex].bgColor = bgColor;
    boards[boardIndex].bgPattern = bgPattern;
    boardIndex = idx;
    const b = boards[boardIndex];
    strokes = b.strokes || [];
    bgColor = b.bgColor || '#ffffff';
    bgPattern = b.bgPattern || 'none';
    bgImage = null;
    if (b.bgImage) {
      const img = new Image();
      img.onload = () => { bgImage = img; render(); };
      img.src = b.bgImage;
    }
    undoStack = [];
    redoStack = [];
    updateBoardLabel();
    render();
  }

  function addBoard() {
    boards[boardIndex].strokes = strokes;
    boards.push({ strokes: [], bgColor: '#ffffff', bgPattern: 'none', bgImage: null });
    switchBoard(boards.length - 1);
  }

  function deleteBoard() {
    if (boards.length <= 1) return;
    boards.splice(boardIndex, 1);
    if (boardIndex >= boards.length) boardIndex = boards.length - 1;
    const b = boards[boardIndex];
    strokes = b.strokes || [];
    bgColor = b.bgColor || '#ffffff';
    bgPattern = b.bgPattern || 'none';
    updateBoardLabel();
    render();
  }

  function updateBoardLabel() {
    document.getElementById('wb-board-label').textContent = `Board ${boardIndex + 1} of ${boards.length}`;
  }

  function clearBoard() {
    pushUndo();
    strokes = [];
    boards[boardIndex].strokes = [];
    render();
  }

  function showClearConfirm() {
    document.getElementById('confirm-title').textContent = 'Clear board?';
    document.getElementById('confirm-msg').textContent = 'This will permanently erase everything on the current board.';
    document.getElementById('confirm-modal').classList.add('open');
  }

  function buildColorSwatches(containerId, onSelect) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    Utils.PRIMARY_COLORS.forEach(c => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = c;
      if (c === '#ffffff') s.style.border = '1px solid #ccc';
      s.addEventListener('click', () => {
        el.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        onSelect(c);
      });
      el.appendChild(s);
    });
  }

  function buildShapeGrid() {
    const shapes = [
      { id: 'line', label: 'Line' },
      { id: 'arrow', label: 'Arrow' },
      { id: 'rect', label: 'Rect' },
      { id: 'square', label: 'Square' },
      { id: 'circle', label: 'Circle' },
      { id: 'ellipse', label: 'Ellipse' },
      { id: 'triangle', label: 'Triangle' },
      { id: 'parallelogram', label: 'Para' },
      { id: 'rhombus', label: 'Rhombus' },
      { id: 'trapezium', label: 'Trap' },
      { id: 'iso-trapezium', label: 'Iso Trap' }
    ];
    const grid = document.getElementById('shape-grid');
    grid.innerHTML = '';
    shapes.forEach(sh => {
      const btn = document.createElement('button');
      btn.className = 'shape-btn' + (sh.id === 'line' ? ' active' : '');
      btn.title = sh.label;
      btn.innerHTML = shapeIconSVG(sh.id);
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentShape = sh.id;
      });
      grid.appendChild(btn);
    });
  }

  function shapeIconSVG(id) {
    const icons = {
      line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>',
      rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12"/></svg>',
      square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14"/></svg>',
      circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>',
      ellipse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="6"/></svg>',
      triangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4 L20 20 H4 Z"/></svg>',
      parallelogram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 6 H20 L17 18 H4 Z"/></svg>',
      rhombus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 L21 12 L12 21 L3 12 Z"/></svg>',
      trapezium: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6 H18 L21 18 H3 Z"/></svg>',
      'iso-trapezium': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 6 H17 L20 18 H4 Z"/></svg>'
    };
    return icons[id] || icons.line;
  }

  function buildGeoTools() {
    const tools = [
      { id: 'point', label: 'Point' },
      { id: 'midpoint', label: 'Midpoint' },
      { id: 'segment', label: 'Segment' },
      { id: 'ray', label: 'Ray' },
      { id: 'line', label: 'Line' },
      { id: 'perp', label: 'Perp.' },
      { id: 'parallel', label: 'Parallel' },
      { id: 'perp-bisector', label: 'Perp Bis.' },
      { id: 'angle-bisector', label: '∠ Bisector' },
      { id: 'polygon', label: 'Polygon' },
      { id: 'regular-poly', label: 'Reg. Poly' },
      { id: 'circle-center', label: 'Circle' },
      { id: 'compass', label: 'Compass' },
      { id: 'scale', label: 'Scale' },
      { id: 'setsquare', label: 'Set Square' },
      { id: 'protractor', label: 'Protractor' },
      { id: 'intersect', label: 'Intersect' },
      { id: 'tangent', label: 'Tangent' }
    ];
    const grid = document.getElementById('geo-tools-grid');
    grid.innerHTML = '';
    tools.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'geo-tool';
      btn.innerHTML = `${geoIconSVG(t.id)}<span>${t.label}</span>`;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.geo-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentShape = t.id === 'segment' || t.id === 'ray' || t.id === 'line' ? 'line' :
                       t.id === 'circle-center' || t.id === 'compass' ? 'circle' :
                       t.id === 'polygon' || t.id === 'regular-poly' ? 'triangle' : 'line';
        currentTool = 'shapes';
        Utils.hideAllPopovers();
      });
      grid.appendChild(btn);
    });
  }

  function geoIconSVG(id) {
    const map = {
      point: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>',
      midpoint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
      segment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/></svg>',
      ray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="2" fill="currentColor"/><polyline points="14 5 19 5 19 10"/></svg>',
      line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
      perp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      parallel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg>',
      'perp-bisector': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/></svg>',
      'angle-bisector': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L12 4 L20 20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      polygon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 L20 8 L17 18 L7 18 L4 8 Z"/></svg>',
      'regular-poly': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L19 7 L19 17 L12 22 L5 17 L5 7 Z"/></svg>',
      'circle-center': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
      compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3 L12 12 L18 18"/></svg>',
      scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L20 4"/><path d="M6 18 L8 16 M10 14 L12 12 M14 10 L16 8"/></svg>',
      setsquare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L4 4 L20 20 Z"/></svg>',
      protractor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18 A10 10 0 0 1 20 18"/><line x1="4" y1="18" x2="20" y2="18"/><line x1="12" y1="18" x2="12" y2="8"/></svg>',
      intersect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
      tangent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><line x1="3" y1="5" x2="21" y2="5"/></svg>'
    };
    return map[id] || map.point;
  }

  function buildFontList() {
    const fonts = [
      'Inter', 'Quicksand', 'Anta', 'Anton', 'Parkinsans',
      'Roboto', 'Open Sans', 'Times New Roman', 'Georgia', 'Courier New'
    ];
    const list = document.getElementById('font-list');
    list.innerHTML = '';
    fonts.forEach(f => {
      const opt = document.createElement('div');
      opt.className = 'font-option' + (f === 'Inter' ? ' active' : '');
      opt.style.fontFamily = f;
      opt.textContent = f;
      opt.addEventListener('click', () => {
        list.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        textFont = f;
      });
      list.appendChild(opt);
    });
  }

  function buildPatterns() {
    const patterns = [
      { id: 'none', label: 'None' },
      { id: 'grid', label: 'Grid' },
      { id: 'dots', label: 'Dots' },
      { id: 'lines', label: 'Lines' }
    ];
    const grid = document.getElementById('pattern-grid');
    grid.innerHTML = '';
    patterns.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'pattern-btn' + (p.id === 'none' ? ' active' : '');
      btn.title = p.label;
      if (p.id === 'grid') btn.style.backgroundImage = 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)';
      else if (p.id === 'dots') btn.style.backgroundImage = 'radial-gradient(#999 1px, transparent 1px)';
      else if (p.id === 'lines') btn.style.backgroundImage = 'repeating-linear-gradient(0deg, #ccc, #ccc 1px, transparent 1px, transparent 8px)';
      btn.style.backgroundSize = '12px 12px';
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bgPattern = p.id;
        boards[boardIndex].bgPattern = p.id;
        bgImage = null;
        render();
      });
      grid.appendChild(btn);
    });
  }

  let cpHue = 240, cpSat = 80, cpVal = 30;
  function setupColorPicker() {
    const hueEl = document.getElementById('cp-hue');
    const satEl = document.getElementById('cp-sat');
    const hexInput = document.getElementById('cp-hex');
    const preview = document.getElementById('cp-preview');

    function updatePreview() {
      const rgb = hsvToRgb(cpHue, cpSat / 100, cpVal / 100);
      const hex = Utils.rgbToHex(rgb.r, rgb.g, rgb.b);
      preview.style.background = hex;
      hexInput.value = hex.slice(1);
      satEl.style.background = `linear-gradient(to right, #fff, hsl(${cpHue},100%,50%))`;
    }

    hueEl.addEventListener('click', (e) => {
      const rect = hueEl.getBoundingClientRect();
      cpHue = ((e.clientX - rect.left) / rect.width) * 360;
      updatePreview();
    });
    satEl.addEventListener('click', (e) => {
      const rect = satEl.getBoundingClientRect();
      cpSat = ((e.clientX - rect.left) / rect.width) * 100;
      updatePreview();
    });
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      hexInput.value = v;
      if (v.length === 6) {
        preview.style.background = '#' + v;
      }
    });

    document.getElementById('cp-cancel').addEventListener('click', () => {
      document.getElementById('color-picker-modal').classList.remove('open');
    });
    document.getElementById('cp-apply').addEventListener('click', () => {
      const hex = '#' + document.getElementById('cp-hex').value;
      if (window._colorPickerCallback) window._colorPickerCallback(hex);
      document.getElementById('color-picker-modal').classList.remove('open');
    });
    updatePreview();
  }

  function openColorPicker(callback) {
    window._colorPickerCallback = callback;
    document.getElementById('color-picker-modal').classList.add('open');
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function exportPNG() {
    const tmp = document.createElement('canvas');
    tmp.width = width * dpr;
    tmp.height = height * dpr;
    const tctx = tmp.getContext('2d');
    tctx.scale(dpr, dpr);
    tctx.fillStyle = bgColor;
    tctx.fillRect(0, 0, width, height);
    tctx.drawImage(canvas, 0, 0, width, height);
    Utils.downloadDataURL(tmp.toDataURL('image/png'), `whiteboard-${Date.now()}.png`);
  }

  function serialize() {
    return {
      boards: boards.map(b => ({
        strokes: b.strokes,
        bgColor: b.bgColor,
        bgPattern: b.bgPattern,
        bgImage: b.bgImage || null
      })),
      boardIndex
    };
  }

  function load(data) {
    if (!data.boards) return;
    boards = data.boards;
    boardIndex = data.boardIndex || 0;
    const b = boards[boardIndex];
    strokes = b.strokes || [];
    bgColor = b.bgColor || '#ffffff';
    bgPattern = b.bgPattern || 'none';
    updateBoardLabel();
    render();
  }

  return {
    init,
    resize,
    exportPNG,
    serialize,
    load
  };
})();

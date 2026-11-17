/**
 * utils.js – Shared helpers for Rishit's CANVAS
 * High-DPI canvas support, colour utilities, DOM helpers, etc.
 */

const Utils = (() => {
  /** Create a high-DPI aware canvas context */
  function setupHiDPICanvas(canvas, width, height) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, dpr, width, height };
  }

  /** Clamp a number between min and max */
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /** Simple deep clone for plain objects / arrays */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Generate a UUID-like id */
  function uid() {
    return 'id_' + Math.random().toString(36).slice(2, 11);
  }

  /** Convert hex to rgb object */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  /** rgb to hex */
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const h = x.toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }

  /** Show a popover near a button */
  function showPopover(popoverEl, anchorEl, offset = { x: 0, y: 8 }) {
    // Close all other popovers first
    document.querySelectorAll('.popover.open').forEach(p => p.classList.remove('open'));
    const rect = anchorEl.getBoundingClientRect();
    const pop = popoverEl;
    pop.style.left = (rect.left + offset.x) + 'px';
    pop.style.top = (rect.bottom + offset.y) + 'px';
    // Keep inside viewport
    requestAnimationFrame(() => {
      const pr = pop.getBoundingClientRect();
      if (pr.right > window.innerWidth - 8) {
        pop.style.left = (window.innerWidth - pr.width - 8) + 'px';
      }
      if (pr.bottom > window.innerHeight - 8) {
        pop.style.top = (rect.top - pr.height - 8) + 'px';
      }
      pop.classList.add('open');
    });
  }

  function hideAllPopovers() {
    document.querySelectorAll('.popover.open').forEach(p => p.classList.remove('open'));
  }

  /** Download a data URL as file */
  function downloadDataURL(dataURL, filename) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    a.click();
  }

  /** Primary colour palette used throughout the app */
  const PRIMARY_COLORS = [
    '#000455', '#1e40af', '#2563eb', '#3b82f6',
    '#0f172a', '#334155', '#64748b', '#94a3b8',
    '#dc2626', '#ea580c', '#d97706', '#ca8a04',
    '#16a34a', '#059669', '#0d9488', '#0891b2',
    '#7c3aed', '#a21caf', '#db2777', '#e11d48',
    '#000000', '#ffffff'
  ];

  return {
    setupHiDPICanvas,
    clamp,
    clone,
    uid,
    hexToRgb,
    rgbToHex,
    showPopover,
    hideAllPopovers,
    downloadDataURL,
    PRIMARY_COLORS
  };
})();

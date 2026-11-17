# Rishit's CANVAS

**Whiteboard + Graph Calculator** – a clean, modern web app inspired by the provided UI designs.

## Features

### Whiteboard
- Pen (thickness + colour palette + custom Figma-style colour picker)
- Pixel eraser (size slider) – erases only what is under the brush
- Select (rectangular + free-form lasso with dotted path)
- Move / Pan tool
- Shapes: line, arrow, rectangle, square, circle, ellipse, triangle, parallelogram, rhombus, trapezium, isosceles trapezium
- Stroke styles: solid, dashed, dotted
- Geometry tools panel (GeoGebra-inspired icons: point, midpoint, segment, ray, line, perpendicular, parallel, perp-bisector, angle-bisector, polygon, circle, compass, scale, set square, protractor, etc.)
- Text tool with multiple Google Fonts
- Backdrop: solid colours, grid / dots / lines patterns, image upload
- Multi-board support
- Undo / Redo
- Zoom, pan, fit-to-view
- Export PNG / Save & Open JSON board files
- Clear with confirmation

### Graph Calculator
- Multiple expressions with individual colours
- Live plotting powered by math.js
- Pan & zoom (mouse wheel + drag)
- Grid, minor grid, axes, labels, equal-aspect toggle
- On-screen keypad (Basic / Functions / Trig / Calculus / ABC) – Desmos-style
- Equation sidebar (collapsible)
- Settings panel
- Export PNG / Save & Open

## Theme
Primary navy: `#000455`

## How to run

Just open `index.html` in a modern browser, or serve the folder:

```bash
npx serve .
# or
python -m http.server 8000
```

## GitHub Pages

1. Push this folder to a GitHub repository.
2. Settings → Pages → Deploy from main branch / root (or `/docs` if you move files).
3. Your site will be live at `https://<user>.github.io/<repo>/`.

## Tech notes
- Pure HTML / CSS / vanilla JS
- Canvas 2D with high-DPI support
- math.js (CDN) for expression parsing & evaluation
- Designed to be easily extended (WebGL renderer can replace Canvas 2D later for very large boards)
- All icons are inline SVG so there are no external image dependencies except the logo

## File structure
```
rishit-canvas/
├── index.html
├── css/styles.css
├── js/
│   ├── main.js
│   ├── sidebar.js
│   ├── whiteboard.js
│   ├── graph.js
│   └── utils.js
├── assets/
│   ├── favicon.svg
│   └── logo.svg
└── README.md
```

Enjoy building with Rishit's CANVAS!

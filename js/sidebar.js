/**
 * sidebar.js – Main left sidebar + workspace switching
 */

const Sidebar = (() => {
  let currentWorkspace = 'whiteboard'; // 'whiteboard' | 'graph'
  let sidebarOpen = true;

  function init() {
    // Workspace buttons
    document.getElementById('btn-workspace-wb').addEventListener('click', () => switchWorkspace('whiteboard'));
    document.getElementById('btn-workspace-graph').addEventListener('click', () => switchWorkspace('graph'));

    // Toggle sidebar
    document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);

    // Board actions
    document.getElementById('btn-export-png').addEventListener('click', exportPNG);
    document.getElementById('btn-save-board').addEventListener('click', saveBoard);
    document.getElementById('btn-open-board').addEventListener('click', openBoard);

    // Close popovers when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.popover') && !e.target.closest('.tool-btn') && !e.target.closest('.icon-btn')) {
        Utils.hideAllPopovers();
      }
    });
  }

  function switchWorkspace(name) {
    if (name === currentWorkspace) return;
    currentWorkspace = name;

    // Update buttons
    document.querySelectorAll('.workspace-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.workspace === name);
    });

    // Show / hide views
    document.getElementById('whiteboard-view').classList.toggle('active', name === 'whiteboard');
    document.getElementById('graph-view').classList.toggle('active', name === 'graph');

    // Graph-specific top controls
    const graphControls = document.getElementById('graph-top-controls');
    if (name === 'graph') {
      graphControls.classList.remove('hidden');
      graphControls.style.display = 'flex';
      // Trigger resize so graph canvas gets correct size
      if (window.Graph) Graph.resize();
    } else {
      graphControls.classList.add('hidden');
      if (window.Whiteboard) Whiteboard.resize();
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    document.getElementById('main-sidebar').classList.toggle('closed', !sidebarOpen);
  }

  function exportPNG() {
    if (currentWorkspace === 'whiteboard' && window.Whiteboard) {
      Whiteboard.exportPNG();
    } else if (currentWorkspace === 'graph' && window.Graph) {
      Graph.exportPNG();
    }
  }

  function saveBoard() {
    // Simple JSON export of current state
    let data = {};
    if (currentWorkspace === 'whiteboard' && window.Whiteboard) {
      data = { type: 'whiteboard', ...Whiteboard.serialize() };
    } else if (currentWorkspace === 'graph' && window.Graph) {
      data = { type: 'graph', ...Graph.serialize() };
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rishit-canvas-${currentWorkspace}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openBoard() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.type === 'whiteboard' && window.Whiteboard) {
            switchWorkspace('whiteboard');
            Whiteboard.load(data);
          } else if (data.type === 'graph' && window.Graph) {
            switchWorkspace('graph');
            Graph.load(data);
          }
        } catch (err) {
          alert('Could not load board file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return {
    init,
    switchWorkspace,
    getCurrentWorkspace: () => currentWorkspace
  };
})();

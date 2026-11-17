/**
 * main.js – Entry point for Rishit's CANVAS
 * Initializes all modules once the DOM is ready.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize modules
  Sidebar.init();
  Whiteboard.init();
  Graph.init();

  // Start on Whiteboard (as per design)
  Sidebar.switchWorkspace('whiteboard');

  console.log('%c Rishit\'s CANVAS ready ', 'background:#000455;color:#fff;padding:4px 8px;border-radius:4px');
});

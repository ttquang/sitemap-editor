// Pending-import shim — must run BEFORE sitemap-editor.js so the IIFE in
// sitemap-editor.js parses the imported sitemap as the new model. The shim
// reads an SVG document that another page stashed in sessionStorage and
// swaps it into the current canvas's <svg.graph> element.
(function () {
  try {
    var pending = sessionStorage.getItem('pwstudio.import.pending');
    if (!pending) return;
    sessionStorage.removeItem('pwstudio.import.pending');
    var doc = new DOMParser().parseFromString(pending, 'image/svg+xml');
    var imported = doc.querySelector('svg');
    var current = document.querySelector('svg.graph');
    if (!imported || !current) return;
    // Preserve viewBox from the import if it has one.
    var vb = imported.getAttribute('viewBox');
    if (vb) current.setAttribute('viewBox', vb);
    // Replace children (defs + nodes + edges + areas).
    current.innerHTML = imported.innerHTML;
  } catch (err) {
    console.error('[PW Studio] SVG import shim failed:', err);
  }
})();

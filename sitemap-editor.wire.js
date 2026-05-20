// Page-level wiring previously inline in sitemap-editor.html.
// Loads AFTER sitemap-editor.js so it can reference the editor's
// window.__graph* hooks (Area selection, Group/Ungroup, Lock).
//
// Responsibilities:
//   1. Right-click context menu (Area / Group / Ungroup / Lock)
//   2. Inspector "Area selection" button (duplicate entry point alongside
//      the context menu)
//   3. Listener equivalents of the inline onclick handlers that used to
//      sit on:
//        - the +Page toolbar button (calls quickAddPage)
//        - the node-modal scrim (close on outside-click)
//        - the node-modal close button
//        - the "Page created" toast "Open →" link
//
// The unused topbar / sidenav navigation functions (openHome, openPages,
// openCases, openSuites, switchProject, exportSitemapSVG, importSitemapSVG,
// currentProjectParam) have been removed during the cleanup pass — none of
// them were referenced by the HTML after the sidebar and Switch-project
// removals.

(function () {
  // ----- Right-click context menu (Area / Group / Ungroup / Lock)
  function setupContextMenu() {
    var menu = document.getElementById('ctxMenu');
    var canvas = document.querySelector('.canvas-wrap');
    if (!menu || !canvas) return;

    function currentSelection() {
      // We don't have direct access to the IIFE's selected/multiSel —
      // read the DOM. .selected lives on .gnode (page) and rect.gzone (area).
      var nodes = canvas.querySelectorAll('.gnode.selected');
      var zones = canvas.querySelectorAll('rect.gzone.selected');
      return { pages: nodes.length, areas: zones.length };
    }

    function show(x, y) {
      var sel = currentSelection();
      var areaBtn     = menu.querySelector('[data-action="area"]');
      var groupBtn    = menu.querySelector('[data-action="group"]');
      var ungroupBtn  = menu.querySelector('[data-action="ungroup"]');
      var lockBtn     = menu.querySelector('.ctx-lock');
      if (areaBtn)     areaBtn.disabled     = (sel.pages + sel.areas) < 1;
      // Group needs ≥ 2 selected items (any mix of pages/areas).
      if (groupBtn)    groupBtn.disabled    = (sel.pages + sel.areas) < 2;
      // Ungroup needs the selection to touch at least one existing group.
      if (ungroupBtn) {
        var hasGroup = (typeof window.__graphIsSelectionGrouped === 'function')
                         ? window.__graphIsSelectionGrouped() : false;
        ungroupBtn.disabled = !hasGroup;
      }
      if (lockBtn) {
        var state = (typeof window.__graphGetSelectionLockState === 'function')
                      ? window.__graphGetSelectionLockState() : 'none';
        lockBtn.disabled = (state === 'none');
        // Locked → next click should Unlock. Otherwise → Lock.
        var willUnlock = (state === 'locked');
        lockBtn.setAttribute('data-action', willUnlock ? 'unlock' : 'lock');
        var label = lockBtn.querySelector('.label');
        if (label) label.textContent = willUnlock ? 'Unlock' : 'Lock';
        var icon = lockBtn.querySelector('svg');
        if (icon) {
          icon.innerHTML = willUnlock
            ? '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'
            : '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
        }
      }

      menu.removeAttribute('hidden');
      // Position, then clamp inside the viewport.
      menu.style.left = '0px';
      menu.style.top  = '0px';
      var rect = menu.getBoundingClientRect();
      var maxX = window.innerWidth - rect.width - 8;
      var maxY = window.innerHeight - rect.height - 8;
      menu.style.left = Math.max(8, Math.min(x, maxX)) + 'px';
      menu.style.top  = Math.max(8, Math.min(y, maxY)) + 'px';
      requestAnimationFrame(function () { menu.classList.add('show'); });
    }
    function hide() {
      menu.classList.remove('show');
      setTimeout(function () {
        if (!menu.classList.contains('show')) menu.setAttribute('hidden', '');
      }, 200);
    }

    // Right-click anywhere on the canvas → first select whatever is under
    // the cursor (so Lock / Group / Area selection target the right item),
    // then show the menu. If the cursor is already over a selected item or
    // empty canvas, the selection is left intact.
    //
    // Attached to `document` rather than `canvas` so the listener still wins
    // even if some descendant element stops propagation, and so the
    // suppression happens regardless of which inner SVG node the cursor
    // lands on. The handler filters out events that aren't inside the
    // canvas, leaving the browser's default menu intact for the topbar,
    // inspector inputs, scrollbars, etc.
    document.addEventListener('contextmenu', function (ev) {
      if (!canvas.contains(ev.target)) return;
      ev.preventDefault();
      if (typeof window.__graphSelectAtPoint === 'function') {
        window.__graphSelectAtPoint(ev.clientX, ev.clientY);
      }
      show(ev.clientX, ev.clientY);
    });

    // Outside-click / Esc dismiss.
    document.addEventListener('mousedown', function (ev) {
      if (!menu.contains(ev.target)) hide();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') hide();
    });

    // Wire menu items.
    menu.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.ctx-item');
      if (!btn || btn.disabled) return;
      var action = btn.getAttribute('data-action');
      if (action === 'area' && typeof window.__graphAreaSelection === 'function') {
        window.__graphAreaSelection();
      } else if (action === 'group' && typeof window.__graphGroupSelected === 'function') {
        window.__graphGroupSelected();
      } else if (action === 'ungroup' && typeof window.__graphUngroupSelected === 'function') {
        window.__graphUngroupSelected();
      } else if (action === 'lock' || action === 'unlock') {
        if (typeof window.__graphSetSelectionLocked === 'function') {
          window.__graphSetSelectionLocked(action === 'lock');
        }
      }
      hide();
    });

  }
  setupContextMenu();

  // ----- Inspector Area-section buttons (duplicate entry points alongside ctx-menu)
  var btnAreaSel = document.getElementById('rp-area-selection');
  if (btnAreaSel) btnAreaSel.addEventListener('click', function () {
    if (typeof window.__graphAreaSelection === 'function') window.__graphAreaSelection();
  });

  // ----- Replacements for the inline onclick="" handlers.
  //
  // quickAddPage / openCreatedPage are top-level globals declared at the
  // top of sitemap-editor.js (above its IIFE), so they're accessible on
  // window by the time this script runs.

  // +Page toolbar button — fire only when the button isn't aria-disabled.
  var addPageBtn = document.querySelector('.bottom-toolbar button.add-page');
  if (addPageBtn) addPageBtn.addEventListener('click', function () {
    if (addPageBtn.getAttribute('aria-disabled') === 'true') return;
    if (typeof window.quickAddPage === 'function') window.quickAddPage();
  });

  // "Page created" toast — "Open →" link.
  var toastOpen = document.getElementById('toast-open');
  if (toastOpen) toastOpen.addEventListener('click', function () {
    if (typeof window.openCreatedPage === 'function') window.openCreatedPage();
  });

  // ----- Import / Export buttons (JSON) -------------------------------
  // Export: synthesize the JSON payload and trigger a Blob download.
  var exportBtn = document.getElementById('btnExportSVG');
  if (exportBtn) exportBtn.addEventListener('click', function () {
    if (typeof window.__graphExportJSON === 'function') window.__graphExportJSON();
  });

  // Import: button opens the hidden file picker; change handler reads
  // the selected file and forwards the text to __graphImportJSON, which
  // validates + reloads.
  var importBtn  = document.getElementById('btnImportSVG');
  var importFile = document.getElementById('importFile');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', function () { importFile.click(); });
    importFile.addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      // Always reset value so the same file can be re-selected later.
      ev.target.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        if (typeof window.__graphImportJSON === 'function') {
          window.__graphImportJSON(reader.result);
        }
      };
      reader.onerror = function () {
        alert('Could not read the selected file.');
      };
      reader.readAsText(file);
    });
  }
})();

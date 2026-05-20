// Pending-import shim — must run BEFORE sitemap-editor.js so the IIFE in
// sitemap-editor.js parses the imported sitemap as the new model.
//
// Contract:
//   1. __graphImportJSON() stashes a validated JSON payload in
//      sessionStorage under 'pwstudio.import.pending.json' and reloads.
//   2. On the next load, this shim runs first. It reads the payload,
//      builds the SVG DOM (pages / areas / edges) inside <svg.graph>
//      while preserving <defs>, then stores the parsed state on
//      window.__pendingImportState so the main IIFE can re-apply the
//      bits that its DOM-parse pass doesn't capture (colors, borders,
//      locks, title positions, edge styles, viewport).
//
// On success the sessionStorage keys are cleared so a manual reload
// returns to a clean blank canvas.
(function () {
  var SS_KEY = 'pwstudio.import.pending.json';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  try {
    var raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    sessionStorage.removeItem(SS_KEY);

    var state = JSON.parse(raw);
    if (!state || state.format !== 'pw-studio-sitemap' || state.version !== 1) {
      console.error('[PW Studio] Import shim: invalid format/version', state && state.format, state && state.version);
      return;
    }

    var svg = document.querySelector('svg.graph');
    if (!svg) return;

    // Clear everything except <defs> (and any other elements outside the
    // editor's content area — currently only <defs>).
    Array.prototype.slice.call(svg.childNodes).forEach(function (n) {
      if (n.nodeType === 1 && n.tagName.toLowerCase() === 'defs') return;
      svg.removeChild(n);
    });

    // Build Pages: <g class="gnode" data-id data-slug [color/border/locked classes]>
    //              <rect x y width height /> <text>Name</text> [<text class="sub">Sub</text>]
    (state.pages || []).forEach(function (p) {
      var g = document.createElementNS(SVG_NS, 'g');
      var classes = ['gnode'];
      if (p.color && p.color !== 'default') classes.push('color-' + p.color);
      if (p.border && p.border !== 'solid') classes.push('border-' + p.border);
      if (p.locked) classes.push('locked');
      g.setAttribute('class', classes.join(' '));
      g.setAttribute('data-id', p.id);
      if (p.slug) g.setAttribute('data-slug', p.slug);

      // Mirror addPageNode (sitemap-editor.js) exactly so an imported Page
      // has the same shape and label position as a freshly-spawned one —
      // rounded corners (rx=5) and label/sub at the addPageNode-tuned
      // y-offsets (21 and 34 for the canonical h=48 page).
      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', p.x);
      rect.setAttribute('y', p.y);
      rect.setAttribute('width', p.w);
      rect.setAttribute('height', p.h);
      rect.setAttribute('rx', 5);
      g.appendChild(rect);

      var text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', p.x + p.w / 2);
      text.setAttribute('y', p.y + 21);
      text.textContent = p.name || '';
      g.appendChild(text);

      if (p.sub) {
        var sub = document.createElementNS(SVG_NS, 'text');
        sub.setAttribute('class', 'sub');
        sub.setAttribute('x', p.x + p.w / 2);
        sub.setAttribute('y', p.y + 34);
        sub.textContent = p.sub;
        g.appendChild(sub);
      }

      svg.appendChild(g);
    });

    // Build Areas: <rect class="gzone [color-*] [locked]" data-area-id data-slug ...>
    //              followed by <text class="gzone-label [color-*]" data-area-id>NAME</text>
    (state.areas || []).forEach(function (a) {
      var rect = document.createElementNS(SVG_NS, 'rect');
      var classes = ['gzone'];
      if (a.color && a.color !== 'neutral') classes.push('color-' + a.color);
      if (a.locked) classes.push('locked');
      rect.setAttribute('class', classes.join(' '));
      rect.setAttribute('data-area-id', a.id);
      if (a.slug) rect.setAttribute('data-slug', a.slug);
      rect.setAttribute('x', a.x);
      rect.setAttribute('y', a.y);
      rect.setAttribute('width', a.w);
      rect.setAttribute('height', a.h);
      svg.appendChild(rect);

      var label = document.createElementNS(SVG_NS, 'text');
      var lblClasses = ['gzone-label'];
      if (a.color && a.color !== 'neutral') lblClasses.push('color-' + a.color);
      label.setAttribute('class', lblClasses.join(' '));
      label.setAttribute('data-area-id', a.id);
      // Label position will be re-computed by positionAreaLabel() once the
      // IIFE has parsed it and __graphApplyImportedState() runs. Seed with
      // a top-left placeholder so it's at least inside the rect on first paint.
      label.setAttribute('x', a.x + 14);
      label.setAttribute('y', a.y + 22);
      label.textContent = (a.name || '').toUpperCase();
      svg.appendChild(label);
    });

    // Build Edges: <path class="gedge" d="M srcCenter L tgtCenter" /> — the
    // IIFE's parser uses getPointAtLength to match endpoints to nodes via
    // nearestNodeToPoint, so straight center-to-center lines are enough.
    // Real routing (perimeter, midpoints, manual overrides) is rebuilt
    // when applyImportedState() calls applyLineColor/Style/Width and
    // renderAll() re-renders edges.
    var pageById = {};
    (state.pages || []).forEach(function (p) { pageById[p.id] = p; });

    (state.edges || []).forEach(function (e) {
      var src = pageById[e.sourceId];
      var tgt = pageById[e.targetId];
      if (!src || !tgt) {
        console.warn('[PW Studio] Import shim: skipping edge with unknown endpoint', e);
        return;
      }
      var sx = src.x + src.w / 2, sy = src.y + src.h / 2;
      var tx = tgt.x + tgt.w / 2, ty = tgt.y + tgt.h / 2;

      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'gedge');
      path.setAttribute('d', 'M ' + sx + ' ' + sy + ' L ' + tx + ' ' + ty);
      path.setAttribute('fill', 'none');
      // Provide initial stroke / dasharray / width so the IIFE's
      // class-and-attr-inference (around line 268) picks reasonable
      // defaults; applyImportedState will then override authoritatively.
      path.setAttribute('stroke', 'currentColor');
      svg.appendChild(path);

      if (e.label) {
        var labelText = document.createElementNS(SVG_NS, 'text');
        labelText.setAttribute('class', 'gelabel');
        labelText.setAttribute('x', (sx + tx) / 2);
        labelText.setAttribute('y', (sy + ty) / 2);
        labelText.textContent = e.label;

        var labelBg = document.createElementNS(SVG_NS, 'rect');
        labelBg.setAttribute('class', 'gelabel-bg');
        labelBg.setAttribute('rx', 3);
        labelBg.setAttribute('x', 0);
        labelBg.setAttribute('y', 0);
        labelBg.setAttribute('width', 22);
        labelBg.setAttribute('height', 14);

        svg.appendChild(labelBg);
        svg.appendChild(labelText);
      }
    });

    // Hand the parsed state to the IIFE. Its init() will call
    // __graphApplyImportedState(state) to fix up the bits the parse
    // pass doesn't capture (colors, borders, locks, title positions,
    // edge styles, manual routing, viewport).
    window.__pendingImportState = state;
  } catch (err) {
    console.error('[PW Studio] JSON import shim failed:', err);
  }
})();

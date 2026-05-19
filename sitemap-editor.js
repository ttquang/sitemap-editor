  // -------------- quick add page (no modal) ----------------------
  // Drops a new page onto the canvas with auto-generated title + slug.
  // Wired from the +Page toolbar button and the P keyboard shortcut.
  // No modal flow — defaults are "Page N" / "page-N" where N is the
  // smallest integer that doesn't collide with an existing slug.
  function slugify(s) {
    return (s || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
  }

  var lastCreatedName = '';
  function quickAddPage() {
    // Pick the smallest N such that "page-N" isn't already an existing slug.
    // Reads the live SVG so it stays correct after imports.
    var existing = {};
    document.querySelectorAll('g.gnode[data-id]').forEach(function (el) {
      existing[el.getAttribute('data-id')] = true;
    });
    var n = 1;
    while (existing['page-' + n]) n++;
    var name = 'Page ' + n;
    var slug = 'page-' + n;
    lastCreatedName = name;

    // Hand off to the graph IIFE for actual DOM construction
    if (typeof window.__graphAddPageNode === 'function') {
      window.__graphAddPageNode(name, slug);
    } else if (typeof window.__graphAddPage === 'function') {
      window.__graphAddPage(name, slug);
    }

    // Reuse the existing toast for visual feedback
    var toast = document.getElementById('createToast');
    var tn = document.getElementById('toast-name');
    if (tn) tn.textContent = name;
    if (toast) {
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }
  }
  function openCreatedPage() {
    window.location.hash = '#page_' + slugify(lastCreatedName);
    var t = document.getElementById('createToast');
    if (t) t.classList.remove('show');
  }

/* ============================================================
   ============================================================ */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ZOOM_MIN = 0.2, ZOOM_MAX = 4;
  var DRAG_THRESHOLD = 3; // px in client space — below this, treat as a click

  var wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;
  var svg = wrap.querySelector('svg.graph');
  if (!svg) return;

  // ----- 1) Wrap all SVG content (except <defs>) in <g id="vp">
  var defs = svg.querySelector('defs');
  var vp = document.createElementNS(SVG_NS, 'g');
  vp.setAttribute('id', 'vp');
  Array.prototype.slice.call(svg.childNodes).forEach(function (n) {
    if (n === defs) return;
    vp.appendChild(n);
  });
  svg.appendChild(vp);

  // ----- 2) Parse nodes into a model
  var nodes = new Map();
  var nodeSeed = 0;
  var nodeEls = vp.querySelectorAll('.gnode');
  nodeEls.forEach(function (g) {
    var rect = g.querySelector('rect');
    if (!rect) return;
    // Reuse any pre-existing data-id; otherwise mint one. (Previously this
    // also parsed an onclick="openNodeModal('…')" attribute, but the node
    // modal has been removed.)
    var id = (g.getAttribute('data-id') || '').trim() || ('node-' + (++nodeSeed));
    g.setAttribute('data-id', id);

    var x = parseFloat(rect.getAttribute('x'));
    var y = parseFloat(rect.getAttribute('y'));
    var w = parseFloat(rect.getAttribute('width'));
    var h = parseFloat(rect.getAttribute('height'));

    // Slug: a URL-style identifier surfaced in the Page inspector. Persisted
    // back onto the SVG as data-slug so import/export round-trips it. If the
    // element already has a data-slug, trust it; otherwise default to the
    // slugified display-text content of the <g>, falling back to the id.
    var presetSlug = (g.getAttribute('data-slug') || '').trim();
    var displayText = '';
    var firstText = g.querySelector('text');
    if (firstText) displayText = (firstText.textContent || '').trim();
    var slug = presetSlug || (typeof slugify === 'function' ? slugify(displayText) : displayText.toLowerCase()) || id;
    g.setAttribute('data-slug', slug);

    var node = {
      id: id, el: g, rectEl: rect,
      x0: x, y0: y, w: w, h: h,
      offsetX: 0, offsetY: 0,
      color: 'default',
      border: 'solid',
      locked: false,
      slug: slug
    };
    nodes.set(id, node);

    // Append 4 connect handles — one per side. Hidden by default; .gnode:hover
    // in edit mode reveals all of them. The user can grab any side to start a
    // connection, and the source-side anchor is threaded through the edge
    // router so the new edge exits from the chosen side from the start.
    addConnectHandles(g, id, x, y, w, h);
  });

  function addConnectHandles(parentG, id, x, y, w, h) {
    var sides = [
      { side: 'top',    cx: x + w / 2, cy: y         },
      { side: 'right',  cx: x + w,     cy: y + h / 2 },
      { side: 'bottom', cx: x + w / 2, cy: y + h     },
      { side: 'left',   cx: x,         cy: y + h / 2 }
    ];
    sides.forEach(function (s) {
      var hndl = document.createElementNS(SVG_NS, 'circle');
      hndl.setAttribute('class', 'connect-handle');
      hndl.setAttribute('r', '5');
      hndl.setAttribute('cx', s.cx);
      hndl.setAttribute('cy', s.cy);
      hndl.setAttribute('data-handle-for', id);
      hndl.setAttribute('data-side', s.side);
      parentG.appendChild(hndl);
    });
  }

  // Update every .connect-handle's cx/cy after a page rect change. Used by
  // the page-size standardization pass and any future runtime resize.
  function positionConnectHandles(parentG, x, y, w, h) {
    var hs = parentG.querySelectorAll('.connect-handle');
    Array.prototype.forEach.call(hs, function (hndl) {
      var s = hndl.getAttribute('data-side') || 'right';
      if      (s === 'top')    { hndl.setAttribute('cx', x + w / 2); hndl.setAttribute('cy', y); }
      else if (s === 'right')  { hndl.setAttribute('cx', x + w);     hndl.setAttribute('cy', y + h / 2); }
      else if (s === 'bottom') { hndl.setAttribute('cx', x + w / 2); hndl.setAttribute('cy', y + h); }
      else if (s === 'left')   { hndl.setAttribute('cx', x);         hndl.setAttribute('cy', y + h / 2); }
    });
  }


  // ----- Line / connector settings (color, style, width) -----
  var LINE_COLORS = {
    gray:   { swatch: '#6B7B8C', stroke: 'var(--ink-mid)', marker: 'arr-gray'    },
    page:   { swatch: '#0C6C68', stroke: 'var(--page-fg)', marker: 'arr-page'    },
    accent: { swatch: '#1766DC', stroke: 'var(--accent)',  marker: 'arr-accent'  },
    warn:   { swatch: '#C9820E', stroke: 'var(--warn)',    marker: 'arr-fragile' },
    fail:   { swatch: '#D83B3B', stroke: 'var(--fail)',    marker: 'arr-fail'    },
    ok:     { swatch: '#0E8A5F', stroke: 'var(--ok)',      marker: 'arr-ok'      }
  };
  var LINE_STYLES = {
    solid:  '',
    dashed: '5,3',
    dotted: '1,3'
  };
  var LINE_WIDTHS = {
    thin:   1.5,
    normal: 2,
    thick:  3.25
  };

  function applyLineColor(e, key) {
    if (!LINE_COLORS[key]) key = 'gray';
    e.pathEl.setAttribute('stroke', LINE_COLORS[key].stroke);
    if (LINE_COLORS[key].marker) {
      e.pathEl.setAttribute('marker-end', 'url(#' + LINE_COLORS[key].marker + ')');
    }
    e.lineColor = key;
  }
  function applyLineStyle(e, key) {
    if (LINE_STYLES[key] == null) key = 'solid';
    if (key === 'solid') e.pathEl.removeAttribute('stroke-dasharray');
    else e.pathEl.setAttribute('stroke-dasharray', LINE_STYLES[key]);
    e.lineStyle = key;
  }
  function applyLineWidth(e, key) {
    if (LINE_WIDTHS[key] == null) key = 'normal';
    e.pathEl.setAttribute('stroke-width', LINE_WIDTHS[key]);
    e.lineWidth = key;
  }
  function deleteEdge(e) {
    hideEndpointHandles(e);
    if (e.pathEl && e.pathEl.parentNode) e.pathEl.parentNode.removeChild(e.pathEl);
    if (e.hitEls) e.hitEls.forEach(function (h) { if (h.parentNode) h.parentNode.removeChild(h); });
    if (e.labelTextEl && e.labelTextEl.parentNode) e.labelTextEl.parentNode.removeChild(e.labelTextEl);
    if (e.labelBgEl   && e.labelBgEl.parentNode)   e.labelBgEl.parentNode.removeChild(e.labelBgEl);
    var idx = edges.indexOf(e);
    if (idx >= 0) edges.splice(idx, 1);
  }
  window.__graphApplyLineColor = applyLineColor;
  window.__graphApplyLineStyle = applyLineStyle;
  window.__graphApplyLineWidth = applyLineWidth;
  window.__graphDeleteEdge     = deleteEdge;

  // Set / update / clear the text label for an edge.
  function setLineLabel(e, text) {
    var t = (text == null ? '' : String(text)).trim();
    if (!t) {
      if (e.labelTextEl && e.labelTextEl.parentNode) e.labelTextEl.parentNode.removeChild(e.labelTextEl);
      if (e.labelBgEl   && e.labelBgEl.parentNode)   e.labelBgEl.parentNode.removeChild(e.labelBgEl);
      e.labelTextEl = null;
      e.labelBgEl = null;
    } else {
      if (!e.labelTextEl) {
        var labelText = document.createElementNS(SVG_NS, 'text');
        labelText.setAttribute('class', 'gelabel');
        labelText.setAttribute('x', 0);
        labelText.setAttribute('y', 0);
        // Insert just after pathEl so it sits on top
        if (e.pathEl.parentNode) e.pathEl.parentNode.insertBefore(labelText, e.pathEl.nextSibling);
        e.labelTextEl = labelText;
      }
      e.labelTextEl.textContent = t;

      // Auto-size the background based on character count
      var bgW = Math.max(22, t.length * 6 + 10);
      var bgH = 14;
      if (!e.labelBgEl) {
        var labelBg = document.createElementNS(SVG_NS, 'rect');
        labelBg.setAttribute('class', 'gelabel-bg');
        labelBg.setAttribute('rx', 3);
        // Insert the bg right before the labelText so it renders behind
        if (e.labelTextEl.parentNode) e.labelTextEl.parentNode.insertBefore(labelBg, e.labelTextEl);
        e.labelBgEl = labelBg;
      }
      e.labelBgEl.setAttribute('width', bgW);
      e.labelBgEl.setAttribute('height', bgH);
    }
    renderEdge(e); // reposition / refresh
  }
  window.__graphSetLineLabel = setLineLabel;

  // ----- 3) Parse edges into a model by matching path endpoints to nodes
  var edges = [];
  vp.querySelectorAll('path.gedge').forEach(function (p) {
    var start, end;
    try {
      var len = p.getTotalLength();
      if (!len || !isFinite(len)) return;
      start = p.getPointAtLength(0);
      end = p.getPointAtLength(len);
    } catch (e) { return; }

    var src = nearestNodeToPoint(start);
    var tgt = nearestNodeToPoint(end);
    if (!src || !tgt || src === tgt) return;

    // Collect immediately-following sibling label rect + text
    var labelBg = null, labelText = null;
    var sib = p.nextElementSibling;
    while (sib && (sib.classList.contains('gelabel-bg') || sib.classList.contains('gelabel'))) {
      if (sib.classList.contains('gelabel-bg') && !labelBg) labelBg = sib;
      else if (sib.classList.contains('gelabel') && !labelText) labelText = sib;
      sib = sib.nextElementSibling;
    }

    // Infer initial line settings from existing attrs/classes
    var initialColor = 'gray';
    if (p.classList.contains('fragile')) initialColor = 'warn';
    else if (p.classList.contains('suggested')) initialColor = 'gray';
    var initialStyle = 'solid';
    var dashAttr = p.getAttribute('stroke-dasharray') || '';
    if (dashAttr.length > 0 || p.classList.contains('suggested')) initialStyle = 'dashed';
    var existingW = parseFloat(p.getAttribute('stroke-width'));
    var initialWidth = 'normal';
    if (!isNaN(existingW)) {
      if (existingW < 1.8) initialWidth = 'thin';
      else if (existingW > 2.5) initialWidth = 'thick';
    }
    var edgeObj = {
      pathEl: p, labelBgEl: labelBg, labelTextEl: labelText,
      sourceId: src.id, targetId: tgt.id,
      manualMid: null, manualSp: null, manualTp: null,
      lineColor: initialColor, lineStyle: initialStyle, lineWidth: initialWidth
    };
    edges.push(edgeObj);
    // Apply the inferred settings so stroke / marker / dasharray / width are explicit
    applyLineColor(edgeObj, initialColor);
    applyLineStyle(edgeObj, initialStyle);
    applyLineWidth(edgeObj, initialWidth);
  });

  function nearestNodeToPoint(pt) {
    var best = null, bestDist = Infinity;
    nodes.forEach(function (n) {
      var x1 = n.x0 + n.offsetX, y1 = n.y0 + n.offsetY;
      var x2 = x1 + n.w, y2 = y1 + n.h;
      var dx = Math.max(x1 - pt.x, 0, pt.x - x2);
      var dy = Math.max(y1 - pt.y, 0, pt.y - y2);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = n; }
    });
    return best;
  }

  // ----- 4) Render functions
  function rectEdgePoint(n, towardX, towardY) {
    var cx = n.x0 + n.offsetX + n.w / 2;
    var cy = n.y0 + n.offsetY + n.h / 2;
    var dx = towardX - cx, dy = towardY - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    var hw = n.w / 2, hh = n.h / 2;
    var t = Infinity;
    if (dx !== 0) t = Math.min(t, hw / Math.abs(dx));
    if (dy !== 0) t = Math.min(t, hh / Math.abs(dy));
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function renderNode(n) {
    n.el.setAttribute('transform', 'translate(' + n.offsetX + ' ' + n.offsetY + ')');
  }

  // Anchor-based orthogonal routing.
  // For each endpoint, pick which side of its rect it exits from (manual or default).
  // Build a short perpendicular stub at each end, then a single bend between stubs.
  function orthogonalRoute(s, t, edge) {
    var sB = {
      l: s.x0 + s.offsetX, r: s.x0 + s.offsetX + s.w,
      t: s.y0 + s.offsetY, b: s.y0 + s.offsetY + s.h,
      cx: s.x0 + s.offsetX + s.w / 2, cy: s.y0 + s.offsetY + s.h / 2
    };
    var tB = {
      l: t.x0 + t.offsetX, r: t.x0 + t.offsetX + t.w,
      t: t.y0 + t.offsetY, b: t.y0 + t.offsetY + t.h,
      cx: t.x0 + t.offsetX + t.w / 2, cy: t.y0 + t.offsetY + t.h / 2
    };

    function facingSide(myB, otherB) {
      var dx = otherB.cx - myB.cx, dy = otherB.cy - myB.cy;
      if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
      return dy >= 0 ? 'bottom' : 'top';
    }
    function defaultAnchor(node, side, otherB) {
      if (side === 'top' || side === 'bottom') {
        var best = null, bestD = Infinity;
        for (var i = 0; i < 5; i++) {
          var a = anchorOnSide(node, side, i);
          var d = Math.abs(a.x - otherB.cx);
          if (d < bestD) { bestD = d; best = a; }
        }
        return best;
      } else {
        var best = null, bestD = Infinity;
        for (var i = 0; i < 3; i++) {
          var a = anchorOnSide(node, side, i);
          var d = Math.abs(a.y - otherB.cy);
          if (d < bestD) { bestD = d; best = a; }
        }
        return best;
      }
    }

    var sp, ss, tp, ts;
    if (edge && edge.manualSp && edge.manualSp.side) {
      var a = anchorOnSide(s, edge.manualSp.side, edge.manualSp.idx || 0);
      sp = a; ss = a.side;
    } else {
      ss = facingSide(sB, tB);
      sp = defaultAnchor(s, ss, tB);
    }
    if (edge && edge.manualTp && edge.manualTp.side) {
      var a = anchorOnSide(t, edge.manualTp.side, edge.manualTp.idx || 0);
      tp = a; ts = a.side;
    } else {
      ts = facingSide(tB, sB);
      tp = defaultAnchor(t, ts, sB);
    }

    var STUB = 16;
    var DIR = {
      top:    { x: 0, y: -1 },
      bottom: { x: 0, y:  1 },
      left:   { x: -1, y: 0 },
      right:  { x:  1, y: 0 }
    };
    var sv = DIR[ss], tv = DIR[ts];
    var spStub = { x: sp.x + sv.x * STUB, y: sp.y + sv.y * STUB };
    var tpStub = { x: tp.x + tv.x * STUB, y: tp.y + tv.y * STUB };

    var pts;
    var ssH = (ss === 'left' || ss === 'right');
    var tsH = (ts === 'left' || ts === 'right');
    var ssV = (ss === 'top' || ss === 'bottom');
    var tsV = (ts === 'top' || ts === 'bottom');

    // Manual mid-bend: when the user has dragged a middle segment, re-route as a classic
    // 4-point Z with the bend at the dragged coordinate. Stubs are dropped so there's a
    // single, unambiguous middle segment to grab on subsequent drags.
    if (edge && edge.manualMid && edge.manualMid.axis === 'x' && ssH && tsH) {
      var Vx = edge.manualMid.value;
      pts = [sp, { x: Vx, y: sp.y }, { x: Vx, y: tp.y }, tp];
    } else if (edge && edge.manualMid && edge.manualMid.axis === 'y' && ssV && tsV) {
      var Vy = edge.manualMid.value;
      pts = [sp, { x: sp.x, y: Vy }, { x: tp.x, y: Vy }, tp];
    } else {
      // Default routing: stub + single bend.
      pts = [sp, spStub];
      var alignedX = Math.abs(spStub.x - tpStub.x) < 0.5;
      var alignedY = Math.abs(spStub.y - tpStub.y) < 0.5;
      if (!alignedX && !alignedY) {
        var bend;
        if (sv.x === 0) bend = { x: tpStub.x, y: spStub.y };  // ss vertical → first turn horizontal
        else            bend = { x: spStub.x, y: tpStub.y };  // ss horizontal → first turn vertical
        pts.push(bend);
      }
      pts.push(tpStub);
      pts.push(tp);
    }

    // Build d
    var d = 'M ' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      d += ' L ' + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
    }

    // Label on the longest segment
    var longestI = 0, longestLen = -1;
    for (var i = 0; i < pts.length - 1; i++) {
      var sl = Math.abs(pts[i+1].x - pts[i].x) + Math.abs(pts[i+1].y - pts[i].y);
      if (sl > longestLen) { longestLen = sl; longestI = i; }
    }
    var labelX = (pts[longestI].x + pts[longestI + 1].x) / 2;
    var labelY = (pts[longestI].y + pts[longestI + 1].y) / 2;

    return { d: d, labelX: labelX, labelY: labelY, points: pts };
  }

  function attachHitHoverHooks(e) {
    if (!e.hitEls || !e.pathEl) return;
    e.hitEls.forEach(function (hit) {
      if (hit._hoverAttached) return;
      hit._hoverAttached = true;
      hit.addEventListener('mouseenter', function () {
        if (e.pathEl) e.pathEl.classList.add('hovered');
      });
      hit.addEventListener('mouseleave', function () {
        if (e.pathEl) e.pathEl.classList.remove('hovered');
      });
    });
  }

  function showEndpointHandles(e) {
    var s = nodes.get(e.sourceId);
    var t = nodes.get(e.targetId);
    if (!s || !t) return;
    var r = orthogonalRoute(s, t, e);
    var sp = r.points[0];
    var tp = r.points[r.points.length - 1];

    if (!e.spHandle) {
      e.spHandle = document.createElementNS(SVG_NS, 'circle');
      e.spHandle.setAttribute('class', 'edge-endpoint-handle');
      e.spHandle.setAttribute('r', 5);
      e.spHandle.setAttribute('data-end', 'sp');
      vp.appendChild(e.spHandle);
    }
    if (!e.tpHandle) {
      e.tpHandle = document.createElementNS(SVG_NS, 'circle');
      e.tpHandle.setAttribute('class', 'edge-endpoint-handle');
      e.tpHandle.setAttribute('r', 5);
      e.tpHandle.setAttribute('data-end', 'tp');
      vp.appendChild(e.tpHandle);
    }
    e.spHandle.setAttribute('cx', sp.x);
    e.spHandle.setAttribute('cy', sp.y);
    e.tpHandle.setAttribute('cx', tp.x);
    e.tpHandle.setAttribute('cy', tp.y);
  }

  function hideEndpointHandles(e) {
    if (!e) return;
    if (e.spHandle && e.spHandle.parentNode) e.spHandle.parentNode.removeChild(e.spHandle);
    if (e.tpHandle && e.tpHandle.parentNode) e.tpHandle.parentNode.removeChild(e.tpHandle);
    e.spHandle = null;
    e.tpHandle = null;
  }

  function ensureHitPaths(e, count) {
    count = count || 3;
    if (!e.pathEl || !e.pathEl.parentNode) return;
    if (!e.hitEls) e.hitEls = [];
    while (e.hitEls.length < count) {
      var seg = document.createElementNS(SVG_NS, 'path');
      seg.setAttribute('class', 'gedge-hit');
      seg.setAttribute('data-edge-idx', edges.indexOf(e));
      seg.setAttribute('data-segment', e.hitEls.length);
      e.pathEl.parentNode.insertBefore(seg, e.pathEl);
      e.hitEls.push(seg);
    }
  }

  function syncHitPaths(e, pts) {
    if (pts.length < 4) {
      // No segments to grab on; ensure the hit-paths (if they exist) are hidden,
      // and clear any stale hovered state from the visible edge.
      if (e.hitEls) e.hitEls.forEach(function (seg) { seg.style.display = 'none'; });
      if (e.pathEl) e.pathEl.classList.remove('hovered');
      return;
    }
    // Ensure the right number of hit-paths exist
    var n = pts.length - 1;
    ensureHitPaths(e, n);
    for (var i = 0; i < n; i++) {
      var p1 = pts[i], p2 = pts[i + 1];
      var seg = e.hitEls[i];
      seg.setAttribute('d',
        'M ' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) +
        ' L ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1));
      var verticalSeg = Math.abs(p1.x - p2.x) < 0.1;
      seg.setAttribute('data-axis', verticalSeg ? 'x' : 'y');
      seg.setAttribute('data-segment', i);
      seg.setAttribute('data-last-segment', i === n - 1 ? '1' : '0');
      seg.style.display = '';
    }
    // Hide any extra hit-paths from previous renders with more segments
    if (e.hitEls) {
      for (var j = n; j < e.hitEls.length; j++) e.hitEls[j].style.display = 'none';
    }
  }

    function renderEdge(e) {
    var s = nodes.get(e.sourceId);
    var t = nodes.get(e.targetId);
    if (!s || !t) return;
    var r = orthogonalRoute(s, t, e);
    e.pathEl.setAttribute('d', r.d);

    // Sync per-segment hit paths (creates them on first call).
    syncHitPaths(e, r.points);
    attachHitHoverHooks(e);
    // If endpoint handles are currently shown for this edge, keep them on the new route's endpoints
    if (e.spHandle || e.tpHandle) {
      var sp = r.points[0], tp = r.points[r.points.length - 1];
      if (e.spHandle) {
        e.spHandle.setAttribute('cx', sp.x);
        e.spHandle.setAttribute('cy', sp.y);
      }
      if (e.tpHandle) {
        e.tpHandle.setAttribute('cx', tp.x);
        e.tpHandle.setAttribute('cy', tp.y);
      }
    }

    if (e.labelTextEl) {
      e.labelTextEl.setAttribute('x', r.labelX);
      e.labelTextEl.setAttribute('y', r.labelY);
      if (e.labelBgEl) {
        var w = parseFloat(e.labelBgEl.getAttribute('width')) || 22;
        var h = parseFloat(e.labelBgEl.getAttribute('height')) || 14;
        e.labelBgEl.setAttribute('x', r.labelX - w / 2);
        e.labelBgEl.setAttribute('y', r.labelY - h + 4);
      }
    }
  }

  function renderEdgesForNode(nodeId) {
    edges.forEach(function (e) {
      if (e.sourceId === nodeId || e.targetId === nodeId) renderEdge(e);
    });
  }

  function renderAll() {
    nodes.forEach(renderNode);
    edges.forEach(renderEdge);
  }

  // ----- 5) Viewport transform — fit / zoom / pan
  var vpScale = 1, vpTx = 0, vpTy = 0;
  var vbW = 1600, vbH = 900;

  function applyVp() {
    vp.setAttribute('transform',
      'translate(' + vpTx.toFixed(2) + ' ' + vpTy.toFixed(2) + ') scale(' + vpScale.toFixed(4) + ')');
  }

  function updateViewBox() {
    var r = wrap.getBoundingClientRect();
    vbW = Math.max(100, Math.floor(r.width));
    vbH = Math.max(100, Math.floor(r.height));
    svg.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
  }

  function contentBbox(pad) {
    if (pad == null) pad = 60;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      var x = n.x0 + n.offsetX, y = n.y0 + n.offsetY;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + n.w > maxX) maxX = x + n.w;
      if (y + n.h > maxY) maxY = y + n.h;
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1600; maxY = 900; }
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }

  function fitToView() {
    updateViewBox();
    var bb = contentBbox(60);
    var s = Math.min(vbW / bb.w, vbH / bb.h);
    vpScale = clamp(s, ZOOM_MIN, ZOOM_MAX);
    vpTx = (vbW - bb.w * vpScale) / 2 - bb.x * vpScale;
    vpTy = (vbH - bb.h * vpScale) / 2 - bb.y * vpScale;
    applyVp();
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Client (browser) coord -> viewBox (SVG internal) coord
  function clientToViewBox(cx, cy) {
    var pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }
  function viewBoxToWorld(vbX, vbY) {
    return { x: (vbX - vpTx) / vpScale, y: (vbY - vpTy) / vpScale };
  }
  function clientToWorld(cx, cy) {
    var v = clientToViewBox(cx, cy);
    return viewBoxToWorld(v.x, v.y);
  }

  function zoomBy(factor, centerVbX, centerVbY) {
    var ns = clamp(vpScale * factor, ZOOM_MIN, ZOOM_MAX);
    if (ns === vpScale) return;
    if (centerVbX == null) { centerVbX = vbW / 2; centerVbY = vbH / 2; }
    var wx = (centerVbX - vpTx) / vpScale;
    var wy = (centerVbY - vpTy) / vpScale;
    vpScale = ns;
    vpTx = centerVbX - wx * vpScale;
    vpTy = centerVbY - wy * vpScale;
    applyVp();
  }

  // ----- 6) Interactions — pan / node-drag / connect
  var editMode = false;
  var currentTool = 'hand';     // 'cursor' (marquee) or 'hand' (pan); Hand is the default so element drag works without first switching tools.
  var panState = null, nodeDragState = null, connectState = null, areaDragState = null, areaResizeState = null, edgeDragState = null, edgeEndpointDragState = null;
  var marqueeState = null, marqueeEl = null;
  var suppressNextClick = false;

  // Box-overlap helper used by the marquee — true if rect A intersects rect B.
  function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    return !(ax + aw < bx || ax > bx + bw || ay + ah < by || ay > by + bh);
  }

  // App-mode state: 'view' | 'edit' | 'ai'. setEditMode is now a
  // thin wrapper around setAppMode for backward compatibility with
  // existing call sites (selectPage, selectArea, etc.).
  var currentAppMode = 'view';

  function setAppMode(mode) {
    if (mode !== 'view' && mode !== 'edit' && mode !== 'ai') return;
    currentAppMode = mode;
    editMode = (mode === 'edit');

    // SVG class hints (legacy)
    svg.classList.toggle('editmode', editMode);

    // Toolbar surface (drives the violet AI wash + mode-specific palette)
    var bottom = document.getElementById('bottomToolbar');
    if (bottom) {
      bottom.classList.toggle('mode-view', mode === 'view');
      bottom.classList.toggle('mode-edit', mode === 'edit');
      bottom.classList.toggle('mode-ai',   mode === 'ai');
      bottom.setAttribute('data-app-mode', mode);
    }

    // App-mode segmented toggle — sync the active button + slide the pill
    var appSeg = document.querySelector('.bottom-toolbar .seg.seg-app');
    if (appSeg) {
      var btns = Array.prototype.slice.call(appSeg.querySelectorAll(':scope > button[data-mode]'));
      btns.forEach(function (b) {
        b.classList.remove('active', 'mode-view', 'mode-edit', 'mode-ai');
        if (b.getAttribute('data-mode') === mode) {
          b.classList.add('active', 'mode-' + mode);
        }
      });
      if (typeof positionSegPill === 'function') positionSegPill(appSeg);
    }

    // Edit-only affordances
    var hint = document.getElementById('editHint');
    if (hint) hint.classList.toggle('show', editMode);
    var area = document.querySelector('.graph-area');
    if (area) area.classList.toggle('editmode-open', editMode);

    // Element palette buttons (+Page, +Area) — only visible in Edit mode.
    // We hide rather than disable so the toolbar reads as "uncluttered in
    // view mode" instead of "two greyed-out buttons you can't use".
    document.querySelectorAll('[data-needs-edit]').forEach(function (b) {
      if (editMode) {
        b.hidden = false;
        b.removeAttribute('aria-disabled');
      } else {
        b.hidden = true;
        b.setAttribute('aria-disabled', 'true');
      }
    });

    // AI chat panel — visible only in AI mode
    var ai = document.getElementById('aiChatPanel');
    if (ai) {
      if (mode === 'ai') {
        ai.hidden = false;
        // next frame: add .show for the opacity/transform transition
        requestAnimationFrame(function () { ai.classList.add('show'); });
        var input = document.getElementById('aiChatInput');
        if (input) setTimeout(function () { input.focus(); }, 60);
      } else {
        ai.classList.remove('show');
        setTimeout(function () { if (currentAppMode !== 'ai') ai.hidden = true; }, 160);
      }
    }

    // Selection / tool reset when leaving edit mode
    if (!editMode) clearSelection();
    if (editMode && !currentTool) setTool('hand');

    // Cursor SVG hint
    if (!editMode) { svg.classList.remove('tool-hand'); svg.classList.remove('tool-cursor'); }
    else if (currentTool === 'hand') { svg.classList.add('tool-hand'); svg.classList.remove('tool-cursor'); }
    else { svg.classList.add('tool-cursor'); svg.classList.remove('tool-hand'); }
  }

  function setEditMode(on) {
    setAppMode(on ? 'edit' : 'view');
  }

  // Switch the active pointer tool. Updates the JS state, the toolbar buttons,
  // the SVG cursor-hint class, AND slides the Pointer seg's pill so every
  // entry point (click handler, V/H keyboard, programmatic from setAppMode)
  // animates consistently.
  function setTool(name) {
    if (name !== 'cursor' && name !== 'hand') return;
    currentTool = name;
    svg.classList.toggle('tool-cursor', name === 'cursor');
    svg.classList.toggle('tool-hand', name === 'hand');
    var bottom = document.getElementById('bottomToolbar');
    if (!bottom) return;
    // Sync the .active class on the pointer-mode buttons.
    var btns = bottom.querySelectorAll('button[data-tool]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === name);
    });
    // Slide the pointer seg's pill to track the new active button.
    var seg = bottom.querySelector('.seg.seg-pointer');
    if (seg && typeof positionSegPill === 'function') positionSegPill(seg);
  }
  window.__graphSetTool = setTool;

  svg.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;

    // Edge endpoint handle (selected edge) -> snap-to-anchor drag
    var endHit = ev.target.closest && ev.target.closest('.edge-endpoint-handle');
    if (endHit && editMode && selected.kind === 'edge') {
      var endKind = endHit.getAttribute('data-end');
      var nodeRef = endKind === 'sp' ? nodes.get(selected.ref.sourceId) : nodes.get(selected.ref.targetId);
      if (nodeRef) {
        // Show anchor dots on the relevant page during the drag
        nodeRef.el.classList.add('showing-anchors');
        edgeEndpointDragState = { edge: selected.ref, end: endKind, node: nodeRef };
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }

    // Edge mid-segment in edit mode -> start a segment drag
    var edgeHit = ev.target.closest && ev.target.closest('.gedge-hit');
    if (edgeHit && editMode) {
      var ei = parseInt(edgeHit.getAttribute('data-edge-idx'), 10);
      var seg = parseInt(edgeHit.getAttribute('data-segment'), 10);
      var lastSeg = edgeHit.getAttribute('data-last-segment') === '1';
      var edgeObj = edges[ei];
      var axis = edgeHit.getAttribute('data-axis');
      if (edgeObj && (axis === 'x' || axis === 'y') && !isNaN(seg)) {
        var w0 = clientToWorld(ev.clientX, ev.clientY);
        edgeDragState = {
          edge: edgeObj, axis: axis, segment: seg,
          lastSegmentIdx: lastSeg ? seg : null,
          startClientX: ev.clientX, startClientY: ev.clientY,
          startWorldX: w0.x, startWorldY: w0.y,
          moved: false
        };
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }

    // Connect handle in edit mode -> start drawing a new edge from the
    // chosen side of the source page (top|right|bottom|left).
    var handle = ev.target.closest && ev.target.closest('.connect-handle');
    if (handle && editMode) {
      var srcId = handle.getAttribute('data-handle-for');
      var srcSide = handle.getAttribute('data-side') || 'right';
      var src = nodes.get(srcId);
      if (src) startConnect(src, srcSide);
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    // Node: in edit mode, mousedown may become a drag (with click-vs-drag threshold).
    // Outside edit mode, the mousedown is consumed but no further action runs.
    // Locked nodes still enter startNodeDrag so the mouseup-as-click path can
    // open the inspector — otherwise a locked page couldn't be selected to
    // unlock. Motion is suppressed in the mousemove handler when locked.
    var nodeEl = ev.target.closest && ev.target.closest('.gnode');
    if (nodeEl) {
      if (editMode) {
        var id = nodeEl.getAttribute('data-id');
        var n = nodes.get(id);
        if (n) startNodeDrag(n, ev);
        ev.preventDefault();
      }
      return;
    }

    // Resize handle in edit mode -> start a area resize
    var resizeHit = ev.target.closest && ev.target.closest('.resize-handle');
    if (resizeHit && editMode) {
      var rgid = resizeHit.getAttribute('data-area-id');
      var rdir = resizeHit.getAttribute('data-handle-dir');
      var rgrp = findAreaById(rgid);
      if (rgrp && rdir && !rgrp.locked) {
        startAreaResize(rgrp, rdir, ev);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }

    // Area label -> open editor immediately
    var labelHit = ev.target.closest && ev.target.closest('.gzone-label');
    if (labelHit) {
      var gidL = labelHit.getAttribute('data-area-id');
      var grpL = findAreaById(gidL);
      if (grpL) {
        openAreaEditor(grpL);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }
    // Area rect in edit mode -> start a deferred drag (click without movement opens the editor).
    // Locked areas still enter startAreaDrag so the click-without-movement
    // path can select them; mousemove suppresses position changes when
    // areaDragState.area.locked. This is what lets the user unlock from the
    // inspector.
    var zoneHit = ev.target.closest && ev.target.closest('rect.gzone');
    if (zoneHit && editMode) {
      var gidR = zoneHit.getAttribute('data-area-id');
      var grpR = findAreaById(gidR);
      if (grpR) {
        startAreaDrag(grpR, ev);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }

    // Empty area:
    //   · view mode → pan (original behavior)
    //   · edit mode + cursor tool → marquee (rubber-band) multi-select
    //   · edit mode + hand tool → pan
    //   alt-drag in edit mode is still an escape valve that pans regardless of tool.
    if (editMode && currentTool === 'cursor' && !ev.altKey) {
      startMarquee(ev);
    } else {
      startPan(ev);
    }
    ev.preventDefault();
  });

  function startMarquee(ev) {
    var w0 = clientToWorld(ev.clientX, ev.clientY);
    marqueeState = {
      startClientX: ev.clientX, startClientY: ev.clientY,
      startWorldX: w0.x, startWorldY: w0.y,
      additive: !!(ev.shiftKey || ev.metaKey || ev.ctrlKey),
      moved: false
    };
    marqueeEl = document.createElementNS(SVG_NS, 'rect');
    marqueeEl.setAttribute('class', 'marquee-rect');
    marqueeEl.setAttribute('x', w0.x);
    marqueeEl.setAttribute('y', w0.y);
    marqueeEl.setAttribute('width', 0);
    marqueeEl.setAttribute('height', 0);
    marqueeEl.setAttribute('fill', 'rgba(23, 102, 220, 0.08)');
    marqueeEl.setAttribute('stroke', '#1766DC');
    marqueeEl.setAttribute('stroke-width', '1');
    marqueeEl.setAttribute('stroke-dasharray', '4 3');
    marqueeEl.setAttribute('pointer-events', 'none');
    vp.appendChild(marqueeEl);
    svg.classList.add('marquee-selecting');
  }

  function cancelMarquee() {
    if (marqueeEl && marqueeEl.parentNode) marqueeEl.parentNode.removeChild(marqueeEl);
    marqueeEl = null;
    marqueeState = null;
    svg.classList.remove('marquee-selecting');
  }

  function startPan(ev) {
    panState = {
      startClientX: ev.clientX, startClientY: ev.clientY,
      startTx: vpTx, startTy: vpTy
    };
    svg.classList.add('panning');
  }

  function startNodeDrag(n, ev) {
    var w0 = clientToWorld(ev.clientX, ev.clientY);
    nodeDragState = {
      node: n,
      startClientX: ev.clientX, startClientY: ev.clientY,
      startWorldX: w0.x, startWorldY: w0.y,
      startOffsetX: n.offsetX, startOffsetY: n.offsetY,
      shiftKey: !!ev.shiftKey,
      moved: false,
      groupmates: collectGroupmates(n)
    };
  }

  function startConnect(srcNode, side) {
    // Side defaults to 'right' for backward compatibility with any call
    // sites that haven't been updated. The chosen side's center is used as
    // the preview line's anchor — top/bottom use anchor idx 2 (3rd of 5),
    // left/right use anchor idx 1 (2nd of 3); both resolve to the side's
    // midpoint in anchorOnSide().
    side = (side === 'top' || side === 'bottom' || side === 'left' || side === 'right') ? side : 'right';
    var idx = (side === 'top' || side === 'bottom') ? 2 : 1;
    var anchor = anchorOnSide(srcNode, side, idx);
    var preview = document.createElementNS(SVG_NS, 'line');
    preview.setAttribute('class', 'connect-preview');
    vp.appendChild(preview);
    preview.setAttribute('x1', anchor.x);
    preview.setAttribute('y1', anchor.y);
    preview.setAttribute('x2', anchor.x);
    preview.setAttribute('y2', anchor.y);
    connectState = {
      src: srcNode, srcSide: side, srcIdx: idx,
      previewEl: preview, dropTarget: null
    };
    svg.classList.add('connecting');
  }

  function startAreaDrag(g, ev) {
    // Remember shift so a non-moving "click" with shift can toggle multi-select.
    var shiftKey = !!ev.shiftKey;
    // Build the moving set:
    //   - g itself
    //   - every area currently nested inside g (parent + children translate
    //     as one unit)
    //   - every page currently inside g's rect (the "Page belongs to one
    //     Area" relationship: dragging the area carries member pages along
    //     so the user can re-place the whole region without breaking
    //     membership)
    //   - if g is in a logical group, the group's other area members along
    //     with their own descendant areas/pages, plus any group-member pages
    // The mover lists are deduped by id, so a page that's both inside g and
    // in g's group only travels once.
    var w0 = clientToWorld(ev.clientX, ev.clientY);
    var movers = [];
    var moverSet = {};
    function addMoverArea(a) {
      if (!a || moverSet[a.id]) return;
      moverSet[a.id] = true;
      movers.push({ area: a, startX: a.x, startY: a.y });
    }
    addMoverArea(g);
    getAreaDescendants(g).forEach(addMoverArea);

    var pageMates = [];
    var pageMatesSet = {};
    function addPageMate(p) {
      if (!p || pageMatesSet[p.id]) return;
      pageMatesSet[p.id] = true;
      pageMates.push({ ref: p, startOffsetX: p.offsetX, startOffsetY: p.offsetY });
    }
    // Pages geometrically inside g (and inside any descendant area, since
    // those are also inside g's rect).
    getPagesInArea(g).forEach(addPageMate);

    var grp = (typeof findGroupOf === 'function') ? findGroupOf(g) : null;
    if (grp) {
      grp.memberIds.forEach(function (mid) {
        if (mid === g.id) return;
        var ref = findPageOrAreaById(mid);
        if (!ref) return;
        if (typeof isPage === 'function' && isPage(ref)) {
          addPageMate(ref);
        } else if (typeof isArea === 'function' && isArea(ref)) {
          addMoverArea(ref);
          getAreaDescendants(ref).forEach(addMoverArea);
          // Pages currently inside this group-mate area should ride along too.
          getPagesInArea(ref).forEach(addPageMate);
        }
      });
    }

    areaDragState = {
      area: g,
      startClientX: ev.clientX, startClientY: ev.clientY,
      startWorldX: w0.x, startWorldY: w0.y,
      startAreaX: g.x, startAreaY: g.y,
      shiftKey: shiftKey,
      moved: false,
      movers: movers,
      moverSet: moverSet,
      pageMates: pageMates
    };
  }

  // For a drag starting on `item`, snapshot every OTHER member of its
  // group with the start position needed to translate it by the same
  // delta. Pages translate via offsetX/offsetY; areas via moveAreaTo.
  function collectGroupmates(item) {
    var out = [];
    if (typeof findGroupOf !== 'function') return out;
    var grp = findGroupOf(item);
    if (!grp) return out;
    grp.memberIds.forEach(function (mid) {
      if (mid === item.id) return;
      var ref = findPageOrAreaById(mid);
      if (!ref) return;
      if (typeof isPage === 'function' && isPage(ref)) {
        out.push({ kind: 'page', ref: ref, startOffsetX: ref.offsetX, startOffsetY: ref.offsetY });
      } else if (typeof isArea === 'function' && isArea(ref)) {
        out.push({ kind: 'area', ref: ref, startX: ref.x, startY: ref.y });
      }
    });
    return out;
  }

  // Compute where the area's title label should sit, based on the
  // area's bbox and g.titlePos. Supported positions:
  //   top-left | top-center | top-right | bottom-left | bottom-center | bottom-right
  function positionAreaLabel(g) {
    if (!g || !g.labelEl) return;
    var pos = g.titlePos || 'top-left';
    var padX = 14;
    var topY = 22;       // baseline 22px below the rect top (matches the original)
    var botY = 10;       // baseline 10px above the rect bottom
    var x, y, anchor;
    if (pos === 'top-center')         { x = g.x + g.w / 2;      y = g.y + topY;       anchor = 'middle'; }
    else if (pos === 'top-right')     { x = g.x + g.w - padX;   y = g.y + topY;       anchor = 'end';    }
    else if (pos === 'bottom-left')   { x = g.x + padX;         y = g.y + g.h - botY; anchor = 'start';  }
    else if (pos === 'bottom-center') { x = g.x + g.w / 2;      y = g.y + g.h - botY; anchor = 'middle'; }
    else if (pos === 'bottom-right')  { x = g.x + g.w - padX;   y = g.y + g.h - botY; anchor = 'end';    }
    else                              { x = g.x + padX;         y = g.y + topY;       anchor = 'start';  }
    g.labelEl.setAttribute('x', x);
    g.labelEl.setAttribute('y', y);
    g.labelEl.setAttribute('text-anchor', anchor);
  }

  function setAreaTitlePos(g, pos) {
    if (!g) return;
    g.titlePos = pos;
    positionAreaLabel(g);
  }
  window.__graphSetAreaTitlePos = setAreaTitlePos;

  function moveAreaTo(g, x, y) {
    g.x = x; g.y = y;
    g.rectEl.setAttribute('x', x);
    g.rectEl.setAttribute('y', y);
    positionAreaLabel(g);
    positionHandles(g);
  }

  function resizeAreaTo(g, x, y, w, h) {
    g.x = x; g.y = y; g.w = w; g.h = h;
    g.rectEl.setAttribute('x', x);
    g.rectEl.setAttribute('y', y);
    g.rectEl.setAttribute('width', w);
    g.rectEl.setAttribute('height', h);
    positionAreaLabel(g);
    positionHandles(g);
  }

  function startAreaResize(g, dir, ev) {
    var w0 = clientToWorld(ev.clientX, ev.clientY);
    areaResizeState = {
      area: g, dir: dir,
      startWorldX: w0.x, startWorldY: w0.y,
      startX: g.x, startY: g.y, startW: g.w, startH: g.h
    };
  }

  // ----- Resize-handle hover visibility
  // Only the smallest (deepest) Area whose rect contains the cursor reveals
  // its 8 resize handles — nested parents stay hidden so the user can grab
  // the inner Area without parent handles getting in the way. When any drag
  // or resize is in progress, hover updates pause so the active Area's
  // handles remain visible even if the cursor temporarily leaves the rect.
  var hotAreaId = null;
  function findHotAreaAt(wx, wy) {
    // Pad slightly so the resize-handle circles (r ≈ 3 world units, sitting
    // on the rect's edges) keep .hovered when the cursor is just outside the
    // rect proper. Otherwise the handle would vanish the moment the cursor
    // crossed the edge onto the handle's outer half.
    var PAD = 8;
    var best = null, bestSize = Infinity;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (wx < a.x - PAD || wx > a.x + a.w + PAD ||
          wy < a.y - PAD || wy > a.y + a.h + PAD) continue;
      var size = a.w * a.h;
      if (size < bestSize) { best = a; bestSize = size; }
    }
    return best;
  }
  function setHotArea(g) {
    var newId = g ? g.id : null;
    if (newId === hotAreaId) return;
    // Drop .hovered from every currently-shown handle.
    var prev = vp.querySelectorAll('.resize-handle.hovered');
    Array.prototype.forEach.call(prev, function (h) { h.classList.remove('hovered'); });
    hotAreaId = newId;
    if (g && g.handles) {
      Object.keys(g.handles).forEach(function (k) {
        var h = g.handles[k];
        if (h) h.classList.add('hovered');
      });
    }
  }
  function clearHotAreaOnLeave() { setHotArea(null); }
  if (svg) svg.addEventListener('mouseleave', clearHotAreaOnLeave);

  window.addEventListener('mousemove', function (ev) {
    // Update which Area shows its resize handles. Skipped during any active
    // pointer-driven interaction so an in-progress resize doesn't flicker
    // when the cursor strays outside the area mid-drag.
    if (editMode &&
        !areaResizeState && !areaDragState && !nodeDragState &&
        !panState && !connectState && !marqueeState &&
        !edgeDragState && !edgeEndpointDragState) {
      var wHot = clientToWorld(ev.clientX, ev.clientY);
      setHotArea(findHotAreaAt(wHot.x, wHot.y));
    }

    if (edgeEndpointDragState) {
      var w = clientToWorld(ev.clientX, ev.clientY);
      var s = edgeEndpointDragState;
      var a = nearestAnchorOn(s.node, w.x, w.y);
      if (s.end === 'sp') s.edge.manualSp = { side: a.side, idx: a.idx };
      else                s.edge.manualTp = { side: a.side, idx: a.idx };
      renderEdge(s.edge);
      showEndpointHandles(s.edge);
      return;
    }

    if (edgeDragState) {
      if (!edgeDragState.moved) {
        var ddx = Math.abs(ev.clientX - edgeDragState.startClientX);
        var ddy = Math.abs(ev.clientY - edgeDragState.startClientY);
        if (ddx + ddy < DRAG_THRESHOLD) return;
        edgeDragState.moved = true;
      }
      var w = clientToWorld(ev.clientX, ev.clientY);
      var edgeBeing = edgeDragState.edge;
      if (edgeDragState.segment === 0) {
        var srcNode = nodes.get(edgeBeing.sourceId);
        if (srcNode) {
          var a = nearestAnchorOn(srcNode, w.x, w.y);
          edgeBeing.manualSp = { side: a.side, idx: a.idx };
        }
      } else if (edgeDragState.segment === (edgeDragState.lastSegmentIdx != null ? edgeDragState.lastSegmentIdx : 2)) {
        var tgtNode = nodes.get(edgeBeing.targetId);
        if (tgtNode) {
          var a = nearestAnchorOn(tgtNode, w.x, w.y);
          edgeBeing.manualTp = { side: a.side, idx: a.idx };
        }
      } else {
        edgeBeing.manualMid = { axis: edgeDragState.axis, value: edgeDragState.axis === 'x' ? w.x : w.y };
      }
      renderEdge(edgeBeing);
      return;
    }

    if (areaResizeState) {
      var rs = areaResizeState;
      var ww = clientToWorld(ev.clientX, ev.clientY);
      var rdx = ww.x - rs.startWorldX;
      var rdy = ww.y - rs.startWorldY;
      var nx = rs.startX, ny = rs.startY, nw = rs.startW, nh = rs.startH;
      if (rs.dir.indexOf('w') >= 0) { nx = rs.startX + rdx; nw = rs.startW - rdx; }
      if (rs.dir.indexOf('e') >= 0) { nw = rs.startW + rdx; }
      if (rs.dir.indexOf('n') >= 0) { ny = rs.startY + rdy; nh = rs.startH - rdy; }
      if (rs.dir.indexOf('s') >= 0) { nh = rs.startH + rdy; }
      // clampAreaResize enforces min size + nested-area rules (must still
      // contain current descendants, must not partially overlap any other
      // area).
      var clamped = clampAreaResize(rs.area, rs.dir, nx, ny, nw, nh);
      resizeAreaTo(rs.area, clamped.x, clamped.y, clamped.w, clamped.h);
      restackAreas();
      return;
    }

    if (marqueeState) {
      var mdx = Math.abs(ev.clientX - marqueeState.startClientX);
      var mdy = Math.abs(ev.clientY - marqueeState.startClientY);
      if (!marqueeState.moved && (mdx + mdy) < DRAG_THRESHOLD) return;
      marqueeState.moved = true;
      var mw = clientToWorld(ev.clientX, ev.clientY);
      var mx = Math.min(marqueeState.startWorldX, mw.x);
      var my = Math.min(marqueeState.startWorldY, mw.y);
      var mWid = Math.abs(mw.x - marqueeState.startWorldX);
      var mHei = Math.abs(mw.y - marqueeState.startWorldY);
      if (marqueeEl) {
        marqueeEl.setAttribute('x', mx);
        marqueeEl.setAttribute('y', my);
        marqueeEl.setAttribute('width', mWid);
        marqueeEl.setAttribute('height', mHei);
      }
      return;
    }

    if (panState) {
      var ctm = svg.getScreenCTM();
      var sx = ctm ? ctm.a : 1, sy = ctm ? ctm.d : 1;
      var dx = (ev.clientX - panState.startClientX) / (sx || 1);
      var dy = (ev.clientY - panState.startClientY) / (sy || 1);
      vpTx = panState.startTx + dx;
      vpTy = panState.startTy + dy;
      applyVp();
      return;
    }

    if (nodeDragState) {
      var px = Math.abs(ev.clientX - nodeDragState.startClientX);
      var py = Math.abs(ev.clientY - nodeDragState.startClientY);
      if (!nodeDragState.moved && (px + py) < DRAG_THRESHOLD) return; // still a "click"
      // Element movement is only allowed in Pointer Mode - Hand.
      // In cursor mode, suppress drag-to-move so mouseup falls back to click/select.
      if (currentTool !== 'hand') return;
      // Locked: keep the drag state alive so mouseup can still resolve as a
      // click and open the inspector, but never apply any motion.
      if (nodeDragState.node.locked) return;
      if (!nodeDragState.moved) {
        nodeDragState.moved = true;
        nodeDragState.node.el.classList.add('dragging');
      }
      var w = clientToWorld(ev.clientX, ev.clientY);
      var ddx = w.x - nodeDragState.startWorldX;
      var ddy = w.y - nodeDragState.startWorldY;

      // Smart-guide snap: align the dragged node's edges/center with any
      // other page or area. Exclude the dragged node itself plus any
      // group-mate items that travel with it.
      var nd = nodeDragState.node;
      var ndStartRect = {
        x: nd.x0 + nodeDragState.startOffsetX,
        y: nd.y0 + nodeDragState.startOffsetY,
        w: nd.w, h: nd.h
      };
      var excludeNd = {}; excludeNd[nd.id] = true;
      if (nodeDragState.groupmates) {
        nodeDragState.groupmates.forEach(function (m) {
          if (m.ref && m.ref.id) excludeNd[m.ref.id] = true;
        });
      }
      var snapN = computeSnap(ndStartRect, ddx, ddy, getSnapTargetRects(excludeNd));
      ddx = snapN.dx; ddy = snapN.dy;
      showSmartGuides(snapN, {
        x: ndStartRect.x + ddx, y: ndStartRect.y + ddy, w: ndStartRect.w, h: ndStartRect.h
      });

      nd.offsetX = nodeDragState.startOffsetX + ddx;
      nd.offsetY = nodeDragState.startOffsetY + ddy;
      renderNode(nd);
      renderEdgesForNode(nd.id);
      // Groupmates ride along with the same delta.
      if (nodeDragState.groupmates && nodeDragState.groupmates.length) {
        nodeDragState.groupmates.forEach(function (m) {
          if (m.kind === 'page') {
            m.ref.offsetX = m.startOffsetX + ddx;
            m.ref.offsetY = m.startOffsetY + ddy;
            renderNode(m.ref);
            renderEdgesForNode(m.ref.id);
          } else if (m.kind === 'area') {
            moveAreaTo(m.ref, m.startX + ddx, m.startY + ddy);
          }
        });
      }
      return;
    }

    if (areaDragState) {
      var gpx = Math.abs(ev.clientX - areaDragState.startClientX);
      var gpy = Math.abs(ev.clientY - areaDragState.startClientY);
      if (!areaDragState.moved && (gpx + gpy) < DRAG_THRESHOLD) return;
      // Element movement is only allowed in Pointer Mode - Hand.
      if (currentTool !== 'hand') return;
      // Locked: keep drag state alive so mouseup → click → select works,
      // but suppress any motion.
      if (areaDragState.area.locked) return;
      if (!areaDragState.moved) {
        areaDragState.moved = true;
        areaDragState.area.rectEl.classList.add('dragging');
      }
      var gw = clientToWorld(ev.clientX, ev.clientY);
      var reqdx = gw.x - areaDragState.startWorldX;
      var reqdy = gw.y - areaDragState.startWorldY;

      var movers = areaDragState.movers;
      var moverSet = areaDragState.moverSet;
      // Try (dx, dy) against every mover; reject if any mover's candidate
      // rect partially overlaps a non-mover area. Used per-axis below so
      // the user can slide along an obstacle edge instead of getting stuck.
      function tryAreaDelta(dx, dy) {
        for (var i = 0; i < movers.length; i++) {
          var m = movers[i];
          var nr = { x: m.startX + dx, y: m.startY + dy, w: m.area.w, h: m.area.h };
          for (var j = 0; j < areas.length; j++) {
            var a = areas[j];
            if (moverSet[a.id]) continue;
            if (rectsPartiallyOverlap(nr, _rectOf(a))) return false;
          }
        }
        return true;
      }
      var dx = reqdx, dy = reqdy;
      if (!tryAreaDelta(dx, dy)) {
        if (tryAreaDelta(dx, 0)) dy = 0;
        else if (tryAreaDelta(0, dy)) dx = 0;
        else { clearSmartGuides(); return; } // No valid motion this frame.
      }

      // Smart-guide snap: align the dragged area's edges/center with other
      // pages/areas. The snap is only applied if it still satisfies the
      // no-overlap rule for every mover — otherwise we keep the unsnapped
      // delta so collision avoidance always wins.
      var primaryStartRect = {
        x: areaDragState.startAreaX, y: areaDragState.startAreaY,
        w: areaDragState.area.w, h: areaDragState.area.h
      };
      var areaExclude = {};
      Object.keys(moverSet).forEach(function (k) { areaExclude[k] = true; });
      if (areaDragState.pageMates) {
        areaDragState.pageMates.forEach(function (m) {
          if (m.ref && m.ref.id) areaExclude[m.ref.id] = true;
        });
      }
      var snapA = computeSnap(primaryStartRect, dx, dy, getSnapTargetRects(areaExclude));
      if ((snapA.guideX || snapA.guideY) && tryAreaDelta(snapA.dx, snapA.dy)) {
        dx = snapA.dx; dy = snapA.dy;
        showSmartGuides(snapA, {
          x: primaryStartRect.x + dx, y: primaryStartRect.y + dy,
          w: primaryStartRect.w, h: primaryStartRect.h
        });
      } else {
        clearSmartGuides();
      }

      movers.forEach(function (m) {
        moveAreaTo(m.area, m.startX + dx, m.startY + dy);
      });
      if (areaDragState.pageMates && areaDragState.pageMates.length) {
        areaDragState.pageMates.forEach(function (m) {
          m.ref.offsetX = m.startOffsetX + dx;
          m.ref.offsetY = m.startOffsetY + dy;
          renderNode(m.ref);
          renderEdgesForNode(m.ref.id);
        });
      }
      restackAreas();
      return;
    }

    if (connectState) {
      var ww = clientToWorld(ev.clientX, ev.clientY);
      connectState.previewEl.setAttribute('x2', ww.x);
      connectState.previewEl.setAttribute('y2', ww.y);
      var tgt = nodeAtPoint(ww.x, ww.y);
      if (tgt === connectState.src) tgt = null;
      if (connectState.dropTarget !== tgt) {
        if (connectState.dropTarget) connectState.dropTarget.el.classList.remove('drop-target');
        connectState.dropTarget = tgt;
        if (tgt) tgt.el.classList.add('drop-target');
      }
    }
  });

  window.addEventListener('mouseup', function () {
    if (marqueeState) {
      var mx = parseFloat(marqueeEl.getAttribute('x'));
      var my = parseFloat(marqueeEl.getAttribute('y'));
      var mWid = parseFloat(marqueeEl.getAttribute('width'));
      var mHei = parseFloat(marqueeEl.getAttribute('height'));
      var additive = marqueeState.additive;
      var moved = marqueeState.moved;
      cancelMarquee();

      if (!moved) {
        // Click on empty canvas (no drag) → clear selection unless additive
        if (!additive) clearSelection();
        suppressNextClick = true;
        return;
      }

      // Collect all nodes + areas whose bbox intersects the marquee rect.
      var hits = [];
      nodes.forEach(function (n) {
        var nx = n.x0 + n.offsetX;
        var ny = n.y0 + n.offsetY;
        if (rectsIntersect(nx, ny, n.w, n.h, mx, my, mWid, mHei)) hits.push(n);
      });
      areas.forEach(function (g) {
        if (rectsIntersect(g.x, g.y, g.w, g.h, mx, my, mWid, mHei)) hits.push(g);
      });

      if (!additive) clearSelection();
      if (hits.length === 0) { suppressNextClick = true; return; }

      if (hits.length === 1 && !additive && multiSel.length === 0) {
        // Single hit + not additive → behave like a click on that one item
        var only = hits[0];
        if (isPage(only)) selectPage(only);
        else if (isArea(only)) selectArea(only);
      } else {
        // ≥2 hits, or additive marquee → multi-select
        hits.forEach(function (item) {
          if (multiSel.indexOf(item) < 0) toggleMultiSel(item);
        });
        if (multiSel.length >= 2) showAlignPanel();
        else if (multiSel.length === 1) {
          var lone = multiSel[0];
          if (isPage(lone)) selectPage(lone);
          else if (isArea(lone)) selectArea(lone);
        }
      }
      suppressNextClick = true;
      return;
    }

    if (edgeEndpointDragState) {
      if (edgeEndpointDragState.node) edgeEndpointDragState.node.el.classList.remove('showing-anchors');
      edgeEndpointDragState = null;
      suppressNextClick = true;
    }
    if (edgeDragState) {
      if (!edgeDragState.moved) {
        selectEdge(edgeDragState.edge);
      }
      edgeDragState = null;
      suppressNextClick = true;
    }
    if (panState) {
      var wasClick = !((Math.abs((window.event && window.event.clientX || 0) - panState.startClientX) +
                        Math.abs((window.event && window.event.clientY || 0) - panState.startClientY)) > 2);
      // We can't reliably read motion from window.event; instead, infer from vp transform delta vs. start.
      var movedDist = Math.abs(vpTx - panState.startTx) + Math.abs(vpTy - panState.startTy);
      svg.classList.remove('panning');
      panState = null;
      if (editMode && movedDist < 0.5) {
        // It was a click on empty canvas in edit mode — clear selection
        clearSelection();
      }
    }
    if (nodeDragState) {
      if (nodeDragState.moved) {
        nodeDragState.node.el.classList.remove('dragging');
        suppressNextClick = true; // swallow the click that fires after this mouseup
      } else if (editMode) {
        if (nodeDragState.shiftKey) {
          // Shift+click → toggle this page in multi-selection
          toggleMultiSel(nodeDragState.node);
          if (multiSel.length >= 2) showAlignPanel();
          else if (multiSel.length === 1) selectPage(multiSel[0]);
          else { clearSelection(); }
        } else {
          var grp = findGroupOf(nodeDragState.node);
          if (grp) {
            // Plain click on a grouped page → select the whole group as multiSel.
            clearSelection();
            groupMembers(grp).forEach(function (m) {
              if (multiSel.indexOf(m) < 0) toggleMultiSel(m);
            });
            if (multiSel.length >= 2) showAlignPanel();
            else if (multiSel.length === 1) selectPage(multiSel[0]);
          } else {
            // Plain click → single-select via the page editor
            clearMultiSel();
            openPageEditor(nodeDragState.node);
          }
        }
        suppressNextClick = true;
      }
      nodeDragState = null;
      clearSmartGuides();
    }
    if (connectState) {
      var t = connectState.dropTarget;
      if (t && t !== connectState.src) {
        addEdge(connectState.src.id, t.id, {
          sourceSide: connectState.srcSide,
          sourceIdx:  connectState.srcIdx
        });
      }
      if (connectState.dropTarget) connectState.dropTarget.el.classList.remove('drop-target');
      connectState.previewEl.remove();
      svg.classList.remove('connecting');
      connectState = null;
      // Connect always swallows the post-mouseup click on the underlying node
      suppressNextClick = true;
    }
    if (areaResizeState) {
      areaResizeState = null;
      suppressNextClick = true;
    }
    if (areaDragState) {
      var g = areaDragState.area;
      g.rectEl.classList.remove('dragging');
      if (!areaDragState.moved) {
        if (areaDragState.shiftKey) {
          toggleMultiSel(g);
          if (multiSel.length >= 2) showAlignPanel();
          else if (multiSel.length === 1) selectArea(multiSel[0]);
          else clearSelection();
        } else {
          var areaGrp = findGroupOf(g);
          if (areaGrp) {
            // Plain click on a grouped area → select the whole group as multiSel.
            clearSelection();
            groupMembers(areaGrp).forEach(function (m) {
              if (multiSel.indexOf(m) < 0) toggleMultiSel(m);
            });
            if (multiSel.length >= 2) showAlignPanel();
            else if (multiSel.length === 1) selectArea(multiSel[0]);
          } else {
            // It was a click on the area rect — open the editor (the original behavior).
            clearMultiSel();
            openAreaEditor(g);
          }
        }
      }
      // else: it was a true drag; do not open editor.
      areaDragState = null;
      clearSmartGuides();
    }
  });

  function nodeAtPoint(x, y) {
    var hit = null;
    nodes.forEach(function (n) {
      var x1 = n.x0 + n.offsetX, y1 = n.y0 + n.offsetY;
      if (x >= x1 && x <= x1 + n.w && y >= y1 && y <= y1 + n.h) hit = n;
    });
    return hit;
  }

  // opts.sourceSide / opts.sourceIdx — if provided, the edge starts pinned
  // to that side of the source page (so a connection drawn from the top
  // handle exits from the top from frame 1). Without it, the router picks
  // the best side based on relative position.
  function addEdge(srcId, tgtId, opts) {
    if (edges.some(function (e) { return e.sourceId === srcId && e.targetId === tgtId; })) return;
    var pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('class', 'gedge');
    pathEl.setAttribute('stroke-width', '2');
    pathEl.setAttribute('marker-end', 'url(#arr-page)');
    var firstNode = vp.querySelector('.gnode');
    if (firstNode) vp.insertBefore(pathEl, firstNode);
    else vp.appendChild(pathEl);
    var seedSp = null;
    if (opts && (opts.sourceSide === 'top' || opts.sourceSide === 'right' ||
                 opts.sourceSide === 'bottom' || opts.sourceSide === 'left')) {
      seedSp = { side: opts.sourceSide, idx: (opts.sourceIdx != null ? opts.sourceIdx : ((opts.sourceSide === 'top' || opts.sourceSide === 'bottom') ? 2 : 1)) };
    }
    var e = {
      pathEl: pathEl, labelBgEl: null, labelTextEl: null,
      sourceId: srcId, targetId: tgtId,
      manualMid: null, manualSp: seedSp, manualTp: null,
      lineColor: 'gray', lineStyle: 'solid', lineWidth: 'normal'
    };
    edges.push(e);
    applyLineColor(e, 'gray');
    applyLineWidth(e, 'normal');
    renderEdge(e); // creates hit-paths
  }

  // ----- Areas (zone backgrounds) — parse existing + create/rename/recolor/delete
  var GROUP_COLORS = {
    neutral: { swatch: '#D6DEE9' },
    page:    { swatch: '#0C6C68' },
    case:    { swatch: '#5E3DB3' },
    flow:    { swatch: '#9B3570' },
    env:     { swatch: '#0A6644' },
    suite:   { swatch: '#8A5A0E' },
    sel:     { swatch: '#1756BA' },
    warn:    { swatch: '#C9820E' },
    info:    { swatch: '#1766DC' }
  };
  var areas = [];
  var areaSeed = 0;

  // ----- Logical groups
  // Each group links a set of pages/areas so they move and select as a
  // single unit. There is no visual rect — Areas are still a separate
  // feature. Members are referenced by id; a member can belong to at
  // most one group at a time.
  var groups = [];
  var groupSeed = 0;
  function findPageOrAreaById(id) {
    if (id == null) return null;
    var p = nodes.get(id);
    if (p) return p;
    for (var i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i];
    return null;
  }
  function findGroupOf(item) {
    if (!item || !item.id) return null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].memberIds.indexOf(item.id) >= 0) return groups[i];
    }
    return null;
  }
  function groupMembers(grp) {
    if (!grp) return [];
    var out = [];
    grp.memberIds.forEach(function (mid) {
      var ref = findPageOrAreaById(mid);
      if (ref) out.push(ref);
    });
    return out;
  }
  function removeGroup(grp) {
    if (!grp) return;
    var idx = groups.indexOf(grp);
    if (idx >= 0) groups.splice(idx, 1);
  }
  // Drop an id from every group it appears in; if a group is left with
  // fewer than 2 members, dissolve it (a 1-member group is meaningless).
  function pruneFromGroups(id) {
    if (id == null || !groups.length) return;
    for (var i = groups.length - 1; i >= 0; i--) {
      var g = groups[i];
      var idx = g.memberIds.indexOf(id);
      if (idx >= 0) g.memberIds.splice(idx, 1);
      if (g.memberIds.length < 2) groups.splice(i, 1);
    }
  }

  // ----- Group the current multi-selection.
  // Combines every selected page/area (and the existing groupmates of
  // any selected member) into one new group, replacing any pre-existing
  // groups those members belonged to. Requires ≥ 2 effective members.
  // Returns the new group, or null if there isn't enough to group.
  function groupSelected() {
    if (!multiSel || multiSel.length < 2) return null;
    var seen = {};
    var members = [];
    function addMember(it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      members.push(it);
    }
    multiSel.forEach(function (it) {
      addMember(it);
      var g = findGroupOf(it);
      if (g) groupMembers(g).forEach(addMember);
    });
    if (members.length < 2) return null;
    // Drop every pre-existing group that any of these members touched —
    // they're all being folded into the new group.
    var oldGroups = {};
    members.forEach(function (m) {
      var g = findGroupOf(m);
      if (g) oldGroups[g.id] = g;
    });
    Object.keys(oldGroups).forEach(function (id) { removeGroup(oldGroups[id]); });
    var newG = {
      id: 'group-' + (++groupSeed),
      memberIds: members.map(function (m) { return m.id; })
    };
    groups.push(newG);
    return newG;
  }
  window.__graphGroupSelected = groupSelected;

  // ----- Ungroup any groups touched by the current selection.
  // Removes every group that contains either `selected` or any item in
  // `multiSel`. Members themselves are left in place. Returns the number
  // of groups removed.
  function ungroupSelected() {
    var touched = {};
    function check(it) {
      var g = findGroupOf(it);
      if (g) touched[g.id] = g;
    }
    if (selected && selected.ref) check(selected.ref);
    if (multiSel && multiSel.length > 0) multiSel.forEach(check);
    var keys = Object.keys(touched);
    keys.forEach(function (id) { removeGroup(touched[id]); });
    return keys.length;
  }
  window.__graphUngroupSelected = ungroupSelected;

  // True if any item in the current selection (single or multi) is a
  // member of a group. Used by the context menu to enable/disable
  // "Ungroup".
  function isSelectionGrouped() {
    if (selected && selected.ref && findGroupOf(selected.ref)) return true;
    if (multiSel && multiSel.length > 0) {
      for (var i = 0; i < multiSel.length; i++) {
        if (findGroupOf(multiSel[i])) return true;
      }
    }
    return false;
  }
  window.__graphIsSelectionGrouped = isSelectionGrouped;

  vp.querySelectorAll('rect.gzone').forEach(function (rect) {
    var sib = rect.nextElementSibling;
    var label = null;
    while (sib) {
      if (sib.classList && sib.classList.contains('gzone-label')) { label = sib; break; }
      if (sib.classList && (sib.classList.contains('gzone') || sib.classList.contains('gedge') || sib.classList.contains('gnode'))) break;
      sib = sib.nextElementSibling;
    }
    var id = 'area-' + (++areaSeed);
    rect.setAttribute('data-area-id', id);
    if (label) label.setAttribute('data-area-id', id);

    var color = 'neutral';
    var styleAttr = (rect.getAttribute('style') || '').toLowerCase();
    if (styleAttr.indexOf('--warn') >= 0) color = 'warn';
    if (color !== 'neutral') {
      rect.removeAttribute('style');
      rect.classList.add('color-' + color);
      if (label) {
        label.removeAttribute('style');
        label.classList.add('color-' + color);
      }
    }

    var parsedName = label ? (label.textContent || '').trim() : 'Untitled';
    // Slug: trust an existing data-slug if present, otherwise slugify the
    // display name. Mirrored back onto the rect so import/export round-trips.
    var areaSlug = (rect.getAttribute('data-slug') || '').trim()
                   || (typeof slugify === 'function' ? slugify(parsedName) : parsedName.toLowerCase())
                   || id;
    rect.setAttribute('data-slug', areaSlug);

    areas.push({
      id: id, rectEl: rect, labelEl: label,
      x: parseFloat(rect.getAttribute('x')),
      y: parseFloat(rect.getAttribute('y')),
      w: parseFloat(rect.getAttribute('width')),
      h: parseFloat(rect.getAttribute('height')),
      name: parsedName,
      slug: areaSlug,
      color: color,
      locked: false,
      titlePos: 'top-left'
    });
  });

  function findAreaById(id) {
    for (var i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i];
    return null;
  }

  function applyAreaColor(g, key) {
    if (!GROUP_COLORS[key]) key = 'neutral';
    Object.keys(GROUP_COLORS).forEach(function (k) {
      g.rectEl.classList.remove('color-' + k);
      if (g.labelEl) g.labelEl.classList.remove('color-' + k);
    });
    if (key !== 'neutral') {
      g.rectEl.classList.add('color-' + key);
      if (g.labelEl) g.labelEl.classList.add('color-' + key);
    }
    g.color = key;
  }

  function setAreaName(g, name) {
    g.name = name;
    var txt = (name || '').toUpperCase();
    if (g.labelEl) {
      g.labelEl.textContent = txt;
    } else {
      var lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('class', 'gzone-label' + (g.color !== 'neutral' ? ' color-' + g.color : ''));
      lbl.setAttribute('data-area-id', g.id);
      lbl.textContent = txt;
      g.rectEl.parentNode.insertBefore(lbl, g.rectEl.nextSibling);
      g.labelEl = lbl;
    }
    positionAreaLabel(g);
  }

  // ----- Area geometry (nesting + no partial overlap)
  // Two areas are always in one of three relationships: disjoint, one fully
  // contains the other (nesting), or partially overlapping. The third state
  // is disallowed — areaSelection, createArea, drag, and resize all enforce
  // it. Parent/child is implicit: an area's parent is the smallest area
  // whose rect fully contains it. Children render on top of parents thanks
  // to restackAreas().
  function _rectOf(g) { return { x: g.x, y: g.y, w: g.w, h: g.h }; }
  function rectContains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
           inner.x + inner.w <= outer.x + outer.w &&
           inner.y + inner.h <= outer.y + outer.h;
  }
  // Note: a separate 8-arg rectsIntersect() already exists higher up for
  // marquee hit-testing; this 2-arg, rect-object variant is internal to the
  // area-nesting code and uses a distinct name to avoid shadowing.
  function rectsIntersectR(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w &&
           a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function rectsPartiallyOverlap(a, b) {
    return rectsIntersectR(a, b) && !rectContains(a, b) && !rectContains(b, a);
  }
  // Areas currently fully contained in g (transitive — any descendant of g
  // is also contained in g's rect, so a single pass over `areas` works).
  function getAreaDescendants(g) {
    if (!g) return [];
    var gr = _rectOf(g);
    var out = [];
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (a === g) continue;
      if (rectContains(gr, _rectOf(a))) out.push(a);
    }
    return out;
  }
  // Pages currently sitting fully inside g's rect (in world coords). Used so
  // dragging an area takes its member pages along — implements the "Page
  // belongs to at most one Area" relationship without requiring an explicit
  // membership field. A page is a member iff its bbox is fully inside g.
  function pageRect(n) {
    return { x: n.x0 + n.offsetX, y: n.y0 + n.offsetY, w: n.w, h: n.h };
  }
  function getPagesInArea(g) {
    if (!g) return [];
    var gr = _rectOf(g);
    var out = [];
    nodes.forEach(function (n) {
      if (rectContains(gr, pageRect(n))) out.push(n);
    });
    return out;
  }
  // Does a proposed rect for area g create any partial overlap? Areas
  // listed in `skip` (a {id: true} map) are excluded — typically the
  // descendants that are translating along with g.
  function areaRectHasOverlap(g, rect, skip) {
    skip = skip || {};
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (a === g || skip[a.id]) continue;
      if (rectsPartiallyOverlap(rect, _rectOf(a))) return true;
    }
    return false;
  }
  // Re-stack areas so larger rects sit lower in the DOM and any rect
  // contained in another renders on top of its container. Each area's
  // <rect> and <text> label stay paired. All zone elements stay before the
  // first non-zone child (.gnode / .gedge layers).
  function restackAreas() {
    if (!areas.length) return;
    var sorted = areas.slice().sort(function (a, b) {
      return (b.w * b.h) - (a.w * a.h);
    });
    var firstNonZone = null;
    var ch = vp.children;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      if (c.classList && (c.classList.contains('gzone') || c.classList.contains('gzone-label'))) continue;
      firstNonZone = c; break;
    }
    sorted.forEach(function (g) {
      if (g.rectEl) {
        if (firstNonZone) vp.insertBefore(g.rectEl, firstNonZone);
        else vp.appendChild(g.rectEl);
      }
      if (g.labelEl) {
        if (firstNonZone) vp.insertBefore(g.labelEl, firstNonZone);
        else vp.appendChild(g.labelEl);
      }
    });
  }

  // ----- Smart guides (dynamic alignment lines during drag)
  // Show a dashed magenta line whenever the dragged item's left/center/right
  // (or top/middle/bottom) edge lines up with the corresponding line on
  // another page or area. Threshold is measured in screen pixels so the
  // snap "feels" the same at every zoom — converted to world units by
  // dividing by vpScale.
  var SMART_SNAP_PX = 5;
  var smartGuideElX = null, smartGuideElY = null;
  function ensureSmartGuides() {
    if (!smartGuideElX) {
      smartGuideElX = document.createElementNS(SVG_NS, 'line');
      smartGuideElX.setAttribute('class', 'smart-guide');
      smartGuideElX.setAttribute('visibility', 'hidden');
    }
    if (!smartGuideElY) {
      smartGuideElY = document.createElementNS(SVG_NS, 'line');
      smartGuideElY.setAttribute('class', 'smart-guide');
      smartGuideElY.setAttribute('visibility', 'hidden');
    }
    // Always (re-)append so the guides paint on top of any element that
    // was added/restacked since the last drag (e.g. restackAreas calls).
    vp.appendChild(smartGuideElX);
    vp.appendChild(smartGuideElY);
  }
  function clearSmartGuides() {
    if (smartGuideElX) smartGuideElX.setAttribute('visibility', 'hidden');
    if (smartGuideElY) smartGuideElY.setAttribute('visibility', 'hidden');
  }

  // World-space rects of every page and area that could be a snap target,
  // minus anything in `excludeSet` (the moving set).
  function getSnapTargetRects(excludeSet) {
    var out = [];
    nodes.forEach(function (n) {
      if (excludeSet && excludeSet[n.id]) return;
      out.push({ x: n.x0 + n.offsetX, y: n.y0 + n.offsetY, w: n.w, h: n.h });
    });
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (excludeSet && excludeSet[a.id]) continue;
      out.push({ x: a.x, y: a.y, w: a.w, h: a.h });
    }
    return out;
  }

  // Given the dragged item's original rect and the proposed delta (dx, dy),
  // find the closest single-axis snap on each axis. Each axis searches every
  // combination of {left,center,right} × every target's {left,center,right}
  // (and similarly vertical). Returns snapped deltas plus the descriptor of
  // the winning snap on each axis (or null if no snap fired).
  function computeSnap(originRect, dx, dy, targets) {
    var THR = SMART_SNAP_PX / (vpScale || 1);
    var sx0 = [originRect.x, originRect.x + originRect.w / 2, originRect.x + originRect.w];
    var sy0 = [originRect.y, originRect.y + originRect.h / 2, originRect.y + originRect.h];
    var bestX = null, bestY = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var tx = [t.x, t.x + t.w / 2, t.x + t.w];
      var ty = [t.y, t.y + t.h / 2, t.y + t.h];
      for (var a = 0; a < 3; a++) {
        for (var b = 0; b < 3; b++) {
          var dxSnap = tx[b] - sx0[a];
          var diffX = Math.abs(dxSnap - dx);
          if (diffX <= THR && (!bestX || diffX < bestX.diff)) {
            bestX = { diff: diffX, delta: dxSnap, lineX: tx[b], target: t };
          }
          var dySnap = ty[b] - sy0[a];
          var diffY = Math.abs(dySnap - dy);
          if (diffY <= THR && (!bestY || diffY < bestY.diff)) {
            bestY = { diff: diffY, delta: dySnap, lineY: ty[b], target: t };
          }
        }
      }
    }
    return {
      dx: bestX ? bestX.delta : dx,
      dy: bestY ? bestY.delta : dy,
      guideX: bestX, guideY: bestY
    };
  }

  // Position the two guide lines so each spans from the moving rect to the
  // target rect along the shared edge, with a small extension on either
  // side so the line "reaches past" both items.
  function showSmartGuides(snap, movedRect) {
    ensureSmartGuides();
    var PAD = 8;
    if (snap.guideX) {
      var gx = snap.guideX.lineX;
      var t = snap.guideX.target;
      var y1 = Math.min(movedRect.y, t.y) - PAD;
      var y2 = Math.max(movedRect.y + movedRect.h, t.y + t.h) + PAD;
      smartGuideElX.setAttribute('x1', gx);
      smartGuideElX.setAttribute('x2', gx);
      smartGuideElX.setAttribute('y1', y1);
      smartGuideElX.setAttribute('y2', y2);
      smartGuideElX.removeAttribute('visibility');
    } else if (smartGuideElX) {
      smartGuideElX.setAttribute('visibility', 'hidden');
    }
    if (snap.guideY) {
      var gy = snap.guideY.lineY;
      var t2 = snap.guideY.target;
      var x1 = Math.min(movedRect.x, t2.x) - PAD;
      var x2 = Math.max(movedRect.x + movedRect.w, t2.x + t2.w) + PAD;
      smartGuideElY.setAttribute('y1', gy);
      smartGuideElY.setAttribute('y2', gy);
      smartGuideElY.setAttribute('x1', x1);
      smartGuideElY.setAttribute('x2', x2);
      smartGuideElY.removeAttribute('visibility');
    } else if (smartGuideElY) {
      smartGuideElY.setAttribute('visibility', 'hidden');
    }
  }

  // Resize clamp.
  //   - Enforce min width/height.
  //   - Block any resize that would expose a current descendant (the new
  //     rect must still fully contain every nested area).
  //   - Block any resize that would partially overlap a non-descendant area.
  // On block, the area sticks at its current rect — the user can release
  // and retry. This is intentionally simple; obstacle-aware edge clamping
  // can be layered on later if needed.
  function clampAreaResize(g, dir, nx, ny, nw, nh) {
    var MIN_W = 80, MIN_H = 60;
    if (nw < MIN_W) {
      if (dir.indexOf('w') >= 0) nx = nx + nw - MIN_W;
      nw = MIN_W;
    }
    if (nh < MIN_H) {
      if (dir.indexOf('n') >= 0) ny = ny + nh - MIN_H;
      nh = MIN_H;
    }
    var candidate = { x: nx, y: ny, w: nw, h: nh };
    var descendants = getAreaDescendants(g);
    var skip = {};
    for (var i = 0; i < descendants.length; i++) {
      var d = descendants[i];
      skip[d.id] = true;
      // Each existing descendant must remain inside the new rect.
      if (!rectContains(candidate, _rectOf(d))) {
        return { x: g.x, y: g.y, w: g.w, h: g.h };
      }
    }
    if (areaRectHasOverlap(g, candidate, skip)) {
      return { x: g.x, y: g.y, w: g.w, h: g.h };
    }
    return candidate;
  }

  // ----- Area the current multi-selection.
  // Computes the bbox of every selected node/area, pads it, and creates a
  // new Area at exactly that bbox. Bound to Cmd/Ctrl+G.
  function areaSelection() {
    if (!multiSel || multiSel.length < 1) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    multiSel.forEach(function (it) {
      var ix, iy, iw, ih;
      if (isPage(it))       { ix = it.x0 + it.offsetX; iy = it.y0 + it.offsetY; iw = it.w; ih = it.h; }
      else if (isArea(it)) { ix = it.x; iy = it.y; iw = it.w; ih = it.h; }
      else return;
      if (ix < minX) minX = ix;
      if (iy < minY) minY = iy;
      if (ix + iw > maxX) maxX = ix + iw;
      if (iy + ih > maxY) maxY = iy + ih;
    });
    if (minX === Infinity) return null;
    var pad = 20;
    var gx = Math.round(minX - pad);
    var gy = Math.round(minY - pad);
    var gw = Math.round((maxX - minX) + 2 * pad);
    var gh = Math.round((maxY - minY) + 2 * pad);
    // Nested-area rule: the new bbox may not partially overlap an existing
    // area. Expand it until every overlapped neighbour is fully inside
    // (becomes a child) — repeat to a fixed point in case expansion brings
    // new neighbours into contact.
    (function expandToContainOverlaps() {
      var changed = true, guard = 0;
      while (changed && guard < 50) {
        changed = false; guard++;
        for (var i = 0; i < areas.length; i++) {
          var a = areas[i];
          var bbox = { x: gx, y: gy, w: gw, h: gh };
          if (rectsPartiallyOverlap(bbox, _rectOf(a))) {
            if (a.x < gx)             { gw += (gx - a.x);       gx = a.x;           changed = true; }
            if (a.y < gy)             { gh += (gy - a.y);       gy = a.y;           changed = true; }
            if (a.x + a.w > gx + gw)  { gw = a.x + a.w - gx;                        changed = true; }
            if (a.y + a.h > gy + gh)  { gh = a.y + a.h - gy;                        changed = true; }
          }
        }
      }
    })();

    var id = 'area-' + (++areaSeed);
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'gzone');
    rect.setAttribute('x', gx); rect.setAttribute('y', gy);
    rect.setAttribute('width', gw); rect.setAttribute('height', gh);
    rect.setAttribute('rx', 8);
    rect.setAttribute('data-area-id', id);
    // Insert behind all nodes (and any existing areas whose <text> label
    // sits before the first .gnode). The first .gnode is the boundary
    // between the "background zone" layer and the "content" layer.
    var firstNode = vp.querySelector('.gnode');
    if (firstNode) vp.insertBefore(rect, firstNode);
    else vp.appendChild(rect);

    var label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'gzone-label');
    label.setAttribute('x', gx + 14);
    label.setAttribute('y', gy + 22);
    label.setAttribute('data-area-id', id);
    label.textContent = 'NEW GROUP';
    rect.parentNode.insertBefore(label, rect.nextSibling);

    var newAreaSlug = (typeof slugify === 'function' ? slugify('New area') : 'new-area') || id;
    rect.setAttribute('data-slug', newAreaSlug);
    var g = {
      id: id, rectEl: rect, labelEl: label,
      x: gx, y: gy, w: gw, h: gh,
      name: 'New area',
      slug: newAreaSlug,
      color: 'neutral',
      locked: false,
      titlePos: 'top-left'
    };
    areas.push(g);
    if (typeof createHandles === 'function') createHandles(g);
    restackAreas();

    clearMultiSel();
    openAreaEditor(g);
    return g;
  }
  window.__graphAreaSelection = areaSelection;

  // ----- Dissolve: removes the currently selected area(s). The area's
  // SVG rect + label + resize handles are removed. Pages inside the bbox
  // are not affected.
  function dissolveSelected() {
    var targets = [];
    if (selected && selected.kind === 'area' && selected.ref) {
      targets.push(selected.ref);
    } else if (multiSel && multiSel.length > 0) {
      multiSel.forEach(function (it) { if (isArea(it)) targets.push(it); });
    }
    if (targets.length === 0) return 0;

    targets.forEach(function (g) {
      // Sweep every SVG element tagged with this area's id — that covers
      // rect.gzone, text.gzone-label, plus any resize/move handles that
      // were attached via createHandles().
      var sel = '[data-area-id="' + g.id + '"]';
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      // Defensive: drop direct refs we know about
      if (g.rectEl && g.rectEl.parentNode) g.rectEl.parentNode.removeChild(g.rectEl);
      if (g.labelEl && g.labelEl.parentNode) g.labelEl.parentNode.removeChild(g.labelEl);

      // Drop from the model
      var idx = areas.indexOf(g);
      if (idx >= 0) areas.splice(idx, 1);
    });

    clearSelection();
    return targets.length;
  }
  window.__graphDissolveSelected = dissolveSelected;

  function createArea(name, colorKey, parent) {
    var x, y, w, h;
    if (parent && typeof parent === 'object' && 'x' in parent && 'w' in parent) {
      // Sub-area path: size to fit centered inside `parent`, with inner
      // padding. The no-overlap rule then guarantees the result is a true
      // nested child of `parent`. If the parent is too small for the
      // default dimensions, the sub-area shrinks (clamped to MIN_W/MIN_H);
      // if it's still bigger than the parent's interior, we floor at the
      // minimum and accept that the child fills the parent.
      var PAD = 24, MIN_W = 80, MIN_H = 60;
      var innerW = Math.max(MIN_W, parent.w - 2 * PAD);
      var innerH = Math.max(MIN_H, parent.h - 2 * PAD);
      w = Math.min(innerW, Math.max(MIN_W, parent.w * 0.5));
      h = Math.min(innerH, Math.max(MIN_H, parent.h * 0.5));
      x = parent.x + (parent.w - w) / 2;
      y = parent.y + (parent.h - h) / 2;
    } else {
      var visW = vbW / vpScale;
      var visH = vbH / vpScale;
      var visX = -vpTx / vpScale;
      var visY = -vpTy / vpScale;
      w = Math.max(280, Math.min(600, visW * 0.5));
      h = Math.max(180, Math.min(360, visH * 0.5));
      // Start at the viewport center, then nudge diagonally if the default
      // placement would partially overlap an existing area. Nesting (the new
      // rect fully inside an existing one, or vice versa) is allowed.
      x = visX + visW / 2 - w / 2;
      y = visY + visH / 2 - h / 2;
      (function placeAvoidingPartialOverlap() {
        var STEP = 30, MAX_TRIES = 200, tries = 0;
        function clear(rx, ry) {
          var cand = { x: rx, y: ry, w: w, h: h };
          for (var i = 0; i < areas.length; i++) {
            if (rectsPartiallyOverlap(cand, _rectOf(areas[i]))) return false;
          }
          return true;
        }
        while (!clear(x, y) && tries < MAX_TRIES) {
          x += STEP; y += STEP; tries++;
        }
      })();
    }

    var id = 'area-' + (++areaSeed);
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'gzone');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', '8');
    rect.setAttribute('data-area-id', id);

    var label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'gzone-label');
    label.setAttribute('x', x + 14);
    label.setAttribute('y', y + 22);
    label.setAttribute('data-area-id', id);
    label.textContent = (name || 'New area').toUpperCase();

    var firstNonZone = null;
    var children = vp.children;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.classList && (c.classList.contains('gzone') || c.classList.contains('gzone-label'))) continue;
      firstNonZone = c; break;
    }
    if (firstNonZone) {
      vp.insertBefore(rect, firstNonZone);
      vp.insertBefore(label, firstNonZone);
    } else {
      vp.appendChild(rect);
      vp.appendChild(label);
    }

    var initialAreaName = name || 'New area';
    var initialAreaSlug = (typeof slugify === 'function' ? slugify(initialAreaName) : initialAreaName.toLowerCase()) || id;
    rect.setAttribute('data-slug', initialAreaSlug);
    var g = { id: id, rectEl: rect, labelEl: label, x: x, y: y, w: w, h: h, name: initialAreaName, slug: initialAreaSlug, color: 'neutral', locked: false };
    areas.push(g);
    if (colorKey && colorKey !== 'neutral') applyAreaColor(g, colorKey);
    createHandles(g);
    restackAreas();
    return g;
  }

  function deleteArea(g) {
    if (!g) return;
    pruneFromGroups(g.id);
    removeHandles(g);
    if (g.rectEl && g.rectEl.parentNode) g.rectEl.parentNode.removeChild(g.rectEl);
    if (g.labelEl && g.labelEl.parentNode) g.labelEl.parentNode.removeChild(g.labelEl);
    var idx = areas.indexOf(g);
    if (idx >= 0) areas.splice(idx, 1);
  }

  // Delete a page node + cascade-delete every edge that references it.
  // Edges store sourceId / targetId, so any orphaned edge gets removed too —
  // otherwise the SVG would keep stale lines pointing at empty space.
  function deletePage(n) {
    if (!n) return;
    pruneFromGroups(n.id);
    var orphans = [];
    edges.forEach(function (ed) {
      if (ed.sourceId === n.id || ed.targetId === n.id) orphans.push(ed);
    });
    orphans.forEach(deleteEdge);
    if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
    nodes.delete(n.id);
  }
  window.__graphDeletePage = deletePage;

  // Single entry point used by the Delete-key handler. Honors:
  //   - multi-selection (deletes every page/area in multiSel)
  //   - single selection of any kind (page / area / edge)
  // No-ops outside edit mode or with nothing selected. clearSelection() runs
  // first so the inspector panel doesn't keep pointing at a freed object.
  function deleteCurrent() {
    if (!editMode) return;
    if (multiSel && multiSel.length > 0) {
      var snap = multiSel.slice();
      clearSelection();
      // Delete pages first so their cascading edge-removal can't trip over
      // an area-delete that happens to remove a rect we're still iterating.
      snap.forEach(function (it) { if (isPage(it)) deletePage(it); });
      snap.forEach(function (it) { if (isArea(it)) deleteArea(it); });
      return;
    }
    if (!selected || !selected.kind || !selected.ref) return;
    var s = selected;
    clearSelection();
    if      (s.kind === 'page') deletePage(s.ref);
    else if (s.kind === 'area') deleteArea(s.ref);
    else if (s.kind === 'edge') deleteEdge(s.ref);
  }
  window.__graphDeleteCurrent = deleteCurrent;

  // Backward-compatible names; both editors now drive the right-side inspector panel.
  function openAreaEditor(g) { selectArea(g); }
  function closeAreaEditor() { if (selected.kind === 'area') clearSelection(); }

  function createHandles(g) {
    if (g.handles) return;
    g.handles = {};
    // 8 handles: 4 corners (nw/ne/sw/se) + 4 edge midpoints (n/s/e/w).
    // Corner handles resize on both axes; edge handles resize one axis only.
    // startAreaResize + clampAreaResize are already direction-agnostic (they
    // test dir.indexOf('n'|'s'|'e'|'w')), so single-letter dirs work as-is.
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (dir) {
      var hr = document.createElementNS(SVG_NS, 'circle');
      hr.setAttribute('class', 'resize-handle dir-' + dir);
      hr.setAttribute('r', 3);
      hr.setAttribute('data-area-id', g.id);
      hr.setAttribute('data-handle-dir', dir);
      vp.appendChild(hr);
      g.handles[dir] = hr;
    });
    positionHandles(g);
  }

  function positionHandles(g) {
    if (!g.handles) return;
    // Circles are positioned by their center, so no half-size offset is needed.
    var w = g.x, n = g.y, e = g.x + g.w, sBound = g.y + g.h;
    var midX = g.x + g.w / 2;
    var midY = g.y + g.h / 2;
    // Corners
    if (g.handles.nw) { g.handles.nw.setAttribute('cx', w);    g.handles.nw.setAttribute('cy', n); }
    if (g.handles.ne) { g.handles.ne.setAttribute('cx', e);    g.handles.ne.setAttribute('cy', n); }
    if (g.handles.sw) { g.handles.sw.setAttribute('cx', w);    g.handles.sw.setAttribute('cy', sBound); }
    if (g.handles.se) { g.handles.se.setAttribute('cx', e);    g.handles.se.setAttribute('cy', sBound); }
    // Edge midpoints
    if (g.handles.n)  { g.handles.n.setAttribute('cx',  midX); g.handles.n.setAttribute('cy',  n); }
    if (g.handles.s)  { g.handles.s.setAttribute('cx',  midX); g.handles.s.setAttribute('cy',  sBound); }
    if (g.handles.e)  { g.handles.e.setAttribute('cx',  e);    g.handles.e.setAttribute('cy',  midY); }
    if (g.handles.w)  { g.handles.w.setAttribute('cx',  w);    g.handles.w.setAttribute('cy',  midY); }
  }

  function removeHandles(g) {
    if (!g.handles) return;
    Object.keys(g.handles).forEach(function (dir) {
      var el = g.handles[dir];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    g.handles = null;
  }

  // Attach handles to every existing area, then re-stack so any area that
  // nests inside another renders on top.
  areas.forEach(createHandles);
  restackAreas();

  // Standardize page rect sizes — keep each page's center stable so the existing
  // layout barely shifts. All pages become 140x48 and gain implicit anchor points.
  (function standardizeNodeSizes() {
    var W = 140, H = 48;
    nodes.forEach(function (n) {
      var oldCx = n.x0 + n.w / 2;
      var oldCy = n.y0 + n.h / 2;
      var newX0 = oldCx - W / 2;
      var newY0 = oldCy - H / 2;
      n.x0 = newX0; n.y0 = newY0; n.w = W; n.h = H;
      n.rectEl.setAttribute('x', newX0);
      n.rectEl.setAttribute('y', newY0);
      n.rectEl.setAttribute('width', W);
      n.rectEl.setAttribute('height', H);

      var newCx = newX0 + W / 2;
      var newCy = newY0 + H / 2;

      // Reposition title (first <text>) and sub (second <text>); drop the third+ for
      // visual fit. Reset any inline font-size so they share a uniform appearance.
      // Exclude .depth-badge-text — the depth-level badge is an intentional extra label.
      var texts = Array.prototype.slice.call(n.el.querySelectorAll('text'))
        .filter(function (t) { return !t.classList.contains('depth-badge-text'); });
      for (var i = 2; i < texts.length; i++) {
        if (texts[i].parentNode) texts[i].parentNode.removeChild(texts[i]);
      }
      if (texts[0]) {
        texts[0].setAttribute('x', newCx);
        texts[0].setAttribute('y', newCy - 3);
        var s = texts[0].getAttribute('style') || '';
        s = s.replace(/font-size:\s*[^;]+;?\s*/g, '');
        if (s.trim()) texts[0].setAttribute('style', s);
        else texts[0].removeAttribute('style');
      }
      if (texts[1]) {
        texts[1].setAttribute('x', newCx);
        texts[1].setAttribute('y', newCy + 10);
      }

      // Reposition all 4 connect handles (top/right/bottom/left) for the new rect.
      positionConnectHandles(n.el, newX0, newY0, W, H);

      // Anchor dots: 5 top + 5 bottom + 3 left + 3 right = 16 per page
      addAnchorDots(n);
    });
  })();

  function addAnchorDots(n) {
    var existing = n.el.querySelectorAll('.anchor-dot');
    for (var i = 0; i < existing.length; i++) existing[i].remove();
    var anchors = computeAnchorList(n);
    anchors.forEach(function (a) {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('class', 'anchor-dot');
      c.setAttribute('cx', a.x);
      c.setAttribute('cy', a.y);
      c.setAttribute('r', 2.5);
      n.el.appendChild(c);
    });
  }

  function computeAnchorList(n) {
    var x = n.x0 + n.offsetX, y = n.y0 + n.offsetY, w = n.w, h = n.h;
    var out = [];
    for (var i = 1; i <= 5; i++) {
      out.push({ side: 'top',    idx: i - 1, x: x + i * w / 6, y: y });
      out.push({ side: 'bottom', idx: i - 1, x: x + i * w / 6, y: y + h });
    }
    for (var i = 1; i <= 3; i++) {
      out.push({ side: 'left',  idx: i - 1, x: x,     y: y + i * h / 4 });
      out.push({ side: 'right', idx: i - 1, x: x + w, y: y + i * h / 4 });
    }
    return out;
  }
  function anchorOnSide(n, side, idx) {
    var x = n.x0 + n.offsetX, y = n.y0 + n.offsetY, w = n.w, h = n.h;
    if (side === 'top')    return { x: x + (idx + 1) * w / 6, y: y,     side: side, idx: idx };
    if (side === 'bottom') return { x: x + (idx + 1) * w / 6, y: y + h, side: side, idx: idx };
    if (side === 'left')   return { x: x,     y: y + (idx + 1) * h / 4, side: side, idx: idx };
    if (side === 'right')  return { x: x + w, y: y + (idx + 1) * h / 4, side: side, idx: idx };
  }
  function nearestAnchorOn(n, px, py) {
    var anchors = computeAnchorList(n);
    var best = anchors[0], bestD = Infinity;
    anchors.forEach(function (a) {
      var dx = a.x - px, dy = a.y - py;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = a; }
    });
    return best;
  }

  // ----- Page color variants + page editor popover -----
  var NODE_COLORS = {
    page:  { swatch: '#0C6C68', cls: 'color-page'  },
    case:  { swatch: '#5E3DB3', cls: 'color-case'  },
    flow:  { swatch: '#9B3570', cls: 'color-flow'  },
    env:   { swatch: '#0A6644', cls: 'color-env'   },
    suite: { swatch: '#8A5A0E', cls: 'color-suite' },
    sel:   { swatch: '#1756BA', cls: 'color-sel'   },
    warn:  { swatch: '#C9820E', cls: 'color-warn'  },
    info:  { swatch: '#1766DC', cls: 'color-info'  }
  };

  function applyNodeColor(n, key) {
    Object.keys(NODE_COLORS).forEach(function (k) {
      n.el.classList.remove(NODE_COLORS[k].cls);
    });
    if (NODE_COLORS[key]) n.el.classList.add(NODE_COLORS[key].cls);
    n.color = key || 'default';
  }

  // Border-style variants. `cls` is the class that goes on the .gnode.
  var NODE_BORDERS = {
    solid:  { cls: 'border-solid'  },
    dashed: { cls: 'border-dashed' },
    dotted: { cls: 'border-dotted' },
    none:   { cls: 'border-none'   }
  };
  function applyNodeBorder(n, key) {
    if (!NODE_BORDERS[key]) key = 'solid';
    Object.keys(NODE_BORDERS).forEach(function (k) {
      n.el.classList.remove(NODE_BORDERS[k].cls);
    });
    n.el.classList.add(NODE_BORDERS[key].cls);
    n.border = key;
  }
  window.__graphApplyNodeBorder = applyNodeBorder;

  // ----- Lock feature for Page / Area -----
  function applyNodeLocked(n, locked) {
    n.locked = !!locked;
    n.el.classList.toggle('locked', n.locked);
    if (n.locked) ensureLockBadge(n.el, n.x0 + n.w - 14, n.y0 + 3);
    else removeLockBadge(n.el);
  }
  function applyAreaLocked(g, locked) {
    g.locked = !!locked;
    g.rectEl.classList.toggle('locked', g.locked);
    if (g.labelEl) g.labelEl.classList.toggle('locked', g.locked);
    if (g.locked) {
      var lx = g.x + g.w - 16, ly = g.y + 5;
      ensureAreaLockBadge(g, lx, ly);
      // Hide resize handles by removing them; recreated when unlocked
      if (g.handles) {
        Object.keys(g.handles).forEach(function (k) {
          var h = g.handles[k];
          if (h) h.style.display = 'none';
        });
      }
    } else {
      removeAreaLockBadge(g);
      if (g.handles) {
        Object.keys(g.handles).forEach(function (k) {
          var h = g.handles[k];
          if (h) h.style.display = '';
        });
      }
    }
  }
  function ensureLockBadge(parentEl, cx, cy) {
    var existing = parentEl.querySelector(':scope > .lock-badge');
    if (existing) {
      existing.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
      return;
    }
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'lock-badge');
    g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', 0); rect.setAttribute('y', 0);
    rect.setAttribute('width', 11); rect.setAttribute('height', 9);
    rect.setAttribute('rx', 1.5);
    g.appendChild(rect);
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M3 4 V2.5 A2.5 2.5 0 0 1 8 2.5 V4');
    g.appendChild(path);
    parentEl.appendChild(g);
  }
  function removeLockBadge(parentEl) {
    var existing = parentEl.querySelector(':scope > .lock-badge');
    if (existing) existing.remove();
  }
  function ensureAreaLockBadge(g, cx, cy) {
    if (!g._lockBadge) {
      var grp = document.createElementNS(SVG_NS, 'g');
      grp.setAttribute('class', 'lock-badge');
      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', 13); rect.setAttribute('height', 11);
      rect.setAttribute('rx', 2);
      grp.appendChild(rect);
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M3.5 5 V3 A3 3 0 0 1 9.5 3 V5');
      grp.appendChild(path);
      vp.appendChild(grp);
      g._lockBadge = grp;
    }
    g._lockBadge.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
  }
  function removeAreaLockBadge(g) {
    if (g._lockBadge && g._lockBadge.parentNode) {
      g._lockBadge.parentNode.removeChild(g._lockBadge);
      g._lockBadge = null;
    }
  }

  window.__graphApplyNodeLocked  = applyNodeLocked;
  window.__graphApplyAreaLocked = applyAreaLocked;

  // ----- Selection-scoped lock helpers (used by the right-click ctx-menu).
  // The ctx-menu lives in HTML and has no access to the IIFE's `selected` /
  // `multiSel` state, so it goes through these two exports.
  //
  // getSelectionLockState() returns one of:
  //   'none'     — nothing selected
  //   'locked'   — every selected item is locked
  //   'unlocked' — every selected item is unlocked
  //   'mixed'    — some locked, some not (treat as unlocked: next Lock locks all)
  function getSelectionLockState() {
    var items = [];
    if (multiSel && multiSel.length > 0) {
      items = multiSel.slice();
    } else if (selected && selected.kind && selected.ref &&
               (selected.kind === 'page' || selected.kind === 'area')) {
      items = [selected.ref];
    }
    if (items.length === 0) return 'none';
    var anyLocked = false, anyUnlocked = false;
    items.forEach(function (it) {
      if (it.locked) anyLocked = true; else anyUnlocked = true;
    });
    if (anyLocked && !anyUnlocked) return 'locked';
    if (anyUnlocked && !anyLocked) return 'unlocked';
    return 'mixed';
  }

  function setSelectionLocked(locked) {
    var items = [];
    if (multiSel && multiSel.length > 0) {
      items = multiSel.slice();
    } else if (selected && selected.kind && selected.ref &&
               (selected.kind === 'page' || selected.kind === 'area')) {
      items = [selected.ref];
    }
    items.forEach(function (it) {
      if (isPage(it))      applyNodeLocked(it, locked);
      else if (isArea(it)) applyAreaLocked(it, locked);
    });
    // Keep inspector UI in sync if it's currently showing the selected item.
    if (selected && selected.ref && items.indexOf(selected.ref) >= 0) {
      if (selected.kind === 'page' && typeof syncPageLockUI === 'function') syncPageLockUI(selected.ref);
      if (selected.kind === 'area' && typeof syncAreaLockUI === 'function') syncAreaLockUI(selected.ref);
    }
  }
  window.__graphGetSelectionLockState = getSelectionLockState;
  window.__graphSetSelectionLocked    = setSelectionLocked;

  // Called from wire.js's contextmenu handler so right-clicking an item
  // selects it before the menu opens — that way Lock/Unlock (and the other
  // context-menu actions) operate on whatever the user right-clicked, even
  // if nothing was selected beforehand. If the cursor's target is already
  // part of the current selection (single or multi), the selection is left
  // alone so a multi-select Lock isn't accidentally collapsed to one item.
  function selectAtPoint(clientX, clientY) {
    var w = clientToWorld(clientX, clientY);
    var hitPage = nodeAtPoint(w.x, w.y);
    if (hitPage) {
      if (selected && selected.kind === 'page' && selected.ref === hitPage) return true;
      if (multiSel && multiSel.indexOf(hitPage) >= 0) return true;
      clearMultiSel();
      selectPage(hitPage);
      return true;
    }
    // Areas: smallest containing rect wins, matching how the resize-handle
    // hover-detection picks the innermost area under the cursor.
    var hitArea = null, bestSize = Infinity;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (w.x < a.x || w.x > a.x + a.w || w.y < a.y || w.y > a.y + a.h) continue;
      var sz = a.w * a.h;
      if (sz < bestSize) { hitArea = a; bestSize = sz; }
    }
    if (hitArea) {
      if (selected && selected.kind === 'area' && selected.ref === hitArea) return true;
      if (multiSel && multiSel.indexOf(hitArea) >= 0) return true;
      clearMultiSel();
      selectArea(hitArea);
      return true;
    }
    return false; // empty canvas — leave current selection as is
  }
  window.__graphSelectAtPoint = selectAtPoint;

  function setNodeName(n, name) {
    n.name = name;
    var ts = n.el.querySelectorAll('text');
    // First <text> is the title; subsequent texts are .sub lines — leave those alone.
    if (ts.length >= 1) ts[0].textContent = name;
  }

  function openPageEditor(n) { selectPage(n); }
  function closePageEditor() { if (selected.kind === 'page') clearSelection(); }

  // ----- Inspector panel: selection model + populate + listeners
  var selected = { kind: null, ref: null };

  function showEmptyPanel() {
    var em = document.getElementById('rp-empty');
    var pg = document.getElementById('rp-page');
    var gr = document.getElementById('rp-area');
    var ln = document.getElementById('rp-line');
    var al = document.getElementById('rp-align');
    if (em) em.hidden = false;
    if (pg) pg.hidden = true;
    if (gr) gr.hidden = true;
    if (ln) ln.hidden = true;
    if (al) al.hidden = true;
  }

  function showPagePanel(n) {
    var em = document.getElementById('rp-empty');
    var pg = document.getElementById('rp-page');
    var gr = document.getElementById('rp-area');
    var ln = document.getElementById('rp-line');
    var al = document.getElementById('rp-align');
    if (em) em.hidden = true;
    if (gr) gr.hidden = true;
    if (ln) ln.hidden = true;
    if (al) al.hidden = true;
    if (pg) pg.hidden = false;

    var ts = n.el.querySelectorAll('text');
    var currentName = ts.length >= 1 ? (ts[0].textContent || '') : '';
    var nameEl = document.getElementById('rp-page-name');
    var titleEl = document.getElementById('rp-page-title');
    if (nameEl) nameEl.value = currentName;
    if (titleEl) titleEl.textContent = currentName || '—';
    var slugEl = document.getElementById('rp-page-slug');
    if (slugEl) slugEl.value = n.slug || '';

    var swEl = document.getElementById('rp-page-swatches');
    if (swEl) {
      swEl.innerHTML = '';
      Object.keys(NODE_COLORS).forEach(function (key) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rp-swatch' + (key === n.color ? ' active' : '');
        b.style.background = NODE_COLORS[key].swatch;
        b.title = key;
        b.setAttribute('data-color-key', key);
        b.addEventListener('click', function () {
          applyNodeColor(n, key);
          Array.prototype.forEach.call(swEl.children, function (c) { c.classList.remove('active'); });
          b.classList.add('active');
        });
        swEl.appendChild(b);
      });
    }

    var bdEl = document.getElementById('rp-page-borders');
    if (bdEl) {
      bdEl.innerHTML = '';
      Object.keys(NODE_BORDERS).forEach(function (key) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rp-border-btn style-' + key + ((key === (n.border || 'solid')) ? ' active' : '');
        b.title = key;
        b.setAttribute('data-border-key', key);
        b.addEventListener('click', function () {
          applyNodeBorder(n, key);
          Array.prototype.forEach.call(bdEl.children, function (c) { c.classList.remove('active'); });
          b.classList.add('active');
        });
        bdEl.appendChild(b);
      });
    }
    if (typeof syncPageLockUI === 'function') syncPageLockUI(n);
  }

  function showAreaPanel(g) {
    var em = document.getElementById('rp-empty');
    var pg = document.getElementById('rp-page');
    var gr = document.getElementById('rp-area');
    var ln = document.getElementById('rp-line');
    var al = document.getElementById('rp-align');
    if (em) em.hidden = true;
    if (pg) pg.hidden = true;
    if (ln) ln.hidden = true;
    if (al) al.hidden = true;
    if (gr) gr.hidden = false;

    var nameEl  = document.getElementById('rp-area-name');
    var titleEl = document.getElementById('rp-area-title');
    if (nameEl)  nameEl.value = g.name || '';
    if (titleEl) titleEl.textContent = g.name || '—';
    var slugEl = document.getElementById('rp-area-slug');
    if (slugEl) slugEl.value = g.slug || '';

    var swEl = document.getElementById('rp-area-swatches');
    if (swEl) {
      swEl.innerHTML = '';
      Object.keys(GROUP_COLORS).forEach(function (key) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rp-swatch' + (key === g.color ? ' active' : '');
        b.style.background = GROUP_COLORS[key].swatch;
        b.title = key;
        b.setAttribute('data-color-key', key);
        b.addEventListener('click', function () {
          applyAreaColor(g, key);
          Array.prototype.forEach.call(swEl.children, function (c) { c.classList.remove('active'); });
          b.classList.add('active');
        });
        swEl.appendChild(b);
      });
    }
    // ----- Title-position picker — sync the active button -----
    var tpWrap = document.getElementById('rp-area-titlepos');
    if (tpWrap) {
      Array.prototype.forEach.call(tpWrap.querySelectorAll('button[data-tp]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-tp') === (g.titlePos || 'top-left'));
        if (!b.__wired) {
          b.__wired = true;
          b.addEventListener('click', function () {
            var pos = b.getAttribute('data-tp');
            setAreaTitlePos(g, pos);
            Array.prototype.forEach.call(tpWrap.querySelectorAll('button[data-tp]'), function (x) { x.classList.remove('active'); });
            b.classList.add('active');
          });
        }
      });
    }

    if (typeof syncAreaLockUI === 'function') syncAreaLockUI(g);
  }

  function selectPage(n) {
    if (!editMode) setEditMode(true);
    if (selected.kind === 'page'  && selected.ref) selected.ref.el.classList.remove('selected');
    if (selected.kind === 'area' && selected.ref) selected.ref.rectEl.classList.remove('selected');
    selected = { kind: 'page', ref: n };
    n.el.classList.add('selected');
    showPagePanel(n);
  }
  function selectArea(g) {
    if (!editMode) setEditMode(true);
    if (selected.kind === 'page'  && selected.ref) selected.ref.el.classList.remove('selected');
    if (selected.kind === 'area' && selected.ref) selected.ref.rectEl.classList.remove('selected');
    selected = { kind: 'area', ref: g };
    g.rectEl.classList.add('selected');
    showAreaPanel(g);
  }
  // ----- Multi-select alignment -----
  var multiSel = [];

  function isPage(item) { return item && item.el && item.rectEl && item.rectEl.tagName && item.rectEl.tagName.toLowerCase() === 'rect' && item.el.classList && item.el.classList.contains('gnode'); }
  function isArea(item) { return item && item.rectEl && item.rectEl.classList && item.rectEl.classList.contains('gzone'); }

  function clearMultiSel() {
    multiSel.forEach(function (it) {
      if (isPage(it)) it.el.classList.remove('selected');
      else if (isArea(it)) it.rectEl.classList.remove('selected');
    });
    multiSel = [];
  }

  function toggleMultiSel(item) {
    var idx = multiSel.indexOf(item);
    if (idx >= 0) {
      multiSel.splice(idx, 1);
      if (isPage(item)) item.el.classList.remove('selected');
      else if (isArea(item)) item.rectEl.classList.remove('selected');
    } else {
      multiSel.push(item);
      if (isPage(item)) item.el.classList.add('selected');
      else if (isArea(item)) item.rectEl.classList.add('selected');
    }
  }

  function showAlignPanel() {
    var em = document.getElementById('rp-empty');
    var pg = document.getElementById('rp-page');
    var gr = document.getElementById('rp-area');
    var ln = document.getElementById('rp-line');
    var al = document.getElementById('rp-align');
    if (em) em.hidden = true;
    if (pg) pg.hidden = true;
    if (gr) gr.hidden = true;
    if (ln) ln.hidden = true;
    if (al) al.hidden = false;
    var lbl = document.getElementById('rp-align-count');
    if (lbl) lbl.textContent = multiSel.length + ' selected';
  }

  function applyAlign(kind) {
    if (multiSel.length < 2) return;
    var items = multiSel.map(function (it) {
      if (isPage(it))  return { ref: it, kind: 'page',  x: it.x0 + it.offsetX, y: it.y0 + it.offsetY, w: it.w, h: it.h };
      if (isArea(it)) return { ref: it, kind: 'area', x: it.x,                y: it.y,                w: it.w, h: it.h };
      return null;
    }).filter(Boolean);
    if (items.length < 2) return;

    var minX = Infinity, maxR = -Infinity, minY = Infinity, maxB = -Infinity;
    items.forEach(function (i) {
      if (i.x < minX) minX = i.x;
      if (i.x + i.w > maxR) maxR = i.x + i.w;
      if (i.y < minY) minY = i.y;
      if (i.y + i.h > maxB) maxB = i.y + i.h;
    });
    var cx = (minX + maxR) / 2, cy = (minY + maxB) / 2;

    if (kind === 'dist-h' || kind === 'dist-v') {
      if (items.length < 3) return;
      var axis = kind === 'dist-h' ? 'x' : 'y';
      var size = axis === 'x' ? 'w' : 'h';
      items.sort(function (a, b) { return (a[axis] + a[size] / 2) - (b[axis] + b[size] / 2); });
      var first = items[0], last = items[items.length - 1];
      var firstC = first[axis] + first[size] / 2;
      var lastC  = last[axis]  + last[size]  / 2;
      var step = (lastC - firstC) / (items.length - 1);
      items.forEach(function (it, i) {
        if (i === 0 || i === items.length - 1) return;
        var targetC = firstC + step * i;
        if (axis === 'x') it.x = targetC - it.w / 2;
        else it.y = targetC - it.h / 2;
      });
    } else {
      items.forEach(function (it) {
        if      (kind === 'left')     it.x = minX;
        else if (kind === 'right')    it.x = maxR - it.w;
        else if (kind === 'center-h') it.x = cx - it.w / 2;
        else if (kind === 'top')      it.y = minY;
        else if (kind === 'bottom')   it.y = maxB - it.h;
        else if (kind === 'middle')   it.y = cy - it.h / 2;
      });
    }

    // Apply the computed positions back to the model + DOM
    items.forEach(function (it) {
      if (it.kind === 'page') {
        it.ref.offsetX = it.x - it.ref.x0;
        it.ref.offsetY = it.y - it.ref.y0;
        renderNode(it.ref);
        renderEdgesForNode(it.ref.id);
      } else if (it.kind === 'area') {
        moveAreaTo(it.ref, it.x, it.y);
      }
    });
  }
  window.__graphApplyAlign = applyAlign;

  function clearSelection() {
    if (selected.kind === 'page'  && selected.ref) selected.ref.el.classList.remove('selected');
    if (selected.kind === 'area' && selected.ref) selected.ref.rectEl.classList.remove('selected');
    if (selected.kind === 'edge'  && selected.ref) {
      selected.ref.pathEl.classList.remove('selected');
      hideEndpointHandles(selected.ref);
    }
    selected = { kind: null, ref: null };
    clearMultiSel();
    showEmptyPanel();
  }

  function selectEdge(e) {
    if (!editMode) setEditMode(true);
    clearSelection();
    selected = { kind: 'edge', ref: e };
    e.pathEl.classList.add('selected');
    showEndpointHandles(e);
    showLinePanel(e);
  }

  function showLinePanel(e) {
    var em = document.getElementById('rp-empty');
    var pg = document.getElementById('rp-page');
    var gr = document.getElementById('rp-area');
    var ln = document.getElementById('rp-line');
    var al = document.getElementById('rp-align');
    if (em) em.hidden = true;
    if (pg) pg.hidden = true;
    if (gr) gr.hidden = true;
    if (al) al.hidden = true;
    if (ln) ln.hidden = false;

    var titleEl = document.getElementById('rp-line-title');
    if (titleEl) {
      var sNode = nodes.get(e.sourceId);
      var tNode = nodes.get(e.targetId);
      var sName = sNode && sNode.el.querySelector('text') ? sNode.el.querySelector('text').textContent : e.sourceId;
      var tName = tNode && tNode.el.querySelector('text') ? tNode.el.querySelector('text').textContent : e.targetId;
      titleEl.textContent = sName + ' → ' + tName;
    }

    var textInput = document.getElementById('rp-line-text');
    if (textInput) {
      textInput.value = e.labelTextEl ? (e.labelTextEl.textContent || '') : '';
    }

    function fillButtons(containerId, options, current, kind, applyFn, classPrefix) {
      var el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '';
      Object.keys(options).forEach(function (key) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-key', key);
        b.title = key;
        if (kind === 'swatch') {
          b.className = 'rp-swatch' + (key === current ? ' active' : '');
          b.style.background = options[key].swatch;
        } else if (kind === 'border') {
          b.className = 'rp-border-btn style-' + key + (key === current ? ' active' : '');
        } else if (kind === 'width') {
          b.className = 'rp-width-btn w-' + key + (key === current ? ' active' : '');
          var inner = document.createElement('span');
          inner.className = 'sample';
          b.appendChild(inner);
        }
        b.addEventListener('click', function () {
          applyFn(e, key);
          Array.prototype.forEach.call(el.children, function (c) { c.classList.remove('active'); });
          b.classList.add('active');
        });
        el.appendChild(b);
      });
    }

    fillButtons('rp-line-swatches', LINE_COLORS, e.lineColor || 'page',   'swatch', applyLineColor);
    fillButtons('rp-line-styles',   LINE_STYLES, e.lineStyle || 'solid',  'border', applyLineStyle);
    fillButtons('rp-line-widths',   LINE_WIDTHS, e.lineWidth || 'normal', 'width',  applyLineWidth);
  }

  // Wire lock toggle for Page panel (once)
  (function wirePageLock() {
    var btn = document.getElementById('rp-page-lock');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (selected.kind !== 'page' || !selected.ref) return;
      var n = selected.ref;
      applyNodeLocked(n, !n.locked);
      syncPageLockUI(n);
    });
  })();

  // Wire lock toggle for Area panel (once)
  (function wireAreaLock() {
    var btn = document.getElementById('rp-area-lock');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (selected.kind !== 'area' || !selected.ref) return;
      var g = selected.ref;
      applyAreaLocked(g, !g.locked);
      syncAreaLockUI(g);
    });
  })();

  function syncPageLockUI(n) {
    var btn = document.getElementById('rp-page-lock');
    var lbl = document.getElementById('rp-page-lock-label');
    var sec = document.getElementById('rp-page');
    if (btn) btn.classList.toggle('active', !!n.locked);
    if (lbl) lbl.textContent = n.locked ? 'Locked' : 'Unlocked';
    if (sec) sec.classList.toggle('locked', !!n.locked);
  }
  function syncAreaLockUI(g) {
    var btn = document.getElementById('rp-area-lock');
    var lbl = document.getElementById('rp-area-lock-label');
    var sec = document.getElementById('rp-area');
    if (btn) btn.classList.toggle('active', !!g.locked);
    if (lbl) lbl.textContent = g.locked ? 'Locked' : 'Unlocked';
    if (sec) sec.classList.toggle('locked', !!g.locked);
  }

  // Wire delete-line button once
  (function wireLineDelete() {
    var btn = document.getElementById('rp-line-delete');
    if (btn) btn.addEventListener('click', function () {
      if (selected.kind === 'edge') {
        deleteEdge(selected.ref);
        clearSelection();
      }
    });
  })();

  // Wire alignment buttons (once)
  (function wireAlignButtons() {
    var sect = document.getElementById('rp-align');
    if (!sect) return;
    Array.prototype.forEach.call(sect.querySelectorAll('.rp-align-btn'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-align');
        applyAlign(kind);
        // refresh count label (positions might have changed underneath)
        var lbl = document.getElementById('rp-align-count');
        if (lbl) lbl.textContent = multiSel.length + ' selected';
      });
    });
  })();

  // Wire text input for line label
  (function wireLineText() {
    var input = document.getElementById('rp-line-text');
    if (!input) return;
    input.addEventListener('input', function () {
      if (selected.kind !== 'edge' || !selected.ref) return;
      setLineLabel(selected.ref, this.value);
    });
  })();

  // Wire panel inputs once — they read `selected.ref` so a single listener handles
  // both pages and areas depending on whichever section is currently visible.
  (function wirePanelInputs() {
    var pgName = document.getElementById('rp-page-name');
    if (pgName) pgName.addEventListener('input', function () {
      if (selected.kind === 'page') {
        setNodeName(selected.ref, this.value || 'Untitled');
        var t = document.getElementById('rp-page-title');
        if (t) t.textContent = this.value || '—';
      }
    });
    var pgSlug = document.getElementById('rp-page-slug');
    if (pgSlug) pgSlug.addEventListener('input', function () {
      if (selected.kind !== 'page' || !selected.ref) return;
      var v = this.value || '';
      selected.ref.slug = v;
      if (selected.ref.el) selected.ref.el.setAttribute('data-slug', v);
    });
    var grName = document.getElementById('rp-area-name');
    if (grName) grName.addEventListener('input', function () {
      if (selected.kind === 'area') {
        setAreaName(selected.ref, this.value || 'Untitled');
        var t = document.getElementById('rp-area-title');
        if (t) t.textContent = this.value || '—';
      }
    });
    var grSlug = document.getElementById('rp-area-slug');
    if (grSlug) grSlug.addEventListener('input', function () {
      if (selected.kind !== 'area' || !selected.ref) return;
      var v = this.value || '';
      selected.ref.slug = v;
      if (selected.ref.rectEl) selected.ref.rectEl.setAttribute('data-slug', v);
    });
    var del = document.getElementById('rp-area-delete');
    if (del) del.addEventListener('click', function () {
      if (selected.kind === 'area') {
        deleteArea(selected.ref);
        clearSelection();
      }
    });
  })();

  showEmptyPanel();

  // Expose page-editor API
  window.__graphApplyNodeColor = applyNodeColor;
  window.__graphSetNodeName    = setNodeName;
  window.__graphOpenPageEditor = openPageEditor;

  window.__graphCreateArea     = createArea;
  window.__graphSetAreaName    = setAreaName;
  window.__graphApplyAreaColor = applyAreaColor;
  window.__graphDeleteArea     = deleteArea;
  window.__graphFindArea       = findAreaById;
  window.__graphOpenAreaEditor = openAreaEditor;

  // ----- Wheel zoom (centered on cursor)
  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var v = clientToViewBox(ev.clientX, ev.clientY);
    var factor = ev.deltaY < 0 ? 1.12 : (1 / 1.12);
    zoomBy(factor, v.x, v.y);
  }, { passive: false });

  // ----- Buttons
  var zin = document.getElementById('zc-in');
  var zout = document.getElementById('zc-out');
  var zfit = document.getElementById('zc-fit');
  var zedit = document.getElementById('zc-edit');
  if (zin) zin.addEventListener('click', function () { zoomBy(1.2); });
  if (zout) zout.addEventListener('click', function () { zoomBy(1 / 1.2); });
  if (zfit) zfit.addEventListener('click', fitToView);
  if (zedit) zedit.addEventListener('click', function () { setEditMode(!editMode); });

  // Pointer-tool toolbar wiring — buttons set currentTool, sync the seg
  // active state, and slide the pill via positionSegPill().
  var bottomBar = document.getElementById('bottomToolbar');
  if (bottomBar) {
    Array.prototype.forEach.call(bottomBar.querySelectorAll('button[data-tool]'), function (b) {
      b.addEventListener('click', function () {
        setTool(b.getAttribute('data-tool'));
        var seg = b.closest('.seg');
        if (seg) {
          seg.querySelectorAll(':scope > button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          positionSegPill(seg);
        }
      });
    });
    // App-mode buttons (View / Edit / AI)
    Array.prototype.forEach.call(bottomBar.querySelectorAll('button[data-mode]'), function (b) {
      b.addEventListener('click', function () { setAppMode(b.getAttribute('data-mode')); });
    });
  }

  // ---- Sliding-pill animation for every .seg in the toolbar ----
  function positionSegPill(seg) {
    if (!seg) return;
    var pill = seg.querySelector(':scope > .seg-pill');
    var active = seg.querySelector(':scope > button.active');
    if (!pill || !active) return;
    var segRect = seg.getBoundingClientRect();
    var btnRect = active.getBoundingClientRect();
    // Pill sits at seg padding-box-left + translateX(N); buttons start at
    // seg.left + paddingLeft, which is already what btn.left - seg.left gives.
    var x = btnRect.left - segRect.left;
    var w = btnRect.width;
    pill.style.width = w + 'px';
    pill.style.transform = 'translateX(' + x + 'px)';
    seg.style.setProperty('--seg-tx', 'translateX(' + x + 'px)');
  }
  function initSegPill(seg) {
    var pill = seg.querySelector(':scope > .seg-pill');
    if (!pill) return;
    // Position without animating on first paint
    var prev = pill.style.transition;
    pill.style.transition = 'none';
    positionSegPill(seg);
    void pill.offsetWidth;
    pill.style.transition = prev || '';
    // Mousedown tactile squish on the pill
    seg.querySelectorAll(':scope > button').forEach(function (b) {
      b.addEventListener('mousedown', function () { seg.classList.add('pressing'); });
      b.addEventListener('mouseup',   function () { seg.classList.remove('pressing'); });
      b.addEventListener('mouseleave',function () { seg.classList.remove('pressing'); });
    });
  }
  document.querySelectorAll('.bottom-toolbar .seg').forEach(initSegPill);
  // Re-position pills on resize (toolbar is centered, button rects shift)
  window.addEventListener('resize', function () {
    document.querySelectorAll('.bottom-toolbar .seg').forEach(positionSegPill);
  });

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', function (e) {
    // Skip when a modal is open or input/textarea is focused
    if (document.querySelector('.scrim.open')) return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

    // Delete / Backspace → delete the current selection (edit mode only).
    if (editMode && (e.key === 'Delete' || e.key === 'Backspace')) {
      var hasSel = (selected && selected.kind && selected.ref) ||
                   (multiSel && multiSel.length > 0);
      if (hasSel) {
        deleteCurrent();
        e.preventDefault();
        return;
      }
    }

    // ⌘K / Ctrl+K → jump to AI mode
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      setAppMode('ai'); e.preventDefault(); return;
    }
    // ⌘G / Ctrl+G → wrap the current multi-selection in a new Area
    if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
      if (editMode && multiSel && multiSel.length > 0) {
        areaSelection();
        e.preventDefault();
        return;
      }
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // 1 / 2 / 3 → app modes
    if (e.key === '1') { setAppMode('view'); e.preventDefault(); return; }
    if (e.key === '2') { setAppMode('edit'); e.preventDefault(); return; }
    if (e.key === '3') { setAppMode('ai');   e.preventDefault(); return; }

    // Pointer toggle (always works)
    if (e.key === 'v' || e.key === 'V') {
      setTool('cursor');
      var seg = document.querySelector('.bottom-toolbar .seg.seg-pointer');
      if (seg) {
        seg.querySelectorAll(':scope > button').forEach(function (x) { x.classList.remove('active'); });
        var cur = document.getElementById('tool-cursor'); if (cur) cur.classList.add('active');
        positionSegPill(seg);
      }
      e.preventDefault(); return;
    }
    if (e.key === 'h' || e.key === 'H') {
      setTool('hand');
      var seg2 = document.querySelector('.bottom-toolbar .seg.seg-pointer');
      if (seg2) {
        seg2.querySelectorAll(':scope > button').forEach(function (x) { x.classList.remove('active'); });
        var h = document.getElementById('tool-hand'); if (h) h.classList.add('active');
        positionSegPill(seg2);
      }
      e.preventDefault(); return;
    }
    // C → toggle Pointer mode (flip between cursor and hand)
    if (e.key === 'c' || e.key === 'C') {
      var nextTool = (currentTool === 'cursor') ? 'hand' : 'cursor';
      setTool(nextTool);
      var seg3 = document.querySelector('.bottom-toolbar .seg.seg-pointer');
      if (seg3) {
        seg3.querySelectorAll(':scope > button').forEach(function (x) { x.classList.remove('active'); });
        var nextBtn = document.getElementById(nextTool === 'cursor' ? 'tool-cursor' : 'tool-hand');
        if (nextBtn) nextBtn.classList.add('active');
        positionSegPill(seg3);
      }
      e.preventDefault(); return;
    }

    // P / G → Add Page / Add Area (edit mode only)
    if (editMode) {
      if (e.key === 'p' || e.key === 'P') {
        if (typeof quickAddPage === 'function') quickAddPage();
        e.preventDefault(); return;
      }
      if (e.key === 'g' || e.key === 'G') {
        var gb = document.getElementById('newAreaBtn');
        if (gb && gb.getAttribute('aria-disabled') !== 'true') gb.click();
        e.preventDefault(); return;
      }
    }
  });

  var resetBtn = document.getElementById('resetViewBtn');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    nodes.forEach(function (n) { n.offsetX = 0; n.offsetY = 0; renderNode(n); });
    edges.forEach(renderEdge);
    fitToView();
  });

  var newAreaBtnEl = document.getElementById('newAreaBtn');
  if (newAreaBtnEl) newAreaBtnEl.addEventListener('click', function () {
    // If exactly one Area is currently selected, create the new Area as a
    // sub-Area inside it. This is the only ergonomic way to make a child
    // Area under the no-partial-overlap rule. Selection can come from
    // single-select (selected.kind === 'area') or a multi-selection that
    // happens to contain exactly one Area and no Pages.
    var parent = null;
    if (selected && selected.kind === 'area' && selected.ref) {
      parent = selected.ref;
    } else if (multiSel && multiSel.length > 0) {
      var areaPicks = multiSel.filter(function (it) { return typeof isArea === 'function' && isArea(it); });
      if (areaPicks.length === 1 && areaPicks.length === multiSel.length) {
        parent = areaPicks[0];
      }
    }
    var g = createArea('New area', 'neutral', parent);
    openAreaEditor(g);
  });

  // ESC behavior in edit mode:
  //   1. cancel an in-progress marquee drag, if any
  //   2. clear single OR multi-selection
  //   3. on a second press with nothing selected, exit edit mode
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openModal = document.querySelector('.scrim.open');
    if (openModal) return;
    if (currentAppMode === 'ai') { setAppMode('view'); e.preventDefault(); return; }
    if (typeof marqueeState !== 'undefined' && marqueeState) {
      if (typeof cancelMarquee === 'function') cancelMarquee();
      e.preventDefault(); return;
    }
    if (selected.kind || multiSel.length > 0) {
      clearSelection();
      e.preventDefault();
      return;
    }
    if (editMode) setEditMode(false);
  });

  // ----- Add a new page node into the workspace (called by quickAddPage()).
  function addPageNode(name, slug) {
    var nodeW = 140, nodeH = 48;
    var visW = vbW / vpScale;
    var visH = vbH / vpScale;
    var visX = -vpTx / vpScale;
    var visY = -vpTy / vpScale;
    var x = Math.round(visX + visW / 2 - nodeW / 2);
    var y = Math.round(visY + visH / 2 - nodeH / 2);

    var id = slug || ('node-' + Date.now().toString(36));
    var initialSlug = slug || (typeof slugify === 'function' ? slugify(name || '') : (name || '').toLowerCase()) || id;
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'gnode');
    g.setAttribute('data-id', id);
    g.setAttribute('data-slug', initialSlug);
    var rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', nodeW);
    rect.setAttribute('height', nodeH);
    rect.setAttribute('rx', 5);
    g.appendChild(rect);
    var label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', x + nodeW / 2);
    label.setAttribute('y', y + 21);
    label.textContent = name || 'New page';
    g.appendChild(label);
    var sub = document.createElementNS(SVG_NS, 'text');
    sub.setAttribute('class', 'sub');
    sub.setAttribute('x', x + nodeW / 2);
    sub.setAttribute('y', y + 34);
    sub.textContent = 'untouched';
    g.appendChild(sub);
    vp.appendChild(g);

    nodes.set(id, {
      id: id, el: g, rectEl: rect, labelEl: label, subEl: sub,
      x0: x, y0: y, w: nodeW, h: nodeH,
      offsetX: 0, offsetY: 0, locked: false,
      slug: initialSlug
    });
    addConnectHandles(g, id, x, y, nodeW, nodeH);
    try { if (typeof renderNode === 'function') renderNode(nodes.get(id)); } catch (err) {}
  }
  window.__graphAddPageNode = addPageNode;

  function init() {
    if (typeof renderAll === 'function') renderAll();
    if (typeof fitToView === 'function') fitToView();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

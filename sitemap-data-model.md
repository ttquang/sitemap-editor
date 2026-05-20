# Sitemap Editor — Data Model

This document describes the in-memory data model used by the PW Studio Sitemap
Editor, the SVG representation that backs it, and the enums/constants that
constrain the editable fields.

The editor is a single-page, IIFE-scoped app. All state lives inside
[sitemap-editor.js](sitemap-editor.js) and is mirrored onto the live SVG, which
serves as both the renderer *and* the persistence format (import/export
round-trips through SVG attributes and CSS class names).

---

## 1. Entity overview

The model contains five distinct entity kinds:

| Entity   | Storage                                | Role                                                         |
| -------- | -------------------------------------- | ------------------------------------------------------------ |
| Page     | `nodes` — `Map<id, Node>`              | A draggable, lockable rectangle that represents a page.      |
| Edge     | `edges` — `Array<Edge>`                | A directed connector between two pages, with optional label. |
| Area     | `areas` — `Array<Area>`                | A resizable zone that visually groups pages.                 |
| Group    | `groups` — `Array<Group>`              | A logical grouping of pages/areas (no visual rectangle).     |
| Selection| `selected`, `multiSel`                 | Current single + multi-selection cursor.                     |

> Pages and Edges are sometimes called **Nodes** and **Lines/Connections** in
> the UI and in the inspector copy. They refer to the same entities.

---

## 2. Page (Node)

A Page is a rectangular block on the canvas. It is the primary unit of the
sitemap.

### 2.1 In-memory shape

Defined when parsing `g.gnode` elements at [sitemap-editor.js:73](sitemap-editor.js:73).

```js
{
  id:       string,        // 'node-1', 'node-2', ... (or preserved from data-id)
  el:       SVGGElement,   // the <g class="gnode"> wrapper
  rectEl:   SVGRectElement,// the inner <rect>
  x0:       number,        // base x in SVG user units (left of the rect)
  y0:       number,        // base y in SVG user units (top  of the rect)
  w:        number,        // width
  h:        number,        // height
  offsetX:  number,        // live drag offset, applied via transform
  offsetY:  number,        // live drag offset, applied via transform
  color:    string,        // key in NODE_COLORS (see §6.1)
  border:   string,        // key in NODE_BORDERS (see §6.2)
  locked:   boolean,       // suppresses move/resize/delete when true
  slug:     string         // URL-safe identifier, mirrored to data-slug
}
```

### 2.2 SVG round-trip

Each Page is a `<g class="gnode color-{color} border-{border}">` containing:

- One `<rect x y width height>` — defines geometry.
- One or more `<text>` children — the display name.
- Four `<circle class="connect-handle" data-side="top|right|bottom|left">`
  handles, used to drag new edges out from the page.
- A `<g class="lock-badge">` when `locked === true`.

Persisted attributes:

| Attribute     | Source field    | Notes                                                       |
| ------------- | --------------- | ----------------------------------------------------------- |
| `data-id`     | `id`            | Auto-generated if missing on import.                        |
| `data-slug`   | `slug`          | Auto-derived from the visible text on import if missing.    |
| `class`       | `color`,`border`,`locked` | `color-*`, `border-*`, optional `locked`.         |

### 2.3 Anchors

For edge routing each page exposes anchor points along its four sides
(`anchorOnSide()` at [sitemap-editor.js:2407](sitemap-editor.js:2407)):

- **Top / Bottom** — 5 anchors per side, indexed `0..4` at `x = x0 + (idx + 1) * w / 6`.
- **Left / Right** — 3 anchors per side, indexed `0..2` at `y = y0 + (idx + 1) * h / 4`.

---

## 3. Edge (Line / Connection)

An Edge is a directed connector between two pages. It can carry a short text
label.

### 3.1 In-memory shape

Defined when parsing `path.gedge` elements at [sitemap-editor.js:245](sitemap-editor.js:245).

```js
{
  pathEl:      SVGPathElement,  // the visible <path class="gedge">
  labelBgEl:   SVGRectElement|null, // background pill behind the label text
  labelTextEl: SVGTextElement|null, // the <text class="gelabel">

  sourceId:    string,          // Node id where the edge starts
  targetId:    string,          // Node id where the edge ends

  manualMid:   null,            // reserved; no manual mid-routing yet
  manualSp:    { side, idx } | null, // pinned source anchor, see §2.3
  manualTp:    { side, idx } | null, // pinned target anchor, see §2.3

  lineColor:   string,          // key in LINE_COLORS  (see §6.3)
  lineStyle:   string,          // key in LINE_STYLES  (see §6.4)
  lineWidth:   string           // key in LINE_WIDTHS  (see §6.5)
}
```

`manualSp` / `manualTp` describe a fixed anchor on the source/target page; when
either is `null` the edge auto-picks the anchor closest to the opposite end
each time it re-routes.

### 3.2 SVG round-trip

```xml
<path class="gedge" d="M ... L ... L ..."
      stroke="var(--page-fg)"
      stroke-width="2"
      stroke-dasharray="5,3"
      marker-end="url(#arr-page)" />
<rect class="gelabel-bg" x y width height rx="3" />
<text class="gelabel"   x y text-anchor="middle">Label text</text>
```

On import the editor infers `lineColor`, `lineStyle`, and `lineWidth` from the
stroke attributes and CSS classes (`fragile`, etc.).

### 3.3 Routing

Edges are rendered with an orthogonal three-segment path
(`orthogonalRoute()` at [sitemap-editor.js:327](sitemap-editor.js:327)):
short perpendicular stubs at each end and a single bend in the middle. The
endpoints are placed at the chosen source/target anchors (auto or `manualSp` /
`manualTp`).

### 3.4 Lifecycle

- Created in `addLine(srcId, tgtId, opts)`.
- Removed via `__graphDeleteEdge(edge)`.
- Auto-removed when either endpoint Page is deleted (orphan pruning in
  `pruneFromGroups()` at [sitemap-editor.js:1654](sitemap-editor.js:1654)).

---

## 4. Area (Zone)

An Area is a labelled rectangle that visually contains pages. Areas do not
*own* pages structurally — overlap is purely spatial. Pages can be dragged in
and out of an Area at any time.

### 4.1 In-memory shape

Defined when parsing `rect.gzone` elements at [sitemap-editor.js:1614](sitemap-editor.js:1614).

```js
{
  id:        string,            // 'area-1', 'area-2', ...
  rectEl:    SVGRectElement,    // the <rect class="gzone">
  labelEl:   SVGTextElement|null, // the <text class="gzone-label">

  x:         number,            // top-left x
  y:         number,            // top-left y
  w:         number,            // width
  h:         number,            // height

  name:      string,            // display name (rendered uppercased)
  slug:      string,            // url-safe identifier, mirrored to data-slug
  color:     string,            // key in GROUP_COLORS (see §6.6)
  locked:    boolean,           // suppresses move/resize/delete when true
  titlePos:  string,            // one of the 6 positions (see §6.7)

  handles:   object             // resize handles, created on demand
}
```

### 4.2 SVG round-trip

```xml
<rect class="gzone color-page"
      data-area-id="area-1"
      data-slug="dashboard"
      x y width height />
<text class="gzone-label color-page"
      data-area-id="area-1"
      x y text-anchor="start">DASHBOARD</text>
```

Resize handles (`circle.resize-handle`) are inserted at runtime when the area
is selected (8 per area — corners + edge midpoints).

---

## 5. Group

A Group is a logical bundle of pages and/or areas that move and select
together. Groups have no DOM representation of their own.

### 5.1 In-memory shape

Defined at [sitemap-editor.js:1622](sitemap-editor.js:1622).

```js
{
  id:        string,        // 'group-1', 'group-2', ...
  memberIds: string[]       // ids of Pages and/or Areas in this group
}
```

### 5.2 Invariants

- A given page or area can be a member of at most one group at any time.
- Groups with fewer than two members are automatically dissolved
  (`pruneFromGroups()` at [sitemap-editor.js:1654](sitemap-editor.js:1654)).
- Creating a group bundles the current `multiSel`; dragging any member moves
  every member together.

---

## 6. Enumerations and constants

All enum keys are short string tokens. The same key is reused as the
in-memory value, the swatch lookup, and the CSS class suffix.

### 6.1 `NODE_COLORS` — Page fill colours

[sitemap-editor.js:2426](sitemap-editor.js:2426)

| Key    | Swatch    | CSS class      |
| ------ | --------- | -------------- |
| page   | `#0C6C68` | `color-page`   |
| case   | `#5E3DB3` | `color-case`   |
| flow   | `#9B3570` | `color-flow`   |
| env    | `#0A6644` | `color-env`    |
| suite  | `#8A5A0E` | `color-suite`  |
| sel    | `#1756BA` | `color-sel`    |
| warn   | `#C9820E` | `color-warn`   |
| info   | `#1766DC` | `color-info`   |

### 6.2 `NODE_BORDERS` — Page border styles

[sitemap-editor.js:2446](sitemap-editor.js:2446)

| Key    | CSS class        |
| ------ | ---------------- |
| solid  | `border-solid`   |
| dashed | `border-dashed`  |
| dotted | `border-dotted`  |
| none   | `border-none`    |

### 6.3 `LINE_COLORS` — Edge colours and arrowheads

[sitemap-editor.js:154](sitemap-editor.js:154)

| Key    | Swatch    | Stroke variable    | Arrow marker  |
| ------ | --------- | ------------------ | ------------- |
| gray   | `#6B7B8C` | `var(--ink-mid)`   | `arr-gray`    |
| page   | `#0C6C68` | `var(--page-fg)`   | `arr-page`    |
| accent | `#1766DC` | `var(--accent)`    | `arr-accent`  |
| warn   | `#C9820E` | `var(--warn)`      | `arr-fragile` |
| fail   | `#D83B3B` | `var(--fail)`      | `arr-fail`    |
| ok     | `#0E8A5F` | `var(--ok)`        | `arr-ok`      |

> The SVG also defines an `arr-sug` marker (suggested / cross-track edges).
> It is currently used only for static edges in imported SVGs; the inspector
> does not expose it as a selectable colour.

### 6.4 `LINE_STYLES` — Edge dash patterns

[sitemap-editor.js:162](sitemap-editor.js:162)

| Key    | `stroke-dasharray` |
| ------ | ------------------ |
| solid  | *(none)*           |
| dashed | `5,3`              |
| dotted | `1,3`              |

### 6.5 `LINE_WIDTHS` — Edge stroke widths

[sitemap-editor.js:167](sitemap-editor.js:167)

| Key    | `stroke-width` |
| ------ | -------------- |
| thin   | `1.5`          |
| normal | `2`            |
| thick  | `3.25`         |

### 6.6 `GROUP_COLORS` — Area background colours

[sitemap-editor.js:1603](sitemap-editor.js:1603)

| Key      | Swatch    |
| -------- | --------- |
| neutral  | `#D6DEE9` |
| page     | `#0C6C68` |
| case     | `#5E3DB3` |
| flow     | `#9B3570` |
| env      | `#0A6644` |
| suite    | `#8A5A0E` |
| sel      | `#1756BA` |
| warn     | `#C9820E` |
| info     | `#1766DC` |

### 6.7 Area title positions

Settable via `__graphSetAreaTitlePos`; rendered by `positionAreaLabel()`.

```
top-left   |  top-center   |  top-right
bottom-left|  bottom-center|  bottom-right
```

Default is `top-left`.

---

## 7. Selection model

### 7.1 Single selection

[sitemap-editor.js:2637](sitemap-editor.js:2637)

```js
selected = {
  kind: 'page' | 'area' | 'edge' | null,
  ref:  Node | Area | Edge       | null
}
```

The inspector panel on the right uses `kind` to decide which section to
reveal (`#rp-page`, `#rp-area`, `#rp-line`).

### 7.2 Multi-selection

[sitemap-editor.js:2790](sitemap-editor.js:2790)

```js
multiSel = Array<Node | Area>
```

Edges cannot participate in `multiSel`. Multi-selection drives the **Align**
inspector section, bulk lock/unlock, group/ungroup, and "Area selection"
(wrap the current selection in a new Area).

---

## 8. ID and slug conventions

| Entity | ID prefix | SVG attribute   | Auto-counter on import         |
| ------ | --------- | --------------- | ------------------------------ |
| Page   | `node-`   | `data-id`       | `nodeSeed` (see [sitemap-editor.js:73](sitemap-editor.js:73))   |
| Edge   | *(none — anonymous; identity is the `pathEl`)* | — | — |
| Area   | `area-`   | `data-area-id`  | `areaSeed` (see [sitemap-editor.js:1733](sitemap-editor.js:1733))|
| Group  | `group-`  | *(no DOM)*      | runtime counter                |

Slugs (`data-slug` on Pages and Areas) are kebab-case, lowercase, derived from
the display name when missing on import. They survive round-trips so callers
can stably reference an item across saves.

---

## 9. Relationships

```
                 ┌──────────────────────────────────────────┐
                 │                                          │
                 │              Group                       │
                 │   memberIds → Page.id | Area.id          │
                 │                                          │
                 └────────────┬─────────────┬───────────────┘
                              │ 0..*        │ 0..*
                              ▼             ▼
                ┌────────────────┐    ┌──────────────┐
                │      Page      │    │     Area     │
                │  id, slug      │    │  id, slug    │
                └───┬─────────┬──┘    └──────────────┘
       sourceId  ▲  │         │  ▲ targetId
                 │  │         │  │
                 │  │ 0..*    │  │ 0..*
                 │  ▼         ▼  │
              ┌──┴──────────────┴──┐
              │       Edge          │
              │  sourceId, targetId │
              └─────────────────────┘
```

- **Edges** reference Pages by `sourceId` and `targetId`.
  Edge → Page is a hard reference: deleting a Page deletes its edges.
- **Areas** do *not* contain Pages structurally. The relationship is purely
  positional (overlap). Wrapping a selection in an Area only positions/sizes
  the new Area to cover the selected items.
- **Groups** reference both Pages and Areas by id. Membership is exclusive
  (at most one group per item).

---

## 10. Persistence

The editor has no separate file format. The live `<svg class="graph">` *is*
the document:

- **Save / export** — read `svg.outerHTML`. Every field listed above is
  recoverable from class names and `data-*` attributes.
- **Load / import** — replace the SVG body; on next parse the IIFE rebuilds
  `nodes` / `edges` / `areas` from the DOM, auto-assigning IDs and slugs
  when absent. The import shim ([sitemap-editor.svg-shim.js](sitemap-editor.svg-shim.js))
  runs before the main script so a freshly-pasted SVG is parsed as the new
  model.

> The toolbar currently exposes Import / Export icon buttons
> (`#btnImportSVG` / `#btnExportSVG` in [sitemap-editor.html:109](sitemap-editor.html:109)),
> but no script wires them up at the moment — the wiring is expected to call
> `svg.outerHTML` for export and feed the imported text through the shim for
> import.

---

## 11. Public hooks (`window.__graph*`)

The editor exposes a small surface so the inspector, context menu, and outer
wiring can mutate the model without reaching into the IIFE:

| Hook | Purpose |
| ---- | ------- |
| `__graphSelectAtPoint(x, y)` | Hit-test and select at screen coords. |
| `__graphGetSelectionLockState()` | Returns `'locked' \| 'unlocked' \| 'mixed' \| 'none'`. |
| `__graphSetSelectionLocked(bool)` | Bulk lock/unlock the current selection. |
| `__graphAddPageNode(opts)` | Create a Page. |
| `__graphOpenPageEditor(node)` | Focus the Page inspector. |
| `__graphSetNodeName(node, name)` | Rename a Page (also updates slug). |
| `__graphApplyNodeColor(node, key)` | Change Page colour (see §6.1). |
| `__graphApplyNodeBorder(node, key)` | Change Page border (see §6.2). |
| `__graphApplyNodeLocked(node, bool)` | Lock/unlock a Page. |
| `__graphCreateArea(opts)` | Create an Area. |
| `__graphFindArea(id)` / `__graphOpenAreaEditor(area)` | Look up / inspect. |
| `__graphSetAreaName`, `__graphApplyAreaColor`, `__graphSetAreaTitlePos`, `__graphApplyAreaLocked`, `__graphDeleteArea` | Area mutators. |
| `__graphSetLineLabel`, `__graphApplyLineColor`, `__graphApplyLineStyle`, `__graphApplyLineWidth`, `__graphDeleteEdge` | Edge mutators. |
| `__graphGroupSelected`, `__graphUngroupSelected`, `__graphIsSelectionGrouped` | Group operations on `multiSel`. |
| `__graphApplyAlign(kind)` | Align/distribute `multiSel` (`left`, `center-h`, `right`, `top`, `middle`, `bottom`, `dist-h`, `dist-v`). |

These are the only sanctioned ways for outside code (e.g. [sitemap-editor.wire.js](sitemap-editor.wire.js))
to read or write the model.

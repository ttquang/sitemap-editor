# Sitemap Editor — Organization Guide

A practical guideline for organizing Areas and Pages in PW Studio sitemaps.
Complements [sitemap-data-model.md](sitemap-data-model.md), which defines the
underlying entity shapes. This document is about *how to use them well*.

The conventions here were derived while building real sitemaps (LBP loan
origination, loan origination reference, streamflix). They are recommendations,
not hard rules — but deviating without reason makes a sitemap harder to read.

---

## 1. Hierarchy levels

Pick the level on entry and stick to it across siblings. Mixing levels in the
same band reads as inconsistency.

| Level | Used for | Entity | Typical size |
| ----- | -------- | ------ | ------------ |
| L0 — Persona / Module | Top-level role or product band (e.g. "BU — Admin", "Document Maker") | Area | ~700×550 → full-width |
| L1 — Sub-module | Functional grouping within a persona (e.g. "Business Setup", "Parameter Maintenance") | Area | ~470×240 |
| L2 — Sub-sub-module | CRUD-style entity within a sub-module (e.g. "Department", "User Profile") | Area | ~160×220 |
| L3 — Page (leaf) | A single screen (e.g. "Listing - View", "Detail - Edit") | Page | 140×32 (compact) → 180×48 (prominent) |

Rules of thumb:
- A persona Area should never sit empty next to a fully-populated sibling at
  the same level. Either fill it in, collapse it to a smaller placeholder
  (see §6), or remove it.
- Don't nest more than 4 levels deep in one diagram. If you need 5, split into
  multiple sitemaps.
- An L2 sub-sub-Area with only one page inside is overkill — drop the wrapping
  Area and let the page live directly in L1.

---

## 2. Color conventions

Color carries semantic weight. Reuse the same key for the same role so readers
can scan by color.

### 2.1 Persona / module colors (Area `color`, GROUP_COLORS keys)

| Band | Color key | Use for |
| ---- | --------- | ------- |
| Admin / Configuration | `case` (purple) | BU Admin, System Admin, internal configuration personas |
| Business / Workflow | `flow` (magenta) | Author / Reviewer / Approver / Supporter — the deal-flow personas |
| Document / Operations | `suite` (gold) | Document Maker / Checker, ops-heavy personas |
| Customer-facing | `page` (teal) | End-customer portals, marketing surfaces |

### 2.2 Sub-area and sub-sub-area colors

Always **`neutral`** (gray). This makes nested containers read as subordinate
to their colored parent — hierarchy comes from nesting + neutral fill, not
from a rainbow of different colors.

### 2.3 Page colors (Page `color`, NODE_COLORS keys)

- **Workspace / persona-specific pages** — match the parent persona's color
  key (e.g. pages inside a `case` Admin Area also use `case`).
- **Shared entry pages** (Login, Logout, Forgot Password) — `sel` (blue),
  distinct from any persona so it's visually marked as system-wide.
- **CRUD leaf pages** (Listing, Detail, Edit, etc.) — inherit the persona
  color of their container.
- **Error / warning surfaces** — `warn` for soft errors, `fail`-themed only
  for true failure pages.

---

## 3. Sizing & spacing

### 3.1 Standard page sizes

| Size | w × h | Use for |
| ---- | ----- | ------- |
| Prominent | 180×48 | Persona workspace pages (Dashboard, To Do, etc.), shared entry pages |
| Standard | 140×44 | Most pages |
| Compact | 140×32 | CRUD leaves inside L2 sub-sub-Areas |

### 3.2 Standard area sizes

| Area level | w × h | Notes |
| ---------- | ----- | ----- |
| L0 persona placeholder (empty) | 270×200 | Slim band entry — use when persona hasn't been fleshed out yet |
| L0 persona fully detailed | up to 1760×720 | Can span almost full canvas when this is the focal persona |
| L1 sub-module (populated) | 550×280 | Holds 3 L2 sub-sub-Areas side by side |
| L1 sub-module (placeholder) | 550×280 | Keep the same size as populated siblings, even when empty |
| L2 sub-sub-module | 160×240 | Holds ~5 compact pages stacked vertically (size derived from §3.4 mins: 25 title + 8 gap + 5×32 pages + 4×8 gaps + 8 bottom = 233 → round to 240) |

### 3.3 Padding within an Area

| Element | Reserved space |
| ------- | -------------- |
| Title strip at top | 25–30 px |
| Inner content top gap (below title) | 5–10 px |
| Left / right margins | 15–20 px |
| Bottom margin | 15–20 px |

### 3.4 Minimum spacing (mandatory)

These are hard floors, not preferences. Anything tighter renders as visual
collision at the editor's default zoom levels, even when the geometry
mathematically fits.

| Relationship | Minimum gap |
| ------------ | ----------- |
| Page ↔ Page (siblings, any direction) | **8 px** |
| Area ↔ Area (siblings at same level, any direction) | **16 px** |
| Page → enclosing Area border (inside padding) | **8 px** on all sides |
| Child Area → parent Area border (inside padding) | **10 px** on left/right/bottom; top reserves the title strip (~25 px) |
| Area title strip → first child element below it | **8 px** below the title space |

If content can't satisfy these minimums, do one of (in order of preference):

1. **Grow the parent Area** — usually the right answer. Cascade siblings to
   match (per §3.6) and bump the viewport if needed (per §7).
2. **Shrink the child** to the next size class (e.g., 140×44 → 140×32 page),
   only if the smaller size is still readable.
3. **Split across more siblings** (e.g., 5 pages stacked into 2 columns × 3
   rows instead of 1 column × 5 rows).

Never solve a min-space violation by shaving margins or sneaking under the
floor — the result reads as broken even if the editor accepts it.

### 3.5 Recommended gaps (above the minimum)

Typical gap values that produce a balanced layout. All are at or above the
minimums in §3.4.

| Sibling level | Recommended gap |
| ------------- | --------------- |
| Pages in a row | **= page width** (see §3.5.1) |
| Pages stacked vertically | **= page height** (see §3.5.2) |
| L1 sub-modules in a grid | 30–35 px |
| L2 sub-sub-modules in a row | 16–25 px |
| L0 personas in a band | 25–30 px |

### 3.5.1 Page row spacing — gap equals page width

When two or more pages sit in the **same row**, the horizontal gap between
adjacent pages equals the page's width. With the standard 140-wide page the
gap is 140 (stride 280); with the prominent 180-wide page the gap is 180
(stride 360); with the compact 140-wide page the gap is still 140.

**Why:** Project preference — page-sized whitespace flanks each page,
leaves room for edge labels and connect handles, and produces a visually
balanced row regardless of how many pages it contains.

**How to apply:** Applies to any row of pages (2 or N). Vertical stacks
follow the matching §3.5.2 rule, not this one. When sizing the enclosing
Area, plan the content width as `(2N − 1) × w` (i.e. N pages plus N−1
page-width gaps) plus side padding (~30 px each side).

### 3.5.2 Page column spacing — gap equals page height

When two or more pages sit in the **same column** (stacked vertically inside
the same parent Area), the vertical gap between adjacent pages equals the
page's height. With the standard 48-tall page the gap is 48 (stride 96);
with the compact 32-tall page the gap is 32 (stride 64).

**Why:** Project preference — vertical counterpart to §3.5.1. Page-sized
whitespace above and below each page leaves room for edge labels on
vertical connectors and reads as visually balanced regardless of stack
depth.

**How to apply:** Applies to any column of pages (2 or N) inside one Area.
Pages aligned vertically across *different* Areas don't qualify — those
stay constrained by §3.4 area-padding floors, not this rule. When sizing
the enclosing Area, plan the content height as `(2N − 1) × h` (i.e. N
pages plus N−1 page-height gaps) plus the title strip (~25 px) and bottom
padding (~10 px).

### 3.6 Uniform sizing across siblings

When you resize one L1 sub-module to fit new content, **resize all L1 siblings
to match**, even the empty ones. The visual cost of an under-filled box is
much smaller than the visual cost of a ragged grid.

---

## 4. Naming conventions

### 4.1 IDs

Pattern: `<short-prefix>-<entity>[-<modifier>]`

| Level | ID prefix | Example |
| ----- | --------- | ------- |
| L0 Area | `area-<persona>` | `area-bu-admin`, `area-doc-maker` |
| L1 Area | `area-<persona-short>-<module>` | `area-ba-biz-setup` |
| L2 Area | `area-<persona-short>-<module>-<entity>` | `area-ba-biz-setup-dept` |
| Workspace page | `<persona-short>-<page>` | `ba-dashboard`, `ba-todo` |
| CRUD page | `<persona-short>-<entity>-<action>` | `ba-dept-list-view`, `ba-up-detail-edit` |
| Shared entry | `page-<name>` | `page-login`, `page-forgot-password` |

Use a 2–3 char persona short code (`ba` = BU Admin, `bu` = Business User, etc.)
to keep IDs scannable. Avoid embedding more than three segments in an ID —
slugs carry the long-form path.

### 4.2 Slugs

Pattern: `<persona>-<module>-<sub-module>-<entity>-<action>`, kebab-case,
lowercase, full path. Slugs are how external systems reference a page, so
they should be self-describing.

```
bu-admin-business-setup-department-listing-view
bu-admin-business-setup-user-profile-detail-edit
```

When a persona is renamed (e.g. "BU Admin — Maker" → "BU — Admin"), update
all descendant slugs to match. IDs can stay shorter but slugs must reflect
the current naming.

### 4.3 Display names

- Personas: `<Band> — <Role>` with an em-dash, e.g. "BU — Admin", "BU — Author".
- Sub-modules: Title Case, no prefix (e.g. "Business Setup", not "BU Admin Business Setup").
- CRUD pages: `<Entity Style> - <Action>` with hyphen, e.g. "Listing - View",
  "Detail - New". Keep them short — the parent Area already disambiguates
  which entity is in play.

---

## 5. Layout patterns

### 5.1 Top-down reading order

Place elements so the eye reads top-to-bottom, left-to-right in the order
that matches the user journey:

```
Login (entry)
   ↓
Persona workspace (Dashboard, To Do, Tracking, Notifications)
   ↓
Functional sub-modules (Business Setup, Parameter Maint, …)
   ↓
Entities (Department, User Profile, …)
   ↓
Pages (Listing - View, Detail - Edit, …)
```

### 5.2 Single entry, multiple personas

Shared entry pages (Login, Forgot Password) sit **above** the persona band,
centered. One Login can connect to multiple persona Dashboards — wire one
edge per persona as that persona gets defined.

### 5.3 Persona band patterns

| # of personas | Layout |
| ------------- | ------ |
| 1 (focal) | Full canvas width, dominant |
| 2 | Side by side, equal width |
| 3–4 | Single row, equal columns |
| 5–8 | Single row of compact placeholders OR two rows of 3–4 |

When one persona is focal and others are placeholders, give the focal one
~70% of canvas width and pack the placeholders into a slim bottom band at
~200px height.

### 5.4 Sub-module grid inside a persona

Default to **3 columns × N rows**. Most personas have 4–8 sub-modules; 3 cols
keeps each module wide enough to hold L2 children, while N rows scales
without breaking the grid.

Avoid 4-column grids — sub-modules become too narrow to hold L2 sub-sub-Areas
side by side.

### 5.5 L2 sub-sub-module layout

Lay out 3 L2 Areas horizontally inside their L1 parent. Pages inside each L2
stack vertically as a compact list (5–7 pages typical).

For more than 3 L2 Areas, switch to 2 rows × 2 cols inside L1 (and grow L1
accordingly).

### 5.6 CRUD page sets

The standard CRUD-style page set for a single entity:

```
Listing - View    (read-only list)
Listing - Edit    (editable list / bulk actions)
Detail - New      (create form)
Detail - View     (read-only detail)
Detail - Edit     (edit form)
```

Stack them in the order above inside the L2 Area. The reading order matches
typical user flow: discover → manage → create → inspect → modify.

### 5.7 Flow-driven page placement

Within a single Area, pages don't have to fill a strict N×M grid. Place
each page near the page(s) it connects to, so the primary edge runs in
the natural direction (right for "next", down for "drill into", up for
"refine / edit"). Empty grid cells are acceptable.

**Why:** A flow-driven layout makes the edge graph readable at a glance.
"Edit" placed *above* "Detail" lets the edit edge climb up — readers
recognize "this is a refinement of Detail" without reading the label.
Forcing pages into reading-order grid cells forces edges to backtrack,
which adds visual noise and crossings (§8.4).

**How to apply:**

- Lay out the *spine* of pages along the dominant flow first (e.g.
  Dashboard → List → Detail in a row).
- Place CTAs (Create, Edit, Archive) adjacent to their source, in the
  direction the CTA's edge naturally wants to go:
    - "Edit" usually sits **above** Detail (refinement climbs up)
    - "Create" usually sits **below** List (forward / new item drops down)
    - "Archive / Delete" usually sits **below** Detail (terminal action)
- An Area expanded to include pages above its original top (negative `y`
  relative to the original `area.y`) is normal — let the Area auto-grow
  to fit per the §6.2 cascade.
- Grid stride still applies to **positions** — pages snap to §3.5.1 /
  §3.5.2 cells (x stride = page width, y stride = page height). What's
  relaxed here is **occupancy** — not every cell must hold a page.
- Strict grids (§5.4 sub-module grid, §5.5 L2 layout) still apply to
  *containers* (Areas). This relaxation is for *pages inside* an Area
  only.

---

## 6. Iteration workflow

Sitemaps grow. Follow this order to avoid expensive rework:

### 6.1 Outside-in
1. Define **personas** as L0 Areas first (top band only, no contents).
2. Confirm persona scope with the stakeholder before going deeper.
3. Pick one persona, define its **sub-modules** (L1 Areas, no contents).
4. Pick one sub-module, define its **sub-sub-modules** (L2 Areas).
5. Drop in **pages** last.

This is the order we used for LBP — each level was confirmed before
expanding the next.

### 6.2 Resize cascades

Adding content at a deep level forces parent resizing. Plan for this:

- Adding L2 pages → L2 grows → L1 grows → L0 grows → canvas grows
- When L0 grows, **shift adjacent personas down** to make room
- When canvas grows past `vbH`, **lower `scale`** or **raise `vbH`**

Always resize **all siblings at the same level uniformly**, even empty ones.
A grid of mismatched boxes reads as broken; a grid of empty-but-equal boxes
reads as "more is coming."

### 6.3 Renames

When renaming a persona or sub-module:
- Update display `name` and `slug` on the Area
- Update slugs of all descendants (paths embed the parent name)
- IDs can stay (internal references); only update them if the old prefix
  becomes misleading
- Update edges if you changed any page IDs

### 6.4 Removing an Area

- If empty: just delete it. Cascade siblings to fill the gap or accept the
  empty space.
- If populated: orphans are not allowed. Delete the descendants explicitly
  before the parent, or move them into another Area first.
- Edges to deleted pages are auto-pruned (see [sitemap-data-model.md](sitemap-data-model.md) §3.4),
  but check the final layout to confirm.

---

## 7. Viewport tuning

| Content extent | Recommended `scale` | Recommended `vbW × vbH` |
| -------------- | ------------------- | ----------------------- |
| Up to ~1200×700 | 0.6 | 1400 × 900 |
| Up to ~1600×900 | 0.5 | 1800 × 1100 |
| Up to ~2000×1200 | 0.45 | 2000 × 1300 |
| Up to ~2400×1400+ | 0.4 | 2400 × 1500 |

Heuristics:
- If you have to drop below 0.4 just to fit content, you've over-packed the
  canvas — split into multiple sitemaps or collapse some areas.
- `tx` / `ty` rarely need to change from `40 / 30`.
- Increase `vbH` before increasing `vbW`. Most sitemaps scroll vertically
  more naturally than horizontally.

---

## 8. Edges

### 8.1 When to draw an edge

Draw an edge when the connection conveys information the layout doesn't
already make obvious. **Don't** wire every adjacent page — that just adds
noise.

| Edge | Worth drawing? |
| ---- | -------------- |
| Login → Dashboard | Yes — crosses persona boundary, captures the entry handoff |
| Dashboard → To Do List | Optional — same band, neighbors |
| Listing - View → Detail - View | Yes if showing the click-through; skip if it's obvious |
| Detail - View → Detail - Edit | Yes — captures the "Edit" CTA path |
| Listing - View → Detail - New | Yes — captures the "Create" CTA path |

For full CRUD sets, draw 3–4 strategic edges per entity, not all possible
ones. The standard set:
- Listing - View → Detail - View (click row)
- Listing - View → Detail - New (Create button)
- Detail - View → Detail - Edit (Edit button)
- Detail - Edit → Detail - View (save / cancel)

### 8.2 Edge styling

| Edge type | `lineColor` | `lineStyle` | `lineWidth` |
| --------- | ----------- | ----------- | ----------- |
| Primary flow (Sign in, Submit) | `accent` | `solid` | `thin` |
| Cross-persona handoff | `accent` | `solid` | `normal` |
| Within-persona nav | `gray` | `solid` | `thin` |
| Error / fallback path | `warn` | `dashed` | `thin` |
| Suggested / future path | `gray` | `dashed` | `thin` |

### 8.3 Labels

Add labels only when the edge needs explaining:
- `Sign in`, `Submit`, `Approve`, `Return` — action labels worth showing
- Empty labels for self-evident routing

### 8.4 Crossings vs overlaps — crossings allowed, overlaps forbidden

Two edges may **cross** (intersect at a single point as their paths pass
through each other) — this is acceptable and sometimes unavoidable in a
dense graph. Two edges must never **overlap** (share a collinear segment
that runs along the same line for any distance) — that reads as a single
edge and silently hides one of the relationships.

**Why:** Project preference for legibility. A crossing is a momentary
visual blip that the reader resolves; an overlap permanently erases one
of the two edges from the picture.

**How to apply:**

- **Default routing** anchors both endpoints at the mid of their chosen
  side (left/right idx 1, top/bottom idx 2). If two edges leave the same
  page on the same side and both rely on the default, their initial stubs
  are collinear → **overlap**. The fix is to pin anchors so each edge
  uses a distinct index:
    - Left/Right: 3 anchors (`idx 0` top, `idx 1` mid, `idx 2` bottom).
    - Top/Bottom: 5 anchors (`idx 0..4`, evenly spaced left→right).
- **Convention for N outgoing same-side edges:**
    - To the *adjacent* neighbor — keep the default mid anchor (visually
      "straightest" path earns the center).
    - To the *skip-1* target — top anchor (or leftmost for top/bottom),
      so it routes above/aside.
    - To the *skip-2+* target — bottom anchor (or rightmost), so it
      routes below/aside.
- Pin via `manualSp` (source) and/or `manualTp` (target):
  `"manualSp": { "side": "right", "idx": 0 }`. See data model §2.3 for
  the anchor formula and §3.1 for the field shapes.
- Crossings are fine — don't add detour anchors just to dodge a crossing
  if doing so introduces new overlaps elsewhere.
- The editor's `deflectAroundObstacles` will detour around unrelated page
  rects, but it does **not** detect or resolve edge-on-edge overlap.
  That responsibility is on the author.

### 8.5 Cross-area edges must not pass through unrelated areas

An edge that connects two pages in **different Areas** must not visually
pass through any *other* Area between them. The edge may either:

1. Connect pages in **directly adjacent** Areas (no Area sits between
   source and target along the edge's path), or
2. Route **around** any intermediate Areas (through a side gutter or
   margin that lies outside every Area rect along the route).

**Why:** Project preference for legibility. An edge cutting straight
through an unrelated Area reads as if the source/target belongs to that
Area, mis-attributing the relationship.

**How to apply:**

- **Layout step:** before drawing a non-adjacent cross-Area edge, check
  that the layout provides a side gutter (canvas margin or inter-Area
  gap that is *not* covered by any Area rect) wide enough for the
  router to put the bend in.
    - If Areas span the full canvas width (no side gutter), non-adjacent
      cross-Area edges are **impossible** to route legally under the
      current router (no `manualMid` support). Either narrow the Areas
      to expose a side gutter, or restructure the connection.
- **Edge-design step:** for each cross-Area edge candidate, ask:
    1. Are source and target in adjacent Areas?  → fine, draw it.
    2. Are they in non-adjacent Areas AND a usable gutter exists?
       → fine, but verify routing in the editor; you may need to pin
       `manualSp` and `manualTp` to side anchors (left/left or
       right/right) so the bend lands in the gutter.
    3. Non-adjacent Areas AND no gutter? → **don't draw it.** Replace
       with an adjacent-Area edge (e.g., A→B→C as two edges), or drop
       the connection if its semantic value doesn't justify a layout
       change.
- `manualMid` **is** implemented (data model §3.1) and pins the L-route
  bend to a specific `x=` or `y=` line. See §8.6 for how to combine it
  with anchor pins to route cross-Area edges through margin channels.

### 8.6 Cross-area edge routing through margin channels

When an edge connects pages in adjacent Areas (per §8.5), prefer routing
it through the **margin channels** around the Areas rather than through
the page rows. A channel is the empty band of canvas between the page
content and the Area boundary — the title strip at the top of an Area,
or the inter-Area gap between siblings.

**Why:** An edge that runs at the same y-coordinate as a page row reads
as if it belongs to that row, especially when it passes close to
unrelated pages. Routing through the channel keeps the row "clean" and
makes the cross-Area handoff visually distinct from intra-row navigation.

**How to apply** (pin `manualSp` + `manualTp` + `manualMid`):

- **Horizontally-adjacent Areas** (e.g. Projects↔Tasks across an inter-Area gap):
    - Source `manualSp`: `{ "side": "top", "idx": 4 }` (top-right of source page)
    - Target `manualTp`: `{ "side": "top", "idx": 0 }` (top-left of target page)
    - `manualMid`: `{ "axis": "y", "value": <y> }` — set to a y in the
      top channel of both Areas (e.g. `area.y + 15`, above the first
      page row).
    - Net effect: edge leaves source going up, runs along the top
      channel across the inter-Area gap, drops into target from above.

- **Vertically-adjacent Areas** (e.g. Projects↕Team across a vertical gap):
    - Source `manualSp`: `{ "side": "bottom", "idx": 2 }`
    - Target `manualTp`: `{ "side": "top", "idx": 2 }` or `{ "side": "left", "idx": 1 }`
    - `manualMid`: often optional — auto-route handles the vertical drop
      through the gap. Set `{ "axis": "x", "value": <x> }` only if you
      need to control where the horizontal segment lands.

Without these pins, the auto-router takes the shortest path, which
typically cuts across page rows in the source or target Area. Channel
routing is a deliberate styling choice — apply it to every cross-Area
edge in a sitemap, not just some, so the convention reads consistently.

**Channel staggering** — when *multiple* channel-routed edges traverse
the **same** margin band, distinct anchor indices alone are not enough.
Their middle segments will be collinear and overlap on any shared x (for
horizontal channels) or y (for vertical channels), reading as a single
edge. Give each edge a distinct `manualMid` value to lift its middle
segment into its own lane:

- **Horizontal (top/bottom) channels** — stagger `manualMid.value` on
  the `y` axis. Channel width is typically 30–35 px (gap between Area
  top and first L1/page row, or between an L0 workspace row and the L1
  below it). Use ~10–15 px increments so each lane has clearance from
  its neighbours and from the channel walls.
- **Vertical (left/right) gutters** — stagger `manualMid.value` on the
  `x` axis with the same increments.
- Worked example (lbp-sitemap, BA workspace → BS L1):
  - Channel: y=233 (workspace bottom) → y=263 (L1 BS top), width 30 px
  - `ba-dashboard → ba-dept-list-view`: `manualMid {y: 258}` (lower lane)
  - `ba-dashboard → ba-dept-list-edit`: `manualMid {y: 245}` (upper lane)
  - 13 px between lanes, both inside the 30 px channel.

Apply this any time you find yourself routing 2+ cross-Area edges
through a shared channel, regardless of whether the edges share a source,
share a target, or just happen to cross the same band.

---

## 9. Quick decision checklist

When adding something new:

1. **What level is this?** L0 persona, L1 sub-module, L2 sub-sub-module, or
   L3 page.
2. **Does it have a sibling already?** Match the sibling's size and color.
3. **Does it need to overflow the parent Area?** If yes, resize the parent
   first, then add the child.
4. **Does this break uniformity?** If yes, either fix all siblings or
   reconsider the change.
5. **Will the layout still fit at the current `scale`?** If no, bump
   viewport before adding.

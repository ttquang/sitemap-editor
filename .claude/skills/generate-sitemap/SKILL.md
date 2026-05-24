---
name: generate-sitemap
description: Build or modify PW Studio sitemap JSON files (pw-studio-sitemap format v1, files named *.sitemap.json) — the format this project's HTML editor reads. Use this skill whenever the user wants to create a sitemap, add personas / sub-modules / CRUD pages to an existing one, restructure a layout, draw edges between pages, or otherwise touch any *.sitemap.json file. Also use it for work that mentions L0/L1/L2 area hierarchy, persona color bands (case/flow/suite/page), CRUD page sets, or cascade rules — even if the user doesn't explicitly say "sitemap".
---

# Generating and editing PW Studio sitemaps

This skill captures the conventions for building sitemaps in this project. Two reference docs in the repo root carry the full rules — read them on demand:

- **`sitemap-data-model.md`** — entity shapes (pages, areas, edges, viewport, groups). What fields a Page or Area has and what they mean. Read this first when you're unsure about a field name or its allowed values.
- **`sitemap-organization-guide.md`** — how to use those entities well. Numbered §1–§9 covering hierarchy levels, colors, sizing, spacing, naming, layouts, edges, viewport tuning. **This is the primary reference.** Cite section numbers when reasoning ("growing the L1 here per §3.6") so the user can cross-check.

Don't guess fields or rules from training data — the format has project-specific keys (`manualMid`, `manualSp`, `manualTp`, `titlePos`, etc.) and conventions that aren't standard.

## When to use

Trigger whenever:
- The user asks to build a sitemap (greenfield or from a brief).
- The user wants to add / remove personas, sub-modules, CRUD page sets, or edges in an existing `*.sitemap.json`.
- The user wants to restructure a layout — re-cascade, recenter, change page sizes, rearrange CRUD.
- The user asks for a "navigation flow", "site map", "user journey" they'd render in this editor.
- The user mentions persona color bands (case/flow/suite/page), L0/L1/L2 hierarchy, area sizing conventions, or CRUD page sets.

Do **not** use this skill for:
- Edits to the editor itself (`sitemap-editor.js`, `sitemap-editor.css`, `sitemap-editor.html`). Those are app code, not sitemap content.
- Pure questions about the data model with no file change — answer directly.

## File format

Standard filename: `<project>-sitemap.sitemap.json` (e.g. `lbp-sitemap.sitemap.json`). The double `.sitemap.json` suffix is real, not a typo. Top-level shape:

```json
{
  "format": "pw-studio-sitemap",
  "version": 1,
  "viewport": { "scale": 0.5, "tx": 40, "ty": 30, "vbW": 1800, "vbH": 1100 },
  "pages":  [ /* L3 pages */ ],
  "areas":  [ /* L0/L1/L2 containers */ ],
  "edges":  [ /* connections */ ],
  "groups": [ /* rarely used */ ]
}
```

For exact field shapes per entity, read `sitemap-data-model.md`.

## Outside-in workflow (§6.1)

When generating from a brief, follow this order and **confirm with the user after each level** before going deeper. Wrong calls at L0/L1 are cheap to fix while areas are empty, expensive once pages and edges hang off them.

1. **L0 personas** as area placeholders, no contents. One row of L0 Areas with the right color band per §2.1.
2. Pick one persona → **L1 sub-modules**, no contents. Default 3-column grid (§5.4).
3. Pick one sub-module → **L2 sub-sub-modules**, no contents. Lay out 3 horizontally (§5.5), or 2×2 for 4+.
4. **L3 pages** last. Standard CRUD set per §5.6: Listing-View → Listing-Edit → Detail-New → Detail-View → Detail-Edit, stacked top-to-bottom.
5. **Edges** last of all. Add 3–4 strategic ones per entity, not every possible connection (§8.1).

## The cascade (§6.2) — flag it explicitly

Adding content at a deep level forces parent resizing:

> L2 pages → L2 grows → L1 grows → L0 grows → canvas grows → viewport grows

When you trigger this, **say so up-front**. A casual-sounding request like "add 4 CRUD entities to Smart Tools" often means:

- All 6 sibling L1s resize to match per §3.6 (even the empty ones — visual cost of under-filled boxes is much lower than a ragged grid).
- Bottom L1 row shifts down.
- Parent L0 grows; adjacent L0 personas shift down accordingly.
- `vbH` bumps or `scale` drops per §7.

Tell the user the cascade *before* doing 14 edits, not after. Example phrasing: "Adding pages here triggers the §6.2 cascade — L1 grows 285→480, bottom row shifts to y:710, L0 grows by 390, Business User band shifts to y:1235. Updating viewport vbH 1100→1500. Doing it now."

## Spacing floors (§3.4) — non-negotiable

| Pair | Minimum gap |
| --- | --- |
| Page ↔ Page | 8px |
| Area ↔ Area (same level) | 16px |
| Page → enclosing Area border | 8px |
| Child Area → parent Area border | 10px left/right/bottom, ~25px top (title strip) |

If content can't satisfy these floors, **grow the parent** (preferred). Never shave margins.

## Edge label corridors

Edge labels render as a ~14px-tall pill on the longest path segment. If pages are stacked with the §3.4 min 8px gap, labels overlap the adjacent page rect. When labeled edges connect vertically-adjacent siblings, widen the page stride to ~56 (32 page + 24 corridor) or ~64 (48 page + 16 corridor). This usually triggers an L2 cascade — flag it.

The editor's router (`sitemap-editor.js` → `orthogonalRoute`) emits 1 segment (straight) or 3 segments (L/Z bend) by default, plus extra detours when an edge would cross an unrelated page rect. The detour code lives in `deflectAroundObstacles` — manualMid edges are still detoured, so user-pinned midpoints may be overridden if obstacles end up under the path.

## Naming (§4)

| Level | ID pattern | Slug pattern |
| --- | --- | --- |
| L0 Area | `area-<persona>` | `<persona>` |
| L1 Area | `area-<persona-short>-<module>` | `<persona>-<module>` |
| L2 Area | `area-<persona-short>-<module>-<entity>` | `<persona>-<module>-<entity>` |
| Workspace page | `<persona-short>-<page>` | `<persona>-<page>` |
| CRUD page | `<persona-short>-<entity>-<action>` | `<persona>-<module>-<entity>-<action>` |
| Shared entry | `page-<name>` | `<name>` |

Persona short codes are 2–3 chars (`ba` = Business Admin, `bu` = Business User). On rename: update display name + slug + descendant slugs. IDs can stay unless the prefix becomes misleading (§6.3).

## Editing existing sitemaps

The user typically edits *in the browser* (drag, resize, re-export). Before changing anything:

1. **Read the file first.** Don't assume from prior conversation — the user may have re-arranged and re-exported. Page positions and area dimensions in the JSON are the ground truth.
2. **Locate** entities by id (stable) or slug (may have changed on rename).
3. **Compute the cascade** before editing children. Parent resizes are usually the longest-blast-radius change; do them with your eyes open.
4. **Apply targeted edits.** Preserve unrelated fields (`color`, `titlePos`, `locked`, `manualMid`, `manualSp`, `manualTp`, `border`, etc.).
5. **Summarize** what changed, what cascaded, and what side-effects to expect (off-center workspace pages, viewport needs tuning, sibling L2s now asymmetric, etc.).

## Common gotchas

- **Edge labels invisible after JSON edits.** The editor reads the inline SVG on initial page load; JSON file changes apply only after the user goes through the import flow (`sitemap-editor.js:799-804` stashes to sessionStorage and reloads). Suggest re-importing before assuming a rendering bug.
- **Sibling asymmetry.** If the user manually positions pages inside one L2, the L1 may have ragged children. Flag this — they may want sibling L2s to match (§3.6).
- **Negative-X spill.** Manual page positioning can put content at negative coords; parent areas must extend to encompass. Don't quietly leave a child outside its parent.
- **`page-login` is shared entry** — color `sel`, not tied to a persona. One Login connects to multiple persona Dashboards via edges (§5.2).
- **Edges referencing deleted pages** are auto-pruned on import per data-model §3.4, but check the final layout afterward.

## Defaults that match this project's style

Unless the user says otherwise:
- **Page color** matches the enclosing persona (`case` for Business Admin pages, `flow` for Business User, etc.).
- **L1 and L2 areas** are always `neutral` color (§2.2).
- **Page sizes**: standard 140×48; prominent 180×48 for workspace pages; compact 140×32 only for very dense CRUD stacks.
- **Workspace pages** (Dashboard, To Do, Tracking, Notifications) sit ~50px below their L0 area top, prominent size 180×48 with a 220 stride, centered horizontally in the L0.
- **Edge styling**: `gray solid thin` for within-persona nav; `accent solid thin` for CTAs (Create / Edit / Submit / Sign in); `warn dashed thin` for error/fallback paths (§8.2).

## Reference sitemaps to consult

When the user is generating from scratch and you want to see how a finished sitemap looks, read these files in the repo:

- **`lbp-sitemap.sitemap.json`** — loan-platform sitemap, fully expanded Business Admin with Business Setup (Department / User Profile / User Group), Parameter Maintenance, Smart Tools; one Business User persona band. Shows the cascade pattern in action.
- **`loan-origination-sitemap.sitemap.json`** — broader loan-origination reference with marketing, auth, application, underwriting, servicing, admin, compliance bands. Useful when the brief is end-customer flow.

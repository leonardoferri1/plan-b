# Plan B — Implementation Plan

> Interactive 2D/3D interior design studio. One canonical document model, two synchronized
> renderers, a command-based history, and a thin persistence layer that degrades gracefully
> when the backend is not running.

---

## 1. Architecture

```
plan-b/
├─ packages/shared        @plan-b/shared  — domain model, geometry, catalog, validation
├─ apps/web               @plan-b/web     — React + Vite editor (2D canvas + R3F scene)
└─ apps/api               @plan-b/api     — NestJS + Prisma + PostgreSQL REST API
```

### Layering (strictly one-directional)

```
            ┌──────────────────────────────────────────────┐
            │              @plan-b/shared              │
            │   domain types · zod schemas · geometry ·    │
            │   catalog · materials · migrations           │
            └───────────────┬──────────────────┬───────────┘
                            │                  │
             ┌──────────────▼───────┐   ┌──────▼───────────┐
             │  apps/web            │   │  apps/api        │
             │                      │   │                  │
             │  store/   commands   │   │  projects module │
             │  canvas2d/ renderer  │   │  prisma service  │
             │  viewer3d/ R3F       │   │  zod pipes       │
             │  features/ UI        │   │  swagger         │
             │  services/ persist   │   │                  │
             └──────────────────────┘   └──────────────────┘
```

The web app never reaches into a renderer from UI code and never lets a renderer mutate the
document directly: every mutation goes through a **command** dispatched on the project store.

### Single source of truth

There is exactly one geometry state: `FloorPlan` inside the project store. The 2D canvas and
the 3D scene are both _pure projections_ of it.

```
FloorPlan (meters, canonical)
   ├── derived (memoized selectors)
   │     ├─ wall quads        → 2D stroke + 3D extrusion
   │     ├─ room polygons     → 2D fill  + 3D floor
   │     └─ opening cutouts   → 2D symbol + 3D wall splitting
   ├── canvas2d renderer  (imperative, requestAnimationFrame)
   └── viewer3d scene     (React Three Fiber)
```

### Coordinate system

- Unit: **meters**, everywhere, including the wire format.
- Plan space: `x` to the east, `y` to the south (screen-down), matching canvas convention.
- 3D space: plan `(x, y)` maps to three.js `(x, 0, y)`; `+Y` is elevation.
  A single `planToWorld` helper owns that mapping, so there is no drift between views.

---

## 2. Domain model (`@plan-b/shared`)

| Entity          | Key fields                                                          |
| --------------- | ------------------------------------------------------------------- |
| `WallNode`      | `id, x, y` — shared corner; walls reference nodes, never raw points |
| `Wall`          | `id, a, b, thickness, height, materialId`                           |
| `Opening`       | `id, wallId, kind (door or window), offset, width, height, sill`    |
| `Room`          | `id, name, nodeIds[], floorMaterialId`                              |
| `FurnitureItem` | `id, catalogId, position, rotation, size, materialId, elevation`    |
| `Level`         | `id, name, elevation, nodes/walls/openings/rooms/furniture`         |
| `FloorPlan`     | `schemaVersion, levels[], settings`                                 |
| `Project`       | `id, name, plan, createdAt, updatedAt`                              |

Walls are a **graph** (nodes + edges), not a list of segments. That is what makes corner
dragging, room detection and junction cleanup work correctly.

Rooms are detected by **planar face traversal** of the wall graph: every directed half-edge is
followed by picking the most clockwise next edge; each resulting cycle is a face, and the face
with the largest absolute area is discarded as the outer boundary.

---

## 3. Editor commands and history

A command is a named, pure mutation over an immer draft:

```ts
interface Command {
  type: string;
  label: string;
  mutate(draft: FloorPlan): void;
}
```

`immer.produceWithPatches` yields forward and inverse JSON patches. History stores
`{ label, patches, inversePatches }`, so undo/redo costs the size of the change rather than
the size of the document, and the whole system is unit-testable without React.

Consecutive commands sharing a `coalesceKey` inside a short window merge into one history
entry, so dragging a wall node produces a single undo step instead of sixty.

---

## 4. Milestones (vertical slices, each one buildable and demoable)

1. **M0 — Foundation**: monorepo, tooling, docker-compose, CI.
2. **M1 — Domain**: types, zod schemas with schema versioning, geometry kernel, unit tests.
3. **M2 — Shell**: dark editor chrome, top bar, left toolbar, right inspector, view switch.
4. **M3 — 2D editor**: pan/zoom, grid snap, wall drawing, selection, move, delete, dimensions,
   openings, undo/redo, keyboard shortcuts.
5. **M4 — 3D viewer**: extruded walls with real openings, floors, camera presets, shadows,
   selection highlight, transform gizmo.
6. **M5 — Catalog and materials**: 8 procedural furniture models, 7 material presets.
7. **M6 — Persistence**: NestJS CRUD with Prisma, local demo workspace, debounced autosave.
8. **M7 — Export**: PNG plan, 3D screenshot, project JSON export/import with validation.
9. **M8 — Quality**: unit and e2e tests, README, accessibility pass, performance pass.

---

## 5. Technical decisions

| Decision                                       | Rationale                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2D via imperative Canvas 2D, not SVG/React** | A floor plan redraws on every pointer move. Reconciling hundreds of React nodes at 60 fps is wasteful; one canvas with a render loop keeps pointer latency flat and makes high-DPI PNG export a one-liner.  |
| **Walls as a node graph**                      | Enables shared corners, correct junction geometry and cycle-based room detection. A flat list of segments cannot express "these two walls share a corner".                                                  |
| **Openings cut by wall splitting, not CSG**    | Boolean CSG on extruded geometry is slow and fragile. A straight wall with a rectangular opening decomposes exactly into boxes (left, right, under-sill, over-head). Robust, fast, zero extra dependencies. |
| **Procedural furniture, no GLTF assets**       | No download, licensing or LFS risk, instant load, every model is theme-able by material swap, and the catalog stays diff-able text.                                                                         |
| **immer patches for undo/redo**                | A real command pattern with cheap inverses and no hand-written `undo()` per command.                                                                                                                        |
| **Zod schemas live in `shared`**               | The same validator guards the API request body, the JSON import file and the localStorage payload. One schema, three boundaries.                                                                            |
| **Repository abstraction for persistence**     | `LocalProjectRepository` and `HttpProjectRepository` share an interface, so the portfolio demo works with the API off and switches to the server transparently when it is reachable.                        |
| **Zustand with selector subscriptions**        | The 3D scene must not re-render because a tooltip opened. Slices plus `useShallow` keep re-renders scoped.                                                                                                  |
| **schemaVersion with a migration chain**       | Saved plans outlive the code that wrote them; `migratePlan()` upgrades old payloads before validation.                                                                                                      |

---

## 6. Assumptions

- Desktop-first. The editor targets pointer and keyboard; below `lg` the app shows a focused
  limited layout rather than pretending a 1200 px tool fits a phone.
- Single level per project in the MVP. The model is already multi-level (`levels[]`), the UI
  only exposes the first one.
- Anonymous demo workspace: the browser mints a `workspaceId` in `localStorage` and sends it
  as `x-workspace-id`. No auth, as specified, so server data is explicitly disposable.
- Metric units only. Imperial display is a future enhancement.
- The database is optional for the demo. `pnpm dev` alone must produce a working studio.

---

## 7. Out of scope for the MVP

Authentication, payments, multi-user collaboration, AI assistants, PDF export, public share
links, curved wall profiles, stairs, multi-floor navigation, imported CAD files.

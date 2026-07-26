# FTrace — Pixel/Voxel Design System

A retro, blocky **Minecraft-meets-16-bit-RPG** design system for FTrace: an
isometric Phaser city + pixel restaurant interiors, with a pixel-art HUD layered
on top for the live surplus deal engine, Vapi recovery calls, and XTrace memory.

This document is self-contained: an engineer or AI can rebuild the look from it
alone, against any content. Frontend lives in `frontend/`.

---

## 0. Design intent

Two coexisting rendering styles:

- **Isometric voxel blocks** for the world — cubes drawn as a top diamond + two
  shaded side faces.
- **Front-facing pixel sprites** (people, plants, props) built from crisp
  rectangles with a dark outline.
- **Chunky "RPG dialog" UI chrome** for the HUD — hard edges, thick multi-layer
  borders, pressable buttons — laid over the live canvas.

Golden rules the whole system obeys:

1. **No rounded corners** in game UI (`border-radius: 0`). Rounding only
   survives in a few non-diegetic web bits (KPI cards, allocation bars, pills).
2. **No image assets** — everything is generated procedurally (CSS box-shadows
   for chrome; runtime graphics for the world). Keeps it swappable for real
   sprites later.
3. **Hard-edged shading** — one flat color per face, plus manually darkened
   variants for depth. No gradients except deliberate stripes.
4. **Three type roles**: pixel font for labels/headings, sans for body,
   monospace for live numbers/formulas. Pixel text is used sparingly and small.

---

## 1. Design tokens

### Color palette

```
--panel     #1a1f2e   /* dark navy — HUD panels, top bar */
--panel-2   #171d30   /* pixel-frame body fill */
--panel-3   #10152a   /* list cell fill */
--panel-4   #12182b   /* order dialog body */
--panel-5   #0f1428   /* panel/dialog header strip */
--ink-edge  #0c1020   /* near-black frame outline */
--border    #2c3a63   /* inner frame border (navy) */
--cell-edge #2a3556   /* cell inset border */

--accent    #e85d4c   /* coral — primary action / danger / DEAL */
--accent-hi #d44d3c   /* coral hover */
--gold      #f0b429   /* gold — headings, SELL allocation, focus ring, frame edge */
--turf      #4a9c3a   /* green — turf */
--sky       #7ec8e8   /* city background */
```

Semantic log / status colors (used in the live log + status pills):

```
deal    coral  #e85d4c   (bg 20% / text #ffb4a8)
predict gold   #f0b429   (bg 15%)
call    green  #22c55e   (text #4ade80, bg 15%)
system  blue   #3b82f6   (text #93c5fd, bg 15%)
```

KPI / deal accents:

```
surplus-saved  green  #4ade80
meals-rescued  blue   #93c5fd
current-offer  gold   #f0b429
sell-now       gold   #f0b429  (border/bg at 30%/10%)
donate-next    green  #4ade80  (border/bg at 30%/10%)
```

API status pill states:

```
live     border #22c55e/40  bg #22c55e/15  text #4ade80
offline  border #e85d4c/40  bg #e85d4c/15  text #ffb4a8
idle     border #f0b429/40  bg #f0b429/15  text #f0b429
```

Risk scale (low -> high):

```
low   #4ade80   (risk <= 0.40)
med   #f0b429   (0.40 < risk <= 0.65)
high  #e85d4c   (risk > 0.65)
```

Wood variant (cabinets / shelves):

```
wood-body  #6f4622   wood-inner #4f3218   wood-edge #3a2412
wood-mid   #8a5a2f   wood-hi    #d4af37 / #a9713a   wood-text #f6ecd8
```

Neutrals:

```
page-bg #0f1419   text #f2f4f7   scrollbar-thumb #3a4560
text on dark: white at /85 /70 /65 /55 /50 /45 /40 /35 opacity steps
```

Category -> color map (goods / inventory chips):

```
Produce #4faf4a   Dry #f0b429   Prep #2a9d8f
Dairy   #e9d8a6   Bakery #d98a3c   default #5b8def
```

### Typography

```
--font-pixel: "Press Start 2P", system-ui, monospace;   /* labels, headings, buttons */
--font-sans:  "Outfit", 400/500/600/700, system-ui, sans-serif;  /* body */
font-mono (Tailwind default stack)                       /* live numbers, deal formulas */
```

- Load from Google Fonts: `Press+Start+2P` and `Outfit:wght@400;500;600;700`.
- **Pixel text renders large.** Headings 10–13px, labels 7–9px, in-world 7–8px.
  Use `letter-spacing: 0.5px`, `line-height: 1.5`.
- Body text uses Outfit at normal web sizes (10–18px).
- **Monospace + `tabular-nums`** for anything that ticks or must align:
  formulas, countdowns, KPI dollar/meal figures, cart quantities.

### Geometry

- Corner radius: **0** in game chrome; small `rounded`/`rounded-lg`/
  `rounded-full` allowed only for KPI/deal sub-cards, allocation bars, and pills.
- Border thickness expressed via stacked box-shadows in multiples of **2px** and
  **4px**.
- Frame "gold tab" edges stick out **8px**; near-black edge **4px**.

---

## 2. Pixel UI CSS kit (drop-in)

These classes fake dimensional pixel-art chrome using layered `box-shadow`s.
Reproduce verbatim (Tailwind v4 `@theme` + plain CSS). This is `globals.css`.

```css
@import "tailwindcss";

@theme inline {
  --font-pixel: "Press Start 2P", system-ui, monospace;
  --font-sans: "Outfit", system-ui, sans-serif;
  --color-panel: #1a1f2e;
  --color-accent: #e85d4c;
  --color-gold: #f0b429;
  --color-turf: #4a9c3a;
}

* { box-sizing: border-box; }

html, body {
  margin: 0; width: 100%; height: 100%; overflow: hidden;
  font-family: var(--font-sans); background: #0f1419; color: #f2f4f7;
}
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: #3a4560; border-radius: 3px; }

.pixel { font-family: var(--font-pixel); letter-spacing: 0.5px; line-height: 1.5; }

/* Chunky RPG dialog panel: navy body, black cut-corner edge, gold outer tabs */
.pixel-frame {
  border-radius: 0 !important;
  border: 0 !important;
  background-color: #171d30;
  color: #eef2ff;
  box-shadow:
    inset 0 0 0 2px #2c3a63,   /* inner navy border */
    inset 0 0 0 4px #0c1020,   /* inner black border */
    0 -4px 0 #0c1020, 0 4px 0 #0c1020, -4px 0 0 #0c1020, 4px 0 0 #0c1020,  /* black edge */
    0 -8px 0 #f0b429, 0 8px 0 #f0b429, -8px 0 0 #f0b429, 8px 0 0 #f0b429;  /* gold outer tabs */
  backdrop-filter: none !important;
}

/* Wood variant for inventory cabinet / bookshelf */
.pixel-frame--wood {
  background-color: #6f4622; color: #f6ecd8;
  box-shadow:
    inset 0 0 0 2px #a9713a, inset 0 0 0 4px #3a2412,
    0 -4px 0 #3a2412, 0 4px 0 #3a2412, -4px 0 0 #3a2412, 4px 0 0 #3a2412,
    0 -8px 0 #d4af37, 0 8px 0 #d4af37, -8px 0 0 #d4af37, 8px 0 0 #d4af37;
}

/* Blocky list rows */
.pixel-cell         { border-radius: 0 !important; background-color: #10152a; box-shadow: inset 0 0 0 2px #2a3556; }
.pixel-cell--active { background-color: #3a1f1c; box-shadow: inset 0 0 0 2px #e85d4c; } /* coral selected */
.pixel-cell--wood   { border-radius: 0 !important; background-color: #4f3218; box-shadow: inset 0 0 0 2px #8a5a2f; }

/* Shelf plank behind a row (bookshelf look) */
.pixel-shelf { position: relative; }
.pixel-shelf::after {
  content: ""; position: absolute; left: -6px; right: -6px; bottom: -7px; height: 4px;
  background: #3a2412; box-shadow: 0 2px 0 #2a1a0d;
}

/* Small blocky icon tile (jar / box) — top-left light, bottom-right dark bevel */
.pixel-chip {
  border-radius: 0 !important;
  box-shadow: inset -2px -2px 0 rgba(0,0,0,.35), inset 2px 2px 0 rgba(255,255,255,.25);
  image-rendering: pixelated;
}

/* Pressable pixel button: hard drop shadow that depresses on click */
.pixel-btn {
  border-radius: 0 !important; font-family: var(--font-pixel);
  font-size: 9px !important; letter-spacing: 0.5px;
  box-shadow: inset 0 0 0 2px rgba(0,0,0,.4), 0 3px 0 rgba(0,0,0,.45);
}
.pixel-btn:active { transform: translateY(2px); box-shadow: inset 0 0 0 2px rgba(0,0,0,.4); }

/* Segmented pixel progress bar */
.pixel-bar {
  border-radius: 0 !important; background-color: #0c1020; box-shadow: inset 0 0 0 2px #2a3556;
  background-image: repeating-linear-gradient(90deg,
    transparent 0, transparent 5px, rgba(0,0,0,.4) 5px, rgba(0,0,0,.4) 6px);
}
```

---

## 3. Component specs (HUD)

| Component | Recipe |
| --- | --- |
| **Panel / Card (web)** | Base `Card`: `rounded-2xl border border-white/10 bg-[#1a1f2e]/92 shadow-2xl backdrop-blur-md`. Used for KPI + formula + deal cards. |
| **Panel (pixel)** | `.pixel-frame`. Header: `.pixel` gold label 8–9px + title 11px + description `#8fa0c8`, on `border-b-2 border-[#0c1020] bg-[#0f1428]`. Used for the live log + dialogs. |
| **Top bar** | Fixed, `bg-[#1a1f2e]/90 backdrop-blur-md border-b border-white/10`. Left: `← City` (interior only), gold pixel wordmark **FTRACE** + context subtitle, then a header `.pixel-btn` **CALL** (interior). Right: "Today $revenue" + **API · {LIVE/OFFLINE/IDLE}** status pill. |
| **KPI cards** | 3-col grid, small `Card`s. Pixel label 7px in the metric's accent color (green/blue/gold) + big `tabular-nums` value. SURPLUS SAVED / MEALS RESCUED / CURRENT OFFER. |
| **Live formula card** | Narrow `Card` (`w-56`). Gold pixel title 8px, plain-English rule in white/55 10px, then the live `font-mono tabular-nums` equation with the result highlighted (gold for at-risk, green for money/donate). |
| **Deal-engine banner** | Bottom-center `Card`. Coral pixel tag "FTRACE DEAL ENGINE", countdown, title, `START ORDER` / `DEMO ORDERS` pixel buttons, price strikethrough → deal price line, a 2-col **SELL NOW** (gold) / **DONATE NEXT** (green) split, and an allocation bar (gold sell % + green donate remainder, `transition-[width] duration-500`). |
| **Live log** | `.pixel-frame` panel, scrollable. Rows `.pixel-cell`: colored status pill (DEAL/PRED/CALL/SYS) + timestamp + title + detail + restaurant. |
| **List cell** | `.pixel-cell`; selected -> `.pixel-cell--active` (coral). |
| **Button (pixel)** | `.pixel-btn` on dark base `#2a3556`; small variants `text-[8px]/[9px]` with tight padding. Disabled: `opacity-40`. |
| **Button (web)** | Primary = coral `#e85d4c` -> hover `#d44d3c`; `secondary` = `bg-white/5 border-white/15`; `ghost` = transparent. Focus ring `#f0b429/50`. Sizes: default h-10, sm h-8, lg h-11. |
| **Order dialog** | `.pixel-frame` on `#12182b`. Header strip `bg-[#0f1428]` with gold pixel eyebrow (START ORDER / DEMO ORDER RUN) + close `.pixel-btn bg-[#c0392b]` "X". Body: `.pixel-cell` menu rows with name, gold price, ingredient list, and `−`/`+` steppers (clamp 0–20) + quantity in `tabular-nums`. Footer: item count + total + submit `.pixel-btn`. |
| **Call toast** | Top-right `Card`, green-tinted `border-[#22c55e]/30 bg-[#14301f]/95`. "Vapi · live outbound" label, message, detail, `h-1.5 rounded-full` green progress fill, dismiss ✕. |
| **Avatar chip** | `.pixel-chip .pixel`, 36×36, solid per-entity bg, centered initial white 11px. Rive-swappable. |
| **Status / tag pill** | `.pixel` 8px or `rounded-full` web pill, colored bg at 10–20% opacity + matching light text. |

**`data-testid` hooks present in code** (keep them if rebuilding for tests):
`order-menu`, `deal-card`, `deal-title`, `deal-formula-card`,
`deal-allocation-bar`, `sell-quantity`, `donate-quantity`, `order-status`,
`quantity-<recipeId>`, `header-call-button`.

---

## 4. Isometric voxel rendering system (the world)

Core of the blocky look. Math is exact (`components/game/pixelArt.js`).

```
Tile size:  tileW = 64, tileH = 32   (2:1 iso ratio)

isoToWorld(gx, gy) = { x: (gx - gy) * 32, y: (gx + gy) * 16 }   // center of tile's top diamond
isoDepth(gx, gy, bump = 0) = (gx + gy) * 100 + bump             // painter order: further "south" on top

shade(color, amount): add `amount` to each RGB channel, clamp 0..255   // face shading
```

**Voxel cube** = a top diamond + two side faces:

- **Top diamond** points: `(sx, sy-hh) -> (sx+hw, sy) -> (sx, sy+hh) -> (sx-hw, sy)`.
  Fill = base `top` color; optional 1px stroke `shade(top, -110)` at 0.5 alpha.
- **Left face**: parallelogram dropping `height` px down-left, fill = `shade(top, -40)`.
- **Right face**: parallelogram dropping down-right, fill = `shade(top, -70)`.
- Full tile: `hw = tileW/2 = 32`, `hh = tileH/2 = 16`. Arbitrary footprints via
  `drawIsoBox(g, sx, sy, hw, hh, height, opts)`.

**Every block = 1 flat top + 1 medium-dark left + 1 darkest right.** That
three-tone rule is what reads as "voxel."

**World composition conventions:**

- Grid ~17×17. Terrain types and top colors: grass `#6d9c44`/`#7cae52`, park
  `#74a548`, road `#5f636b` (h=8), sidewalk `#b0ac9e`, plaza `#c4b998`, water
  `#3f8fc4` (h=6). Terrain cube heights 8–12px.
- **Per-tile jitter**: nudge each non-water tile's top color by `±3` on a
  checkerboard (`(gx+gy)%2`) for subtle texture.
- **Buildings**: heights 26–66px; procedural wall/roof "skins" chosen by a hash
  of `(gx,gy)`. Add a flat roof slab (extra cube 8px above), a small rooftop
  unit, a ground drop-shadow diamond at 16% black, and a **window-grid facade**
  (small quads on both faces, randomly "lit" `#ffe9a8` vs dark `#33405c`).
- **Special / clickable objects** (restaurants): taller (~64px), bright roof
  color, awning stripe, door quad, floating name label, an NPC beside it.
  Hit-area = polygon tracing the cube silhouette.
- **Depth**: always `setDepth(isoDepth(gx, gy, bump))` so overlaps sort right.

**Camera (world):** drag to pan (`scrollX/Y -= delta/zoom`), wheel zoom clamped
**0.55–2.4**, default zoom 1.15. Drag-vs-click guard: movement > 6px = drag,
suppress the click.

---

## 5. Front-facing pixel sprites (people, props)

Stacked rectangles (origin bottom-center `0.5, 1`) with a dark outline
silhouette behind. Person recipe (base scale 1, container 18×40):

```
palette: shirt #5b8def, skin #f5c9a8, hair #3a2a1a, pants #2c3e50, outline #1a1420

shadow    : ellipse 20×7 black @0.22 at y=2
silhouette: 16×40 outline rect (slightly larger, behind everything) — sprite edge
legs      : 12×12 pants, with a 2×10 outline gap up the middle
body      : 13×16 shirt
arms      : 4×12 each, shade(shirt,-25), at x=±7
head      : 12×12 skin at y=-25
hair      : 13×5 top (y=-33) + 3×6 side
eyes      : 1.6×2 outline rects at x=±2.5, y=-21
```

Arms / side faces always use `shade(base, -25..-40)` for form. **Props** (cars,
plants, benches, lamps, trees) follow the same rules: iso boxes for volumes,
hard-edged rects for pixel detail, one flat ground shadow, manual light/dark
faces. Trees = stacked hard rects in 3 greens (`#2f7a34` / `#3f9a3e` /
`#59bd4d`); no smooth gradients.

**Interior scene** is a **flat front-on** pixel room (not iso): warm wall
`#f3c48c`, wood floor `#d9a066` with a `#c98d54` tile grid, windows with sky +
cloud ellipses + tiny building silhouette, animated steam, a menu board,
counter, tables (occupancy-driven), and a clickable wooden **inventory cabinet**
(bookshelf of colored rects). Camera **auto-fits** a fixed 760×470 design space:
`zoom = min(viewportW/760, viewportH/470)`, centered.

---

## 6. Motion

| Event | Animation |
| --- | --- |
| View / scene change | Shell fade+scale: opacity `0.65->1`, scale `0.985->1`, 0.45s `power2.out`. |
| World crossfade | Canvas opacity `->0` in 0.18s `power1.in`, swap scene, `->1` in 0.32s `power2.out`. |
| Banner entrance | Slide up `y:40->0`, opacity `0->1`, 0.5s `power3.out` on restaurant change. |
| Hover on world object | Scale to 1.06 over 120ms; back to 1 on out; cursor -> pointer. |
| Button press | CSS only: `.pixel-btn:active` `translateY(2px)` + shadow removed. |
| Deal allocation bar | Width tween `transition-[width] duration-500` as sell/donate split shifts. |
| Deal countdown | `setInterval` 1s, `mm:ss` in gold `tabular-nums`. |
| Call progress | `tickCall()` every 3000ms advances the green toast bar to 100%. |
| Ambient | Looping tweened NPC walks, rising steam, glowing lamp ellipses. |

Renderer must be pixel-crisp: **`pixelArt: true, antialias: false`**;
`image-rendering: pixelated` on chip tiles.

---

## 7. Layout skeleton (HUD overlay)

- Two layers: full-screen game canvas (bottom) + absolutely-positioned HUD
  (`pointer-events-none`; each panel re-enables `pointer-events-auto`).
- **Top bar** across the top (wordmark + context + CALL + API status).
- **Interior HUD** anchors around a central column:
  - **Left** `top-24`: live deal formula card (`w-56`).
  - **Center** `top-24`: 3-col KPI grid, width `min(820px, calc(100% - 24rem))`.
  - **Right** `.pixel-frame` live log, `top-24 bottom-6`, width
    `min(300px, calc(100% - 2rem))`, internal thin scrollbar (6px, `#3a4560`).
  - **Bottom-center**: deal-engine banner, width `min(820px, calc(100%-24rem))`.
- **City HUD**: bottom-center hint card with restaurant-name chips.
- **Overlays**: order + inventory dialogs (centered, `bg-black/65
  backdrop-blur-[2px]`), and the top-right Vapi call toast.
- Responsive: `md:` breakpoints, `w-[min(...,calc(100%-2rem))]` clamps, `h-dvh`,
  `overflow-hidden` root.

---

## 8. Recommended stack

Next.js (App Router, JS) · **Phaser 3** for the world (procedural `Graphics`, no
assets) · **Tailwind v4** + Radix primitives (Dialog, ScrollArea, Slot) +
`class-variance-authority` for web components · **GSAP** for motion · **Zustand**
for shared state across canvas + HUD (view, selected restaurant, live
`dealRecommendation`, `orderState`, `callState`, `backendStatus`,
`memoryProcedures`). Backends: a deal/inventory + **Vapi** outbound-call service
and an **XTrace** memory service feed the HUD. Fonts: Press Start 2P + Outfit
from Google Fonts. Assets are intentionally zero — leave documented swap points
for real Tiled tilesets, Aseprite sprites, and Rive avatars.

# Surplus City

Next.js game frontend for restaurant surplus deals.

## Stack

| Layer | Tech |
| --- | --- |
| App | Next.js (App Router, JS) |
| World | Phaser 3 — city + restaurant scenes |
| Maps | Tiled-compatible JSON in `lib/maps/tiledMaps.js` |
| Characters | Pixel fallback · Rive-ready (`@rive-app/react-canvas`) |
| Motion | GSAP — scene fades + banner entrance |
| State | Zustand |
| UI | Tailwind + shadcn-style Radix primitives |

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Flow

1. **City** — pan, click a restaurant (or chip)
2. **Interior** — tables, kitchen, roaming NPCs, **INV cabinet** → inventory dialog
3. **Left** — Xtrace customers · Vapi mock calls
4. **Right** — game log of deals / predictions / calls

## Tiled

Export maps from [Tiled](https://www.mapeditor.org/) matching the schema in `lib/maps/tiledMaps.js`, then load via Phaser `tilemapTiledJSON`.

## Rive

Add `.riv` files under `public/rive/` and wire them into `CharacterAvatar` / Phaser sprites when art is ready.

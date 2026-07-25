/**
 * Procedural pixel-art helpers for the Surplus City Phaser scenes.
 *
 * Two rendering styles live here:
 *  - Isometric "voxel block" primitives for the city (drawIsoCube / isoToWorld).
 *  - Front-facing pixel sprites for the coffee-shop interior (drawPixelPerson, drawPlant...).
 *
 * Everything is generated at runtime with Phaser Graphics, so there are no
 * external image assets to ship. Swap these for real Tiled tilesets + Aseprite
 * sprites later without touching the scene logic.
 */

export const ISO = { tileW: 64, tileH: 32 }

/** Grid (gx, gy) -> screen-space world coords of the tile's top-diamond center. */
export function isoToWorld(gx, gy) {
  return {
    x: (gx - gy) * (ISO.tileW / 2),
    y: (gx + gy) * (ISO.tileH / 2),
  }
}

/** Painter's depth so tiles/objects further "south" render on top. */
export function isoDepth(gx, gy, bump = 0) {
  return (gx + gy) * 100 + bump
}

function shade(color, amount) {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (color & 0xff) + amount))
  return (r << 16) | (g << 8) | b
}

export { shade }

/**
 * Generic isometric box with an arbitrary footprint (hw = half-width,
 * hh = half-depth). (sx, sy) is the center of the TOP diamond.
 */
export function drawIsoBox(g, sx, sy, hw, hh, height, opts = {}) {
  const top = opts.top ?? 0x6ab04c
  const left = opts.left ?? shade(top, -40)
  const right = opts.right ?? shade(top, -70)
  const outline = opts.outline ?? shade(top, -110)

  if (height > 0) {
    // left face
    g.fillStyle(left, 1)
    g.beginPath()
    g.moveTo(sx - hw, sy)
    g.lineTo(sx, sy + hh)
    g.lineTo(sx, sy + hh + height)
    g.lineTo(sx - hw, sy + height)
    g.closePath()
    g.fillPath()
    // right face
    g.fillStyle(right, 1)
    g.beginPath()
    g.moveTo(sx + hw, sy)
    g.lineTo(sx, sy + hh)
    g.lineTo(sx, sy + hh + height)
    g.lineTo(sx + hw, sy + height)
    g.closePath()
    g.fillPath()
  }

  // top diamond
  g.fillStyle(top, 1)
  if (opts.stroke !== false) g.lineStyle(1, outline, 0.5)
  g.beginPath()
  g.moveTo(sx, sy - hh)
  g.lineTo(sx + hw, sy)
  g.lineTo(sx, sy + hh)
  g.lineTo(sx - hw, sy)
  g.closePath()
  g.fillPath()
  if (opts.stroke !== false) g.strokePath()
}

/**
 * Draw an isometric cube (a raised block) into an existing Graphics object.
 * (sx, sy) is the center of the block's TOP diamond, in world space.
 */
export function drawIsoCube(g, sx, sy, opts = {}) {
  drawIsoBox(g, sx, sy, ISO.tileW / 2, ISO.tileH / 2, opts.height ?? 0, opts)
}

/**
 * A small parked car built from an iso box + windshield + wheels.
 * Returns a Phaser Container placed at world (x, y).
 */
export function drawCar(scene, x, y, color = 0xd94f4f) {
  const c = scene.add.container(x, y)
  const g = scene.add.graphics()

  // ground shadow
  g.fillStyle(0x000000, 0.18)
  g.beginPath()
  g.moveTo(0, 2)
  g.lineTo(20, 12)
  g.lineTo(0, 22)
  g.lineTo(-20, 12)
  g.closePath()
  g.fillPath()

  // wheels (dark stubs)
  g.fillStyle(0x1a1a1e, 1)
  g.fillRect(-15, 9, 6, 5)
  g.fillRect(11, 9, 6, 5)
  g.fillRect(-4, 15, 6, 5)

  // body
  drawIsoBox(g, 0, 4, 16, 8, 9, {
    top: color,
    left: shade(color, -40),
    right: shade(color, -70),
    stroke: false,
  })
  // cabin / windshield
  drawIsoBox(g, 0, -3, 10, 5, 5, {
    top: shade(color, 30),
    left: 0x9fd6ea,
    right: 0x7fb9d6,
    stroke: false,
  })
  c.add(g)
  return c
}

/**
 * Front-facing pixel person built from crisp rectangles + a dark outline.
 * `opts` may be a color number (legacy) or a palette object.
 * Returns a Phaser Container.
 */
export function drawPixelPerson(scene, x, y, opts = {}, scale = 1) {
  if (typeof opts === "number") opts = { shirt: opts }
  const shirt = opts.shirt ?? 0x5b8def
  const skin = opts.skin ?? 0xf5c9a8
  const hair = opts.hair ?? 0x3a2a1a
  const pants = opts.pants ?? 0x2c3e50
  const outline = 0x1a1420

  const c = scene.add.container(x, y)
  const px = (ox, oy, w, h, color) =>
    scene.add.rectangle(ox, oy, w, h, color).setOrigin(0.5, 1)

  // subtle ground shadow
  const shadow = scene.add.ellipse(0, 2, 20, 7, 0x000000, 0.22)

  // outline silhouette (drawn slightly bigger, dark) for a sprite-y edge
  const sil = px(0, 2, 16, 40, outline)

  const legs = px(0, 0, 12, 12, pants)
  const legGap = scene.add.rectangle(0, -2, 2, 10, outline).setOrigin(0.5, 1)
  const body = px(0, -10, 13, 16, shirt)
  const armL = px(-7, -12, 4, 12, shade(shirt, -25))
  const armR = px(7, -12, 4, 12, shade(shirt, -25))
  const head = px(0, -25, 12, 12, skin)
  const hairTop = px(0, -33, 13, 5, hair)
  const hairSide = px(-6, -28, 3, 6, hair)
  const eyeL = scene.add.rectangle(-2.5, -21, 1.6, 2, outline).setOrigin(0.5, 1)
  const eyeR = scene.add.rectangle(2.5, -21, 1.6, 2, outline).setOrigin(0.5, 1)

  c.add([shadow, sil, legGap, legs, armL, armR, body, hairSide, head, hairTop, eyeL, eyeR])
  c.setScale(scale)
  c.setSize(18, 40)
  return c
}

/** A small potted plant / bush for interiors and streets. */
export function drawPlant(scene, x, y, scale = 1) {
  const c = scene.add.container(x, y)
  const pot = scene.add.rectangle(0, 0, 16, 12, 0xb5643c).setOrigin(0.5, 1)
  const potLip = scene.add.rectangle(0, -12, 20, 4, 0xcf7a4f).setOrigin(0.5, 1)
  const leaf1 = scene.add.ellipse(-5, -20, 16, 20, 0x3d8b3a)
  const leaf2 = scene.add.ellipse(6, -22, 16, 22, 0x4faf4a)
  const leaf3 = scene.add.ellipse(0, -30, 15, 20, 0x5fc255)
  c.add([pot, potLip, leaf1, leaf2, leaf3])
  c.setScale(scale)
  return c
}

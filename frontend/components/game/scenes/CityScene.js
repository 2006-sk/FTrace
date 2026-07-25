import * as PhaserNS from "phaser"

const Phaser = PhaserNS.default ?? PhaserNS

import { useGameStore } from "@/lib/store"
import { restaurants } from "@/data/mock"
import {
  ISO,
  isoToWorld,
  isoDepth,
  drawIsoCube,
  drawIsoBox,
  drawCar,
  drawPixelPerson,
} from "../pixelArt"

const GRID = 17
const ROAD_LINES = [3, 7, 11, 15]

// Tighter, slightly-desaturated palette closer to the pixel-art reference.
const TERRAIN = {
  grass: { top: 0x6d9c44, height: 12 },
  grass2: { top: 0x7cae52, height: 12 },
  park: { top: 0x74a548, height: 12 },
  road: { top: 0x5f636b, height: 8 },
  sidewalk: { top: 0xb0ac9e, height: 11 },
  plaza: { top: 0xc4b998, height: 12 },
  water: { top: 0x3f8fc4, height: 6 },
}

// Varied building skins: { wall, roof }.
const BUILDINGS = [
  { wall: 0xd9d2c2, roof: 0x9c3f34 },
  { wall: 0xc0785a, roof: 0x7a3f2c },
  { wall: 0xb8c2c9, roof: 0x53707e },
  { wall: 0x8fb0a5, roof: 0x3f5f57 },
  { wall: 0xe0c893, roof: 0x8a6a34 },
  { wall: 0xcf6b52, roof: 0x8a3f2c },
  { wall: 0xb7b3aa, roof: 0x6a5f4c },
  { wall: 0xa9b6c4, roof: 0x46586a },
]

const PARK = { x0: 4, x1: 6, y0: 8, y1: 10 } // a green block with a pond
const POND = new Set(["5,9", "5,10", "6,9"])
const PLAZA = new Set(["9,9", "10,9", "9,10", "10,10"])

function isRoad(n) {
  return ROAD_LINES.includes(n)
}

function hash(gx, gy) {
  let h = (gx * 73856093) ^ (gy * 19349663)
  h = (h ^ (h >>> 13)) >>> 0
  return h
}

function layoutType(gx, gy) {
  const key = `${gx},${gy}`
  if (POND.has(key)) return "water"
  if (PLAZA.has(key)) return "plaza"
  if (isRoad(gx) || isRoad(gy)) return "road"
  // sidewalk hugging the roads
  if (isRoad(gx - 1) || isRoad(gx + 1) || isRoad(gy - 1) || isRoad(gy + 1))
    return "sidewalk"
  if (gx >= PARK.x0 && gx <= PARK.x1 && gy >= PARK.y0 && gy <= PARK.y1)
    return "park"
  return (gx * 3 + gy * 7) % 11 === 0 ? "grass2" : "grass"
}

export default class CityScene extends Phaser.Scene {
  constructor() {
    super("CityScene")
  }

  create() {
    this.cameras.main.setBackgroundColor("#7ec8e8")

    this.restaurantTiles = new Set(
      restaurants.map((r) => `${r.tileX},${r.tileY}`),
    )

    this.buildGround()
    this.buildCity()
    this.buildPark()
    this.scatterProps()

    const center = isoToWorld(GRID / 2, GRID / 2)
    this.add
      .text(center.x, isoToWorld(0, 0).y - 54, "SURPLUS CITY", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "16px",
        color: "#ffffff",
        stroke: "#1a3a4a",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1_000_000)

    restaurants.forEach((r) => this.spawnRestaurant(r))

    this.spawnRoamer(0xf0b429, [
      [3, 2],
      [3, 14],
    ])
    this.spawnRoamer(0x9b59b6, [
      [2, 7],
      [14, 7],
    ])

    this.setupCamera(center)
    useGameStore.getState().setPhaserReady(true)
  }

  // ---- ground ------------------------------------------------------------

  buildGround() {
    const g = this.add.graphics()
    g.setDepth(-1_000_000)
    const cells = []
    for (let gx = 0; gx < GRID; gx++)
      for (let gy = 0; gy < GRID; gy++) cells.push([gx, gy])
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]))

    for (const [gx, gy] of cells) {
      const key = layoutType(gx, gy)
      const t = TERRAIN[key]
      const { x, y } = isoToWorld(gx, gy)
      let top = t.top
      if (key !== "water") {
        const j = ((gx + gy) % 2) * 6 - 3
        top = Phaser.Display.Color.GetColor(
          Math.max(0, Math.min(255, ((t.top >> 16) & 0xff) + j)),
          Math.max(0, Math.min(255, ((t.top >> 8) & 0xff) + j)),
          Math.max(0, Math.min(255, (t.top & 0xff) + j)),
        )
      }
      drawIsoCube(g, x, y, { top, height: t.height, stroke: key !== "road" })

      if (key === "road") this.drawRoadMarkings(g, gx, gy, x, y)
      if (key === "water") {
        g.fillStyle(0x8fd0ec, 0.5)
        g.fillRect(x - 8, y - 2, 10, 2)
        g.fillRect(x + 2, y + 3, 8, 2)
      }
    }
    this.groundTop = TERRAIN.grass.height
  }

  drawRoadMarkings(g, gx, gy, x, y) {
    const horiz = !isRoad(gy) // road running left/right (gx varies)
    const vert = !isRoad(gx)
    // skip painted lines on intersections; dash on alternating tiles
    if (horiz === vert) return
    if ((gx + gy) % 2 !== 0) return
    g.lineStyle(2, 0xe4c34a, 0.9)
    if (horiz) {
      // direction of increasing gx: (+hw, +hh)
      g.lineBetween(x - 12, y - 6, x + 12, y + 6)
    } else {
      // direction of increasing gy: (-hw, +hh)
      g.lineBetween(x + 12, y - 6, x - 12, y + 6)
    }
  }

  // ---- buildings ---------------------------------------------------------

  buildCity() {
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        const key = layoutType(gx, gy)
        if (key !== "grass" && key !== "grass2") continue
        if (this.restaurantTiles.has(`${gx},${gy}`)) continue

        const h = hash(gx, gy)
        const skin = BUILDINGS[h % BUILDINGS.length]
        const height = 26 + (h % 5) * 10 // 26..66
        const { x, y } = isoToWorld(gx, gy)
        const c = this.add.container(x, y - this.groundTop)
        c.setDepth(isoDepth(gx, gy, 10))
        const g = this.add.graphics()
        this.drawBuilding(g, height, skin.wall, skin.roof)
        c.add(g)
      }
    }
  }

  drawBuilding(g, H, wall, roof) {
    // drop shadow onto the ground toward the front-right
    g.fillStyle(0x000000, 0.16)
    g.beginPath()
    g.moveTo(6, 6 - ISO.tileH / 2)
    g.lineTo(6 + ISO.tileW / 2, 6)
    g.lineTo(6, 6 + ISO.tileH / 2)
    g.lineTo(6 - ISO.tileW / 2, 6)
    g.closePath()
    g.fillPath()

    // main box
    drawIsoCube(g, 0, -H, {
      top: wall,
      height: H,
      left: this.dark(wall, -26),
      right: this.dark(wall, -54),
      stroke: false,
    })

    // textured window grid on both visible faces
    this.facade(g, H)

    // flat roof slab + lighter top edge highlight
    drawIsoCube(g, 0, -H - 8, { top: roof, height: 8, stroke: false })
    g.lineStyle(1, this.dark(roof, 40), 0.8)
    g.beginPath()
    g.moveTo(0, -H - 8 - ISO.tileH / 2)
    g.lineTo(ISO.tileW / 2, -H - 8)
    g.lineTo(0, -H - 8 + ISO.tileH / 2)
    g.lineTo(-ISO.tileW / 2, -H - 8)
    g.closePath()
    g.strokePath()

    // little rooftop unit (water tank / AC)
    drawIsoBox(g, -6, -H - 10, 7, 4, 8, {
      top: this.dark(wall, -10),
      left: this.dark(wall, -46),
      right: this.dark(wall, -70),
      stroke: false,
    })
  }

  facade(g, H) {
    const hw = ISO.tileW / 2
    const hh = ISO.tileH / 2
    const lit = 0xffe9a8
    const dark = 0x33405c
    const rows = []
    for (let v = 12; v < H - 6; v += 13) rows.push(v)
    const cols = [0.3, 0.62]

    const pRight = (u, v) => [hw * u, -H + hh - hh * u + v]
    const pLeft = (u, v) => [-hw * u, -H + hh - hh * u + v]

    let n = 0
    rows.forEach((v) => {
      cols.forEach((u) => {
        const on = (n++ * 7 + v) % 3 !== 0
        this.faceQuad(g, pRight, u, u + 0.18, v, v + 8, on ? lit : dark)
        this.faceQuad(g, pLeft, u, u + 0.18, v, v + 8, on ? dark : lit)
      })
    })
  }

  faceQuad(g, p, u0, u1, v0, v1, color) {
    const a = p(u0, v0)
    const b = p(u1, v0)
    const c = p(u1, v1)
    const d = p(u0, v1)
    g.fillStyle(color, 1)
    g.beginPath()
    g.moveTo(a[0], a[1])
    g.lineTo(b[0], b[1])
    g.lineTo(c[0], c[1])
    g.lineTo(d[0], d[1])
    g.closePath()
    g.fillPath()
  }

  // ---- restaurants (clickable, taller, signed) ---------------------------

  spawnRestaurant(restaurant) {
    const { x, y } = isoToWorld(restaurant.tileX, restaurant.tileY)
    const c = this.add.container(x, y - this.groundTop)
    c.setDepth(isoDepth(restaurant.tileX, restaurant.tileY, 20))

    const g = this.add.graphics()
    const hw = ISO.tileW / 2
    const hh = ISO.tileH / 2
    const H = 64

    // shadow
    g.fillStyle(0x000000, 0.18)
    g.beginPath()
    g.moveTo(6, 6 - hh)
    g.lineTo(6 + hw, 6)
    g.lineTo(6, 6 + hh)
    g.lineTo(6 - hw, 6)
    g.closePath()
    g.fillPath()

    drawIsoCube(g, 0, -H, {
      top: restaurant.color,
      height: H,
      left: this.dark(restaurant.color, -28),
      right: this.dark(restaurant.color, -58),
      stroke: false,
    })
    this.facade(g, H)

    // bright signed roof
    drawIsoCube(g, 0, -H - 12, { top: restaurant.roofColor, height: 12, stroke: false })

    // awning stripe over the door (front-right face)
    g.fillStyle(restaurant.signColor ?? 0xffffff, 1)
    g.beginPath()
    g.moveTo(2, -16)
    g.lineTo(hw - 4, -22)
    g.lineTo(hw - 4, -14)
    g.lineTo(2, -8)
    g.closePath()
    g.fillPath()

    // door
    this.quad(g, 0x2c1a10, [
      [8, -14],
      [hw - 10, -21],
      [hw - 10, -7],
      [8, 0],
    ])

    c.add(g)

    const label = this.add
      .text(0, -H - 30, restaurant.name.split(" ").slice(-1)[0].toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#ffffff",
        backgroundColor: "#1a1f2ecc",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5)
    c.add(label)

    const hit = new Phaser.Geom.Polygon([
      -hw, 0, 0, hh, hw, 0, hw, -H, 0, -H - hh, -hw, -H,
    ])
    c.setInteractive(hit, Phaser.Geom.Polygon.Contains)
    c.on("pointerover", () => {
      if (this.dragging) return
      this.input.setDefaultCursor("pointer")
      this.tweens.add({ targets: c, scaleX: 1.06, scaleY: 1.06, duration: 120 })
    })
    c.on("pointerout", () => {
      this.input.setDefaultCursor("default")
      this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 120 })
    })
    c.on("pointerup", () => {
      if (this.dragged) return
      useGameStore.getState().openRestaurant(restaurant)
    })

    const npc = drawPixelPerson(this, x + 20, y - this.groundTop + 6, 0x5b8def, 0.85)
    npc.setDepth(isoDepth(restaurant.tileX, restaurant.tileY, 25))
  }

  quad(g, color, pts) {
    g.fillStyle(color, 1)
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
    g.closePath()
    g.fillPath()
  }

  // ---- park + props ------------------------------------------------------

  buildPark() {
    for (let gx = PARK.x0; gx <= PARK.x1; gx++) {
      for (let gy = PARK.y0; gy <= PARK.y1; gy++) {
        const key = `${gx},${gy}`
        if (POND.has(key)) continue
        if ((hash(gx, gy) % 3) === 0) this.spawnTree(gx, gy)
      }
    }
    this.spawnBench(4, 8)
    this.spawnBench(6, 10)
  }

  spawnTree(gx, gy, jitter = true) {
    const { x, y } = isoToWorld(gx, gy)
    const ox = jitter ? (hash(gx, gy) % 12) - 6 : 0
    const oy = jitter ? (hash(gy, gx) % 8) - 4 : 0
    const c = this.add.container(x + ox, y - this.groundTop + oy)
    c.setDepth(isoDepth(gx, gy, 6))
    const g = this.add.graphics()
    // shadow
    g.fillStyle(0x000000, 0.16)
    g.fillEllipse(0, 4, 26, 10)
    // trunk
    g.fillStyle(0x6f4423, 1)
    g.fillRect(-3, -16, 6, 18)
    // pixel-ish clustered canopy (hard-edged rects)
    const dk = 0x2f7a34
    const md = 0x3f9a3e
    const lt = 0x59bd4d
    g.fillStyle(dk, 1)
    g.fillRect(-16, -34, 32, 20)
    g.fillStyle(md, 1)
    g.fillRect(-13, -40, 26, 12)
    g.fillRect(-16, -26, 32, 10)
    g.fillStyle(lt, 1)
    g.fillRect(-9, -44, 16, 8)
    g.fillRect(-13, -32, 8, 8)
    c.add(g)
  }

  spawnBench(gx, gy) {
    const { x, y } = isoToWorld(gx, gy)
    const c = this.add.container(x, y - this.groundTop)
    c.setDepth(isoDepth(gx, gy, 6))
    const g = this.add.graphics()
    drawIsoBox(g, 0, 0, 12, 6, 4, { top: 0x8a5a2f, stroke: false })
    drawIsoBox(g, -6, -6, 12, 6, 2, { top: 0x6f4622, stroke: false })
    c.add(g)
  }

  scatterProps() {
    // parked cars on straight road tiles
    const carSpots = [
      [3, 5, 0xd94f4f],
      [7, 9, 0x4f7fd9],
      [11, 6, 0xe0b23c],
      [7, 13, 0x4faf4a],
      [11, 12, 0xd94f9f],
      [3, 10, 0x8a8f98],
    ]
    carSpots.forEach(([gx, gy, col]) => {
      const { x, y } = isoToWorld(gx, gy)
      const car = drawCar(this, x, y - TERRAIN.road.height + 2, col)
      car.setDepth(isoDepth(gx, gy, 8))
    })

    // lamp posts at sidewalk corners
    const lamps = [
      [2, 2],
      [8, 2],
      [12, 8],
      [2, 12],
      [12, 14],
      [8, 12],
    ]
    lamps.forEach(([gx, gy]) => this.spawnLamp(gx, gy))
  }

  spawnLamp(gx, gy) {
    const { x, y } = isoToWorld(gx, gy)
    const c = this.add.container(x, y - this.groundTop)
    c.setDepth(isoDepth(gx, gy, 7))
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.14)
    g.fillEllipse(0, 4, 14, 6)
    g.fillStyle(0x39414b, 1)
    g.fillRect(-2, -34, 4, 36)
    g.fillStyle(0x2b323b, 1)
    g.fillRect(-6, -38, 12, 5)
    g.fillStyle(0xffe08a, 1)
    g.fillRect(-4, -35, 8, 4)
    const glow = this.add.ellipse(0, -35, 22, 16, 0xffe08a, 0.25)
    c.add([g, glow])
  }

  // ---- roamers + camera --------------------------------------------------

  spawnRoamer(color, gridPath) {
    const first = isoToWorld(gridPath[0][0], gridPath[0][1])
    const person = drawPixelPerson(this, first.x, first.y - this.groundTop, color, 0.8)
    let idx = 0
    const step = () => {
      if (!person.active) return
      idx = (idx + 1) % gridPath.length
      const [gx, gy] = gridPath[idx]
      const w = isoToWorld(gx, gy)
      person.setDepth(isoDepth(gx, gy, 30))
      this.tweens.add({
        targets: person,
        x: w.x,
        y: w.y - this.groundTop,
        duration: 3200 + Math.random() * 900,
        ease: "Linear",
        onComplete: step,
      })
    }
    step()
  }

  setupCamera(center) {
    const cam = this.cameras.main
    cam.centerOn(center.x, center.y - 30)
    cam.setZoom(1.15)

    this.dragging = false
    this.dragged = false
    this.input.on("pointerdown", (p) => {
      this.dragging = true
      this.dragged = false
      this.dragStart = { x: p.x, y: p.y }
    })
    this.input.on("pointerup", () => {
      this.dragging = false
    })
    this.input.on("pointermove", (p) => {
      if (!p.isDown) return
      if (
        this.dragStart &&
        Math.abs(p.x - this.dragStart.x) + Math.abs(p.y - this.dragStart.y) > 6
      )
        this.dragged = true
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom
    })
    this.input.on("wheel", (_p, _o, _dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.55, 2.4))
    })
  }

  dark(color, amount) {
    const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) + amount))
    const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) + amount))
    const b = Math.min(255, Math.max(0, (color & 0xff) + amount))
    return (r << 16) | (g << 8) | b
  }
}

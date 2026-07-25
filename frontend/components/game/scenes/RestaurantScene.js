import * as PhaserNS from "phaser"

const Phaser = PhaserNS.default ?? PhaserNS

import { useGameStore } from "@/lib/store"
import { restaurantTables } from "@/data/mock"
import { drawPixelPerson, drawPlant } from "../pixelArt"

// Fixed design space; camera scales it to fit the canvas.
const DW = 760
const DH = 470

const FONT = '"Press Start 2P", monospace'

export default class RestaurantScene extends Phaser.Scene {
  constructor() {
    super("RestaurantScene")
  }

  init(data) {
    this.restaurant = data?.restaurant ?? useGameStore.getState().selectedRestaurant
  }

  create() {
    this.cameras.main.setBackgroundColor("#2a1f18")

    this.buildRoom()
    this.buildWindows()
    this.buildMenuBoard()
    this.buildCounter()
    this.buildTables()
    this.buildInventoryCabinet(690, 300)
    this.buildRoamers()

    this.fitCamera()
    this.scale.on("resize", this.fitCamera, this)
    this.events.once("shutdown", () => this.scale.off("resize", this.fitCamera, this))
  }

  buildRoom() {
    // warm wall
    this.add.rectangle(0, 0, DW, 312, 0xf3c48c).setOrigin(0, 0)
    // upper wall trim
    this.add.rectangle(0, 300, DW, 12, 0xd99a5c).setOrigin(0, 0)
    // wood floor
    this.add.rectangle(0, 312, DW, DH - 312, 0xd9a066).setOrigin(0, 0)
    // floor tile grid
    const g = this.add.graphics()
    g.lineStyle(2, 0xc98d54, 0.6)
    for (let x = 0; x <= DW; x += 48) {
      g.lineBetween(x, 312, x, DH)
    }
    for (let y = 324; y <= DH; y += 34) {
      g.lineBetween(0, y, DW, y)
    }
    // hanging pendant light
    this.add.rectangle(DW / 2, 0, 4, 42, 0x2c2c2c).setOrigin(0.5, 0)
    this.add.ellipse(DW / 2, 52, 46, 30, 0xf6b73c)
    this.add.ellipse(DW / 2, 50, 46, 26, 0xffd772)

    // ceiling shadow strip
    this.add.rectangle(0, 0, DW, 10, 0x000000, 0.12).setOrigin(0, 0)
  }

  buildWindows() {
    const drawWindow = (cx, w) => {
      const h = 150
      const top = 40
      // frame
      this.add.rectangle(cx, top, w + 12, h + 12, 0x6b4a2e).setOrigin(0.5, 0)
      // sky
      this.add.rectangle(cx, top + 6, w, h, 0xbfe6f5).setOrigin(0.5, 0)
      // clouds
      this.add.ellipse(cx - w * 0.2, top + 34, 34, 16, 0xffffff, 0.9)
      this.add.ellipse(cx + w * 0.18, top + 58, 40, 18, 0xffffff, 0.85)
      // city silhouette across the bottom of the window
      const sg = this.add.graphics()
      const baseY = top + h - 4
      const cols = [0xa9cbb0, 0xc7b79a, 0xb0c3d0]
      let bx = cx - w / 2 + 6
      let i = 0
      while (bx < cx + w / 2 - 6) {
        const bw = 18 + (i % 3) * 6
        const bh = 30 + ((i * 13) % 45)
        sg.fillStyle(cols[i % cols.length], 1)
        sg.fillRect(bx, baseY - bh, bw, bh)
        sg.fillStyle(0xffe9a8, 0.8)
        sg.fillRect(bx + 3, baseY - bh + 6, 3, 3)
        sg.fillRect(bx + 9, baseY - bh + 6, 3, 3)
        bx += bw + 4
        i++
      }
      // mullions
      this.add.rectangle(cx, top + 6, 4, h, 0x6b4a2e).setOrigin(0.5, 0)
      this.add.rectangle(cx, top + h / 2, w, 4, 0x6b4a2e).setOrigin(0.5, 0.5)
    }
    drawWindow(300, 220)
    drawWindow(540, 150)

    // hanging plants by the windows
    const p1 = drawPlant(this, 120, 150, 1)
    p1.setScale(1.1)
    this.add.rectangle(120, 40, 3, 100, 0x5c4326).setOrigin(0.5, 0)
    const p2 = drawPlant(this, 648, 140, 1)
    this.add.rectangle(648, 40, 3, 90, 0x5c4326).setOrigin(0.5, 0)
  }

  buildMenuBoard() {
    const bx = 120
    const by = 200
    const w = 150
    const h = 96
    this.add.rectangle(bx, by, w + 10, h + 10, 0x5a3d24).setOrigin(0.5, 0)
    this.add.rectangle(bx, by + 5, w, h, 0x1e2a24).setOrigin(0.5, 0)

    const name = (this.restaurant?.name ?? "COFFEE").toUpperCase()
    this.add
      .text(bx, by + 14, name.slice(0, 14), {
        fontFamily: FONT,
        fontSize: "8px",
        color: "#f6b73c",
      })
      .setOrigin(0.5, 0)

    const lines = ["Espresso   3", "Latte      4", "Surplus Box 2", "Cookie     1"]
    lines.forEach((line, i) => {
      this.add
        .text(bx - w / 2 + 12, by + 34 + i * 14, line, {
          fontFamily: FONT,
          fontSize: "7px",
          color: "#eae4d3",
        })
        .setOrigin(0, 0)
    })
  }

  buildCounter() {
    const cx = 430
    const topY = 250
    const w = 300
    // counter top
    this.add.rectangle(cx, topY, w, 16, 0x8b5a2b).setOrigin(0.5, 0)
    this.add.rectangle(cx, topY, w, 4, 0xa9713a).setOrigin(0.5, 0)
    // counter front + seams
    this.add.rectangle(cx, topY + 16, w, 60, 0x6f4622).setOrigin(0.5, 0)
    const sg = this.add.graphics()
    sg.lineStyle(2, 0x5a3819, 1)
    for (let x = cx - w / 2 + 40; x < cx + w / 2; x += 40) {
      sg.lineBetween(x, topY + 16, x, topY + 76)
    }

    // espresso machine
    const mx = cx - 90
    this.add.rectangle(mx, topY - 2, 54, 34, 0xd7dbe0).setOrigin(0.5, 1)
    this.add.rectangle(mx, topY - 36, 54, 10, 0xb9c0c8).setOrigin(0.5, 1)
    this.add.rectangle(mx, topY - 18, 12, 8, 0xe23b3b).setOrigin(0.5, 1) // red badge
    this.add.rectangle(mx - 16, topY - 4, 6, 10, 0x8a9098).setOrigin(0.5, 1) // portafilter
    this.add.rectangle(mx + 16, topY - 4, 6, 10, 0x8a9098).setOrigin(0.5, 1)
    // steam
    const steam = this.add.ellipse(mx, topY - 44, 8, 12, 0xffffff, 0.5)
    this.tweens.add({
      targets: steam,
      y: topY - 60,
      alpha: 0,
      duration: 1400,
      repeat: -1,
      yoyo: false,
      onRepeat: () => {
        steam.y = topY - 44
        steam.alpha = 0.5
      },
    })

    // cash register
    this.add.rectangle(cx + 96, topY - 2, 34, 26, 0x3a4a5a).setOrigin(0.5, 1)
    this.add.rectangle(cx + 96, topY - 22, 26, 10, 0x51677d).setOrigin(0.5, 1)

    // stacked cups
    for (let i = 0; i < 3; i++) {
      this.add.rectangle(cx + 30 + i * 12, topY - 2, 8, 12, 0xf4f1ea).setOrigin(0.5, 1)
    }

    // barista behind the counter
    const barista = drawPixelPerson(
      this,
      cx - 10,
      topY - 4,
      { shirt: 0x2d6a4f, hair: 0x241a12, pants: 0x1f2d3a },
      1.05,
    )
    barista.setDepth(1)

    // ORDER sign hanging above the counter
    const orderSign = this.add
      .text(cx, topY - 92, "ORDER HERE", {
        fontFamily: FONT,
        fontSize: "9px",
        color: "#ffffff",
        backgroundColor: "#c0392b",
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true })
    orderSign.on("pointerup", () =>
      useGameStore.getState().openOrderMenu("customer"),
    )

    // a customer standing at the counter
    drawPixelPerson(
      this,
      cx - 70,
      topY + 92,
      { shirt: 0xe67e22, hair: 0x2a2a2a, pants: 0x34495e },
      1.05,
    ).setDepth(6)
  }

  buildTables() {
    const spots = [
      { x: 150, y: 380 },
      { x: 320, y: 420 },
      { x: 600, y: 400 },
    ]
    const palettes = [
      { shirt: 0x5b8def, hair: 0x3a2a1a },
      { shirt: 0xe85d4c, hair: 0x1c1c1c },
      { shirt: 0xf0b429, hair: 0x4a2f16 },
      { shirt: 0x9b59b6, hair: 0x241a12 },
    ]
    spots.forEach((s, i) => {
      const occupied = restaurantTables[i]?.occupied ?? true
      // table
      this.add.ellipse(s.x, s.y + 20, 60, 20, 0x00000022)
      this.add.rectangle(s.x, s.y + 18, 8, 20, 0x8b5a2b).setOrigin(0.5, 0)
      this.add.ellipse(s.x, s.y, 62, 26, 0xffffff)
      this.add.ellipse(s.x, s.y - 2, 56, 22, 0xe85d4c)
      // cups on the table
      this.add.rectangle(s.x - 12, s.y - 4, 9, 10, 0xffffff).setOrigin(0.5, 1)
      this.add.rectangle(s.x + 12, s.y - 4, 9, 10, 0xf4f1ea).setOrigin(0.5, 1)
      if (occupied) {
        drawPixelPerson(this, s.x - 26, s.y + 2, palettes[i % palettes.length], 1).setDepth(
          s.y,
        )
        drawPixelPerson(
          this,
          s.x + 26,
          s.y,
          palettes[(i + 1) % palettes.length],
          1,
        ).setDepth(s.y)
      }
    })
  }

  buildInventoryCabinet(x, y) {
    const c = this.add.container(x, y)
    c.setDepth(500)

    const frame = this.add.rectangle(0, 0, 76, 128, 0x8a5a2f).setOrigin(0.5, 1)
    const inner = this.add.rectangle(0, -6, 60, 100, 0x3a2440).setOrigin(0.5, 1)

    // shelves of colorful goods (like the reference bookshelf)
    const goods = []
    const shelfYs = [-96, -70, -44]
    const palette = [0xe85d4c, 0x2a9d8f, 0xf0b429, 0x5b8def, 0x9b59b6, 0x4faf4a]
    shelfYs.forEach((sy, si) => {
      goods.push(this.add.rectangle(0, sy + 4, 60, 3, 0x5c3a1a).setOrigin(0.5, 1))
      for (let i = 0; i < 5; i++) {
        const bw = 6 + (i % 3) * 2
        const bh = 12 + ((i + si) % 3) * 4
        goods.push(
          this.add
            .rectangle(-24 + i * 11, sy, bw, bh, palette[(i + si) % palette.length])
            .setOrigin(0.5, 1),
        )
      }
    })

    // lower cabinet doors + knobs
    const seam = this.add.rectangle(0, -6, 2, 34, 0x5c3a1a).setOrigin(0.5, 1)
    const knobL = this.add.rectangle(-8, -20, 4, 5, 0xd4af37).setOrigin(0.5, 1)
    const knobR = this.add.rectangle(8, -20, 4, 5, 0xd4af37).setOrigin(0.5, 1)

    const label = this.add
      .text(0, -136, "INVENTORY", {
        fontFamily: FONT,
        fontSize: "7px",
        color: "#fff",
        backgroundColor: "#1a1f2ecc",
        padding: { x: 4, y: 3 },
      })
      .setOrigin(0.5)

    c.add([frame, inner, ...goods, seam, knobL, knobR, label])
    c.setSize(76, 128)
    c.setInteractive(
      new Phaser.Geom.Rectangle(-38, -128, 76, 128),
      Phaser.Geom.Rectangle.Contains,
    )
    c.on("pointerover", () => {
      this.input.setDefaultCursor("pointer")
      frame.setFillStyle(0xa06b3c)
    })
    c.on("pointerout", () => {
      this.input.setDefaultCursor("default")
      frame.setFillStyle(0x8a5a2f)
    })
    c.on("pointerup", () => useGameStore.getState().openInventory())
  }

  buildRoamers() {
    const roam = (startX, palette) => {
      const person = drawPixelPerson(this, startX, 360, palette, 1)
      person.setDepth(360)
      const go = (toX) => {
        if (!person.active) return
        this.tweens.add({
          targets: person,
          x: toX,
          duration: 3000 + Math.random() * 1200,
          ease: "Linear",
          onComplete: () => go(toX < DW / 2 ? DW - 120 : 120),
        })
      }
      go(DW - 120)
    }
    roam(140, { shirt: 0x4faf4a, hair: 0x2a2a2a })
  }

  fitCamera() {
    const cam = this.cameras.main
    const zw = this.scale.width / DW
    const zh = this.scale.height / DH
    cam.setZoom(Math.min(zw, zh) || 1)
    cam.centerOn(DW / 2, DH / 2)
  }
}

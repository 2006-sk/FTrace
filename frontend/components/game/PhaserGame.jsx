"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useGameStore } from "@/lib/store"

export default function PhaserGame() {
  const hostRef = useRef(null)
  const gameRef = useRef(null)
  const readyRef = useRef(false)
  const view = useGameStore((s) => s.view)
  const selectedRestaurant = useGameStore((s) => s.selectedRestaurant)

  useEffect(() => {
    let destroyed = false

    async function boot() {
      const Phaser = (await import("phaser")).default
      const CityScene = (await import("./scenes/CityScene")).default
      const RestaurantScene = (await import("./scenes/RestaurantScene")).default

      if (destroyed || !hostRef.current) return

      const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: hostRef.current,
        backgroundColor: "#7ec8e8",
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: hostRef.current.clientWidth || 800,
          height: hostRef.current.clientHeight || 600,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [CityScene, RestaurantScene],
        render: { pixelArt: true, antialias: false },
        audio: { noAudio: true },
      })

      game.events.once("ready", () => {
        readyRef.current = true
      })

      gameRef.current = game
    }

    boot()

    return () => {
      destroyed = true
      readyRef.current = false
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const game = gameRef.current
    const el = hostRef.current
    if (!game || !el) return

    let cancelled = false

    const switchView = () => {
      if (cancelled || !gameRef.current) return

      gsap.to(el, {
        opacity: 0,
        duration: 0.18,
        ease: "power1.in",
        onComplete: () => {
          if (cancelled || !gameRef.current) return
          if (view === "interior") {
            game.scene.stop("CityScene")
            game.scene.start("RestaurantScene", { restaurant: selectedRestaurant })
          } else {
            game.scene.stop("RestaurantScene")
            game.scene.start("CityScene")
          }
          gsap.to(el, { opacity: 1, duration: 0.32, ease: "power2.out" })
        },
      })
    }

    // First boot: CityScene auto-starts from scene list — skip fade
    if (!readyRef.current) {
      const id = setInterval(() => {
        if (game.scene.isActive("CityScene") || game.scene.isActive("RestaurantScene")) {
          clearInterval(id)
          readyRef.current = true
          if (view === "interior") switchView()
        }
      }, 40)
      return () => {
        cancelled = true
        clearInterval(id)
      }
    }

    switchView()
    return () => {
      cancelled = true
    }
  }, [view, selectedRestaurant])

  return <div ref={hostRef} className="h-full w-full [&_canvas]:block" />
}

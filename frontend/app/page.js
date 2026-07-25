"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"
import gsap from "gsap"
import { GameShell } from "@/components/ui/GameShell"
import { useGameStore } from "@/lib/store"

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#7ec8e8] font-[family-name:var(--font-pixel)] text-[10px] text-[#1a1f2e]">
      LOADING WORLD…
    </div>
  ),
})

export default function HomePage() {
  const shellRef = useRef(null)
  const view = useGameStore((s) => s.view)
  const hydrateBackend = useGameStore((s) => s.hydrateBackend)

  useEffect(() => {
    hydrateBackend()
  }, [hydrateBackend])

  useEffect(() => {
    if (!shellRef.current) return
    gsap.fromTo(
      shellRef.current,
      { opacity: 0.65, scale: 0.985 },
      { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" },
    )
  }, [view])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <div ref={shellRef} className="absolute inset-0">
        <PhaserGame />
      </div>
      <GameShell />
    </main>
  )
}

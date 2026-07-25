"use client"

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CharacterAvatar } from "@/components/ui/CharacterAvatar"
import { InventoryDialog } from "@/components/ui/InventoryDialog"
import { useGameStore } from "@/lib/store"

const logStyle = {
  deal: { label: "DEAL", className: "bg-[#e85d4c]/20 text-[#ffb4a8]" },
  predict: { label: "PRED", className: "bg-[#f0b429]/15 text-[#f0b429]" },
  call: { label: "CALL", className: "bg-[#22c55e]/15 text-[#4ade80]" },
  system: { label: "SYS", className: "bg-[#3b82f6]/15 text-[#93c5fd]" },
}

function DealCountdown({ endsAt }) {
  const [remaining, setRemaining] = useState("")

  useEffect(() => {
    function update() {
      const seconds = Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000))
      const minutes = Math.floor(seconds / 60)
      setRemaining(`${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [endsAt])

  return <span className="font-semibold tabular-nums text-[#f0b429]">{remaining}</span>
}

export function GameShell() {
  const view = useGameStore((s) => s.view)
  const restaurant = useGameStore((s) => s.selectedRestaurant)
  const backToCity = useGameStore((s) => s.backToCity)
  const openRestaurant = useGameStore((s) => s.openRestaurant)
  const restaurants = useGameStore((s) => s.restaurants)
  const customers = useGameStore((s) => s.customers)
  const selectedIds = useGameStore((s) => s.selectedCustomerIds)
  const toggleCustomer = useGameStore((s) => s.toggleCustomer)
  const callSelected = useGameStore((s) => s.callSelected)
  const callOne = useGameStore((s) => s.callOne)
  const callState = useGameStore((s) => s.callState)
  const dismissCall = useGameStore((s) => s.dismissCall)
  const tickCall = useGameStore((s) => s.tickCall)
  const logs = useGameStore((s) => s.dealLogs)
  const offerSlots = useGameStore((s) => s.offerSlots)
  const surplusItems = useGameStore((s) => s.surplusItems)
  const backendStatus = useGameStore((s) => s.backendStatus)
  const backendError = useGameStore((s) => s.backendError)
  const memoryProcedures = useGameStore((s) => s.memoryProcedures)
  const dealRecommendation = useGameStore((s) => s.dealRecommendation)
  const bannerRef = useRef(null)

  useEffect(() => {
    if (!callState || (callState.progress ?? 0) >= 100) return undefined
    const id = setInterval(() => tickCall(), 3000)
    return () => clearInterval(id)
  }, [callState, tickCall])

  useEffect(() => {
    if (!bannerRef.current || view !== "interior") return
    gsap.fromTo(
      bannerRef.current,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
    )
  }, [view, restaurant?.id])

  const active = offerSlots.find((s) => s.active)
  const callActive = callState && (callState.progress ?? 0) < 100
  const statusColor =
    backendStatus === "live"
      ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#4ade80]"
      : backendStatus === "offline"
        ? "border-[#e85d4c]/40 bg-[#e85d4c]/15 text-[#ffb4a8]"
        : "border-[#f0b429]/40 bg-[#f0b429]/15 text-[#f0b429]"

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Top bar */}
      <header className="pointer-events-auto absolute left-0 right-0 top-0 flex items-center justify-between gap-4 border-b border-white/10 bg-[#1a1f2e]/90 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          {view === "interior" && (
            <Button variant="secondary" size="sm" onClick={backToCity}>
              ← City
            </Button>
          )}
          <div>
            <p className="font-[family-name:var(--font-pixel)] text-[10px] text-[#f0b429] md:text-xs">
              SURPLUS CITY
            </p>
            <p className="text-sm text-white/70">
              {view === "city"
                ? "Pick a restaurant to manage surplus deals"
                : restaurant?.name ?? "Restaurant"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {restaurant && view === "interior" && (
            <div className="hidden text-right sm:block">
              <p className="text-xs uppercase tracking-wide text-white/45">Today</p>
              <p className="font-semibold tabular-nums">
                ${restaurant.revenue.toLocaleString()}
              </p>
            </div>
          )}
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColor}`}
            title={backendError ?? `XTrace procedures: ${memoryProcedures.length}`}
          >
            API · {backendStatus.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Right: game log */}
      <Card className="pixel-frame pointer-events-auto absolute bottom-6 right-5 top-[4.5rem] flex w-[min(300px,calc(100%-2rem))] flex-col overflow-hidden md:right-6 md:top-24">
        <CardHeader className="border-b-2 border-[#0c1020] bg-[#0f1428]">
          <p className="pixel text-[9px] text-[#f0b429]">LIVE LOG</p>
          <CardTitle className="pixel mt-1.5 text-[11px]">Recovery events</CardTitle>
          <CardDescription className="mt-1 text-[#8fa0c8]">
            Deals, Vapi calls, and XTrace memory
          </CardDescription>
        </CardHeader>
        <ScrollArea className="flex-1">
          <CardContent className="space-y-2 p-3">
            {logs.map((log) => {
              const style = logStyle[log.type] ?? logStyle.system
              return (
                <article key={log.id} className="pixel-cell px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={`pixel px-1.5 py-1 text-[8px] ${style.className}`}>
                      {style.label}
                    </span>
                    <time className="text-[10px] tabular-nums text-white/40">{log.time}</time>
                  </div>
                  <h3 className="text-sm font-medium leading-snug">{log.title}</h3>
                  <p className="mt-0.5 text-xs text-white/55">{log.detail}</p>
                  <p className="mt-1 truncate text-[10px] text-white/35">{log.restaurant}</p>
                </article>
              )
            })}
          </CardContent>
        </ScrollArea>
      </Card>

      {/* City hint */}
      {view === "city" && (
        <Card className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(640px,calc(100%-22rem))] min-w-[min(100%-2rem,280px)] -translate-x-1/2 p-4 md:p-5">
          <p className="font-[family-name:var(--font-pixel)] text-[9px] text-[#f0b429]">
            CITY VIEW · PHASER
          </p>
          <h2 className="mt-1 text-lg font-semibold">Click a restaurant to step inside</h2>
          <p className="mt-1 text-sm text-white/55">
            Drag to pan. Maps are Tiled-compatible — edit in Tiled later.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {restaurants.map((r) => (
              <Button key={r.id} variant="secondary" size="sm" onClick={() => openRestaurant(r)}>
                {r.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Left: food recovery receivers */}
      {view === "interior" && (
        <Card className="pixel-frame pointer-events-auto absolute bottom-6 left-5 top-[4.5rem] flex w-[min(320px,calc(100%-2rem))] flex-col overflow-hidden md:left-6 md:top-24">
          <CardHeader className="border-b-2 border-[#0c1020] bg-[#0f1428]">
            <p className="pixel text-[9px] text-[#f0b429]">RECOVERY NETWORK</p>
            <CardTitle className="pixel mt-1.5 text-[11px]">Receiver list</CardTitle>
            <CardDescription className="mt-1 text-[#8fa0c8]">
              Live shelters and partners · Vapi + XTrace
            </CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="space-y-2 p-3">
              {customers.length === 0 && (
                <div className="pixel-cell px-3 py-4 text-xs text-white/55">
                  {backendStatus === "connecting"
                    ? "Loading receivers…"
                    : "No active receivers are configured."}
                </div>
              )}
              {customers.map((c) => {
                const selected = selectedIds.includes(c.id)
                const calling = callState?.customerId === c.id
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 px-2.5 py-2 ${
                      selected ? "pixel-cell--active" : "pixel-cell"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCustomer(c.id)}
                      disabled={!c.reachable}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-40"
                    >
                      <CharacterAvatar name={c.name} color={c.avatar} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-white/45">
                          {c.lastOrder} · {c.phone}
                        </span>
                      </span>
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="pixel-btn bg-[#2a3556] text-white"
                      disabled={!c.reachable || calling || callActive}
                      onClick={() => callOne(c)}
                    >
                      {calling ? "…" : "CALL"}
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </ScrollArea>
          <div className="border-t-2 border-[#0c1020] bg-[#0f1428] p-3">
            <Button
              className="pixel-btn w-full py-3"
              disabled={selectedIds.length === 0 || callActive}
              onClick={callSelected}
            >
              {callActive && callState?.bulk
                ? "DIALING…"
                : `CALL SELECTED (${selectedIds.length})`}
            </Button>
          </div>
        </Card>
      )}

      {/* Offer banner */}
      {view === "interior" && (
        <div
          ref={bannerRef}
          className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(640px,calc(100%-40rem))] min-w-[min(100%-2rem,280px)] -translate-x-1/2"
        >
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 p-4 md:p-5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#e85d4c] px-2 py-0.5 font-[family-name:var(--font-pixel)] text-[8px]">
                    LIVE DEAL
                  </span>
                  <span className="text-xs text-white/50">
                    {dealRecommendation
                      ? "Lapsed guests · 30–90 days"
                      : active?.window}
                  </span>
                  {dealRecommendation?.endsAt && (
                    <span className="ml-auto text-xs text-white/55">
                      Ends in <DealCountdown endsAt={dealRecommendation.endsAt} />
                    </span>
                  )}
                </div>
                <h3 className="truncate text-lg font-semibold">
                  {dealRecommendation?.action === "create_deal"
                    ? `Chicken biryani · ${dealRecommendation.sellQuantity + dealRecommendation.donateQuantity} meals`
                    : active?.label}
                </h3>
                <p className="mt-0.5 text-sm text-white/65">
                  {dealRecommendation
                    ? `$${(dealRecommendation.originalPriceCents / 100).toFixed(2)} → $${(dealRecommendation.dealPriceCents / 100).toFixed(2)} · ${dealRecommendation.discountPercent}% intelligent deal`
                    : active?.deal}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#f0b429]/30 bg-[#f0b429]/10 px-3 py-2">
                  <p className="pixel text-[8px] text-[#f0b429]">SELL NOW</p>
                  <p className="mt-1 text-sm font-semibold">
                    {dealRecommendation?.sellQuantity ?? surplusItems[0]?.qty} meals
                  </p>
                  <p className="text-[10px] text-white/45">Timed deal allocation</p>
                </div>
                <div className="rounded-lg border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
                  <p className="pixel text-[8px] text-[#4ade80]">DONATE NEXT</p>
                  <p className="mt-1 text-sm font-semibold">
                    {dealRecommendation?.donateQuantity ?? 0} meals
                  </p>
                  <p className="text-[10px] text-white/45">Unsold units roll over</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Call toast */}
      {callState && (
        <Card className="pointer-events-auto absolute right-4 top-20 z-30 w-[min(340px,calc(100%-2rem))] border-[#22c55e]/30 bg-[#14301f]/95 p-4 md:right-[340px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#4ade80]">
                Vapi · live outbound
              </p>
              <p className="mt-1 text-sm font-medium">{callState.message}</p>
              <p className="mt-1 text-xs text-white/50">{callState.detail}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={dismissCall}>
              ✕
            </Button>
          </div>
          {callState.progress != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#4ade80] transition-all"
                style={{ width: `${callState.progress}%` }}
              />
            </div>
          )}
        </Card>
      )}

      <InventoryDialog />
    </div>
  )
}

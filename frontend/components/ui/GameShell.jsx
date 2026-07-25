"use client"

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InventoryDialog } from "@/components/ui/InventoryDialog"
import { OrderDialog } from "@/components/ui/OrderDialog"
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
  const orderState = useGameStore((s) => s.orderState)
  const openOrderMenu = useGameStore((s) => s.openOrderMenu)
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
  const dealTotal =
    (dealRecommendation?.sellQuantity ?? 0) +
    (dealRecommendation?.donateQuantity ?? 0)
  const sellPercent =
    dealTotal > 0
      ? Math.round((dealRecommendation.sellQuantity / dealTotal) * 100)
      : 0
  const profile = restaurant?.dealProfile
  const savedDollars =
    (profile?.savedDollars ?? 0) +
    Math.round(
      (dealRecommendation?.orderedQuantity ?? 0) *
        (dealRecommendation?.dealPriceCents ?? 0) /
        100,
    )
  const mealsSaved =
    (profile?.mealsSaved ?? 0) + (dealRecommendation?.orderedQuantity ?? 0)
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
              FTRACE
            </p>
            <p className="text-sm text-white/70">
              {view === "city"
                ? "Pick a restaurant to manage surplus deals"
                : restaurant?.name ?? "Restaurant"}
            </p>
          </div>
          {view === "interior" && (
            <Button
              size="sm"
              className="pixel-btn ml-2 px-3 py-2 text-[9px]"
              disabled={customers.length === 0 || callActive}
              onClick={() => customers[0] && callOne(customers[0])}
              data-testid="header-call-button"
            >
              {callActive ? "CALLING…" : "CALL"}
            </Button>
          )}
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

      {/* Center: live business impact */}
      {view === "interior" && (
        <section className="pointer-events-auto absolute left-1/2 top-24 grid w-[min(820px,calc(100%-24rem))] min-w-[min(100%-2rem,280px)] -translate-x-1/2 grid-cols-3 gap-2">
          <Card className="px-3 py-2">
            <p className="pixel text-[7px] text-[#4ade80]">SURPLUS SAVED</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              ${savedDollars.toLocaleString()}
            </p>
          </Card>
          <Card className="px-3 py-2">
            <p className="pixel text-[7px] text-[#93c5fd]">MEALS RESCUED</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{mealsSaved}</p>
          </Card>
          <Card className="min-w-0 px-3 py-2">
            <p className="pixel text-[7px] text-[#f0b429]">CURRENT OFFER</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {dealRecommendation?.discountPercent ?? 0}% ·{" "}
              {dealRecommendation?.itemName ?? "Calculating…"}
            </p>
          </Card>
        </section>
      )}

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

      {/* Offer banner */}
      {view === "interior" && (
        <div
          ref={bannerRef}
          className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(820px,calc(100%-24rem))] min-w-[min(100%-2rem,280px)] -translate-x-1/2"
        >
          <Card className="overflow-hidden" data-testid="deal-card">
            <div className="flex flex-col gap-2 p-3 md:p-3.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#e85d4c] px-2 py-0.5 font-[family-name:var(--font-pixel)] text-[8px]">
                    FTRACE DEAL ENGINE
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
                <div className="flex items-end justify-between gap-3">
                  <h3 className="truncate text-base font-semibold" data-testid="deal-title">
                  {dealRecommendation
                    ? `${dealRecommendation.itemName} · ${dealRecommendation.sellQuantity + dealRecommendation.donateQuantity} meals`
                    : active?.label}
                  </h3>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      className="pixel-btn px-2 py-1 text-[8px]"
                      disabled={!dealRecommendation || orderState?.loading}
                      onClick={() => openOrderMenu("customer")}
                    >
                      START ORDER
                    </Button>
                    {restaurant?.id === "noodle" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="pixel-btn px-2 py-1 text-[8px]"
                        disabled={!dealRecommendation || orderState?.loading}
                        onClick={() => openOrderMenu("demo")}
                      >
                        DEMO ORDERS
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-white/65">
                    {dealRecommendation
                      ? `$${(dealRecommendation.originalPriceCents / 100).toFixed(2)} → $${(dealRecommendation.dealPriceCents / 100).toFixed(2)} · ${dealRecommendation.discountPercent}% intelligent deal`
                      : active?.deal}
                  </p>
                  {orderState?.message && (
                    <p
                      className={`text-[10px] ${orderState.error ? "text-[#ffb4a8]" : "text-[#4ade80]"}`}
                      data-testid="order-status"
                    >
                      {orderState.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#f0b429]/30 bg-[#f0b429]/10 px-3 py-1.5">
                  <p className="pixel text-[8px] text-[#f0b429]">SELL NOW</p>
                  <p className="mt-0.5 text-sm font-semibold" data-testid="sell-quantity">
                    {dealRecommendation?.sellQuantity ?? surplusItems[0]?.qty} meals
                  </p>
                  <p className="text-[10px] text-white/45">Timed deal allocation</p>
                </div>
                <div className="rounded-lg border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-1.5">
                  <p className="pixel text-[8px] text-[#4ade80]">DONATE NEXT</p>
                  <p className="mt-0.5 text-sm font-semibold" data-testid="donate-quantity">
                    {dealRecommendation?.donateQuantity ?? 0} meals
                  </p>
                  <p className="text-[10px] text-white/45">Unsold units roll over</p>
                </div>
              </div>
              <div
                className="flex h-2 overflow-hidden rounded-full bg-white/10"
                aria-label={`${sellPercent}% sell allocation`}
                data-testid="deal-allocation-bar"
              >
                <span
                  className="h-full bg-[#f0b429] transition-[width] duration-500"
                  style={{ width: `${sellPercent}%` }}
                />
                <span className="h-full flex-1 bg-[#4ade80] transition-[width] duration-500" />
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
      <OrderDialog />
    </div>
  )
}

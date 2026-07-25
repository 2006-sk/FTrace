"use client"

import { useEffect, useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/lib/store"

function buildCart(menu, mode, preset) {
  return Object.fromEntries(
    menu.map((item) => [
      item.recipeId,
      mode === "demo" ? preset?.[item.recipeId] ?? 0 : 0,
    ]),
  )
}

export function OrderDialog() {
  const open = useGameStore((state) => state.orderOpen)
  const mode = useGameStore((state) => state.orderMode)
  const close = useGameStore((state) => state.closeOrderMenu)
  const submitOrders = useGameStore((state) => state.submitOrders)
  const restaurant = useGameStore((state) => state.selectedRestaurant)
  const recipes = useGameStore((state) => state.recipes)
  const orderState = useGameStore((state) => state.orderState)
  const menu = useMemo(
    () => restaurant?.dealProfile?.menu ?? [],
    [restaurant],
  )
  const [cart, setCart] = useState({})

  useEffect(() => {
    if (!open) return
    setCart(
      buildCart(
        menu,
        mode,
        restaurant?.dealProfile?.demoPreset,
      ),
    )
  }, [open, menu, mode, restaurant])

  const totalItems = Object.values(cart).reduce(
    (total, quantity) => total + quantity,
    0,
  )
  const totalCents = menu.reduce(
    (total, item) => total + (cart[item.recipeId] ?? 0) * item.priceCents,
    0,
  )

  function change(recipeId, delta) {
    setCart((current) => ({
      ...current,
      [recipeId]: Math.max(0, Math.min(20, (current[recipeId] ?? 0) + delta)),
    }))
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !orderState?.loading) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
        <Dialog.Content
          className="pixel-frame fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[#12182b]"
          data-testid="order-menu"
        >
          <div className="flex items-start justify-between border-b-2 border-[#0c1020] bg-[#0f1428] px-5 py-4">
            <div>
              <p className="pixel text-[9px] text-[#f0b429]">
                {mode === "demo" ? "DEMO ORDER RUN" : "START ORDER"}
              </p>
              <Dialog.Title className="pixel mt-2 text-[13px]">
                {restaurant?.name} menu
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-white/50">
                Orders deduct recipe ingredients and recalculate the live deal.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="pixel-btn bg-[#c0392b] px-2 py-1 text-white"
                disabled={orderState?.loading}
                aria-label="Close order menu"
              >
                X
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3 p-4">
            {menu.map((item) => {
              const recipe = recipes.find(
                (candidate) => candidate.id === item.recipeId,
              )
              const quantity = cart[item.recipeId] ?? 0
              return (
                <article
                  key={item.recipeId}
                  className="pixel-cell flex items-center gap-3 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-0.5 text-xs text-[#f0b429]">
                      ${(item.priceCents / 100).toFixed(2)}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-white/40">
                      {recipe?.ingredients
                        ?.map((ingredient) => ingredient.name)
                        .join(" · ") ?? "Recipe loading…"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Remove one ${item.name}`}
                      disabled={quantity === 0 || orderState?.loading}
                      onClick={() => change(item.recipeId, -1)}
                    >
                      −
                    </Button>
                    <span
                      className="w-7 text-center font-semibold tabular-nums"
                      data-testid={`quantity-${item.recipeId}`}
                    >
                      {quantity}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Add one ${item.name}`}
                      disabled={orderState?.loading}
                      onClick={() => change(item.recipeId, 1)}
                    >
                      +
                    </Button>
                  </div>
                </article>
              )
            })}

            {restaurant?.id === "broccoli" && (
              <p className="rounded border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2 text-xs text-[#86efac]">
                Demo rule: the first submitted order automatically starts the
                Vapi recovery call.
              </p>
            )}

            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <div>
                <p className="text-xs text-white/45">{totalItems} items</p>
                <p className="font-semibold">${(totalCents / 100).toFixed(2)}</p>
              </div>
              <Button
                className="pixel-btn"
                disabled={totalItems === 0 || orderState?.loading}
                onClick={() => submitOrders(cart, mode)}
              >
                {orderState?.loading
                  ? "UPDATING…"
                  : mode === "demo"
                    ? "RUN DEMO BATCH"
                    : "PLACE ORDER"}
              </Button>
            </div>
            {orderState?.error && (
              <p className="text-xs text-[#ffb4a8]">{orderState.message}</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

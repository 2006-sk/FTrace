"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGameStore } from "@/lib/store"

const CATEGORY_COLORS = {
  Produce: "#4faf4a",
  Dry: "#f0b429",
  Prep: "#2a9d8f",
  Dairy: "#e9d8a6",
  Bakery: "#d98a3c",
  default: "#5b8def",
}

function riskColor(risk) {
  if (risk > 0.65) return "#e85d4c"
  if (risk > 0.4) return "#f0b429"
  return "#4ade80"
}

export function InventoryDialog() {
  const open = useGameStore((s) => s.inventoryOpen)
  const close = useGameStore((s) => s.closeInventory)
  const items = useGameStore((s) => s.inventory)
  const restaurant = useGameStore((s) => s.selectedRestaurant)

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="pixel-frame pixel-frame--wood fixed left-1/2 top-1/2 z-50 flex max-h-[min(560px,85vh)] w-[min(440px,calc(100%-2.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 bg-[#5a3a1e] px-5 py-4 shadow-[inset_0_-3px_0_#3a2412]">
            <div>
              <p className="pixel text-[9px] text-[#ffdd8a]">KITCHEN CABINET</p>
              <Dialog.Title className="pixel mt-2 text-[13px] text-white">
                Inventory
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#e8d5b5]">
                {restaurant?.name ?? "Restaurant"} · live backend stock
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="pixel-btn bg-[#c0392b] px-2 py-1 text-white"
                aria-label="Close"
              >
                X
              </button>
            </Dialog.Close>
          </div>

          <ScrollArea className="flex-1 bg-[#3a2412] p-4">
            <div className="space-y-4 pr-1">
              {items.map((item) => {
                const color = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.default
                return (
                  <div key={item.id} className="pixel-shelf">
                    <div className="pixel-cell--wood flex items-center gap-3 px-3 py-2.5">
                      <span
                        className="pixel-chip h-8 w-8 shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#f6ecd8]">
                          {item.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-[#c9a878]">
                          {item.category} · exp {item.expires}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="pixel-bar h-2 w-20 overflow-hidden">
                            <span
                              className="block h-full"
                              style={{
                                width: `${Math.round(item.risk * 100)}%`,
                                backgroundColor: riskColor(item.risk),
                              }}
                            />
                          </span>
                          <span
                            className="pixel text-[8px]"
                            style={{ color: riskColor(item.risk) }}
                          >
                            {Math.round(item.risk * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="pixel text-[11px] text-[#ffdd8a]">{item.qty}</p>
                        <p className="text-[10px] text-[#c9a878]">{item.unit}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

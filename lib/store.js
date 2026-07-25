"use client"

import { create } from "zustand"
import {
  restaurants,
  customers,
  dealLogs,
  inventory,
  offerSlots,
  surplusItems,
} from "@/data/mock"

function stamp() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export const useGameStore = create((set, get) => ({
  view: "city",
  restaurants,
  selectedRestaurant: null,
  customers,
  selectedCustomerIds: [],
  dealLogs,
  inventory,
  offerSlots,
  surplusItems,
  inventoryOpen: false,
  callState: null,
  phaserReady: false,

  setPhaserReady: (ready) => set({ phaserReady: ready }),

  openRestaurant: (restaurant) =>
    set({
      selectedRestaurant: restaurant,
      view: "interior",
      selectedCustomerIds: [],
      callState: null,
      inventoryOpen: false,
    }),

  backToCity: () =>
    set({
      view: "city",
      callState: null,
      inventoryOpen: false,
    }),

  toggleCustomer: (id) => {
    const prev = get().selectedCustomerIds
    set({
      selectedCustomerIds: prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id],
    })
  },

  openInventory: () => set({ inventoryOpen: true }),
  closeInventory: () => set({ inventoryOpen: false }),

  pushLog: (entry) =>
    set((state) => ({
      dealLogs: [
        { id: `log-${Date.now()}`, time: stamp(), ...entry },
        ...state.dealLogs,
      ],
    })),

  startCall: (payload) => set({ callState: { ...payload, progress: 8 } }),

  tickCall: () => {
    const prev = get().callState
    if (!prev || (prev.progress ?? 0) >= 100) return
    const next = Math.min(100, (prev.progress ?? 0) + 12)
    if (next >= 100) {
      set({
        callState: {
          ...prev,
          progress: 100,
          message: prev.bulk ? "Offer calls queued" : "Call connected (mock)",
          detail: prev.bulk
            ? "Ready to wire real Vapi outbound next."
            : "Customer heard the deal pitch (simulated).",
        },
      })
      return
    }
    set({ callState: { ...prev, progress: next } })
  },

  dismissCall: () => set({ callState: null }),

  callOne: (customer) => {
    const restaurant = get().selectedRestaurant
    get().startCall({
      customerId: customer.id,
      bulk: false,
      message: `Calling ${customer.name}…`,
      detail: `“Hey ${customer.name}, ${restaurant?.name ?? "we"} has a surplus deal live — interested?”`,
    })
    get().pushLog({
      type: "call",
      title: `Calling ${customer.name}`,
      detail: "Outbound Vapi offer pitch",
      restaurant: restaurant?.name ?? "Restaurant",
    })
  },

  callSelected: () => {
    const { customers: list, selectedCustomerIds, selectedRestaurant } = get()
    const names = list.filter((c) => selectedCustomerIds.includes(c.id)).map((c) => c.name)
    get().startCall({
      customerId: null,
      bulk: true,
      message: `Offer blast to ${names.length} regulars`,
      detail: `Vapi queue: ${names.join(", ")}`,
    })
    get().pushLog({
      type: "call",
      title: `Offer blast · ${names.length} regulars`,
      detail: names.join(", "),
      restaurant: selectedRestaurant?.name ?? "Restaurant",
    })
  },
}))

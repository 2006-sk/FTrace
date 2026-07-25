"use client"

import { create } from "zustand"
import {
  restaurants,
  dealLogs,
  inventory,
  offerSlots,
  surplusItems,
} from "@/data/mock"
import { apiRequest } from "@/lib/api"

function stamp() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

const AVATAR_COLORS = ["#5b8def", "#e85d4c", "#f0b429", "#2a9d8f", "#9b59b6"]

function receiverToCustomer(receiver, index) {
  return {
    ...receiver,
    avatar: AVATAR_COLORS[index % AVATAR_COLORS.length],
    visits: "Live",
    lastOrder: receiver.type,
    reachable: receiver.active,
  }
}

function ingredientToInventory(item) {
  const ratio = item.lowStockThreshold > 0
    ? item.lowStockThreshold / Math.max(item.stock, 0.01)
    : 0
  return {
    id: item.id,
    name: item.name,
    qty: item.stock,
    unit: item.unit,
    category: "Ingredient",
    risk: Math.min(1, item.lowStock ? 0.9 : Math.max(0.08, ratio * 0.45)),
    expires: item.lowStock ? "Low stock" : "In stock",
  }
}

function buildRecoveryPayload(restaurant) {
  const now = Date.now()
  return {
    restaurantId: restaurant?.id ?? "surplus-city",
    restaurantName: restaurant?.name ?? "Surplus City Kitchen",
    food: {
      description: "10 fresh chicken biryani meals",
      quantity: 10,
      unit: "meals",
      allergens: ["dairy"],
      preparedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      safeUntil: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
      temperatureF: 39,
    },
    pickup: {
      address: "123 Demo Market Street",
      readyAt: new Date(now).toISOString(),
      latestAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    },
  }
}

export const useGameStore = create((set, get) => ({
  view: "city",
  restaurants,
  selectedRestaurant: null,
  customers: [],
  selectedCustomerIds: [],
  dealLogs,
  inventory,
  offerSlots,
  surplusItems,
  recipes: [],
  memoryProcedures: [],
  dealRecommendation: null,
  backendStatus: "connecting",
  backendError: null,
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

  hydrateBackend: async () => {
    try {
      const [health, ingredients, recipes, receivers, memory, recommendation] =
        await Promise.all([
          apiRequest("/health"),
          apiRequest("/api/v1/ingredients"),
          apiRequest("/api/v1/recipes"),
          apiRequest("/api/v1/receivers"),
          apiRequest("/api/v1/memory/procedures"),
          apiRequest("/api/v1/deals/recommend", {
            method: "POST",
            body: JSON.stringify({
              inventoryCount: 20,
              hoursToExpiry: 4,
              demandLevel: "normal",
              memory: "similar_30_percent_sold_out",
              originalPriceCents: 1499,
              targetSegment: "lapsed_guests_30_90_days",
            }),
          }),
        ])
      const mappedReceivers = receivers.items.map(receiverToCustomer)
      set({
        backendStatus:
          health.status === "ok" && health.xtraceConfigured ? "live" : "degraded",
        backendError: null,
        inventory: ingredients.items.map(ingredientToInventory),
        recipes: recipes.items,
        customers: mappedReceivers,
        selectedCustomerIds: get().selectedCustomerIds.filter((id) =>
          mappedReceivers.some((receiver) => receiver.id === id),
        ),
        memoryProcedures: memory.procedures ?? [],
        dealRecommendation: recommendation,
      })
      get().pushLog({
        type: "system",
        title: "Backend connected",
        detail: `${ingredients.items.length} ingredients · ${recipes.items.length} recipes · ${memory.procedures?.length ?? 0} XTrace procedures`,
        restaurant: "Live API",
      })
    } catch (error) {
      set({ backendStatus: "offline", backendError: error.message })
      get().pushLog({
        type: "system",
        title: "Backend unavailable",
        detail: error.message,
        restaurant: "Check API server",
      })
    }
  },

  startCall: (payload) => set({ callState: { ...payload, progress: 12 } }),

  tickCall: async () => {
    const prev = get().callState
    if (!prev?.recoveryCaseId || prev.polling || (prev.progress ?? 0) >= 100) return
    set({ callState: { ...prev, polling: true } })
    try {
      const recovery = await apiRequest(
        `/api/v1/recovery-cases/${prev.recoveryCaseId}`,
      )
      const attempt = recovery.attempts?.find((item) =>
        ["calling", "accepted", "declined", "failed"].includes(item.status),
      )
      const terminal = ["accepted", "exhausted", "failed"].includes(recovery.status)
      const message = recovery.status === "accepted"
        ? `${attempt?.receiver?.name ?? "Receiver"} accepted the pickup`
        : recovery.status === "exhausted"
          ? "Receiver list exhausted"
          : recovery.status === "failed"
            ? "Recovery call failed"
            : `Calling ${attempt?.receiver?.name ?? "selected receiver"}…`
      set({
        callState: {
          ...prev,
          polling: false,
          progress: terminal ? 100 : 55,
          message,
          detail: attempt?.summary ?? `Recovery status: ${recovery.status}`,
        },
      })
      if (terminal && !prev.loggedTerminal) {
        get().pushLog({
          type: "call",
          title: message,
          detail: attempt?.summary ?? `Recovery ${recovery.status}`,
          restaurant: recovery.restaurantName,
        })
        set((state) => ({
          callState: { ...state.callState, loggedTerminal: true },
        }))
      }
    } catch (error) {
      set({
        callState: {
          ...prev,
          polling: false,
          progress: 100,
          message: "Could not refresh the call",
          detail: error.message,
        },
      })
    }
  },

  dismissCall: () => set({ callState: null }),

  beginRecovery: async (receivers, bulk) => {
    const restaurant = get().selectedRestaurant
    get().startCall({
      customerId: bulk ? null : receivers[0]?.id,
      bulk,
      message: `Preparing ${receivers.length === 1 ? receivers[0].name : `${receivers.length} receivers`}…`,
      detail: "Creating a live food recovery case",
    })
    try {
      const recovery = await apiRequest("/api/v1/recovery-cases", {
        method: "POST",
        body: JSON.stringify(buildRecoveryPayload(restaurant)),
      })
      const started = await apiRequest(
        `/api/v1/recovery-cases/${recovery.id}/start`,
        {
          method: "POST",
          body: JSON.stringify({ receiverIds: receivers.map((item) => item.id) }),
        },
      )
      set({
        callState: {
          customerId: bulk ? null : receivers[0]?.id,
          bulk,
          recoveryCaseId: recovery.id,
          providerCallId: started.providerCallId,
          progress: 35,
          message: `Calling ${receivers[0]?.name ?? "receiver"}…`,
          detail: "Live Vapi food recovery call",
        },
      })
      get().pushLog({
        type: "call",
        title: `Vapi recovery started`,
        detail: `${receivers.length} receiver${receivers.length === 1 ? "" : "s"} queued`,
        restaurant: restaurant?.name ?? "Restaurant",
      })
    } catch (error) {
      set({
        callState: {
          customerId: bulk ? null : receivers[0]?.id,
          bulk,
          progress: 100,
          message: "Call could not start",
          detail: error.message,
        },
      })
    }
  },

  callOne: (customer) => get().beginRecovery([customer], false),

  callSelected: () => {
    const { customers: list, selectedCustomerIds, selectedRestaurant } = get()
    const selected = list.filter((c) => selectedCustomerIds.includes(c.id))
    if (selected.length === 0) return
    void selectedRestaurant
    return get().beginRecovery(selected, true)
  },
}))

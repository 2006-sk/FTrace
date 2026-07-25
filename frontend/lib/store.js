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

function buildRecoveryPayload(restaurant, deal) {
  const now = Date.now()
  const quantity = Math.max(1, deal?.donateQuantity ?? 10)
  return {
    restaurantId: restaurant?.id ?? "surplus-city",
    restaurantName: restaurant?.name ?? "XTrace Kitchen",
    food: {
      description: `${quantity} fresh ${deal?.itemName ?? "surplus"} meals`,
      quantity,
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
  restaurantOrders: {},
  orderState: null,
  orderOpen: false,
  orderMode: "customer",
  autoCallTriggeredByRestaurant: {},
  backendStatus: "connecting",
  backendError: null,
  inventoryOpen: false,
  callState: null,
  phaserReady: false,

  setPhaserReady: (ready) => set({ phaserReady: ready }),

  openRestaurant: (restaurant) => {
    set({
      selectedRestaurant: restaurant,
      view: "interior",
      selectedCustomerIds: [],
      callState: null,
      inventoryOpen: false,
      orderOpen: false,
      dealRecommendation: null,
      orderState: null,
    })
    get().recalculateDeal(restaurant)
  },

  backToCity: () =>
    set({
      view: "city",
      callState: null,
      inventoryOpen: false,
      orderOpen: false,
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
  openOrderMenu: (mode = "customer") =>
    set({ orderOpen: true, orderMode: mode, orderState: null }),
  closeOrderMenu: () => set({ orderOpen: false }),

  pushLog: (entry) =>
    set((state) => ({
      dealLogs: [
        { id: `log-${Date.now()}`, time: stamp(), ...entry },
        ...state.dealLogs,
      ],
    })),

  hydrateBackend: async () => {
    try {
      const [health, ingredients, recipes, receivers, memory] =
        await Promise.all([
          apiRequest("/health"),
          apiRequest("/api/v1/ingredients"),
          apiRequest("/api/v1/recipes"),
          apiRequest("/api/v1/receivers"),
          apiRequest("/api/v1/memory/procedures"),
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

  recalculateDeal: async (restaurant = get().selectedRestaurant, orderedOverride) => {
    if (!restaurant?.dealProfile) return
    const profile = restaurant.dealProfile
    const ordered =
      orderedOverride ?? get().restaurantOrders[restaurant.id] ?? 0
    const inventoryCount = Math.max(0, profile.inventoryCount - ordered)
    try {
      const recommendation = await apiRequest("/api/v1/deals/recommend", {
        method: "POST",
        body: JSON.stringify({
          inventoryCount,
          hoursToExpiry: profile.hoursToExpiry,
          demandLevel: profile.demandLevel,
          memory: "similar_30_percent_sold_out",
          originalPriceCents: profile.originalPriceCents,
          targetSegment: "lapsed_guests_30_90_days",
        }),
      })
      if (get().selectedRestaurant?.id !== restaurant.id) return
      set({
        dealRecommendation: {
          ...recommendation,
          itemName: profile.itemName,
          recipeId: profile.recipeId,
          orderedQuantity: ordered,
        },
      })
    } catch (error) {
      set({ backendError: error.message })
    }
  },

  submitOrders: async (cart, mode = get().orderMode) => {
    const { selectedRestaurant: restaurant, dealRecommendation: deal } = get()
    const selections = Object.entries(cart ?? {})
      .map(([recipeId, quantity]) => ({
        recipeId,
        quantity: Number(quantity),
      }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0)
    if (
      !restaurant?.dealProfile ||
      !deal ||
      get().orderState?.loading ||
      selections.length === 0
    ) return
    const totalQuantity = selections.reduce(
      (total, item) => total + item.quantity,
      0,
    )
    set({
      orderState: {
        loading: true,
        message: `Preparing ${totalQuantity} item${totalQuantity === 1 ? "" : "s"}…`,
      },
    })
    try {
      const orders = []
      for (const selection of selections) {
        orders.push(
          await apiRequest("/api/v1/orders", {
            method: "POST",
            body: JSON.stringify(selection),
          }),
        )
      }
      const ingredients = await apiRequest("/api/v1/ingredients")
      const ordered =
        (get().restaurantOrders[restaurant.id] ?? 0) + totalQuantity
      set((state) => ({
        inventory: ingredients.items.map(ingredientToInventory),
        restaurantOrders: {
          ...state.restaurantOrders,
          [restaurant.id]: ordered,
        },
        orderState: {
          loading: false,
          message: `${totalQuantity} sold · stock and deal updated`,
          orderIds: orders.map((order) => order.id),
        },
        orderOpen: false,
      }))
      await get().recalculateDeal(restaurant, ordered)
      get().pushLog({
        type: "deal",
        title:
          mode === "demo"
            ? `Demo batch · ${totalQuantity} orders`
            : `${totalQuantity} menu item${totalQuantity === 1 ? "" : "s"} sold`,
        detail: "SQLite ingredients deducted · offer recalculated live",
        restaurant: restaurant.name,
      })

      const shouldAutoCall =
        restaurant.id === "broccoli" &&
        !get().autoCallTriggeredByRestaurant[restaurant.id]
      const receiver = get().customers[0]
      if (shouldAutoCall && receiver) {
        set((state) => ({
          autoCallTriggeredByRestaurant: {
            ...state.autoCallTriggeredByRestaurant,
            [restaurant.id]: true,
          },
        }))
        get().pushLog({
          type: "call",
          title: "First order triggered recovery",
          detail: `Calling ${receiver.name} through Vapi`,
          restaurant: restaurant.name,
        })
        void get().beginRecovery([receiver], false)
      }
    } catch (error) {
      set({
        orderState: {
          loading: false,
          message: error.message,
          error: true,
        },
      })
    }
  },

  simulateOrder: (quantity = 1) => {
    const recipeId = get().selectedRestaurant?.dealProfile?.recipeId
    if (!recipeId) return
    return get().submitOrders({ [recipeId]: quantity }, "demo")
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
    const deal = get().dealRecommendation
    get().startCall({
      customerId: bulk ? null : receivers[0]?.id,
      bulk,
      message: `Preparing ${receivers.length === 1 ? receivers[0].name : `${receivers.length} receivers`}…`,
      detail: "Creating a live food recovery case",
    })
    try {
      const recovery = await apiRequest("/api/v1/recovery-cases", {
        method: "POST",
        body: JSON.stringify(buildRecoveryPayload(restaurant, deal)),
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

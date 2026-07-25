const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "")

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ?? `Backend request failed (${response.status})`,
    )
    error.code = payload?.error?.code ?? "BACKEND_REQUEST_FAILED"
    throw error
  }
  return payload
}

export { API_BASE_URL }

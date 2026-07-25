"use client"

import { cn } from "@/lib/utils"

/**
 * Pixel avatar fallback. For Rive: place `.riv` in `/public/rive/` and
 * swap this for `<Rive src="/rive/customer.riv" />` from `@rive-app/react-canvas`.
 */
export function CharacterAvatar({ name, color, className }) {
  return (
    <span
      className={cn(
        "pixel-chip pixel flex h-9 w-9 shrink-0 items-center justify-center text-[11px] text-white",
        className,
      )}
      style={{ background: color }}
      title="Rive-ready avatar slot"
    >
      {name?.[0] ?? "?"}
    </span>
  )
}

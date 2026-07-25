import { cn } from "@/lib/utils"

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[#1a1f2e]/92 text-white shadow-2xl backdrop-blur-md",
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("border-b border-white/10 px-4 py-3", className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-xs text-white/50", className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-2", className)} {...props} />
}

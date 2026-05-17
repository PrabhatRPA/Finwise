import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CardProps = {
  children?: ReactNode
  className?: string
}

export const Card = ({ children, className }: CardProps) => (
  <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)}>
    {children}
  </div>
)

export const CardHeader = ({ children, className }: CardProps) => (
  // Tighter padding on phone (p-4) widens to p-6 from sm: up. Every card in
  // the app inherits this so the entire UI compresses on mobile without
  // per-call-site changes.
  <div className={cn('p-4 pb-2 sm:p-6 sm:pb-2', className)}>{children}</div>
)

export const CardTitle = ({ children, className }: CardProps) => (
  <h3 className={cn('font-semibold leading-none tracking-tight text-base sm:text-lg', className)}>{children}</h3>
)

export const CardContent = ({ children, className }: CardProps) => (
  <div className={cn('px-4 pb-4 pt-0 sm:px-6 sm:pb-6', className)}>{children}</div>
)

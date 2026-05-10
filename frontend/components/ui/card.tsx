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
  <div className={cn('p-6 pb-2', className)}>{children}</div>
)

export const CardTitle = ({ children, className }: CardProps) => (
  <h3 className={cn('font-semibold leading-none tracking-tight', className)}>{children}</h3>
)

export const CardContent = ({ children, className }: CardProps) => (
  <div className={cn('px-6 pb-6 pt-0', className)}>{children}</div>
)

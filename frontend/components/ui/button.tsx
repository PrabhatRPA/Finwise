import { MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ButtonProps = {
  children?: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit' | 'reset'
}

export const Button = ({
  children, onClick, variant = 'default', size = 'default',
  className, disabled, title, type = 'button',
}: ButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex items-center justify-center rounded-md font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-50',
      size === 'default' && 'h-9 px-4 py-2 text-sm',
      size === 'sm'      && 'h-7 px-3 text-xs',
      size === 'lg'      && 'h-10 px-6 text-base',
      size === 'icon'    && 'h-9 w-9',
      variant === 'default'     && 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
      variant === 'secondary'   && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
      variant === 'outline'     && 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground shadow-sm',
      variant === 'ghost'       && 'hover:bg-accent hover:text-accent-foreground',
      className,
    )}
  >
    {children}
  </button>
)

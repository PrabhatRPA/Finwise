import { ReactNode } from 'react'

export type BadgeProps = {
  variant?: 'default' | 'destructive' | 'secondary' | 'outline'
  children?: ReactNode
  className?: string
}

export const Badge = ({ variant = 'default', children, className }: BadgeProps) => (
  <span
    className={[
      'px-2 py-0.5 rounded text-xs font-medium',
      variant === 'default' && 'bg-primary text-primary-foreground',
      variant === 'destructive' && 'bg-destructive text-destructive-foreground',
      variant === 'secondary' && 'bg-secondary text-secondary-foreground',
      variant === 'outline' && 'border border-current bg-transparent',
      className,
    ].join(' ')}
  >
    {children}
  </span>
)

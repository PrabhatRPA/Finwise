import { cn } from '@/lib/utils'

export type InputProps = {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  type?: string
  min?: string
  max?: string
  step?: string
  disabled?: boolean
  required?: boolean
  minLength?: number
  maxLength?: number
  autoComplete?: string
  ref?: React.Ref<HTMLInputElement>
}

export const Input = ({
  value, onChange, placeholder, className, type = 'text',
  min, max, step, disabled, required, minLength, maxLength, autoComplete, ref,
}: InputProps) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    required={required}
    minLength={minLength}
    maxLength={maxLength}
    autoComplete={autoComplete}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm',
      'placeholder:text-muted-foreground',
      'focus:outline-none focus:ring-1 focus:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
  />
)

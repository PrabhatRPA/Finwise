'use client'

import { ReactNode, createContext, useContext, useState } from 'react'

type TabsContextType = {
  activeTab: string
  setActiveTab: (value: string) => void
}

const TabsContext = createContext<TabsContextType>({ activeTab: '', setActiveTab: () => {} })

export type TabsProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children?: ReactNode
  className?: string
}

export const Tabs = ({ value, defaultValue = '', onValueChange, children, className }: TabsProps) => {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const activeTab = value ?? internalValue
  const setActiveTab = (v: string) => {
    setInternalValue(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export const TabsList = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <div className={['flex space-x-1 rounded-md bg-muted p-1', className].filter(Boolean).join(' ')}>
    {children}
  </div>
)

export const TabsTrigger = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => {
  const { activeTab, setActiveTab } = useContext(TabsContext)
  return (
    <button
      type="button"
      onClick={() => setActiveTab(value)}
      className={[
        'px-3 py-1.5 rounded-md font-medium text-sm transition-all duration-150',
        activeTab === value
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  )
}

export const TabsContent = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => {
  const { activeTab } = useContext(TabsContext)
  if (activeTab !== value) return null
  return <div className={className}>{children}</div>
}

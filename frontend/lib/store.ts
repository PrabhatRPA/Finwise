import { create } from 'zustand'

interface Holding {
  id: number
  ticker: string
  shares: number
  average_cost: number
  current_price: number
  current_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  security_type: string
}

interface Account {
  id: number
  account_name: string
  account_type: string
  institution_name?: string
  balance: number
}

interface PortfolioState {
  holdings: Holding[]
  accounts: Account[]
  netWorth: number
  totalValue: number
  totalLiabilities: number
  cashPosition: number
  setHoldings: (holdings: Holding[]) => void
  addHolding: (holding: Holding) => void
  removeHolding: (id: number) => void
  updateHolding: (holding: Holding) => void
  setAccounts: (accounts: Account[]) => void
  setNetWorth: (netWorth: number) => void
  calculatePortfolio: () => void
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  holdings: [],
  accounts: [],
  netWorth: 0,
  totalValue: 0,
  totalLiabilities: 0,
  cashPosition: 0,

  setHoldings: (holdings) => set({ holdings }),

  addHolding: (holding) =>
    set((state) => ({
      holdings: [...state.holdings, holding],
    })),

  removeHolding: (id) =>
    set((state) => ({
      holdings: state.holdings.filter((h) => h.id !== id),
    })),

  updateHolding: (holding) =>
    set((state) => ({
      holdings: state.holdings.map((h) =>
        h.id === holding.id ? holding : h
      ),
    })),

  setAccounts: (accounts) => set({ accounts }),

  setNetWorth: (netWorth) => set({ netWorth }),

  calculatePortfolio: () => {
    const { holdings } = get()
    // totalValue = investment holdings only (bank/cash accounts are separate)
    const totalValue = holdings.reduce((sum, h) => sum + (h.current_value || 0), 0)
    set({ totalValue })
  },
}))

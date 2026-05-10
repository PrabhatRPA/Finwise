import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname
      if (path !== '/login' && path !== '/register') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  checkSetup: () => api.get('/auth/check-setup'),
  register: (username: string, password: string, fullName?: string) =>
    api.post('/auth/register', { username, password, full_name: fullName }),
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
}

export const holdingsApi = {
  getAll: () => api.get('/holdings'),
  getById: (id: number) => api.get(`/holdings/${id}`),
  create: (data: Partial<Holding>) => api.post('/holdings', data),
  update: (id: number, data: Partial<Holding>) => api.put(`/holdings/${id}`, data),
  delete: (id: number) => api.delete(`/holdings/${id}`),
  analyze: (ticker: string) => api.get(`/holdings/analysis/${ticker}`),
  portfolioSummary: () => api.get('/holdings/portfolio-summary'),
  batchAdd: (holdings: Partial<Holding>[]) => api.post('/holdings/batch', holdings),
}

export const accountsApi = {
  getAll: () => api.get('/accounts'),
  getById: (id: number) => api.get(`/accounts/${id}`),
  create: (data: Partial<Account>) => api.post('/accounts', data),
  update: (id: number, data: Partial<Account>) => api.put(`/accounts/${id}`, data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
  getBalances: () => api.get('/accounts/balances'),
  updateBalance: (id: number, balance: number) =>
    api.patch(`/accounts/${id}/balance`, { balance }),
}

export const transactionsApi = {
  getAll: () => api.get('/transactions'),
  create: (data: Partial<Transaction>) => api.post('/transactions', data),
  update: (id: number, data: Partial<Transaction>) => api.put(`/transactions/${id}`, data),
  delete: (id: number) => api.delete(`/transactions/${id}`),
  summary: () => api.get('/transactions/summary'),
}

export const documentsApi = {
  upload: (file: File, type: string, accountId?: number) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_type', type)
    if (accountId) formData.append('account_id', accountId.toString())
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getAll: () => api.get('/documents'),
  getById: (id: number) => api.get(`/documents/${id}`),
  delete: (id: number) => api.delete(`/documents/${id}`),
  process: (id: number) => api.post(`/documents/${id}/process`),
  importHoldings: (id: number, holdings: any[]) =>
    api.post(`/documents/${id}/import-holdings`, holdings),
}

export const marketApi = {
  getPrice: (ticker: string) => api.get(`/market/price/${ticker}`),
  getHistory: (ticker: string, period: string = '1y') =>
    api.get(`/market/history/${ticker}?period=${period}`),
  batchPrices: (tickers: string[]) => api.post('/market/batch-prices', { tickers }),
  search: (query: string) => api.get(`/market/search?query=${query}`),
  suggestions: (query: string) => api.get(`/market/suggestions?query=${query}`),
}

export const aiApi = {
  check: () => api.get('/ai/check'),
  portfolioAnalysis: (holdings: any[]) => api.post('/ai/portfolio-analysis', holdings),
  stockAnalysis: (ticker: string, companyName?: string) =>
    api.post('/ai/stock-analysis', { ticker, company_name: companyName }),
  documentExtraction: (text: string, type: string) =>
    api.post('/ai/document-extraction', { document_text: text, document_type: type }),
  marketInsights: () => api.get('/ai/market-insights'),
  riskAssessment: (data: any) => api.post('/ai/risk-assessment', data),
  suggestions: (data: any) => api.post('/ai/investment-suggestions', data),
  getSettings: () => api.get('/ai/settings'),
  saveSettings: (data: {
    provider: string
    api_key?: string
    model?: string
    host?: string
  }) => api.post('/ai/settings', data),
}

export const loansApi = {
  getAll: (includePaidOff = false) =>
    api.get(`/loans?include_paid_off=${includePaidOff}`),
  create: (data: LoanCreate) => api.post('/loans', data),
  update: (id: number, data: Partial<LoanCreate & { status: string }>) =>
    api.put(`/loans/${id}`, data),
  delete: (id: number) => api.delete(`/loans/${id}`),
}

// Trigger an authenticated file download by fetching as a blob then clicking a link
async function _authDownload(path: string, defaultFilename: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="?([^"]+)"?/)
  a.href = url
  a.download = match ? match[1] : defaultFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const propertiesApi = {
  getAll: () => api.get('/properties'),
  create: (data: {
    property_type: string
    nickname?: string
    address?: string
    city?: string
    state?: string
    zip_code?: string
    country?: string
    manual_value?: number
    purchase_price?: number
    purchase_date?: string
    notes?: string
  }) => api.post('/properties', data),
  update: (id: number, data: Partial<{
    property_type: string
    nickname: string
    address: string
    city: string
    state: string
    zip_code: string
    country: string
    manual_value: number | null
    purchase_price: number
    purchase_date: string
    notes: string
  }>) => api.put(`/properties/${id}`, data),
  delete: (id: number) => api.delete(`/properties/${id}`),
  refreshValue: (id: number) => api.post(`/properties/${id}/refresh-value`),
}

export const dataApi = {
  // Export (authenticated downloads)
  exportHoldings: () => _authDownload('/export/holdings', 'holdings.csv'),
  exportWatchlist: () => _authDownload('/export/watchlist', 'watchlist.csv'),
  exportDebts: () => _authDownload('/export/debts', 'debts.csv'),
  exportFullBackup: () => _authDownload('/export/full-backup', 'portfolio_backup.zip'),

  // Import
  importHoldings: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post('/import/holdings', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  importWatchlist: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post('/import/watchlist', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  importDebts: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post('/import/debts', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  // Backups
  createBackup: () => api.post('/backup/create'),
  listBackups: () => api.get('/backup/list'),
  downloadBackup: (filename: string) => _authDownload(`/backup/download/${encodeURIComponent(filename)}`, filename),
  deleteBackup: (filename: string) => api.delete(`/backup/${encodeURIComponent(filename)}`),
}

export const watchlistApi = {
  getAll: () => api.get('/watchlist'),
  create: (data: {
    ticker: string
    company_name?: string
    target_price?: number
    target_direction?: 'above' | 'below'
    notification_method?: string
    notes?: string
  }) => api.post('/watchlist', data),
  update: (id: number, data: {
    company_name?: string
    target_price?: number | null
    target_direction?: string | null
    notification_method?: string
    notes?: string
  }) => api.put(`/watchlist/${id}`, data),
  delete: (id: number) => api.delete(`/watchlist/${id}`),
  acknowledgeAlert: (id: number) => api.post(`/watchlist/${id}/acknowledge-alert`),
}

export const netWorthApi = {
  getCurrent: () => api.get('/net-worth/current'),
  getHistory: (start?: string, end?: string) => {
    const params = new URLSearchParams()
    if (start) params.append('start_date', start)
    if (end) params.append('end_date', end)
    return api.get(`/net-worth/history?${params.toString()}`)
  },
  createRecord: () => api.post('/net-worth/history'),
  getTrends: (days: number = 365) => api.get(`/net-worth/trends?days=${days}`),
  getAllocations: () => api.get('/net-worth/allocations'),
}

export interface Holding {
  id: number
  account_id: number
  user_id: number
  ticker: string
  security_name?: string
  security_type: string
  shares: number
  average_cost: number
  purchase_date?: string
  current_price: number
  current_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  dividend_yield?: number
  sector?: string
  industry?: string
  is_active: number
  last_updated?: string
  created_at?: string
}

export interface Account {
  id: number
  user_id: number
  account_name: string
  account_type: string
  account_number?: string
  institution_name?: string
  institution_type?: string
  balance: number
  balance_date?: string
  currency: string
  is_active: number
  created_at?: string
  updated_at?: string
}

export interface Transaction {
  id: number
  user_id: number
  account_id: number
  holding_id?: number
  transaction_type: string
  transaction_date: string
  settlement_date?: string
  ticker?: string
  shares?: number
  price_per_share?: number
  total_amount?: number
  commission: number
  fees: number
  description?: string
  reference_number?: string
  is_reconciled: number
  created_at?: string
}

export interface LoanCreate {
  loan_name: string
  loan_type: string
  original_balance: number
  current_balance: number
  interest_rate?: number
  monthly_payment?: number
  lender_name?: string
  due_day?: number
  end_date?: string
}

export interface Loan extends LoanCreate {
  id: number
  user_id: number
  status: string
  created_at?: string
  updated_at?: string
}

export interface WatchlistItem {
  id: number
  user_id: number
  ticker: string
  company_name?: string
  target_price?: number
  target_direction?: 'above' | 'below'
  notification_method: string
  notes?: string
  alert_triggered: boolean
  last_notified_at?: string
  created_at?: string
  updated_at?: string
  // live-enriched
  current_price?: number
  day_change_percent?: number
  pct_to_target?: number
  alert_active: boolean
}

export interface PropertyItem {
  id: number
  user_id: number
  property_type: string
  nickname?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  country: string
  manual_value?: number
  estimated_value?: number
  current_value: number
  valuation_source?: string
  last_estimated_at?: string
  purchase_price?: number
  purchase_date?: string
  equity: number
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export default api

import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor for auth
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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

export default api

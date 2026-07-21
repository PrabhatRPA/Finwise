// Bundled static ticker → sector (GICS) map.
//
// Why this exists: holdings only store a `sector` when one is supplied at add
// time, and the add form doesn't capture it — so real (non-demo) holdings have
// sector = null and every portfolio view collapses to a single "Other" bucket.
// This file resolves a sector at *classify time* from a bundled table, with no
// network call (keeps the local-only, no-telemetry model intact) and no schema
// change. Genuinely unmapped / custom symbols fall through to `null`, and the
// caller shows its own "Other" fallback.
//
// Labels intentionally match the ones already used in the app / demo data
// ("Technology", "Healthcare" (one word), fund buckets like "Index Fund" /
// "Fixed Income" / "Dividend" / "Cryptocurrency") so mapped and stored sectors
// merge cleanly in the same view.
//
// Classifications are best-effort GICS (US names reflect the 2023 payments
// reclassification: V / MA / PYPL / FI / FIS / GPN are Financials). Edit the
// per-sector arrays below to correct any you disagree with — the lookup map is
// derived from them at module load.

// Grouped by sector for readability/reviewability. Symbols are the *base*
// symbol (no exchange suffix); sectorFor() strips suffixes like ".NS" / ".TO"
// / ".L" and crypto "-USD" forms before looking up, so one entry covers a
// name's US ADR and its home listing (e.g. RELIANCE covers RELIANCE.NS +
// RELIANCE.BO; TD covers TD + TD.TO).
const BY_SECTOR: Record<string, string[]> = {
  Technology: [
    // US large/mega cap
    'AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'ACN', 'CSCO',
    'INTC', 'IBM', 'QCOM', 'TXN', 'INTU', 'NOW', 'AMAT', 'ADI', 'MU', 'LRCX',
    'KLAC', 'SNPS', 'CDNS', 'ANET', 'ROP', 'APH', 'MSI', 'NXPI', 'MCHP', 'FTNT',
    'ADSK', 'TEL', 'IT', 'GLW', 'HPQ', 'HPE', 'KEYS', 'MPWR', 'CDW', 'TDY',
    'ON', 'STX', 'WDC', 'NTAP', 'ZBRA', 'TER', 'SWKS', 'PTC', 'TYL',
    'JBL', 'FSLR', 'ENPH', 'SEDG', 'GEN', 'AKAM', 'TRMB', 'JNPR', 'FFIV', 'QRVO',
    'DELL', 'SMCI', 'VRSN', 'EPAM', 'GDDY', 'FICO', 'ANSS', 'CTSH', 'WDAY',
    // Software / cloud / growth
    'PLTR', 'SNOW', 'CRWD', 'PANW', 'DDOG', 'ZS', 'NET', 'MDB', 'TEAM', 'HUBS',
    'ZM', 'DOCU', 'OKTA', 'TWLO', 'U', 'PATH', 'GTLB', 'S', 'ESTC', 'FROG',
    'BILL', 'PCTY', 'PAYC', 'CFLT', 'ASAN', 'MNDY', 'BRZE', 'DBX', 'PD', 'FRSH',
    'APP', 'SHOP', 'SQSP', 'WIX', 'RNG', 'NICE', 'CVLT', 'MSTR',
    // Semis / hardware extras
    'ARM', 'ASX', 'UMC', 'STM', 'ONTO', 'ACLS', 'AMKR', 'SLAB', 'LSCC', 'POWI',
    'CRUS', 'DIOD', 'SITM', 'FORM', 'COHR', 'LITE', 'VIAV', 'PSTG',
    // Foreign tech listed/ADR
    'TSM', 'ASML', 'SAP', 'INFY', 'WIT', 'STNE', 'GLOB', 'NABIL',
    // India tech (base symbols)
    'TCS', 'HCLTECH', 'TECHM', 'WIPRO', 'LTIM', 'PERSISTENT', 'COFORGE',
  ],
  'Communication Services': [
    'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR',
    'EA', 'TTWO', 'WBD', 'OMC', 'IPG', 'LYV', 'FOXA', 'FOX', 'NWSA', 'NWS',
    'PARA', 'MTCH', 'PINS', 'SNAP', 'RBLX', 'SPOT', 'BIDU', 'TME', 'WBS',
    'ROKU', 'BILI', 'IQ', 'DASH', 'GRAB', 'SE', 'NTES', 'YELP', 'CARG',
    // Telecom (intl base)
    'VOD', 'BHARTIARTL', 'BCE', 'TU', 'ORAN', 'TEF', 'AMX',
  ],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'BKNG', 'TJX', 'ORLY',
    'CMG', 'MAR', 'GM', 'F', 'HLT', 'AZO', 'ROST', 'YUM', 'DHI', 'LEN',
    'NVR', 'PHM', 'LVS', 'WYNN', 'MGM', 'RCL', 'CCL', 'NCLH', 'EBAY', 'ETSY',
    'LULU', 'DRI', 'DPZ', 'EXPE', 'ABNB', 'ULTA', 'BBY', 'TSCO', 'KMX', 'APTV',
    'BWA', 'GPC', 'POOL', 'WHR', 'NWL', 'MHK', 'RL', 'TPR', 'PVH', 'HAS',
    'WSM', 'W', 'CZR', 'PENN', 'DKNG', 'CROX', 'DECK', 'BURL', 'FND', 'LKQ',
    'GRMN', 'YETI', 'TXRH', 'WING', 'CAVA', 'SG', 'CHWY', 'RH', 'TCOM', 'LI',
    'NIO', 'XPEV', 'RIVN', 'LCID', 'MELI', 'CPNG', 'JD', 'PDD', 'BABA', 'VIPS',
    // India / intl consumer disc (base)
    'MARUTI', 'TATAMOTORS', 'TITAN', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO',
    'M&M', 'TRENT', 'DMART',
  ],
  'Consumer Staples': [
    'PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'MDLZ', 'CL', 'KMB',
    'GIS', 'KHC', 'HSY', 'STZ', 'KDP', 'KR', 'SYY', 'ADM', 'MNST', 'KVUE',
    'EL', 'CLX', 'CHD', 'MKC', 'CAG', 'CPB', 'SJM', 'HRL', 'K', 'TAP',
    'TSN', 'BG', 'TGT', 'DG', 'DLTR', 'BF.B', 'LW', 'CASY', 'COTY', 'HLF',
    // Intl staples (base)
    'ULVR', 'DGE', 'BATS', 'NESTLEIND', 'HINDUNILVR', 'ITC', 'BRITANNIA',
    'TATACONSUM', 'DABUR', 'NESN', 'BUD', 'DEO', 'UL',
  ],
  Healthcare: [
    'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'PFE', 'AMGN',
    'ISRG', 'BSX', 'SYK', 'MDT', 'GILD', 'VRTX', 'REGN', 'CI', 'ELV', 'CVS',
    'ZTS', 'BDX', 'HCA', 'MCK', 'COR', 'HUM', 'CNC', 'BIIB', 'IDXX', 'IQV',
    'A', 'DXCM', 'EW', 'RMD', 'MTD', 'ZBH', 'BAX', 'STE', 'ALGN', 'HOLX',
    'MRNA', 'PODD', 'GEHC', 'LH', 'DGX', 'WST', 'COO', 'CAH', 'BMRN', 'TECH',
    'RVTY', 'VTRS', 'INCY', 'CTLT', 'UHS', 'DVA', 'HSIC', 'XRAY', 'WAT', 'NBIX',
    'EXAS', 'RPRX', 'ALNY', 'SRPT', 'HALO', 'MEDP', 'CRL', 'RGEN', 'PEN', 'TFX',
    'INSP', 'NVCR', 'DOCS', 'HIMS', 'ELAN', 'ILMN', 'CYTK', 'ARWR',
    // Foreign pharma ADR / base
    'AZN', 'GSK', 'NVO', 'NVS', 'SNY', 'SUNPHARMA', 'DRREDDY', 'CIPLA',
    'DIVISLAB', 'APOLLOHOSP',
  ],
  Financials: [
    'BRK.B', 'BRK.A', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI',
    'AXP', 'BLK', 'C', 'SCHW', 'CB', 'MMC', 'PGR', 'FI', 'CME', 'ICE',
    'PNC', 'USB', 'AON', 'COF', 'TFC', 'BK', 'AJG', 'MET', 'AFL', 'TRV',
    'ALL', 'MSCI', 'AMP', 'PRU', 'DFS', 'FIS', 'GPN', 'NDAQ', 'WTW', 'ACGL',
    'HIG', 'FITB', 'MTB', 'STT', 'RF', 'CFG', 'HBAN', 'KEY', 'SYF', 'NTRS',
    'CINF', 'BRO', 'L', 'RJF', 'PFG', 'GL', 'MKTX', 'JKHY', 'CBOE', 'IVZ',
    'BEN', 'WRB', 'FDS', 'PYPL', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST',
    'ALLY', 'EWBC', 'FHN', 'CMA', 'ZION', 'PNFP', 'WAL', 'SNV', 'OZK', 'GBCI',
    'KKR', 'BX', 'APO', 'CG', 'ARES', 'OWL', 'TROW', 'RITM', 'MARA', 'RIOT',
    // Intl financials (base / ADR)
    'HSBC', 'HDB', 'IBN', 'RY', 'TD', 'BNS', 'BMO', 'MFC', 'BAM', 'ITUB',
    'BBD', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK',
    'BAJFINANCE', 'BAJAJFINSV', 'INDUSINDBK', 'HDFCLIFE', 'SBILIFE', 'LLOY', 'BARC', 'LSEG',
  ],
  Industrials: [
    'GE', 'CAT', 'RTX', 'HON', 'UNP', 'BA', 'DE', 'LMT', 'UPS', 'ETN',
    'ADP', 'GD', 'NOC', 'WM', 'CSX', 'EMR', 'ITW', 'MMM', 'FDX', 'NSC',
    'PH', 'TDG', 'TT', 'GEV', 'CTAS', 'PCAR', 'CPRT', 'PAYX', 'CARR', 'JCI',
    'CMI', 'AME', 'ROK', 'OTIS', 'FAST', 'URI', 'LHX', 'IR', 'GWW', 'DAL',
    'UAL', 'LUV', 'WAB', 'VRSK', 'EFX', 'DOV', 'XYL', 'HWM', 'FTV', 'BR',
    'EME', 'PWR', 'ODFL', 'JBHT', 'CHRW', 'EXPD', 'ALLE', 'MAS', 'SNA', 'SWK',
    'PNR', 'NDSN', 'ROL', 'IEX', 'TXT', 'HUBB', 'LII', 'GGG', 'DAY', 'AXON',
    'BLDR', 'WSC', 'AOS', 'CSL', 'FIX', 'WWD', 'RRX', 'CW', 'CACI',
    // Intl industrials (base)
    'LT', 'ADANIENT', 'CNR', 'CP', 'WCN', 'RR', 'SIEGY', 'ABBNY',
  ],
  Materials: [
    'LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'CTVA',
    'PPG', 'VMC', 'MLM', 'IFF', 'ALB', 'LYB', 'STLD', 'CF', 'MOS', 'FMC',
    'CE', 'EMN', 'PKG', 'IP', 'AVY', 'BALL', 'AMCR', 'SEE', 'WLK', 'RPM',
    'RS', 'CLF', 'X', 'AA', 'MP', 'SCCO', 'GOLD', 'AEM', 'WPM', 'FNV',
    'TECK', 'VALE', 'RIO', 'BHP', 'GLEN',
    // India materials (base)
    'ASIANPAINT', 'ULTRACEMCO', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'GRASIM',
    'SHREECEM', 'AMBUJACEM',
  ],
  Energy: [
    'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'WMB', 'OKE', 'VLO',
    'HES', 'OXY', 'KMI', 'HAL', 'BKR', 'DVN', 'FANG', 'TRGP', 'CTRA', 'EQT',
    'RELIANCE',
    'MRO', 'APA', 'OVV', 'LNG', 'CHRD', 'RRC', 'AR', 'SM', 'MTDR',
    'PR', 'CIVI', 'HP', 'NOV', 'FTI', 'CHX', 'WFRD', 'DINO', 'PBF', 'DK',
    // Intl energy (base / ADR)
    'BP', 'SHEL', 'TTE', 'ENB', 'TRP', 'SU', 'CNQ', 'PBR', 'EC', 'EQNR',
    'ONGC', 'BPCL', 'IOC', 'COALINDIA', 'PETRONET',
  ],
  Utilities: [
    'NEE', 'SO', 'DUK', 'CEG', 'AEP', 'SRE', 'D', 'EXC', 'XEL', 'PEG',
    'ED', 'EIX', 'WEC', 'AWK', 'DTE', 'PPL', 'ES', 'FE', 'AEE', 'ATO',
    'CMS', 'CNP', 'NI', 'LNT', 'EVRG', 'PNW', 'NRG', 'VST', 'PCG', 'AES',
    'ETR', 'OGE', 'IDA', 'POR', 'BKH', 'NWE', 'AVA', 'SR', 'UGI',
    // India utilities (base)
    'NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIGREEN', 'ADANIPOWER',
  ],
  'Real Estate': [
    'PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'PSA', 'O', 'CCI', 'DLR', 'CBRE',
    'VICI', 'EXR', 'AVB', 'EQR', 'VTR', 'INVH', 'SBAC', 'WY', 'ARE', 'MAA',
    'ESS', 'KIM', 'UDR', 'DOC', 'HST', 'REG', 'BXP', 'FRT', 'CPT', 'ELS',
    'AMH', 'CUBE', 'LSI', 'NNN', 'ADC', 'STAG', 'REXR', 'FR', 'EGP', 'TRNO',
    'IRM', 'WPC', 'GLPI', 'LAMR', 'SUI', 'OHI', 'VNO', 'KRC', 'HIW', 'BNL',
  ],
  // ── Fund / non-single-sector buckets (labels match the app's demo data) ──
  'Index Fund': [
    'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'QQQM', 'DIA', 'IWM', 'IWB', 'IWD',
    'IWF', 'VEA', 'VWO', 'IEFA', 'IEMG', 'EFA', 'EEM', 'VXUS', 'VT', 'ITOT',
    'SCHB', 'SCHX', 'SPLG', 'RSP', 'MGK', 'VUG', 'VTV', 'IVW', 'IVE', 'VO',
    'VB', 'IJH', 'IJR', 'MDY', 'VYMI', 'ACWI', 'URTH', 'SPYG', 'SPYV', 'VV',
    'SCHG', 'SCHV', 'VONE', 'VTHR', 'DFAC', 'AVUV', 'SPMD', 'SPSM',
  ],
  Dividend: [
    'VYM', 'SCHD', 'DVY', 'SDY', 'NOBL', 'HDV', 'DGRO', 'SPYD', 'VIG', 'DGRW',
    'RDVY', 'FDVV', 'SPHD', 'PEY', 'DHS', 'FVD',
  ],
  'Fixed Income': [
    'BND', 'AGG', 'BNDX', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'JNK', 'MUB',
    'TIP', 'VCIT', 'VCSH', 'VGIT', 'VGSH', 'BSV', 'GOVT', 'EMB', 'SCHZ',
    'SPTL', 'SPTI', 'SPTS', 'BIL', 'SGOV', 'SHV', 'USFR', 'VMBS', 'MBB',
    'IGSB', 'IGIB', 'VTIP', 'STIP', 'TLH', 'EDV', 'ANGL', 'SJNK', 'HYLB',
    'FBND', 'FTBD', 'JAAA', 'JPST', 'PULS', 'ICSH', 'FLOT', 'NEAR',
  ],
  Cryptocurrency: [
    'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC',
    'LTC', 'BCH', 'UNI', 'ATOM', 'XLM', 'ALGO', 'TRX', 'SHIB', 'NEAR', 'APT',
    'ARB', 'OP', 'FIL', 'ICP', 'ETC', 'HBAR', 'VET', 'INJ', 'SUI', 'SEI',
    'GRT', 'AAVE', 'MKR', 'RUNE', 'FTM', 'SAND', 'MANA', 'AXS', 'PEPE', 'BONK',
    // Crypto ETFs / trusts
    'GBTC', 'IBIT', 'FBTC', 'ARKB', 'BITB', 'BITO', 'ETHE', 'ETHA', 'BITX',
  ],
  Commodities: [
    'GLD', 'IAU', 'GLDM', 'SLV', 'SIVR', 'PPLT', 'PALL', 'USO', 'BNO', 'UNG',
    'DBC', 'DBA', 'PDBC', 'GSG', 'CPER', 'WEAT', 'CORN', 'SOYB', 'UGA',
  ],

  // ── Sector-specific ETFs → their underlying sector ──
  // (added last so any accidental overlap resolves to the sector, which is
  //  what a user browsing a "sector map" expects for e.g. XLK.)
}

// Sector ETFs, kept separate for clarity then merged into the sector arrays.
const SECTOR_ETFS: Record<string, string[]> = {
  Technology: ['XLK', 'VGT', 'SMH', 'SOXX', 'IYW', 'FTEC', 'IGV', 'SKYY', 'WCLD', 'XSW', 'SOXL'],
  Financials: ['XLF', 'VFH', 'KRE', 'KBE', 'IYF', 'FNCL', 'KBWB', 'IAI'],
  Energy: ['XLE', 'VDE', 'OIH', 'XOP', 'IYE', 'FENY', 'AMLP', 'ICLN', 'TAN'],
  Healthcare: ['XLV', 'VHT', 'IBB', 'XBI', 'IHI', 'IYH', 'FHLC', 'IHF'],
  Industrials: ['XLI', 'VIS', 'IYT', 'ITA', 'JETS', 'PPA', 'FIDU'],
  'Consumer Discretionary': ['XLY', 'VCR', 'ITB', 'XHB', 'FDIS', 'IYC', 'XRT'],
  'Consumer Staples': ['XLP', 'VDC', 'IYK', 'FSTA', 'KXI'],
  Utilities: ['XLU', 'VPU', 'IDU', 'FUTY'],
  Materials: ['XLB', 'VAW', 'GDX', 'GDXJ', 'XME', 'LIT', 'REMX', 'FMAT'],
  'Real Estate': ['XLRE', 'VNQ', 'IYR', 'SCHH', 'REZ', 'VNQI', 'FREL'],
  'Communication Services': ['XLC', 'VOX', 'FCOM'],
}

// Build the flat lookup map (upper-cased symbol → sector). Later entries win,
// so SECTOR_ETFS overrides any accidental duplicate in BY_SECTOR.
const MAP = new Map<string, string>()
for (const [sector, tickers] of Object.entries(BY_SECTOR)) {
  for (const t of tickers) MAP.set(t.toUpperCase(), sector)
}
for (const [sector, tickers] of Object.entries(SECTOR_ETFS)) {
  for (const t of tickers) MAP.set(t.toUpperCase(), sector)
}

/** Total number of symbols in the bundled map (diagnostics/tests). */
export const SECTOR_MAP_SIZE = MAP.size

/**
 * Resolve a holding's sector from the bundled map. Returns the sector label, or
 * `null` when the symbol is genuinely unmapped so the caller can apply its own
 * "Other" fallback. Never throws, never hits the network.
 *
 * Resolution order: exact symbol → crypto pair base (BTC-USD → BTC) →
 * exchange-suffix base (RELIANCE.NS → RELIANCE) → security_type signal
 * (crypto / bond / reit) → null.
 */
export function sectorFor(holding: { ticker?: string | null; security_type?: string | null }): string | null {
  const raw = String(holding?.ticker ?? '').trim().toUpperCase()
  if (raw) {
    const direct = MAP.get(raw)
    if (direct) return direct

    // Crypto quoted as a pair: BTC-USD / BTCUSD / BTC/USDT → BTC
    const cryptoBase = raw.replace(/[-/]?USD[TC]?$/, '')
    if (cryptoBase && cryptoBase !== raw) {
      const hit = MAP.get(cryptoBase)
      if (hit) return hit
    }

    // Foreign listing with an exchange suffix: RELIANCE.NS / HSBA.L / TD.TO
    const dot = raw.indexOf('.')
    if (dot > 0) {
      const base = raw.slice(0, dot)
      const hit = MAP.get(base)
      if (hit) return hit
    }
  }

  // Fall back to the security type for unmapped symbols that still carry a
  // strong signal (user-added crypto / bonds / REITs).
  const type = String(holding?.security_type ?? '').toLowerCase()
  if (type === 'crypto') return 'Cryptocurrency'
  if (type === 'bond') return 'Fixed Income'
  if (type === 'reit') return 'Real Estate'

  return null
}

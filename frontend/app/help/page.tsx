'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/constants'

// "Know your app" — an in-app guide covering the common tasks. Reached from
// Profile → Data & Privacy → Know your app.

function Guide({
  title, steps, note,
}: { title: string; steps: (string | React.ReactNode)[]; note?: string }) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex items-center justify-between gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium">
        {title}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-0">
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {note && (
          <p className="mt-2 text-xs text-muted-foreground/80 italic">{note}</p>
        )}
      </div>
    </details>
  )
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">
      {/* Back is handled by the global floating nav button. */}

      <header>
        <h1 className="text-xl sm:text-2xl font-bold">Know your app</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick how-tos for the things you&apos;ll do most in {APP_NAME}. Tap a topic to expand.
        </p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          <span className="font-medium">Tip:</span> the more complete the information you enter,
          the more the app can do for you — optional fields like a loan&apos;s interest rate or a
          property&apos;s purchase price unlock charts and projections that stay hidden otherwise.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Holdings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add a holding"
            steps={[
              'Tap Home on the bottom bar (or pick Holdings in the View dropdown).',
              'Tap the round “+” button above the bottom bar, or “+ Add Holding” in the list.',
              'Start typing the Ticker and pick from the suggestions — international stocks work too (e.g. typing TCS offers TCS.NS on India’s NSE). Prices in other currencies convert automatically.',
              'Enter the number of Shares and your Avg Cost (in the currency shown on the label — what you actually paid on that exchange).',
              'Choose a Type, and optionally a Broker/Account — typing a new broker name creates that account automatically.',
              'Tap “Add Holding”. The live price, value, and gain/loss fill in automatically.',
            ]}
            note="The “+” button adapts to the view you’re on — it also adds accounts, watchlist tickers, debts, and properties."
          />
          <Guide
            title="Edit or remove a holding"
            steps={[
              'In the Holdings list, tap “Edit” on a row to change any field — including the ticker — then tap “Save Changes”.',
              'To remove one, tap “Delete” (the × on wider screens) on the row and confirm.',
            ]}
            note="Removing a holding stops it counting toward your portfolio and net worth."
          />
          <Guide
            title="Rearrange / show / hide columns"
            steps={[
              'On a tablet, in landscape, or any wider screen the Holdings table shows a “Columns” button.',
              'Tap it to show/hide columns and reorder them with the ↑ / ↓ arrows; “Reset” restores the defaults.',
              'Tap any column header to sort by it. Your layout is saved on this device.',
            ]}
            note="On a phone in portrait, holdings show as compact cards instead of the full table."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cash &amp; Accounts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add a bank or investment account"
            steps={[
              'Pick “Cash & Accounts” in the View dropdown (or tap the Cash tile under the big chart).',
              'Tap the “+” button and give the account a name (e.g. Chase Checking, Fidelity Brokerage).',
              'Choose the Type carefully — Checking / Savings / Money Market count as Cash; Brokerage, IRAs, 401(k), HSA and Pension count toward your Portfolio.',
              'Enter the current Balance and save. The Cash and Net Worth tiles update immediately.',
            ]}
            note="Keep balances roughly current — they feed your net worth directly. Editing an account any time updates everything downstream."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Watchlist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Watch a ticker and set a price alert"
            steps={[
              'Pick “Watchlist” in the View dropdown and tap “+”.',
              'Start typing the ticker and pick from the suggestions — the company name fills in automatically.',
              'Optionally set a Target price and a direction (alert when above ↑ or below ↓).',
              'Choose how to be notified: in-app, push notification, or both.',
            ]}
            note="Setting a target price is what unlocks alerts — without it the row just tracks the live price. Enable notifications in Settings → Notifications for push alerts."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Debts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add a loan, mortgage, or credit card"
            steps={[
              'Pick “Debts” in the View dropdown and tap “+”.',
              'Enter a Name, the Type, and the Current Balance (required).',
              'Strongly recommended: also fill in the Interest Rate (%) and Monthly Payment — the app uses them to run real amortization math.',
              'Optionally add the Original Balance and Lender for a complete record.',
            ]}
            note="With interest rate + monthly payment filled in, the Debt-Free Countdown chart can project your payoff date, per-loan payoff order, and how your balance declines month by month. Without them the app can only show today’s balance."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Properties</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add real estate"
            steps={[
              'Pick “Properties” in the View dropdown and tap “+”.',
              'Choose the Property type and enter the address.',
              'Enter the Current value — this is what rolls into your net worth.',
              'Recommended: add the Purchase price and Purchase date too, so the app can show your equity gain since you bought.',
            ]}
            note="Update the current value whenever you have a fresh estimate — property values only change when you change them."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">News &amp; markets</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Portfolio news"
            steps={[
              'Tap News on the bottom bar — headlines are gathered for every ticker you hold.',
              'Sort “By Value” (your biggest holdings’ news first, every ticker gets a turn) or “Most Recent”.',
              'Tap a headline to read the article; tap the ticker chip to open that ticker’s detail page.',
            ]}
          />
          <Guide
            title="Compare against market benchmarks"
            steps={[
              'Tap Performance on the bottom bar and scroll to “Portfolio vs Market Benchmarks”.',
              'Tap “Edit” to add or remove benchmark tickers or indexes (up to 7) — search anything, e.g. SPY or ^NSEI.',
              'Use the range pills (1W to 5Y) to change the comparison window.',
            ]}
            note="Defaults follow your market: US benchmarks by default, Nifty/Sensex if your market is India, and so on. “Reset to defaults” restores them."
          />
          <Guide
            title="Choose your home market & currency"
            steps={[
              'Tap Settings on the bottom bar → “Market & Currency”.',
              'Pick your market (US, India, UK, …) — the whole app displays in that currency, and foreign holdings convert automatically at live exchange rates.',
            ]}
            note="Amounts you typed in yourself (cash balances, debts, property values) are not converted when you switch markets — they’re your numbers, in your currency."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">AI insights</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add an API key for AI"
            steps={[
              'Tap Settings on the bottom bar.',
              'Find the “AI Provider” section and pick your provider — Claude, OpenAI, or Other (any OpenAI-compatible service like Groq, OpenRouter, Together or DeepSeek).',
              'Paste your API key (and for Other, the service’s endpoint URL and model name), then Save.',
              'Tap AI on the bottom bar to get portfolio analysis.',
            ]}
            note="The app includes 10 free AI requests on a built-in trial key so you can try the AI features right away. After those are used, add your own API key to keep going — the AI Provider section shows how many free requests you have left. Keys are stored only on your device."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Export &amp; import</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Export your data"
            steps={[
              'Tap Settings on the bottom bar → “Manage exports & backups”.',
              'Under Export Data, tap “All Data JSON” for a complete snapshot, or a CSV (Holdings, Watchlist, Debts, Trends).',
              'The iOS share sheet opens so you can save to Files, email it, or AirDrop it.',
            ]}
          />
          <Guide
            title="Import data"
            steps={[
              'Tap Settings on the bottom bar → “Manage exports & backups”.',
              'Pick a Conflict mode: “Update existing + add new”, “Add new only”, or “Replace everything”.',
              'Tap “All Data JSON” and choose your .json file — holdings, accounts, debts, properties, watchlist, transactions, and history are restored together.',
              'You can also import Holdings, Watchlist, or Debts individually from CSV.',
            ]}
          />
          <Guide
            title="Load demo data or start fresh"
            steps={[
              'In “Manage exports & backups”, tap “Load demo data” to fill the app with a sample portfolio (plus history) so you can explore every chart — this replaces your current data.',
              'Tap “Remove all data” to wipe everything and start fresh. Your login is preserved.',
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">History &amp; charts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Keep your history complete — open the app daily"
            steps={[
              'For the richest history and the smoothest charts, open the app at least once every day.',
              'Each visit captures that day’s ticker prices and saves a snapshot of your net worth — portfolio, cash, debts, and properties (one snapshot per day).',
              'The growth chart and the “Portfolio · Debt · Net Worth Trends” chart are drawn from these daily snapshots, so a quick daily open keeps them accurate and gap-free.',
            ]}
            note="Days you don’t open the app have no snapshot and can’t be backfilled later — your cash balances and debts have no public history to look up. The Portfolio Performance chart is the exception: it’s rebuilt from each holding’s market price history, so it fills itself in automatically."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Backups</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Save & restore backups"
            steps={[
              'Tap Settings on the bottom bar → “Manage exports & backups” → Automatic Backups.',
              'Choose a frequency: Daily, Weekly, Monthly, or Off.',
              'A full snapshot (all data + net-worth history) is saved on your device automatically; the 10 most recent are kept.',
              'Tap “+ Backup now” to make one immediately.',
              'For any saved backup you can Restore it, Download (share) it, or Delete it.',
            ]}
            note="Backups stay on your device unless you choose to share them."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sign-in &amp; appearance</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Turn on Face ID / Touch ID"
            steps={[
              'Tap Settings on the bottom bar → Security and turn on “Face ID sign-in” (you’ll confirm once).',
              'Next time you’re on the login screen, tap “Sign in with Face ID”.',
            ]}
          />
          <Guide
            title="Change the theme"
            steps={[
              'Tap Settings on the bottom bar → Appearance and choose Light, Dark, or System.',
              'System follows your device’s appearance; if your device has no preference it switches automatically by time of day.',
            ]}
          />
        </CardContent>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground/70">
        Everything in {APP_NAME} is stored locally on your device.
      </p>
    </div>
  )
}

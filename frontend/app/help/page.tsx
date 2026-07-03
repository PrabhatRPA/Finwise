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
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Holdings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add a holding"
            steps={[
              'Open the Dashboard and select the Holdings view (use the View dropdown on phone).',
              'Tap “+ Add Holding”.',
              'Enter the Ticker (e.g. AAPL, BTC-USD), number of Shares, and your Avg Cost.',
              'Choose a Type, and optionally a Broker/Account — typing a new broker name creates that account automatically.',
              'Tap “Add Holding”. The live price, value, and gain/loss fill in automatically.',
            ]}
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
        <CardHeader><CardTitle className="text-base">AI insights</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Add an API key for AI"
            steps={[
              'Go to Profile.',
              'Find the “AI Provider” section and pick your provider (Claude, OpenAI, or a local one like Ollama / LM Studio).',
              'Paste your API key (for cloud providers) or the host URL (for local providers), then Save.',
              'Open the AI Insights view on the Dashboard to get portfolio analysis.',
            ]}
            note="Keys are stored only on your device."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Export &amp; import</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Export your data"
            steps={[
              'Go to Profile → “Manage exports & backups”.',
              'Under Export Data, tap “All Data JSON” for a complete snapshot, or a CSV (Holdings, Watchlist, Debts, Trends).',
              'The iOS share sheet opens so you can save to Files, email it, or AirDrop it.',
            ]}
          />
          <Guide
            title="Import data"
            steps={[
              'Go to Profile → “Manage exports & backups”.',
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
        <CardHeader><CardTitle className="text-base">Backups</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Guide
            title="Save & restore backups"
            steps={[
              'Go to Profile → “Manage exports & backups” → Automatic Backups.',
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
              'Go to Profile → Security and turn on “Face ID sign-in” (you’ll confirm once).',
              'Next time you’re on the login screen, tap “Sign in with Face ID”.',
            ]}
          />
          <Guide
            title="Change the theme"
            steps={[
              'Go to Profile → Appearance and choose Light, Dark, or System.',
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

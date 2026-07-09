// Small-print legal disclaimers, reused across the app. Keep the copy here so
// wording stays consistent everywhere it appears.
//
//   variant="ai"     — under AI-generated content
//   variant="market" — under market data / charts / news (ticker page)
//   variant="full"   — the complete Disclaimer & Terms block (About page)

export function Disclaimer({ variant = 'market' }: { variant?: 'ai' | 'market' | 'full' }) {
  if (variant === 'ai') {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground mt-2">
        AI-generated and may be inaccurate or incomplete. Not financial, investment, or tax
        advice — verify independently before acting.
      </p>
    )
  }

  if (variant === 'market') {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Market prices, charts, and news come from third parties and may be delayed or inaccurate.
        For informational purposes only — not investment advice.
      </p>
    )
  }

  // full — About page
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-2">
      <h2 className="font-semibold text-base sm:text-lg">Disclaimer &amp; Terms</h2>
      <div className="text-xs leading-relaxed text-muted-foreground space-y-2">
        <p>
          Nworth is provided for informational and personal financial-tracking purposes only. It is
          not financial, investment, tax, or legal advice, and nothing in the app is a recommendation
          or solicitation to buy, sell, or hold any security or to adopt any investment strategy.
          Always do your own research and consult a qualified professional before making financial
          decisions.
        </p>
        <p>
          Market prices, charts, news, and AI-generated insights are sourced from third parties
          (market data providers and your chosen AI provider) and may be delayed, inaccurate, or
          incomplete. Nworth does not guarantee the accuracy, completeness, or timeliness of any
          data and is not responsible for third-party content.
        </p>
        <p>
          Nworth is not a bank, broker-dealer, investment adviser, or fiduciary, and no advisory,
          fiduciary, or professional relationship of any kind is created by your use of the app.
          All figures shown are based solely on the information you enter and on third-party
          market data, and may not reflect the actual value of your assets.
        </p>
        <p>
          To the maximum extent permitted by law, the developer shall not be liable for any losses,
          damages, or decisions of any kind — including without limitation investment losses, lost
          profits, data loss or corruption, or incidental, indirect, special, or consequential
          damages — arising from your use of, inability to use, or reliance on the app or its
          data, even if advised of the possibility of such damages. You use the app entirely at
          your own risk, and your sole and exclusive remedy for any dissatisfaction with the app
          is to stop using it.
        </p>
        <p>
          You are responsible for safeguarding your own data, including keeping backups via the
          app&apos;s export and backup features. Your data is stored only on your device (and, if
          you enable iCloud sync, in your private iCloud Drive); the developer holds no copy and
          cannot recover data that is lost, deleted, or becomes inaccessible for any reason,
          including device loss, OS updates, or app removal.
        </p>
        <p>
          Optional integrations (iCloud, market data providers, Claude, OpenAI, or other providers
          you configure) are third-party services governed by their own terms and privacy
          policies; the developer is not responsible for their availability, accuracy, or conduct.
        </p>
        <p>
          The app is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
          of any kind, express or implied, including merchantability, fitness for a particular
          purpose, and non-infringement. Features may be added, changed, or removed at any time
          without notice, and continued availability of any feature is not guaranteed. By using
          the app you accept these terms in full; if you do not agree, discontinue use.
        </p>
      </div>
    </div>
  )
}

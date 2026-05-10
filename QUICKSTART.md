# Quick Start — Personal Finance Platform

Get up and running in 5 minutes. No terminal needed.

---

## Step 1 — Download & Install

1. Download the installer for your computer:
   - **Windows:** `PersonalFinance-Setup.msi`
   - **macOS:** `PersonalFinance.dmg`

2. Run the installer and follow the prompts.
   - **Windows:** If you see a SmartScreen warning, click **More info → Run anyway**.
   - **macOS:** If macOS blocks the app, go to **System Settings → Privacy & Security** and click **Open Anyway**.

3. Launch **Personal Finance** from your Desktop or Applications folder.

```
[ Screenshot placeholder: Install wizard / first launch screen ]
```

---

## Step 2 — Create Your Account

On first launch you'll see a setup screen. This creates a local account on your computer — your data never leaves your machine.

1. Enter your name (optional), a username, and a password.
2. Click **Create account**.

```
[ Screenshot placeholder: Registration screen ]
```

**You're in.** The dashboard loads with empty charts — that's expected.

```
[ Screenshot placeholder: Empty dashboard after first login ]
```

---

## Step 3 — Add Your Data

You have two ways to add your portfolio:

**Option A — Upload a document**
Go to **Documents** and upload a brokerage statement, 1099-B, or 1099-DIV. The app extracts your holdings automatically.

**Option B — Enter manually**
Go to **Accounts**, create an account (e.g. "Fidelity Brokerage"), then go to **Holdings** and add your positions one by one.

---

## Step 4 — Set Up AI (Optional)

AI features — portfolio analysis, stock insights, risk assessment — require an API key.

1. Go to **Settings → AI Provider**.
2. Select **OpenAI**, paste your API key (from platform.openai.com/api-keys), and click **Save**.

```
[ Screenshot placeholder: Settings / AI Provider configuration screen ]
```

That's it. The AI analysis cards on your dashboard will now populate.

> **Don't have an API key?** All non-AI features (portfolio tracking, net worth, live prices, charts) work without one.

> **Want full privacy?** Select **Ollama** instead and follow the setup instructions in [INSTALL.md](INSTALL.md#optional-use-ollama-for-fully-local-private-ai) to run AI entirely on your computer.

---

## Common First-Time Questions

**Do I need an API key?**
No — it's optional. Portfolio tracking, live stock prices, net worth history, and charts all work without any API key. You only need one if you want the AI analysis features.

**Is my financial data stored in the cloud?**
No. Everything stays on your computer. The app never sends your account balances, holdings, or transactions to any server. If you use OpenAI for AI analysis, your holdings data is sent to OpenAI's servers to generate the analysis — but not stored there. If you use Ollama, even the AI analysis stays fully local.

**Can multiple people use this on one computer?**
Yes. Each person creates their own account (different username and password) and their data is completely separate. Sign out when you're done so the next person can sign in with their own credentials.

**The AI analysis says "unavailable" — what do I do?**
Go to **Settings → AI Provider** and make sure your provider and API key are configured. See the full [Troubleshooting section in INSTALL.md](INSTALL.md#troubleshooting) for more help.

**Where is my data stored? Can I back it up?**
Your data lives in:
- **Windows:** `C:\Users\<you>\AppData\Roaming\Personal Finance\`
- **macOS:** `~/Library/Application Support/Personal Finance/`

Copy that folder to an external drive or cloud storage to back it up.

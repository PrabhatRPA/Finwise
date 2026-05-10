# Installation Guide — Personal Finance Platform

This guide walks you through installing and setting up the Personal Finance desktop app from scratch. No terminal commands are required.

---

## System Requirements

| | Windows | macOS |
|---|---|---|
| **OS version** | Windows 10 or later (64-bit) | macOS 12 Monterey or later |
| **RAM** | 4 GB minimum, 8 GB recommended | 4 GB minimum, 8 GB recommended |
| **Disk space** | ~200 MB for the app | ~200 MB for the app |
| **Internet** | Required for live stock prices and AI features | Required for live stock prices and AI features |

---

## Step 1 — Download and Install the App

### Windows

1. Download **PersonalFinance-Setup.msi** from the releases page (or from wherever you received the link).
2. Double-click the downloaded file. If Windows shows a SmartScreen warning ("Windows protected your PC"), click **More info → Run anyway**. This warning appears because the app is not yet signed with a paid certificate — the app itself is safe.
3. Follow the installer wizard: accept the license, choose an install folder, then click **Install**.
4. When the installer finishes, click **Finish**. A "Personal Finance" shortcut appears on your Desktop and Start Menu.

**You should see:** the installer completes without errors and the app shortcut appears.

### macOS

1. Download **PersonalFinance.dmg** from the releases page (or from wherever you received the link).
2. Double-click the downloaded `.dmg` file to mount it.
3. Drag the **Personal Finance** app icon into your **Applications** folder.
4. Eject the disk image (drag it to the Trash or press Cmd+E).
5. Open **Applications** and double-click **Personal Finance** to launch it.
   - On first launch, macOS may show "Personal Finance can't be opened because Apple cannot check it for malicious software." This happens with apps distributed outside the Mac App Store.
   - To bypass this: open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the Personal Finance entry.

**You should see:** the app opens to a login screen.

---

## Step 2 — First Launch: Create Your Account

The app stores all your financial data locally on your computer. Each person who uses the app on a computer has their own private account — your data is never mixed with anyone else's.

1. When you launch the app for the first time, you will see a **Welcome! Create your account** screen.
2. Enter a **display name** (optional — this is just for the greeting on your dashboard).
3. Choose a **username** (at least 3 characters, e.g. `john`).
4. Choose a **password** (at least 6 characters).
5. Click **Create account**.

**You should see:** the dashboard loads showing empty charts and a "0" net worth — you're ready to start adding data.

> **Can multiple people use this app on one computer?** Yes. Each person can create their own account and their data stays completely separate. Just sign out when you're done and the next person can sign in with their own username.

---

## Step 3 — AI Setup

The app includes AI-powered features: portfolio analysis, stock insights, document extraction from 1099 forms, risk assessment, and market commentary. These features require an AI provider.

### What is an API key?

An API key is like a password that lets the app connect to an AI service on your behalf. Think of it like logging into Netflix — the API key proves you have an account. When the app sends your portfolio data to the AI for analysis, it uses your key, and the charges (if any) go to your account.

### Option A: Enter your OpenAI API key (recommended for most users)

1. Get a free OpenAI account at **platform.openai.com** if you don't already have one.
2. Go to **platform.openai.com/api-keys** and click **Create new secret key**. Copy the key — it starts with `sk-`.
3. In the Personal Finance app, click the **Settings** icon (gear icon) in the navigation.
4. Go to the **AI Provider** section.
5. Select **OpenAI** from the provider dropdown.
6. Paste your API key into the **API Key** field.
7. Click **Save**. The app will confirm the connection is working.

**You should see:** a green "Connected" status next to the AI provider.

> **How much does it cost?** OpenAI charges per use. Typical portfolio analysis costs less than $0.01. Most users spend under $1/month using AI features occasionally. You can set a spending limit in your OpenAI account.

### Option B: No API key — use without AI features

All non-AI features work without any API key: portfolio tracking, net worth calculation, live stock prices, and document uploads. The AI analysis cards will show a "AI not configured" message, and you can still use everything else.

---

### Optional: Use Ollama for fully local, private AI

If you prefer that your financial data never leaves your computer — not even to OpenAI's servers — you can run an AI model locally using **Ollama**. This is a free, open-source tool that runs AI on your own hardware. It requires a reasonably modern computer (8 GB RAM recommended, more is better).

**Step 1: Install Ollama**

1. Go to **[ollama.com](https://ollama.com)** and download the installer for your operating system.
2. Run the installer and follow the prompts. Ollama installs as a background service — you don't need to do anything special to start it.

**Step 2: Download an AI model**

Open a terminal (on Windows: press Win+R, type `cmd`, press Enter; on macOS: open Spotlight and search "Terminal") and run one of the following:

```
ollama pull llama3
```

or, for a smaller model that runs faster on modest hardware:

```
ollama pull mistral
```

> `llama3` is recommended — it gives better financial analysis. The download is about 4 GB. It only downloads once; after that, it works offline.

**Step 3: Switch the app to Ollama**

1. In the app, go to **Settings → AI Provider**.
2. Select **Ollama** from the provider dropdown.
3. The host field should auto-fill with `http://localhost:11434` — leave it as-is unless you installed Ollama on a different computer.
4. In the **Model** field, enter `llama3` (or whichever model you downloaded).
5. Click **Save**.

**You should see:** the AI features now work entirely on your computer, with no data sent to any external server.

---

## Troubleshooting

### The app won't start

- **Windows:** Make sure your Windows is up to date. Try right-clicking the app shortcut and selecting "Run as administrator" once. If it still fails, uninstall and reinstall.
- **macOS:** Check **System Settings → Privacy & Security** for an "Open Anyway" button. Also make sure you're on macOS 12 or later.

### The dashboard loads but shows no data

This is normal on first launch. You need to add accounts and holdings. Use the **Accounts** section to create your first account, then add holdings manually or upload a brokerage statement via **Documents**.

### Port conflict error (advanced)

The app's internal server runs on port 8000. If another program is using that port, the app may fail to start. To check:
- **Windows:** Open Task Manager → Details tab and look for any process using port 8000.
- **macOS:** Open Terminal and run `lsof -i :8000`.

If something is blocking port 8000, close that application and relaunch Personal Finance.

### AI features show "unavailable" or "not responding"

1. Go to **Settings → AI Provider** and confirm your provider and API key are correct.
2. If using OpenAI: verify the key is valid at platform.openai.com (look for a green checkmark). Check that you have billing set up.
3. If using Ollama: make sure Ollama is running (look for the Ollama icon in your system tray / menu bar). Try restarting Ollama and relaunching the app.

### "Invalid or expired token" error

This means your login session has expired (sessions last 24 hours). Simply sign out and sign back in.

### Stock prices not loading

Market data requires an internet connection. Check your connection. If prices still don't load, Yahoo Finance (the primary source) may be temporarily down — the app will try backup sources automatically.

### Lost your password

User accounts are stored locally with no password recovery option (there is no email verification). If you forget your password, a developer can reset it via the command line. For now, keep your password somewhere safe.

---

## How to Update the App

1. Download the new installer (`.msi` on Windows, `.dmg` on macOS) from the releases page.
2. Run the installer. It will replace the old version.
3. Your data (database and uploaded documents) is stored separately from the app files and will not be affected by updates.

You do **not** need to uninstall the old version first on Windows — the installer handles that.

---

## Backing Up Your Data

All your financial data is stored in a SQLite database on your local computer. The app never uploads it anywhere. To back up your data:

### Where is the data stored?

| Platform | Location |
|---|---|
| **Windows** | `C:\Users\<your-username>\AppData\Roaming\Personal Finance\` |
| **macOS** | `~/Library/Application Support/Personal Finance/` |

Inside that folder you will find:
- `database/finance.db` — your entire database (accounts, holdings, transactions, net worth history)
- `uploads/` — copies of any documents you've uploaded (1099s, brokerage statements)

### How to back up

**Simple method:** Copy the entire `Personal Finance` folder (shown above) to an external drive or cloud storage of your choice. Do this periodically — monthly or before updating the app.

**Restore:** To restore, close the app, replace the folder contents with your backup, and relaunch.

---

## Switching AI Providers

You can change your AI provider at any time without losing any data. Go to **Settings → AI Provider** in the app and select from:

| Provider | Best for | Requires |
|---|---|---|
| **OpenAI** (GPT-4o) | High-quality analysis, easy setup | OpenAI API key |
| **Claude** (Anthropic) | Alternative cloud AI | Anthropic API key |
| **Ollama** | 100% local and private, no data leaves your computer | Ollama installed + model downloaded |
| **LM Studio** | Local AI with a graphical model manager | LM Studio app + model |

Changes take effect immediately — no restart required.

# Distribution Guide — Personal Finance Platform

This guide covers everything you need to build release binaries, sign them, and share the app with others.

---

## Building Release Binaries

### Prerequisites

Make sure these are installed on the machine you're building on:

- **Python 3.11+** with pip
- **Node.js 18+** with npm
- **Rust toolchain** — install from [rustup.rs](https://rustup.rs)
- **Tauri CLI** — `cargo install tauri-cli`

### Build (macOS / Linux)

```bash
chmod +x scripts/build.sh
./scripts/build.sh
```

### Build (Windows)

```bat
scripts\build.bat
```

Both scripts do the same three things in order:
1. Bundle the Python backend with PyInstaller into a single executable.
2. Build the Next.js frontend as a static export.
3. Run `cargo tauri build` to package everything into a native installer.

### Build Artifacts

After a successful build:

| Platform | Installer location |
|---|---|
| **macOS** | `frontend-tauri/src-tauri/target/release/bundle/dmg/*.dmg` |
| **macOS (app bundle)** | `frontend-tauri/src-tauri/target/release/bundle/macos/*.app` |
| **Windows (MSI)** | `frontend-tauri/src-tauri/target/release/bundle/msi/*.msi` |
| **Windows (NSIS exe)** | `frontend-tauri/src-tauri/target/release/bundle/nsis/*.exe` |

The `.dmg` and `.msi` files are what you distribute to users.

---

## Code Signing

### macOS

Unsigned `.dmg` files trigger a macOS Gatekeeper warning on first launch. Users can bypass it via System Settings → Privacy & Security, but signing avoids the friction entirely.

**Requirements:** An Apple Developer account ($99/year) and a "Developer ID Application" certificate in your Keychain.

**Sign the app bundle:**
```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  --options runtime \
  "frontend-tauri/src-tauri/target/release/bundle/macos/Personal Finance.app"
```

**Notarize (required for distribution outside the App Store):**
```bash
xcrun notarytool submit \
  "frontend-tauri/src-tauri/target/release/bundle/dmg/Personal Finance_0.1.0_aarch64.dmg" \
  --apple-id "your@apple.com" \
  --team-id "YOURTEAMID" \
  --password "app-specific-password" \
  --wait

xcrun stapler staple "frontend-tauri/src-tauri/target/release/bundle/dmg/Personal Finance_0.1.0_aarch64.dmg"
```

Alternatively, set these environment variables before running the build script and Tauri handles signing and notarization automatically:
```bash
export APPLE_CERTIFICATE="base64-encoded-p12"
export APPLE_CERTIFICATE_PASSWORD="p12-password"
export APPLE_ID="your@apple.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOURTEAMID"
```

See the [Tauri code signing docs](https://v2.tauri.app/distribute/sign/macos/) for full details.

### Windows

Windows code signing requires an EV (Extended Validation) code signing certificate from a CA like DigiCert or Sectigo. These cost $200–$500/year and require identity verification.

For personal/small-group sharing, the unsigned `.msi` works fine — users just need to click "More info → Run anyway" in the SmartScreen dialog once.

If you do have a certificate, Tauri picks it up automatically if you configure `tauri.conf.json`:
```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

---

## Distribution Options

### Option 1: Direct file sharing (simplest)

Upload the `.dmg` and `.msi` files to any file sharing service (Dropbox, Google Drive, iCloud Drive, WeTransfer) and share the download link directly. Best for sharing with a small group of known users.

### Option 2: GitHub Releases (recommended)

GitHub Releases gives you a versioned download page, release notes, and download tracking for free.

1. Push your code to a GitHub repository (can be private).
2. Create a release:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. Go to your repo on GitHub → **Releases → Draft a new release**.
4. Select the `v0.1.0` tag, write release notes, and upload the `.dmg` and `.msi` files as release assets.
5. Publish the release. Users get a stable download URL like:
   `https://github.com/yourname/personal-finance/releases/latest`

### Option 3: Simple download page

For a more polished experience without GitHub, upload the installers to any static hosting (Netlify, Vercel, GitHub Pages, Cloudflare Pages) and create a simple `index.html` with download buttons.

---

## API Key Strategy: Ship a Key vs. Users Bring Their Own

This is the most important distribution decision. Here are the tradeoffs:

### Ship with a pre-configured API key (easy for users)

Bake your own OpenAI or Claude API key into the app bundle by including it in the `backend/.env` file before building with PyInstaller.

**Pros:**
- Zero setup for end users — AI features work immediately after install.
- No need to explain API keys.

**Cons:**
- Your key is embedded in the binary (even obfuscated, it can be extracted).
- All users share your rate limits and you pay for all usage.
- If the key leaks or is abused, you bear the cost.
- OpenAI's Terms of Service require that embedded keys not be used to bypass their billing.

**How to configure:** Create `backend/.env` before running the build:
```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o
```

**Recommendation:** Only do this for a small, trusted group where you control who has the installer. Set a spending cap on the API account.

### Require users to bring their own key (more private, no cost to you)

Ship without any key configured. On first use, AI features show a "Configure AI provider" prompt directing users to Settings.

**Pros:**
- No ongoing cost to you.
- Users' API usage and data is billed to their own account.
- No key leak risk for you.

**Cons:**
- Users need an OpenAI account and must find their API key.
- Slightly more friction on first setup.

**Recommendation:** Best for any wider distribution. Users who want AI features are generally comfortable getting an API key; users who don't can still use all non-AI features.

### Hybrid: Ship with a key, let users override

Ship with a key as a fallback, but prominently surface the Settings page so users can enter their own key. This is the best UX balance for small-group sharing where you want zero friction but also don't want to absorb costs forever.

---

## Version Bumping

The version is defined in **two places** — keep them in sync:

| File | Field |
|---|---|
| `frontend-tauri/tauri.conf.json` | `"version": "0.1.0"` |
| `frontend-tauri/src-tauri/Cargo.toml` | `version = "0.1.0"` |

Update both files, then rebuild. The version appears in the installer filename and in the app's About dialog.

**Example for v0.2.0:**
```bash
# In tauri.conf.json:
"version": "0.2.0"

# In Cargo.toml:
version = "0.2.0"

# Tag and build:
git tag v0.2.0
./scripts/build.sh
```

---

## Cross-Platform Builds

Tauri must be built on the target platform — you cannot build a macOS `.dmg` on Windows or vice versa. Options:

- **GitHub Actions CI:** Set up a workflow with `macos-latest` and `windows-latest` runners to build both in parallel on each release. See the [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action) for a ready-made workflow.
- **Separate machines:** Build on each platform and upload both artifacts to the same GitHub Release.

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle ID kept as com.finwise.app so existing on-device SQLite data
  // survives the rename. The display name (CFBundleDisplayName) is the
  // string the user actually sees on the springboard — that's now Nworth.
  appId: 'com.finwise.app',
  appName: 'Nworth',
  // Next.js static export output directory (set by `output: 'export'` in next.config.js)
  webDir: 'out',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    CapacitorCookies: {
      enable: true,
    },
    CapacitorHttp: {
      enable: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1a2e',
    },
    Keyboard: {
      // 'native' shrinks the WebView frame to the area above the keyboard, so
      // full-height / vertically-centered layouts (login, register, modals)
      // reflow upward on their own instead of hiding behind the keyboard.
      // The KeyboardManager additionally scrolls the focused field into view.
      resize: 'native',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
    },
  },
  ios: {
    // 'never' = let the body fill the viewport edge-to-edge. We handle the
    // safe-area inset ourselves in CSS (navbar padding-top extends its dark
    // background behind the status bar). 'automatic' was pushing the body
    // DOWN by the inset and exposing the WebView's default white background
    // above it — that's the white band the user reported.
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    // Backstop: tint the WebView itself black so any brief gap during the
    // app launch / rotation doesn't flash white in dark mode. The body's
    // bg-background paints over this for the actual content.
    backgroundColor: '#0a0f1d',
  },
};

export default config;

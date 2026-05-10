{
  "$schema": "https://cli Capacitor schema.json",
  "appId": "com.personalfinance.app",
  "appName": "Personal Finance",
  "webDir": ".next",
  "bundledWebRuntime": false,
  "plugins": {
    "CapacitorCookies": {
      "enable": true
    },
    "CapacitorHttp": {
      "enable": true
    }
  },
  "server": {
    "androidScheme": "https"
  },
  "ios": {
    "webView": {
      "preferredChromeEarliestVersion": "100"
    }
  },
  "android": {
    "webView": {
      "preferredChromeEarliestVersion": "100"
    }
  }
}

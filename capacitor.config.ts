import type { CapacitorConfig } from "@capacitor/cli";

// The Android app opens the live Evoke site inside a native shell, and adds the
// native Google Play Billing used by the Family plan.
const config: CapacitorConfig = {
  appId: "com.booostglobal.evoke",
  appName: "Evoke",
  webDir: "www", // only used as an offline fallback page
  server: {
    url: "https://evoke.booostglobal.com",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // The server acknowledges purchases after it has switched the plan on.
    NativePurchases: { autoFinishTransactions: false },
  },
};

export default config;

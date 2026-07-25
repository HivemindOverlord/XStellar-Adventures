import type { CapacitorConfig } from "@capacitor/cli";

// CAP_SERVER_URL points the Android WebView at the live, Vercel-hosted build
// instead of bundled assets — pushing to `main` updates every installed app
// instantly, no store review needed. Only unset this (falling back to the
// bundled dist/) for a fully offline shell, which this game doesn't support
// anyway since it requires the multiplayer server.
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.portertech.xstellaradventures",
  appName: "XStellar Adventures",
  webDir: "dist",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
      }
    : undefined,
};

export default config;

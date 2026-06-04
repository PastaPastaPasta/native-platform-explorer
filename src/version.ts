// Populated at build time from package.json. Keep this file in sync manually;
// future stages may automate this.
export const APP_VERSION = '0.1.0';

// Injected by next.config.mjs from the installed @dashevo/evo-sdk package.json,
// so it always reflects the SDK the bundle was compiled against. Falls back to
// 'unknown' if the env var is absent (e.g. a test runner that bypasses Next).
export const EVO_SDK_VERSION = process.env.NEXT_PUBLIC_EVO_SDK_VERSION ?? 'unknown';

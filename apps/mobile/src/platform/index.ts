// Picks the platform. The native one (modules/kantv-tv: TCP/TLS sockets, keystore, mDNS) is built with the
// Android SDK; until it is, and always on the web, where a browser cannot open a socket to a TV, the app runs
// the demo and says so on every screen.
import { demoPlatform } from "./demo";
import type { Platform } from "./types";

export const platform: Platform = demoPlatform;
export type * from "./types";

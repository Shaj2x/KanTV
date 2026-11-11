// Picks the platform. The native one (modules/kantv-tv: TCP/TLS sockets, keystore, mDNS) is built with the
// Android SDK; until it is, and always on the web, where a browser cannot open a socket to a TV, the TV side
// runs the demo and says so on every screen. The account side (sign-in, trial, AI designer, passes) is the real
// backend whenever the build is configured for it (see src/auth.tsx).
import { backendAccount, backendDesigner } from "../api";
import { accessToken, apiUrl, live } from "../auth";
import { demoPlatform } from "./demo";
import type { Platform } from "./types";

export const platform: Platform = live
  ? { ...demoPlatform, designer: backendDesigner(apiUrl!, accessToken), account: backendAccount(apiUrl!, accessToken) }
  : demoPlatform;
export type * from "./types";

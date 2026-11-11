// Sign-in, through Supabase Auth: an email and a six-digit code, no password. Live only when the build has a
// Supabase project and the KanTV API (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY, EXPO_PUBLIC_KANTV_API_URL);
// the key is the project's publishable key, which is meant to ship in apps. Without them the app runs the preview.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRootNavigationState, useRouter } from "expo-router";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const apiUrl = process.env.EXPO_PUBLIC_KANTV_API_URL?.replace(/\/+$/, "");

export const supabase: SupabaseClient | null =
  url && key && apiUrl
    ? createClient(url, key, {
        auth: {
          // The browser's own storage on the web; AsyncStorage on phones.
          storage: Platform.OS === "web" ? undefined : AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

/** True when the app talks to the real account backend. */
export const live = supabase !== null;

/** The current access token, refreshed when needed; throws when signed out. */
export async function accessToken(): Promise<string> {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw new Error("signed-out");
  return data.session.access_token;
}

export type CodeResult = "sent" | "invalid-email" | "too-many" | "offline";
export type VerifyResult = "ok" | "wrong-code" | "too-many" | "offline";

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function sendCode(email: string): Promise<CodeResult> {
  if (!isEmail(email)) return "invalid-email";
  try {
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) return "sent";
    return error.status === 429 ? "too-many" : error.status && error.status < 500 ? "invalid-email" : "offline";
  } catch {
    return "offline";
  }
}

export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  try {
    const { data, error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
    if (!error && data.session) return "ok";
    if (error?.status === 429) return "too-many";
    // Supabase answers a wrong code and an expired one the same way ("otp_expired").
    return error && error.status && error.status < 500 ? "wrong-code" : "offline";
  } catch {
    return "offline";
  }
}

/** Signs out. After the account was deleted there is no session left on the server: just forget it here. */
export async function signOut(onlyThisDevice = false) {
  await supabase?.auth.signOut(onlyThisDevice ? { scope: "local" } : undefined);
}

interface AuthState {
  /** False until the stored session has been read. */
  ready: boolean;
  session: Session | null;
}

const Ctx = createContext<AuthState>({ ready: true, session: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: !supabase, session: null });
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setState({ ready: true, session: data.session }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setState({ ready: true, session }));
    return () => data.subscription.unsubscribe();
  }, []);
  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The signed-in state. In the preview there is no account and everything is open. */
export function useAuth() {
  const s = useContext(Ctx);
  return { ...s, live, signedIn: !live || !!s.session, email: s.session?.user.email ?? null };
}

/**
 * For screens that need an account (setup, which starts the trial; the designer; plans): sends a signed-out
 * person to sign in first, and back here after. Returns true once the screen may load account data.
 */
export function useRequireSignIn(here: string): boolean {
  const { ready, signedIn } = useAuth();
  const router = useRouter();
  // On a cold start straight onto this screen, navigating has to wait until the navigator is up.
  const navReady = !!useRootNavigationState()?.key;
  // Signed in here and then not (signed out, account deleted): that was on purpose, so go home.
  const was = useRef(false);
  if (ready && signedIn) was.current = true;
  useEffect(() => {
    if (!navReady || !ready || signedIn) return;
    if (was.current) router.replace("/");
    else router.replace({ pathname: "/signin", params: { next: here } });
  }, [navReady, ready, signedIn, here, router]);
  return ready && signedIn;
}

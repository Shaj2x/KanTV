// The TV being set up, carried from screen to screen. Async work (connecting, planning, applying) lives in
// the screens; this only holds what they found out.
import type { DebloatResult, DisablePlan, Feed, FeedList, FeedModel, HouseholdIds, ListChoice, TvIdentity } from "@kantv/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { FoundTv, TvConnection } from "./platform";

export interface Session {
  tv?: FoundTv;
  connection?: TvConnection;
  identity?: TvIdentity;
  household?: HouseholdIds;
  feed?: Feed;
  model?: FeedModel;
  list?: FeedList;
  answers: Record<string, boolean>;
  unticked: string[];
  choice?: ListChoice;
  preview?: DisablePlan;
  result?: Extract<DebloatResult, { ok: true }>;
  closed?: "closed" | "open" | "unknown";
}

const Ctx = createContext<{ s: Session; set: (patch: Partial<Session>) => void; reset: () => void } | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Session>({ answers: {}, unticked: [] });
  const value = useMemo(
    () => ({
      s,
      set: (patch: Partial<Session>) => setS((prev) => ({ ...prev, ...patch })),
      reset: () => setS({ answers: {}, unticked: [] }),
    }),
    [s],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

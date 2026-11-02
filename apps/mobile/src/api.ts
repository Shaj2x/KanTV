// The backend client the real app uses on phones and on the web: the designer, the account's entitlement and
// design history. Every call carries the identity provider's token; the AI key stays on the server.
import type { Design, DesignFailure, Designer, Entitlement } from "./platform/types";

const FAILURES = new Set<DesignFailure>(["subscription-required", "daily-limit", "too-fast", "busy", "design-refused", "design-invalid", "design-truncated"]);

export function backendDesigner(baseUrl: string, token: () => Promise<string>): Designer {
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> => {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    } catch {
      return { status: 0, json: { error: "offline" } };
    }
  };
  const designOr = (r: { status: number; json: any }): Design | DesignFailure =>
    r.status === 200 ? (r.json.design as Design) : FAILURES.has(r.json.error) ? r.json.error : "offline";

  return {
    live: true,
    entitlement: async () => (await call("GET", "/v1/me")).json as Entitlement,
    design: async (request, installedApps, exact) => designOr(await call("POST", "/v1/me/designs", { request, installedApps, exact })),
    regenerate: async (id, installedApps) => designOr(await call("POST", `/v1/me/designs/${id}/regenerate`, { installedApps })),
    list: async () => ((await call("GET", "/v1/me/designs")).json.designs ?? []) as Design[],
    apply: async (id, household, instance) => {
      const r = await call("POST", `/v1/me/designs/${id}/apply`, { household, instance });
      return r.status === 200 ? r.json : FAILURES.has(r.json.error) ? r.json.error : "offline";
    },
  };
}

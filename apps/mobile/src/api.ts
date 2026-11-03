// The backend client the real app uses on phones and on the web: the designer, the account's entitlement and
// design history. Every call carries the identity provider's token; the AI key stays on the server.
import type { Account, Design, DesignFailure, Designer, Entitlement } from "./platform/types";

const FAILURES = new Set<DesignFailure>(["subscription-required", "daily-limit", "too-fast", "busy", "design-refused", "design-invalid", "design-truncated"]);

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function caller(baseUrl: string, token: () => Promise<string>, fetchImpl: Fetch) {
  return async (method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> => {
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    } catch {
      return { status: 0, json: { error: "offline" } };
    }
  };
}

export function backendDesigner(baseUrl: string, token: () => Promise<string>, fetchImpl: Fetch = fetch): Designer {
  const call = caller(baseUrl, token, fetchImpl);
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

export function backendAccount(baseUrl: string, token: () => Promise<string>, fetchImpl: Fetch = fetch): Account {
  const call = caller(baseUrl, token, fetchImpl);
  return {
    async registerTv(ids, model) {
      const r = await call("POST", "/v1/me/tvs", { ...ids, model: model.slice(0, 200) });
      return r.status === 200 ? r.json : "offline";
    },
    async lease(household, instance) {
      const r = await call("POST", "/v1/me/leases", { household, instance });
      if (r.status === 200) return { lease: r.json.lease, expiresAt: r.json.expiresAt };
      return r.json?.error === "subscription-required" ? "subscription-required" : "offline";
    },
    async exportData() {
      const r = await call("GET", "/v1/me/export");
      return r.status === 200 ? r.json : "offline";
    },
    async deleteAccount() {
      return (await call("DELETE", "/v1/me")).status === 200;
    },
  };
}

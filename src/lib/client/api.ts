"use client";
/**
 * Browser API client. Every call goes through the SDK's secureFetch, which replaces the managed
 * `Bearer` token with `DPoP <token>` plus a signed proof (see @tidecloak/js IAMService.secureFetch).
 * Responses are never cached or persisted. A network/timeout failure is reported as "could not verify
 * access" and never treated as success.
 */
import { useCallback } from "react";
import { useTideCloak } from "@tidecloak/nextjs";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const TIMEOUT_MS = 10_000;

export function useApi() {
  const { secureFetch, getToken } = useTideCloak();
  return useCallback(
    async <T = unknown>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
      const token = await getToken();
      if (!token) throw new ApiError(401, "unauthenticated", "Your session could not be verified. Please sign in again.");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await secureFetch(`${window.location.origin}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          cache: "no-store",
          signal: ctrl.signal,
        });
      } catch (e) {
        const timedOut = e instanceof DOMException && e.name === "AbortError";
        throw new ApiError(0, timedOut ? "timeout" : "network", timedOut
          ? "The server did not answer within 10 seconds. Access could not be verified; nothing was shown."
          : "The server could not be reached. Access could not be verified; nothing was shown.");
      } finally {
        clearTimeout(timer);
      }
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) throw new ApiError(res.status, String(data.error ?? "error"), String(data.message ?? `Request failed (${res.status}).`));
      return data as T;
    },
    [secureFetch, getToken],
  );
}

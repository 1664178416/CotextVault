/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

let addRuntimeMessageListener: ReturnType<typeof vi.fn>;

describe("content script startup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.querySelectorAll("script").forEach((script) => script.remove());
    vi.resetModules();
    vi.restoreAllMocks();
    addRuntimeMessageListener = vi.fn();

    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      writable: true,
      value: {
        runtime: {
          getURL: (path: string) => `chrome-extension://contextvault/${path}`,
          onMessage: {
            addListener: addRuntimeMessageListener
          }
        }
      }
    });
  });

  it("does not inject the MAIN world network interceptor by default", async () => {
    await import("../content-script");

    expect(document.querySelector('script[src$="main-world/interceptor.js"]')).toBeNull();
    expect(addRuntimeMessageListener).toHaveBeenCalledTimes(1);
  });

  it("can explicitly inject the MAIN world interceptor when enabled", async () => {
    const { maybeInjectMainWorldInterceptor } = await import("../content-script");

    const injected = maybeInjectMainWorldInterceptor({ enabled: true });

    expect(injected).toBe(true);
    expect(
      document.querySelector('script[src="chrome-extension://contextvault/main-world/interceptor.js"]')
    ).not.toBeNull();
  });

  it("injects the MAIN world interceptor at most once per content script lifecycle", async () => {
    const { maybeInjectMainWorldInterceptor } = await import("../content-script");

    expect(maybeInjectMainWorldInterceptor({ enabled: true })).toBe(true);
    expect(maybeInjectMainWorldInterceptor({ enabled: true })).toBe(false);
    expect(document.querySelectorAll('script[src="chrome-extension://contextvault/main-world/interceptor.js"]')).toHaveLength(1);
  });

  it("requires MAIN world messages to come from the current window origin", async () => {
    const { isMainWorldMessageFromCurrentOrigin } = await import("../content-script");

    expect(isMainWorldMessageFromCurrentOrigin({ source: window, origin: window.location.origin })).toBe(true);
    expect(isMainWorldMessageFromCurrentOrigin({ source: window, origin: "https://example.invalid" })).toBe(false);
    expect(isMainWorldMessageFromCurrentOrigin({ source: null, origin: window.location.origin })).toBe(false);
  });
});

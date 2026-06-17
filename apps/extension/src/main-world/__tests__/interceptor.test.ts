/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { isMainWorldNetworkCaptureEnabled } from "../capture-policy";

describe("MAIN world interceptor", () => {
  it("keeps network capture disabled until a non-forgeable opt-in path exists", () => {
    expect(isMainWorldNetworkCaptureEnabled()).toBe(false);
  });

  it("does not patch fetch or XMLHttpRequest while capture policy is disabled", async () => {
    vi.resetModules();
    const originalFetch = window.fetch;
    const OriginalXhr = window.XMLHttpRequest;

    await import("../interceptor");
    const descriptor = Object.getOwnPropertyDescriptor(window, "__CONTEXTVAULT_MAIN_WORLD_INTERCEPTOR_INSTALLED__");

    expect(window.__CONTEXTVAULT_MAIN_WORLD_INTERCEPTOR_INSTALLED__).toBe(true);
    expect(window.fetch).toBe(originalFetch);
    expect(window.XMLHttpRequest).toBe(OriginalXhr);
    expect(descriptor).toMatchObject({
      configurable: false,
      value: true,
      writable: false
    });
  });
});

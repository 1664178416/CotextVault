import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRuntimeMessage } from "../api";

const originalChrome = globalThis.chrome;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.chrome = originalChrome;
});

describe("side panel runtime API", () => {
  it("reports a clear error outside the Chrome extension runtime", async () => {
    Reflect.deleteProperty(globalThis, "chrome");

    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow(
      "ContextVault side panel must run inside the Chrome extension runtime."
    );
  });

  it("surfaces chrome runtime errors", async () => {
    globalThis.chrome = {
      runtime: {
        lastError: { message: "Extension context invalidated." },
        sendMessage: vi.fn((_request, callback) => callback(undefined))
      }
    } as unknown as typeof chrome;

    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow(
      "Extension context invalidated."
    );
  });

  it("redacts protected chrome runtime error values", async () => {
    globalThis.chrome = {
      runtime: {
        lastError: { message: "Failed for alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456" },
        sendMessage: vi.fn((_request, callback) => callback(undefined))
      }
    } as unknown as typeof chrome;

    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow("api_key=[REDACTED_SECRET]");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.not.toThrow("alice@example.com");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.not.toThrow(
      "sk-abcdefghijklmnopqrstuvwxyz123456"
    );
  });

  it("redacts protected runtime response error values", async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((_request, callback) =>
          callback({
            ok: false,
            error: "Import failed for alice@example.com with api_key = sk-abcdefghijklmnopqrstuvwxyz123456"
          })
        )
      }
    } as unknown as typeof chrome;

    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow("[REDACTED_EMAIL]");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.toThrow("api_key=[REDACTED_SECRET]");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.not.toThrow("alice@example.com");
    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).rejects.not.toThrow(
      "sk-abcdefghijklmnopqrstuvwxyz123456"
    );
  });

  it("resolves successful runtime responses", async () => {
    const context = {
      provider: "chatgpt" as const,
      supported: true,
      title: "ContextVault"
    };

    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn((_request, callback) => callback({ ok: true, data: context }))
      }
    } as unknown as typeof chrome;

    await expect(sendRuntimeMessage({ type: "GET_ACTIVE_TAB_CONTEXT" })).resolves.toEqual(context);
  });
});

import { describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "../clipboard-state";

describe("side panel clipboard state", () => {
  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const result = await copyTextToClipboard("Relevant Context", {
      clipboard: { writeText }
    });

    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("Relevant Context");
  });

  it("falls back to a temporary textarea when Clipboard API fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const removed: string[] = [];
    const previousActiveElement = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
      selectionStart: 2,
      selectionEnd: 5
    };
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(() => removed.push("removed"))
    } as unknown as HTMLTextAreaElement;
    const documentRef = {
      activeElement: previousActiveElement,
      createElement: vi.fn(() => textarea),
      body: {
        appendChild: vi.fn()
      },
      execCommand: vi.fn(() => true)
    } as unknown as Document;
    const result = await copyTextToClipboard("Fallback Context", {
      clipboard: { writeText },
      document: documentRef
    });

    expect(result).toEqual({ ok: true });
    expect(documentRef.createElement).toHaveBeenCalledWith("textarea");
    expect(documentRef.execCommand).toHaveBeenCalledWith("copy");
    expect(removed).toEqual(["removed"]);
    expect(previousActiveElement.focus).toHaveBeenCalledTimes(1);
    expect(previousActiveElement.setSelectionRange).toHaveBeenCalledWith(2, 5);
  });

  it("returns a safe fallback error when the textarea path throws unexpectedly", async () => {
    const previousActiveElement = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
      selectionStart: 1,
      selectionEnd: 3
    };

    const result = await copyTextToClipboard("Fallback Context", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied"))
      },
      document: {
        activeElement: previousActiveElement,
        createElement: vi.fn(() => {
          throw new Error("create failed");
        }),
        body: {
          appendChild: vi.fn()
        },
        execCommand: vi.fn()
      } as unknown as Document
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Clipboard copy failed");
      expect(result.error).not.toContain("create failed");
    }
    expect(previousActiveElement.focus).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error without leaking copied text when all copy paths fail", async () => {
    const result = await copyTextToClipboard("secret=sk-abcdefghijklmnopqrstuvwxyz123456", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied"))
      }
    });

    if (result.ok) {
      throw new Error("Expected clipboard copy to fail.");
    }

    expect(result.error).toContain("Clipboard copy failed");
    expect(result.error).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });
});

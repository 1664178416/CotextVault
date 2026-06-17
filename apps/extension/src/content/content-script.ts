import { isContentRequest, isMainWorldNetworkMessage } from "@contextvault/shared";
import type { ApiResponse, ContentRequest, ContentResponseMap } from "@contextvault/shared";
import { sanitizeRuntimeErrorMessage } from "../runtime-errors";
import { captureConversationFromDom } from "./dom-capture";

let hasStarted = false;
let mainWorldInterceptorInjectionStarted = false;

startContentScript();

export function startContentScript(): void {
  if (hasStarted) {
    return;
  }

  hasStarted = true;
  maybeInjectMainWorldInterceptor({ enabled: false });

  window.addEventListener("message", handleMainWorldMessage);

  chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
    if (!isContentRequest(request)) {
      sendResponse({ ok: false, error: "Invalid ContextVault content request." });
      return false;
    }

    handleContentRequest(request)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : undefined;
        sendResponse({ ok: false, error: sanitizeRuntimeErrorMessage(message, "Unknown content script error") });
      });

    return true;
  });
}

function handleMainWorldMessage(event: MessageEvent): void {
  if (!isMainWorldMessageFromCurrentOrigin(event)) {
    return;
  }

  if (!isMainWorldNetworkMessage(event.data)) {
    return;
  }

  // Network fragments are intentionally not persisted in the MVP. The bridge is
  // intentionally disabled by default because MAIN world patching is a higher
  // risk capture path and should only be enabled by explicit user choice later.
}

export function isMainWorldMessageFromCurrentOrigin(event: Pick<MessageEvent, "source" | "origin">): boolean {
  return event.source === window && event.origin === window.location.origin;
}

async function handleContentRequest<T extends ContentRequest>(
  request: T
): Promise<ContentResponseMap[T["type"]]> {
  switch (request.type) {
    case "CAPTURE_DOM":
      return captureConversationFromDom(request.provider) as ContentResponseMap[T["type"]];
    default:
      throw new Error("Unsupported content request");
  }
}

export function maybeInjectMainWorldInterceptor(options: { enabled: boolean }): boolean {
  if (!options.enabled) {
    return false;
  }

  if (mainWorldInterceptorInjectionStarted) {
    return false;
  }

  mainWorldInterceptorInjectionStarted = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("main-world/interceptor.js");
  script.async = false;
  script.onload = () => script.remove();
  script.onerror = () => script.remove();

  const target = document.documentElement ?? document.head;

  if (target) {
    target.appendChild(script);
    return true;
  }

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      document.documentElement.appendChild(script);
    },
    { once: true }
  );

  return true;
}

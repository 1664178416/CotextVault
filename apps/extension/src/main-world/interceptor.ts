import {
  isLikelyCapturableNetworkResponse,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  truncateToCodePointBoundary
} from "@contextvault/shared";
import { isMainWorldNetworkCaptureEnabled } from "./capture-policy";
import { readResponseTextUpTo } from "./network-text";

type NetworkPayload = {
  url: string;
  method: string;
  status: number;
  contentType: string;
  text: string;
  capturedAt: string;
};

export {};

declare global {
  interface Window {
    __CONTEXTVAULT_MAIN_WORLD_INTERCEPTOR_INSTALLED__?: boolean;
  }
}

const INSTALL_MARKER = "__CONTEXTVAULT_MAIN_WORLD_INTERCEPTOR_INSTALLED__";

if (!window[INSTALL_MARKER]) {
  Object.defineProperty(window, INSTALL_MARKER, {
    value: true,
    writable: false,
    configurable: false
  });

  if (isMainWorldNetworkCaptureEnabled()) {
    installFetchPatch();
    installXhrPatch();
  }
}

function installFetchPatch(): void {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (!isMainWorldNetworkCaptureEnabled()) {
      return response;
    }

    try {
      const request = args[0];
      const init = args[1];
      const rawUrl = typeof request === "string" ? request : request instanceof Request ? request.url : String(request);
      const url = normalizeNetworkUrl(rawUrl);
      const method = normalizeNetworkMethod(init?.method ?? (request instanceof Request ? request.method : "GET"));
      const contentType = response.headers.get("content-type") ?? "";

      if (url && shouldCapture(url, contentType)) {
        const { text } = await readResponseTextUpTo(response, MAX_SOURCE_TURN_TEXT_LENGTH);
        emitNetworkPayload({
          url,
          method,
          status: response.status,
          contentType,
          text,
          capturedAt: new Date().toISOString()
        });
      }
    } catch {
      // MAIN world capture is best-effort and must never break the page.
    }

    return response;
  };
}

function installXhrPatch(): void {
  const OriginalXhr = window.XMLHttpRequest;

  class ContextVaultXMLHttpRequest extends OriginalXhr {
    private contextVaultUrl = "";
    private contextVaultMethod = "GET";

    open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
      this.contextVaultMethod = normalizeNetworkMethod(method);
      this.contextVaultUrl = normalizeNetworkUrl(String(url)) ?? "";
      super.open(method, url, async ?? true, username ?? undefined, password ?? undefined);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      this.addEventListener("load", () => {
        if (!isMainWorldNetworkCaptureEnabled()) {
          return;
        }

        try {
          const contentType = this.getResponseHeader("content-type") ?? "";

          if (!shouldCapture(this.contextVaultUrl, contentType) || typeof this.responseText !== "string") {
            return;
          }

          emitNetworkPayload({
            url: this.contextVaultUrl,
            method: this.contextVaultMethod,
            status: this.status,
            contentType,
            text: truncateToCodePointBoundary(this.responseText, MAX_SOURCE_TURN_TEXT_LENGTH),
            capturedAt: new Date().toISOString()
          });
        } catch {
          // Keep page behavior intact.
        }
      });

      super.send(body);
    }
  }

  window.XMLHttpRequest = ContextVaultXMLHttpRequest;
}

function shouldCapture(url: string, contentType: string): boolean {
  return isLikelyCapturableNetworkResponse(url, contentType);
}

function normalizeNetworkUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, window.location.href);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }

    return parsed.href;
  } catch {
    return undefined;
  }
}

function normalizeNetworkMethod(method: string): string {
  return method.toUpperCase();
}

function emitNetworkPayload(payload: NetworkPayload): void {
  window.postMessage(
    {
      source: "contextvault-main-world",
      type: "NETWORK_RESPONSE",
      payload
    },
    window.location.origin
  );
}

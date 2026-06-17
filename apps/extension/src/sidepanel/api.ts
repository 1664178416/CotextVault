import type { ApiResponse, RuntimeRequest, RuntimeResponseMap } from "@contextvault/shared";
import { sanitizeRuntimeErrorMessage } from "../runtime-errors";

export function sendRuntimeMessage<T extends RuntimeRequest>(
  request: T
): Promise<RuntimeResponseMap[T["type"]]> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("ContextVault side panel must run inside the Chrome extension runtime."));
      return;
    }

    chrome.runtime.sendMessage(request, (response: ApiResponse<RuntimeResponseMap[T["type"]]> | undefined) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(sanitizeRuntimeErrorMessage(error.message, "Extension runtime error.")));
        return;
      }

      if (!response) {
        reject(new Error("No response from extension runtime."));
        return;
      }

      if (!response.ok) {
        reject(new Error(sanitizeRuntimeErrorMessage(response.error, "Extension runtime error.")));
        return;
      }

      resolve(response.data);
    });
  });
}

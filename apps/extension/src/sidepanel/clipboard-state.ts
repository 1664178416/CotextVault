export type ClipboardCopyResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export interface ClipboardCopyEnvironment {
  clipboard?: Pick<Clipboard, "writeText">;
  document?: Pick<Document, "activeElement" | "createElement" | "body" | "execCommand">;
}

export async function copyTextToClipboard(
  text: string,
  environment: ClipboardCopyEnvironment = {
    clipboard: globalThis.navigator?.clipboard,
    document: globalThis.document
  }
): Promise<ClipboardCopyResult> {
  if (!text) {
    return {
      ok: false,
      error: "No text is available to copy."
    };
  }

  const clipboardResult = await tryClipboardApi(text, environment.clipboard);

  if (clipboardResult.ok) {
    return clipboardResult;
  }

  const fallbackResult = tryTextareaFallback(text, environment.document);

  if (fallbackResult.ok) {
    return fallbackResult;
  }

  return {
    ok: false,
    error: "Clipboard copy failed. Use redacted export or try copying again from a focused side panel."
  };
}

async function tryClipboardApi(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined
): Promise<ClipboardCopyResult> {
  if (!clipboard?.writeText) {
    return {
      ok: false,
      error: "Clipboard API is unavailable."
    };
  }

  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Clipboard API rejected the copy request."
    };
  }
}

function tryTextareaFallback(
  text: string,
  documentRef: Pick<Document, "activeElement" | "createElement" | "body" | "execCommand"> | undefined
): ClipboardCopyResult {
  if (!documentRef?.body || !documentRef.execCommand) {
    return {
      ok: false,
      error: "Clipboard fallback is unavailable."
    };
  }

  const previousActiveElement = documentRef.activeElement;
  const previousSelection = readSelection(previousActiveElement);
  let textarea: HTMLTextAreaElement | undefined;

  try {
    textarea = documentRef.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";

    documentRef.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    return documentRef.execCommand("copy")
      ? { ok: true }
      : {
          ok: false,
          error: "Clipboard fallback copy command failed."
        };
  } catch {
    return {
      ok: false,
      error: "Clipboard fallback rejected the copy request."
    };
  } finally {
    restoreSelection(previousActiveElement, previousSelection);
    textarea?.remove();
  }
}

type SelectionSnapshot = {
  start: number;
  end: number;
};

function readSelection(element: Element | null | undefined): SelectionSnapshot | undefined {
  const candidate = element as Record<string, unknown> | null | undefined;

  if (!candidate || typeof candidate.selectionStart !== "number") {
    return undefined;
  }

  const selectionStart = candidate.selectionStart;
  const selectionEnd = candidate.selectionEnd;

  if (typeof selectionEnd !== "number") {
    return undefined;
  }

  return {
    start: selectionStart,
    end: selectionEnd
  };
}

function restoreSelection(element: Element | null | undefined, selection: SelectionSnapshot | undefined): void {
  const candidate = element as Record<string, unknown> | null | undefined;

  if (!candidate) {
    return;
  }

  if (typeof candidate.focus === "function") {
    try {
      (candidate.focus as () => void).call(element);
    } catch {
      // Restore focus best-effort; do not make clipboard copy fail.
    }
  }

  if (!selection || typeof candidate.setSelectionRange !== "function") {
    return;
  }

  try {
    (candidate.setSelectionRange as (start: number, end: number) => void).call(
      element,
      selection.start,
      selection.end
    );
  } catch {
    // Best-effort selection restoration only.
  }
}

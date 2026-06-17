import { truncateToCodePointBoundary } from "@contextvault/shared";

export async function readResponseTextUpTo(
  response: Response,
  maxLength: number
): Promise<{ text: string; truncated: boolean }> {
  const limit = Math.max(0, Math.floor(maxLength));

  if (limit === 0) {
    return {
      text: "",
      truncated: true
    };
  }

  const clone = response.clone();
  const body = clone.body;

  if (!body || typeof body.getReader !== "function") {
    const text = await clone.text();

    return {
      text: truncateToCodePointBoundary(text, limit),
      truncated: text.length > limit
    };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        text += decoder.decode(value, { stream: true });
      }

      if (text.length > limit) {
        truncated = true;
        text = truncateToCodePointBoundary(text, limit);
        break;
      }

      if (text.length === limit) {
        const peek = await reader.read();

        if (!peek.done) {
          truncated = true;
        }

        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best-effort cancellation only.
    }
  }

  const flushed = decoder.decode();

  if (flushed) {
    text += flushed;
  }

  if (text.length > limit) {
    truncated = true;
    text = truncateToCodePointBoundary(text, limit);
  }

  return {
    text,
    truncated
  };
}

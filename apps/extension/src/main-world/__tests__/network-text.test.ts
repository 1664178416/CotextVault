/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readResponseTextUpTo } from "../network-text";

describe("MAIN world response text reader", () => {
  it("reads streamed text across chunk boundaries without corrupting characters", async () => {
    const character = String.fromCodePoint(0x1f642);
    const characterBytes = encoder.encode(character);
    const { response } = makeStreamingResponse([
      encoder.encode("Hello "),
      characterBytes.slice(0, 1),
      characterBytes.slice(1),
      encoder.encode(" world")
    ]);

    const result = await readResponseTextUpTo(response, 100);

    expect(result).toEqual({
      text: `Hello ${character} world`,
      truncated: false
    });
  });

  it("stops reading once the text budget is exceeded", async () => {
    let cancelCount = 0;
    let readCount = 0;
    const { response } = makeStreamingResponse(
      Array.from({ length: 50 }, (_, index) => `chunk-${index.toString().padStart(2, "0")}-${"A".repeat(30)}`),
      {
        onRead: () => {
          readCount += 1;
        },
        onCancel: () => {
          cancelCount += 1;
        }
      }
    );

    const result = await readResponseTextUpTo(response, 40);

    expect(result.text).toHaveLength(40);
    expect(result.truncated).toBe(true);
    expect(cancelCount).toBe(1);
    expect(readCount).toBe(2);
  });

  it("truncates streamed text at code point boundaries", async () => {
    const character = String.fromCodePoint(0x1f642);
    const { response } = makeStreamingResponse([`A${character}B`]);

    const result = await readResponseTextUpTo(response, 2);

    expect(result).toEqual({
      text: "A",
      truncated: true
    });
  });
});

const encoder = new TextEncoder();

function makeStreamingResponse(
  chunks: Array<string | Uint8Array>,
  hooks: { onRead?: () => void; onCancel?: () => void } = {}
): { response: Response } {
  let index = 0;
  const encodedChunks = chunks.map((chunk) => (typeof chunk === "string" ? encoder.encode(chunk) : chunk));

  const reader = {
    async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
      hooks.onRead?.();

      if (index >= encodedChunks.length) {
        return {
          done: true,
          value: undefined
        };
      }

      return {
        done: false,
        value: encodedChunks[index++]
      };
    },
    async cancel(): Promise<void> {
      hooks.onCancel?.();
    }
  };

  const response = {
    body: {
      getReader: () => reader
    },
    clone: () => response,
    headers: {
      get: (name: string) => {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    status: 200,
    text: async () => {
      return new TextDecoder().decode(
        encodedChunks.reduce((combined, chunk) => {
          const next = new Uint8Array(combined.length + chunk.length);
          next.set(combined, 0);
          next.set(chunk, combined.length);
          return next;
        }, new Uint8Array())
      );
    }
  } as unknown as Response;

  return {
    response
  };
}

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MAX_CONVERSATION_CAPTURE_IMPORT_COUNT,
  MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE
} from "@contextvault/shared";
import {
  assertConversationExportJsonReadable,
  assertImportFitsAvailableStorage,
  assertVaultImportFileReadable,
  parseChatGptConversationsExport,
  parseConversationCaptureImportFile,
  parseConversationCaptureImportZip,
  parseConversationCaptureImportText,
  parseVaultImportText
} from "../import-state";

describe("vault import state helpers", () => {
  it("rejects empty import files", () => {
    expect(() => assertVaultImportFileReadable({ name: "empty.json", size: 0 })).toThrow("Import file is empty");
    expect(() => parseVaultImportText("   ")).toThrow("Import file is empty");
  });

  it("checks conversation import file size before reading file contents", async () => {
    await expect(
      parseConversationCaptureImportFile({
        name: "empty.json",
        size: 0,
        type: "application/json",
        text: async () => {
          throw new Error("should not read empty file");
        },
        arrayBuffer: async () => {
          throw new Error("should not read empty file");
        }
      } as unknown as File)
    ).rejects.toThrow("Import file is empty");
  });

  it("rejects files larger than the configured import limit", () => {
    expect(() => assertVaultImportFileReadable({ name: "large.json", size: 101 }, 100)).toThrow(
      "Import file is too large"
    );
  });

  it("rejects imports that do not fit estimated local browser storage", () => {
    expect(() =>
      assertImportFitsAvailableStorage({ size: 100 }, { usage: 950, quota: 1000 })
    ).toThrow("Import may exceed available browser storage");
    expect(() => assertImportFitsAvailableStorage({ size: 100 }, { usage: 800, quota: 1000 })).not.toThrow();
    expect(() => assertImportFitsAvailableStorage({ size: 100 }, undefined)).not.toThrow();
  });

  it("rejects empty or oversized conversations.json files inside ZIP imports", () => {
    expect(() => assertConversationExportJsonReadable(new Uint8Array(), 100)).toThrow(
      "Import ZIP contains an empty conversations.json"
    );
    expect(() => assertConversationExportJsonReadable(new Uint8Array(101), 100)).toThrow(
      "Import ZIP conversations.json is too large"
    );
  });

  it("rejects JSON import text that exceeds the parser limit", () => {
    expect(() => parseVaultImportText("{" + " ".repeat(101), 100)).toThrow("Import JSON text is too large");
    expect(() => parseConversationCaptureImportText("{" + " ".repeat(101), 100)).toThrow(
      "Import JSON text is too large"
    );
  });

  it("parses JSON import text and strips a UTF-8 BOM", () => {
    expect(parseVaultImportText('\uFEFF{"schemaVersion":1}')).toEqual({ schemaVersion: 1 });
  });

  it("unwraps conversation capture import envelopes", () => {
    expect(parseConversationCaptureImportText('{"captures":[{"provider":"chatgpt"}]}')).toEqual([
      { provider: "chatgpt" }
    ]);
    expect(parseConversationCaptureImportText('[{"provider":"gemini"}]')).toEqual([{ provider: "gemini" }]);
  });

  it("normalizes ChatGPT conversations.json exports into conversation captures", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptExportConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        provider: "chatgpt",
        providerConversationId: "chatgpt-conversation-1",
        title: "ContextVault design",
        capturedAt: "2026-06-07T13:20:00.000Z",
        captureMethod: "official_export",
        turns: [
          expect.objectContaining({
            providerTurnId: "message-user",
            role: "user",
            text: "Design ContextVault."
          }),
          expect.objectContaining({
            providerTurnId: "message-assistant",
            role: "assistant",
            text: "Use reviewed memory cards."
          })
        ]
      })
    ]);
  });

  it("rejects ChatGPT exports with too many conversations before normalization", () => {
    const conversation = chatGptExportConversation() as Record<string, unknown>;

    expect(() =>
      parseConversationCaptureImportText(
        JSON.stringify(
          Array.from({ length: MAX_CONVERSATION_CAPTURE_IMPORT_COUNT + 1 }, (_, index) => ({
            ...conversation,
            id: `chatgpt-conversation-${index}`
          }))
        )
      )
    ).toThrow(
      `ChatGPT export contains too many conversations (${MAX_CONVERSATION_CAPTURE_IMPORT_COUNT + 1}). Maximum supported count is ${MAX_CONVERSATION_CAPTURE_IMPORT_COUNT}.`
    );
  });

  it("truncates ChatGPT export conversations with too many visible turns before storage", () => {
    const captures = parseConversationCaptureImportText(
      JSON.stringify([chatGptManyTurnsExportConversation(MAX_SOURCE_TURNS_PER_ARCHIVE + 1, "too-many-turns")])
    ) as Array<{ turns: Array<{ text: string }>; warnings: Array<{ code: string; message: string }> }>;

    expect(captures[0]?.turns).toHaveLength(MAX_SOURCE_TURNS_PER_ARCHIVE);
    expect(captures[0]?.turns.at(-1)?.text).toBe(`Visible turn ${MAX_SOURCE_TURNS_PER_ARCHIVE - 1}.`);
    expect(JSON.stringify(captures)).not.toContain(`Visible turn ${MAX_SOURCE_TURNS_PER_ARCHIVE}.`);
    expect(captures[0]?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "chatgpt_turn_limit_reached",
          message: expect.stringContaining(`Imported the first ${MAX_SOURCE_TURNS_PER_ARCHIVE}`)
        })
      ])
    );
  });

  it("truncates oversized ChatGPT export turn text before validation", () => {
    const captures = parseConversationCaptureImportText(
      JSON.stringify([chatGptOversizedTurnExportConversation()])
    ) as Array<{ turns: Array<{ text: string }>; warnings: Array<{ code: string; message: string }> }>;

    expect(captures[0]?.turns[0]?.text).toHaveLength(MAX_SOURCE_TURN_TEXT_LENGTH - 1);
    expect(captures[0]?.turns[0]?.text).toBe("A".repeat(MAX_SOURCE_TURN_TEXT_LENGTH - 1));
    expect(captures[0]?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "chatgpt_turn_text_truncated",
          message: expect.stringContaining(`Truncated 1 ChatGPT export turn to ${MAX_SOURCE_TURN_TEXT_LENGTH}`)
        })
      ])
    );
  });

  it("redacts sensitive ChatGPT conversation labels in turn-limit warnings", () => {
    const captures = parseConversationCaptureImportText(
      JSON.stringify([
        chatGptManyTurnsExportConversation(
          MAX_SOURCE_TURNS_PER_ARCHIVE + 1,
          "Credential review alice@example.com api_key=sk-abcdefghijklmnopqrstuvwxyz123456"
        )
      ])
    ) as Array<{ warnings: Array<{ code: string; message: string }> }>;
    const serializedWarnings = JSON.stringify(captures[0]?.warnings);

    expect(serializedWarnings).toContain(
      "Credential review [REDACTED_EMAIL] api_key=[REDACTED_SECRET]"
    );
    expect(serializedWarnings).not.toContain("alice@example.com");
    expect(serializedWarnings).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("ignores invalid ChatGPT export timestamps instead of throwing parser internals", () => {
    const conversation = chatGptExportConversation() as Record<string, unknown>;
    const mapping = conversation.mapping as Record<string, unknown>;
    const userNode = mapping.user as Record<string, unknown>;
    const userMessage = userNode.message as Record<string, unknown>;
    const captures = parseConversationCaptureImportText(
      JSON.stringify([
        {
          ...conversation,
          create_time: Number.MAX_VALUE,
          mapping: {
            ...mapping,
            user: {
              ...userNode,
              message: {
                ...userMessage,
                create_time: Number.MAX_VALUE
              }
            }
          }
        }
      ])
    ) as Array<{ capturedAt: string; turns: Array<{ createdAt?: string }> }>;

    expect(captures[0]?.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(captures[0]?.turns[0]?.createdAt).toBeUndefined();
  });

  it("rejects ChatGPT exports with too many total visible turns before storage", () => {
    const captures = [
      ...Array.from({ length: MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT / MAX_SOURCE_TURNS_PER_ARCHIVE }, (_, index) =>
        chatGptManyTurnsExportConversation(MAX_SOURCE_TURNS_PER_ARCHIVE, `turn-total-${index}`)
      ),
      chatGptManyTurnsExportConversation(1, "turn-total-overflow")
    ];

    expect(() => parseConversationCaptureImportText(JSON.stringify(captures))).toThrow(
      `ChatGPT export contains too many visible turns (${MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT + 1}). Maximum supported count is ${MAX_CONVERSATION_CAPTURE_IMPORT_TURN_COUNT}.`
    );
  });
  it("uses ChatGPT current_node to avoid importing stale regenerated branches", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptBranchingExportConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({ role: "user", text: "Choose a UI surface." }),
          expect.objectContaining({ role: "assistant", text: "Use Side Panel as the primary UI." })
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_current_path"
          })
        ])
      })
    ]);
    expect(JSON.stringify(captures)).not.toContain("Use a popup as the primary UI.");
  });

  it("preserves current_node parent-chain order even when export timestamps are inconsistent", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptOutOfOrderTimestampConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({ role: "user", text: "First in the parent chain." }),
          expect.objectContaining({ role: "assistant", text: "Second in the parent chain." })
        ]
      })
    ]);
  });

  it("falls back to mapping import when current_node has no visible conversation turns", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptRootCurrentNodeConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({ role: "user", text: "Recover visible messages." }),
          expect.objectContaining({ role: "assistant", text: "Import mapping turns when current_node is empty." })
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_mapping_fallback",
            message: expect.stringContaining("contained no importable")
          })
        ])
      })
    ]);
  });

  it("warns when ChatGPT export messages include non-text parts that cannot be imported", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptMultimodalExportConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({
            role: "user",
            text: "Please review this screenshot."
          })
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_non_text_parts_skipped",
            message: expect.stringContaining("Skipped 1 non-text")
          })
        ])
      })
    ]);
    expect(JSON.stringify(captures)).not.toContain("screenshot.png");
  });

  it("recovers structured ChatGPT text parts while still skipping non-text payloads", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptStructuredTextExportConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({
            role: "assistant",
            text: "Structured text should be imported.\n\nPlain text still works."
          })
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_non_text_parts_skipped",
            message: expect.stringContaining("Skipped 2 non-text")
          })
        ])
      })
    ]);
    expect(JSON.stringify(captures)).not.toContain("hidden-image.png");
    expect(JSON.stringify(captures)).not.toContain("secret-file-id");
  });

  it("skips ChatGPT export messages that are not user-visible conversation roles", () => {
    const captures = parseConversationCaptureImportText(JSON.stringify([chatGptSystemAndToolExportConversation()]));

    expect(captures).toEqual([
      expect.objectContaining({
        turns: [
          expect.objectContaining({ role: "user", text: "Summarize ContextVault." }),
          expect.objectContaining({ role: "assistant", text: "Use reviewed memory cards." })
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_non_conversation_roles_skipped",
            message: expect.stringContaining("Skipped 3")
          })
        ])
      })
    ]);
    expect(JSON.stringify(captures)).not.toContain("Hidden system instructions");
    expect(JSON.stringify(captures)).not.toContain("Tool response payload");
    expect(JSON.stringify(captures)).not.toContain("Unknown role payload");
  });

  it("warns when some ChatGPT export conversations have no importable visible text", () => {
    const captures = parseConversationCaptureImportText(
      JSON.stringify([chatGptSystemOnlyExportConversation(), chatGptExportConversation()])
    );

    expect(captures).toEqual([
      expect.objectContaining({
        providerConversationId: "chatgpt-conversation-1",
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "chatgpt_empty_conversations_skipped",
            message: expect.stringContaining("Skipped 1")
          })
        ])
      })
    ]);
  });

  it("reports ChatGPT exports with no importable visible conversation text", () => {
    expect(() => parseConversationCaptureImportText(JSON.stringify([chatGptSystemOnlyExportConversation()]))).toThrow(
      "ChatGPT export did not contain importable user or assistant text"
    );
  });

  it("keeps unrelated JSON imports untouched when they are not ChatGPT export shaped", () => {
    expect(parseChatGptConversationsExport({ hello: "world" })).toBeUndefined();
    expect(parseConversationCaptureImportText('{"provider":"chatgpt"}')).toEqual({ provider: "chatgpt" });
  });

  it("reads ChatGPT conversations.json from an official export ZIP", () => {
    const zip = zipSync({
      "chatgpt-export/conversations.json": strToU8(JSON.stringify([chatGptExportConversation()])),
      "chatgpt-export/user.json": strToU8("{}")
    });
    const captures = parseConversationCaptureImportZip(zip);

    expect(captures).toEqual([
      expect.objectContaining({
        provider: "chatgpt",
        providerConversationId: "chatgpt-conversation-1",
        captureMethod: "official_export"
      })
    ]);
  });

  it("checks decompressed conversations.json size against estimated storage", () => {
    const zip = zipSync({
      "chatgpt-export/conversations.json": strToU8(JSON.stringify([chatGptExportConversation()]))
    });

    expect(() =>
      parseConversationCaptureImportZip(zip, {
        storageEstimate: {
          usage: 999_900,
          quota: 1_000_000
        }
      })
    ).toThrow("Import may exceed available browser storage");
  });

  it("rejects oversized conversations.json ZIP entries before treating them as missing", () => {
    const zip = zipSync({
      "chatgpt-export/conversations.json": strToU8(JSON.stringify([chatGptExportConversation()]))
    });

    expect(() =>
      parseConversationCaptureImportZip(zip, {
        maxConversationExportJsonBytes: 10
      })
    ).toThrow("Import ZIP conversations.json is too large");
  });

  it("ignores unrelated ZIP entries while looking for conversations.json", () => {
    const zip = zipSync({
      "chatgpt-export/conversations.json": strToU8(JSON.stringify([chatGptExportConversation()])),
      "chatgpt-export/user.json": strToU8(JSON.stringify([{ mapping: { bad: true } }])),
      "chatgpt-export/large-note.txt": new Uint8Array(1024)
    });
    const captures = parseConversationCaptureImportZip(zip);

    expect(captures).toEqual([
      expect.objectContaining({
        providerConversationId: "chatgpt-conversation-1",
        title: "ContextVault design"
      })
    ]);
    expect(JSON.stringify(captures)).not.toContain("large-note");
  });

  it("reports ZIP imports that do not include conversations.json", () => {
    const zip = zipSync({
      "chatgpt-export/user.json": strToU8("{}")
    });

    expect(() => parseConversationCaptureImportZip(zip)).toThrow("Import ZIP does not contain conversations.json");
  });

  it("reports ZIP imports with empty conversations.json before JSON parsing", () => {
    const zip = zipSync({
      "chatgpt-export/conversations.json": new Uint8Array()
    });

    expect(() => parseConversationCaptureImportZip(zip)).toThrow(
      "Import ZIP contains an empty conversations.json"
    );
  });

  it("reports malformed JSON with a user-facing message", () => {
    expect(() => parseVaultImportText("{not json")).toThrow("Import file is not valid JSON");
  });
});

function chatGptExportConversation(): unknown {
  return {
    id: "chatgpt-conversation-1",
    title: "ContextVault design",
    create_time: 1780838400,
    mapping: {
      root: {
        id: "root"
      },
      user: {
        id: "node-user",
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Design ContextVault."] }
        }
      },
      assistant: {
        id: "node-assistant",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838402,
          content: { content_type: "text", parts: ["Use reviewed memory cards."] }
        }
      }
    }
  };
}

function chatGptManyTurnsExportConversation(turnCount: number, title: string): unknown {
  const mapping: Record<string, unknown> = {
    root: {
      id: "root"
    }
  };
  let parent = "root";

  for (let index = 0; index < turnCount; index += 1) {
    const id = `node-${index}`;

    mapping[id] = {
      id,
      parent,
      message: {
        id: `message-${index}`,
        author: { role: index % 2 === 0 ? "user" : "assistant" },
        create_time: 1780838401 + index,
        content: { content_type: "text", parts: [`Visible turn ${index}.`] }
      }
    };
    parent = id;
  }

  return {
    id: title,
    title,
    create_time: 1780838400,
    current_node: parent,
    mapping
  };
}

function chatGptOversizedTurnExportConversation(): unknown {
  const character = String.fromCodePoint(0x1f642);

  return {
    id: "chatgpt-oversized-turn-conversation",
    title: "Oversized turn import",
    create_time: 1780838400,
    current_node: "assistant",
    mapping: {
      root: {
        id: "root"
      },
      assistant: {
        id: "assistant",
        parent: "root",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["A".repeat(MAX_SOURCE_TURN_TEXT_LENGTH - 1) + character] }
        }
      }
    }
  };
}

function chatGptBranchingExportConversation(): unknown {
  return {
    id: "chatgpt-branching-conversation",
    title: "Branching ContextVault design",
    create_time: 1780838400,
    current_node: "assistant-current",
    mapping: {
      root: {
        id: "root",
        parent: undefined
      },
      user: {
        id: "user",
        parent: "root",
        children: ["assistant-stale", "assistant-current"],
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Choose a UI surface."] }
        }
      },
      "assistant-stale": {
        id: "assistant-stale",
        parent: "user",
        message: {
          id: "message-assistant-stale",
          author: { role: "assistant" },
          create_time: 1780838402,
          content: { content_type: "text", parts: ["Use a popup as the primary UI."] }
        }
      },
      "assistant-current": {
        id: "assistant-current",
        parent: "user",
        message: {
          id: "message-assistant-current",
          author: { role: "assistant" },
          create_time: 1780838403,
          content: { content_type: "text", parts: ["Use Side Panel as the primary UI."] }
        }
      }
    }
  };
}

function chatGptOutOfOrderTimestampConversation(): unknown {
  return {
    id: "chatgpt-out-of-order-conversation",
    title: "Out-of-order timestamp import",
    create_time: 1780838400,
    current_node: "assistant",
    mapping: {
      root: {
        id: "root"
      },
      user: {
        id: "user",
        parent: "root",
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838410,
          content: { content_type: "text", parts: ["First in the parent chain."] }
        }
      },
      assistant: {
        id: "assistant",
        parent: "user",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Second in the parent chain."] }
        }
      }
    }
  };
}

function chatGptRootCurrentNodeConversation(): unknown {
  return {
    id: "chatgpt-root-current-node-conversation",
    title: "Root current_node import",
    create_time: 1780838400,
    current_node: "root",
    mapping: {
      root: {
        id: "root"
      },
      user: {
        id: "user",
        parent: "root",
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Recover visible messages."] }
        }
      },
      assistant: {
        id: "assistant",
        parent: "user",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838402,
          content: { content_type: "text", parts: ["Import mapping turns when current_node is empty."] }
        }
      }
    }
  };
}

function chatGptMultimodalExportConversation(): unknown {
  return {
    id: "chatgpt-multimodal-conversation",
    title: "Multimodal ContextVault import",
    create_time: 1780838400,
    current_node: "user",
    mapping: {
      root: {
        id: "root"
      },
      user: {
        id: "user",
        parent: "root",
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838401,
          content: {
            content_type: "multimodal_text",
            parts: [
              "Please review this screenshot.",
              {
                content_type: "image_asset_pointer",
                asset_pointer: "file-service://screenshot.png"
              }
            ]
          }
        }
      }
    }
  };
}

function chatGptStructuredTextExportConversation(): unknown {
  return {
    id: "chatgpt-structured-text-conversation",
    title: "Structured text import",
    create_time: 1780838400,
    current_node: "assistant",
    mapping: {
      root: {
        id: "root"
      },
      assistant: {
        id: "assistant",
        parent: "root",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838401,
          content: {
            content_type: "multimodal_text",
            parts: [
              {
                content_type: "text",
                text: "Structured text should be imported."
              },
              "Plain text still works.",
              {
                content_type: "image_asset_pointer",
                asset_pointer: "file-service://hidden-image.png"
              },
              {
                content_type: "text",
                file_id: "secret-file-id",
                text: "This file caption should not be imported."
              }
            ]
          }
        }
      }
    }
  };
}

function chatGptSystemAndToolExportConversation(): unknown {
  return {
    id: "chatgpt-system-tool-conversation",
    title: "System and tool import",
    create_time: 1780838400,
    current_node: "assistant",
    mapping: {
      root: {
        id: "root"
      },
      system: {
        id: "system",
        parent: "root",
        message: {
          id: "message-system",
          author: { role: "system" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Hidden system instructions."] }
        }
      },
      user: {
        id: "user",
        parent: "system",
        message: {
          id: "message-user",
          author: { role: "user" },
          create_time: 1780838402,
          content: { content_type: "text", parts: ["Summarize ContextVault."] }
        }
      },
      tool: {
        id: "tool",
        parent: "user",
        message: {
          id: "message-tool",
          author: { role: "tool" },
          create_time: 1780838403,
          content: { content_type: "text", parts: ["Tool response payload."] }
        }
      },
      unknown: {
        id: "unknown",
        parent: "tool",
        message: {
          id: "message-unknown",
          author: { role: "critic" },
          create_time: 1780838404,
          content: { content_type: "text", parts: ["Unknown role payload."] }
        }
      },
      assistant: {
        id: "assistant",
        parent: "unknown",
        message: {
          id: "message-assistant",
          author: { role: "assistant" },
          create_time: 1780838405,
          content: { content_type: "text", parts: ["Use reviewed memory cards."] }
        }
      }
    }
  };
}

function chatGptSystemOnlyExportConversation(): unknown {
  return {
    id: "chatgpt-system-only-conversation",
    title: "System-only import",
    create_time: 1780838400,
    current_node: "system",
    mapping: {
      root: {
        id: "root"
      },
      system: {
        id: "system",
        parent: "root",
        message: {
          id: "message-system",
          author: { role: "system" },
          create_time: 1780838401,
          content: { content_type: "text", parts: ["Hidden system instructions."] }
        }
      }
    }
  };
}

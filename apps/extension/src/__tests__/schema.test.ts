import { describe, expect, it } from "vitest";
import memoryCardSchema from "../../../../schemas/memory-card.schema.json";
import vaultExportSchema from "../../../../schemas/vault-export.schema.json";
import {
  MAX_CAPTURE_WARNING_CODE_LENGTH,
  MAX_CAPTURE_WARNING_COUNT,
  MAX_CAPTURE_WARNING_MESSAGE_LENGTH,
  MAX_CONTENT_HASH_LENGTH,
  MAX_MEMORY_CARD_BODY_LENGTH,
  MAX_MEMORY_CARD_OWNER_LENGTH,
  MAX_MEMORY_CARD_TAG_COUNT,
  MAX_MEMORY_CARD_TAG_LENGTH,
  MAX_MEMORY_CARD_TITLE_LENGTH,
  MAX_METADATA_ID_LENGTH,
  MAX_SOURCE_ANCHOR_QUOTE_LENGTH,
  MAX_SOURCE_ANCHORS_PER_MEMORY_CARD,
  MAX_SOURCE_SELECTOR_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  MAX_URL_LENGTH,
  MAX_VAULT_IMPORT_ARCHIVE_COUNT,
  MAX_VAULT_IMPORT_MEMORY_CARD_COUNT
} from "@contextvault/shared";

const ISO_DATE_TIME_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";

describe("JSON schemas", () => {
  it("defines the memory card schema contract", () => {
    expect(memoryCardSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(memoryCardSchema.required).toEqual(
      expect.arrayContaining(["id", "type", "title", "body", "status", "scope", "sensitivity", "sourceAnchors"])
    );
    expect(memoryCardSchema.properties.type.enum).toEqual(
      expect.arrayContaining(["project_fact", "decision", "todo", "preference", "method", "citation_anchor"])
    );
    expect(memoryCardSchema.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.batchId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.projectId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.title.maxLength).toBe(MAX_MEMORY_CARD_TITLE_LENGTH);
    expect(memoryCardSchema.properties.body.maxLength).toBe(MAX_MEMORY_CARD_BODY_LENGTH);
    expect(memoryCardSchema.properties.tags.maxItems).toBe(MAX_MEMORY_CARD_TAG_COUNT);
    expect(memoryCardSchema.properties.tags.items.maxLength).toBe(MAX_MEMORY_CARD_TAG_LENGTH);
    expect(memoryCardSchema.properties.owner.maxLength).toBe(MAX_MEMORY_CARD_OWNER_LENGTH);
    expect(memoryCardSchema.properties.sourceAnchors.maxItems).toBe(MAX_SOURCE_ANCHORS_PER_MEMORY_CARD);
    expect(memoryCardSchema.properties.sourceAnchors.items.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.sourceAnchors.items.properties.archiveId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.sourceAnchors.items.properties.turnId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(memoryCardSchema.properties.sourceAnchors.items.properties.quote.maxLength).toBe(
      MAX_SOURCE_ANCHOR_QUOTE_LENGTH
    );
    expect(memoryCardSchema.properties.createdAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(memoryCardSchema.properties.updatedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(memoryCardSchema.properties.acceptedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(memoryCardSchema.properties.dueAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
  });

  it("defines the full vault export schema contract", () => {
    const defs = vaultExportSchema.$defs;

    expect(vaultExportSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(vaultExportSchema.required).toEqual(expect.arrayContaining(["schemaVersion", "exportedAt", "archives", "memoryCards"]));
    expect(vaultExportSchema.properties.schemaVersion.const).toBe(1);
    expect(vaultExportSchema.properties.archives.maxItems).toBe(MAX_VAULT_IMPORT_ARCHIVE_COUNT);
    expect(vaultExportSchema.properties.memoryCards.maxItems).toBe(MAX_VAULT_IMPORT_MEMORY_CARD_COUNT);
    expect(defs.sourceArchive.properties.captureMethod.enum).toEqual(
      expect.arrayContaining(["official_export", "main_world_network", "devtools_network", "dom", "clipboard"])
    );
    expect(defs.sourceTurn.properties.role.enum).toEqual(
      expect.arrayContaining(["user", "assistant", "system", "tool", "unknown"])
    );
    expect(defs.archiveWithTurns.properties.turns.maxItems).toBe(MAX_SOURCE_TURNS_PER_ARCHIVE);
    expect(defs.sourceArchive.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceArchive.properties.providerConversationId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceArchive.properties.title.maxLength).toBe(MAX_SOURCE_TITLE_LENGTH);
    expect(defs.sourceArchive.properties.url.maxLength).toBe(MAX_URL_LENGTH);
    expect(defs.sourceArchive.properties.contentHash.maxLength).toBe(MAX_CONTENT_HASH_LENGTH);
    expect(defs.sourceArchive.properties.warnings.maxItems).toBe(MAX_CAPTURE_WARNING_COUNT);
    expect(defs.captureWarning.properties.code.maxLength).toBe(MAX_CAPTURE_WARNING_CODE_LENGTH);
    expect(defs.captureWarning.properties.message.maxLength).toBe(MAX_CAPTURE_WARNING_MESSAGE_LENGTH);
    expect(defs.sourceTurn.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceTurn.properties.archiveId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceTurn.properties.providerTurnId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceTurn.properties.text.maxLength).toBe(MAX_SOURCE_TURN_TEXT_LENGTH);
    expect(defs.sourceTurn.properties.contentHash.maxLength).toBe(MAX_CONTENT_HASH_LENGTH);
    expect(defs.sourceTurn.properties.sourceSelector.maxLength).toBe(MAX_SOURCE_SELECTOR_LENGTH);
    expect(defs.memoryCard.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.memoryCard.properties.batchId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.memoryCard.properties.projectId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.memoryCard.properties.title.maxLength).toBe(MAX_MEMORY_CARD_TITLE_LENGTH);
    expect(defs.memoryCard.properties.body.maxLength).toBe(MAX_MEMORY_CARD_BODY_LENGTH);
    expect(defs.memoryCard.properties.tags.maxItems).toBe(MAX_MEMORY_CARD_TAG_COUNT);
    expect(defs.memoryCard.properties.tags.items.maxLength).toBe(MAX_MEMORY_CARD_TAG_LENGTH);
    expect(defs.memoryCard.properties.owner.maxLength).toBe(MAX_MEMORY_CARD_OWNER_LENGTH);
    expect(defs.memoryCard.properties.sourceAnchors.minItems).toBe(1);
    expect(defs.memoryCard.properties.sourceAnchors.maxItems).toBe(MAX_SOURCE_ANCHORS_PER_MEMORY_CARD);
    expect(defs.sourceAnchor.properties.id.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceAnchor.properties.archiveId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceAnchor.properties.turnId.maxLength).toBe(MAX_METADATA_ID_LENGTH);
    expect(defs.sourceAnchor.properties.quote.maxLength).toBe(MAX_SOURCE_ANCHOR_QUOTE_LENGTH);
    expect(vaultExportSchema.properties.exportedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.sourceArchive.properties.capturedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.sourceTurn.properties.createdAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.memoryCard.properties.createdAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.memoryCard.properties.updatedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.memoryCard.properties.acceptedAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.memoryCard.properties.dueAt.pattern).toBe(ISO_DATE_TIME_PATTERN);
    expect(defs.providerId.enum).toEqual(expect.arrayContaining(["chatgpt", "gemini", "claude", "generic", "unknown"]));
  });
});

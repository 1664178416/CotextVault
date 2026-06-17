# Product Design

## Name

Primary name: **ContextVault**

Chinese names:

- **语境金库**
- **上下文金库**

## One Sentence

ContextVault turns selected AI conversations into reviewed, searchable, source-grounded personal work memory.

## Problem

AI conversations contain valuable project facts, decisions, todos, writing preferences, code preferences, and reusable workflows. But they are usually trapped inside long chat histories, hard to search across tools, and easy to lose when switching between ChatGPT, Gemini, Claude, local editors, and knowledge bases.

Raw chat export alone does not solve this. It creates another pile of text. The real value is a memory layer that extracts durable, reusable knowledge and keeps a link back to source evidence.

## Target Users

- Builders who use several AI assistants across projects.
- Researchers and writers who need long-term continuity across drafts.
- Developers who want AI to remember project constraints and past decisions.
- Power users who prefer local-first control over sensitive work context.

## Product Promise

ContextVault helps users answer:

- What did I already decide about this project?
- What context should I give the AI before continuing?
- Which todos came out of earlier AI conversations?
- What are my stable writing, coding, and workflow preferences?
- Where did this memory come from?

## Core Workflow

1. User opens an AI conversation.
2. User clicks **沉淀当前对话** in the ContextVault side panel.
3. The extension captures the current conversation through the best available adapter.
4. The raw conversation is stored as an immutable archive, or an exact previously captured snapshot is reused.
5. The memory extraction engine proposes structured memory cards.
6. User reviews, edits, scopes, tags, accepts, or rejects cards.
7. Accepted cards become searchable permanent memories.
8. When the user opens a new AI conversation, related memories appear in the side panel.
9. User copies or injects selected context into the current AI session.

## Memory Types

| Type | Purpose | Example |
| --- | --- | --- |
| Project fact | Stable background or constraint | "ContextVault MVP must be local-first." |
| Decision record | A choice and its rationale | "Use Side Panel instead of popup because review needs persistent workspace." |
| Todo | Actionable task | "Implement ChatGPT adapter after extension scaffold." |
| Preference | Long-term user preference | "Prefer source-grounded memory over automatic hidden sync." |
| Method | Reusable workflow or prompt pattern | "Archive raw conversation, extract cards, confirm, then index." |
| Citation anchor | Link between memory and raw source turn | "Source: chatgpt/session-2026-06-07 turn 14." |

## UX Shape

The UI should feel like a focused workbench, not a marketing product.

Primary surfaces:

- Side panel capture button.
- Review queue for proposed memory cards.
- Search view for saved memories.
- Manual memory composer for source-grounded notes when browser capture is unavailable.
- Source viewer for raw conversations.
- Copy/inject controls for returning memories to the current AI conversation.
- Settings for storage, encryption, export, model provider, and capture permissions.

## Non Goals For MVP

- Always-on background syncing of every AI conversation.
- Invisible collection without explicit user action.
- Team collaboration.
- SaaS account system.
- Deep automation across all AI websites.
- Treating `webRequest` or DNR as response-body readers.

## Success Criteria

The MVP succeeds if a user can:

- Capture one ChatGPT conversation and one Gemini conversation.
- Review and accept extracted memory cards.
- Search accepted memories by keyword.
- Retrieve relevant memories for a new conversation.
- Copy those memories back into the AI tool.
- Inspect the original source turn for each memory.
- Re-click capture on the same unchanged conversation without creating duplicate archives.
- Add a manual memory from pasted text while preserving a local source archive and anchor.
- Submit the same accepted manual memory again without creating duplicate archive or memory records.
- Reject accidental oversized manual memory bodies before they become permanent accepted cards.
- Get a confirmation before sensitive or secret manual text becomes permanent memory.

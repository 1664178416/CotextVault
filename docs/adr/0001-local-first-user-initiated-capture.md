# ADR 0001: Local-First User-Initiated Capture

## Status

Accepted.

## Context

The product could attempt always-on background collection of every AI conversation. That would create privacy, compliance, permission, and trust problems early, while also increasing adapter fragility.

## Decision

ContextVault MVP will use local-first storage and user-initiated capture.

The user must explicitly click **沉淀当前对话** before the extension captures a conversation.

## Consequences

Benefits:

- lower privacy risk
- simpler permissions
- clearer user trust model
- easier MVP validation

Tradeoffs:

- users must remember to capture important conversations
- no automatic complete history unless imported through official exports


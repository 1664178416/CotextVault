# ADR 0003: Reviewed Memory Cards

## Status

Accepted.

## Context

Automatic summarization can create plausible but incorrect or low-value memories. If every extracted item becomes permanent, ContextVault becomes a noisy chat summary database.

## Decision

ContextVault will store raw archives separately from memory cards. LLM extraction may propose cards, but permanent memory requires user confirmation.

## Consequences

Benefits:

- higher memory quality
- better user trust
- fewer accidental permanent secrets
- clearer source accountability

Tradeoffs:

- review adds friction
- batch accept and quality scoring will matter for power users


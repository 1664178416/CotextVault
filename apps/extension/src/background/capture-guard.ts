import {
  formatValidationIssues,
  validateConversationCapture,
  type ConversationCapture,
  type ProviderId
} from "@contextvault/shared";

export function assertValidCapturedConversation(value: unknown, expectedProvider: ProviderId): ConversationCapture {
  const validation = validateConversationCapture(value);

  if (!validation.ok) {
    throw new Error(`Content script returned invalid capture (${formatValidationIssues(validation.issues)}).`);
  }

  if (validation.value.provider !== expectedProvider) {
    throw new Error(
      `Content script returned provider "${validation.value.provider}" for "${expectedProvider}" capture request.`
    );
  }

  return validation.value;
}

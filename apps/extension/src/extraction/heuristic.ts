import {
  classifySensitivity,
  containsSecret,
  splitIntoSentences,
  truncateText,
  type ConversationCapture,
  type MemoryCard,
  type MemoryCardType,
  type SourceAnchor,
  type SourceTurn
} from "@contextvault/shared";

type Candidate = {
  type: MemoryCardType;
  title: string;
  body: string;
  turn: SourceTurn;
  confidence: number;
  tags: string[];
};

const DECISION_PATTERN = /(决定|选择|采用|使用|优先|建议|不要|避免|不把|不应|should|choose|use|avoid|prefer)/i;
const TODO_PATTERN = /(下一步|待办|实现|开发|修复|补齐|测试|scaffold|implement|build|todo|next)/i;
const METHOD_PATTERN = /(流程|模板|方法|prompt|workflow|checklist|步骤|adapter|架构)/i;
const PREFERENCE_PATTERN = /(偏好|长期|默认|prefer|preference|style|习惯)/i;
const PROJECT_FACT_PATTERN =
  /\b(contextvault is|this project|project goal|the goal is|goal is|requirement|constraint|mvp)\b/i;
const USER_QUESTION_REQUEST_PATTERN =
  /^(can|could|would|will|what|how|why|when|where|do|does|did|is|are|should)\b|[?\uFF1F]\s*$/i;
const USER_PREFERENCE_PATTERN =
  /\b(i|we)\s+(prefer|usually|always|default to|like to|want)\b|\b(my|our)\s+preference\b|\bplease\s+(always|default|prefer)\b/i;
const USER_DECISION_SIGNAL_PATTERN =
  /\b(requirement|constraint|must|must not|do not|don't|never|avoid|we use|we chose|we decided|the goal is|goal:)\b/i;
const USER_TASK_SIGNAL_PATTERN = /\b(next step|todo|task|we need to|please implement|implement|build)\b/i;
const USER_PROJECT_FACT_PATTERN =
  /\b(project goal|goal is|the goal is|this project|contextvault is|requirement|constraint)\b/i;
const FALLBACK_ENGLISH_SIGNAL_PATTERN =
  /\b(project|mvp|adapter|workflow|side panel|local-first|memory|capture|search|export|import|decision|todo|next|implement|build|prefer|requirement|constraint|architecture|roadmap|privacy|source anchor|extension)\b/i;
const FALLBACK_CHINESE_SIGNAL_PATTERN = /(项目|目标|约束|决策|待办|下一步|实现|开发|流程|模板|偏好|架构|隐私|插件|扩展|记忆|沉淀|检索|导入|导出|本地优先)/i;
const NEGATED_FALLBACK_SIGNAL_PATTERN =
  /\b(does not|doesn't|do not|don't|without|no|not)\b.{0,80}\b(project|mvp|adapter|workflow|memory|capture|search|export|import|decision|todo|requirement|constraint|architecture|roadmap|privacy|extension)\b/i;

export function proposeMemoryCards(capture: ConversationCapture, turns: SourceTurn[]): MemoryCard[] {
  const candidates: Candidate[] = [];
  const now = new Date().toISOString();
  const sourceTurns = selectExtractionTurns(turns);

  for (const turn of sourceTurns) {
    for (const sentence of splitIntoSentences(turn.text)) {
      const normalized = sentence.trim();

      if (normalized.length < 18 || normalized.length > 420) {
        continue;
      }

      if (containsSecret(normalized)) {
        continue;
      }

      const type = classifySentence(normalized, turn.role);

      if (!type) {
        continue;
      }

      candidates.push({
        type,
        title: titleFromSentence(normalized, type),
        body: normalized,
        turn,
        confidence: confidenceForType(type),
        tags: [capture.provider]
      });
    }
  }

  if (candidates.length === 0 && turns.length > 0) {
    const lastUsefulTurn = [...turns]
      .reverse()
      .find((turn) => isUsefulFallbackTurn(capture, turn));

    if (lastUsefulTurn) {
      candidates.push({
        type: "project_fact",
        title: capture.title ? `对话上下文：${truncateText(capture.title, 42)}` : "捕获的对话上下文",
        body: truncateText(lastUsefulTurn.text, 360),
        turn: lastUsefulTurn,
        confidence: 0.35,
        tags: [capture.provider, "fallback"]
      });
    }
  }

  return dedupeCandidates(candidates)
    .slice(0, 8)
    .map((candidate) => {
      const anchor = makeAnchor(candidate.turn, candidate.body);

      return {
        id: crypto.randomUUID(),
        type: candidate.type,
        title: candidate.title,
        body: candidate.body,
        status: "proposed",
        scope: "conversation",
        sensitivity: classifySensitivity(candidate.body),
        confidence: candidate.confidence,
        tags: candidate.tags,
        createdAt: now,
        updatedAt: now,
        sourceAnchors: [anchor]
      } satisfies MemoryCard;
    });
}

function isUsefulFallbackTurn(capture: ConversationCapture, turn: SourceTurn): boolean {
  const text = turn.text.trim();
  const context = `${capture.title ?? ""}\n${text}`;

  return (
    text.length > 40 &&
    !containsSecret(text) &&
    !NEGATED_FALLBACK_SIGNAL_PATTERN.test(context) &&
    (FALLBACK_ENGLISH_SIGNAL_PATTERN.test(context) || FALLBACK_CHINESE_SIGNAL_PATTERN.test(context))
  );
}

function selectExtractionTurns(turns: SourceTurn[]): SourceTurn[] {
  const hasAssistantTurns = turns.some((turn) => turn.role === "assistant");

  if (!hasAssistantTurns) {
    return turns;
  }

  return turns.filter((turn) => turn.role === "assistant" || turn.role === "user");
}

function classifySentence(sentence: string, role: SourceTurn["role"]): MemoryCardType | undefined {
  if (role === "user") {
    return classifyUserSentence(sentence);
  }

  if (TODO_PATTERN.test(sentence)) {
    return "todo";
  }

  if (METHOD_PATTERN.test(sentence)) {
    return "method";
  }

  if (PREFERENCE_PATTERN.test(sentence)) {
    return "preference";
  }

  if (PROJECT_FACT_PATTERN.test(sentence)) {
    return "project_fact";
  }

  if (DECISION_PATTERN.test(sentence)) {
    return "decision";
  }

  return undefined;
}

function classifyUserSentence(sentence: string): MemoryCardType | undefined {
  if (USER_QUESTION_REQUEST_PATTERN.test(sentence.trim())) {
    return undefined;
  }

  if (TODO_PATTERN.test(sentence) && USER_TASK_SIGNAL_PATTERN.test(sentence)) {
    return "todo";
  }

  if (PREFERENCE_PATTERN.test(sentence) || USER_PREFERENCE_PATTERN.test(sentence)) {
    return "preference";
  }

  if (USER_PROJECT_FACT_PATTERN.test(sentence)) {
    return "project_fact";
  }

  if (METHOD_PATTERN.test(sentence) && USER_DECISION_SIGNAL_PATTERN.test(sentence)) {
    return "method";
  }

  if (DECISION_PATTERN.test(sentence) && USER_DECISION_SIGNAL_PATTERN.test(sentence)) {
    return "decision";
  }

  return undefined;
}

function titleFromSentence(sentence: string, type: MemoryCardType): string {
  const prefix: Record<MemoryCardType, string> = {
    project_fact: "项目事实",
    decision: "决策",
    todo: "待办",
    preference: "偏好",
    method: "方法",
    citation_anchor: "来源"
  };

  return `${prefix[type]}：${truncateText(sentence, 54)}`;
}

function confidenceForType(type: MemoryCardType): number {
  switch (type) {
    case "todo":
      return 0.62;
    case "decision":
      return 0.58;
    case "preference":
      return 0.54;
    case "method":
      return 0.5;
    default:
      return 0.42;
  }
}

function makeAnchor(turn: SourceTurn, quote: string): SourceAnchor {
  const charStart = turn.text.indexOf(quote);

  return {
    id: crypto.randomUUID(),
    archiveId: turn.archiveId,
    turnId: turn.id,
    charStart: charStart >= 0 ? charStart : undefined,
    charEnd: charStart >= 0 ? charStart + quote.length : undefined,
    quote: truncateText(quote, 240)
  };
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.body.toLowerCase().replace(/\s+/g, " ").slice(0, 140);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

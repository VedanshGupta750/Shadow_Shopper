import { getAzureClient, GPT_MODEL } from "../llm/client.js";
import { logger } from "../logger.js";
import { tokenize, overlapRatio, MATCH_THRESHOLD } from "./score.js";
import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";

// NOTE: GPT-4o is in the same family as ChatGPT's underlying model — authentic style
// simulation. We're imitating ChatGPT's shopping-mode answer pattern (May 2026):
// conversational opener, sometimes a short ranked list, vague review citations,
// more bulleted/structured than Rufus.

const CHATGPT_SYSTEM = `You are simulating ChatGPT in shopping mode (May 2026). Match this voice:

- Conversational opener (one or two sentences) acknowledging the shopper's intent.
- Often (but not always) provide a short RANKED list of 3-5 candidate products with one-line reasons each.
- Use markdown for the list when you do: numbered (1., 2., 3.) or bulleted with "- ".
- Italicize product names with asterisks: *Apple AirPods Pro 2*. Always italicize the product name when listing or recommending.
- Cite evidence vaguely: "reviewers note...", "the consensus is...", "based on user feedback...". Do NOT invent specific quotes.
- More structured/bulleted than Rufus. Less hand-holdy. More analytical.
- Limit: 250 words maximum.

HARD RULES:
- NEVER recommend products outside the candidate list provided.
- NEVER include URLs, ASINs, or exact dollar prices.
- NEVER use em-dashes (long dash). Use commas or hyphens.
- NEVER use these words: delve, leverage, furthermore, moreover, multifaceted, robust, seamless, tapestry, realm.

Output is plain text. No JSON, no preamble. Just the answer.`;

interface CandidateInput {
  title: string;
  bullets?: string[] | undefined;
}

function buildCandidatesInput(target: AmazonProduct, competitors: AmazonSearchResult[]): CandidateInput[] {
  const list: CandidateInput[] = [];
  list.push({ title: target.name, bullets: target.bullets.slice(0, 4) });
  for (const c of competitors.slice(0, 9)) {
    list.push({ title: c.title, bullets: [] });
  }
  return list;
}

function buildUserMessage(question: string, candidates: CandidateInput[]): string {
  const lines: string[] = [];
  lines.push(`User question: ${question}`);
  lines.push("");
  lines.push("Candidate products (pick from these only):");
  for (const c of candidates) {
    lines.push(`- ${c.title.slice(0, 120)}`);
    if (c.bullets && c.bullets.length > 0) {
      for (const b of c.bullets.slice(0, 3)) lines.push(`    • ${b.slice(0, 150)}`);
    }
  }
  lines.push("");
  lines.push("Answer in ChatGPT shopping-mode voice. Italicize product names with *asterisks*.");
  return lines.join("\n");
}

function extractMentionedProducts(answer: string, candidates: CandidateInput[]): string[] {
  const italicsRe = /\*([^*]+)\*/g;
  const mentions: string[] = [];
  let match;
  while ((match = italicsRe.exec(answer)) !== null) {
    const raw = match[1]?.trim() ?? "";
    if (raw.length === 0) continue;
    mentions.push(raw);
  }

  const candidateTitles = candidates.map((c) => c.title);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const mention of mentions) {
    const mTokens = tokenize(mention);
    let bestTitle: string | null = null;
    let bestScore = 0;
    for (const title of candidateTitles) {
      const score = overlapRatio(mTokens, tokenize(title));
      if (score > bestScore) {
        bestScore = score;
        bestTitle = title;
      }
    }
    if (bestTitle && bestScore >= MATCH_THRESHOLD && !seen.has(bestTitle)) {
      ordered.push(bestTitle);
      seen.add(bestTitle);
    } else if (!bestTitle || bestScore < MATCH_THRESHOLD) {
      if (!seen.has(mention)) {
        ordered.push(mention);
        seen.add(mention);
      }
    }
  }
  return ordered;
}

export async function simulateChatGptShopping(
  question: string,
  target: AmazonProduct,
  competitors: AmazonSearchResult[],
  signal: AbortSignal,
): Promise<{ answer_text: string; mentioned_products: string[] }> {
  const candidates = buildCandidatesInput(target, competitors);
  const client = getAzureClient();

  const response = await client.chat.completions.create(
    {
      model: GPT_MODEL,
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        { role: "system", content: CHATGPT_SYSTEM },
        { role: "user", content: buildUserMessage(question, candidates) },
      ],
    },
    { timeout: 25_000, maxRetries: 1, signal },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const mentioned = extractMentionedProducts(content, candidates);

  logger.debug(
    { surface: "chatgpt", chars: content.length, mentions: mentioned.length },
    "surfacing.simulateChatGpt: done",
  );

  return { answer_text: content, mentioned_products: mentioned };
}

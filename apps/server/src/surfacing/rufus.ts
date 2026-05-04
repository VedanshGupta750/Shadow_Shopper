import { getAzureClient, GPT_MODEL } from "../llm/client.js";
import { logger } from "../logger.js";
import { tokenize, overlapRatio, MATCH_THRESHOLD } from "./score.js";
import type { AmazonProduct, AmazonSearchResult } from "../types/amazon.js";

// NOTE: Rufus has no public API in May 2026. We simulate its published answer style —
// citation patterns, second-person voice, italicized product names — using GPT-4o.
// This is an approximation, not a guarantee that real Rufus would respond identically.

const RUFUS_SYSTEM = `You are simulating Amazon Rufus's published answer style (May 2026). Match this voice exactly:

- Second person, conversational, warm. Talk like a helpful shopping friend, not a search engine.
- Italicize every product name with asterisks: *Apple AirPods Pro 2*, *Sony WH-1000XM5*. NEVER mention products without italics.
- Cite evidence type briefly: "based on customer reviews...", "according to product details...", "shoppers often mention...". Do NOT invent specific quotes.
- Open with a one-sentence intent framing: "Looking for X? Here's what I found." or similar.
- Body: discuss 2-4 candidate products with their key strengths/weaknesses for the question.
- Close with a follow-up question to keep the conversation going.
- Limit: 250 words maximum.

HARD RULES:
- NEVER include URLs, ASINs, or specific dollar prices in the prose. (You may say "around $200" or "in the mid-range".)
- NEVER recommend products outside the candidate list provided.
- NEVER use em-dashes (long dash). Use commas or hyphens.
- NEVER use these words: delve, leverage, furthermore, moreover, multifaceted, robust, seamless, tapestry, realm.

Output is plain text answer. No JSON, no preamble.`;

interface CandidateInput {
  title: string;
  bullets?: string[] | undefined;
  reviewSnippets?: string[] | undefined;
}

function buildCandidatesInput(target: AmazonProduct, competitors: AmazonSearchResult[]): CandidateInput[] {
  const list: CandidateInput[] = [];
  list.push({
    title: target.name,
    bullets: target.bullets.slice(0, 4),
    reviewSnippets: [],
  });
  for (const c of competitors.slice(0, 9)) {
    list.push({
      title: c.title,
      bullets: [],
      reviewSnippets: [],
    });
  }
  return list;
}

function buildUserMessage(question: string, candidates: CandidateInput[]): string {
  const lines: string[] = [];
  lines.push(`Shopper question: ${question}`);
  lines.push("");
  lines.push("Candidate products (pick from these only):");
  for (const c of candidates) {
    lines.push(`- ${c.title.slice(0, 120)}`);
    if (c.bullets && c.bullets.length > 0) {
      for (const b of c.bullets.slice(0, 3)) lines.push(`    • ${b.slice(0, 150)}`);
    }
  }
  lines.push("");
  lines.push("Answer in Rufus's voice. Italicize all product names with *asterisks*.");
  return lines.join("\n");
}

/** Extract products mentioned in *italics* and match them against candidate titles. */
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

export async function simulateRufus(
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
        { role: "system", content: RUFUS_SYSTEM },
        { role: "user", content: buildUserMessage(question, candidates) },
      ],
    },
    { timeout: 25_000, maxRetries: 1, signal },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const mentioned = extractMentionedProducts(content, candidates);

  logger.debug(
    { surface: "rufus", chars: content.length, mentions: mentioned.length },
    "surfacing.simulateRufus: done",
  );

  return { answer_text: content, mentioned_products: mentioned };
}

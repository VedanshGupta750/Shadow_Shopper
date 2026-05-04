import { sarah } from "./sarah.js";
import type { Persona } from "../llm/types.js";

export { sarah, SARAH_SYSTEM_PROMPT } from "./sarah.js";
export { buildBrief } from "./brief.js";

/** All available personas. Will grow to 10 in later phases. */
export const ALL_PERSONAS: readonly Persona[] = [sarah];

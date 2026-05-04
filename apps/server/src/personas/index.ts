import { sarah } from "./sarah.js";
import { robert } from "./robert.js";
import { maya } from "./maya.js";
import { david } from "./david.js";
import { tasha } from "./tasha.js";
import { jordan } from "./jordan.js";
import { patricia } from "./patricia.js";
import { aiden } from "./aiden.js";
import { raj } from "./raj.js";
import { linnea } from "./linnea.js";
import type { Persona } from "../llm/types.js";

export { sarah, SARAH_SYSTEM_PROMPT } from "./sarah.js";
export { robert, ROBERT_SYSTEM_PROMPT } from "./robert.js";
export { maya, MAYA_SYSTEM_PROMPT } from "./maya.js";
export { david, DAVID_SYSTEM_PROMPT } from "./david.js";
export { tasha, TASHA_SYSTEM_PROMPT } from "./tasha.js";
export { jordan, JORDAN_SYSTEM_PROMPT } from "./jordan.js";
export { patricia, PATRICIA_SYSTEM_PROMPT } from "./patricia.js";
export { aiden, AIDEN_SYSTEM_PROMPT } from "./aiden.js";
export { raj, RAJ_SYSTEM_PROMPT } from "./raj.js";
export { linnea, LINNEA_SYSTEM_PROMPT } from "./linnea.js";
export { buildBrief } from "./brief.js";

export const PERSONAS: readonly Persona[] = [
  sarah,
  robert,
  maya,
  david,
  tasha,
  jordan,
  patricia,
  aiden,
  raj,
  linnea,
];

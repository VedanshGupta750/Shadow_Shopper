// Mirror of server-side PERSONAS, minimal fields only.
// Order MUST match apps/server/src/personas/index.ts.

export interface PersonaMetadata {
  id: string;
  name: string;
  age: number;
  city: string;
  role: string;
}

export const PERSONA_METADATA: readonly PersonaMetadata[] = [
  { id: "sarah-skeptical-mom",            name: "Sarah",    age: 38, city: "Dayton, OH",       role: "Skeptical Mom" },
  { id: "robert-budget-senior",           name: "Robert",   age: 67, city: "Tampa, FL",        role: "Budget Senior" },
  { id: "maya-fitness-enthusiast",        name: "Maya",     age: 28, city: "Austin, TX",       role: "Fitness Enthusiast" },
  { id: "david-gift-giver",               name: "David",    age: 45, city: "Chicago, IL",      role: "Gift Giver" },
  { id: "tasha-deal-hunter",              name: "Tasha",    age: 32, city: "Atlanta, GA",      role: "Deal Hunter" },
  { id: "jordan-first-time-buyer",        name: "Jordan",   age: 19, city: "Boston, MA",       role: "First-time Buyer" },
  { id: "patricia-brand-loyalist",        name: "Patricia", age: 52, city: "Phoenix, AZ",      role: "Brand Loyalist" },
  { id: "aiden-eco-conscious",            name: "Aiden",    age: 30, city: "Portland, OR",     role: "Eco-Conscious Millennial" },
  { id: "raj-value-engineer",             name: "Raj",      age: 41, city: "San Jose, CA",     role: "Value Engineer" },
  { id: "linnea-subscribe-save-optimizer", name: "Linnea",  age: 36, city: "Minneapolis, MN",  role: "Subscribe & Save Optimizer" },
];

/** DiceBear lorelei avatar URL for a persona. Deterministic per name+age. */
export function getAvatarUrl(name: string, age: number): string {
  const seed = encodeURIComponent(`${name}-${age}`);
  return `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=121212&radius=50`;
}

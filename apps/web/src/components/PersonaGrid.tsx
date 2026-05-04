import { motion, useReducedMotion, type Variants } from "motion/react";
import { PersonaCard } from "./PersonaCard";
import { PERSONA_METADATA } from "../lib/personaMetadata";
import type { PersonaState } from "../hooks/usePersonaStream";

interface Props {
  personaStates: Record<string, PersonaState>;
}

export function PersonaGrid({ personaStates }: Props) {
  const reduced = useReducedMotion();

  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : 0.04,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {PERSONA_METADATA.map((persona) => {
        const state = personaStates[persona.id] ?? {
          tokens: "",
          status: "pending" as const,
        };
        return <PersonaCard key={persona.id} persona={persona} state={state} />;
      })}
    </motion.div>
  );
}

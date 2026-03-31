import { create } from "zustand";

export type WizardStep =
  | "company_name"
  | "niche"
  | "audience"
  | "offer"
  | "region"
  | "tone"
  | "competitors"
  | "goals";

export const steps: WizardStep[] = [
  "company_name",
  "niche",
  "audience",
  "offer",
  "region",
  "tone",
  "competitors",
  "goals",
];

type WizardState = {
  stepIndex: number;
  data: Record<WizardStep, string>;
  setValue: (k: WizardStep, v: string) => void;
  next: () => void;
  prev: () => void;
};

export const useWizardStore = create<WizardState>((set, get) => ({
  stepIndex: 0,
  data: {
    company_name: "",
    niche: "",
    audience: "",
    offer: "",
    region: "Brasil",
    tone: "Profissional, direto, claro",
    competitors: "",
    goals: "",
  },
  setValue: (k, v) => set(s => ({ data: { ...s.data, [k]: v } })),
  next: () => set(s => ({ stepIndex: Math.min(s.stepIndex + 1, steps.length - 1) })),
  prev: () => set(s => ({ stepIndex: Math.max(s.stepIndex - 1, 0) })),
}));

import type { BriefingField, JourneyState } from "@/types/journey";
import { DEFAULT_VALUES, JOURNEY_STEPS } from "@/constants/journey";

export type JourneyAction =
  | { type: "SET_VALUE"; field: BriefingField; value: string }
  | { type: "TOUCH"; field: BriefingField }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GOTO"; index: number }
  | { type: "RESET" };

export const initialJourneyState = (): JourneyState => ({
  stepIndex: 0,
  startedAt: Date.now(),
  backCount: 0,
  values: { ...DEFAULT_VALUES },
  touched: {},
});

export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case "SET_VALUE":
      return { ...state, values: { ...state.values, [action.field]: action.value } };
    case "TOUCH":
      return { ...state, touched: { ...state.touched, [action.field]: true } };
    case "NEXT": {
      const next = Math.min(state.stepIndex + 1, JOURNEY_STEPS.length - 1);
      return { ...state, stepIndex: next };
    }
    case "BACK": {
      const prev = Math.max(state.stepIndex - 1, 0);
      return { ...state, stepIndex: prev, backCount: state.backCount + 1 };
    }
    case "GOTO": {
      const i = Math.max(0, Math.min(action.index, JOURNEY_STEPS.length - 1));
      // if user jumps backwards, count it as a back-ish action
      const backInc = i < state.stepIndex ? 1 : 0;
      return { ...state, stepIndex: i, backCount: state.backCount + backInc };
    }
    case "RESET":
      return initialJourneyState();
    default:
      return state;
  }
}

export function isFieldRequired(field: BriefingField): boolean {
  // required = not optional in config
  return !JOURNEY_STEPS.find((s) => s.id === field)?.optional;
}

export function validateField(field: BriefingField, value: string): string | null {
  if (!isFieldRequired(field)) return null;
  if (value.trim().length === 0) return "Campo obrigatório.";
  if (value.trim().length < 2) return "Muito curto.";
  return null;
}

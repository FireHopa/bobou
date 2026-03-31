import type { SkyBobCard, SkyBobCatalogAnalysis, SkyBobHook, SkyBobRunResponse } from "@/types/api";

export type VoteValue = "like" | "dislike" | null;

export interface SkyBobFeedbackItem<T extends SkyBobHook | SkyBobCard> {
  id: string;
  item: T;
  status: VoteValue;
  notes: string;
  updated_at: string;
}

export interface SkyBobWorkspace {
  version: 2;
  model_used: string;
  nucleus_signature: string;
  updated_at: string;
  catalog_analysis: SkyBobCatalogAnalysis | null;
  study: SkyBobRunResponse | null;
  hooks_feedback: Record<string, SkyBobFeedbackItem<SkyBobHook>>;
  cards_feedback: Record<string, SkyBobFeedbackItem<SkyBobCard>>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptySkyBobWorkspace(signature = ""): SkyBobWorkspace {
  return {
    version: 2,
    model_used: "",
    nucleus_signature: signature,
    updated_at: nowIso(),
    catalog_analysis: null,
    study: null,
    hooks_feedback: {},
    cards_feedback: {},
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function buildSkyBobNucleusSignature(nucleus: Record<string, unknown>): string {
  const keys = [
    "company_name",
    "owner_name",
    "city_state",
    "service_area",
    "main_audience",
    "services_products",
    "real_differentials",
    "restrictions",
    "reviews",
    "testimonials",
    "usable_links_texts",
    "forbidden_content",
    "site",
    "google_business_profile",
    "instagram",
    "linkedin",
    "youtube",
    "tiktok",
  ];

  return keys.map((key) => `${key}:${String(nucleus[key] ?? "").trim()}`).join("|");
}

function normalizeVote(value: unknown): VoteValue {
  if (value === "like" || value === "dislike") return value;
  return null;
}

function normalizeHook(value: unknown): SkyBobHook | null {
  if (!isObject(value)) return null;
  return {
    id: String(value.id ?? ""),
    hook: String(value.hook ?? ""),
    angle: String(value.angle ?? ""),
    format_hint: String(value.format_hint ?? ""),
    use_case: String(value.use_case ?? ""),
    why_it_matches: String(value.why_it_matches ?? ""),
    tags: Array.isArray(value.tags) ? value.tags.map((item) => String(item)) : [],
  };
}

function normalizeCard(value: unknown): SkyBobCard | null {
  if (!isObject(value)) return null;
  return {
    id: String(value.id ?? ""),
    section: String(value.section ?? ""),
    title: String(value.title ?? ""),
    body: String(value.body ?? ""),
    bullets: Array.isArray(value.bullets) ? value.bullets.map((item) => String(item)) : [],
    badges: Array.isArray(value.badges) ? value.badges.map((item) => String(item)) : [],
  };
}

function normalizeHookFeedbackMap(value: unknown): Record<string, SkyBobFeedbackItem<SkyBobHook>> {
  if (!isObject(value)) return {};
  const next: Record<string, SkyBobFeedbackItem<SkyBobHook>> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isObject(raw)) return;
    const item = normalizeHook(raw.item);
    if (!item) return;
    next[key] = {
      id: key,
      item,
      status: normalizeVote(raw.status),
      notes: String(raw.notes ?? ""),
      updated_at: String(raw.updated_at ?? nowIso()),
    };
  });
  return next;
}

function normalizeCardFeedbackMap(value: unknown): Record<string, SkyBobFeedbackItem<SkyBobCard>> {
  if (!isObject(value)) return {};
  const next: Record<string, SkyBobFeedbackItem<SkyBobCard>> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isObject(raw)) return;
    const item = normalizeCard(raw.item);
    if (!item) return;
    next[key] = {
      id: key,
      item,
      status: normalizeVote(raw.status),
      notes: String(raw.notes ?? ""),
      updated_at: String(raw.updated_at ?? nowIso()),
    };
  });
  return next;
}

export function parseSkyBobWorkspace(raw: string | null | undefined): SkyBobWorkspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== 2) return null;
    return {
      version: 2,
      model_used: String(parsed.model_used ?? ""),
      nucleus_signature: String(parsed.nucleus_signature ?? ""),
      updated_at: String(parsed.updated_at ?? nowIso()),
      catalog_analysis: (parsed.catalog_analysis as SkyBobCatalogAnalysis | null) ?? null,
      study: (parsed.study as SkyBobRunResponse | null) ?? null,
      hooks_feedback: normalizeHookFeedbackMap(parsed.hooks_feedback),
      cards_feedback: normalizeCardFeedbackMap(parsed.cards_feedback),
    };
  } catch {
    return null;
  }
}

export function serializeSkyBobWorkspace(workspace: SkyBobWorkspace): string {
  return JSON.stringify(workspace);
}

export function withWorkspaceTimestamp(workspace: SkyBobWorkspace): SkyBobWorkspace {
  return { ...workspace, updated_at: nowIso() };
}

export function buildSkyBobFeedbackPreferences(workspace: SkyBobWorkspace): Record<string, unknown> {
  const hookEntries = Object.values(workspace.hooks_feedback);
  const cardEntries = Object.values(workspace.cards_feedback);

  const likedHooks = hookEntries.filter((entry) => entry.status === "like");
  const dislikedHooks = hookEntries.filter((entry) => entry.status === "dislike");
  const likedCards = cardEntries.filter((entry) => entry.status === "like");
  const dislikedCards = cardEntries.filter((entry) => entry.status === "dislike");

  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

  const seenHooks = unique([
    ...Object.values(workspace.hooks_feedback).map((entry) => entry.item.hook),
    ...(workspace.study?.hooks || []).map((hook) => hook.hook),
  ]);

  return {
    liked_hooks: likedHooks.map((entry) => entry.item.hook),
    disliked_hooks: dislikedHooks.map((entry) => entry.item.hook),
    seen_hooks: seenHooks,
    liked_hook_angles: unique(likedHooks.map((entry) => entry.item.angle)),
    disliked_hook_angles: unique(dislikedHooks.map((entry) => entry.item.angle)),
    liked_hook_formats: unique(likedHooks.map((entry) => entry.item.format_hint)),
    disliked_hook_formats: unique(dislikedHooks.map((entry) => entry.item.format_hint)),
    liked_hook_tags: unique(likedHooks.flatMap((entry) => entry.item.tags)),
    disliked_hook_tags: unique(dislikedHooks.flatMap((entry) => entry.item.tags)),
    liked_hook_notes: likedHooks.map((entry) => entry.notes).filter(Boolean),
    disliked_hook_notes: dislikedHooks.map((entry) => entry.notes).filter(Boolean),
    liked_titles: likedCards.map((entry) => entry.item.title),
    disliked_titles: dislikedCards.map((entry) => entry.item.title),
    liked_sections: unique(likedCards.map((entry) => entry.item.section)),
    disliked_sections: unique(dislikedCards.map((entry) => entry.item.section)),
    liked_card_notes: likedCards.map((entry) => entry.notes).filter(Boolean),
    disliked_card_notes: dislikedCards.map((entry) => entry.notes).filter(Boolean),
    feedback_summary: {
      likes: likedHooks.length + likedCards.length,
      dislikes: dislikedHooks.length + dislikedCards.length,
      hook_likes: likedHooks.length,
      hook_dislikes: dislikedHooks.length,
      card_likes: likedCards.length,
      card_dislikes: dislikedCards.length,
    },
  };
}

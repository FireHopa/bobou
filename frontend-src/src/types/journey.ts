export type BriefingField =
  | "company_name"
  | "owner_name"
  | "niche"
  | "audience"
  | "offer"
  | "region"
  | "tone"
  | "competitors"
  | "goals"
  | "real_differentials"
  | "restrictions"
  | "reviews"
  | "testimonials"
  | "usable_links_texts"
  | "forbidden_content"
  | "site"
  | "google_business_profile"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok";

export type JourneyLevel = 1 | 2 | 3 | 4 | 5;

export type JourneyStep = {
  id: BriefingField;
  label: string;
  helper?: string;
  placeholder?: string;
  optional?: boolean;
  level: JourneyLevel;
  accent?: "blue" | "red" | "yellow" | "green";
};

export type JourneyState = {
  stepIndex: number;
  startedAt: number;
  backCount: number;
  values: Record<BriefingField, string>;
  touched: Partial<Record<BriefingField, boolean>>;
};

export type Achievement = {
  id: "perfect" | "fast" | "complete";
  title: string;
  description: string;
  tone: "blue" | "red" | "yellow" | "green";
};
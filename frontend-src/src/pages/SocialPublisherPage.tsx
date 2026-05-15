import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Facebook,
  FileText,
  Film,
  Globe2,
  Image as ImageIcon,
  Instagram,
  Linkedin,
  Link2,
  Loader2,
  MessageSquareText,
  PlaySquare,
  RefreshCw,
  Save,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastApiError, toastInfo, toastSuccess } from "@/lib/toast";
import { useAuthStore } from "@/state/authStore";
import { facebookService, type FacebookPage } from "@/services/facebook";
import { instagramService } from "@/services/instagram";
import { linkedinService } from "@/services/linkedin";
import { youtubeService } from "@/services/youtube";
import { socialPublisherService } from "@/services/socialPublisher";
import {
  SOCIAL_PUBLISHER_DRAFT_STORAGE_KEY,
  clearSocialPublisherImportNotice,
  readSocialPublisherImportNotice,
  type SocialPublisherImportNotice,
} from "@/lib/socialPublisherDraft";

type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";
type PublishStatus = "idle" | "publishing" | "success" | "error";
type InstagramPublishType = "feed" | "reels" | "story";
type FacebookPublishType = "feed" | "video" | "story";
type LinkedInPublishType = "feed" | "article";
type YouTubePublishType = "video" | "shorts";

type ComposerState = {
  selected: Record<PlatformKey, boolean>;
  baseCaption: string;
  mediaUrlsText: string;
  linkUrl: string;
  scheduledAt: string;
  perNetworkCaption: Record<PlatformKey, string>;
  instagramPublishType: InstagramPublishType;
  instagramFirstComment: string;
  instagramCollaborators: string;
  facebookPublishType: FacebookPublishType;
  facebookPlace: string;
  facebookTags: string;
  linkedinPublishType: LinkedInPublishType;
  linkedinArticleTitle: string;
  linkedinArticleUrl: string;
  linkedinArticleDescription: string;
  youtubePublishType: YouTubePublishType;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string;
  youtubeCategoryId: string;
  youtubePrivacyStatus: "private" | "public" | "unlisted";
  youtubeMadeForKids: boolean;
};

type PlatformResult = {
  status: PublishStatus;
  message?: string;
  url?: string;
  linkLabel?: string;
};

type PlatformCard = {
  key: PlatformKey;
  description: string;
  handle: string;
  iconClass: string;
  activeClass: string;
  glowClass: string;
};

const STORAGE_KEY = SOCIAL_PUBLISHER_DRAFT_STORAGE_KEY;

const platformLabels: Record<PlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

const instagramPublishTypeLabels: Record<InstagramPublishType, string> = {
  feed: "Feed",
  reels: "Reels",
  story: "Stories",
};

const facebookPublishTypeLabels: Record<FacebookPublishType, string> = {
  feed: "Feed",
  video: "Vídeo",
  story: "Stories",
};

const linkedinPublishTypeLabels: Record<LinkedInPublishType, string> = {
  feed: "Feed",
  article: "Artigo / link",
};

const youtubePublishTypeLabels: Record<YouTubePublishType, string> = {
  video: "Vídeo",
  shorts: "Shorts",
};

const defaultState: ComposerState = {
  selected: { instagram: true, facebook: true, linkedin: true, youtube: false },
  baseCaption: "",
  mediaUrlsText: "",
  linkUrl: "",
  scheduledAt: "",
  perNetworkCaption: { instagram: "", facebook: "", linkedin: "", youtube: "" },
  instagramPublishType: "feed",
  instagramFirstComment: "",
  instagramCollaborators: "",
  facebookPublishType: "feed",
  facebookPlace: "",
  facebookTags: "",
  linkedinPublishType: "feed",
  linkedinArticleTitle: "",
  linkedinArticleUrl: "",
  linkedinArticleDescription: "",
  youtubePublishType: "video",
  youtubeTitle: "",
  youtubeDescription: "",
  youtubeTags: "",
  youtubeCategoryId: "22",
  youtubePrivacyStatus: "private",
  youtubeMadeForKids: false,
};

const defaultResults: Record<PlatformKey, PlatformResult> = {
  instagram: { status: "idle" },
  facebook: { status: "idle" },
  linkedin: { status: "idle" },
  youtube: { status: "idle" },
};

function loadDraft(): ComposerState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<ComposerState>;
    return {
      ...defaultState,
      ...parsed,
      selected: { ...defaultState.selected, ...(parsed.selected || {}) },
      perNetworkCaption: { ...defaultState.perNetworkCaption, ...(parsed.perNetworkCaption || {}) },
    };
  } catch {
    return defaultState;
  }
}

function saveDraft(state: ComposerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage cheio ou indisponível. Não bloqueia a tela.
  }
}

function parseItems(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif)$/i;
const SUPPORTED_VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|m4v|webm|mpeg|mpg|3gp)$/i;

function isSupportedImageFile(file: File) {
  return file.type.startsWith("image/") || SUPPORTED_IMAGE_EXTENSION_PATTERN.test(file.name || "");
}

function isSupportedVideoFile(file: File) {
  return file.type.startsWith("video/") || SUPPORTED_VIDEO_EXTENSION_PATTERN.test(file.name || "");
}

function captionFor(state: ComposerState, platform: PlatformKey) {
  return state.perNetworkCaption[platform].trim() || state.baseCaption.trim();
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Erro desconhecido.";
}

function dateLabel(value: string) {
  if (!value) return "Publicar agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function instagramProfileUrl(username?: string | null) {
  const clean = String(username || "").trim().replace(/^@/, "");
  return clean ? `https://www.instagram.com/${clean}/` : undefined;
}

function facebookFallbackUrl(postId?: string | null) {
  return postId ? `https://www.facebook.com/${postId}` : undefined;
}

function linkedinPostUrl(postId?: string | null) {
  return postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined;
}

function Field({ label, icon, children, hint }: { label: string; icon?: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-white/85">
        {icon}
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-white/42">{hint}</p> : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5 sm:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
            value === option.value
              ? "bg-white text-[#07111F] shadow-lg shadow-black/20"
              : "text-white/58 hover:bg-white/[0.07] hover:text-white"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

const formControlBaseClass =
  "w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm text-white shadow-inner shadow-black/20 outline-none transition placeholder:text-white/32 focus:border-cyan-400/55 focus:bg-[#091827] focus:ring-2 focus:ring-cyan-400/12 disabled:cursor-not-allowed disabled:opacity-60";

const darkScrollbarClass =
  "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-cyan-300/30 hover:scrollbar-thumb-cyan-300/50 [scrollbar-color:rgba(103,232,249,0.38)_rgba(255,255,255,0.06)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/[0.045] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-cyan-300/35 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-cyan-200/55";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{ colorScheme: "dark", ...style }}
      className={cn(formControlBaseClass, "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert", className)}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, style, ...rest } = props;
  return (
    <textarea
      {...rest}
      style={{ colorScheme: "dark", ...style }}
      className={cn(formControlBaseClass, "resize-y leading-6", className)}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, style, ...rest } = props;
  return (
    <select
      {...rest}
      style={{ colorScheme: "dark", ...style }}
      className={cn(formControlBaseClass, "cursor-pointer [&>option]:bg-[#07111F] [&>option]:text-white", className)}
    />
  );
}

function PlatformIcon({ platform, className }: { platform: PlatformKey; className?: string }) {
  if (platform === "instagram") return <Instagram className={className} />;
  if (platform === "facebook") return <Facebook className={className} />;
  if (platform === "linkedin") return <Linkedin className={className} />;
  return <Youtube className={className} />;
}

function PreviewPlatformBadge({ platform }: { platform: PlatformKey }) {
  const badgeClass =
    platform === "instagram"
      ? "border-pink-300/30 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white shadow-pink-950/30"
      : platform === "facebook"
        ? "border-blue-300/25 bg-[#1877F2] text-white shadow-blue-950/30"
        : platform === "linkedin"
          ? "border-[#78B7FF]/25 bg-[#0A66C2] text-white shadow-blue-950/30"
          : "border-red-300/25 bg-[#FF0000] text-white shadow-red-950/30";

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-lg", badgeClass)}>
      <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
      {platformLabels[platform]}
    </span>
  );
}

function StatusPill({ result }: { result: PlatformResult }) {
  const style =
    result.status === "success"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
      : result.status === "error"
        ? "border-red-500/25 bg-red-500/10 text-red-200"
        : result.status === "publishing"
          ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-200"
          : "border-white/10 bg-white/[0.04] text-white/55";
  const label = result.status === "success" ? "Publicado" : result.status === "error" ? "Erro" : result.status === "publishing" ? "Publicando" : "Pronto";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", style)} title={result.message}>
      {result.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : result.status === "error" ? <AlertCircle className="h-3.5 w-3.5" /> : result.status === "publishing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function ImagePlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
      <ImageIcon className="h-10 w-10" />
      <p className="text-sm">Selecione uma imagem no site para visualizar.</p>
    </div>
  );
}

function VideoPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
      <PlaySquare className="h-10 w-10" />
      <p className="text-sm">Selecione um vídeo para ver a prévia.</p>
    </div>
  );
}

function NetworkSelectorCard({
  item,
  selected,
  connected,
  result,
  onToggle,
  onConnect,
}: {
  item: PlatformCard;
  selected: boolean;
  connected: boolean;
  result: PlatformResult;
  onToggle: () => void;
  onConnect: () => void;
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-[30px] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400/40",
        selected ? item.activeClass : "border-white/10 bg-white/[0.032] hover:bg-white/[0.055]"
      )}
    >
      <div className={cn("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl transition", selected ? item.glowClass : "bg-white/0")} />
      <div className="relative flex items-start gap-4">
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl text-white shadow-lg", item.iconClass)}>
          <PlatformIcon platform={item.key} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{platformLabels[item.key]}</h3>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", connected ? "bg-emerald-500/12 text-emerald-200" : "bg-white/[0.06] text-white/45")}>
              {connected ? "conectado" : "desconectado"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-white/52">{item.description}</p>
          <div className="mt-2 truncate text-xs text-white/42">{item.handle}</div>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition",
            selected ? "border-cyan-300/40 bg-cyan-400/18 text-cyan-100" : "border-white/10 bg-black/25 text-white/30 group-hover:text-white/55"
          )}
        >
          {selected ? <CheckCircle2 className="h-5 w-5" /> : <span className="h-3 w-3 rounded-full border border-current" />}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill result={result} />
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium", selected ? "bg-cyan-400/12 text-cyan-100" : "bg-white/[0.045] text-white/45")}>
            {selected ? "Selecionada para publicar" : "Não será publicada"}
          </span>
        </div>
        {!connected ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onConnect();
            }}
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/16"
          >
            Conectar
          </button>
        ) : null}
      </div>

      {result.message ? <div className="relative mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/58">{result.message}</div> : null}
    </div>
  );
}

function InstagramPreview({ state, mediaUrls, videoUrl, displayName }: { state: ComposerState; mediaUrls: string[]; videoUrl?: string; displayName: string }) {
  const caption = captionFor(state, "instagram");
  const isVertical = state.instagramPublishType !== "feed";
  return (
    <div className="theme-google-dark-surface overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 text-sm font-bold text-white">
            {displayName.replace("@", "").charAt(0).toUpperCase() || "I"}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{displayName}</div>
            <div className="text-[11px] text-zinc-400">Agora · {instagramPublishTypeLabels[state.instagramPublishType]}</div>
          </div>
        </div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-500">{instagramPublishTypeLabels[state.instagramPublishType]}</span><PreviewPlatformBadge platform="instagram" /></div>
      </div>
      <div className={cn("relative flex items-center justify-center overflow-hidden bg-zinc-900", isVertical ? "aspect-[9/16] max-h-[520px]" : "aspect-square")}>
        {videoUrl && state.instagramPublishType !== "feed" ? <video src={videoUrl} controls className="h-full w-full bg-black object-cover" /> : mediaUrls[0] ? <img src={mediaUrls[0]} alt="Preview Instagram" className="h-full w-full object-cover" /> : <ImagePlaceholder />}
        {mediaUrls.length > 1 && state.instagramPublishType === "feed" ? <div className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">1/{mediaUrls.length}</div> : null}
      </div>
      <div className="space-y-3 px-4 py-3 text-white">
        <div className="flex items-center gap-4 text-zinc-200"><Instagram className="h-5 w-5" /><MessageSquareText className="h-5 w-5" /><Send className="h-5 w-5" /></div>
        <div className="min-h-[96px] whitespace-pre-wrap text-sm leading-6 text-zinc-100"><span className="mr-2 font-semibold">{displayName}</span>{caption || (state.instagramPublishType === "story" ? "Stories podem sair sem legenda." : "Sua legenda aparecerá aqui.")}</div>
      </div>
    </div>
  );
}

function FacebookPreview({ state, mediaUrls, videoUrl, pageName }: { state: ComposerState; mediaUrls: string[]; videoUrl?: string; pageName: string }) {
  const caption = captionFor(state, "facebook");
  const isStory = state.facebookPublishType === "story";
  return (
    <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-lg font-bold text-white">{pageName.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">{pageName}</div>
            <div className="text-[11px] text-zinc-500">{dateLabel(state.scheduledAt)} · {facebookPublishTypeLabels[state.facebookPublishType]}</div>
          </div>
        </div>
        <PreviewPlatformBadge platform="facebook" />
      </div>
      <div className="space-y-4 px-4 py-4">
        {state.facebookPublishType !== "story" ? <div className="min-h-[82px] whitespace-pre-wrap text-[15px] leading-6 text-zinc-800">{caption || "Seu texto aparecerá aqui."}</div> : null}
        {state.facebookPublishType === "feed" && state.linkUrl.trim() ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"><div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500"><Link2 className="h-3.5 w-3.5" /> Link</div><div className="truncate">{state.linkUrl}</div></div> : null}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
          {state.facebookPublishType === "video" && videoUrl ? <div className="aspect-video bg-black"><video src={videoUrl} controls className="h-full w-full bg-black" /></div> : mediaUrls.length > 0 ? <div className={cn("grid", isStory ? "grid-cols-1" : mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>{mediaUrls.slice(0, isStory ? 1 : 4).map((image, index) => <div key={`${image}-${index}`} className={cn("bg-zinc-200", isStory ? "aspect-[9/16] max-h-[520px]" : "aspect-square")}><img src={image} alt={`Preview Facebook ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div> : <div className="flex aspect-[1.4/1] flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500"><ImageIcon className="h-10 w-10" /><p className="text-sm">Imagem ou vídeo opcional.</p></div>}
        </div>
      </div>
      <div className="flex items-center gap-5 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500"><span>Comentar</span><span>Compartilhar</span></div>
    </div>
  );
}

function LinkedInPreview({ state, mediaUrls }: { state: ComposerState; mediaUrls: string[] }) {
  const caption = captionFor(state, "linkedin");
  return (
    <div className="theme-google-dark-surface overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0f1b] text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-lg font-bold text-white">L</div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">Seu perfil no LinkedIn</div><div className="text-[11px] text-white/45">Agora · {linkedinPublishTypeLabels[state.linkedinPublishType]}</div></div>
        </div>
        <PreviewPlatformBadge platform="linkedin" />
      </div>
      <div className="space-y-4 p-4">
        <div className="min-h-[96px] whitespace-pre-wrap text-sm leading-6 text-white/86">{caption || "Seu post aparecerá aqui."}</div>
        {state.linkedinPublishType === "article" ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <div className="flex aspect-[1.91/1] items-center justify-center bg-white/[0.06] px-6 text-center">
              <FileText className="h-10 w-10 text-white/45" />
            </div>
            <div className="space-y-1 border-t border-white/10 p-4">
              <div className="line-clamp-2 text-sm font-semibold text-white">{state.linkedinArticleTitle || "Título do artigo/link"}</div>
              <div className="line-clamp-2 text-xs leading-5 text-white/50">{state.linkedinArticleDescription || state.linkedinArticleUrl || "URL e resumo aparecem aqui."}</div>
            </div>
          </div>
        ) : mediaUrls.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <div className="relative aspect-[1.91/1] bg-black">
              <img src={mediaUrls[0]} alt="Preview LinkedIn" className="h-full w-full object-cover" />
              {mediaUrls.length > 1 ? (
                <div className="absolute right-3 top-3 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white">
                  1/{mediaUrls.length}
                </div>
              ) : null}
            </div>
            {mediaUrls.length > 1 ? (
              <div className="border-t border-white/10 px-3 py-2 text-[11px] leading-4 text-white/45">
                O LinkedIn recebe até 10 imagens. Esta prévia destaca a primeira.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-5 border-t border-white/10 px-4 py-3 text-sm text-white/45"><span>Gostei</span><span>Comentar</span><span>Compartilhar</span></div>
    </div>
  );
}

function YouTubePreview({ state, videoUrl, thumbUrl }: { state: ComposerState; videoUrl?: string; thumbUrl?: string }) {
  return (
    <div className="theme-google-dark-surface overflow-hidden rounded-[28px] border border-white/10 bg-[#111114] text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">Prévia do {youtubePublishTypeLabels[state.youtubePublishType]}</div>
          <div className="text-[11px] text-white/45">Canal do YouTube</div>
        </div>
        <PreviewPlatformBadge platform="youtube" />
      </div>
      <div className={cn("flex items-center justify-center overflow-hidden bg-black", state.youtubePublishType === "shorts" ? "aspect-[9/16] max-h-[520px]" : "aspect-video")}>{videoUrl ? <video src={videoUrl} controls className="h-full w-full bg-black" /> : thumbUrl ? <img src={thumbUrl} alt="Thumbnail YouTube" className="h-full w-full object-cover" /> : <VideoPlaceholder />}</div>
      <div className="space-y-4 p-5"><div><div className="text-lg font-semibold leading-snug">{state.youtubeTitle || "Título do vídeo"}</div><div className="mt-1 text-xs text-zinc-400">{state.youtubePrivacyStatus === "public" ? "Público" : state.youtubePrivacyStatus === "unlisted" ? "Não listado" : "Privado"}</div></div><div className="min-h-[110px] whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-300">{state.youtubeDescription || captionFor(state, "youtube") || "A descrição do vídeo aparecerá aqui."}</div></div>
    </div>
  );
}

export default function SocialPublisherPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [state, setState] = React.useState<ComposerState>(() => loadDraft());
  const [results, setResults] = React.useState<Record<PlatformKey, PlatformResult>>(defaultResults);
  const [facebookPages, setFacebookPages] = React.useState<FacebookPage[]>([]);
  const [facebookSelectedPageId, setFacebookSelectedPageId] = React.useState("");
  const [isLoadingFacebookPages, setIsLoadingFacebookPages] = React.useState(false);
  const [isPublishingAll, setIsPublishingAll] = React.useState(false);
  const [importNotice, setImportNotice] = React.useState<SocialPublisherImportNotice | null>(() => readSocialPublisherImportNotice());
  const [mediaFiles, setMediaFiles] = React.useState<File[]>([]);
  const [mediaFilePreviewUrls, setMediaFilePreviewUrls] = React.useState<string[]>([]);
  const mediaUploadCacheRef = React.useRef<{ signature: string; urls: string[] } | null>(null);
  const videoUploadCacheRef = React.useRef<{ signature: string; url: string } | null>(null);
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = React.useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = React.useState<string>();
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = React.useState<string>();

  React.useEffect(() => saveDraft(state), [state]);

  React.useEffect(() => {
    if (!importNotice) return;
    clearSocialPublisherImportNotice();
    toastSuccess(`Rascunho importado de ${importNotice.agentName}.`);
  }, [importNotice]);

  React.useEffect(() => {
    if (!mediaFiles.length) { setMediaFilePreviewUrls([]); return; }
    const urls = mediaFiles.map((file) => URL.createObjectURL(file));
    setMediaFilePreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [mediaFiles]);

  React.useEffect(() => {
    mediaUploadCacheRef.current = null;
  }, [mediaFiles]);

  React.useEffect(() => {
    videoUploadCacheRef.current = null;
    if (!videoFile) { setVideoPreviewUrl(undefined); return; }
    const url = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  React.useEffect(() => {
    if (!thumbnailFile) { setThumbnailPreviewUrl(undefined); return; }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  const externalMediaUrls = React.useMemo(() => parseItems(state.mediaUrlsText), [state.mediaUrlsText]);
  const mediaPreviewUrls = React.useMemo(() => [...mediaFilePreviewUrls, ...externalMediaUrls], [mediaFilePreviewUrls, externalMediaUrls]);
  const connected = React.useMemo(() => ({
    instagram: Boolean(user?.has_instagram),
    facebook: Boolean(user?.has_facebook),
    linkedin: Boolean(user?.has_linkedin),
    youtube: Boolean(user?.has_youtube),
  }), [user?.has_facebook, user?.has_instagram, user?.has_linkedin, user?.has_youtube]);
  const selectedPlatforms = React.useMemo(() => (Object.keys(state.selected) as PlatformKey[]).filter((key) => state.selected[key]), [state.selected]);
  const successfulLinks = React.useMemo(() => (Object.keys(results) as PlatformKey[]).filter((platform) => results[platform].status === "success" && results[platform].url), [results]);

  React.useEffect(() => {
    if (user?.has_facebook) void loadFacebookPages();
  }, [user?.has_facebook]);

  const handleBack = React.useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/dashboard");
  }, [navigate]);

  function patch(patchState: Partial<ComposerState>) { setState((current) => ({ ...current, ...patchState })); }
  function patchCaption(platform: PlatformKey, value: string) { setState((current) => ({ ...current, perNetworkCaption: { ...current.perNetworkCaption, [platform]: value } })); }
  function togglePlatform(platform: PlatformKey) { setState((current) => ({ ...current, selected: { ...current.selected, [platform]: !current.selected[platform] } })); }
  function removeMediaFile(indexToRemove: number) { setMediaFiles((current) => current.filter((_, index) => index !== indexToRemove)); }
  function appendMediaFiles(files: FileList | null) {
    if (!files?.length) return;

    const incomingFiles = Array.from(files);
    const acceptedFiles = incomingFiles.filter(isSupportedImageFile);
    const rejectedCount = incomingFiles.length - acceptedFiles.length;

    if (rejectedCount > 0) {
      toastInfo("Alguns arquivos foram ignorados porque não parecem ser imagens válidas.");
    }

    if (!acceptedFiles.length) {
      toastInfo("Selecione uma imagem em PNG, JPG, JPEG, WEBP ou GIF.");
      return;
    }

    const availableSlots = Math.max(0, 10 - mediaFiles.length);
    if (availableSlots <= 0) {
      toastInfo("Você já atingiu o limite de 10 imagens nesta publicação.");
      return;
    }

    const filesToAdd = acceptedFiles.slice(0, availableSlots);
    if (acceptedFiles.length > availableSlots) {
      toastInfo(`Foram adicionadas ${filesToAdd.length} imagem(ns). O limite por publicação é de 10 imagens.`);
    }

    setMediaFiles((current) => [...current, ...filesToAdd].slice(0, 10));
  }
  function mediaFileSignature() {
    return mediaFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
  }
  function videoFileSignature() {
    return videoFile ? `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}` : "";
  }
  function handleVideoFileChange(file: File | null) {
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (!isSupportedVideoFile(file)) {
      toastInfo("Selecione um vídeo em MP4, MOV, M4V, WEBM, MPEG ou 3GP.");
      return;
    }
    setVideoFile(file);
  }
  async function getPublishMediaUrls() {
    const signature = mediaFileSignature();
    let uploadedUrls: string[] = [];
    if (mediaFiles.length) {
      if (mediaUploadCacheRef.current?.signature === signature) {
        uploadedUrls = mediaUploadCacheRef.current.urls;
      } else {
        const response = await socialPublisherService.uploadMedia(mediaFiles);
        uploadedUrls = response.urls || response.items.map((item) => item.url);
        mediaUploadCacheRef.current = { signature, urls: uploadedUrls };
      }
    }
    return [...uploadedUrls, ...externalMediaUrls];
  }
  async function getPublishVideoUrl() {
    if (!videoFile) return undefined;
    const signature = videoFileSignature();
    if (videoUploadCacheRef.current?.signature === signature) return videoUploadCacheRef.current.url;
    const response = await socialPublisherService.uploadMedia([videoFile]);
    const url = response.urls?.[0] || response.items?.[0]?.url;
    if (!url) throw new Error("Não foi possível preparar o vídeo para publicação.");
    videoUploadCacheRef.current = { signature, url };
    return url;
  }
  function setPlatformResult(platform: PlatformKey, result: PlatformResult) { setResults((current) => ({ ...current, [platform]: result })); }
  function resetResults() { setResults({ ...defaultResults }); }

  async function loadFacebookPages() {
    if (isLoadingFacebookPages) return;
    setIsLoadingFacebookPages(true);
    try {
      const status = await facebookService.status();
      let pages: FacebookPage[] = [];
      try { pages = JSON.parse(status.pages || "[]") as FacebookPage[]; } catch { pages = []; }
      setFacebookPages(pages);
      setFacebookSelectedPageId((current) => current || status.page_id || pages[0]?.id || "");
    } catch (error) {
      toastApiError(error, "Erro ao carregar páginas do Facebook");
    } finally {
      setIsLoadingFacebookPages(false);
    }
  }

  async function connect(platform: PlatformKey) {
    try {
      if (platform === "linkedin") {
        localStorage.setItem("linkedin_redirect", "/social-publisher");
        const data = await linkedinService.getAuthUrl();
        window.location.href = data.url;
        return;
      }
      if (platform === "instagram") { instagramService.startAuth("/social-publisher"); return; }
      if (platform === "facebook") { facebookService.startAuth("/social-publisher"); return; }
      const oauthState = `youtube::/social-publisher::${Date.now()}`;
      localStorage.setItem("youtube_oauth_state", oauthState);
      localStorage.setItem("youtube_redirect", "/social-publisher");
      const data = await youtubeService.getAuthUrl(oauthState);
      window.location.href = data.url;
    } catch (error) {
      toastApiError(error, `Erro ao conectar ${platformLabels[platform]}`);
    }
  }

  function validate(platform: PlatformKey): string | null {
    const text = captionFor(state, platform);
    if (!connected[platform]) return `${platformLabels[platform]} não está conectado.`;
    if (platform === "instagram") {
      if (state.instagramPublishType !== "story" && !text) return "Informe uma legenda para o Instagram.";
      if (state.instagramPublishType === "feed" && !mediaFiles.length && !externalMediaUrls.length) return "Selecione pelo menos uma imagem para publicar no feed do Instagram.";
      if (state.instagramPublishType === "reels" && !videoFile) return "Selecione um vídeo para publicar Reels no Instagram.";
      if (state.instagramPublishType === "story" && !videoFile && !mediaFiles.length && !externalMediaUrls.length) return "Selecione uma imagem ou vídeo para publicar Stories no Instagram.";
      if (externalMediaUrls.some((url) => !isHttpUrl(url))) return "As mídias importadas do Instagram precisam começar com http:// ou https://.";
    }
    if (platform === "facebook") {
      if (state.facebookPublishType === "feed" && !text && !state.linkUrl.trim() && !mediaFiles.length && !externalMediaUrls.length) return "Informe texto, link ou imagem para o Facebook.";
      if (state.facebookPublishType === "video" && !videoFile) return "Selecione um vídeo para publicar no Facebook.";
      if (state.facebookPublishType === "story" && !mediaFiles.length && !externalMediaUrls.length) return "Selecione uma imagem para publicar Stories no Facebook.";
      if (state.linkUrl.trim() && !isHttpUrl(state.linkUrl)) return "O link do Facebook precisa começar com http:// ou https://.";
      if (externalMediaUrls.some((url) => !isHttpUrl(url))) return "As imagens importadas do Facebook precisam começar com http:// ou https://.";
      if (state.scheduledAt && state.facebookPublishType !== "story" && new Date(state.scheduledAt).getTime() <= Date.now() + 10 * 60 * 1000) return "O agendamento do Facebook precisa estar no futuro.";
    }
    if (platform === "linkedin") {
      if (!text) return "Informe o texto do post para o LinkedIn.";
      if (state.linkedinPublishType === "article") {
        if (!state.linkedinArticleTitle.trim()) return "Informe o título do artigo/link do LinkedIn.";
        if (!state.linkedinArticleUrl.trim() || !isHttpUrl(state.linkedinArticleUrl)) return "Informe uma URL válida do artigo/link do LinkedIn.";
      }
      if (externalMediaUrls.some((url) => !isHttpUrl(url))) return "As imagens importadas do LinkedIn precisam começar com http:// ou https://.";
    }
    if (platform === "youtube") {
      if (!videoFile) return `Selecione o arquivo de vídeo para o YouTube ${youtubePublishTypeLabels[state.youtubePublishType]}.`;
      if (!state.youtubeTitle.trim()) return "Informe o título do vídeo do YouTube.";
    }
    return null;
  }

  async function publishOne(platform: PlatformKey) {
    const validationError = validate(platform);
    if (validationError) { setPlatformResult(platform, { status: "error", message: validationError }); return false; }
    setPlatformResult(platform, { status: "publishing" });
    try {
      if (platform === "instagram") {
        const publishMediaUrls = await getPublishMediaUrls();
        const publishVideoUrl = state.instagramPublishType === "reels" || (state.instagramPublishType === "story" && videoFile) ? await getPublishVideoUrl() : undefined;
        const response = await instagramService.publish({
          caption: captionFor(state, "instagram"),
          publish_type: state.instagramPublishType,
          image_url: publishMediaUrls.length <= 1 ? publishMediaUrls[0] : undefined,
          video_url: publishVideoUrl,
          carousel_images: state.instagramPublishType === "feed" && publishMediaUrls.length > 1 ? publishMediaUrls : [],
          collaborators: state.instagramPublishType === "feed" || state.instagramPublishType === "reels" ? parseItems(state.instagramCollaborators).map((item) => item.replace(/^@/, "")) : [],
          first_comment: state.instagramPublishType === "feed" ? state.instagramFirstComment.trim() || undefined : undefined,
          share_to_feed: state.instagramPublishType === "reels" ? true : undefined,
        });
        const profileUrl = instagramProfileUrl(response.instagram_username || user?.instagram_username);
        setPlatformResult(platform, {
          status: "success",
          message: response.warning ? `Publicado no Instagram ${instagramPublishTypeLabels[state.instagramPublishType]}. Houve aviso no primeiro comentário.` : `Publicado no Instagram ${instagramPublishTypeLabels[state.instagramPublishType]}.`,
          url: response.permalink_url || profileUrl,
          linkLabel: response.permalink_url ? "Abrir post" : "Abrir perfil",
        });
      }
      if (platform === "facebook") {
        if (facebookSelectedPageId) await facebookService.selectPage(facebookSelectedPageId);
        const publishMediaUrls = await getPublishMediaUrls();
        const publishVideoUrl = state.facebookPublishType === "video" ? await getPublishVideoUrl() : undefined;
        const scheduled_publish_time = state.scheduledAt && state.facebookPublishType !== "story" ? Math.floor(new Date(state.scheduledAt).getTime() / 1000) : undefined;
        const response = await facebookService.publish({
          message: captionFor(state, "facebook"),
          publish_type: state.facebookPublishType,
          link: state.facebookPublishType === "feed" ? state.linkUrl.trim() || undefined : undefined,
          image_url: publishMediaUrls.length <= 1 ? publishMediaUrls[0] : undefined,
          video_url: publishVideoUrl,
          title: state.youtubeTitle.trim() || undefined,
          carousel_images: state.facebookPublishType === "feed" && publishMediaUrls.length > 1 ? publishMediaUrls : [],
          published: !scheduled_publish_time,
          scheduled_publish_time,
          place: state.facebookPublishType === "feed" ? state.facebookPlace.trim() || undefined : undefined,
          tags: state.facebookPublishType === "feed" ? parseItems(state.facebookTags) : [],
        });
        setPlatformResult(platform, {
          status: "success",
          message: scheduled_publish_time ? "Agendado no Facebook." : `Publicado no Facebook ${facebookPublishTypeLabels[state.facebookPublishType]}.`,
          url: response.permalink_url || facebookFallbackUrl(response.post_id),
          linkLabel: scheduled_publish_time ? "Abrir agendamento" : "Abrir post",
        });
      }
      if (platform === "linkedin") {
        const publishMediaUrls = await getPublishMediaUrls();
        const response = await linkedinService.publish({
          mode: state.linkedinPublishType,
          text: captionFor(state, "linkedin"),
          article: state.linkedinPublishType === "article" ? {
            title: state.linkedinArticleTitle.trim(),
            url: state.linkedinArticleUrl.trim(),
            description: state.linkedinArticleDescription.trim() || undefined,
          } : undefined,
          image_urls: state.linkedinPublishType === "feed" ? publishMediaUrls : [],
          alt_text: "Imagem anexada pelo Publicador Social",
        });
        setPlatformResult(platform, {
          status: "success",
          message: state.linkedinPublishType === "article" ? "Artigo/link publicado no LinkedIn." : publishMediaUrls.length ? "Post publicado no LinkedIn com imagem." : "Post publicado no LinkedIn.",
          url: linkedinPostUrl(response.post_id),
          linkLabel: "Abrir post",
        });
      }
      if (platform === "youtube") {
        if (!videoFile) throw new Error("Selecione o arquivo de vídeo para o YouTube.");
        const response = await youtubeService.publish({
          title: state.youtubeTitle.trim(),
          description: state.youtubeDescription.trim() || captionFor(state, "youtube"),
          privacy_status: state.youtubePrivacyStatus,
          made_for_kids: state.youtubeMadeForKids,
          tags: state.youtubeTags,
          category_id: state.youtubeCategoryId || "22",
          video_file: videoFile,
          thumbnail_file: thumbnailFile,
        });
        setPlatformResult(platform, {
          status: "success",
          message: response.thumbnail_warning ? `${youtubePublishTypeLabels[state.youtubePublishType]} enviado. A thumbnail não foi aplicada.` : `${youtubePublishTypeLabels[state.youtubePublishType]} publicado no YouTube.`,
          url: response.video_url,
          linkLabel: "Abrir vídeo",
        });
      }
      return true;
    } catch (error) {
      setPlatformResult(platform, { status: "error", message: errorText(error) });
      return false;
    }
  }

  async function publishSelected() {
    if (isPublishingAll) return;
    resetResults();
    if (!selectedPlatforms.length) { toastInfo("Selecione pelo menos uma rede social."); return; }
    setIsPublishingAll(true);
    let successCount = 0;
    try {
      for (const platform of selectedPlatforms) {
        const ok = await publishOne(platform);
        if (ok) successCount += 1;
      }
      if (successCount === selectedPlatforms.length) toastSuccess("Publicação enviada para todas as redes selecionadas.");
      else if (successCount > 0) toastInfo("Algumas redes publicaram, outras precisam de ajuste. Veja o status de cada canal.");
      else toastInfo("Nenhuma publicação foi concluída. Veja os avisos por rede.");
    } finally {
      setIsPublishingAll(false);
    }
  }

  function clearDraft() {
    setState(defaultState);
    setMediaFiles([]);
    mediaUploadCacheRef.current = null;
    videoUploadCacheRef.current = null;
    setVideoFile(null);
    setThumbnailFile(null);
    resetResults();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    toastSuccess("Rascunho limpo.");
  }

  const platformCards: PlatformCard[] = [
    { key: "instagram", description: "Feed, carrossel, Reels e Stories.", handle: user?.instagram_username ? `@${user.instagram_username}` : "Não conectado", iconClass: "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400", activeClass: "border-pink-300/35 bg-pink-400/[0.09]", glowClass: "bg-pink-400/25" },
    { key: "facebook", description: "Feed, imagem, link, vídeo e Stories.", handle: user?.facebook_page_name || user?.facebook_page_username || "Não conectado", iconClass: "bg-[#1877F2]", activeClass: "border-blue-300/35 bg-blue-400/[0.09]", glowClass: "bg-blue-400/25" },
    { key: "linkedin", description: "Feed com imagem ou artigo/link.", handle: connected.linkedin ? "Conta vinculada" : "Não conectado", iconClass: "bg-[#0A66C2]", activeClass: "border-[#78B7FF]/35 bg-[#0A66C2]/[0.12]", glowClass: "bg-[#0A66C2]/30" },
    { key: "youtube", description: "Vídeo completo ou Shorts com metadados.", handle: user?.youtube_channel_title || user?.youtube_channel_handle || "Não conectado", iconClass: "bg-[#FF0000]", activeClass: "border-red-300/35 bg-red-400/[0.09]", glowClass: "bg-red-400/25" },
  ];

  const facebookPageName = React.useMemo(() => facebookPages.find((page) => page.id === facebookSelectedPageId)?.name || user?.facebook_page_name || "Sua página", [facebookPages, facebookSelectedPageId, user?.facebook_page_name]);
  const instagramName = user?.instagram_username ? `@${user.instagram_username}` : "@seuinstagram";

  return (
    <div className="social-publisher-shell relative min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,200,232,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_30%),linear-gradient(180deg,#040812_0%,#070B14_48%,#05070D_100%)] text-white">
      <div className="social-publisher-grid-overlay pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />

      <div className="fixed left-4 top-4 z-50 sm:left-6 sm:top-6">
        <Button variant="outline" onClick={handleBack} className="border-white/15 bg-black/30 text-white backdrop-blur hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="social-publisher-content relative z-10 mx-auto flex w-full max-w-[1780px] flex-col gap-6 px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <section className="social-publisher-panel social-publisher-hero overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.30)] md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200"><Share2 className="h-3.5 w-3.5" /> Publicador Social</div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white md:text-5xl">Um post. Várias redes. Uma revisão clara antes de publicar.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">Selecione os canais com cards grandes, monte o conteúdo central, ajuste por rede e acompanhe o status com links de acesso ao final da publicação.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-3xl border border-white/10 bg-black/22 p-4"><div className="text-3xl font-semibold text-white">{selectedPlatforms.length}</div><div className="mt-1 text-sm text-white/50">redes selecionadas</div></div>
              <div className="rounded-3xl border border-white/10 bg-black/22 p-4"><div className="text-3xl font-semibold text-white">1</div><div className="mt-1 text-sm text-white/50">compositor central</div></div>
              <div className="rounded-3xl border border-white/10 bg-black/22 p-4"><div className="text-3xl font-semibold text-white">auto</div><div className="mt-1 text-sm text-white/50">rascunho salvo</div></div>
            </div>
          </div>
        </section>

        {importNotice ? (
          <section className="social-publisher-panel rounded-[30px] border border-cyan-300/20 bg-cyan-400/[0.075] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.20)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Importado do agente de autoridade</div>
                <h2 className="mt-2 text-xl font-semibold text-white">{importNotice.title}</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-white/62">O texto já foi colocado no compositor central e nas legendas por rede. Revise os canais selecionados, adicione imagem ou vídeo quando necessário e publique.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 border-white/15 bg-black/24 text-white hover:bg-white/10"
                onClick={() => setImportNotice(null)}
              >
                Ocultar aviso
              </Button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 2xl:grid-cols-[430px_minmax(0,1fr)_500px]">
          <aside className="space-y-6 2xl:sticky 2xl:top-6 2xl:self-start">
            <div className="social-publisher-panel rounded-[32px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Escolha as redes</h2>
                  <p className="mt-1 text-sm leading-6 text-white/50">Clique no card inteiro. Nada de checkbox pequena.</p>
                </div>
                <Link to="/conta" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/65 transition hover:bg-white/[0.08] hover:text-white">Conexões</Link>
              </div>
              <div className="space-y-4">
                {platformCards.map((item) => (
                  <NetworkSelectorCard
                    key={item.key}
                    item={item}
                    selected={state.selected[item.key]}
                    connected={connected[item.key]}
                    result={results[item.key]}
                    onToggle={() => togglePlatform(item.key)}
                    onConnect={() => void connect(item.key)}
                  />
                ))}
              </div>
            </div>

            <div className="social-publisher-panel rounded-[30px] border border-white/10 bg-[#08111c]/92 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <div className="mb-4 grid gap-2 text-sm text-white/58">
                <div className="flex items-center gap-2"><Save className="h-4 w-4 text-cyan-300" /> Rascunho salvo automaticamente</div>
                <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-cyan-300" /> {selectedPlatforms.map((key) => platformLabels[key]).join(", ") || "Nenhuma rede selecionada"}</div>
              </div>
              <Button type="button" size="lg" onClick={() => void publishSelected()} isLoading={isPublishingAll} disabled={isPublishingAll} className="h-14 w-full rounded-2xl text-base">
                <Send className="h-5 w-5" /> Publicar nas redes selecionadas
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-white/38">Revise as prévias e permissões das contas antes de enviar.</p>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="social-publisher-panel rounded-[32px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-6">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Conteúdo base</h2>
                  <p className="mt-1 text-sm text-white/50">Esse texto alimenta todas as redes. Depois você pode personalizar por canal.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={clearDraft} className="border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"><Trash2 className="h-4 w-4" /> Limpar</Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <Field label="Legenda principal" icon={<MessageSquareText className="h-4 w-4 text-cyan-300" />}>
                  <TextArea value={state.baseCaption} onChange={(event) => patch({ baseCaption: event.target.value })} className="min-h-[252px]" placeholder="Escreva o texto principal do post..." />
                </Field>
                <div className="space-y-5">
                  <Field label="Imagem ou carrossel" icon={<ImageIcon className="h-4 w-4 text-cyan-300" />} hint="Selecione o arquivo no site. O sistema prepara automaticamente a URL pública necessária para a API do Instagram e do Facebook.">
                    <label className="flex min-h-[156px] cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-cyan-300/22 bg-cyan-400/[0.055] px-5 py-6 text-center transition hover:border-cyan-200/42 hover:bg-cyan-400/[0.08]">
                      <Upload className="h-6 w-6 text-cyan-200" />
                      <span className="text-sm font-semibold text-white">Selecionar imagem</span>
                      <span className="max-w-[320px] text-xs leading-5 text-white/42">PNG, JPG, WEBP ou GIF. Com 2 ou mais imagens, o sistema publica como carrossel quando a rede permitir.</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => { appendMediaFiles(event.target.files); event.currentTarget.value = ""; }} />
                    </label>
                    {mediaFiles.length || externalMediaUrls.length ? (
                      <div className="mt-3 space-y-2">
                        {mediaFiles.map((file, index) => (
                          <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/62">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                {mediaFilePreviewUrls[index] ? <img src={mediaFilePreviewUrls[index]} alt={`Imagem anexada ${index + 1}`} className="h-full w-full object-cover" /> : null}
                              </div>
                              <span className="min-w-0 truncate">{index + 1}. {file.name}</span>
                            </div>
                            <button type="button" onClick={() => removeMediaFile(index)} className="shrink-0 rounded-full px-2 py-1 text-white/45 transition hover:bg-white/10 hover:text-white">Remover</button>
                          </div>
                        ))}
                        {externalMediaUrls.length ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.055] px-3 py-2 text-xs leading-5 text-cyan-100/70">{externalMediaUrls.length} imagem(ns) importada(s) automaticamente do rascunho e já enviada(s) para a prévia.</div> : null}
                      </div>
                    ) : null}
                  </Field>

                  <Field label="Vídeo para Reels, Shorts, Stories ou Facebook" icon={<Film className="h-4 w-4 text-cyan-300" />} hint="Use MP4, MOV, M4V ou WEBM. O mesmo vídeo pode alimentar Instagram Reels, Facebook Vídeo e YouTube Shorts.">
                    <label className="flex min-h-[126px] cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/12 bg-black/20 px-5 py-6 text-center transition hover:border-cyan-200/35 hover:bg-white/[0.045]">
                      <Upload className="h-6 w-6 text-cyan-200" />
                      <span className="text-sm font-semibold text-white">Selecionar vídeo</span>
                      <span className="max-w-[320px] truncate text-xs leading-5 text-white/42">{videoFile?.name || "Nenhum vídeo selecionado"}</span>
                      <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mpeg,.mpg,.3gp" className="hidden" onChange={(event) => handleVideoFileChange(event.target.files?.[0] || null)} />
                    </label>
                    {videoFile ? (
                      <button type="button" onClick={() => handleVideoFileChange(null)} className="mt-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/58 transition hover:bg-white/[0.08] hover:text-white">Remover vídeo</button>
                    ) : null}
                  </Field>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
              <div className="mb-5 flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-xl font-semibold text-white">Ajustes por rede</h2>
                  <p className="mt-1 text-sm text-white/50">Use apenas quando quiser uma legenda ou configuração diferente por canal.</p>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-3xl border border-pink-500/15 bg-pink-500/[0.045] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white"><Instagram className="h-4 w-4 text-pink-300" /> Instagram</div>
                  <SegmentedControl<InstagramPublishType>
                    value={state.instagramPublishType}
                    onChange={(value) => patch({ instagramPublishType: value })}
                    options={[
                      { value: "feed", label: "Feed", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                      { value: "reels", label: "Reels", icon: <Film className="h-3.5 w-3.5" /> },
                      { value: "story", label: "Stories", icon: <PlaySquare className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  <TextArea value={state.perNetworkCaption.instagram} onChange={(event) => patchCaption("instagram", event.target.value)} className="min-h-[120px]" placeholder="Legenda específica para Instagram..." />
                  {state.instagramPublishType === "feed" || state.instagramPublishType === "reels" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.instagramFirstComment} onChange={(event) => patch({ instagramFirstComment: event.target.value })} placeholder="Primeiro comentário" disabled={state.instagramPublishType !== "feed"} /><TextInput value={state.instagramCollaborators} onChange={(event) => patch({ instagramCollaborators: event.target.value })} placeholder="Colaboradores: usuario1, usuario2" /></div>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-white/42">Feed usa imagem/carrossel. Reels usa o vídeo selecionado. Stories usa imagem ou vídeo.</p>
                </div>

                <div className="rounded-3xl border border-blue-500/15 bg-blue-500/[0.045] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold text-white"><Facebook className="h-4 w-4 text-blue-300" /> Facebook</div>{user?.has_facebook ? <button type="button" onClick={() => void loadFacebookPages()} className="inline-flex items-center gap-1 text-xs text-blue-200 hover:text-blue-100"><RefreshCw className={cn("h-3.5 w-3.5", isLoadingFacebookPages ? "animate-spin" : "")} /> Atualizar páginas</button> : null}</div>
                  <SegmentedControl<FacebookPublishType>
                    value={state.facebookPublishType}
                    onChange={(value) => patch({ facebookPublishType: value })}
                    options={[
                      { value: "feed", label: "Feed", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                      { value: "video", label: "Vídeo", icon: <Film className="h-3.5 w-3.5" /> },
                      { value: "story", label: "Stories", icon: <PlaySquare className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  {facebookPages.length > 0 ? <div className="mb-3"><SelectInput value={facebookSelectedPageId} onChange={(event) => setFacebookSelectedPageId(event.target.value)}>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}{page.username ? ` · @${page.username}` : ""}</option>)}</SelectInput></div> : null}
                  <TextArea value={state.perNetworkCaption.facebook} onChange={(event) => patchCaption("facebook", event.target.value)} className="min-h-[120px]" placeholder="Texto específico para Facebook..." />
                  {state.facebookPublishType === "feed" ? (
                    <>
                      <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.linkUrl} onChange={(event) => patch({ linkUrl: event.target.value })} placeholder="Link do Facebook, opcional" /><TextInput type="datetime-local" value={state.scheduledAt} onChange={(event) => patch({ scheduledAt: event.target.value })} /></div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.facebookPlace} onChange={(event) => patch({ facebookPlace: event.target.value })} placeholder="Local opcional" /><TextInput value={state.facebookTags} onChange={(event) => patch({ facebookTags: event.target.value })} placeholder="Tags, separadas por vírgula" /></div>
                    </>
                  ) : state.facebookPublishType === "video" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput type="datetime-local" value={state.scheduledAt} onChange={(event) => patch({ scheduledAt: event.target.value })} /><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/45">Usa o vídeo selecionado no conteúdo base.</div></div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/45">Stories do Facebook usa a primeira imagem anexada.</div>
                  )}
                  <p className="mt-2 text-xs leading-5 text-white/42">Feed aceita texto, imagem, carrossel e link. Vídeo usa o arquivo de vídeo. Stories usa imagem.</p>
                  {state.scheduledAt && user?.has_facebook ? <div className="mt-3 rounded-2xl border border-blue-400/15 bg-blue-400/[0.06] p-3 text-xs leading-5 text-blue-100/75">Este post será agendado no Facebook para {dateLabel(state.scheduledAt)}.</div> : null}
                </div>

                <div className="rounded-3xl border border-[#0A66C2]/20 bg-[#0A66C2]/[0.055] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white"><Linkedin className="h-4 w-4 text-[#78B7FF]" /> LinkedIn</div>
                  <SegmentedControl<LinkedInPublishType>
                    value={state.linkedinPublishType}
                    onChange={(value) => patch({ linkedinPublishType: value })}
                    options={[
                      { value: "feed", label: "Feed", icon: <Linkedin className="h-3.5 w-3.5" /> },
                      { value: "article", label: "Artigo/link", icon: <FileText className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  <TextArea value={state.perNetworkCaption.linkedin} onChange={(event) => patchCaption("linkedin", event.target.value)} className="min-h-[120px]" placeholder="Texto específico para LinkedIn..." />
                  {state.linkedinPublishType === "article" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <TextInput value={state.linkedinArticleTitle} onChange={(event) => patch({ linkedinArticleTitle: event.target.value })} placeholder="Título do artigo/link" />
                      <TextInput value={state.linkedinArticleUrl} onChange={(event) => patch({ linkedinArticleUrl: event.target.value })} placeholder="URL do artigo/link" />
                      <div className="md:col-span-2"><TextArea value={state.linkedinArticleDescription} onChange={(event) => patch({ linkedinArticleDescription: event.target.value })} className="min-h-[90px]" placeholder="Resumo opcional do artigo/link" /></div>
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-white/42">Feed aceita imagens anexadas. Artigo/link usa título, URL e resumo.</p>
                </div>

                <div className="rounded-3xl border border-red-500/15 bg-red-500/[0.045] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white"><Youtube className="h-4 w-4 text-red-300" /> YouTube</div>
                  <SegmentedControl<YouTubePublishType>
                    value={state.youtubePublishType}
                    onChange={(value) => patch({ youtubePublishType: value })}
                    options={[
                      { value: "video", label: "Vídeo", icon: <Youtube className="h-3.5 w-3.5" /> },
                      { value: "shorts", label: "Shorts", icon: <Film className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.youtubeTitle} onChange={(event) => patch({ youtubeTitle: event.target.value })} placeholder="Título do vídeo" maxLength={100} /><SelectInput value={state.youtubePrivacyStatus} onChange={(event) => patch({ youtubePrivacyStatus: event.target.value as ComposerState["youtubePrivacyStatus"] })}><option value="private">Privado</option><option value="unlisted">Não listado</option><option value="public">Público</option></SelectInput></div>
                  <div className="mt-3"><TextArea value={state.youtubeDescription} onChange={(event) => patch({ youtubeDescription: event.target.value })} className="min-h-[120px]" placeholder="Descrição do vídeo. Se vazio, usa a legenda principal." /></div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.youtubeTags} onChange={(event) => patch({ youtubeTags: event.target.value })} placeholder="Tags separadas por vírgula" /><TextInput value={state.youtubeCategoryId} onChange={(event) => patch({ youtubeCategoryId: event.target.value })} placeholder="Categoria. Ex: 22" /></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-5 text-center transition hover:border-red-300/30"><Upload className="h-5 w-5 text-red-300" /><span className="text-sm font-medium text-white">Vídeo</span><span className="max-w-full truncate text-xs text-white/42">{videoFile?.name || "Selecionar arquivo"}</span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mpeg,.mpg,.3gp" className="hidden" onChange={(event) => handleVideoFileChange(event.target.files?.[0] || null)} /></label><label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-5 text-center transition hover:border-red-300/30"><ImageIcon className="h-5 w-5 text-red-300" /><span className="text-sm font-medium text-white">Thumbnail opcional</span><span className="max-w-full truncate text-xs text-white/42">{thumbnailFile?.name || "Selecionar imagem"}</span><input type="file" accept="image/*" className="hidden" onChange={(event) => setThumbnailFile(event.target.files?.[0] || null)} /></label></div>
                  <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70"><input type="checkbox" checked={state.youtubeMadeForKids} onChange={(event) => patch({ youtubeMadeForKids: event.target.checked })} className="h-4 w-4 accent-red-400" /> Este conteúdo é destinado para crianças</label>
                </div>
              </div>
            </div>
          </main>

          <aside className={cn("space-y-6 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100dvh-48px)] 2xl:overflow-y-auto 2xl:pr-2", darkScrollbarClass)}>
            <div className="social-publisher-panel rounded-[32px] border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div><h2 className="text-xl font-semibold text-white">Prévia por rede</h2><p className="mt-1 text-sm text-white/50">Visual aproximado antes de publicar.</p></div>
              </div>
              <div className="space-y-6">
                {state.selected.instagram ? <InstagramPreview state={state} mediaUrls={mediaPreviewUrls} videoUrl={videoPreviewUrl} displayName={instagramName} /> : null}
                {state.selected.facebook ? <FacebookPreview state={state} mediaUrls={mediaPreviewUrls} videoUrl={videoPreviewUrl} pageName={facebookPageName} /> : null}
                {state.selected.linkedin ? <LinkedInPreview state={state} mediaUrls={mediaPreviewUrls} /> : null}
                {state.selected.youtube ? <YouTubePreview state={state} videoUrl={videoPreviewUrl} thumbUrl={thumbnailPreviewUrl} /> : null}
                {selectedPlatforms.length === 0 ? <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-10 text-center text-white/45">Selecione uma rede para visualizar o post.</div> : null}
              </div>
            </div>

            <div className="social-publisher-panel rounded-[32px] border border-white/10 bg-white/[0.035] p-5">
              <h2 className="text-xl font-semibold text-white">Status e links</h2>
              <div className="mt-4 space-y-3">
                {(Object.keys(results) as PlatformKey[]).map((platform) => (
                  <div key={platform} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><PlatformIcon platform={platform} className="h-4 w-4 text-white/75" /></div>
                        <div className="min-w-0"><div className="text-sm font-semibold text-white">{platformLabels[platform]}</div><div className="line-clamp-1 text-xs text-white/40">{results[platform].message || (state.selected[platform] ? "Aguardando envio." : "Não selecionado.")}</div></div>
                      </div>
                      <StatusPill result={results[platform]} />
                    </div>
                    {results[platform].url ? (
                      <a
                        href={results[platform].url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-300/60 bg-[#0A66C2] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(10,102,194,0.28)] transition hover:border-sky-200 hover:bg-[#084f96] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111c]"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        <span>{results[platform].linkLabel || "Abrir publicação"}</span>
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {successfulLinks.length > 0 ? (
              <div className="social-publisher-panel rounded-[32px] border border-emerald-400/18 bg-emerald-400/[0.055] p-5">
                <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-100"><CheckCircle2 className="h-5 w-5" /> Publicações geradas</div>
                <div className="space-y-2">
                  {successfulLinks.map((platform) => (
                    <a
                      key={platform}
                      href={results[platform].url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-emerald-300/35 bg-emerald-500/14 px-4 py-3 text-sm font-semibold text-emerald-50 shadow-[0_10px_22px_rgba(16,185,129,0.14)] transition hover:border-emerald-200/60 hover:bg-emerald-500/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111c]"
                    >
                      <span className="flex items-center gap-2"><PlatformIcon platform={platform} className="h-4 w-4" /> {platformLabels[platform]}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/14 px-3 py-1.5 text-xs font-bold text-white">Acessar <ExternalLink className="h-3.5 w-3.5" /></span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="social-publisher-panel rounded-[30px] border border-amber-400/15 bg-amber-400/[0.055] p-5 text-sm leading-6 text-amber-100/78"><div className="mb-2 flex items-center gap-2 font-semibold text-amber-100"><AlertCircle className="h-4 w-4" /> Observação técnica</div>TikTok e Perfil de Empresa Google não entram no envio em massa porque aparecem como manutenção ou sem publicação ativa nesta versão do sistema. O menu já foi pensado para receber essas redes depois.</div>
          </aside>
        </section>
      </div>
    </div>
  );
}

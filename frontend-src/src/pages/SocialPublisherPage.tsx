import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Facebook,
  FileText,
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
import { linkedinService, type LinkedInPublishMode } from "@/services/linkedin";
import { youtubeService } from "@/services/youtube";

type PlatformKey = "instagram" | "facebook" | "linkedin" | "youtube";
type PublishStatus = "idle" | "publishing" | "success" | "error";

type ComposerState = {
  selected: Record<PlatformKey, boolean>;
  baseCaption: string;
  mediaUrlsText: string;
  linkUrl: string;
  scheduledAt: string;
  perNetworkCaption: Record<PlatformKey, string>;
  instagramFirstComment: string;
  instagramCollaborators: string;
  facebookPlace: string;
  facebookTags: string;
  linkedinMode: LinkedInPublishMode;
  linkedinArticleTitle: string;
  linkedinArticleUrl: string;
  linkedinArticleDescription: string;
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

const STORAGE_KEY = "bob:social-publisher:draft:v1";

const platformLabels: Record<PlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

const defaultState: ComposerState = {
  selected: { instagram: true, facebook: true, linkedin: true, youtube: false },
  baseCaption: "",
  mediaUrlsText: "",
  linkUrl: "",
  scheduledAt: "",
  perNetworkCaption: { instagram: "", facebook: "", linkedin: "", youtube: "" },
  instagramFirstComment: "",
  instagramCollaborators: "",
  facebookPlace: "",
  facebookTags: "",
  linkedinMode: "feed",
  linkedinArticleTitle: "",
  linkedinArticleUrl: "",
  linkedinArticleDescription: "",
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
      <p className="text-sm">Cole uma URL pública de imagem para visualizar.</p>
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

function InstagramPreview({ state, mediaUrls, displayName }: { state: ComposerState; mediaUrls: string[]; displayName: string }) {
  const caption = captionFor(state, "instagram");
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400 text-sm font-bold text-white">
            {displayName.replace("@", "").charAt(0).toUpperCase() || "I"}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{displayName}</div>
            <div className="text-[11px] text-zinc-400">Agora</div>
          </div>
        </div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-500">Feed</span><PreviewPlatformBadge platform="instagram" /></div>
      </div>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-zinc-900">
        {mediaUrls[0] ? <img src={mediaUrls[0]} alt="Preview Instagram" className="h-full w-full object-cover" /> : <ImagePlaceholder />}
        {mediaUrls.length > 1 ? <div className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">1/{mediaUrls.length}</div> : null}
      </div>
      <div className="space-y-3 px-4 py-3 text-white">
        <div className="flex items-center gap-4 text-zinc-200"><Instagram className="h-5 w-5" /><MessageSquareText className="h-5 w-5" /><Send className="h-5 w-5" /></div>
        <div className="min-h-[96px] whitespace-pre-wrap text-sm leading-6 text-zinc-100"><span className="mr-2 font-semibold">{displayName}</span>{caption || "Sua legenda aparecerá aqui."}</div>
      </div>
    </div>
  );
}

function FacebookPreview({ state, mediaUrls, pageName }: { state: ComposerState; mediaUrls: string[]; pageName: string }) {
  const caption = captionFor(state, "facebook");
  return (
    <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-lg font-bold text-white">{pageName.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">{pageName}</div>
            <div className="text-[11px] text-zinc-500">{dateLabel(state.scheduledAt)} · Público</div>
          </div>
        </div>
        <PreviewPlatformBadge platform="facebook" />
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="min-h-[82px] whitespace-pre-wrap text-[15px] leading-6 text-zinc-800">{caption || "Seu texto aparecerá aqui."}</div>
        {state.linkUrl.trim() ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"><div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500"><Link2 className="h-3.5 w-3.5" /> Link</div><div className="truncate">{state.linkUrl}</div></div> : null}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
          {mediaUrls.length > 0 ? <div className={cn("grid", mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>{mediaUrls.slice(0, 4).map((image, index) => <div key={`${image}-${index}`} className="aspect-square bg-zinc-200"><img src={image} alt={`Preview Facebook ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div> : <div className="flex aspect-[1.4/1] flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500"><ImageIcon className="h-10 w-10" /><p className="text-sm">Imagem ou carrossel opcional.</p></div>}
        </div>
      </div>
      <div className="flex items-center gap-5 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500"><span>Comentar</span><span>Compartilhar</span></div>
    </div>
  );
}

function LinkedInPreview({ state }: { state: ComposerState }) {
  const caption = captionFor(state, "linkedin");
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0f1b] text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-lg font-bold text-white">L</div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">Seu perfil no LinkedIn</div><div className="text-[11px] text-white/45">Agora · Visível para todos</div></div>
        </div>
        <PreviewPlatformBadge platform="linkedin" />
      </div>
      <div className="space-y-4 p-4">
        <div className="min-h-[120px] whitespace-pre-wrap text-sm leading-6 text-white/86">{caption || "Seu post aparecerá aqui."}</div>
        {state.linkedinMode === "article" ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/40"><FileText className="h-4 w-4" /> Artigo</div><div className="text-base font-semibold">{state.linkedinArticleTitle || "Título do artigo"}</div><div className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{state.linkedinArticleDescription || "Resumo do artigo."}</div><div className="mt-3 truncate text-xs text-[#78B7FF]">{state.linkedinArticleUrl || "https://seusite.com/artigo"}</div></div> : null}
      </div>
      <div className="flex items-center gap-5 border-t border-white/10 px-4 py-3 text-sm text-white/45"><span>Gostei</span><span>Comentar</span><span>Compartilhar</span></div>
    </div>
  );
}

function YouTubePreview({ state, videoUrl, thumbUrl }: { state: ComposerState; videoUrl?: string; thumbUrl?: string }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111114] text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">Prévia do vídeo</div>
          <div className="text-[11px] text-white/45">Canal do YouTube</div>
        </div>
        <PreviewPlatformBadge platform="youtube" />
      </div>
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-black">{videoUrl ? <video src={videoUrl} controls className="h-full w-full bg-black" /> : thumbUrl ? <img src={thumbUrl} alt="Thumbnail YouTube" className="h-full w-full object-cover" /> : <VideoPlaceholder />}</div>
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
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = React.useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = React.useState<string>();
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = React.useState<string>();

  React.useEffect(() => saveDraft(state), [state]);

  React.useEffect(() => {
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

  const mediaUrls = React.useMemo(() => parseItems(state.mediaUrlsText), [state.mediaUrlsText]);
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
      if (!text) return "Informe uma legenda para o Instagram.";
      if (!mediaUrls.length) return "O Instagram precisa de pelo menos uma URL pública de imagem.";
      if (mediaUrls.some((url) => !isHttpUrl(url))) return "As imagens do Instagram precisam começar com http:// ou https://.";
    }
    if (platform === "facebook") {
      if (!text && !state.linkUrl.trim() && !mediaUrls.length) return "Informe texto, link ou imagem para o Facebook.";
      if (state.linkUrl.trim() && !isHttpUrl(state.linkUrl)) return "O link do Facebook precisa começar com http:// ou https://.";
      if (mediaUrls.some((url) => !isHttpUrl(url))) return "As imagens do Facebook precisam começar com http:// ou https://.";
      if (state.scheduledAt && new Date(state.scheduledAt).getTime() <= Date.now() + 10 * 60 * 1000) return "O agendamento do Facebook precisa estar no futuro.";
    }
    if (platform === "linkedin") {
      if (!text && state.linkedinMode === "feed") return "Informe o texto do post para o LinkedIn.";
      if (state.linkedinMode === "article" && (!state.linkedinArticleTitle.trim() || !isHttpUrl(state.linkedinArticleUrl))) return "Informe título e URL válida para o artigo do LinkedIn.";
    }
    if (platform === "youtube") {
      if (!videoFile) return "Selecione o arquivo de vídeo para o YouTube.";
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
        const response = await instagramService.publish({
          caption: captionFor(state, "instagram"),
          image_url: mediaUrls.length <= 1 ? mediaUrls[0] : undefined,
          carousel_images: mediaUrls.length > 1 ? mediaUrls : [],
          collaborators: parseItems(state.instagramCollaborators).map((item) => item.replace(/^@/, "")),
          first_comment: state.instagramFirstComment.trim() || undefined,
          share_to_feed: true,
        });
        const profileUrl = instagramProfileUrl(response.instagram_username || user?.instagram_username);
        setPlatformResult(platform, {
          status: "success",
          message: response.warning ? "Publicado no Instagram. Houve aviso no primeiro comentário." : "Publicado no Instagram.",
          url: response.permalink_url || profileUrl,
          linkLabel: response.permalink_url ? "Abrir post" : "Abrir perfil",
        });
      }
      if (platform === "facebook") {
        if (facebookSelectedPageId) await facebookService.selectPage(facebookSelectedPageId);
        const scheduled_publish_time = state.scheduledAt ? Math.floor(new Date(state.scheduledAt).getTime() / 1000) : undefined;
        const response = await facebookService.publish({
          message: captionFor(state, "facebook"),
          link: state.linkUrl.trim() || undefined,
          image_url: mediaUrls.length <= 1 ? mediaUrls[0] : undefined,
          carousel_images: mediaUrls.length > 1 ? mediaUrls : [],
          published: !scheduled_publish_time,
          scheduled_publish_time,
          place: state.facebookPlace.trim() || undefined,
          tags: parseItems(state.facebookTags),
        });
        setPlatformResult(platform, {
          status: "success",
          message: scheduled_publish_time ? "Agendado no Facebook." : "Publicado no Facebook.",
          url: response.permalink_url || facebookFallbackUrl(response.post_id),
          linkLabel: scheduled_publish_time ? "Abrir agendamento" : "Abrir post",
        });
      }
      if (platform === "linkedin") {
        const response = await linkedinService.publish(state.linkedinMode === "article" ? {
          mode: "article",
          text: captionFor(state, "linkedin"),
          article: { title: state.linkedinArticleTitle.trim(), url: state.linkedinArticleUrl.trim(), description: state.linkedinArticleDescription.trim() || undefined },
        } : { mode: "feed", text: captionFor(state, "linkedin") });
        setPlatformResult(platform, {
          status: "success",
          message: state.linkedinMode === "article" ? "Artigo publicado no LinkedIn." : "Post publicado no LinkedIn.",
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
          message: response.thumbnail_warning ? "Vídeo enviado. A thumbnail não foi aplicada." : "Vídeo publicado no YouTube.",
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
    setVideoFile(null);
    setThumbnailFile(null);
    resetResults();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    toastSuccess("Rascunho limpo.");
  }

  const platformCards: PlatformCard[] = [
    { key: "instagram", description: "Feed com imagem ou carrossel por URL pública.", handle: user?.instagram_username ? `@${user.instagram_username}` : "Não conectado", iconClass: "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400", activeClass: "border-pink-300/35 bg-pink-400/[0.09]", glowClass: "bg-pink-400/25" },
    { key: "facebook", description: "Página, link, imagem/carrossel e agendamento.", handle: user?.facebook_page_name || user?.facebook_page_username || "Não conectado", iconClass: "bg-[#1877F2]", activeClass: "border-blue-300/35 bg-blue-400/[0.09]", glowClass: "bg-blue-400/25" },
    { key: "linkedin", description: "Post de feed ou artigo com link estruturado.", handle: connected.linkedin ? "Conta vinculada" : "Não conectado", iconClass: "bg-[#0A66C2]", activeClass: "border-[#78B7FF]/35 bg-[#0A66C2]/[0.12]", glowClass: "bg-[#0A66C2]/30" },
    { key: "youtube", description: "Upload de vídeo, descrição, tags e thumbnail.", handle: user?.youtube_channel_title || user?.youtube_channel_handle || "Não conectado", iconClass: "bg-[#FF0000]", activeClass: "border-red-300/35 bg-red-400/[0.09]", glowClass: "bg-red-400/25" },
  ];

  const facebookPageName = React.useMemo(() => facebookPages.find((page) => page.id === facebookSelectedPageId)?.name || user?.facebook_page_name || "Sua página", [facebookPages, facebookSelectedPageId, user?.facebook_page_name]);
  const instagramName = user?.instagram_username ? `@${user.instagram_username}` : "@seuinstagram";

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,200,232,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_30%),linear-gradient(180deg,#040812_0%,#070B14_48%,#05070D_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40" />

      <div className="fixed left-4 top-4 z-50 sm:left-6 sm:top-6">
        <Button variant="outline" onClick={handleBack} className="border-white/15 bg-black/30 text-white backdrop-blur hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1780px] flex-col gap-6 px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.30)] md:p-8">
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

        <section className="grid gap-6 2xl:grid-cols-[430px_minmax(0,1fr)_500px]">
          <aside className="space-y-6 2xl:sticky 2xl:top-6 2xl:self-start">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
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

            <div className="rounded-[30px] border border-white/10 bg-[#08111c]/92 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
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
            <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-6">
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
                  <Field label="URLs de imagem ou carrossel" icon={<ImageIcon className="h-4 w-4 text-cyan-300" />} hint="Instagram e Facebook usam URLs públicas. Com 2 ou mais URLs, o sistema trata como carrossel.">
                    <TextArea value={state.mediaUrlsText} onChange={(event) => patch({ mediaUrlsText: event.target.value })} className="min-h-[128px]" placeholder={`Uma URL pública por linha\nhttps://site.com/imagem-1.jpg\nhttps://site.com/imagem-2.jpg`} />
                  </Field>
                  <Field label="Link opcional" icon={<Link2 className="h-4 w-4 text-cyan-300" />}>
                    <TextInput value={state.linkUrl} onChange={(event) => patch({ linkUrl: event.target.value })} placeholder="https://seusite.com" />
                  </Field>
                  <Field label="Data de agendamento" icon={<CalendarClock className="h-4 w-4 text-cyan-300" />} hint="No backend atual, agendamento automático apenas para Facebook. As demais redes publicam agora.">
                    <TextInput type="datetime-local" value={state.scheduledAt} onChange={(event) => patch({ scheduledAt: event.target.value })} />
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
                  <TextArea value={state.perNetworkCaption.instagram} onChange={(event) => patchCaption("instagram", event.target.value)} className="min-h-[120px]" placeholder="Legenda específica para Instagram..." />
                  <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.instagramFirstComment} onChange={(event) => patch({ instagramFirstComment: event.target.value })} placeholder="Primeiro comentário" /><TextInput value={state.instagramCollaborators} onChange={(event) => patch({ instagramCollaborators: event.target.value })} placeholder="Colaboradores: usuario1, usuario2" /></div>
                </div>

                <div className="rounded-3xl border border-blue-500/15 bg-blue-500/[0.045] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold text-white"><Facebook className="h-4 w-4 text-blue-300" /> Facebook</div>{user?.has_facebook ? <button type="button" onClick={() => void loadFacebookPages()} className="inline-flex items-center gap-1 text-xs text-blue-200 hover:text-blue-100"><RefreshCw className={cn("h-3.5 w-3.5", isLoadingFacebookPages ? "animate-spin" : "")} /> Atualizar páginas</button> : null}</div>
                  {facebookPages.length > 0 ? <div className="mb-3"><SelectInput value={facebookSelectedPageId} onChange={(event) => setFacebookSelectedPageId(event.target.value)}>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}{page.username ? ` · @${page.username}` : ""}</option>)}</SelectInput></div> : null}
                  <TextArea value={state.perNetworkCaption.facebook} onChange={(event) => patchCaption("facebook", event.target.value)} className="min-h-[120px]" placeholder="Texto específico para Facebook..." />
                  <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.facebookPlace} onChange={(event) => patch({ facebookPlace: event.target.value })} placeholder="Local opcional" /><TextInput value={state.facebookTags} onChange={(event) => patch({ facebookTags: event.target.value })} placeholder="Tags, separadas por vírgula" /></div>
                  {state.scheduledAt && user?.has_facebook ? <div className="mt-3 rounded-2xl border border-blue-400/15 bg-blue-400/[0.06] p-3 text-xs leading-5 text-blue-100/75">Este post será agendado no Facebook para {dateLabel(state.scheduledAt)}.</div> : null}
                </div>

                <div className="rounded-3xl border border-[#0A66C2]/20 bg-[#0A66C2]/[0.055] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white"><Linkedin className="h-4 w-4 text-[#78B7FF]" /> LinkedIn</div>
                  <div className="mb-3 grid gap-3 md:grid-cols-2"><SelectInput value={state.linkedinMode} onChange={(event) => patch({ linkedinMode: event.target.value as LinkedInPublishMode })}><option value="feed">Post no feed</option><option value="article">Artigo com link</option></SelectInput><TextInput value={state.linkedinArticleUrl} onChange={(event) => patch({ linkedinArticleUrl: event.target.value })} placeholder="URL do artigo, se usar artigo" /></div>
                  <TextArea value={state.perNetworkCaption.linkedin} onChange={(event) => patchCaption("linkedin", event.target.value)} className="min-h-[120px]" placeholder="Texto específico para LinkedIn..." />
                  {state.linkedinMode === "article" ? <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.linkedinArticleTitle} onChange={(event) => patch({ linkedinArticleTitle: event.target.value })} placeholder="Título do artigo" /><TextInput value={state.linkedinArticleDescription} onChange={(event) => patch({ linkedinArticleDescription: event.target.value })} placeholder="Descrição do artigo" /></div> : null}
                </div>

                <div className="rounded-3xl border border-red-500/15 bg-red-500/[0.045] p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-white"><Youtube className="h-4 w-4 text-red-300" /> YouTube</div>
                  <div className="grid gap-3 md:grid-cols-2"><TextInput value={state.youtubeTitle} onChange={(event) => patch({ youtubeTitle: event.target.value })} placeholder="Título do vídeo" maxLength={100} /><SelectInput value={state.youtubePrivacyStatus} onChange={(event) => patch({ youtubePrivacyStatus: event.target.value as ComposerState["youtubePrivacyStatus"] })}><option value="private">Privado</option><option value="unlisted">Não listado</option><option value="public">Público</option></SelectInput></div>
                  <div className="mt-3"><TextArea value={state.youtubeDescription} onChange={(event) => patch({ youtubeDescription: event.target.value })} className="min-h-[120px]" placeholder="Descrição do vídeo. Se vazio, usa a legenda principal." /></div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2"><TextInput value={state.youtubeTags} onChange={(event) => patch({ youtubeTags: event.target.value })} placeholder="Tags separadas por vírgula" /><TextInput value={state.youtubeCategoryId} onChange={(event) => patch({ youtubeCategoryId: event.target.value })} placeholder="Categoria. Ex: 22" /></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-5 text-center transition hover:border-red-300/30"><Upload className="h-5 w-5 text-red-300" /><span className="text-sm font-medium text-white">Vídeo</span><span className="max-w-full truncate text-xs text-white/42">{videoFile?.name || "Selecionar arquivo"}</span><input type="file" accept="video/*" className="hidden" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} /></label><label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-5 text-center transition hover:border-red-300/30"><ImageIcon className="h-5 w-5 text-red-300" /><span className="text-sm font-medium text-white">Thumbnail opcional</span><span className="max-w-full truncate text-xs text-white/42">{thumbnailFile?.name || "Selecionar imagem"}</span><input type="file" accept="image/*" className="hidden" onChange={(event) => setThumbnailFile(event.target.files?.[0] || null)} /></label></div>
                  <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70"><input type="checkbox" checked={state.youtubeMadeForKids} onChange={(event) => patch({ youtubeMadeForKids: event.target.checked })} className="h-4 w-4 accent-red-400" /> Este conteúdo é destinado para crianças</label>
                </div>
              </div>
            </div>
          </main>

          <aside className={cn("space-y-6 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100dvh-48px)] 2xl:overflow-y-auto 2xl:pr-2", darkScrollbarClass)}>
            <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div><h2 className="text-xl font-semibold text-white">Prévia por rede</h2><p className="mt-1 text-sm text-white/50">Visual aproximado antes de publicar.</p></div>
              </div>
              <div className="space-y-6">
                {state.selected.instagram ? <InstagramPreview state={state} mediaUrls={mediaUrls} displayName={instagramName} /> : null}
                {state.selected.facebook ? <FacebookPreview state={state} mediaUrls={mediaUrls} pageName={facebookPageName} /> : null}
                {state.selected.linkedin ? <LinkedInPreview state={state} /> : null}
                {state.selected.youtube ? <YouTubePreview state={state} videoUrl={videoPreviewUrl} thumbUrl={thumbnailPreviewUrl} /> : null}
                {selectedPlatforms.length === 0 ? <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-10 text-center text-white/45">Selecione uma rede para visualizar o post.</div> : null}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-5">
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
                    {results[platform].url ? <a href={results[platform].url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/16"><ExternalLink className="h-3.5 w-3.5" /> {results[platform].linkLabel || "Abrir publicação"}</a> : null}
                  </div>
                ))}
              </div>
            </div>

            {successfulLinks.length > 0 ? (
              <div className="rounded-[32px] border border-emerald-400/18 bg-emerald-400/[0.055] p-5">
                <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-100"><CheckCircle2 className="h-5 w-5" /> Publicações geradas</div>
                <div className="space-y-2">
                  {successfulLinks.map((platform) => (
                    <a key={platform} href={results[platform].url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/14 bg-black/18 px-4 py-3 text-sm text-emerald-50 transition hover:bg-emerald-400/10">
                      <span className="flex items-center gap-2"><PlatformIcon platform={platform} className="h-4 w-4" /> {platformLabels[platform]}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-200">Acessar <ExternalLink className="h-3.5 w-3.5" /></span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[30px] border border-amber-400/15 bg-amber-400/[0.055] p-5 text-sm leading-6 text-amber-100/78"><div className="mb-2 flex items-center gap-2 font-semibold text-amber-100"><AlertCircle className="h-4 w-4" /> Observação técnica</div>TikTok e Perfil de Empresa Google não entram no envio em massa porque aparecem como manutenção ou sem publicação ativa nesta versão do sistema. O menu já foi pensado para receber essas redes depois.</div>
          </aside>
        </section>
      </div>
    </div>
  );
}

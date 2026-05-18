import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Camera,
  Coins,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  Youtube,
} from "lucide-react";
import { useAuthStore } from "@/state/authStore";
import { linkedinService } from "@/services/linkedin";
import { instagramService } from "@/services/instagram";
import { facebookService } from "@/services/facebook";
import { youtubeService } from "@/services/youtube";
import { authService } from "@/services/auth";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CREDIT_ACTIONS,
  CREDIT_PLANS,
  DEFAULT_CREDIT_CATALOG,
  DEFAULT_DAILY_FREE_CREDITS,
  formatCredits,
  type CreditCatalogResponse,
} from "@/lib/credits";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

type IntegrationStatus = "connected" | "available" | "maintenance";

type IntegrationCardProps = {
  title: string;
  description: string;
  status: IntegrationStatus;
  accountLabel?: string | null;
  accentClassName: string;
  iconWrapClassName: string;
  icon: React.ReactNode;
  action: React.ReactNode;
};

function IntegrationCard({
  title,
  description,
  status,
  accountLabel,
  accentClassName,
  iconWrapClassName,
  icon,
  action,
}: IntegrationCardProps) {
  const statusLabel =
    status === "connected"
      ? "Conectado"
      : status === "maintenance"
        ? "Em manutenção"
        : "Disponível";

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.045] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_38%)] opacity-70" />

      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-white/90 transition-transform duration-300 group-hover:scale-[1.03]",
            iconWrapClassName,
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.22em]",
                status === "connected"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : status === "maintenance"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                    : "border-white/10 bg-white/5 text-white/55",
              )}
            >
              {statusLabel}
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-white/62">{description}</p>
        </div>
      </div>

      <div className="relative mt-auto pt-5">
        <div className="account-summary-box min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-white/38">
            <span>Conta</span>
            <span
              className={cn(
                "max-w-[70%] truncate text-right text-[12px] normal-case tracking-normal",
                accentClassName,
              )}
            >
              {accountLabel || "Nenhuma conta vinculada"}
            </span>
          </div>

          <div className="mt-4">{action}</div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  disabled,
  variant = "connect",
  className,
  icon,
  children,
}: {
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "connect" | "disconnect";
  className?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isDisconnect = variant === "disconnect";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        isDisconnect
          ? "border border-white/10 bg-white/[0.04] text-white/78 hover:bg-white/[0.08]"
          : className || "border border-white/12 bg-white text-slate-950 hover:scale-[1.01] hover:bg-white/92",
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isDisconnect ? (
        <Unplug className="h-4 w-4" />
      ) : icon ? (
        icon
      ) : (
        <ArrowUpRight className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

type ConnectedIntegrationItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  className: string;
};

function ConnectedAppsStrip({
  items,
  compact = false,
}: {
  items: ConnectedIntegrationItem[];
  compact?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
        Nenhuma integração conectada ainda.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          title={item.label}
          className={cn(
            compact
              ? "inline-flex h-10 w-10 items-center justify-center rounded-full border"
              : "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium",
            item.className,
          )}
        >
          <span className="shrink-0">{item.icon}</span>
          {compact ? null : <span className="truncate">{item.label}</span>}
        </div>
      ))}
    </div>
  );
}


function getCreditItemKind(item: { kind?: string } | Record<string, unknown> | null | undefined): string {
  return typeof (item as { kind?: string } | null | undefined)?.kind === "string"
    ? String((item as { kind?: string }).kind)
    : "plan";
}

function getPlanHighlights(planId: string, title: string): string[] {
  const normalized = `${planId} ${title}`.toLowerCase();

  if (normalized.includes("basico") || normalized.includes("basic")) {
    return [
      "Para começar e testar o sistema com uso leve.",
      "Bom para poucos pedidos por semana e rotina individual.",
    ];
  }

  if (normalized.includes("profissional") || normalized.includes("growth")) {
    return [
      "Para quem usa o sistema com frequência e quer um volume equilibrado.",
      "Bom para autoridade, SkyBob e algumas imagens no mês.",
    ];
  }

  if (normalized.includes("avancado") || normalized.includes("scale")) {
    return [
      "Para produção recorrente com mais conteúdo, análises e imagem.",
      "Entrega melhor custo para quem usa o sistema de forma intensa.",
    ];
  }

  if (normalized.includes("equipe") || normalized.includes("elite")) {
    return [
      "Para times ou operação pesada com alto volume de pedidos.",
      "Indicado para escalar sem depender de recargas frequentes.",
    ];
  }

  return [
    "Opção indicada para complementar o uso da conta.",
    "Ideal para manter saldo disponível sem parar a operação.",
  ];
}

function getPackHighlights(planId: string, title: string): string[] {
  const normalized = `${planId} ${title}`.toLowerCase();

  if (normalized.includes("10")) {
    return [
      "Recarga rápida para poucos pedidos extras.",
      "Boa para completar o saldo sem trocar de plano.",
    ];
  }

  if (normalized.includes("30")) {
    return [
      "Recarga intermediária para continuar operando com folga.",
      "Boa para complementar o mês sem alterar o plano principal.",
    ];
  }

  if (normalized.includes("75")) {
    return [
      "Recarga robusta para estudos, autoridade e imagem.",
      "Útil para períodos com demanda mais alta.",
    ];
  }

  if (normalized.includes("150")) {
    return [
      "Maior recarga avulsa disponível no momento.",
      "Ideal para operação forte sem mudar o plano principal.",
    ];
  }

  return [
    "Recarga avulsa para aumentar o saldo da conta.",
    "Use quando quiser complementar os créditos sem mudar o plano mensal.",
  ];
}

function formatEstimatedCost(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}


export default function AccountPage() {
  const { user, updateUser, updateCredits } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profileName, setProfileName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [isRemovingProfileImage, setIsRemovingProfileImage] = useState(false);

  const [isLinking, setIsLinking] = useState(false);
  const [isDisconnectingInstagram, setIsDisconnectingInstagram] = useState(false);
  const [isDisconnectingFacebook, setIsDisconnectingFacebook] = useState(false);
  const [isLinkingFacebook, setIsLinkingFacebook] = useState(false);
  const [isLinkingYouTube, setIsLinkingYouTube] = useState(false);
  const [isDisconnectingYouTube, setIsDisconnectingYouTube] = useState(false);
  const [accountView, setAccountView] = useState<"account" | "credits">("account");
  const [selectedCreditCategory, setSelectedCreditCategory] = useState<string>("");
  const [isLoadingCreditCatalog, setIsLoadingCreditCatalog] = useState(false);
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);
  const [creditCatalog, setCreditCatalog] = useState<CreditCatalogResponse>({
    ...DEFAULT_CREDIT_CATALOG,
    current_credits: user?.credits ?? DEFAULT_CREDIT_CATALOG.current_credits,
  });

  useEffect(() => {
    setCreditCatalog((current) => ({
      ...current,
      current_credits: user?.credits ?? current.current_credits,
    }));
  }, [user?.credits]);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  useEffect(() => {
    if (accountView !== "credits") return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".account-credits-fullscreen")?.scrollTo({ top: 0, left: 0 });
    });

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [accountView]);

  useEffect(() => {
    let cancelled = false;

    async function loadCreditCatalog() {
      try {
        setIsLoadingCreditCatalog(true);
        const catalog = await authService.getCreditsCatalog();
        if (cancelled) return;
        updateCredits(catalog.current_credits);
        setCreditCatalog({
          ...catalog,
          current_credits: catalog.current_credits,
          plans: catalog.plans?.length ? catalog.plans : CREDIT_PLANS,
          actions: catalog.actions?.length ? catalog.actions : CREDIT_ACTIONS,
        });
      } catch {
        if (cancelled) return;
        setCreditCatalog((current) => ({
          ...current,
          current_credits: user?.credits ?? current.current_credits,
          plans: current.plans?.length ? current.plans : CREDIT_PLANS,
          actions: current.actions?.length ? current.actions : CREDIT_ACTIONS,
        }));
      } finally {
        if (!cancelled) {
          setIsLoadingCreditCatalog(false);
        }
      }
    }

    void loadCreditCatalog();

    return () => {
      cancelled = true;
    };
  }, [updateCredits, user?.credits]);

  if (!user) return <div className="p-8">Não autenticado.</div>;

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = profileName.trim();

    if (!normalizedName) {
      toastApiError(new Error("Informe um nome válido."), "Erro ao salvar perfil");
      return;
    }

    if (normalizedName === (user.name ?? "").trim()) {
      toastSuccess("Nenhuma alteração pendente no perfil.");
      return;
    }

    try {
      setIsSavingProfile(true);
      const result = await authService.updateProfile(normalizedName);
      updateUser({
        name: result.full_name ?? normalizedName,
        profile_image_url: result.profile_image_url ?? null,
      });
      toastSuccess("Dados da conta atualizados com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao salvar perfil");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOpenProfileImagePicker = () => {
    if (isUploadingProfileImage) return;
    fileInputRef.current?.click();
  };

  const handleProfileImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) return;
    if (!selectedFile.type.startsWith("image/")) {
      toastApiError(new Error("Envie um arquivo de imagem válido."), "Erro ao atualizar foto");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toastApiError(new Error("A imagem deve ter no máximo 5 MB."), "Erro ao atualizar foto");
      return;
    }

    try {
      setIsUploadingProfileImage(true);
      const result = await authService.uploadProfileImage(selectedFile);
      updateUser({
        name: result.full_name ?? user.name,
        profile_image_url: result.profile_image_url ?? null,
      });
      toastSuccess("Foto de perfil atualizada com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao atualizar foto");
    } finally {
      setIsUploadingProfileImage(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    if (!user.profile_image_url || isRemovingProfileImage) return;

    try {
      setIsRemovingProfileImage(true);
      const result = await authService.removeProfileImage();
      updateUser({
        name: result.full_name ?? user.name,
        profile_image_url: result.profile_image_url ?? null,
      });
      toastSuccess("Foto de perfil removida com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao remover foto");
    } finally {
      setIsRemovingProfileImage(false);
    }
  };

  const handleConnectLinkedIn = async () => {
    try {
      setIsLinking(true);
      localStorage.setItem("linkedin_redirect", "/conta");
      const res = await linkedinService.getAuthUrl();
      window.location.href = res.url;
    } catch (error) {
      toastApiError(error, "Erro ao gerar a URL do LinkedIn");
      setIsLinking(false);
    }
  };

  const handleConnectInstagram = async () => {
    instagramService.startAuth("/conta");
  };

  const handleDisconnectInstagram = async () => {
    if (isDisconnectingInstagram) return;
    setIsDisconnectingInstagram(true);
    try {
      await instagramService.disconnect();
      updateUser({ has_instagram: false, instagram_username: null });
      toastSuccess("Instagram desconectado com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao desconectar Instagram");
    } finally {
      setIsDisconnectingInstagram(false);
    }
  };

  const handleConnectFacebook = async () => {
    if (isLinkingFacebook) return;
    try {
      setIsLinkingFacebook(true);
      facebookService.startAuth("/conta");
    } catch (error) {
      toastApiError(error, "Erro ao iniciar conexão com Facebook");
      setIsLinkingFacebook(false);
    }
  };

  const handleDisconnectFacebook = async () => {
    if (isDisconnectingFacebook) return;
    setIsDisconnectingFacebook(true);
    try {
      await facebookService.disconnect();
      updateUser({ has_facebook: false, facebook_page_name: null, facebook_page_username: null });
      toastSuccess("Facebook desconectado com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao desconectar Facebook");
    } finally {
      setIsDisconnectingFacebook(false);
    }
  };

  const handleConnectYouTube = async () => {
    if (isLinkingYouTube) return;
    try {
      setIsLinkingYouTube(true);
      const state = `youtube::/conta::${Date.now()}`;
      localStorage.setItem("youtube_oauth_state", state);
      localStorage.setItem("youtube_redirect", "/conta");
      const res = await youtubeService.getAuthUrl(state);
      window.location.href = res.url;
    } catch (error) {
      toastApiError(error, "Erro ao iniciar conexão com YouTube");
      setIsLinkingYouTube(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    if (isDisconnectingYouTube) return;
    setIsDisconnectingYouTube(true);
    try {
      await youtubeService.disconnect();
      updateUser({ has_youtube: false, youtube_channel_title: null, youtube_channel_handle: null });
      toastSuccess("YouTube desconectado com sucesso.");
    } catch (error) {
      toastApiError(error, "Erro ao desconectar YouTube");
    } finally {
      setIsDisconnectingYouTube(false);
    }
  };

  const connectedIntegrations = useMemo<ConnectedIntegrationItem[]>(() => {
    const items: ConnectedIntegrationItem[] = [];

    if (user.has_linkedin) {
      items.push({
        id: "linkedin",
        label: "LinkedIn",
        icon: <Linkedin className="h-4 w-4 text-[#78B7FF]" />,
        className: "border-[#0A66C2]/25 bg-[#0A66C2]/12 text-[#78B7FF]",
      });
    }

    if (user.has_instagram) {
      items.push({
        id: "instagram",
        label: "Instagram",
        icon: <Instagram className="h-4 w-4 text-pink-300" />,
        className: "border-pink-500/20 bg-pink-500/10 text-pink-200",
      });
    }

    if (user.has_facebook) {
      items.push({
        id: "facebook",
        label: "Facebook",
        icon: <Facebook className="h-4 w-4 text-[#8DC0FF]" />,
        className: "border-[#1877F2]/20 bg-[#1877F2]/10 text-[#B7D4FF]",
      });
    }

    if (user.has_youtube) {
      items.push({
        id: "youtube",
        label: "YouTube",
        icon: <Youtube className="h-4 w-4 text-red-300" />,
        className: "border-red-500/20 bg-red-500/10 text-red-200",
      });
    }

    if (user.has_tiktok) {
      items.push({
        id: "tiktok",
        label: "TikTok",
        icon: <Sparkles className="h-4 w-4 text-white/90" />,
        className: "border-white/12 bg-white/[0.05] text-white/85",
      });
    }

    if (user.has_google_business_profile) {
      items.push({
        id: "google-business",
        label: "Google Business",
        icon: <Building2 className="h-4 w-4 text-cyan-300" />,
        className: "border-cyan-500/20 bg-cyan-500/10 text-cyan-200",
      });
    }

    return items;
  }, [
    user.has_linkedin,
    user.has_instagram,
    user.has_facebook,
    user.has_youtube,
    user.has_tiktok,
    user.has_google_business_profile,
  ]);

  const integrations = [
    {
      id: "linkedin",
      title: "LinkedIn",
      description: "Conecte seu perfil para fortalecer sua presença profissional e o fluxo de publicação.",
      status: user.has_linkedin ? ("connected" as const) : ("available" as const),
      accountLabel: user.has_linkedin ? "Conta vinculada" : null,
      accentClassName: user.has_linkedin ? "text-[#78B7FF]" : "text-white/55",
      iconWrapClassName: "border-[#0A66C2]/25 bg-[#0A66C2]/12",
      icon: <Linkedin className="h-5 w-5 text-[#78B7FF]" />,
      action: user.has_linkedin ? (
        <div className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/62">
          LinkedIn já conectado
        </div>
      ) : (
        <ActionButton
          onClick={handleConnectLinkedIn}
          loading={isLinking}
          disabled={isLinking}
          className="border-none bg-[#0A66C2] text-white shadow-md hover:scale-[1.01] hover:bg-[#004182]"
          icon={<Linkedin className="h-4 w-4" />}
        >
          Vincular LinkedIn
        </ActionButton>
      ),
    },
    {
      id: "instagram",
      title: "Instagram",
      description: "Mantenha seu perfil conectado para publicar com mais agilidade e consistência.",
      status: user.has_instagram ? ("connected" as const) : ("available" as const),
      accountLabel: user.instagram_username ? `@${user.instagram_username}` : user.has_instagram ? "Conta vinculada" : null,
      accentClassName: user.has_instagram ? "text-pink-300" : "text-white/55",
      iconWrapClassName: "border-pink-500/20 bg-pink-500/10",
      icon: <Instagram className="h-5 w-5 text-pink-300" />,
      action: user.has_instagram ? (
        <ActionButton
          onClick={handleDisconnectInstagram}
          loading={isDisconnectingInstagram}
          disabled={isDisconnectingInstagram}
          variant="disconnect"
        >
          Desconectar Instagram
        </ActionButton>
      ) : (
        <ActionButton
          onClick={handleConnectInstagram}
          className="border-none bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white shadow-md transition-all duration-200 hover:scale-[1.01] hover:opacity-95"
          icon={<Instagram className="h-4 w-4" />}
        >
          Vincular Instagram
        </ActionButton>
      ),
    },
    {
      id: "facebook",
      title: "Facebook",
      description: "Conecte sua página para centralizar publicações e manter tudo no mesmo padrão.",
      status: user.has_facebook ? ("connected" as const) : ("available" as const),
      accountLabel:
        user.facebook_page_name ||
        (user.facebook_page_username ? `@${user.facebook_page_username}` : user.has_facebook ? "Conta vinculada" : null),
      accentClassName: user.has_facebook ? "text-[#8DC0FF]" : "text-white/55",
      iconWrapClassName: "border-[#1877F2]/20 bg-[#1877F2]/10",
      icon: <Facebook className="h-5 w-5 text-[#8DC0FF]" />,
      action: user.has_facebook ? (
        <ActionButton
          onClick={handleDisconnectFacebook}
          loading={isDisconnectingFacebook}
          disabled={isDisconnectingFacebook}
          variant="disconnect"
        >
          Desconectar Facebook
        </ActionButton>
      ) : (
        <ActionButton
          onClick={handleConnectFacebook}
          loading={isLinkingFacebook}
          disabled={isLinkingFacebook}
          className="border-none bg-[#1877F2] text-white shadow-md hover:scale-[1.01] hover:bg-[#0C5DC7]"
          icon={<Facebook className="h-4 w-4" />}
        >
          Vincular Facebook
        </ActionButton>
      ),
    },
    {
      id: "youtube",
      title: "YouTube",
      description: "Deixe seu canal pronto para fluxos de vídeo, publicação e distribuição.",
      status: user.has_youtube ? ("connected" as const) : ("available" as const),
      accountLabel: user.youtube_channel_title || user.youtube_channel_handle || (user.has_youtube ? "Conta vinculada" : null),
      accentClassName: user.has_youtube ? "text-red-300" : "text-white/55",
      iconWrapClassName: "border-red-500/20 bg-red-500/10",
      icon: <Youtube className="h-5 w-5 text-red-300" />,
      action: user.has_youtube ? (
        <ActionButton
          onClick={handleDisconnectYouTube}
          loading={isDisconnectingYouTube}
          disabled={isDisconnectingYouTube}
          variant="disconnect"
        >
          Desconectar YouTube
        </ActionButton>
      ) : (
        <ActionButton
          onClick={handleConnectYouTube}
          loading={isLinkingYouTube}
          disabled={isLinkingYouTube}
          className="border-none bg-[#FF0000] text-white shadow-md hover:scale-[1.01] hover:bg-[#CC0000]"
          icon={<Youtube className="h-4 w-4" />}
        >
          Vincular YouTube
        </ActionButton>
      ),
    },
    {
      id: "tiktok",
      title: "TikTok",
      description: "Integração pausada para manutenção. O botão permanece bloqueado até a liberação do fluxo.",
      status: "maintenance" as const,
      accountLabel: user.tiktok_display_name || (user.tiktok_username ? `@${user.tiktok_username}` : user.has_tiktok ? "Conta vinculada" : null),
      accentClassName: user.has_tiktok ? "text-white/85" : "text-white/55",
      iconWrapClassName: "border-white/12 bg-white/[0.04]",
      icon: <Sparkles className="h-5 w-5 text-white/90" />,
      action: (
        <ActionButton
          disabled
          className="border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.04]"
          icon={<Sparkles className="h-4 w-4" />}
        >
          Em manutenção
        </ActionButton>
      ),
    },
    {
      id: "google-business",
      title: "Perfil de Empresa Google",
      description: "Integração pausada para manutenção. O botão permanece bloqueado até a liberação do fluxo.",
      status: "maintenance" as const,
      accountLabel:
        user.google_business_location_title ||
        user.google_business_account_display_name ||
        (user.has_google_business_profile ? "Conta vinculada" : null),
      accentClassName: user.has_google_business_profile ? "text-cyan-300" : "text-white/55",
      iconWrapClassName: "border-cyan-500/20 bg-cyan-500/10",
      icon: <Building2 className="h-5 w-5 text-cyan-300" />,
      action: (
        <ActionButton
          disabled
          className="border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.04]"
          icon={<Building2 className="h-4 w-4" />}
        >
          Em manutenção
        </ActionButton>
      ),
    },
  ];

  const creditActionsByCategory = useMemo(() => {
    return (creditCatalog.actions?.length ? creditCatalog.actions : CREDIT_ACTIONS).reduce<
      Record<string, CreditCatalogResponse["actions"]>
    >((acc, action) => {
      if (!acc[action.category]) {
        acc[action.category] = [];
      }
      acc[action.category].push(action);
      return acc;
    }, {});
  }, [creditCatalog.actions]);

  const availablePlans = creditCatalog.plans?.length ? creditCatalog.plans : CREDIT_PLANS;
  const monthlyPlans = availablePlans.filter((plan) => getCreditItemKind(plan as { kind?: string }) !== "pack");
  const creditPacks = availablePlans.filter((plan) => getCreditItemKind(plan as { kind?: string }) === "pack");
  const dailyFreeCredits = creditCatalog.daily_free_credits || DEFAULT_DAILY_FREE_CREDITS;
  const pricingNote = typeof (creditCatalog as { pricing_note?: string }).pricing_note === "string"
    ? (creditCatalog as { pricing_note?: string }).pricing_note
    : null;
  const recommendedPlanTitle =
    monthlyPlans.find((plan) => Boolean((plan as { recommended?: boolean }).recommended))?.title || monthlyPlans[0]?.title || "Profissional";
  const accountDisplayName = user.name?.trim() || user.email;
  const accountInitial = accountDisplayName.charAt(0).toUpperCase();
  const canRemovePhoto = Boolean(user.profile_image_url) && !isRemovingProfileImage && !isUploadingProfileImage;
  const creditCategoryEntries = Object.entries(creditActionsByCategory);
  const activeCreditCategory =
    selectedCreditCategory && creditActionsByCategory[selectedCreditCategory]
      ? selectedCreditCategory
      : creditCategoryEntries[0]?.[0] || "";
  const selectedCreditActions = activeCreditCategory ? creditActionsByCategory[activeCreditCategory] || [] : [];

  const handleActivateCreditPlan = async (planId: string) => {
    if (activatingPlanId) return;

    try {
      setActivatingPlanId(planId);
      const response = await authService.activateCreditPlan(planId);
      updateUser({ credits: response.credits });
      setCreditCatalog((current) => ({
        ...current,
        current_credits: response.credits,
      }));
      const bonusSuffix =
        response.bonus_credits > 0
          ? ` (${formatCredits(response.base_credits)} base + ${formatCredits(response.bonus_credits)} bônus)`
          : "";
      toastSuccess(
        `Plano ${response.title} ativado: +${formatCredits(response.credits_added)} créditos${bonusSuffix}.`,
      );
    } catch (error) {
      toastApiError(error, "Erro ao adicionar créditos");
    } finally {
      setActivatingPlanId(null);
    }
  };

  return (
    <div className="theme-page-account mx-auto w-full max-w-7xl px-4 py-8">
      <div className="animate-in fade-in space-y-8 duration-500">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Minha conta</h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60">
            {accountView === "credits"
              ? "Gerencie seus planos, recargas de créditos e a tabela de consumo do sistema."
              : "Gerencie seu perfil, escolha sua foto e conecte suas integrações em um só lugar."}
          </p>
        </div>

        {accountView === "account" ? (
          <>
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(64,129,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_30%)]" />

          <div className="relative grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-28 w-28 rounded-full ring-4 ring-cyan-400/15">
                  {user.profile_image_url ? <AvatarImage src={user.profile_image_url} alt={accountDisplayName} /> : null}
                  <AvatarFallback className="rounded-full text-3xl font-bold" tone="blue">
                    {accountInitial}
                  </AvatarFallback>
                </Avatar>

                <h2 className="mt-4 break-words text-2xl font-semibold text-white">{accountDisplayName}</h2>
                <div className="mt-1 flex max-w-full items-start gap-2 text-sm text-white/55">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="break-all">{user.email}</span>
                </div>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  Conta ativa
                </div>

                <div className="mt-5 w-full rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">Integrações conectadas</p>
                  <div className="mt-3">
                    <ConnectedAppsStrip items={connectedIntegrations} compact />
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleProfileImageSelected}
                />

                <div className="mt-5 flex w-full flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleOpenProfileImagePicker}
                    disabled={isUploadingProfileImage}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingProfileImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {user.profile_image_url ? "Trocar foto" : "Escolher foto"}
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveProfileImage}
                    disabled={!canRemovePhoto}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/75 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRemovingProfileImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Remover foto
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Foto do perfil</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  {user.profile_image_url
                    ? "Sua foto já está ativa e aparece no painel."
                    : "Adicione uma foto para deixar seu perfil mais pessoal."}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="flex min-w-0 flex-col gap-5 rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">Perfil da conta</h3>
                <p className="text-sm leading-6 text-white/60">
                  Atualize seu nome e mantenha a foto do seu perfil do jeito que você preferir.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <label htmlFor="account-full-name" className="text-sm font-medium text-white/75">
                    Nome da conta
                  </label>
                  <Input
                    id="account-full-name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    maxLength={120}
                    placeholder="Como você quer aparecer no painel"
                  />
                </div>

                <div className="min-w-0 space-y-2">
                  <label htmlFor="account-email" className="text-sm font-medium text-white/75">
                    E-mail de acesso
                  </label>
                  <Input id="account-email" value={user.email} readOnly disabled className="truncate" />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white/65">Nome exibido</p>
                  <p className="mt-2 break-words text-lg font-semibold text-white">{accountDisplayName}</p>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Esse é o nome que aparece nas áreas principais da sua conta.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white/65">Apps conectados</p>

                  <div className="mt-3">
                    <ConnectedAppsStrip items={connectedIntegrations} compact />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">Seu perfil, do seu jeito</p>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Você pode atualizar seu nome e trocar sua foto sempre que quiser.
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-white/50">As alterações ficam salvas na sua conta.</p>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Integrações da conta</h2>
              <p className="text-sm leading-6 text-white/55">
                Conecte os canais que você usa para publicar e acompanhar sua presença online.
              </p>
            </div>
          </div>

          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
            {integrations.map((integration) => (
              <IntegrationCard key={integration.id} {...integration} />
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/15">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_36%)]" />

          <div className="relative">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-3 text-cyan-300">
                  <Coins className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">Créditos de IA</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Seus créditos cobrem agentes de chat, SkyBob, análises, motor de imagem e fluxos de autoridade. Você recebe{" "}
                  <span className="font-semibold text-white">{formatCredits(dailyFreeCredits)} créditos</span> diariamente sem perder saldo acumulado.
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                Renovação diária
              </span>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5 transition-all duration-300 hover:bg-black/25">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/35">Disponível agora</p>
                  <p className="mt-3 text-5xl font-semibold leading-none text-white">{formatCredits(user.credits)}</p>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
                    Uso contínuo para agentes, fluxos, imagem, SkyBob e tarefas do painel.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Carga diária</p>
                      <p className="mt-2 text-lg font-semibold text-white">+{formatCredits(dailyFreeCredits)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Plano inicial</p>
                      <p className="mt-2 text-lg font-semibold text-white">{formatCredits(creditCatalog.initial_credits)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Plano recomendado</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {recommendedPlanTitle}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">Adicionar mais créditos</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      Abra a área completa de créditos para ver planos, recargas avulsas e tabela de consumo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAccountView("credits")}
                    className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] hover:bg-white/90"
                  >
                    Ver planos e créditos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

          </>
        ) : null}

        {accountView === "credits" && typeof document !== "undefined"
          ? createPortal(
              <section
                role="dialog"
                aria-modal="true"
                aria-label="Planos e créditos"
                className="account-credits-fullscreen fixed inset-0 z-[9999] overflow-y-auto bg-[#f4f7fb] px-4 py-5 text-slate-900 sm:px-6 lg:px-8"
              >
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,133,244,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(52,168,83,0.12),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef3f9_100%)]" />

            <div className="relative mx-auto flex min-h-full w-full max-w-[1680px] flex-col gap-6">
              <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200/70 bg-[#f4f7fb]/88 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="mx-auto flex max-w-[1680px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <button
                    type="button"
                    onClick={() => setAccountView("account")}
                    className="inline-flex h-11 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:text-blue-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para minha conta
                  </button>

                  <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:w-[620px]">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Saldo atual</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{formatCredits(user.credits)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Recarga diária</p>
                      <p className="mt-1 text-xl font-bold text-emerald-700">+{formatCredits(dailyFreeCredits)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Indicado</p>
                      <p className="mt-1 truncate text-xl font-bold text-slate-900">{recommendedPlanTitle}</p>
                    </div>
                  </div>
                </div>
              </div>

              <header className="overflow-hidden rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      <Coins className="h-4 w-4" />
                      Planos e créditos
                    </div>
                    <h2 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                      Escolha o plano certo para o volume de IA que você quer rodar.
                    </h2>
                    <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                      Compare créditos, bônus e uso indicado sem ficar preso em cards apertados. Os créditos entram na hora e podem ser complementados com recargas avulsas quando precisar.
                    </p>
                    {pricingNote ? (
                      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-600">
                        {pricingNote}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5 shadow-inner">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumo rápido</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                        <span className="text-sm text-slate-600">Saldo disponível</span>
                        <strong className="text-xl text-slate-950">{formatCredits(user.credits)}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                        <span className="text-sm text-slate-600">Créditos grátis/dia</span>
                        <strong className="text-xl text-emerald-700">+{formatCredits(dailyFreeCredits)}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
                        <span className="text-sm text-slate-600">Plano recomendado</span>
                        <strong className="max-w-[190px] truncate text-right text-xl text-slate-950">{recommendedPlanTitle}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              <section className="account-credits-section rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
                <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Planos mensais</p>
                    <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Comparativo dos planos</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                      Quatro opções lado a lado, com foco no volume real de uso. O botão ativa o plano e adiciona os créditos na conta.
                    </p>
                  </div>
                  {isLoadingCreditCatalog ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Atualizando catálogo
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                  {monthlyPlans.map((plan) => {
                    const isActivating = activatingPlanId === plan.id;
                    const isRecommended = Boolean((plan as { recommended?: boolean }).recommended);
                    const highlights = getPlanHighlights(plan.id, plan.title);
                    return (
                      <article
                        key={plan.id}
                        className={cn(
                          "account-plan-card flex min-h-[520px] min-w-0 flex-col rounded-[30px] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
                          isRecommended
                            ? "account-plan-card--recommended border-blue-200 bg-gradient-to-b from-[#eaf6ff] to-white ring-2 ring-blue-100"
                            : "border-slate-200 bg-white",
                        )}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="break-words text-2xl font-bold text-slate-950">{plan.title}</h4>
                            <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{plan.description}</p>
                          </div>
                          {plan.badge ? (
                            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                              {plan.badge}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Valor teste</p>
                          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-950">{plan.display_price}</p>
                          <p className="mt-2 text-sm font-medium text-slate-600">{plan.monthly_fit}</p>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="account-metric-box rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Base</p>
                            <p className="mt-2 break-words text-lg font-bold text-slate-950">{formatCredits(plan.base_credits)}</p>
                          </div>
                          <div className="account-metric-box rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bônus</p>
                            <p className="mt-2 break-words text-lg font-bold text-emerald-700">+{formatCredits(plan.bonus_credits)}</p>
                          </div>
                          <div className="account-metric-box rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
                            <p className="mt-2 break-words text-lg font-bold text-slate-950">{formatCredits(plan.total_credits)}</p>
                          </div>
                        </div>

                        <div className="account-plan-note mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Ideal para</p>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                            {highlights.map((item) => (
                              <li key={item} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleActivateCreditPlan(plan.id)}
                          disabled={Boolean(activatingPlanId)}
                          className={cn(
                            "text-on-blue account-plan-activate-button mt-auto inline-flex h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-100",
                            isRecommended
                              ? "account-plan-activate-button--recommended border border-transparent bg-gradient-to-r from-[#4285F4] via-[#34A853] to-[#FBBC05] text-white shadow-[0_16px_30px_rgba(66,133,244,0.24)] disabled:text-white"
                              : "border border-blue-200 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700 disabled:bg-blue-500 disabled:text-white",
                          )}
                        >
                          {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar plano"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
                <div className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Diferenças</p>
                    <h3 className="mt-2 text-2xl font-bold text-slate-950">O que muda de um plano para o outro</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Use esta comparação para entender rapidamente se você precisa de volume leve, constante, intenso ou operação de equipe.
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-[28px] border border-slate-200">
                    <div className="grid min-w-[850px] grid-cols-[170px_repeat(4,minmax(170px,1fr))] text-sm">
                      <div className="bg-slate-50 p-4 font-bold text-slate-700">Critério</div>
                      {monthlyPlans.map((plan) => (
                        <div key={plan.id} className="border-l border-slate-200 bg-slate-50 p-4 font-bold text-slate-950">
                          {plan.title}
                        </div>
                      ))}

                      <div className="border-t border-slate-200 p-4 font-semibold text-slate-600">Créditos totais</div>
                      {monthlyPlans.map((plan) => (
                        <div key={`${plan.id}-total`} className="border-l border-t border-slate-200 p-4 font-bold text-slate-950">
                          {formatCredits(plan.total_credits)}
                        </div>
                      ))}

                      <div className="border-t border-slate-200 p-4 font-semibold text-slate-600">Bônus</div>
                      {monthlyPlans.map((plan) => (
                        <div key={`${plan.id}-bonus`} className="border-l border-t border-slate-200 p-4 font-bold text-emerald-700">
                          {plan.bonus_credits > 0 ? `+${formatCredits(plan.bonus_credits)}` : "Sem bônus"}
                        </div>
                      ))}

                      <div className="border-t border-slate-200 p-4 font-semibold text-slate-600">Perfil de uso</div>
                      {monthlyPlans.map((plan) => (
                        <div key={`${plan.id}-fit`} className="border-l border-t border-slate-200 p-4 text-slate-700">
                          {plan.monthly_fit}
                        </div>
                      ))}

                      <div className="border-t border-slate-200 p-4 font-semibold text-slate-600">Melhor para</div>
                      {monthlyPlans.map((plan) => (
                        <div key={`${plan.id}-best`} className="border-l border-t border-slate-200 p-4 text-slate-700">
                          {getPlanHighlights(plan.id, plan.title)[0]}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-6">
                  <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                    <h3 className="text-xl font-bold text-slate-950">Como os créditos funcionam</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                      <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Cada pedido desconta créditos com base no uso estimado da operação.</li>
                      <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />O cálculo considera IA, busca, imagem, processamento e estrutura da plataforma.</li>
                      <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Os créditos gratuitos diários entram sem apagar o saldo acumulado.</li>
                      <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />Recargas avulsas complementam saldo sem mudar de plano.</li>
                    </ul>
                  </div>

                  <div className="rounded-[34px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                    <Sparkles className="h-6 w-6 text-blue-600" />
                    <h3 className="mt-3 text-xl font-bold text-slate-950">Sugestão prática</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Para uso recorrente com agentes, autoridade e SkyBob, comece pelo plano indicado. Para testes pontuais, use o básico ou uma recarga avulsa.
                    </p>
                  </div>
                </aside>
              </section>

              {creditPacks.length ? (
                <section className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
                  <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Recargas avulsas</p>
                      <h3 className="mt-2 text-2xl font-bold text-slate-950">Comprar créditos sem trocar de plano</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                        Use quando o saldo acabar antes do fim do mês ou quando precisar rodar uma demanda maior.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {creditPacks.map((pack) => {
                      const isActivating = activatingPlanId === pack.id;
                      return (
                        <article key={pack.id} className="account-credit-card flex min-h-[260px] flex-col rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="break-words text-xl font-bold text-slate-950">{pack.title}</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{pack.description}</p>
                            </div>
                            {pack.badge ? (
                              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                                {pack.badge}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Valor teste</p>
                            <p className="mt-1 text-3xl font-bold text-slate-950">{pack.display_price}</p>
                            <p className="mt-2 text-sm font-semibold text-blue-700">{formatCredits(pack.total_credits)} créditos</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleActivateCreditPlan(pack.id)}
                            disabled={Boolean(activatingPlanId)}
                            className="mt-auto inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comprar créditos"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="mb-8 rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Consumo médio</p>
                    <h3 className="mt-2 text-2xl font-bold text-slate-950">Tabela de consumo</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                      Veja quantos créditos as principais operações costumam consumir.
                    </p>
                  </div>
                  {isLoadingCreditCatalog ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {creditCategoryEntries.map(([category, actions]) => {
                    const isActive = category === activeCreditCategory;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCreditCategory(category)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition",
                          isActive
                            ? "border-transparent bg-gradient-to-r from-[#4285F4] via-[#34A853] to-[#FBBC05] text-white shadow-[0_12px_28px_rgba(66,133,244,0.22)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700",
                        )}
                      >
                        <span>{category}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal", isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700")}>{actions.length}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedCreditActions.map((action) => {
                    const estimatedCost = formatEstimatedCost((action as { estimated_cost_brl?: number }).estimated_cost_brl);
                    const billingBasis = (action as { billing_basis?: string }).billing_basis;
                    return (
                      <div key={action.key} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-950">{action.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
                          </div>
                          <div className="shrink-0 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-right">
                            <div className="text-sm font-bold text-blue-700">{formatCredits(action.credits)}</div>
                            {estimatedCost ? <div className="text-[11px] text-blue-600">{estimatedCost}</div> : null}
                          </div>
                        </div>
                        {billingBasis ? (
                          <p className="mt-3 text-xs leading-5 text-slate-500">Base de cálculo: {billingBasis}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
              </section>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}


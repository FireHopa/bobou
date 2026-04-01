import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
  const [isCreditsDialogOpen, setIsCreditsDialogOpen] = useState(false);
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
  const dailyFreeCredits = creditCatalog.daily_free_credits || DEFAULT_DAILY_FREE_CREDITS;
  const accountDisplayName = user.name?.trim() || user.email;
  const accountInitial = accountDisplayName.charAt(0).toUpperCase();
  const canRemovePhoto = Boolean(user.profile_image_url) && !isRemovingProfileImage && !isUploadingProfileImage;

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
      setIsCreditsDialogOpen(false);
    } catch (error) {
      toastApiError(error, "Erro ao adicionar créditos");
    } finally {
      setActivatingPlanId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="animate-in fade-in space-y-8 duration-500">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Minha conta</h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60">
            Gerencie seu perfil, escolha sua foto e conecte suas integrações em um só lugar.
          </p>
        </div>

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
                        {availablePlans.find((plan) => plan.recommended)?.title || "Growth Stack"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">Adicionar mais créditos</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      Escolha um plano para aumentar o saldo da sua conta imediatamente.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreditsDialogOpen(true)}
                    className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] hover:bg-white/90"
                  >
                    Adicionar créditos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Dialog open={isCreditsDialogOpen} onOpenChange={setIsCreditsDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-white/10 bg-[#07111f] p-0">
            <div className="relative overflow-hidden rounded-[2rem]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_28%),radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%)]" />
              <div className="relative p-6 sm:p-8">
                <DialogHeader className="pr-10">
                  <DialogTitle>Adicionar créditos</DialogTitle>
                  <DialogDescription>
                    Planos fictícios prontos para teste. Ao clicar, os créditos entram imediatamente na conta e o saldo permanece acumulado.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {availablePlans.map((plan) => {
                        const isActivating = activatingPlanId === plan.id;
                        return (
                          <div
                            key={plan.id}
                            className={cn(
                              "rounded-[28px] border p-5 transition-all duration-200",
                              plan.recommended
                                ? "border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                                : "border-white/10 bg-white/[0.03]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-semibold text-white">{plan.title}</h3>
                                  {plan.badge ? (
                                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                                      {plan.badge}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-white/60">{plan.description}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                                <p className="text-xs uppercase tracking-[0.18em] text-white/35">Valor fictício</p>
                                <p className="mt-1 text-lg font-semibold text-white">{plan.display_price}</p>
                              </div>
                            </div>

                            <div className="mt-5 grid grid-cols-3 gap-3">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Base</p>
                                <p className="mt-2 text-base font-semibold text-white">{formatCredits(plan.base_credits)}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Bônus</p>
                                <p className="mt-2 text-base font-semibold text-emerald-300">+{formatCredits(plan.bonus_credits)}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Total</p>
                                <p className="mt-2 text-base font-semibold text-white">{formatCredits(plan.total_credits)}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div className="text-sm text-white/55">{plan.monthly_fit}</div>
                              <button
                                type="button"
                                onClick={() => handleActivateCreditPlan(plan.id)}
                                disabled={Boolean(activatingPlanId)}
                                className={cn(
                                  "inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                                  plan.recommended
                                    ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                                    : "bg-white text-slate-950 hover:bg-white/90",
                                )}
                              >
                                {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar plano"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-white">Resumo operacional</h3>
                          <p className="mt-1 text-sm leading-6 text-white/60">
                            Referência rápida para manter o custo previsível no uso diário.
                          </p>
                        </div>
                        {isLoadingCreditCatalog ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : null}
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Saldo atual</p>
                          <p className="mt-2 text-2xl font-semibold text-white">{formatCredits(user.credits)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Recarga automática diária</p>
                          <p className="mt-2 text-2xl font-semibold text-emerald-300">+{formatCredits(dailyFreeCredits)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Tabela de consumo</h3>
                        <p className="mt-1 text-sm leading-6 text-white/60">
                          Cada execução válida consome créditos no backend, sem depender da interface.
                        </p>
                      </div>
                      {isLoadingCreditCatalog ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : null}
                    </div>

                    <div className="mt-5 space-y-4">
                      {Object.entries(creditActionsByCategory).map(([category, actions]) => (
                        <div key={category} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">{category}</h4>
                            <span className="text-xs text-white/35">{actions.length} itens</span>
                          </div>

                          <div className="space-y-3">
                            {actions.map((action) => (
                              <div
                                key={action.key}
                                className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white">{action.title}</p>
                                  <p className="mt-1 text-xs leading-5 text-white/45">{action.description}</p>
                                </div>
                                <div className="shrink-0 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-300">
                                  {formatCredits(action.credits)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

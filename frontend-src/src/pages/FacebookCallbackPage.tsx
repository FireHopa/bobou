import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { instagramService } from "@/services/instagram";
import { facebookService } from "@/services/facebook";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/state/authStore";
import { buildAppUrl } from "@/constants/app";

const INSTAGRAM_REDIRECT_URI =
  import.meta.env.VITE_INSTAGRAM_META_REDIRECT_URI?.trim() || buildAppUrl("/auth/facebook/callback");

const FACEBOOK_REDIRECT_URI =
  import.meta.env.VITE_FACEBOOK_META_REDIRECT_URI?.trim() || buildAppUrl("/auth/facebook/callback");

export const FacebookCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuthStore();

  useEffect(() => {
    const processMetaCallback = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const state = searchParams.get("state");
      const savedState = localStorage.getItem("meta_oauth_state");
      const platform = localStorage.getItem("meta_oauth_platform") || "instagram";
      const redirectAfter = localStorage.getItem("meta_redirect_after_connect") || "/conta";

      if (error) {
        toast.error(`A vinculação com ${platform === "facebook" ? "o Facebook" : "o Instagram"} foi cancelada ou falhou.`);
        navigate(redirectAfter, { replace: true });
        return;
      }

      if (!code) {
        toast.error("Código de autorização da Meta não encontrado.");
        navigate(redirectAfter, { replace: true });
        return;
      }

      if (!state || !savedState || state !== savedState) {
        toast.error("Falha de segurança ao validar o retorno da Meta.");
        navigate(redirectAfter, { replace: true });
        return;
      }

      try {
        if (platform === "facebook") {
          await facebookService.connect(code, FACEBOOK_REDIRECT_URI);
        } else {
          await instagramService.connect(code, INSTAGRAM_REDIRECT_URI);
        }
        const me = await authService.checkMe();
        updateUser({
          email: me.email,
          name: me.full_name,
          credits: me.credits,
          has_linkedin: me.has_linkedin,
          has_instagram: me.has_instagram,
          instagram_username: me.instagram_username,
          has_facebook: me.has_facebook,
          facebook_page_name: me.facebook_page_name,
          facebook_page_username: me.facebook_page_username,
          has_youtube: me.has_youtube,
          youtube_channel_title: me.youtube_channel_title,
          youtube_channel_handle: me.youtube_channel_handle,
          has_tiktok: me.has_tiktok,
          tiktok_display_name: me.tiktok_display_name,
          tiktok_username: me.tiktok_username,
          has_google_business_profile: me.has_google_business_profile,
          google_business_account_display_name: me.google_business_account_display_name,
          google_business_location_title: me.google_business_location_title,
        });
        toast.success(platform === "facebook" ? "Facebook vinculado com sucesso!" : "Instagram vinculado com sucesso!");
      } catch (err: any) {
        const detail = err?.payload?.detail || err?.message || "Erro ao vincular a conta.";
        toast.error(typeof detail === "string" ? detail : JSON.stringify(detail));
      } finally {
        localStorage.removeItem("meta_oauth_state");
        localStorage.removeItem("meta_oauth_platform");
        localStorage.removeItem("meta_redirect_after_connect");
        navigate(redirectAfter, { replace: true });
      }
    };

    processMetaCallback();
  }, [navigate, searchParams, updateUser]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
      <h2 className="text-lg font-semibold">Processando autorização da Meta...</h2>
      <p className="text-sm text-muted-foreground">Aguarde alguns segundos.</p>
    </div>
  );
};

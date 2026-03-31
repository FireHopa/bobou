import React, { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { tiktokService } from "@/services/tiktok";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/state/authStore";
import { toastApiError, toastSuccess } from "@/lib/toast";

export default function TikTokCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuthStore();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const run = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const state = searchParams.get("state");
      const savedState = localStorage.getItem("tiktok_oauth_state");
      const codeVerifier = sessionStorage.getItem("tiktok_code_verifier");
      const redirectPath = localStorage.getItem("tiktok_redirect") || "/conta";

      if (error) {
        toastApiError(new Error("Você cancelou a autorização do TikTok."), "Conexão cancelada");
        navigate(redirectPath, { replace: true });
        return;
      }

      if (!code) {
        toastApiError(new Error("Código de autorização do TikTok não encontrado."), "Erro ao conectar TikTok");
        navigate(redirectPath, { replace: true });
        return;
      }

      if (!state || !savedState || state !== savedState) {
        toastApiError(new Error("Falha de segurança ao validar o retorno do TikTok."), "Erro ao conectar TikTok");
        navigate(redirectPath, { replace: true });
        return;
      }

      if (!codeVerifier) {
        toastApiError(new Error("code_verifier do TikTok não foi encontrado. Inicie a conexão novamente."), "Erro ao conectar TikTok");
        navigate(redirectPath, { replace: true });
        return;
      }

      try {
        await tiktokService.connect(code, codeVerifier);
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
        toastSuccess("Conta do TikTok conectada com sucesso!");
      } catch (error) {
        toastApiError(error, "Erro ao conectar TikTok");
      } finally {
        localStorage.removeItem("tiktok_oauth_state");
        localStorage.removeItem("tiktok_redirect");
        sessionStorage.removeItem("tiktok_code_verifier");
        navigate(redirectPath, { replace: true });
      }
    };

    void run();
  }, [navigate, searchParams, updateUser]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <Loader2 className="h-10 w-10 animate-spin text-white" />
      <h2 className="text-lg font-semibold">Processando autorização do TikTok...</h2>
      <p className="text-sm text-muted-foreground">Aguarde alguns segundos.</p>
    </div>
  );
}

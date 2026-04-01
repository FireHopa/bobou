import type { CreditCatalogResponse } from "@/lib/credits";
import { http } from "./http";

export interface AuthMeResponse {
  email: string;
  full_name?: string | null;
  google_id?: string;
  credits: number;
  has_linkedin?: boolean;
  has_instagram?: boolean;
  instagram_username?: string | null;
  has_facebook?: boolean;
  facebook_page_name?: string | null;
  facebook_page_username?: string | null;
  has_youtube?: boolean;
  youtube_channel_title?: string | null;
  youtube_channel_handle?: string | null;
  has_tiktok?: boolean;
  tiktok_display_name?: string | null;
  tiktok_username?: string | null;
  has_google_business_profile?: boolean;
  google_business_account_display_name?: string | null;
  google_business_location_title?: string | null;
  profile_image_url?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_email: string;
  user_name?: string | null;
  credits: number;
  has_linkedin?: boolean;
  has_instagram?: boolean;
  instagram_username?: string | null;
  has_facebook?: boolean;
  facebook_page_name?: string | null;
  facebook_page_username?: string | null;
  has_youtube?: boolean;
  youtube_channel_title?: string | null;
  youtube_channel_handle?: string | null;
  has_tiktok?: boolean;
  tiktok_display_name?: string | null;
  tiktok_username?: string | null;
  has_google_business_profile?: boolean;
  google_business_account_display_name?: string | null;
  google_business_location_title?: string | null;
  profile_image_url?: string | null;
}

export interface CreditPlanActivationResponse {
  ok: boolean;
  plan_id: string;
  title: string;
  display_price: string;
  credits_added: number;
  base_credits: number;
  bonus_credits: number;
  credits: number;
}

export const authService = {
  login: async (email: string, password: string) => {
    return http<TokenResponse>("/api/auth/login", {
      method: "POST",
      json: { email, password },
    });
  },

  register: async (email: string, password: string, full_name?: string) => {
    return http<TokenResponse>("/api/auth/register", {
      method: "POST",
      json: { email, password, full_name },
    });
  },

  googleLogin: async (credential: string) => {
    return http<TokenResponse>("/api/auth/google", {
      method: "POST",
      json: { credential },
    });
  },

  checkMe: async () => {
    return http<AuthMeResponse>("/api/auth/me", {
      method: "GET",
    });
  },

  updateProfile: async (fullName: string) => {
    return http<AuthMeResponse>("/api/auth/profile", {
      method: "PUT",
      json: { full_name: fullName },
    });
  },

  uploadProfileImage: async (file: File) => {
    const form = new FormData();
    form.append("file", file);

    return http<AuthMeResponse>("/api/auth/profile-image", {
      method: "POST",
      body: form,
    });
  },

  removeProfileImage: async () => {
    return http<AuthMeResponse>("/api/auth/profile-image", {
      method: "DELETE",
    });
  },

  getCreditsCatalog: async () => {
    return http<CreditCatalogResponse>("/api/auth/credits/catalog", {
      method: "GET",
    });
  },

  activateCreditPlan: async (planId: string) => {
    return http<CreditPlanActivationResponse>("/api/auth/credits/activate-plan", {
      method: "POST",
      json: { plan_id: planId },
    });
  },
};

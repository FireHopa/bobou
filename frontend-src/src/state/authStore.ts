import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  email: string;
  name?: string | null;
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

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  deductCredits: (amount: number) => void;
  updateCredits: (amount: number) => void;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      deductCredits: (amount) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, credits: Math.max(0, state.user.credits - amount) }
            : null,
        })),
      updateCredits: (amount) =>
        set((state) => ({
          user: state.user ? { ...state.user, credits: amount } : null,
        })),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
    }),
    {
      name: "auth-store",
    }
  )
);

export const qk = {
  health: () => ["health"] as const,

  robots: {
    list: () => ["robots", "list"] as const,
    detail: (publicId: string) => ["robots", "detail", publicId] as const,
    messages: (publicId: string) => ["robots", publicId, "messages"] as const,
  },
} as const;

export const qkAuthorityEdits = (publicId: string) => ["robots", publicId, "authority-edits"] as const;

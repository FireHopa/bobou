import React from "react";
import { Instagram, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { instagramService } from "@/services/instagram";

type Props = {
  className?: string;
  children?: React.ReactNode;
  redirectPath?: string;
  disabled?: boolean;
  loading?: boolean;
};

export const InstagramConnectButton = ({
  className,
  children,
  redirectPath = "/conta",
  disabled,
  loading,
}: Props) => {
  const handleConnect = () => {
    instagramService.startAuth(redirectPath);
  };

  return (
    <Button
      onClick={handleConnect}
      variant="outline"
      disabled={disabled || loading}
      className={className || "flex items-center gap-2 border-pink-500 text-pink-600 hover:bg-pink-50"}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-5 h-5" />}
      {children || "Vincular Instagram"}
    </Button>
  );
};

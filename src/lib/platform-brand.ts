import { resolveMediaUrl } from "@/lib/media";

export const EDUIGNITE_LOGO_MARK = "/eduignite-logo.svg";
export const EDUIGNITE_LOGO_PNG = "/icon.png";

const FRONTEND_BRAND_ASSETS = [
  EDUIGNITE_LOGO_MARK,
  EDUIGNITE_LOGO_PNG,
  "/apple-touch-icon.png",
  "/icons/eduignite-icon-192.png",
  "/icons/eduignite-icon-512.png",
];

export function resolvePlatformLogoUrl(logo?: string | null): string {
  const trimmed = logo?.trim();
  if (!trimmed) return EDUIGNITE_LOGO_MARK;

  if (FRONTEND_BRAND_ASSETS.some((asset) => trimmed === asset || trimmed.startsWith(`${asset}?`))) {
    return trimmed;
  }

  return resolveMediaUrl(trimmed) || EDUIGNITE_LOGO_MARK;
}

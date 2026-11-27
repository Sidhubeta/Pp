import type { ReactNode } from "react";

export type PhonePePromoCardProps = {
  bgColor: string;
  accentBg: string;
  ctaTextColor: string;
  headline: ReactNode;
  ctaLabel: string;
  artSrc: string;
  artAlt: string;
  secondaryArtSrc?: string;
  bgTextureSrc?: string;
  artClassName?: string;
  secondaryArtClassName?: string;
  compact?: boolean;
  showAdBadge?: boolean;
  adBadgeVariant?: "dark" | "purple";
};

export function PhonePePromoCard({
  bgColor,
  accentBg,
  ctaTextColor,
  headline,
  ctaLabel,
  artSrc,
  artAlt,
  secondaryArtSrc,
  bgTextureSrc,
  artClassName = "",
  secondaryArtClassName = "",
  compact = false,
  showAdBadge = false,
  adBadgeVariant = "dark",
}: PhonePePromoCardProps) {
  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{ backgroundColor: bgColor }}
    >
      {bgTextureSrc && (
        <img
          src={bgTextureSrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
          draggable={false}
        />
      )}

      {/* Subtle ambient decorative window/circle shapes matching PhonePe banner aesthetic */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 left-1/4 h-36 w-36 rounded-full bg-black/[0.04]"
      />

      {/* Official PhonePe artwork positioned cleanly on the left/bottom-left */}
      <img
        src={artSrc}
        alt={artAlt}
        loading="lazy"
        className={`pointer-events-none absolute object-contain ${
          artClassName ||
          (compact
            ? "bottom-2 left-3 h-[76%] max-w-[40%]"
            : "bottom-3 left-3 h-[64%] max-w-[46%]")
        }`}
        draggable={false}
      />

      {secondaryArtSrc && (
        <img
          src={secondaryArtSrc}
          alt=""
          loading="lazy"
          className={`pointer-events-none absolute object-contain ${
            secondaryArtClassName || "bottom-3 left-[26%] h-[42%] max-w-[26%]"
          }`}
          draggable={false}
        />
      )}

      {/* PhonePe curved pill banner panel on the right (matching official Piped Gas banner style) */}
      <div
        className={`absolute right-0 flex flex-col justify-center rounded-l-[999px] shadow-sm ${
          compact
            ? "top-1/2 w-[62%] -translate-y-1/2 py-3.5 pl-6 pr-4"
            : "top-[10%] w-[64%] py-5 pl-8 pr-5"
        }`}
        style={{ backgroundColor: accentBg }}
      >
        <p
          className={`font-normal leading-[1.28] text-white ${
            compact ? "text-[13.5px]" : "text-[16.5px] sm:text-[18px]"
          }`}
        >
          {headline}
        </p>
        <div className={compact ? "mt-2.5" : "mt-3.5"}>
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-white font-semibold shadow-xs ${
              compact
                ? "px-3 py-1 text-[11px]"
                : "px-3.5 py-1.5 text-[12.5px]"
            }`}
            style={{ color: ctaTextColor }}
          >
            {ctaLabel}
            <svg
              className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.6}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>

      {showAdBadge &&
        (adBadgeVariant === "purple" ? (
          <span className="absolute left-0 top-0 rounded-br-lg bg-[#7c1fd1] px-2.5 py-0.5 text-[10px] font-semibold text-white">
            Ad
          </span>
        ) : (
          <span className="absolute left-2.5 top-2.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white/90">
            Ad
          </span>
        ))}
    </div>
  );
}

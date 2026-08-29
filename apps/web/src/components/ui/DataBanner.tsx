import React from "react";

type BannerProps = {
  variant?: "simulation" | "demo-ai" | "no-model" | "no-data" | "no-creds";
  title?: string;
  message?: string;
  className?: string;
};

const STYLES: Record<string, { bg: string; border: string; text: string; icon: string; label: string; defaultMsg: string }> = {
  simulation: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-100",
    icon: "⚠️",
    label: "SIMULATION",
    defaultMsg: "You are viewing simulated/demo data. Numbers are not live market data. Do not trade on these values without verifying against a real source.",
  },
  "demo-ai": {
    bg: "bg-azure/10",
    border: "border-azure/40",
    text: "text-azure",
    icon: "🤖",
    label: "DEMO AI",
    defaultMsg: "No real AI model is configured. Responses come from the Windels demo assistant. Set OPENAI_API_KEY or OLLAMA_BASE_URL for real inference.",
  },
  "no-model": {
    bg: "bg-crimson/10",
    border: "border-crimson/40",
    text: "text-crimson",
    icon: "🔇",
    label: "VOICE MODEL NOT CONFIGURED",
    defaultMsg: "Server-side voice generation requires an ElevenLabs or Play.ht API key. Browser speech synthesis works out of the box.",
  },
  "no-data": {
    bg: "bg-crimson/10",
    border: "border-crimson/40",
    text: "text-crimson",
    icon: "📡",
    label: "MARKET DATA SOURCE REQUIRED",
    defaultMsg: "No real market-data provider is configured for this asset class. Configure a provider (e.g., CoinGecko for crypto, Polygon/TwelveData for equities) or pass allowSynthetic=true to see labeled simulation data.",
  },
  "no-creds": {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-100",
    icon: "🔑",
    label: "PLATFORM CREDENTIALS REQUIRED",
    defaultMsg: "This feature requires external API credentials to function. Configure the documented environment variables to enable.",
  },
};

export function DataBanner({ variant = "simulation", title, message, className = "" }: BannerProps) {
  const s = STYLES[variant]!;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 flex items-start gap-3 ${className}`}>
      <div className="text-lg leading-none mt-0.5">{s.icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] tracking-widest font-semibold uppercase ${s.text} mb-0.5`}>
          {title ?? s.label}
        </div>
        <div className="text-sm text-text-muted leading-snug">{message ?? s.defaultMsg}</div>
      </div>
    </div>
  );
}

export default DataBanner;

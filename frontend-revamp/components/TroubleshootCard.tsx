"use client";

import { useState } from "react";
import type { TroubleshootData } from "@/lib/types";

function PartThumbnail({ imageUrl, name }: { imageUrl: string; name: string }) {
  const [error, setError] = useState(false);
  if (!imageUrl || error) return null;
  return (
    <div
      className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={name}
        className="w-full h-full object-contain p-1"
        loading="lazy"
        onError={() => setError(true)}
      />
    </div>
  );
}

const LIKELIHOOD_CONFIG = {
  most_likely: {
    label: "Most likely",
    color: "var(--color-danger)",
    bg: "rgba(248,113,113,0.1)",
    bar: "100%",
    dot: "var(--color-danger)",
    border: "rgba(248,113,113,0.2)",
  },
  possible: {
    label: "Possible",
    color: "var(--color-warning)",
    bg: "rgba(251,191,36,0.1)",
    bar: "60%",
    dot: "var(--color-warning)",
    border: "rgba(251,191,36,0.2)",
  },
  less_likely: {
    label: "Less likely",
    color: "var(--color-amber)",
    bg: "rgba(212,168,83,0.08)",
    bar: "30%",
    dot: "var(--color-amber)",
    border: "rgba(212,168,83,0.18)",
  },
} as const;

interface TroubleshootCardProps {
  data: TroubleshootData;
}

export default function TroubleshootCard({ data }: TroubleshootCardProps) {
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | null>>({});

  function handleFeedback(psNumber: string, dir: "up" | "down") {
    setFeedback((prev) => ({
      ...prev,
      [psNumber]: prev[psNumber] === dir ? null : dir,
    }));
  }

  return (
    <div className="ps-card w-full sm:max-w-sm animate-slide-up">
      {/* Amber top accent */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #d4a853 0%, #e8c070 50%, transparent 100%)" }} />

      {/* Dark header */}
      <div
        className="px-4 py-3.5"
        style={{ background: "rgba(15,13,22,0.9)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-amber)", opacity: 0.9 }}>
            <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 01-1.299 2.25H2.804a1.5 1.5 0 01-1.3-2.25l5.197-9zM8 4a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-1)" }}>
            Diagnosis —{" "}
            <span style={{ color: "var(--color-amber)" }}>
              {data.appliance_type.charAt(0).toUpperCase() + data.appliance_type.slice(1)}
            </span>
          </h3>
        </div>
        <p className="text-xs line-clamp-1" style={{ color: "var(--color-text-3)" }}>
          {data.symptom}
        </p>
      </div>

      {/* Diagnosed parts */}
      <div>
        {data.diagnosed_parts.map(({ part, likelihood, reason }, i) => {
          const cfg = LIKELIHOOD_CONFIG[likelihood];
          const partUrl = `https://www.partselect.com/search.aspx?SearchTerm=${part.ps_number}`;
          const isLast = i === data.diagnosed_parts.length - 1;
          const fb = feedback[part.ps_number] ?? null;

          return (
            <div
              key={part.ps_number}
              className="px-4 py-3.5"
              style={{
                borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.05)",
                animation: `slide-up-fade 0.25s cubic-bezier(0.4,0,0.2,1) ${i * 60}ms both`,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  {/* Part thumbnail */}
                  <PartThumbnail imageUrl={part.image_url} name={part.name} />
                  <div className="min-w-0">
                  <a
                    href={partUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold cursor-pointer transition-colors duration-150"
                    style={{ color: "var(--color-amber)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-amber-light)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-amber)"; }}
                  >
                    {part.name}
                  </a>
                  <p className="part-number text-xs mt-0.5" style={{ color: "var(--color-text-4)" }}>
                    {part.ps_number}
                  </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                    {cfg.label}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "var(--color-amber)" }}>
                    ${part.price.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Likelihood bar */}
              <div className="h-1.5 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-1.5 rounded-full likelihood-bar"
                  style={{ width: cfg.bar, background: cfg.dot }}
                />
              </div>

              <p className="text-xs leading-relaxed mb-2.5" style={{ color: "var(--color-text-3)" }}>
                {reason}
              </p>

              {/* Thumbs feedback */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--color-text-4)" }}>Helpful?</span>
                {(["up", "down"] as const).map((dir) => {
                  const isActive = fb === dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => handleFeedback(part.ps_number, dir)}
                      aria-label={dir === "up" ? "Helpful" : "Not helpful"}
                      aria-pressed={isActive}
                      className="press-scale p-1 rounded-md transition-all duration-150"
                      style={{
                        color: isActive
                          ? dir === "up" ? "var(--color-success)" : "var(--color-danger)"
                          : "var(--color-text-4)",
                        background: isActive
                          ? dir === "up" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)"
                          : "transparent",
                        border: isActive
                          ? `1px solid ${dir === "up" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`
                          : "1px solid transparent",
                      }}
                    >
                      {dir === "up" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M6.293 1.293a1 1 0 011.414 0l.5.5A1 1 0 018.414 3H10a1 1 0 011 1v1a1 1 0 01-.293.707L9 7.414V12a1 1 0 01-1 1H6a1 1 0 01-1-1V7.414L3.293 5.707A1 1 0 013 5V4a1 1 0 011-1h1.586a1 1 0 01.707-.293z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M7.707 12.707a1 1 0 01-1.414 0l-.5-.5A1 1 0 015.586 11H4a1 1 0 01-1-1V9a1 1 0 01.293-.707L5 6.586V2a1 1 0 011-1h2a1 1 0 011 1v4.586l1.707 1.707A1 1 0 0111 9v1a1 1 0 01-1 1H8.414a1 1 0 01-.707.293z" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                {fb && (
                  <span
                    className="text-xs animate-slide-up"
                    style={{ color: fb === "up" ? "var(--color-success)" : "var(--color-text-3)" }}
                  >
                    {fb === "up" ? "Thanks!" : "Sorry to hear that."}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Repair guidance + safety */}
      {(data.repair_guidance || data.safety_note) && (
        <div
          className="px-4 py-3 space-y-2"
          style={{
            background: "rgba(212,168,83,0.05)",
            borderTop: "1px solid rgba(212,168,83,0.12)",
          }}
        >
          {data.repair_guidance && (
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--color-teal)" }}>
                <path fillRule="evenodd" d="M15 8A7 7 0 111 8a7 7 0 0114 0zm-9 .5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5zm2-3a.75.75 0 100 1.5.75.75 0 000-1.5z" clipRule="evenodd" />
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-2)" }}>
                {data.repair_guidance}
              </p>
            </div>
          )}
          {data.safety_note && (
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--color-warning)" }}>
                <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 01-1.299 2.25H2.804a1.5 1.5 0 01-1.3-2.25l5.197-9zM8 4a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-xs" style={{ color: "var(--color-text-3)" }}>
                {data.safety_note}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

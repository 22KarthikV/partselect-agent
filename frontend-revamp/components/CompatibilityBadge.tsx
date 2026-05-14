"use client";

import type { CompatibilityData } from "@/lib/types";
import ProductCard from "./ProductCard";

interface CompatibilityBadgeProps {
  data: CompatibilityData;
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  );
}

export default function CompatibilityBadge({ data }: CompatibilityBadgeProps) {
  const isOk = data.is_compatible;

  return (
    <div
      className="ps-card max-w-sm"
      style={{
        borderLeft: `3px solid ${isOk ? "var(--color-success)" : "var(--color-danger)"}`,
      }}
    >
      {/* Amber top accent */}
      <div style={{ height: "2px", background: isOk ? "linear-gradient(90deg, rgba(74,222,128,0.6) 0%, transparent 100%)" : "linear-gradient(90deg, rgba(248,113,113,0.6) 0%, transparent 100%)" }} />

      {/* Status banner */}
      <div
        className="flex items-center gap-3 px-4 py-3.5"
        style={{
          background: isOk ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)",
          borderBottom: `1px solid ${isOk ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
        }}
      >
        <span style={{ color: isOk ? "var(--color-success)" : "var(--color-danger)" }}>
          {isOk ? <CheckIcon /> : <XIcon />}
        </span>
        <div>
          <p
            className="font-bold text-sm"
            style={{ color: isOk ? "var(--color-success)" : "var(--color-danger)" }}
          >
            {isOk ? "Compatible" : "Not Compatible"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-3)" }}>
            <span className="part-number">{data.part_number}</span>
            {data.part_name ? ` — ${data.part_name}` : ""}
          </p>
        </div>
      </div>

      {/* Model info + explanation */}
      <div className="px-4 py-3.5 space-y-2.5">
        <div
          className="flex items-start gap-3 p-2.5 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="flex-shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" style={{ color: "var(--color-teal)" }}>
              <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-4)" }}>
              Model Number
            </p>
            <p className="part-number text-sm font-semibold" style={{ color: "var(--color-text-1)" }}>
              {data.model_number}
            </p>
            {data.model_description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-3)" }}>
                {data.model_description}
              </p>
            )}
          </div>
        </div>

        {data.explanation && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-2)" }}>
            {data.explanation}
          </p>
        )}
      </div>

      {/* Alternative parts */}
      {!isOk && data.alternative_parts?.length > 0 && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p
            className="text-xs font-semibold mt-3 mb-2 flex items-center gap-1.5"
            style={{ color: "var(--color-text-3)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" style={{ color: "var(--color-amber)" }}>
              <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
            </svg>
            Compatible alternatives
          </p>
          <div className="space-y-2">
            {data.alternative_parts.slice(0, 2).map((part) => (
              <ProductCard key={part.ps_number} data={part} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

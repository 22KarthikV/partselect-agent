/**
 * @file ProductListCard — compact list of parts available for a specific appliance model.
 *
 * Expected data shape: {@link ProductListData}
 *   - model_number / brand / appliance_type / description: appliance identity
 *   - parts: full array of Part objects for this model
 *   - total_count: authoritative count from the backend (may exceed parts.length
 *     if the backend paginates)
 *
 * Renders the first PAGE_SIZE (6) parts immediately and toggles to show all on
 * demand.  Newly revealed rows animate in with a staggered slide-up to avoid a
 * jarring layout jump.  Part links fall back to the PartSelect search URL when
 * partselect_url is absent, matching the same logic used in ProductCard.
 */

"use client";

import { useState } from "react";
import type { ProductListData } from "@/lib/types";

const PAGE_SIZE = 6;

interface ProductListCardProps {
  data: ProductListData;
}

export default function ProductListCard({ data }: ProductListCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleParts = expanded ? data.parts : data.parts.slice(0, PAGE_SIZE);
  const hasMore = data.parts.length > PAGE_SIZE;

  return (
    <div
      className="rounded-2xl overflow-hidden w-full sm:max-w-sm animate-slide-up"
      style={{
        background: "rgba(26,24,32,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        transition: "box-shadow 0.22s ease, border-color 0.22s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(212,168,83,0.2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
      }}
    >
      {/* Amber top accent */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #d4a853 0%, #e8c070 50%, transparent 100%)" }} />

      {/* Dark header */}
      <div
        className="px-4 py-3"
        style={{ background: "rgba(15,13,22,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-1)" }}>
            Parts for{" "}
            <span className="part-number" style={{ color: "var(--color-amber)" }}>
              {data.model_number}
            </span>
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: "rgba(212,168,83,0.12)",
              color: "var(--color-amber)",
              border: "1px solid rgba(212,168,83,0.22)",
            }}
          >
            {data.total_count} parts
          </span>
        </div>
        {data.description && (
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--color-text-3)" }}>
            {data.description}
          </p>
        )}
      </div>

      {/* Parts list */}
      <ul>
        {visibleParts.map((part, i) => {
          // Fall back to PartSelect search URL when the part lacks a direct link.
          const url = part.partselect_url || `https://www.partselect.com/search.aspx?SearchTerm=${part.ps_number}`;
          return (
            <li
              key={part.ps_number}
              className="flex items-center justify-between px-4 py-2.5 transition-all duration-150"
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                animation: expanded && i >= PAGE_SIZE
                  ? `slide-up-fade 0.2s cubic-bezier(0.4,0,0.2,1) ${(i - PAGE_SIZE) * 40}ms both`
                  : "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div className="min-w-0 flex-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium truncate block transition-colors duration-100"
                  style={{ color: "var(--color-amber)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-amber-light)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-amber)"; }}
                >
                  {part.name}
                </a>
                <p className="part-number text-xs" style={{ color: "var(--color-text-4)" }}>
                  {part.ps_number}
                </p>
              </div>
              <div className="flex-shrink-0 text-right ml-3">
                <p className="text-sm font-bold" style={{ color: "var(--color-amber)" }}>
                  ${part.price.toFixed(2)}
                </p>
                <p
                  className="text-xs font-medium"
                  style={{ color: part.in_stock ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {part.in_stock ? "In Stock" : "Out of Stock"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Expand / collapse footer */}
      {hasMore && (
        <div
          className="px-4 py-2.5 text-center"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            className="press-scale inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150"
            style={{
              color: "var(--color-amber)",
              background: "rgba(212,168,83,0.08)",
              border: "1px solid rgba(212,168,83,0.2)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.14)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.08)"; }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 12 12"
              fill="currentColor"
              className="w-3 h-3 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path fillRule="evenodd" d="M3.22 4.97a.75.75 0 011.06 0L6 6.69l1.72-1.72a.75.75 0 111.06 1.06L6.53 8.28a.75.75 0 01-1.06 0L3.22 6.03a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
            {expanded ? "Show less" : `Show all ${data.total_count} parts`}
          </button>
        </div>
      )}
    </div>
  );
}

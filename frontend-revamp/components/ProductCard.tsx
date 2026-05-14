"use client";

import { useState } from "react";
import type { Part } from "@/lib/types";

interface ProductCardProps {
  data: Part;
}

export default function ProductCard({ data }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const partUrl =
    data.partselect_url ||
    `https://www.partselect.com/search.aspx?SearchTerm=${data.ps_number}`;

  function copyPartNumber() {
    try {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(data.ps_number).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <div
      className="ps-card w-full sm:max-w-sm animate-slide-up"
      style={{
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,168,83,0.12)"
          : "0 4px 16px rgba(0,0,0,0.3)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Amber top accent line */}
      <div
        style={{
          height: "3px",
          background: "linear-gradient(90deg, #d4a853 0%, #e8c070 50%, transparent 100%)",
        }}
      />

      {/* Image area */}
      <div
        className="relative w-full h-40"
        style={{ background: "rgba(20,18,26,0.9)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {data.image_url && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image_url}
            alt={data.name}
            className="object-contain p-4 w-full h-full"
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ filter: "brightness(0.95)" }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="w-10 h-10"
              style={{ color: "rgba(255,255,255,0.15)" }}
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs" style={{ color: "var(--color-text-4)" }}>
              No image available
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Name + category badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className="font-semibold text-sm leading-tight"
            style={{ color: "var(--color-text-1)" }}
          >
            {data.name}
          </h3>
          <span
            className="flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
            style={{
              background: "rgba(212,168,83,0.1)",
              color: "var(--color-amber)",
              border: "1px solid rgba(212,168,83,0.2)",
            }}
          >
            {data.category.replace(/-/g, " ")}
          </span>
        </div>

        {/* Part numbers with copy button */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-3">
          <span className="part-number text-xs flex items-center gap-1" style={{ color: "var(--color-text-3)" }}>
            {data.ps_number}
            <button
              onClick={copyPartNumber}
              title={copied ? "Copied!" : "Copy part number"}
              aria-label={`Copy ${data.ps_number}`}
              className="press-scale ml-0.5 p-0.5 rounded transition-colors duration-150"
              style={{ color: copied ? "var(--color-success)" : "var(--color-text-4)" }}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M10.22 3.22a.75.75 0 011.06 1.06l-5.25 5.25a.75.75 0 01-1.06 0L2.22 6.78a.75.75 0 011.06-1.06L5.5 7.94l4.72-4.72z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
                  <rect x="4" y="4" width="7" height="7" rx="1" />
                  <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </span>
          {data.mfr_number && (
            <span className="part-number text-xs" style={{ color: "var(--color-text-4)" }}>
              MFR: {data.mfr_number}
            </span>
          )}
        </div>

        {/* Price + stock */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--color-amber)" }}
          >
            ${data.price.toFixed(2)}
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={
              data.in_stock
                ? {
                    background: "rgba(74,222,128,0.1)",
                    color: "var(--color-success)",
                    border: "1px solid rgba(74,222,128,0.2)",
                    animation: "glow-pulse 2.5s ease-in-out infinite",
                  }
                : {
                    background: "rgba(248,113,113,0.1)",
                    color: "var(--color-danger)",
                    border: "1px solid rgba(248,113,113,0.2)",
                  }
            }
          >
            {data.in_stock ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                <path fillRule="evenodd" d="M10.22 3.22a.75.75 0 011.06 1.06l-5.25 5.25a.75.75 0 01-1.06 0L2.22 6.78a.75.75 0 011.06-1.06L5.5 7.94l4.72-4.72z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                <path d="M3.22 3.22a.75.75 0 011.06 0L6 4.94l1.72-1.72a.75.75 0 111.06 1.06L7.06 6l1.72 1.72a.75.75 0 11-1.06 1.06L6 7.06l-1.72 1.72a.75.75 0 01-1.06-1.06L4.94 6 3.22 4.28a.75.75 0 010-1.06z" />
              </svg>
            )}
            {data.in_stock ? "In Stock" : "Out of Stock"}
          </span>
        </div>

        {/* Description */}
        {data.description && (
          <p
            className="text-xs leading-relaxed mb-3 line-clamp-2"
            style={{ color: "var(--color-text-3)" }}
          >
            {data.description}
          </p>
        )}

        {/* CTA */}
        <a
          href={partUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shimmer-btn press-scale flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
          style={{
            color: "#0d0f14",
            boxShadow: "0 2px 12px rgba(212,168,83,0.3)",
            transition: "box-shadow 0.2s ease, transform 0.08s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(212,168,83,0.45)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(212,168,83,0.3)";
          }}
        >
          View on PartSelect
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 010-1.06L9.44 5.5H5.75a.75.75 0 010-1.5h5.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V6.56l-5.22 5.22a.75.75 0 01-1.06 0z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
    </div>
  );
}

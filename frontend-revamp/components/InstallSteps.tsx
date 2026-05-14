/**
 * @file InstallSteps — interactive installation guide for a single spare part.
 *
 * Expected data shape: {@link InstallStepsData}
 *   - part_number / part_name: identify the part being installed
 *   - steps: ordered array of instruction strings; each step is clickable to
 *     toggle its completion state
 *   - estimated_time: human-readable duration string (e.g. "30–45 minutes")
 *   - tools_needed: array of tool names; falls back to "No tools required"
 *
 * Tracks completed steps in a local Set<number> to drive the progress bar and
 * per-step visual states.  Shows a completion banner when all steps are checked.
 */

"use client";

import { useState } from "react";
import type { InstallStepsData } from "@/lib/types";

interface InstallStepsProps {
  data: InstallStepsData;
}

export default function InstallSteps({ data }: InstallStepsProps) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const doneCount = completed.size;
  const totalSteps = data.steps.length;
  const allDone = doneCount === totalSteps && totalSteps > 0;
  const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

  return (
    <div className="ps-card w-full sm:max-w-sm animate-slide-up">
      {/* Amber top accent */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #d4a853 0%, #e8c070 50%, transparent 100%)" }} />

      {/* Dark header */}
      <div
        className="px-4 py-3.5"
        style={{
          background: "rgba(15,13,22,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-80" style={{ color: "var(--color-amber)" }}>
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 6.5A.75.75 0 012.75 10.5h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 11.25zM2 7.75A.75.75 0 012.75 7.5h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 8.25z" clipRule="evenodd" />
            </svg>
            <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-1)" }}>Installation Guide</h3>
          </div>
          {totalSteps > 0 && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: allDone ? "rgba(74,222,128,0.15)" : "rgba(212,168,83,0.12)",
                color: allDone ? "var(--color-success)" : "var(--color-amber)",
                border: allDone ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(212,168,83,0.25)",
                transition: "all 0.3s ease",
              }}
            >
              {allDone ? "✓ Complete" : `${doneCount}/${totalSteps}`}
            </span>
          )}
        </div>
        <p className="text-xs part-number" style={{ color: "var(--color-text-4)" }}>
          {data.part_name} · {data.part_number}
        </p>

        {totalSteps > 0 && (
          <div
            className="mt-2.5 h-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: allDone
                  ? "var(--color-success)"
                  : "linear-gradient(90deg, #d4a853, #e8c070)",
                transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </div>
        )}
      </div>

      {/* Meta info */}
      {(data.estimated_time || (data.tools_needed && data.tools_needed.length > 0)) && (
        <div
          className="flex flex-wrap gap-4 px-4 py-2.5 text-xs"
          style={{
            background: "rgba(212,168,83,0.05)",
            borderBottom: "1px solid rgba(212,168,83,0.1)",
          }}
        >
          {data.estimated_time && (
            <span className="flex items-center gap-1.5" style={{ color: "var(--color-amber)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M1 8a7 7 0 1114 0A7 7 0 011 8zm7.75-4.25a.75.75 0 00-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 000-1.5h-2.5v-3.5z" clipRule="evenodd" />
              </svg>
              {data.estimated_time}
            </span>
          )}
          <span className="flex items-center gap-1.5" style={{ color: "var(--color-amber)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M5.433 2.304A4.492 4.492 0 003 6.5c0 1.696.937 3.173 2.308 3.946.393.22.66.607.66 1.054v1a.75.75 0 001.5 0v-1c0-.447.267-.834.66-1.054A4.492 4.492 0 0010 6.5a4.492 4.492 0 00-2.433-3.948.75.75 0 00-.134-.248zm1.567.696a3 3 0 10-2 5.288V5.5a.75.75 0 011.5 0v2.788A3 3 0 007 3z" clipRule="evenodd" />
            </svg>
            {data.tools_needed?.length > 0 ? data.tools_needed.join(", ") : "No tools required"}
          </span>
        </div>
      )}

      {/* Safety notice */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-xs"
        style={{
          background: "rgba(251,191,36,0.06)",
          borderBottom: "1px solid rgba(251,191,36,0.12)",
          color: "var(--color-warning)",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
          <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 01-1.299 2.25H2.804a1.5 1.5 0 01-1.3-2.25l5.197-9zM8 4a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <span>Unplug your appliance before starting any repair.</span>
      </div>

      {/* Interactive steps */}
      <ol>
        {data.steps.map((step, i) => {
          const done = completed.has(i);
          return (
            <li
              key={i}
              onClick={() => toggle(i)}
              className="flex gap-3 px-4 py-3 cursor-pointer select-none transition-all duration-200"
              style={{
                borderBottom: i < data.steps.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                background: done ? "rgba(74,222,128,0.05)" : "transparent",
                opacity: done ? 0.65 : 1,
              }}
              title={done ? "Click to mark incomplete" : "Click to mark complete"}
            >
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                style={{
                  background: done
                    ? "var(--color-success)"
                    : "linear-gradient(135deg, #d4a853 0%, #e8c070 100%)",
                  color: done ? "white" : "#0d0f14",
                  boxShadow: done
                    ? "0 1px 6px rgba(74,222,128,0.3)"
                    : "0 1px 6px rgba(212,168,83,0.3)",
                  minWidth: "24px",
                  transition: "background 0.25s ease, box-shadow 0.25s ease",
                }}
              >
                {done ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                    style={{ strokeDasharray: 20, animation: "check-draw 0.25s ease-out forwards" }}
                  >
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>

              <p
                className="text-sm leading-relaxed"
                style={{
                  color: done ? "var(--color-text-4)" : "var(--color-text-2)",
                  textDecoration: done ? "line-through" : "none",
                  transition: "color 0.2s ease",
                }}
              >
                {step}
              </p>
            </li>
          );
        })}
      </ol>

      {/* Completion celebration */}
      {allDone && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium animate-slide-up"
          style={{
            background: "rgba(74,222,128,0.08)",
            borderTop: "1px solid rgba(74,222,128,0.2)",
            color: "var(--color-success)",
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.086l4.25-5.5z" clipRule="evenodd" />
          </svg>
          All steps complete — repair done!
        </div>
      )}
    </div>
  );
}

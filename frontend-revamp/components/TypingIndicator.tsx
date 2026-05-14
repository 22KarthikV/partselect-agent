/**
 * @file TypingIndicator — animated "thinking" bubble shown while the assistant streams.
 *
 * Displays three bouncing amber dots with a CSS keyframe animation defined in
 * globals.css (.typing-dot).  An optional label prop (e.g. "Searching catalog…")
 * is rendered next to the dots to communicate which tool the backend is currently
 * executing.  A visually-hidden aria-live region repeats the label for screen readers.
 *
 * The completedSteps prop is accepted in the interface for potential future use
 * (e.g. a reasoning breadcrumb) but is not currently rendered.
 */

"use client";

interface TypingIndicatorProps {
  label?: string;
  completedSteps?: string[];
}

export default function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5 msg-in">
      {/* Amber PS avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mt-0.5 select-none"
        style={{
          background: "linear-gradient(135deg, #d4a853 0%, #e8c070 60%, #c9993a 100%)",
          boxShadow: "0 2px 10px rgba(212,168,83,0.35)",
          color: "#0d0f14",
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: "11px",
          letterSpacing: "0.04em",
        }}
        aria-hidden="true"
      >
        PS
      </div>

      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: "rgba(26,24,32,0.8)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderLeft: "2px solid rgba(42,159,163,0.45)",
          borderRadius: "5px 20px 20px 20px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
        }}
      >
        {/* Animated dots */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="typing-dot w-2 h-2 rounded-full"
              style={{ background: "var(--color-amber)" }}
            />
          ))}
        </div>

        {/* Current step label */}
        {label && (
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text-3)" }}
          >
            {label}
          </span>
        )}

        <span className="sr-only" aria-live="polite">
          {label ?? "Assistant is thinking"}
        </span>
      </div>
    </div>
  );
}

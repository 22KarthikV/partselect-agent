"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  focusTrigger?: number;
  detectedModel?: string;
}

export default function InputBar({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask about a part, describe a problem, or enter a model number...",
  focusTrigger,
  detectedModel,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea up to 6 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24)}px`;
  }, [value]);

  // Re-focus after each send completes
  useEffect(() => {
    if (focusTrigger) textareaRef.current?.focus();
  }, [focusTrigger]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div
      className="flex-shrink-0 px-3 sm:px-4 py-2.5 sm:py-3"
      style={{
        background: "rgba(10,9,16,0.94)",
        borderTop: "1px solid rgba(212,168,83,0.1)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Model memory indicator */}
      {detectedModel && (
        <div className="flex items-center gap-1.5 mb-2 animate-slide-up">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
            style={{
              background: "rgba(212,168,83,0.1)",
              border: "1px solid rgba(212,168,83,0.22)",
              color: "var(--color-amber)",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0">
              <path fillRule="evenodd" d="M2 2.5A.5.5 0 012.5 2h7a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-7zM3 3v6h6V3H3z" clipRule="evenodd" />
              <path d="M4.5 4.5h3v1h-3zM4.5 6.5h2v1h-2z" />
            </svg>
            Model: <span className="part-number">{detectedModel}</span>
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-4)" }}>remembered</span>
        </div>
      )}

      {/* Input wrapper */}
      <div
        className="flex items-end gap-2 rounded-2xl px-4 py-2.5 transition-all duration-200"
        style={{
          background: isFocused ? "rgba(30,28,38,0.9)" : "rgba(26,24,32,0.85)",
          border: isFocused
            ? "1.5px solid rgba(212,168,83,0.45)"
            : "1.5px solid rgba(255,255,255,0.07)",
          boxShadow: isFocused
            ? "0 0 0 3px rgba(212,168,83,0.1), 0 4px 16px rgba(0,0,0,0.3)"
            : "0 2px 8px rgba(0,0,0,0.2)",
          backdropFilter: "blur(8px)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent text-base sm:text-sm leading-6 outline-none disabled:opacity-40"
          style={{
            color: "var(--color-text-1)",
            minHeight: "24px",
            caretColor: "var(--color-amber)",
          }}
          aria-label="Chat message input"
        />

        {/* Send button */}
        <button
          onClick={() => onSend()}
          disabled={!canSend}
          className="flex-shrink-0 w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer press-scale"
          style={{
            background: canSend
              ? "linear-gradient(135deg, #d4a853 0%, #e8c070 60%, #c9993a 100%)"
              : "rgba(255,255,255,0.06)",
            color: canSend ? "#0d0f14" : "rgba(255,255,255,0.2)",
            cursor: canSend ? "pointer" : "not-allowed",
            boxShadow: canSend ? "0 2px 10px rgba(212,168,83,0.35)" : "none",
          }}
          onMouseEnter={(e) => {
            if (canSend)
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 18px rgba(212,168,83,0.5)";
          }}
          onMouseLeave={(e) => {
            if (canSend)
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(212,168,83,0.35)";
          }}
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.414 4.926A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.897 28.897 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z" />
          </svg>
        </button>
      </div>

      {/* Keyboard hint — desktop only */}
      <p className="hidden sm:block text-center text-xs mt-2" style={{ color: "var(--color-text-4)" }}>
        <kbd
          className="font-mono px-1.5 py-0.5 rounded text-xs"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-3)",
          }}
        >
          Enter
        </kbd>
        {" "}to send ·{" "}
        <kbd
          className="font-mono px-1.5 py-0.5 rounded text-xs"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-3)",
          }}
        >
          Shift+Enter
        </kbd>
        {" "}for newline
      </p>
    </div>
  );
}

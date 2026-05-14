"use client";

import { useState, useEffect, useRef } from "react";
import ChatWidget from "@/components/ChatWidget";
import HistorySidebar from "@/components/HistorySidebar";
import type { UIMessage } from "@/lib/types";

const DEMO_SCENARIOS = [
  {
    label: "Ice maker diagnosis",
    query: "The ice maker on my Whirlpool fridge is not working. How can I fix it?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5h.75a.75.75 0 010 1.5H10.75v.75l1.06 1.06a.75.75 0 11-1.06 1.06L10 6.56l-.75.75V9a.75.75 0 01-1.5 0V7.31l-.75-.75-.75.75V9a.75.75 0 01-1.5 0V7.5h-.75a.75.75 0 010-1.5h.75V4.75a.75.75 0 011.5 0v.5l.75-.75V1.75A.75.75 0 0110 1zM5.5 9.5a.75.75 0 00-1.5 0v4.25l-1.25.83a.75.75 0 00.83 1.24L5 14.94l1.42.83a.75.75 0 10.75-1.3L6 13.75V9.5zM14.5 9.5a.75.75 0 00-1.5 0v4.25l-1.17.78a.75.75 0 10.83 1.24L14 14.94l1.42.83a.75.75 0 10.75-1.3L15 13.75V9.5z" clipRule="evenodd" />
      </svg>
    ),
    badge: "Diagnosis",
  },
  {
    label: "Compatibility check",
    query: "Is part PS11752778 compatible with my WDT780SAEM1?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
      </svg>
    ),
    badge: "Compatibility",
  },
  {
    label: "Installation guide",
    query: "How can I install part number PS11752778?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
      </svg>
    ),
    badge: "Install",
  },
  {
    label: "Dishwasher not draining",
    query: "My Whirlpool dishwasher has standing water at the bottom after the cycle. What should I check?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm8-3.5a.75.75 0 01.75.75v2.69l1.28-1.28a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0L7.53 9.72a.75.75 0 111.06-1.06l1.28 1.28V7.25A.75.75 0 0110 6.5z" clipRule="evenodd" />
      </svg>
    ),
    badge: "Diagnosis",
  },
  {
    label: "Parts for my model",
    query: "What parts are available for my Whirlpool dishwasher model WDT780SAEM1?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm5 5.75a.75.75 0 00-1.5 0v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5z" clipRule="evenodd" />
      </svg>
    ),
    badge: "Parts List",
  },
];

interface CatalogStats {
  parts: number;
  refrigerator_parts: number;
  dishwasher_parts: number;
  models: number;
  compatibility_pairs: number;
}

export default function Home() {
  const [demoTrigger, setDemoTrigger] = useState<{ text: string; id: number } | null>(null);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [userId, setUserId] = useState("");
  const [loadedConv, setLoadedConv] = useState<{ id: string; messages: UIMessage[] } | null>(null);
  const demoMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let id = localStorage.getItem("ps_user_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ps_user_id", id);
    }
    setUserId(id);
  }, []);

  useEffect(() => {
    if (!showDemoMenu) return;
    const handler = (e: MouseEvent) => {
      if (demoMenuRef.current && !demoMenuRef.current.contains(e.target as Node)) {
        setShowDemoMenu(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDemoMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [showDemoMenu]);

  const handleDemo = (query: string) => {
    setShowDemoMenu(false);
    setDemoTrigger((prev) => ({ text: query, id: (prev?.id ?? 0) + 1 }));
  };

  const handleLoadConversation = (convId: string, messages: UIMessage[]) => {
    setLoadedConv({ id: convId, messages });
    setChatKey((k) => k + 1);
    setDemoTrigger(null);
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* ── Header — dark glass bar ── */}
      <header
        className="flex-shrink-0 flex items-center gap-2 sm:gap-4 px-3 sm:px-5"
        style={{
          height: "52px",
          background: "rgba(13,11,18,0.88)",
          borderBottom: "1px solid rgba(212,168,83,0.1)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 1px 0 rgba(212,168,83,0.05), 0 4px 24px rgba(0,0,0,0.3)",
          zIndex: 50,
        }}
      >
        {/* Brand mark */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs tracking-wide select-none"
            style={{
              background: "linear-gradient(135deg, #d4a853 0%, #e8c070 60%, #c9993a 100%)",
              color: "#0d0f14",
              boxShadow: "0 2px 12px rgba(212,168,83,0.4)",
              fontFamily: "var(--font-display)",
              fontSize: "11px",
              letterSpacing: "0.06em",
            }}
          >
            PS
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-semibold text-base tracking-tight"
              style={{
                color: "var(--color-text-1)",
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                letterSpacing: "-0.01em",
              }}
            >
              PartSelect
            </span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-md"
              style={{
                background: "rgba(212,168,83,0.15)",
                color: "var(--color-amber)",
                border: "1px solid rgba(212,168,83,0.25)",
                fontFamily: "var(--font-sans)",
              }}
            >
              AI
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-4 w-px flex-shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className="status-pulse w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: "#4ade80" }}
          />
          <span className="hidden sm:inline text-sm font-medium" style={{ color: "var(--color-text-2)" }}>
            Online
          </span>
          <span
            className="hidden md:inline-block text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: "rgba(255,255,255,0.14)",
              color: "var(--color-text-1)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            Refrigerators &amp; Dishwashers
          </span>

          {/* Live catalog stats badge */}
          {stats && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(42,159,163,0.08)",
                border: "1px solid rgba(42,159,163,0.2)",
                color: "rgba(42,159,163,0.9)",
              }}
              title={`${stats.refrigerator_parts} refrigerator parts · ${stats.dishwasher_parts} dishwasher parts · ${stats.models} models · ${stats.compatibility_pairs.toLocaleString()} compatibility pairs`}
            >
              {/* Pulsing dot */}
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: "rgba(42,159,163,0.9)",
                  animation: "glow-pulse 2.5s ease-in-out infinite",
                }}
              />
              <span>{stats.parts.toLocaleString()} parts</span>
              <span className="hidden md:inline" style={{ opacity: 0.5 }}>·</span>
              {/* Fridge */}
              <span className="hidden md:inline" style={{ opacity: 0.75 }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 inline -mt-0.5 mr-0.5">
                  <path fillRule="evenodd" d="M2.5 1A1.5 1.5 0 001 2.5v7A1.5 1.5 0 002.5 11h7A1.5 1.5 0 0011 9.5v-7A1.5 1.5 0 009.5 1h-7zM2 5h8v4.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5V5zm0-2.5A.5.5 0 012.5 2h7a.5.5 0 01.5.5V4H2V2.5z" clipRule="evenodd" />
                </svg>
                {stats.refrigerator_parts}
              </span>
              <span className="hidden md:inline" style={{ opacity: 0.4 }}>/</span>
              {/* Dishwasher */}
              <span className="hidden md:inline" style={{ opacity: 0.75 }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 inline -mt-0.5 mr-0.5">
                  <path fillRule="evenodd" d="M1 2.5A1.5 1.5 0 012.5 1h7A1.5 1.5 0 0111 2.5v7A1.5 1.5 0 019.5 11h-7A1.5 1.5 0 011 9.5v-7zM6 3a3 3 0 100 6A3 3 0 006 3zm0 1a2 2 0 110 4 2 2 0 010-4z" clipRule="evenodd" />
                </svg>
                {stats.dishwasher_parts}
              </span>
            </div>
          )}
        </div>

        {/* History button */}
        <button
          onClick={() => setShowHistory(true)}
          className="ml-auto flex items-center justify-center sm:justify-start gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--color-text-2)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-2)";
          }}
          title="View chat history"
          aria-label="View chat history"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 sm:w-3.5 sm:h-3.5">
            <path fillRule="evenodd" d="M1 8a7 7 0 1114 0A7 7 0 011 8zm7.75-4.25a.75.75 0 00-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 000-1.5h-2.5V3.75z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">History</span>
        </button>

        {/* New Chat button */}
        <button
          onClick={() => { setLoadedConv(null); setChatKey((k) => k + 1); setDemoTrigger(null); }}
          className="flex items-center justify-center sm:justify-start gap-1.5 w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--color-text-2)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-2)";
          }}
          title="Start a new conversation"
          aria-label="Start a new conversation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 sm:w-3.5 sm:h-3.5">
            <path d="M11.5 1A1.5 1.5 0 0113 2.5v1A1.5 1.5 0 0111.5 5h-7A1.5 1.5 0 013 3.5v-1A1.5 1.5 0 014.5 1h7zM3 6.5A1.5 1.5 0 014.5 5h7A1.5 1.5 0 0113 6.5v1A1.5 1.5 0 0111.5 9h-7A1.5 1.5 0 013 7.5v-1zM4.5 10A1.5 1.5 0 003 11.5v1A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5v-1A1.5 1.5 0 0011.5 10h-7z" />
          </svg>
          <span className="hidden sm:inline">New Chat</span>
        </button>

        {/* Demo dropdown */}
        <div className="relative" ref={demoMenuRef}>
          <button
            onClick={() => setShowDemoMenu((v) => !v)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 h-9 sm:h-auto sm:py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200"
            style={{
              background: showDemoMenu
                ? "rgba(212,168,83,0.18)"
                : "rgba(212,168,83,0.08)",
              color: "var(--color-amber)",
              border: `1px solid ${showDemoMenu ? "rgba(212,168,83,0.35)" : "rgba(212,168,83,0.2)"}`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.16)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(212,168,83,0.3)";
            }}
            onMouseLeave={(e) => {
              if (!showDemoMenu) {
                (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.08)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(212,168,83,0.2)";
              }
            }}
            aria-expanded={showDemoMenu}
            aria-haspopup="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 sm:w-3.5 sm:h-3.5 opacity-80">
              <path d="M3 3.5A1.5 1.5 0 014.5 2h7A1.5 1.5 0 0113 3.5v9a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 12.5v-9zM5.5 5.75a.75.75 0 000 1.5H8a.75.75 0 000-1.5H5.5zm0 2.75a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H5.5z" />
            </svg>
            <span className="hidden sm:inline">Try a </span>Demo
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3 opacity-70 transition-transform duration-200"
              style={{ transform: showDemoMenu ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {showDemoMenu && (
            <div
              className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl overflow-hidden z-50 animate-slide-up"
              style={{
                background: "rgba(18,16,26,0.97)",
                border: "1px solid rgba(212,168,83,0.18)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.08)",
                backdropFilter: "blur(20px)",
              }}
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" style={{ color: "var(--color-amber)" }}>
                  <path d="M7.557 2.066A.75.75 0 018.44 2.75L9.568 8.25l.587-.587A.75.75 0 0111.5 9a.75.75 0 01-.586 1.25l-2.25 2.25a.75.75 0 01-1.178-.257l-1.125-4.5a.75.75 0 01.543-.914l.653-.163z" />
                </svg>
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-3)" }}
                >
                  Demo Scenarios
                </span>
              </div>
              {DEMO_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.label}
                  onClick={() => handleDemo(scenario.query)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 cursor-pointer transition-all duration-150"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.07)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ background: "rgba(212,168,83,0.12)", color: "var(--color-amber)" }}
                  >
                    {scenario.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text-1)" }}>
                        {scenario.label}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: "rgba(212,168,83,0.12)", color: "var(--color-amber)" }}
                      >
                        {scenario.badge}
                      </span>
                    </div>
                    <p className="text-xs leading-snug truncate" style={{ color: "var(--color-text-3)" }}>
                      {scenario.query}
                    </p>
                  </div>
                </button>
              ))}
              <div className="px-4 py-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs" style={{ color: "var(--color-text-4)" }}>
                  Sends the query automatically and clears the chat
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <ChatWidget
          key={chatKey}
          demoTrigger={demoTrigger}
          userId={userId}
          initialMessages={loadedConv?.messages}
          initialSessionId={loadedConv?.id}
        />
      </main>

      <HistorySidebar
        userId={userId}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={handleLoadConversation}
      />
    </div>
  );
}

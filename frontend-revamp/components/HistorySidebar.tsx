"use client";

import { useEffect, useState } from "react";
import type { ConversationSummary, UIMessage } from "@/lib/types";
import { fetchConversationMessages, fetchConversations } from "@/lib/api";

interface HistorySidebarProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (convId: string, messages: UIMessage[]) => void;
}

function groupByDate(convs: ConversationSummary[]): { label: string; items: ConversationSummary[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const groups: Record<string, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };

  for (const c of convs) {
    const t = new Date(c.updated_at).getTime();
    if (t >= todayStart) groups["Today"].push(c);
    else if (t >= yesterdayStart) groups["Yesterday"].push(c);
    else if (t >= weekStart) groups["This week"].push(c);
    else groups["Older"].push(c);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function HistorySidebar({ userId, isOpen, onClose, onSelect }: HistorySidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    setLoading(true);
    fetchConversations(userId).then((data) => {
      setConversations(data);
      setLoading(false);
    });
  }, [isOpen, userId]);

  const handleSelect = async (conv: ConversationSummary) => {
    setLoadingId(conv.id);
    const messages = await fetchConversationMessages(conv.id);
    setLoadingId(null);
    onSelect(conv.id, messages);
    onClose();
  };

  const groups = groupByDate(conversations);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <aside
        className="fixed top-0 left-0 h-full z-50 flex flex-col"
        style={{
          width: "300px",
          background: "rgba(13,11,18,0.98)",
          borderRight: "1px solid rgba(212,168,83,0.12)",
          boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-amber)" }}>
              <path fillRule="evenodd" d="M1 8a7 7 0 1114 0A7 7 0 011 8zm7.75-4.25a.75.75 0 00-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 000-1.5h-2.5V3.75z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-1)" }}>
              Chat History
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150"
            style={{ color: "var(--color-text-3)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-1)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-3)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            aria-label="Close history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex flex-col gap-2 px-3 py-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl animate-pulse"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3 py-12">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10" style={{ color: "var(--color-text-4)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p className="text-sm" style={{ color: "var(--color-text-4)" }}>
                No conversations yet.<br />Start chatting to build your history.
              </p>
            </div>
          ) : (
            groups.map(({ label, items }) => (
              <div key={label} className="mb-1">
                <p
                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-4)" }}
                >
                  {label}
                </p>
                {items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv)}
                    disabled={loadingId === conv.id}
                    className="w-full text-left px-4 py-2.5 flex flex-col gap-0.5 cursor-pointer transition-all duration-150"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.06)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-medium leading-snug truncate flex-1"
                        style={{ color: "var(--color-text-1)" }}
                      >
                        {loadingId === conv.id ? (
                          <span style={{ color: "var(--color-amber)" }}>Loading…</span>
                        ) : (
                          conv.title
                        )}
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-4)" }}>
                        {relativeTime(conv.updated_at)}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-text-4)" }}>
                      {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-4 py-3 text-xs"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "var(--color-text-4)",
          }}
        >
          History saved on this device only
        </div>
      </aside>
    </>
  );
}

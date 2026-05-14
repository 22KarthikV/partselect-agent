"use client";

import ReactMarkdown from "react-markdown";
import type {
  UIMessage,
  RichCard,
  Part,
  CompatibilityData,
  InstallStepsData,
  TroubleshootData,
  ProductListData,
  OrderStatusData,
} from "@/lib/types";
import ProductCard from "./ProductCard";
import CompatibilityBadge from "./CompatibilityBadge";
import InstallSteps from "./InstallSteps";
import TroubleshootCard from "./TroubleshootCard";
import OrderStatusCard from "./OrderStatusCard";
import ProductListCard from "./ProductListCard";

interface MessageBubbleProps {
  message: UIMessage;
}

function RichCardRenderer({ card }: { card: RichCard }) {
  switch (card.content_type) {
    case "product_card":
      return <ProductCard data={card.data as Part} />;
    case "compatibility":
      return <CompatibilityBadge data={card.data as CompatibilityData} />;
    case "install_steps":
      return <InstallSteps data={card.data as InstallStepsData} />;
    case "troubleshoot":
      return <TroubleshootCard data={card.data as TroubleshootData} />;
    case "product_list":
      return <ProductListCard data={card.data as ProductListData} />;
    case "order_status":
      return <OrderStatusCard data={card.data as OrderStatusData} />;
    default:
      return null;
  }
}

/* ── Amber PS avatar for assistant ── */
function PSAvatar() {
  return (
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
      aria-label="PartSelect AI"
    >
      PS
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end px-3 sm:px-4 py-1.5 msg-in">
        <div className="max-w-[85%] sm:max-w-[76%]">
          <div
            className="px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "linear-gradient(135deg, #d4a853 0%, #e8c070 55%, #c9993a 100%)",
              color: "#0d0f14",
              borderRadius: "20px 20px 5px 20px",
              boxShadow: "0 4px 20px rgba(212,168,83,0.28), 0 1px 4px rgba(0,0,0,0.15)",
              fontWeight: 500,
            }}
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-2 sm:gap-2.5 px-3 sm:px-4 py-1.5 msg-in">
      <PSAvatar />

      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Text bubble — hidden when rich cards are present to avoid duplication */}
        {message.text && message.richCards.length === 0 && (
          <div
            className="inline-block max-w-full px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "rgba(26,24,32,0.8)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "var(--color-text-1)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderLeft: "2px solid rgba(42,159,163,0.55)",
              borderRadius: "5px 20px 20px 20px",
              boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="prose prose-sm max-w-none
                prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                prose-headings:mt-2 prose-headings:mb-1
                prose-strong:font-semibold prose-hr:my-2"
              style={{
                color: "var(--color-text-1)",
              }}
            >
              <ReactMarkdown
                components={{
                  a: ({ ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-amber)", textDecoration: "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                    />
                  ),
                  strong: ({ ...props }) => (
                    <strong {...props} style={{ color: "var(--color-text-1)", fontWeight: 600 }} />
                  ),
                  code: ({ ...props }) => (
                    <code
                      {...props}
                      style={{
                        fontFamily: "var(--font-mono)",
                        background: "rgba(212,168,83,0.1)",
                        border: "1px solid rgba(212,168,83,0.15)",
                        borderRadius: "4px",
                        padding: "1px 5px",
                        fontSize: "0.8em",
                        color: "var(--color-amber)",
                      }}
                    />
                  ),
                }}
              >
                {message.text}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Rich cards */}
        {message.richCards.map((card, i) => (
          <RichCardRenderer key={`${card.content_type}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

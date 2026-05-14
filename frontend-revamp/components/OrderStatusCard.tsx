"use client";

import type { OrderStatusData } from "@/lib/types";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  processing: {
    label: "Processing",
    color: "var(--color-warning)",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.2)",
  },
  shipped: {
    label: "Shipped",
    color: "var(--color-amber)",
    bg: "rgba(212,168,83,0.08)",
    border: "rgba(212,168,83,0.2)",
  },
  delivered: {
    label: "Delivered",
    color: "var(--color-success)",
    bg: "rgba(74,222,128,0.08)",
    border: "rgba(74,222,128,0.2)",
  },
  not_found: {
    label: "Not Found",
    color: "var(--color-danger)",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.2)",
  },
};

interface OrderStatusCardProps {
  data: OrderStatusData;
}

export default function OrderStatusCard({ data }: OrderStatusCardProps) {
  const cfg = STATUS_CONFIG[data.status] ?? {
    label: data.status,
    color: "var(--color-text-2)",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
  };

  if (data.status === "not_found") {
    return (
      <div
        className="rounded-2xl px-4 py-3 w-full sm:max-w-sm"
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          backdropFilter: "blur(8px)",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: cfg.color }}>
          Order Not Found
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-3)" }}>
          {data.message ?? `Order #${data.order_id} could not be found.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden w-full sm:max-w-sm"
      style={{
        background: "rgba(26,24,32,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      {/* Amber top accent */}
      <div style={{ height: "3px", background: "linear-gradient(90deg, #d4a853 0%, #e8c070 50%, transparent 100%)" }} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: cfg.bg,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>
          <p className="text-xs" style={{ color: "var(--color-text-4)" }}>Order #</p>
          <p className="part-number font-semibold text-sm" style={{ color: "var(--color-text-1)" }}>
            {data.order_id}
          </p>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
          }}
        >
          {cfg.label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Delivery info */}
        <div className="flex gap-4 text-xs">
          {data.estimated_delivery && (
            <div>
              <p style={{ color: "var(--color-text-4)" }}>Est. delivery</p>
              <p className="font-medium" style={{ color: "var(--color-text-1)" }}>
                {data.estimated_delivery}
              </p>
            </div>
          )}
          {data.tracking_number && (
            <div>
              <p style={{ color: "var(--color-text-4)" }}>Tracking</p>
              <p className="part-number font-medium" style={{ color: "var(--color-amber)" }}>
                {data.tracking_number}
              </p>
            </div>
          )}
        </div>

        {/* Items */}
        {data.items?.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-3)" }}>
              Items ordered
            </p>
            <ul className="space-y-1.5">
              {data.items.map((item, i) => (
                <li key={i} className="flex justify-between text-xs">
                  <span style={{ color: "var(--color-text-2)" }}>
                    {item.name}{" "}
                    {item.quantity > 1 && (
                      <span style={{ color: "var(--color-text-4)" }}>×{item.quantity}</span>
                    )}
                  </span>
                  <span className="font-medium" style={{ color: "var(--color-amber)" }}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

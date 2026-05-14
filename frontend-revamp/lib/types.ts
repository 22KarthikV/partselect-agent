/**
 * @file Shared TypeScript types for the PartSelect AI chat UI.
 *
 * All catalog interfaces mirror the corresponding backend Pydantic schemas so
 * that the SSE payload can be cast directly without a runtime transformation
 * step.  The UI-only types (UIMessage, RichCard, etc.) extend or wrap those
 * backend shapes to carry the extra state needed by React components.
 */

/** A single turn in the conversation sent to / received from the backend. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Part / catalog types (mirror backend Pydantic schemas) ---

/** A single spare part as returned by the catalog API. */
export interface Part {
  ps_number: string;
  mfr_number: string;
  name: string;
  appliance_type: string;
  category: string;
  price: number;
  in_stock: boolean;
  description: string;
  install_steps: string[];
  image_url: string;
  partselect_url: string;
}

/** A part ranked by the diagnosis engine with an explanation of its likelihood. */
export interface DiagnosedPart {
  part: Part;
  likelihood: "most_likely" | "possible" | "less_likely";
  reason: string;
}

/** Result of a part-to-model compatibility check. */
export interface CompatibilityData {
  part_number: string;
  model_number: string;
  is_compatible: boolean;
  explanation: string;
  part_name: string;
  model_description: string;
  /** Suggested compatible parts when is_compatible is false. */
  alternative_parts: Part[];
}

/** Step-by-step installation guidance for a single part. */
export interface InstallStepsData {
  part_number: string;
  part_name: string;
  steps: string[];
  estimated_time: string;
  tools_needed: string[];
}

/** Symptom-based diagnosis result with ranked candidate parts. */
export interface TroubleshootData {
  appliance_type: string;
  symptom: string;
  diagnosed_parts: DiagnosedPart[];
  repair_guidance: string;
  safety_note: string;
}

/** A list of parts associated with a specific appliance model. */
export interface ProductListData {
  model_number: string;
  brand: string;
  appliance_type: string;
  description: string;
  parts: Part[];
  total_count: number;
}

/** A single line item within an order. */
export interface OrderItem {
  ps_number: string;
  name: string;
  quantity: number;
  price: number;
}

/**
 * Order status as returned by the backend.
 * status values: "processing" | "shipped" | "delivered" | "not_found"
 * When status is "not_found" the items array is empty and message explains why.
 */
export interface OrderStatusData {
  order_id: string;
  status: string;
  estimated_delivery: string;
  tracking_number: string;
  items: OrderItem[];
  message?: string;
}

// --- SSE events from backend ---

/**
 * Discriminated union of all event types streamed over SSE from the backend.
 * The client iterates these in order: tool_call* → token* → rich_content? → done.
 */
export type SSEEvent =
  | { type: "tool_call"; tool: string; label?: string; status: "running" }
  | { type: "token"; content: string }
  | { type: "rich_content"; content_type: RichContentType; data: RichContentData }
  | { type: "error"; message: string }
  | { type: "done" };

/** Identifies which rich-card component should render a piece of structured data. */
export type RichContentType =
  | "product_card"
  | "compatibility"
  | "install_steps"
  | "troubleshoot"
  | "product_list"
  | "order_status";

/** Union of all structured data payloads that may arrive in a rich_content event. */
export type RichContentData =
  | Part
  | CompatibilityData
  | InstallStepsData
  | TroubleshootData
  | ProductListData
  | OrderStatusData;

// --- UI message model ---

/** A structured card rendered below (or instead of) the assistant's text bubble. */
export interface RichCard {
  content_type: RichContentType;
  data: RichContentData;
}

/** The full in-memory representation of a single chat turn shown in the UI. */
export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  richCards: RichCard[];
  isStreaming: boolean;
  /** Current tool being called — displayed inside TypingIndicator. */
  toolLabel?: string;
  /** Accumulated tool labels shown as a reasoning breadcrumb in TypingIndicator. */
  completedSteps?: string[];
}

/** Serialisable form of a UIMessage written to the persistence API. */
export interface SaveMessage {
  role: "user" | "assistant";
  content: string;
  rich_cards: RichCard[];
}

/** Metadata for a past conversation listed in HistorySidebar. */
export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

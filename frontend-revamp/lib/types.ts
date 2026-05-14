// Shared TypeScript types for the PartSelect AI chat UI

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Part / catalog types (mirror backend Pydantic schemas) ---

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

export interface DiagnosedPart {
  part: Part;
  likelihood: "most_likely" | "possible" | "less_likely";
  reason: string;
}

export interface CompatibilityData {
  part_number: string;
  model_number: string;
  is_compatible: boolean;
  explanation: string;
  part_name: string;
  model_description: string;
  alternative_parts: Part[];
}

export interface InstallStepsData {
  part_number: string;
  part_name: string;
  steps: string[];
  estimated_time: string;
  tools_needed: string[];
}

export interface TroubleshootData {
  appliance_type: string;
  symptom: string;
  diagnosed_parts: DiagnosedPart[];
  repair_guidance: string;
  safety_note: string;
}

export interface ProductListData {
  model_number: string;
  brand: string;
  appliance_type: string;
  description: string;
  parts: Part[];
  total_count: number;
}

export interface OrderItem {
  ps_number: string;
  name: string;
  quantity: number;
  price: number;
}

export interface OrderStatusData {
  order_id: string;
  status: string;
  estimated_delivery: string;
  tracking_number: string;
  items: OrderItem[];
  message?: string;
}

// --- SSE events from backend ---

export type SSEEvent =
  | { type: "tool_call"; tool: string; label?: string; status: "running" }
  | { type: "token"; content: string }
  | { type: "rich_content"; content_type: RichContentType; data: RichContentData }
  | { type: "error"; message: string }
  | { type: "done" };

export type RichContentType =
  | "product_card"
  | "compatibility"
  | "install_steps"
  | "troubleshoot"
  | "product_list"
  | "order_status";

export type RichContentData =
  | Part
  | CompatibilityData
  | InstallStepsData
  | TroubleshootData
  | ProductListData
  | OrderStatusData;

// --- UI message model ---

export interface RichCard {
  content_type: RichContentType;
  data: RichContentData;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  richCards: RichCard[];
  isStreaming: boolean;
  toolLabel?: string;       // current tool being called (shown in TypingIndicator)
  completedSteps?: string[]; // accumulated tool labels — shown as breadcrumb in TypingIndicator
}

export interface SaveMessage {
  role: "user" | "assistant";
  content: string;
  rich_cards: RichCard[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

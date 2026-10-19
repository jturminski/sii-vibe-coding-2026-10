export const CASE_TYPES = {
  RETURN: "Zwrot",
  COMPLAINT: "Reklamacja",
} as const;
export type CaseType = keyof typeof CASE_TYPES;

/** Equipment categories in display order (PRD AC-02). */
export const CATEGORIES = {
  SMARTPHONE: "Smartfon",
  LAPTOP: "Laptop",
  TABLET: "Tablet",
  HEADPHONES: "Słuchawki",
  SMARTWATCH: "Smartwatch / opaska",
  TV_MONITOR: "Telewizor / monitor",
  GAME_CONSOLE: "Konsola do gier",
  CAMERA: "Aparat fotograficzny",
  OTHER: "Inne",
} as const;
export type Category = keyof typeof CATEGORIES;

/** Decision statuses with Polish labels (PRD AC-16). */
export const DECISION_STATUSES = {
  ACCEPTED: "Przyjęte",
  REJECTED: "Odrzucone",
  MANUAL_REVIEW: "Do weryfikacji przez specjalistę",
  NEEDS_INFO: "Potrzebne dodatkowe informacje",
} as const;
export type DecisionStatus = keyof typeof DECISION_STATUSES;

export const LIMITS = {
  MAX_IMAGE_BYTES: 10_485_760,
  MODEL_NAME_MAX: 100,
  REASON_MAX: 2000,
  COMPLAINT_REASON_MIN: 20,
  CHAT_MESSAGE_MAX: 2000,
  MAX_USER_MESSAGES: 20,
  REQUEST_TIMEOUT_MS: 60_000,
  IMAGE_MAX_EDGE: 1568,
  JPEG_QUALITY: 80,
  MAX_CASES: 500,
  MAX_QUESTIONS: 3,
  ALLOWED_IMAGE_MIME: ["image/jpeg", "image/png", "image/webp"],
} as const;
export type AllowedImageMime = (typeof LIMITS.ALLOWED_IMAGE_MIME)[number];

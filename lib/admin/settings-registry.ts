// Declarative registry of all env vars editable in the admin panel.
// Drives both server-side validation (app/api/admin/settings) and UI
// rendering (app/[lang]/admin). Keys are exactly the env var names.
//
// Not listed here (and therefore rejected by the API):
// - NEXT_PUBLIC_* vars: baked into the client bundle at build time
// - ADMIN_PASSWORD / SETTINGS_FILE: bootstrap values, env-only to avoid lockout

import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"

export type SettingType =
    | "string"
    | "secret"
    | "number"
    | "boolean"
    | "enum"
    | "json"

export interface SettingDef {
    key: string
    group: string
    type: SettingType
    label: string
    description?: string
    options?: string[]
    min?: number
    max?: number
    placeholder?: string
    // Value is only picked up at process start (module-load readers)
    restartRequired?: boolean
    // Provider this setting belongs to; rendered inside that provider's
    // collapsible in the Provider Credentials group
    provider?: ProviderName
}

export interface SettingGroup {
    id: string
    title: string
    description: string
    // Optional sections gated by an on/off switch in the panel; fields are
    // grayed out until enabled. Starts on when any field is already set.
    toggleable?: boolean
}

export const SETTING_GROUPS: SettingGroup[] = [
    {
        id: "general",
        title: "General",
        description: "Default AI provider and model used by the server.",
    },
    {
        id: "providers",
        title: "Provider Credentials",
        description:
            "API keys, endpoints, and tuning for each supported provider.",
    },
    {
        id: "models",
        title: "Model Behavior",
        description: "Generation parameters and the multi-model registry.",
    },
    {
        id: "access",
        title: "Access Control",
        description: "Restrict who can use this deployment.",
    },
    {
        id: "features",
        title: "Features",
        description: "Optional features and security toggles.",
    },
    {
        id: "observability",
        title: "Observability",
        description: "Langfuse tracing for LLM calls.",
        toggleable: true,
    },
    {
        id: "quota",
        title: "Quota & Rate Limits",
        description:
            "Per-IP usage limits. Enforcement requires a DynamoDB table.",
        toggleable: true,
    },
]

const PROVIDER_OPTIONS = Object.keys(PROVIDER_INFO)

// Providers with just {PREFIX}_API_KEY + {PREFIX}_BASE_URL env vars.
// Labels and URL placeholders come from PROVIDER_INFO.
const SIMPLE_PROVIDERS: Array<{ provider: ProviderName; prefix?: string }> = [
    { provider: "openrouter" },
    { provider: "deepseek" },
    { provider: "siliconflow" },
    { provider: "sglang" },
    { provider: "gateway", prefix: "AI_GATEWAY" },
    { provider: "doubao" },
    { provider: "modelscope" },
    { provider: "glm" },
    { provider: "qwen" },
    { provider: "kimi" },
    { provider: "qiniu" },
    { provider: "minimax" },
    { provider: "novita" },
]

function simpleProviderSettings(): SettingDef[] {
    return SIMPLE_PROVIDERS.flatMap(
        ({ provider, prefix = provider.toUpperCase() }) => [
            {
                key: `${prefix}_API_KEY`,
                group: "providers",
                provider,
                type: "secret" as const,
                label: "API Key",
            },
            {
                key: `${prefix}_BASE_URL`,
                group: "providers",
                provider,
                type: "string" as const,
                label: "Base URL",
                placeholder: PROVIDER_INFO[provider].defaultBaseUrl,
            },
        ],
    )
}

export const SETTINGS_REGISTRY: SettingDef[] = [
    // ── General ──────────────────────────────────────────────────────
    {
        key: "AI_PROVIDER",
        group: "general",
        type: "enum",
        label: "AI Provider",
        description: "Default provider for chat requests.",
        options: PROVIDER_OPTIONS,
    },
    {
        key: "AI_MODEL",
        group: "general",
        type: "string",
        label: "AI Model",
        description: "Model ID for the chosen provider.",
        placeholder: "e.g. gpt-5.2 or global.anthropic.claude-sonnet-4-5…",
    },

    // ── Providers: AWS Bedrock ───────────────────────────────────────
    {
        key: "AWS_REGION",
        group: "providers",
        provider: "bedrock",
        type: "string",
        label: "AWS Region",
        placeholder: "us-west-2",
    },
    {
        key: "AWS_ACCESS_KEY_ID",
        group: "providers",
        provider: "bedrock",
        type: "secret",
        label: "Access Key ID",
    },
    {
        key: "AWS_SECRET_ACCESS_KEY",
        group: "providers",
        provider: "bedrock",
        type: "secret",
        label: "Secret Access Key",
    },
    {
        key: "BEDROCK_REASONING_BUDGET_TOKENS",
        group: "providers",
        provider: "bedrock",
        type: "number",
        label: "Reasoning Budget Tokens",
        description: "Claude extended-thinking budget (1024–64000).",
        min: 1024,
        max: 64000,
    },
    {
        key: "BEDROCK_REASONING_EFFORT",
        group: "providers",
        provider: "bedrock",
        type: "enum",
        label: "Reasoning Effort",
        description: "For Nova models.",
        options: ["low", "medium", "high"],
    },

    // ── Providers: OpenAI ────────────────────────────────────────────
    {
        key: "OPENAI_API_KEY",
        group: "providers",
        provider: "openai",
        type: "secret",
        label: "API Key",
    },
    {
        key: "OPENAI_BASE_URL",
        group: "providers",
        provider: "openai",
        type: "string",
        label: "Base URL",
        description: "Custom OpenAI-compatible endpoint.",
        placeholder: PROVIDER_INFO.openai.defaultBaseUrl,
    },
    {
        key: "OPENAI_REASONING_EFFORT",
        group: "providers",
        provider: "openai",
        type: "enum",
        label: "Reasoning Effort",
        options: ["minimal", "low", "medium", "high"],
    },
    {
        key: "OPENAI_REASONING_SUMMARY",
        group: "providers",
        provider: "openai",
        type: "enum",
        label: "Reasoning Summary",
        options: ["none", "brief", "detailed"],
    },

    // ── Providers: Anthropic ─────────────────────────────────────────
    {
        key: "ANTHROPIC_API_KEY",
        group: "providers",
        provider: "anthropic",
        type: "secret",
        label: "API Key",
        description: "Sent as x-api-key header.",
    },
    {
        key: "ANTHROPIC_AUTH_TOKEN",
        group: "providers",
        provider: "anthropic",
        type: "secret",
        label: "Auth Token",
        description:
            "Alternative to the API key; sent as Authorization: Bearer.",
    },
    {
        key: "ANTHROPIC_BASE_URL",
        group: "providers",
        provider: "anthropic",
        type: "string",
        label: "Base URL",
        placeholder: PROVIDER_INFO.anthropic.defaultBaseUrl,
    },
    {
        key: "ANTHROPIC_THINKING_TYPE",
        group: "providers",
        provider: "anthropic",
        type: "enum",
        label: "Extended Thinking",
        options: ["enabled"],
    },
    {
        key: "ANTHROPIC_THINKING_BUDGET_TOKENS",
        group: "providers",
        provider: "anthropic",
        type: "number",
        label: "Thinking Budget Tokens",
        min: 1024,
        max: 64000,
    },

    // ── Providers: Google ────────────────────────────────────────────
    {
        key: "GOOGLE_GENERATIVE_AI_API_KEY",
        group: "providers",
        provider: "google",
        type: "secret",
        label: "API Key",
    },
    {
        key: "GOOGLE_BASE_URL",
        group: "providers",
        provider: "google",
        type: "string",
        label: "Base URL",
        placeholder: PROVIDER_INFO.google.defaultBaseUrl,
    },
    {
        key: "GOOGLE_THINKING_BUDGET",
        group: "providers",
        provider: "google",
        type: "number",
        label: "Thinking Budget (Gemini 2.5)",
        min: 1024,
        max: 100000,
    },
    {
        key: "GOOGLE_THINKING_LEVEL",
        group: "providers",
        provider: "google",
        type: "enum",
        label: "Thinking Level (Gemini 3)",
        options: ["low", "high"],
    },
    {
        key: "GOOGLE_REASONING_EFFORT",
        group: "providers",
        provider: "google",
        type: "enum",
        label: "Reasoning Effort",
        options: ["low", "medium", "high"],
    },
    {
        key: "GOOGLE_CANDIDATE_COUNT",
        group: "providers",
        provider: "google",
        type: "number",
        label: "Candidate Count",
        min: 1,
        max: 8,
    },
    {
        key: "GOOGLE_TOP_K",
        group: "providers",
        provider: "google",
        type: "number",
        label: "Top K",
        min: 1,
        max: 100,
    },
    {
        key: "GOOGLE_TOP_P",
        group: "providers",
        provider: "google",
        type: "number",
        label: "Top P",
        min: 0,
        max: 1,
    },

    // ── Providers: Vertex AI ─────────────────────────────────────────
    {
        key: "GOOGLE_VERTEX_API_KEY",
        group: "providers",
        provider: "vertexai",
        type: "secret",
        label: "API Key",
        description: "Express Mode API key.",
    },
    {
        key: "GOOGLE_VERTEX_BASE_URL",
        group: "providers",
        provider: "vertexai",
        type: "string",
        label: "Base URL",
    },
    {
        key: "GOOGLE_VERTEX_THINKING_BUDGET",
        group: "providers",
        provider: "vertexai",
        type: "number",
        label: "Thinking Budget (Gemini 2.5)",
        min: 1024,
        max: 100000,
    },
    {
        key: "GOOGLE_VERTEX_THINKING_LEVEL",
        group: "providers",
        provider: "vertexai",
        type: "enum",
        label: "Thinking Level (Gemini 3)",
        options: ["minimal", "low", "medium", "high"],
    },

    // ── Providers: Azure OpenAI ──────────────────────────────────────
    {
        key: "AZURE_API_KEY",
        group: "providers",
        provider: "azure",
        type: "secret",
        label: "API Key",
    },
    {
        key: "AZURE_RESOURCE_NAME",
        group: "providers",
        provider: "azure",
        type: "string",
        label: "Resource Name",
        description: "Endpoint becomes https://{name}.openai.azure.com.",
    },
    {
        key: "AZURE_BASE_URL",
        group: "providers",
        provider: "azure",
        type: "string",
        label: "Base URL",
        description: "Alternative to resource name; takes precedence.",
    },
    {
        key: "AZURE_REASONING_EFFORT",
        group: "providers",
        provider: "azure",
        type: "enum",
        label: "Reasoning Effort",
        options: ["low", "medium", "high"],
    },
    {
        key: "AZURE_REASONING_SUMMARY",
        group: "providers",
        provider: "azure",
        type: "enum",
        label: "Reasoning Summary",
        options: ["none", "brief", "detailed"],
    },

    // ── Providers: Ollama ────────────────────────────────────────────
    {
        key: "OLLAMA_BASE_URL",
        group: "providers",
        provider: "ollama",
        type: "string",
        label: "Base URL",
        placeholder: PROVIDER_INFO.ollama.defaultBaseUrl,
    },
    {
        key: "OLLAMA_API_KEY",
        group: "providers",
        provider: "ollama",
        type: "secret",
        label: "API Key",
        description: "For Ollama Cloud or authenticated remote instances.",
    },
    {
        key: "OLLAMA_ENABLE_THINKING",
        group: "providers",
        provider: "ollama",
        type: "boolean",
        label: "Enable Thinking",
    },

    ...simpleProviderSettings(),

    // ── Model Behavior ───────────────────────────────────────────────
    {
        key: "TEMPERATURE",
        group: "models",
        type: "number",
        label: "Temperature",
        description:
            "Leave unset for reasoning models that reject temperature.",
        min: 0,
        max: 2,
    },
    {
        key: "MAX_OUTPUT_TOKENS",
        group: "models",
        type: "number",
        label: "Max Output Tokens",
        min: 1,
    },
    {
        key: "AI_MODELS_CONFIG",
        group: "models",
        type: "json",
        label: "Multi-Model Registry (JSON)",
        description:
            'Server model list shown to all users. Schema: {"providers":[{"name":"…","provider":"openai","models":["…"]}]}.',
    },
    {
        key: "AI_MODELS_CONFIG_PATH",
        group: "models",
        type: "string",
        label: "Model Registry File Path",
        description: "Used only when the JSON registry above is empty.",
        placeholder: "./ai-models.json",
    },

    // ── Access Control ───────────────────────────────────────────────
    {
        key: "ACCESS_CODE_LIST",
        group: "access",
        type: "string",
        label: "Access Codes",
        description:
            "Comma-separated list. Users must enter one to chat. Empty = open access.",
        placeholder: "code1,code2",
    },

    // ── Features ─────────────────────────────────────────────────────
    {
        key: "ENABLE_VLM_VALIDATION",
        group: "features",
        type: "boolean",
        label: "VLM Diagram Validation",
        description:
            "Visually validate generated diagrams with a vision model.",
    },
    {
        key: "VALIDATION_MODEL",
        group: "features",
        type: "string",
        label: "Validation Model",
        description: "Falls back to the default AI model when empty.",
    },
    {
        key: "VALIDATION_TIMEOUT",
        group: "features",
        type: "number",
        label: "Validation Timeout (ms)",
        min: 1000,
    },
    {
        key: "ENABLE_HISTORY_XML_REPLACE",
        group: "features",
        type: "boolean",
        label: "History XML Compression",
        description: "Replace old diagram XML in history with placeholders.",
    },
    {
        key: "ALLOW_PRIVATE_URLS",
        group: "features",
        type: "boolean",
        label: "Allow Private URLs",
        description:
            "Turn off to block requests to private IPs and internal hostnames (SSRF protection).",
    },

    // ── Observability ────────────────────────────────────────────────
    {
        key: "LANGFUSE_PUBLIC_KEY",
        group: "observability",
        type: "string",
        label: "Langfuse Public Key",
        placeholder: "pk-lf-…",
        restartRequired: true,
    },
    {
        key: "LANGFUSE_SECRET_KEY",
        group: "observability",
        type: "secret",
        label: "Langfuse Secret Key",
        restartRequired: true,
    },
    {
        key: "LANGFUSE_BASEURL",
        group: "observability",
        type: "string",
        label: "Langfuse Base URL",
        placeholder: "https://cloud.langfuse.com",
        restartRequired: true,
    },

    // ── Quota ────────────────────────────────────────────────────────
    {
        key: "DAILY_REQUEST_LIMIT",
        group: "quota",
        type: "number",
        label: "Daily Request Limit",
        description: "Per IP per day.",
        min: 1,
    },
    {
        key: "DAILY_TOKEN_LIMIT",
        group: "quota",
        type: "number",
        label: "Daily Token Limit",
        description: "Per IP per day.",
        min: 1,
    },
    {
        key: "TPM_LIMIT",
        group: "quota",
        type: "number",
        label: "Tokens Per Minute",
        min: 1,
    },
    {
        key: "DYNAMODB_QUOTA_TABLE",
        group: "quota",
        type: "string",
        label: "DynamoDB Table",
        description: "Quota enforcement is disabled when empty.",
        restartRequired: true,
    },
    {
        key: "DYNAMODB_REGION",
        group: "quota",
        type: "string",
        label: "DynamoDB Region",
        placeholder: "ap-northeast-1",
        restartRequired: true,
    },
    {
        key: "QUOTA_TIMEZONE",
        group: "quota",
        type: "string",
        label: "Quota Timezone",
        description: "Timezone for the daily reset boundary.",
        placeholder: "UTC",
        restartRequired: true,
    },
]

export const SETTINGS_BY_KEY: Map<string, SettingDef> = new Map(
    SETTINGS_REGISTRY.map((def) => [def.key, def]),
)

export const SETTINGS_BY_GROUP: Map<string, SettingDef[]> = new Map(
    SETTING_GROUPS.map((g) => [
        g.id,
        SETTINGS_REGISTRY.filter((d) => d.group === g.id),
    ]),
)

// Provider Credentials group, keyed by provider in registry order
export const PROVIDER_SUBGROUPS: Map<ProviderName, SettingDef[]> = new Map()
for (const def of SETTINGS_REGISTRY) {
    if (!def.provider) continue
    const list = PROVIDER_SUBGROUPS.get(def.provider) ?? []
    list.push(def)
    PROVIDER_SUBGROUPS.set(def.provider, list)
}

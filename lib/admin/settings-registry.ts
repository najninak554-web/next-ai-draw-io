// Declarative registry of all env vars editable in the admin panel.
// Drives both server-side validation (app/api/admin/settings) and UI
// rendering (app/[lang]/admin). Keys are exactly the env var names.
//
// Not listed here (and therefore rejected by the API):
// - NEXT_PUBLIC_* vars: baked into the client bundle at build time
// - ADMIN_PASSWORD / SETTINGS_FILE: bootstrap values, env-only to avoid lockout

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
    // Collapsible subsection within a group (used for the per-provider lists)
    subgroup?: string
}

export interface SettingGroup {
    id: string
    title: string
    description: string
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
        id: "quota",
        title: "Quota & Rate Limits",
        description:
            "Per-IP usage limits. Enforcement requires a DynamoDB table.",
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
    },
]

const PROVIDER_OPTIONS = [
    "bedrock",
    "openai",
    "anthropic",
    "google",
    "vertexai",
    "azure",
    "ollama",
    "openrouter",
    "deepseek",
    "siliconflow",
    "sglang",
    "gateway",
    "edgeone",
    "doubao",
    "modelscope",
    "glm",
    "qwen",
    "kimi",
    "qiniu",
    "minimax",
    "novita",
]

// Simple API-key + base-URL providers, rendered as one subgroup each
const SIMPLE_PROVIDERS: Array<{
    subgroup: string
    keyVar: string
    urlVar: string
    urlPlaceholder?: string
}> = [
    {
        subgroup: "OpenRouter",
        keyVar: "OPENROUTER_API_KEY",
        urlVar: "OPENROUTER_BASE_URL",
        urlPlaceholder: "https://openrouter.ai/api/v1",
    },
    {
        subgroup: "DeepSeek",
        keyVar: "DEEPSEEK_API_KEY",
        urlVar: "DEEPSEEK_BASE_URL",
        urlPlaceholder: "https://api.deepseek.com/v1",
    },
    {
        subgroup: "SiliconFlow",
        keyVar: "SILICONFLOW_API_KEY",
        urlVar: "SILICONFLOW_BASE_URL",
        urlPlaceholder: "https://api.siliconflow.com/v1",
    },
    {
        subgroup: "SGLang",
        keyVar: "SGLANG_API_KEY",
        urlVar: "SGLANG_BASE_URL",
        urlPlaceholder: "http://127.0.0.1:8000/v1",
    },
    {
        subgroup: "Vercel AI Gateway",
        keyVar: "AI_GATEWAY_API_KEY",
        urlVar: "AI_GATEWAY_BASE_URL",
        urlPlaceholder: "https://ai-gateway.vercel.sh/v1/ai",
    },
    {
        subgroup: "Doubao",
        keyVar: "DOUBAO_API_KEY",
        urlVar: "DOUBAO_BASE_URL",
        urlPlaceholder: "https://ark.cn-beijing.volces.com/api/v3",
    },
    {
        subgroup: "ModelScope",
        keyVar: "MODELSCOPE_API_KEY",
        urlVar: "MODELSCOPE_BASE_URL",
        urlPlaceholder: "https://api-inference.modelscope.cn/v1",
    },
    {
        subgroup: "GLM",
        keyVar: "GLM_API_KEY",
        urlVar: "GLM_BASE_URL",
        urlPlaceholder: "https://open.bigmodel.cn/api/paas/v4",
    },
    {
        subgroup: "Qwen",
        keyVar: "QWEN_API_KEY",
        urlVar: "QWEN_BASE_URL",
        urlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    {
        subgroup: "Kimi",
        keyVar: "KIMI_API_KEY",
        urlVar: "KIMI_BASE_URL",
        urlPlaceholder: "https://api.moonshot.cn/v1",
    },
    {
        subgroup: "Qiniu",
        keyVar: "QINIU_API_KEY",
        urlVar: "QINIU_BASE_URL",
        urlPlaceholder: "https://api.qnaigc.com/v1",
    },
    {
        subgroup: "MiniMax",
        keyVar: "MINIMAX_API_KEY",
        urlVar: "MINIMAX_BASE_URL",
        urlPlaceholder: "https://api.minimaxi.com/anthropic",
    },
    {
        subgroup: "Novita",
        keyVar: "NOVITA_API_KEY",
        urlVar: "NOVITA_BASE_URL",
        urlPlaceholder: "https://api.novita.ai/openai",
    },
]

function simpleProviderSettings(): SettingDef[] {
    return SIMPLE_PROVIDERS.flatMap((p) => [
        {
            key: p.keyVar,
            group: "providers",
            subgroup: p.subgroup,
            type: "secret" as const,
            label: "API Key",
        },
        {
            key: p.urlVar,
            group: "providers",
            subgroup: p.subgroup,
            type: "string" as const,
            label: "Base URL",
            placeholder: p.urlPlaceholder,
        },
    ])
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
        subgroup: "AWS Bedrock",
        type: "string",
        label: "AWS Region",
        placeholder: "us-west-2",
    },
    {
        key: "AWS_ACCESS_KEY_ID",
        group: "providers",
        subgroup: "AWS Bedrock",
        type: "secret",
        label: "Access Key ID",
    },
    {
        key: "AWS_SECRET_ACCESS_KEY",
        group: "providers",
        subgroup: "AWS Bedrock",
        type: "secret",
        label: "Secret Access Key",
    },
    {
        key: "BEDROCK_REASONING_BUDGET_TOKENS",
        group: "providers",
        subgroup: "AWS Bedrock",
        type: "number",
        label: "Reasoning Budget Tokens",
        description: "Claude extended-thinking budget (1024–64000).",
        min: 1024,
        max: 64000,
    },
    {
        key: "BEDROCK_REASONING_EFFORT",
        group: "providers",
        subgroup: "AWS Bedrock",
        type: "enum",
        label: "Reasoning Effort",
        description: "For Nova models.",
        options: ["low", "medium", "high"],
    },

    // ── Providers: OpenAI ────────────────────────────────────────────
    {
        key: "OPENAI_API_KEY",
        group: "providers",
        subgroup: "OpenAI",
        type: "secret",
        label: "API Key",
    },
    {
        key: "OPENAI_BASE_URL",
        group: "providers",
        subgroup: "OpenAI",
        type: "string",
        label: "Base URL",
        description: "Custom OpenAI-compatible endpoint.",
        placeholder: "https://api.openai.com/v1",
    },
    {
        key: "OPENAI_REASONING_EFFORT",
        group: "providers",
        subgroup: "OpenAI",
        type: "enum",
        label: "Reasoning Effort",
        options: ["minimal", "low", "medium", "high"],
    },
    {
        key: "OPENAI_REASONING_SUMMARY",
        group: "providers",
        subgroup: "OpenAI",
        type: "enum",
        label: "Reasoning Summary",
        options: ["none", "brief", "detailed"],
    },

    // ── Providers: Anthropic ─────────────────────────────────────────
    {
        key: "ANTHROPIC_API_KEY",
        group: "providers",
        subgroup: "Anthropic",
        type: "secret",
        label: "API Key",
        description: "Sent as x-api-key header.",
    },
    {
        key: "ANTHROPIC_AUTH_TOKEN",
        group: "providers",
        subgroup: "Anthropic",
        type: "secret",
        label: "Auth Token",
        description:
            "Alternative to the API key; sent as Authorization: Bearer.",
    },
    {
        key: "ANTHROPIC_BASE_URL",
        group: "providers",
        subgroup: "Anthropic",
        type: "string",
        label: "Base URL",
        placeholder: "https://api.anthropic.com/v1",
    },
    {
        key: "ANTHROPIC_THINKING_TYPE",
        group: "providers",
        subgroup: "Anthropic",
        type: "enum",
        label: "Extended Thinking",
        options: ["enabled"],
    },
    {
        key: "ANTHROPIC_THINKING_BUDGET_TOKENS",
        group: "providers",
        subgroup: "Anthropic",
        type: "number",
        label: "Thinking Budget Tokens",
        min: 1024,
        max: 64000,
    },

    // ── Providers: Google ────────────────────────────────────────────
    {
        key: "GOOGLE_GENERATIVE_AI_API_KEY",
        group: "providers",
        subgroup: "Google",
        type: "secret",
        label: "API Key",
    },
    {
        key: "GOOGLE_BASE_URL",
        group: "providers",
        subgroup: "Google",
        type: "string",
        label: "Base URL",
        placeholder: "https://generativelanguage.googleapis.com/v1beta",
    },
    {
        key: "GOOGLE_THINKING_BUDGET",
        group: "providers",
        subgroup: "Google",
        type: "number",
        label: "Thinking Budget (Gemini 2.5)",
        min: 1024,
        max: 100000,
    },
    {
        key: "GOOGLE_THINKING_LEVEL",
        group: "providers",
        subgroup: "Google",
        type: "enum",
        label: "Thinking Level (Gemini 3)",
        options: ["low", "high"],
    },
    {
        key: "GOOGLE_REASONING_EFFORT",
        group: "providers",
        subgroup: "Google",
        type: "enum",
        label: "Reasoning Effort",
        options: ["low", "medium", "high"],
    },
    {
        key: "GOOGLE_CANDIDATE_COUNT",
        group: "providers",
        subgroup: "Google",
        type: "number",
        label: "Candidate Count",
        min: 1,
        max: 8,
    },
    {
        key: "GOOGLE_TOP_K",
        group: "providers",
        subgroup: "Google",
        type: "number",
        label: "Top K",
        min: 1,
        max: 100,
    },
    {
        key: "GOOGLE_TOP_P",
        group: "providers",
        subgroup: "Google",
        type: "number",
        label: "Top P",
        min: 0,
        max: 1,
    },

    // ── Providers: Vertex AI ─────────────────────────────────────────
    {
        key: "GOOGLE_VERTEX_API_KEY",
        group: "providers",
        subgroup: "Vertex AI",
        type: "secret",
        label: "API Key",
        description: "Express Mode API key.",
    },
    {
        key: "GOOGLE_VERTEX_BASE_URL",
        group: "providers",
        subgroup: "Vertex AI",
        type: "string",
        label: "Base URL",
    },
    {
        key: "GOOGLE_VERTEX_THINKING_BUDGET",
        group: "providers",
        subgroup: "Vertex AI",
        type: "number",
        label: "Thinking Budget (Gemini 2.5)",
        min: 1024,
        max: 100000,
    },
    {
        key: "GOOGLE_VERTEX_THINKING_LEVEL",
        group: "providers",
        subgroup: "Vertex AI",
        type: "enum",
        label: "Thinking Level (Gemini 3)",
        options: ["minimal", "low", "medium", "high"],
    },

    // ── Providers: Azure OpenAI ──────────────────────────────────────
    {
        key: "AZURE_API_KEY",
        group: "providers",
        subgroup: "Azure OpenAI",
        type: "secret",
        label: "API Key",
    },
    {
        key: "AZURE_RESOURCE_NAME",
        group: "providers",
        subgroup: "Azure OpenAI",
        type: "string",
        label: "Resource Name",
        description: "Endpoint becomes https://{name}.openai.azure.com.",
    },
    {
        key: "AZURE_BASE_URL",
        group: "providers",
        subgroup: "Azure OpenAI",
        type: "string",
        label: "Base URL",
        description: "Alternative to resource name; takes precedence.",
    },
    {
        key: "AZURE_REASONING_EFFORT",
        group: "providers",
        subgroup: "Azure OpenAI",
        type: "enum",
        label: "Reasoning Effort",
        options: ["low", "medium", "high"],
    },
    {
        key: "AZURE_REASONING_SUMMARY",
        group: "providers",
        subgroup: "Azure OpenAI",
        type: "enum",
        label: "Reasoning Summary",
        options: ["none", "brief", "detailed"],
    },

    // ── Providers: Ollama ────────────────────────────────────────────
    {
        key: "OLLAMA_BASE_URL",
        group: "providers",
        subgroup: "Ollama",
        type: "string",
        label: "Base URL",
        placeholder: "https://ollama.com/api",
    },
    {
        key: "OLLAMA_API_KEY",
        group: "providers",
        subgroup: "Ollama",
        type: "secret",
        label: "API Key",
        description: "For Ollama Cloud or authenticated remote instances.",
    },
    {
        key: "OLLAMA_ENABLE_THINKING",
        group: "providers",
        subgroup: "Ollama",
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
]

export const SETTINGS_BY_KEY: Map<string, SettingDef> = new Map(
    SETTINGS_REGISTRY.map((def) => [def.key, def]),
)

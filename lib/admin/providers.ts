import { z } from "zod"
import {
    ProviderNameSchema,
    type ServerModelsConfig,
} from "@/lib/server-model-config"
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"
import { type MaskedSecret, maskSecret } from "./auth"
import { loadSettings } from "./settings"

// Admin-configured providers, mirroring the user ModelConfigDialog's data
// model but stored server-side. The list itself is stored in settings.json
// under ADMIN_PROVIDERS; on save we derive AI_MODELS_CONFIG plus the
// credential env vars so the existing runtime picks everything up unchanged.

export const ADMIN_PROVIDERS_KEY = "ADMIN_PROVIDERS"

// A secret field in transit: plaintext string (new value) or an
// {isSet} marker meaning "keep the stored value".
const SecretInputSchema = z
    .union([z.string(), z.object({ isSet: z.literal(true), hint: z.string() })])
    .optional()

export const AdminProviderSchema = z.object({
    id: z.string().min(1),
    provider: ProviderNameSchema,
    name: z.string().optional(),
    apiKey: SecretInputSchema,
    baseUrl: z.string().optional(),
    awsAccessKeyId: SecretInputSchema,
    awsSecretAccessKey: SecretInputSchema,
    awsRegion: z.string().optional(),
    vertexApiKey: SecretInputSchema,
    models: z.array(z.string().min(1)),
    isDefault: z.boolean().optional(),
})

export const AdminProvidersSchema = z.array(AdminProviderSchema)

export type AdminProviderInput = z.infer<typeof AdminProviderSchema>

// Stored form: secrets are plain strings
export interface StoredAdminProvider {
    id: string
    provider: ProviderName
    name?: string
    apiKey?: string
    baseUrl?: string
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    vertexApiKey?: string
    models: string[]
    isDefault?: boolean
}

const SECRET_FIELDS = [
    "apiKey",
    "awsAccessKeyId",
    "awsSecretAccessKey",
    "vertexApiKey",
] as const

// Default credential env vars per provider (first instance). Later
// instances of the same provider get a _2/_3 suffix wired up via
// apiKeyEnv/baseUrlEnv in the generated AI_MODELS_CONFIG.
// bedrock/vertexai use fixed env vars the runtime reads directly,
// so only one instance of each can carry server credentials.
const CRED_ENV: Partial<Record<ProviderName, { key: string; url: string }>> = {
    openai: { key: "OPENAI_API_KEY", url: "OPENAI_BASE_URL" },
    anthropic: { key: "ANTHROPIC_API_KEY", url: "ANTHROPIC_BASE_URL" },
    google: { key: "GOOGLE_GENERATIVE_AI_API_KEY", url: "GOOGLE_BASE_URL" },
    azure: { key: "AZURE_API_KEY", url: "AZURE_BASE_URL" },
    ollama: { key: "OLLAMA_API_KEY", url: "OLLAMA_BASE_URL" },
    openrouter: { key: "OPENROUTER_API_KEY", url: "OPENROUTER_BASE_URL" },
    deepseek: { key: "DEEPSEEK_API_KEY", url: "DEEPSEEK_BASE_URL" },
    siliconflow: { key: "SILICONFLOW_API_KEY", url: "SILICONFLOW_BASE_URL" },
    sglang: { key: "SGLANG_API_KEY", url: "SGLANG_BASE_URL" },
    gateway: { key: "AI_GATEWAY_API_KEY", url: "AI_GATEWAY_BASE_URL" },
    doubao: { key: "DOUBAO_API_KEY", url: "DOUBAO_BASE_URL" },
    modelscope: { key: "MODELSCOPE_API_KEY", url: "MODELSCOPE_BASE_URL" },
    glm: { key: "GLM_API_KEY", url: "GLM_BASE_URL" },
    qwen: { key: "QWEN_API_KEY", url: "QWEN_BASE_URL" },
    kimi: { key: "KIMI_API_KEY", url: "KIMI_BASE_URL" },
    qiniu: { key: "QINIU_API_KEY", url: "QINIU_BASE_URL" },
    minimax: { key: "MINIMAX_API_KEY", url: "MINIMAX_BASE_URL" },
    novita: { key: "NOVITA_API_KEY", url: "NOVITA_BASE_URL" },
}

export function loadAdminProviders(): StoredAdminProvider[] {
    const raw = loadSettings()[ADMIN_PROVIDERS_KEY]
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        console.error("[admin-providers] Failed to parse stored providers")
        return []
    }
}

export type MaskedAdminProvider = Omit<
    StoredAdminProvider,
    (typeof SECRET_FIELDS)[number]
> & {
    apiKey?: MaskedSecret
    awsAccessKeyId?: MaskedSecret
    awsSecretAccessKey?: MaskedSecret
    vertexApiKey?: MaskedSecret
}

export function maskAdminProviders(
    list: StoredAdminProvider[],
): MaskedAdminProvider[] {
    return list.map((p) => {
        const masked: MaskedAdminProvider = { ...p } as MaskedAdminProvider
        for (const field of SECRET_FIELDS) {
            const value = p[field]
            masked[field] = value ? maskSecret(value) : undefined
        }
        return masked
    })
}

// Resolve {isSet} markers in incoming secrets against the stored list
export function mergeSecrets(
    incoming: AdminProviderInput[],
    stored: StoredAdminProvider[],
): StoredAdminProvider[] {
    const storedById = new Map(stored.map((p) => [p.id, p]))
    return incoming.map((p) => {
        const prev = storedById.get(p.id)
        const merged = { ...p } as StoredAdminProvider
        for (const field of SECRET_FIELDS) {
            const value = p[field]
            if (typeof value === "string") {
                merged[field] = value || undefined
            } else if (value?.isSet) {
                merged[field] = prev?.[field]
            } else {
                merged[field] = undefined
            }
        }
        return merged
    })
}

export function validateAdminProviders(
    list: StoredAdminProvider[],
): string | null {
    for (const single of ["bedrock", "vertexai"] as const) {
        if (list.filter((p) => p.provider === single).length > 1) {
            return `Only one ${PROVIDER_INFO[single].label} provider is supported (its credentials use fixed environment variables).`
        }
    }
    const names = list.map((p) => displayName(p))
    if (new Set(names).size !== names.length) {
        return "Provider display names must be unique."
    }
    if (list.filter((p) => p.isDefault).length > 1) {
        return "Only one provider can be the default."
    }
    return null
}

function displayName(p: StoredAdminProvider): string {
    return p.name?.trim() || PROVIDER_INFO[p.provider].label
}

// Env var names for instance `index` (0-based) of a provider
function credEnvNames(
    provider: ProviderName,
    index: number,
): { key?: string; url?: string } {
    const base = CRED_ENV[provider]
    if (!base) return {}
    if (index === 0) return base
    return { key: `${base.key}_${index + 1}`, url: `${base.url}_${index + 1}` }
}

// All env updates derived from the provider list: credential vars,
// AI_MODELS_CONFIG, and AI_PROVIDER/AI_MODEL for the default model.
// Keys derived from `previous` but absent now are set to null (removed,
// falling back to the environment).
export function deriveEnvUpdates(
    list: StoredAdminProvider[],
    previous: StoredAdminProvider[],
): Record<string, string | null> {
    const updates: Record<string, string | null> = {}

    // Clear everything the previous list owned, then overwrite below
    for (const key of derivedEnvKeys(previous)) updates[key] = null

    const config: ServerModelsConfig = { providers: [] }
    const indexByProvider = new Map<ProviderName, number>()

    for (const p of list) {
        const index = indexByProvider.get(p.provider) ?? 0
        indexByProvider.set(p.provider, index + 1)

        if (p.provider === "bedrock") {
            if (p.awsAccessKeyId) updates.AWS_ACCESS_KEY_ID = p.awsAccessKeyId
            if (p.awsSecretAccessKey)
                updates.AWS_SECRET_ACCESS_KEY = p.awsSecretAccessKey
            if (p.awsRegion) updates.AWS_REGION = p.awsRegion
        } else if (p.provider === "vertexai") {
            if (p.vertexApiKey) updates.GOOGLE_VERTEX_API_KEY = p.vertexApiKey
            if (p.baseUrl) updates.GOOGLE_VERTEX_BASE_URL = p.baseUrl
        }

        const env = credEnvNames(p.provider, index)
        if (env.key && p.apiKey) updates[env.key] = p.apiKey
        if (env.url && p.baseUrl) updates[env.url] = p.baseUrl

        if (p.models.length > 0) {
            config.providers.push({
                name: displayName(p),
                provider: p.provider,
                models: p.models,
                // First instances use the default env vars the runtime
                // already falls back to; only extras need explicit wiring
                ...(index > 0 && env.key && p.apiKey
                    ? { apiKeyEnv: env.key }
                    : {}),
                ...(index > 0 && env.url && p.baseUrl
                    ? { baseUrlEnv: env.url }
                    : {}),
                ...(p.isDefault ? { default: true } : {}),
            })
        }
    }

    if (config.providers.length > 0) {
        updates[ADMIN_PROVIDERS_KEY] = JSON.stringify(list)
        updates.AI_MODELS_CONFIG = JSON.stringify(config)
        const defaultEntry =
            list.find((p) => p.isDefault && p.models.length > 0) ??
            list.find((p) => p.models.length > 0)
        if (defaultEntry) {
            updates.AI_PROVIDER = defaultEntry.provider
            updates.AI_MODEL = defaultEntry.models[0]
        }
    } else if (list.length > 0) {
        // Providers configured but no models yet — keep the list only
        updates[ADMIN_PROVIDERS_KEY] = JSON.stringify(list)
    } else {
        updates[ADMIN_PROVIDERS_KEY] = null
    }

    return updates
}

// Every settings key the panel may have written for a given list
function derivedEnvKeys(list: StoredAdminProvider[]): string[] {
    const keys = new Set<string>([
        "AI_MODELS_CONFIG",
        "AI_PROVIDER",
        "AI_MODEL",
    ])
    const indexByProvider = new Map<ProviderName, number>()
    for (const p of list) {
        const index = indexByProvider.get(p.provider) ?? 0
        indexByProvider.set(p.provider, index + 1)
        if (p.provider === "bedrock") {
            keys.add("AWS_ACCESS_KEY_ID")
            keys.add("AWS_SECRET_ACCESS_KEY")
            keys.add("AWS_REGION")
        } else if (p.provider === "vertexai") {
            keys.add("GOOGLE_VERTEX_API_KEY")
            keys.add("GOOGLE_VERTEX_BASE_URL")
        }
        const env = credEnvNames(p.provider, index)
        if (env.key) keys.add(env.key)
        if (env.url) keys.add(env.url)
    }
    return [...keys]
}

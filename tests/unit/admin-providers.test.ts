import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    deriveEnvUpdates,
    mergeSecrets,
    type StoredAdminProvider,
    validateAdminProviders,
} from "@/lib/admin/providers"
import { _resetForTests } from "@/lib/admin/settings"

let tmpDir: string

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-providers-"))
    process.env.SETTINGS_FILE = path.join(tmpDir, "settings.json")
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    delete process.env.SETTINGS_FILE
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

function provider(
    overrides: Partial<StoredAdminProvider> = {},
): StoredAdminProvider {
    return {
        id: "p1",
        provider: "openai",
        apiKey: "sk-test",
        models: ["gpt-5.2"],
        ...overrides,
    }
}

describe("deriveEnvUpdates", () => {
    it("writes credential env vars and AI_MODELS_CONFIG", () => {
        const updates = deriveEnvUpdates([provider()], [])
        expect(updates.OPENAI_API_KEY).toBe("sk-test")
        const config = JSON.parse(updates.AI_MODELS_CONFIG as string)
        expect(config.providers).toHaveLength(1)
        expect(config.providers[0].models).toEqual(["gpt-5.2"])
        expect(updates.AI_PROVIDER).toBe("openai")
        expect(updates.AI_MODEL).toBe("gpt-5.2")
    })

    it("suffixes env vars for a second instance of the same provider", () => {
        const updates = deriveEnvUpdates(
            [
                provider({ id: "p1", name: "First" }),
                provider({
                    id: "p2",
                    name: "Second",
                    apiKey: "sk-second",
                    models: ["gpt-5-mini"],
                }),
            ],
            [],
        )
        expect(updates.OPENAI_API_KEY).toBe("sk-test")
        expect(updates.OPENAI_API_KEY_2).toBe("sk-second")
        const config = JSON.parse(updates.AI_MODELS_CONFIG as string)
        expect(config.providers[1].apiKeyEnv).toBe("OPENAI_API_KEY_2")
    })

    it("maps bedrock credentials to AWS env vars", () => {
        const updates = deriveEnvUpdates(
            [
                provider({
                    provider: "bedrock",
                    apiKey: undefined,
                    awsAccessKeyId: "AKIA123",
                    awsSecretAccessKey: "secret",
                    awsRegion: "us-west-2",
                    models: ["claude-x"],
                }),
            ],
            [],
        )
        expect(updates.AWS_ACCESS_KEY_ID).toBe("AKIA123")
        expect(updates.AWS_SECRET_ACCESS_KEY).toBe("secret")
        expect(updates.AWS_REGION).toBe("us-west-2")
    })

    it("clears keys owned by the previous list when providers are removed", () => {
        const prev = [provider()]
        const updates = deriveEnvUpdates([], prev)
        expect(updates.OPENAI_API_KEY).toBeNull()
        expect(updates.AI_MODELS_CONFIG).toBeNull()
        expect(updates.ADMIN_PROVIDERS).toBeNull()
    })

    it("respects the default flag for AI_PROVIDER/AI_MODEL", () => {
        const updates = deriveEnvUpdates(
            [
                provider({ id: "p1" }),
                provider({
                    id: "p2",
                    provider: "deepseek",
                    models: ["deepseek-chat"],
                    isDefault: true,
                }),
            ],
            [],
        )
        expect(updates.AI_PROVIDER).toBe("deepseek")
        expect(updates.AI_MODEL).toBe("deepseek-chat")
        const config = JSON.parse(updates.AI_MODELS_CONFIG as string)
        expect(config.providers[1].default).toBe(true)
    })
})

describe("mergeSecrets", () => {
    it("keeps stored secret when client sends an isSet marker", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [
                {
                    ...provider(),
                    apiKey: { isSet: true, hint: "…test" },
                },
            ],
            stored,
        )
        expect(merged[0].apiKey).toBe("sk-original")
    })

    it("replaces secret when client sends a plaintext string", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [{ ...provider(), apiKey: "sk-new" }],
            stored,
        )
        expect(merged[0].apiKey).toBe("sk-new")
    })

    it("clears secret when client sends undefined", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [{ ...provider(), apiKey: undefined }],
            stored,
        )
        expect(merged[0].apiKey).toBeUndefined()
    })
})

describe("validateAdminProviders", () => {
    it("rejects two bedrock instances", () => {
        const list = [
            provider({ id: "p1", provider: "bedrock" }),
            provider({ id: "p2", provider: "bedrock" }),
        ]
        expect(validateAdminProviders(list)).toMatch(/Only one/)
    })

    it("rejects duplicate display names", () => {
        const list = [
            provider({ id: "p1", name: "Same" }),
            provider({ id: "p2", name: "Same" }),
        ]
        expect(validateAdminProviders(list)).toMatch(/unique/)
    })

    it("rejects multiple defaults", () => {
        const list = [
            provider({ id: "p1", isDefault: true }),
            provider({ id: "p2", name: "Other", isDefault: true }),
        ]
        expect(validateAdminProviders(list)).toMatch(/default/)
    })

    it("accepts a valid list", () => {
        const list = [
            provider({ id: "p1", isDefault: true }),
            provider({ id: "p2", name: "Backup" }),
        ]
        expect(validateAdminProviders(list)).toBeNull()
    })
})

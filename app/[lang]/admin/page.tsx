"use client"

import {
    AlertCircle,
    AlertTriangle,
    Check,
    Eye,
    EyeOff,
    Loader2,
    LockKeyhole,
    Plus,
    ShieldCheck,
    Star,
    Trash2,
    X,
    Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ProviderLogo } from "@/components/provider-logo"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
    SETTING_GROUPS,
    SETTINGS_BY_GROUP,
    type SettingDef,
} from "@/lib/admin/settings-registry"
import { getApiEndpoint } from "@/lib/base-path"
import {
    FIXED_CRED_PROVIDERS,
    PROVIDER_INFO,
    type ProviderName,
    SUGGESTED_MODELS,
} from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

const SESSION_PASSWORD_KEY = "next-ai-draw-io-admin-password"

// ── Shared types ─────────────────────────────────────────────────────

type SecretValue = { isSet: true; hint: string }

function isSecretValue(v: unknown): v is SecretValue {
    return typeof v === "object" && v !== null && "isSet" in v
}

interface SettingState {
    key: string
    source: "file" | "env" | "default"
    value: string | SecretValue | null
}

type SettingsMap = Record<string, SettingState>

// Editable text of a saved setting; secrets have none (write-only)
function savedTextOf(state: SettingState | undefined): string {
    return state && !isSecretValue(state.value) ? (state.value ?? "") : ""
}

// Admin provider in client state. Secret fields hold either a masked
// marker (unchanged) or a plaintext string (new value).
interface AdminProvider {
    id: string
    provider: ProviderName
    name?: string
    apiKey?: string | SecretValue
    baseUrl?: string
    awsAccessKeyId?: string | SecretValue
    awsSecretAccessKey?: string | SecretValue
    awsRegion?: string
    vertexApiKey?: string | SecretValue
    models: string[]
    isDefault?: boolean
}

// Provider defined in AI_MODELS_CONFIG / ai-models.json — shown read-only
interface EnvProvider {
    name: string
    provider: ProviderName
    models: string[]
    isDefault: boolean
}

async function adminFetch(path: string, pw: string, init?: RequestInit) {
    const res = await fetch(getApiEndpoint(path), {
        ...init,
        headers: {
            ...init?.headers,
            "x-admin-password": pw,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`)
    }
    return data
}

// ── Small shared UI bits ─────────────────────────────────────────────

function SourceChip({ source }: { source: "file" | "env" | "default" }) {
    if (source === "default") return null
    return (
        <span
            className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                source === "file"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
            )}
            title={
                source === "file"
                    ? "Set in the admin settings file"
                    : "Set by an environment variable"
            }
        >
            {source === "file" ? "Saved" : "Env"}
        </span>
    )
}

function RestartBadge() {
    return (
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Restart Required
        </span>
    )
}

// Secret input: shows masked hint as placeholder, typing replaces.
// With keepOnEmpty, clearing the field reverts to the stored value
// ("keep") instead of deleting it — explicit deletion is via the X button.
function SecretInput({
    id,
    value,
    disabled,
    keepOnEmpty,
    onChange,
}: {
    id: string
    value: string | SecretValue | undefined
    disabled?: boolean
    keepOnEmpty?: boolean
    onChange: (value: string | SecretValue) => void
}) {
    const [show, setShow] = useState(false)
    // The stored marker as it was at mount, to revert to on empty
    const [original] = useState(value)
    const hadStored = isSecretValue(original)
    const text = typeof value === "string" ? value : ""
    const placeholder = isSecretValue(value)
        ? `Saved (${value.hint}) — type to replace`
        : "Not set"
    const handleText = (t: string) => {
        if (t === "" && keepOnEmpty && hadStored && original) {
            onChange(original)
        } else {
            onChange(t)
        }
    }
    return (
        <div className="flex items-center gap-1">
            <Input
                id={id}
                type={show ? "text" : "password"}
                value={text}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder={placeholder}
                className="h-9 font-mono text-xs"
                onChange={(e) => handleText(e.target.value)}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={show ? "Hide value" : "Show value"}
                onClick={() => setShow((s) => !s)}
            >
                {show ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                )}
            </Button>
            {keepOnEmpty && (hadStored || text) && !disabled && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Remove value"
                    title="Remove the stored value"
                    onClick={() => onChange("")}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </Button>
            )}
        </div>
    )
}

// ── General settings field (registry-driven) ─────────────────────────

function SettingField({
    def,
    state,
    pendingValue,
    error,
    disabled,
    onChange,
}: {
    def: SettingDef
    state: SettingState | undefined
    pendingValue: string | null | undefined
    error?: string
    disabled: boolean
    onChange: (value: string | null) => void
}) {
    const isDirty = pendingValue !== undefined
    const source = state?.source ?? "default"
    const currentValue = isDirty ? (pendingValue ?? "") : savedTextOf(state)
    const secretState = state && isSecretValue(state.value) ? state.value : null

    const inputId = `setting-${def.key}`
    const errorId = `${inputId}-error`

    let control: React.ReactNode
    switch (def.type) {
        case "boolean":
            control = (
                <Switch
                    id={inputId}
                    checked={currentValue === "true"}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                        onChange(checked ? "true" : "false")
                    }
                />
            )
            break
        case "enum":
            control = (
                <Select
                    value={currentValue || undefined}
                    disabled={disabled}
                    onValueChange={onChange}
                >
                    <SelectTrigger id={inputId} className="w-full max-w-xs">
                        <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                        {def.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
            break
        case "secret":
            control = (
                <div className="w-full max-w-md">
                    <SecretInput
                        id={inputId}
                        value={
                            isDirty
                                ? (pendingValue ?? "")
                                : (secretState ?? currentValue)
                        }
                        disabled={disabled}
                        onChange={(v) =>
                            onChange(typeof v === "string" ? v : "")
                        }
                    />
                </div>
            )
            break
        case "number":
            control = (
                <Input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={def.min}
                    max={def.max}
                    value={currentValue}
                    disabled={disabled}
                    placeholder={def.placeholder ?? "Not set"}
                    className="w-full max-w-xs tabular-nums"
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => onChange(e.target.value)}
                />
            )
            break
        default:
            control = (
                <Input
                    id={inputId}
                    type="text"
                    value={currentValue}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={def.placeholder ?? "Not set"}
                    className="w-full max-w-md"
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => onChange(e.target.value)}
                />
            )
    }

    return (
        <div className="border-b border-border/60 py-4 last:border-b-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Label htmlFor={inputId} className="text-sm font-medium">
                    {def.label}
                </Label>
                <SourceChip source={source} />
                {def.restartRequired && <RestartBadge />}
                {isDirty && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        Modified
                    </span>
                )}
            </div>
            {def.description && (
                <p className="mb-2 max-w-prose text-xs text-muted-foreground">
                    {def.description}
                </p>
            )}
            {control}
            <p
                id={errorId}
                className={cn(
                    "text-xs text-destructive",
                    error ? "mt-1.5" : "sr-only",
                )}
                aria-live="polite"
            >
                {error ?? ""}
            </p>
        </div>
    )
}

// ── Models section (mirrors the user ModelConfigDialog) ──────────────

function CredField({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium">{label}</Label>
            {children}
        </div>
    )
}

function ProviderDetail({
    provider,
    disabled,
    password,
    onUpdate,
    onDelete,
}: {
    provider: AdminProvider
    disabled: boolean
    password: string
    onUpdate: (patch: Partial<AdminProvider>) => void
    onDelete: () => void
}) {
    const [modelInput, setModelInput] = useState("")
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [testing, setTesting] = useState<string | null>(null)
    const [testResults, setTestResults] = useState<
        Record<string, { ok: boolean; message: string }>
    >({})

    const info = PROVIDER_INFO[provider.provider]
    const suggestions = (SUGGESTED_MODELS[provider.provider] || []).filter(
        (m) => !provider.models.includes(m),
    )

    const addModel = (modelId: string) => {
        const trimmed = modelId.trim()
        if (!trimmed || provider.models.includes(trimmed)) return
        onUpdate({ models: [...provider.models, trimmed] })
        setModelInput("")
    }

    const testModel = async (modelId: string) => {
        setTesting(modelId)
        try {
            const data = await adminFetch("/api/admin/test-model", password, {
                method: "POST",
                body: JSON.stringify({ provider, modelId }),
            })
            setTestResults((prev) => ({
                ...prev,
                [modelId]: data.valid
                    ? { ok: true, message: `OK (${data.responseTime}ms)` }
                    : { ok: false, message: data.error || "Failed" },
            }))
        } catch (err) {
            setTestResults((prev) => ({
                ...prev,
                [modelId]: {
                    ok: false,
                    message: err instanceof Error ? err.message : "Failed",
                },
            }))
        } finally {
            setTesting(null)
        }
    }

    const isBedrock = provider.provider === "bedrock"
    const isVertex = provider.provider === "vertexai"
    const hasApiKey = !isBedrock && !isVertex

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <ProviderLogo
                        provider={provider.provider}
                        className="size-5"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{info.label}</h3>
                    <p className="text-xs text-muted-foreground">
                        {provider.models.length === 0
                            ? "No models configured"
                            : `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`}
                    </p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Star
                        className={cn(
                            "h-3.5 w-3.5",
                            provider.isDefault &&
                                "fill-amber-400 text-amber-400",
                        )}
                        aria-hidden="true"
                    />
                    Default
                    <Switch
                        checked={!!provider.isDefault}
                        disabled={disabled}
                        aria-label="Set as default provider"
                        onCheckedChange={(checked) =>
                            onUpdate({ isDefault: checked })
                        }
                    />
                </label>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                >
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Delete
                </Button>
            </div>

            {/* Credentials */}
            <div className="grid gap-4 sm:grid-cols-2">
                <CredField label="Display Name">
                    <Input
                        value={provider.name ?? ""}
                        disabled={disabled}
                        placeholder={info.label}
                        className="h-9"
                        onChange={(e) => onUpdate({ name: e.target.value })}
                    />
                </CredField>
                {hasApiKey && (
                    <CredField label="API Key">
                        <SecretInput
                            id={`apikey-${provider.id}`}
                            keepOnEmpty
                            value={provider.apiKey}
                            disabled={disabled}
                            onChange={(v) => onUpdate({ apiKey: v })}
                        />
                    </CredField>
                )}
                {isVertex && (
                    <CredField label="API Key (Express Mode)">
                        <SecretInput
                            id={`vertexkey-${provider.id}`}
                            keepOnEmpty
                            value={provider.vertexApiKey}
                            disabled={disabled}
                            onChange={(v) => onUpdate({ vertexApiKey: v })}
                        />
                    </CredField>
                )}
                {isBedrock ? (
                    <>
                        <CredField label="AWS Access Key ID">
                            <SecretInput
                                id={`awskey-${provider.id}`}
                                keepOnEmpty
                                value={provider.awsAccessKeyId}
                                disabled={disabled}
                                onChange={(v) =>
                                    onUpdate({ awsAccessKeyId: v })
                                }
                            />
                        </CredField>
                        <CredField label="AWS Secret Access Key">
                            <SecretInput
                                id={`awssecret-${provider.id}`}
                                keepOnEmpty
                                value={provider.awsSecretAccessKey}
                                disabled={disabled}
                                onChange={(v) =>
                                    onUpdate({ awsSecretAccessKey: v })
                                }
                            />
                        </CredField>
                        <CredField label="AWS Region">
                            <Input
                                value={provider.awsRegion ?? ""}
                                disabled={disabled}
                                placeholder="us-west-2"
                                spellCheck={false}
                                className="h-9 font-mono text-xs"
                                onChange={(e) =>
                                    onUpdate({ awsRegion: e.target.value })
                                }
                            />
                        </CredField>
                    </>
                ) : (
                    <CredField label="Base URL">
                        <Input
                            value={provider.baseUrl ?? ""}
                            disabled={disabled}
                            placeholder={info.defaultBaseUrl ?? "Default"}
                            spellCheck={false}
                            autoComplete="off"
                            className="h-9 font-mono text-xs"
                            onChange={(e) =>
                                onUpdate({ baseUrl: e.target.value })
                            }
                        />
                    </CredField>
                )}
            </div>

            {/* Models */}
            <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Models
                    </Label>
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={modelInput}
                            disabled={disabled}
                            placeholder="Model ID…"
                            spellCheck={false}
                            className="h-8 w-48 font-mono text-xs"
                            onChange={(e) => setModelInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addModel(modelInput)
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={disabled || !modelInput.trim()}
                            aria-label="Add model"
                            onClick={() => addModel(modelInput)}
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {suggestions.length > 0 && (
                            <Select
                                disabled={disabled}
                                onValueChange={(v) => addModel(v)}
                            >
                                <SelectTrigger className="h-8 w-28 text-xs">
                                    Suggested
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {suggestions.map((m) => (
                                        <SelectItem
                                            key={m}
                                            value={m}
                                            className="font-mono text-xs"
                                        >
                                            {m}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
                <div className="overflow-hidden rounded-lg border">
                    {provider.models.length === 0 ? (
                        <p className="p-5 text-center text-sm text-muted-foreground">
                            Add at least one model to expose this provider to
                            users.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {provider.models.map((modelId, index) => {
                                const result = testResults[modelId]
                                return (
                                    <li
                                        key={modelId}
                                        className="flex items-center gap-2 px-3 py-2"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                            {modelId}
                                            {provider.isDefault &&
                                                index === 0 && (
                                                    <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                                                        Default Model
                                                    </span>
                                                )}
                                        </span>
                                        {result && (
                                            <span
                                                className={cn(
                                                    "flex items-center gap-1 text-xs",
                                                    result.ok
                                                        ? "text-green-600 dark:text-green-400"
                                                        : "text-destructive",
                                                )}
                                            >
                                                {result.ok ? (
                                                    <Check
                                                        className="h-3.5 w-3.5"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <AlertCircle
                                                        className="h-3.5 w-3.5"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="max-w-48 truncate">
                                                    {result.message}
                                                </span>
                                            </span>
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            disabled={
                                                disabled || testing !== null
                                            }
                                            onClick={() =>
                                                void testModel(modelId)
                                            }
                                        >
                                            {testing === modelId ? (
                                                <Loader2
                                                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <Zap
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="ml-1">Test</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={disabled}
                                            aria-label={`Remove ${modelId}`}
                                            onClick={() =>
                                                onUpdate({
                                                    models: provider.models.filter(
                                                        (m) => m !== modelId,
                                                    ),
                                                })
                                            }
                                        >
                                            <X
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {provider.name || info.label}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Its credentials and models will be removed from the
                            server after you save.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                setDeleteOpen(false)
                                onDelete()
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function ModelsSection({
    providers,
    envProviders,
    disabled,
    password,
    onChange,
}: {
    providers: AdminProvider[]
    envProviders: EnvProvider[]
    disabled: boolean
    password: string
    onChange: (providers: AdminProvider[]) => void
}) {
    const [selectedId, setSelectedId] = useState<string | null>(
        providers[0]?.id ?? null,
    )
    const selected = providers.find((p) => p.id === selectedId)
    const selectedEnv = envProviders.find((p) => `env:${p.name}` === selectedId)

    const addProvider = (provider: ProviderName) => {
        const newProvider: AdminProvider = {
            id: crypto.randomUUID(),
            provider,
            models: [],
            isDefault: providers.length === 0,
        }
        onChange([...providers, newProvider])
        setSelectedId(newProvider.id)
    }

    const updateProvider = (id: string, patch: Partial<AdminProvider>) => {
        onChange(
            providers.map((p) => {
                if (p.id !== id) {
                    // Only one default at a time
                    return patch.isDefault ? { ...p, isDefault: false } : p
                }
                return { ...p, ...patch }
            }),
        )
    }

    const deleteProvider = (id: string) => {
        const next = providers.filter((p) => p.id !== id)
        onChange(next)
        setSelectedId(next[0]?.id ?? null)
    }

    return (
        <div className="flex min-h-72 flex-col sm:flex-row">
            {/* Provider list */}
            <div className="flex w-full shrink-0 flex-col border-b sm:w-52 sm:border-b-0 sm:border-r">
                <div className="flex-1 space-y-1 p-2">
                    {providers.length === 0 && envProviders.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                            Add a provider to offer server-side models to all
                            users.
                        </p>
                    )}
                    {envProviders.map((p) => (
                        <button
                            key={`env:${p.name}`}
                            type="button"
                            onClick={() => setSelectedId(`env:${p.name}`)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedId === `env:${p.name}` &&
                                    "bg-muted font-medium",
                            )}
                        >
                            <ProviderLogo provider={p.provider} />
                            <span className="min-w-0 flex-1 truncate">
                                {p.name}
                            </span>
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                Env
                            </span>
                            {p.isDefault && (
                                <Star
                                    className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                                    aria-label="Default provider"
                                />
                            )}
                        </button>
                    ))}
                    {providers.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedId(p.id)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedId === p.id && "bg-muted font-medium",
                            )}
                        >
                            <ProviderLogo provider={p.provider} />
                            <span className="min-w-0 flex-1 truncate">
                                {p.name || PROVIDER_INFO[p.provider].label}
                            </span>
                            {p.isDefault && (
                                <Star
                                    className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                                    aria-label="Default provider"
                                />
                            )}
                        </button>
                    ))}
                </div>
                <div className="border-t p-2">
                    <Select
                        disabled={disabled}
                        onValueChange={(v) => addProvider(v as ProviderName)}
                    >
                        <SelectTrigger className="w-full">
                            <Plus
                                className="mr-1 h-4 w-4 text-muted-foreground"
                                aria-hidden="true"
                            />
                            Add Provider
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {(Object.keys(PROVIDER_INFO) as ProviderName[]).map(
                                (p) => {
                                    // Global-credential providers already in
                                    // the env config can't be added here —
                                    // panel credentials would override theirs
                                    const envBlocked =
                                        FIXED_CRED_PROVIDERS.includes(p) &&
                                        envProviders.some(
                                            (e) => e.provider === p,
                                        )
                                    return (
                                        <SelectItem
                                            key={p}
                                            value={p}
                                            disabled={envBlocked}
                                        >
                                            <div className="flex items-center gap-2">
                                                <ProviderLogo provider={p} />
                                                {PROVIDER_INFO[p].label}
                                                {envBlocked && (
                                                    <span className="text-xs text-muted-foreground">
                                                        (managed via env)
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    )
                                },
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Detail */}
            <div className="min-w-0 flex-1 p-4">
                {selected ? (
                    <ProviderDetail
                        key={selected.id}
                        provider={selected}
                        disabled={disabled}
                        password={password}
                        onUpdate={(patch) => updateProvider(selected.id, patch)}
                        onDelete={() => deleteProvider(selected.id)}
                    />
                ) : selectedEnv ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <ProviderLogo
                                    provider={selectedEnv.provider}
                                    className="size-5"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold">
                                    {selectedEnv.name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Defined in AI_MODELS_CONFIG / ai-models.json
                                    — read-only here. Edit the environment
                                    configuration to change it.
                                </p>
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border">
                            <ul className="divide-y">
                                {selectedEnv.models.map((modelId, index) => (
                                    <li
                                        key={modelId}
                                        className="flex items-center gap-2 px-3 py-2"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                            {modelId}
                                            {selectedEnv.isDefault &&
                                                index === 0 && (
                                                    <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                                                        Default Model
                                                    </span>
                                                )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        Select or add a provider to configure its credentials
                        and models.
                    </p>
                )}
            </div>
        </div>
    )
}

// ── Page ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
    { id: "models", title: "Models" },
    ...SETTING_GROUPS.map((g) => ({ id: g.id, title: g.title })),
]

export default function AdminPage() {
    const [password, setPassword] = useState("")
    const [authedPassword, setAuthedPassword] = useState<string | null>(null)
    const [authError, setAuthError] = useState("")
    const [authLoading, setAuthLoading] = useState(false)

    const [writable, setWritable] = useState(true)

    // Models section state
    const [providers, setProviders] = useState<AdminProvider[]>([])
    const [envProviders, setEnvProviders] = useState<EnvProvider[]>([])
    const [savedProviders, setSavedProviders] = useState<string>("[]")
    const providersDirty = JSON.stringify(providers) !== savedProviders

    // General settings state
    const [settings, setSettings] = useState<SettingsMap>({})
    const [pending, setPending] = useState<Record<string, string | null>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>(
        {},
    )

    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState<{
        ok: boolean
        text: string
    } | null>(null)
    const [activeGroup, setActiveGroup] = useState("models")

    const dirtyCount = Object.keys(pending).length + (providersDirty ? 1 : 0)

    const applySettingsResponse = useCallback(
        (data: { writable: boolean; settings: SettingState[] }) => {
            setWritable(data.writable)
            const map: SettingsMap = {}
            for (const s of data.settings) map[s.key] = s
            setSettings(map)
            // Seed each toggle once from whether the group has configured
            // values; don't stomp a user's explicit toggle on later saves
            setEnabledGroups((prev) => {
                const next = { ...prev }
                for (const group of SETTING_GROUPS) {
                    if (!group.toggleable || group.id in next) continue
                    next[group.id] = !!SETTINGS_BY_GROUP.get(group.id)?.some(
                        (d) => map[d.key]?.source !== "default",
                    )
                }
                return next
            })
        },
        [],
    )

    const applyProvidersResponse = useCallback(
        (data: {
            providers: AdminProvider[]
            envProviders?: EnvProvider[]
        }) => {
            setProviders(data.providers)
            setSavedProviders(JSON.stringify(data.providers))
            setEnvProviders(data.envProviders ?? [])
        },
        [],
    )

    const login = useCallback(
        async (pw: string) => {
            setAuthLoading(true)
            setAuthError("")
            try {
                const [settingsData, providersData] = await Promise.all([
                    adminFetch("/api/admin/settings", pw),
                    adminFetch("/api/admin/providers", pw),
                ])
                applySettingsResponse(settingsData)
                applyProvidersResponse(providersData)
                setAuthedPassword(pw)
                sessionStorage.setItem(SESSION_PASSWORD_KEY, pw)
            } catch (err) {
                setAuthError(
                    err instanceof Error ? err.message : "Login failed",
                )
            } finally {
                setAuthLoading(false)
            }
        },
        [applySettingsResponse, applyProvidersResponse],
    )

    // Restore session on mount
    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY)
        if (stored) void login(stored)
    }, [login])

    // Warn before leaving with unsaved changes
    const hasDirty = dirtyCount > 0
    useEffect(() => {
        if (!hasDirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [hasDirty])

    // Highlight the section currently in view in the sidebar
    useEffect(() => {
        if (!authedPassword) return
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    )
                if (visible[0]) setActiveGroup(visible[0].target.id)
            },
            { rootMargin: "-10% 0px -50% 0px" },
        )
        for (const item of NAV_ITEMS) {
            const el = document.getElementById(item.id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [authedPassword])

    const handleChange = useCallback(
        (key: string, value: string | null) => {
            setSaveMessage(null)
            setErrors((prev) => {
                if (!(key in prev)) return prev
                const next = { ...prev }
                delete next[key]
                return next
            })
            setPending((prev) => {
                const state = settings[key]
                const isRevert =
                    value !== null &&
                    state?.source === "file" &&
                    !isSecretValue(state?.value) &&
                    value === savedTextOf(state)
                const isNoop =
                    value === "" &&
                    (!state || state.source !== "file") &&
                    !isSecretValue(state?.value)
                if (isRevert || isNoop) {
                    const next = { ...prev }
                    delete next[key]
                    return next
                }
                return { ...prev, [key]: value === "" ? null : value }
            })
        },
        [settings],
    )

    // Toggling a group off stages deletion of its saved values so the
    // feature actually turns off on save; toggling on drops those deletions.
    const handleGroupToggle = useCallback(
        (groupId: string, enabled: boolean) => {
            setSaveMessage(null)
            setEnabledGroups((prev) => ({ ...prev, [groupId]: enabled }))
            const keys = (SETTINGS_BY_GROUP.get(groupId) ?? []).map(
                (d) => d.key,
            )
            setPending((prev) => {
                const next = { ...prev }
                for (const key of keys) {
                    if (!enabled) {
                        // Stage deletion only for values currently set
                        if (settings[key]?.source !== "default")
                            next[key] = null
                    } else if (next[key] === null) {
                        delete next[key]
                    }
                }
                return next
            })
        },
        [settings],
    )

    const handleSave = useCallback(async () => {
        if (!authedPassword || dirtyCount === 0) return
        setSaving(true)
        setSaveMessage(null)
        setErrors({})
        try {
            if (providersDirty) {
                const data = await adminFetch(
                    "/api/admin/providers",
                    authedPassword,
                    { method: "PUT", body: JSON.stringify({ providers }) },
                )
                applyProvidersResponse(data)
            }
            if (Object.keys(pending).length > 0) {
                const res = await fetch(getApiEndpoint("/api/admin/settings"), {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "x-admin-password": authedPassword,
                    },
                    body: JSON.stringify({ values: pending }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                    // Per-field validation errors come back as {errors: {...}}
                    if (data.errors) {
                        setErrors(data.errors)
                        const firstKey = Object.keys(data.errors)[0]
                        document.getElementById(`setting-${firstKey}`)?.focus()
                        throw new Error("Some settings are invalid.")
                    }
                    throw new Error(
                        data.error || `Request failed (${res.status})`,
                    )
                }
                applySettingsResponse(data)
                setPending({})
            }
            setSaveMessage({
                ok: true,
                text: "Settings saved. Changes apply immediately.",
            })
            setTimeout(() => setSaveMessage(null), 4000)
        } catch (err) {
            setSaveMessage({
                ok: false,
                text:
                    err instanceof Error
                        ? err.message
                        : "Save failed. Check your connection and try again.",
            })
        } finally {
            setSaving(false)
        }
    }, [
        authedPassword,
        pending,
        providers,
        providersDirty,
        dirtyCount,
        applySettingsResponse,
        applyProvidersResponse,
    ])

    // ── Login screen ─────────────────────────────────────────────────
    if (!authedPassword) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <form
                    className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void login(password)
                    }}
                >
                    <div className="flex items-center gap-2">
                        <LockKeyhole
                            className="h-5 w-5 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <h1 className="text-lg font-semibold">
                            Admin Settings
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Enter the admin password (the ADMIN_PASSWORD environment
                        variable) to manage server settings.
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="admin-password">Password</Label>
                        <Input
                            id="admin-password"
                            name="admin-password"
                            type="password"
                            value={password}
                            autoComplete="current-password"
                            spellCheck={false}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <p
                        className={cn(
                            "text-sm text-destructive",
                            !authError && "sr-only",
                        )}
                        aria-live="polite"
                    >
                        {authError}
                    </p>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={authLoading}
                    >
                        {authLoading ? (
                            <>
                                <Loader2
                                    className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                                    aria-hidden="true"
                                />
                                Signing In…
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </Button>
                </form>
            </div>
        )
    }

    // ── Settings screen ──────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <ShieldCheck
                            className="h-5 w-5 text-primary"
                            aria-hidden="true"
                        />
                        <h1 className="text-lg font-semibold">
                            Admin Settings
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        File overrides env · env overrides defaults
                    </p>
                </div>
            </header>

            {!writable && (
                <div className="border-b bg-amber-500/10">
                    <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                        />
                        The settings file is not writable on this deployment
                        (serverless platforms have no persistent disk). Settings
                        are shown read-only — configure via environment
                        variables instead.
                    </div>
                </div>
            )}

            <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
                <nav
                    aria-label="Setting groups"
                    className="sticky top-20 hidden h-fit w-44 shrink-0 md:block"
                >
                    <ul className="space-y-1">
                        {NAV_ITEMS.map((item) => (
                            <li key={item.id}>
                                <a
                                    href={`#${item.id}`}
                                    aria-current={
                                        activeGroup === item.id
                                            ? "true"
                                            : undefined
                                    }
                                    className={cn(
                                        "block rounded-md px-3 py-1.5 text-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        activeGroup === item.id
                                            ? "bg-muted font-medium text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {item.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <main className="min-w-0 flex-1 pb-24">
                    {/* Models section */}
                    <section aria-labelledby="models" className="mb-10">
                        <h2
                            id="models"
                            className="scroll-mt-20 text-base font-semibold"
                        >
                            Models
                        </h2>
                        <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
                            Server-side providers and models available to all
                            users — no personal API key needed. The default
                            provider's first model is used when users don't pick
                            one.
                        </p>
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <ModelsSection
                                providers={providers}
                                envProviders={envProviders}
                                disabled={!writable || saving}
                                password={authedPassword}
                                onChange={(next) => {
                                    setSaveMessage(null)
                                    setProviders(next)
                                }}
                            />
                        </div>
                    </section>

                    {/* Registry-driven groups */}
                    {SETTING_GROUPS.map((group) => {
                        const defs = SETTINGS_BY_GROUP.get(group.id) ?? []
                        const groupOff =
                            group.toggleable && !enabledGroups[group.id]
                        const fieldsDisabled = !writable || saving || !!groupOff
                        return (
                            <section
                                key={group.id}
                                aria-labelledby={group.id}
                                className="mb-10"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <h2
                                        id={group.id}
                                        className="scroll-mt-20 text-base font-semibold"
                                    >
                                        {group.title}
                                    </h2>
                                    {group.toggleable && (
                                        <label
                                            className={cn(
                                                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none",
                                                enabledGroups[group.id]
                                                    ? "border-primary/30 bg-primary/5 text-primary"
                                                    : "border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                            )}
                                        >
                                            {enabledGroups[group.id]
                                                ? "Enabled"
                                                : "Disabled"}
                                            <Switch
                                                checked={
                                                    !!enabledGroups[group.id]
                                                }
                                                disabled={!writable || saving}
                                                aria-label={`Enable ${group.title}`}
                                                onCheckedChange={(checked) =>
                                                    handleGroupToggle(
                                                        group.id,
                                                        checked,
                                                    )
                                                }
                                            />
                                        </label>
                                    )}
                                </div>
                                <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
                                    {group.description}
                                </p>
                                <div
                                    className={cn(
                                        "rounded-lg border bg-card px-4",
                                        groupOff &&
                                            "pointer-events-none opacity-50",
                                    )}
                                >
                                    {defs.map((def) => (
                                        <SettingField
                                            key={def.key}
                                            def={def}
                                            state={settings[def.key]}
                                            pendingValue={pending[def.key]}
                                            error={errors[def.key]}
                                            disabled={fieldsDisabled}
                                            onChange={(v) =>
                                                handleChange(def.key, v)
                                            }
                                        />
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </main>
            </div>

            {/* Always-mounted live region so save results are announced */}
            <p aria-live="polite" className="sr-only">
                {saveMessage?.text ?? ""}
            </p>

            {(dirtyCount > 0 || saveMessage) && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
                        <p
                            className={cn(
                                "flex min-w-0 items-center gap-1.5 truncate text-sm",
                                saveMessage?.ok
                                    ? "text-green-600 dark:text-green-400"
                                    : saveMessage
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                            )}
                        >
                            {saveMessage?.ok && (
                                <Check
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                            )}
                            {saveMessage && !saveMessage.ok
                                ? saveMessage.text
                                : dirtyCount > 0
                                  ? "Unsaved changes"
                                  : saveMessage?.text}
                        </p>
                        {dirtyCount > 0 && (
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() => {
                                        setPending({})
                                        setErrors({})
                                        setProviders(JSON.parse(savedProviders))
                                    }}
                                >
                                    Discard
                                </Button>
                                <Button
                                    type="button"
                                    disabled={saving || !writable}
                                    onClick={() => void handleSave()}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2
                                                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                                                aria-hidden="true"
                                            />
                                            Saving…
                                        </>
                                    ) : (
                                        "Save Changes"
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

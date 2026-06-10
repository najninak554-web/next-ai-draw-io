"use client"

import {
    AlertTriangle,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    Loader2,
    LockKeyhole,
    RotateCcw,
    ShieldCheck,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ProviderLogo } from "@/components/provider-logo"
import { Button } from "@/components/ui/button"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { Textarea } from "@/components/ui/textarea"
import {
    PROVIDER_SUBGROUPS,
    SETTING_GROUPS,
    SETTINGS_BY_GROUP,
    type SettingDef,
} from "@/lib/admin/settings-registry"
import { getApiEndpoint } from "@/lib/base-path"
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

const SESSION_PASSWORD_KEY = "next-ai-draw-io-admin-password"

async function fetchSettings(pw: string) {
    const res = await fetch(getApiEndpoint("/api/admin/settings"), {
        headers: { "x-admin-password": pw },
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${res.status})`)
    }
    return res.json() as Promise<{
        writable: boolean
        settings: SettingState[]
    }>
}

type SecretValue = { isSet: true; hint: string }

interface SettingState {
    key: string
    source: "file" | "env" | "default"
    value: string | SecretValue | null
}

type SettingsMap = Record<string, SettingState>

function isSecretValue(v: unknown): v is SecretValue {
    return typeof v === "object" && v !== null && "isSet" in v
}

// Editable text of a saved setting; secrets have none (write-only)
function savedTextOf(state: SettingState | undefined): string {
    return state && !isSecretValue(state.value) ? (state.value ?? "") : ""
}

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
    const [showSecret, setShowSecret] = useState(false)
    const isDirty = pendingValue !== undefined
    const source = state?.source ?? "default"

    const currentValue = isDirty ? (pendingValue ?? "") : savedTextOf(state)

    const secretIsSet = state ? isSecretValue(state.value) : false
    const secretHint =
        state && isSecretValue(state.value) ? state.value.hint : ""

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
        case "json":
            control = (
                <Textarea
                    id={inputId}
                    value={currentValue}
                    disabled={disabled}
                    spellCheck={false}
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={def.placeholder ?? "{ … }"}
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => onChange(e.target.value)}
                />
            )
            break
        case "secret":
            control = (
                <div className="flex w-full max-w-md items-center gap-1">
                    <Input
                        id={inputId}
                        type={showSecret ? "text" : "password"}
                        value={currentValue}
                        disabled={disabled}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={
                            secretIsSet && !isDirty
                                ? `Saved (${secretHint}) — type to replace`
                                : "Not set"
                        }
                        aria-invalid={!!error}
                        aria-describedby={error ? errorId : undefined}
                        onChange={(e) => onChange(e.target.value)}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={showSecret ? "Hide value" : "Show value"}
                        onClick={() => setShowSecret((s) => !s)}
                    >
                        {showSecret ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                    </Button>
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

    const canReset =
        !disabled && !isDirty && source === "file" && def.type !== "boolean"

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
            <div className="flex min-w-0 items-start gap-2">
                {control}
                {canReset && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Reset ${def.label} to environment default`}
                        title="Remove saved value (falls back to env var)"
                        onClick={() => onChange(null)}
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                )}
            </div>
            {isDirty && pendingValue === null && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Saved value will be removed; the environment default applies
                    after saving.
                </p>
            )}
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

function ProviderSubgroup({
    provider,
    defs,
    settings,
    pending,
    errors,
    disabled,
    onChange,
}: {
    provider: ProviderName
    defs: SettingDef[]
    settings: SettingsMap
    pending: Record<string, string | null>
    errors: Record<string, string>
    disabled: boolean
    onChange: (key: string, value: string | null) => void
}) {
    const configured = defs.some((d) => {
        const s = settings[d.key]
        return s && s.source !== "default"
    })
    const hasDirty = defs.some((d) => d.key in pending)
    const [open, setOpen] = useState(false)

    return (
        <Collapsible open={open || hasDirty} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2">
                    <ChevronRight
                        className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                            (open || hasDirty) && "rotate-90",
                        )}
                        aria-hidden="true"
                    />
                    <ProviderLogo provider={provider} />
                    {PROVIDER_INFO[provider].label}
                </span>
                {configured && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Configured
                    </span>
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2">
                {defs.map((def) => (
                    <SettingField
                        key={def.key}
                        def={def}
                        state={settings[def.key]}
                        pendingValue={pending[def.key]}
                        error={errors[def.key]}
                        disabled={disabled}
                        onChange={(v) => onChange(def.key, v)}
                    />
                ))}
            </CollapsibleContent>
        </Collapsible>
    )
}

export default function AdminPage() {
    const [password, setPassword] = useState("")
    const [authedPassword, setAuthedPassword] = useState<string | null>(null)
    const [authError, setAuthError] = useState("")
    const [authLoading, setAuthLoading] = useState(false)

    const [settings, setSettings] = useState<SettingsMap>({})
    const [writable, setWritable] = useState(true)
    const [pending, setPending] = useState<Record<string, string | null>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState<{
        ok: boolean
        text: string
    } | null>(null)
    const [activeGroup, setActiveGroup] = useState(SETTING_GROUPS[0].id)
    // Toggleable groups (quota, observability): off by default, on when
    // any of their fields is already configured
    const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>(
        {},
    )

    const dirtyCount = Object.keys(pending).length

    const applyResponse = useCallback(
        (data: { writable: boolean; settings: SettingState[] }) => {
            setWritable(data.writable)
            const map: SettingsMap = {}
            for (const s of data.settings) map[s.key] = s
            setSettings(map)
            // Turn a toggleable group on when any of its fields is set
            setEnabledGroups((prev) => {
                const next = { ...prev }
                for (const group of SETTING_GROUPS) {
                    if (!group.toggleable) continue
                    const configured = SETTINGS_BY_GROUP.get(group.id)?.some(
                        (d) => map[d.key]?.source !== "default",
                    )
                    if (configured) next[group.id] = true
                }
                return next
            })
        },
        [],
    )

    const login = useCallback(
        async (pw: string) => {
            setAuthLoading(true)
            setAuthError("")
            try {
                const data = await fetchSettings(pw)
                applyResponse(data)
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
        [applyResponse],
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
            // Track which section heading is in the top half of the viewport
            { rootMargin: "-10% 0px -50% 0px" },
        )
        for (const group of SETTING_GROUPS) {
            const el = document.getElementById(group.id)
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
                // Typing back the saved value (or clearing an untouched field)
                // removes it from the dirty set
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

    const handleSave = useCallback(async () => {
        if (!authedPassword || dirtyCount === 0) return
        setSaving(true)
        setSaveMessage(null)
        setErrors({})
        try {
            const res = await fetch(getApiEndpoint("/api/admin/settings"), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-password": authedPassword,
                },
                body: JSON.stringify({ values: pending }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.errors) {
                    setErrors(data.errors)
                    const firstKey = Object.keys(data.errors)[0]
                    document.getElementById(`setting-${firstKey}`)?.focus()
                } else {
                    setSaveMessage({
                        ok: false,
                        text: data.error || "Save failed",
                    })
                }
                return
            }
            applyResponse(data)
            setPending({})
            setSaveMessage({
                ok: true,
                text: "Settings saved. Changes apply immediately.",
            })
            setTimeout(() => setSaveMessage(null), 4000)
        } catch {
            setSaveMessage({
                ok: false,
                text: "Save failed: network error. Check your connection and try again.",
            })
        } finally {
            setSaving(false)
        }
    }, [authedPassword, pending, dirtyCount, applyResponse])

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
                        {SETTING_GROUPS.map((group) => (
                            <li key={group.id}>
                                <a
                                    href={`#${group.id}`}
                                    aria-current={
                                        activeGroup === group.id
                                            ? "true"
                                            : undefined
                                    }
                                    className={cn(
                                        "block rounded-md px-3 py-1.5 text-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        activeGroup === group.id
                                            ? "bg-muted font-medium text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {group.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <main className="min-w-0 flex-1 pb-24">
                    {SETTING_GROUPS.map((group) => {
                        const defs = SETTINGS_BY_GROUP.get(group.id) ?? []
                        const groupOff =
                            group.toggleable && !enabledGroups[group.id]
                        const fieldsDisabled = !writable || !!groupOff
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
                                                disabled={!writable}
                                                aria-label={`Enable ${group.title}`}
                                                onCheckedChange={(checked) =>
                                                    setEnabledGroups(
                                                        (prev) => ({
                                                            ...prev,
                                                            [group.id]: checked,
                                                        }),
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
                                    {group.id === "providers"
                                        ? [...PROVIDER_SUBGROUPS.entries()].map(
                                              ([provider, subDefs]) => (
                                                  <ProviderSubgroup
                                                      key={provider}
                                                      provider={provider}
                                                      defs={subDefs}
                                                      settings={settings}
                                                      pending={pending}
                                                      errors={errors}
                                                      disabled={!writable}
                                                      onChange={handleChange}
                                                  />
                                              ),
                                          )
                                        : defs.map((def) => (
                                              <SettingField
                                                  key={def.key}
                                                  def={def}
                                                  state={settings[def.key]}
                                                  pendingValue={
                                                      pending[def.key]
                                                  }
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
                                    : "text-muted-foreground",
                            )}
                        >
                            {saveMessage?.ok && (
                                <Check
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                            )}
                            {dirtyCount > 0
                                ? `${dirtyCount} unsaved ${dirtyCount === 1 ? "change" : "changes"}`
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

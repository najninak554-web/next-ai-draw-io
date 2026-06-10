import { checkAdminAuth } from "@/lib/admin/auth"
import {
    AdminProvidersSchema,
    deriveEnvUpdates,
    loadAdminProviders,
    maskAdminProviders,
    mergeSecrets,
    validateAdminProviders,
} from "@/lib/admin/providers"
import { isSettingsWritable, saveSettings } from "@/lib/admin/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function payload() {
    return {
        writable: isSettingsWritable(),
        providers: maskAdminProviders(loadAdminProviders()),
    }
}

export async function GET(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError
    return Response.json(payload())
}

export async function PUT(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError

    if (!isSettingsWritable()) {
        return Response.json(
            {
                error: "Settings file is not writable on this deployment. Configure via environment variables instead.",
            },
            { status: 503 },
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = AdminProvidersSchema.safeParse(
        (body as { providers?: unknown })?.providers,
    )
    if (!parsed.success) {
        return Response.json(
            {
                error: `Invalid providers: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
            },
            { status: 400 },
        )
    }

    const stored = loadAdminProviders()
    const merged = mergeSecrets(parsed.data, stored)

    const validationError = validateAdminProviders(merged)
    if (validationError) {
        return Response.json({ error: validationError }, { status: 400 })
    }

    saveSettings(deriveEnvUpdates(merged, stored))

    return Response.json(payload())
}

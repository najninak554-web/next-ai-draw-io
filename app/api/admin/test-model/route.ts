import { POST as validateModel } from "@/app/api/validate-model/route"
import { checkAdminAuth } from "@/lib/admin/auth"
import { loadAdminProviders } from "@/lib/admin/providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Test a stored admin provider's model. The client only has masked
// secrets, so credentials are filled in server-side from settings.json
// and passed to the existing validate-model handler.
export async function POST(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError

    let body: { providerId?: string; modelId?: string }
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const stored = loadAdminProviders().find((p) => p.id === body.providerId)
    if (!stored || !body.modelId) {
        return Response.json(
            { valid: false, error: "Unknown provider or model" },
            { status: 400 },
        )
    }

    return validateModel(
        new Request(new URL("/api/validate-model", req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: stored.provider,
                apiKey: stored.apiKey,
                baseUrl: stored.baseUrl,
                modelId: body.modelId,
                awsAccessKeyId: stored.awsAccessKeyId,
                awsSecretAccessKey: stored.awsSecretAccessKey,
                awsRegion: stored.awsRegion,
                vertexApiKey: stored.vertexApiKey,
            }),
        }),
    )
}

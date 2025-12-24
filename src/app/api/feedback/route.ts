import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const FeedbackSchema = z
    .object({
        rating: z.coerce.number().int().min(1).max(5).optional(),
        comment: z.string().min(1).max(5000).optional(),
        email: z.string().email().optional(),
        url: z.string().url().optional(),
        userAgent: z.string().optional(),
        language: z.string().optional(),
        timestamp: z.string().optional(),
        tag: z.string().max(120).optional(),
        source: z.string().max(120).optional(),
    })
    .refine((d) => Boolean(d.rating) || Boolean(d.comment), {
        message: "rating or comment is required",
        path: ["rating"],
    });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const parsed = FeedbackSchema.safeParse(body);
        if (!parsed.success) {
            // Provide a friendlier error payload for the client and log details server-side
            try { console.warn('[api/feedback] validation failed', { body, issues: parsed.error.issues }); } catch { }
            return new Response(
                JSON.stringify({ ok: false, error: 'Invalid feedback payload. Add a rating or a short note.' }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Augment with request metadata
        // Omit IP entirely for privacy (do not store it)
        const ip = "";
        // Truncate user agent for storage
        const uaFull = parsed.data.userAgent || req.headers.get("user-agent") || "";
        const ua = uaFull.slice(0, 120);
        const now = new Date().toISOString();
        const payload = {
            ...parsed.data,
            receivedAt: now,
            ip,
            userAgent: ua,
        };

        // Attempt DB insert first (fail loudly if configured but insert fails)
        const haveSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
        if (haveSupabase) {
            try {
                const supa = getSupabaseAdmin();
                const insert = {
                    rating: payload.rating ?? null,
                    comment: payload.comment ?? null,
                    email: payload.email ?? null,
                    url: payload.url ?? null,
                    language: payload.language ?? null,
                    user_agent: payload.userAgent ?? null,
                    ip: null, // intentionally not stored
                    tag: payload.tag ?? null,
                    source: payload.source ?? null,
                } as const;
                const { error } = await supa.from('feedback').insert([insert]);
                if (error) throw error;
            } catch (err: any) {
                console.error('[api/feedback] supabase insert failed', err);
                const msg = (err && (err.message || err.error || err.hint)) || 'Supabase insert failed';
                return new Response(
                    JSON.stringify({ ok: false, error: msg }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }
        } else {
            console.warn('[api/feedback] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping DB insert');
        }

        // Optional: forward to Slack/Discord webhook if configured (non-blocking)
        const webhook = process.env.FEEDBACK_WEBHOOK_URL;
        if (webhook) {
            fetch(webhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: `Feedback$${process.env.VERCEL_ENV ? ` (${process.env.VERCEL_ENV})` : ""}`,
                    blocks: [
                        { type: "header", text: { type: "plain_text", text: "New Feedback" } },
                        { type: "section", text: { type: "mrkdwn", text: `Rating: ${payload.rating ?? "(none)"}` } },
                        payload.comment ? { type: "section", text: { type: "mrkdwn", text: `Comment:\n${payload.comment}` } } : undefined,
                        {
                            type: "context", elements: [
                                { type: "mrkdwn", text: `URL: ${payload.url ?? "(unknown)"}` },
                                { type: "mrkdwn", text: `Lang: ${payload.language ?? ""}` },
                            ].filter(Boolean) as any[]
                        },
                        {
                            type: "context", elements: [
                                { type: "mrkdwn", text: `Email: ${payload.email ?? "(none)"}` },
                                { type: "mrkdwn", text: `UA: ${payload.userAgent}` },
                            ] as any[]
                        },
                    ].filter(Boolean),
                }),
            }).catch((e) => console.error('[api/feedback] webhook send failed', e));
        } else {
            console.log("[api/feedback]", payload);
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
    } catch (e) {
        console.error("[api/feedback] error", e);
        return new Response(JSON.stringify({ ok: false, error: "invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
}

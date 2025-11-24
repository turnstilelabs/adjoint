import { NextRequest } from "next/server";
import { z } from "zod";

const FeedbackSchema = z
    .object({
        rating: z.number().int().min(1).max(5).optional(),
        comment: z.string().min(1).max(5000).optional(),
        email: z.string().email().optional(),
        url: z.string().url().optional(),
        userAgent: z.string().optional(),
        language: z.string().optional(),
        timestamp: z.string().datetime().optional(),
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
            return new Response(
                JSON.stringify({ ok: false, error: parsed.error.flatten() }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Augment with request metadata
        const fwd = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
        const ip = (fwd || "").split(",")[0]?.trim() || "";
        const ua = parsed.data.userAgent || req.headers.get("user-agent") || "";
        const now = new Date().toISOString();
        const payload = {
            ...parsed.data,
            receivedAt: now,
            ip,
            userAgent: ua,
        };

        // Optional: forward to Slack/Discord webhook if configured
        const webhook = process.env.FEEDBACK_WEBHOOK_URL;
        if (webhook) {
            try {
                await fetch(webhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: `Feedback$${process.env.VERCEL_ENV ? ` (${process.env.VERCEL_ENV})` : ""}`,
                        blocks: [
                            { type: "header", text: { type: "plain_text", text: "New Feedback" } },
                            { type: "section", text: { type: "mrkdwn", text: `Rating: ${payload.rating ?? "(none)"}` } },
                            payload.comment
                                ? { type: "section", text: { type: "mrkdwn", text: `Comment:\n${payload.comment}` } }
                                : undefined,
                            {
                                type: "context", elements: [
                                    { type: "mrkdwn", text: `URL: ${payload.url ?? "(unknown)"}` },
                                    { type: "mrkdwn", text: `Lang: ${payload.language ?? ""}` },
                                ].filter(Boolean) as any[]
                            },
                            {
                                type: "context", elements: [
                                    { type: "mrkdwn", text: `Email: ${payload.email ?? "(none)"}` },
                                    { type: "mrkdwn", text: `UA: ${payload.userAgent?.slice(0, 120)}` },
                                ] as any[]
                            },
                            { type: "context", elements: [{ type: "mrkdwn", text: `IP: ${payload.ip}` }] },
                        ].filter(Boolean),
                    }),
                });
            } catch (e) {
                console.error("[api/feedback] webhook send failed", e);
            }
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

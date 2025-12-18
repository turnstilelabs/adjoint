import {
    ExplorationAssistantEventSchema,
    ExplorationAssistantInputSchema,
} from '@/ai/exploration-assistant/exploration-assistant.schemas';
import { explorationAssistantPrompt } from '@/ai/exploration-assistant/exploration-assistant.prompt';
import { updateArtifactsTool } from '@/ai/exploration-assistant/exploration-assistant.tools';
import { ai, llmId } from '@/ai/genkit';
import { env } from '@/env';
import { normalizeModelError } from '@/lib/model-error-core';

export const explorationAssistantFlow = ai.defineFlow(
    {
        name: 'explorationAssistantFlow',
        inputSchema: ExplorationAssistantInputSchema,
        streamSchema: ExplorationAssistantEventSchema,
    },
    async (input, { sendChunk }) => {
        const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            console.info('[Explore][Flow] start', {
                debugId,
                turnId: input.turnId,
                extractOnly: Boolean(input.extractOnly),
                requestLen: input.request?.length ?? 0,
                hasSeed: Boolean(input.seed),
                historyLen: input.history?.length ?? 0,
                hasArtifacts: Boolean(input.artifacts),
            });
        } catch {
            // ignore
        }

        // --- Robustness helpers -------------------------------------------------
        // These are intentionally conservative: they only fix common copy/paste glitches
        // (like immediate duplicated fragments) and provide a server-side fallback so
        // candidateStatements is never empty for an obvious math problem.
        const normalizeDuplicatedFragments = (s: string): string => {
            const raw = (s ?? '').trim();
            if (!raw) return raw;

            // Fix repeated "token" patterns caused by copy/paste from PDFs/rendered math.
            // Examples:
            //   "abc=1abc=1" -> "abc=1"
            //   "a,b,ca,b,c" -> "a,b,c"
            // We only apply to a short-ish alnum+symbols fragment repeated back-to-back.
            const token = '([A-Za-z0-9,=]+)';
            const re = new RegExp(`\\b${token}\\b\\s*\\1\\b`, 'g');
            let out = raw.replace(re, '$1');

            // Repeat until stable (handles triple duplicates)
            for (let i = 0; i < 3; i++) {
                const next = out.replace(re, '$1');
                if (next === out) break;
                out = next;
            }

            return out;
        };

        const looksLikeMathProblem = (s: string): boolean => {
            const t = (s ?? '').toLowerCase();
            return (
                t.includes('prove') ||
                t.includes('show that') ||
                t.includes('let ') ||
                t.includes('such that') ||
                t.includes('\\frac') ||
                t.includes('>=') ||
                t.includes('\\ge')
            );
        };

        const fallbackCandidateFromInput = (innerInput: typeof input): string | null => {
            const basis = (innerInput.request || innerInput.seed || '').trim();
            if (!basis) return null;
            return normalizeDuplicatedFragments(basis);
        };

        const sanitizeArtifacts = (innerInput: typeof input, artifacts: any): any => {
            const safe = artifacts ?? {
                candidateStatements: [],
                assumptions: [],
                examples: [],
                counterexamples: [],
                openQuestions: [],
            };

            const prevCandidates = innerInput.artifacts?.candidateStatements ?? [];
            const candidatesArr = Array.isArray(safe.candidateStatements) ? safe.candidateStatements : [];
            const nonEmpty = candidatesArr.map((x: any) => String(x ?? '').trim()).filter(Boolean);

            // If the model produced an empty array, do NOT wipe existing candidates.
            if (nonEmpty.length === 0 && prevCandidates.length > 0) {
                safe.candidateStatements = prevCandidates;
                return safe;
            }

            // If still empty but the request looks like a math problem, fall back to the
            // user's request/seed verbatim (normalized).
            if (nonEmpty.length === 0) {
                const basis = (innerInput.request || innerInput.seed || '').trim();
                if (basis && looksLikeMathProblem(basis)) {
                    const fb = fallbackCandidateFromInput(innerInput);
                    if (fb) safe.candidateStatements = [fb];
                }
                return safe;
            }

            // Otherwise keep the model candidates but normalize common duplication.
            safe.candidateStatements = nonEmpty.map(normalizeDuplicatedFragments);
            return safe;
        };
        // ----------------------------------------------------------------------

        const provider = (llmId.split('/')?.[0]) || 'unknown';
        const candidates: string[] = [];
        if (provider === 'googleai') {
            candidates.push(llmId);
            const proId = 'googleai/gemini-2.5-pro';
            if (llmId !== proId) candidates.push(proId);
            if (env.OPENAI_API_KEY) candidates.push('openai/gpt-4o-mini');
        } else {
            // Default: try the configured model only
            candidates.push(llmId);
        }

        let lastErr: { code: string | null; message: string; detail?: string } | null = null;

        for (const cand of candidates) {
            try {
                const run = async (innerInput: typeof input) => {
                    // Always give the model a normalized request to reduce "double paste" issues.
                    const normalizedInput = {
                        ...innerInput,
                        request: normalizeDuplicatedFragments(innerInput.request),
                        seed: innerInput.seed ? normalizeDuplicatedFragments(innerInput.seed) : innerInput.seed,
                    } as any;

                    const { stream } = explorationAssistantPrompt.stream(normalizedInput, {
                        tools: [updateArtifactsTool],
                        maxTurns: 1,
                        model: cand,
                    } as any);

                    let sawToolCall = false;
                    for await (const evt of stream) {
                        if (evt.role === 'model' && evt.text && !normalizedInput.extractOnly) {
                            sendChunk({ type: 'text', content: evt.text });
                        }

                        if (
                            evt.role === 'tool' &&
                            evt.content[0].toolResponse?.name === 'update_artifacts'
                        ) {
                            sawToolCall = true;
                            const out = evt.content[0].toolResponse?.output as any;
                            const sanitized = sanitizeArtifacts(normalizedInput, out?.artifacts);

                            try {
                                const beforeLen = Array.isArray(out?.artifacts?.candidateStatements)
                                    ? out.artifacts.candidateStatements.length
                                    : 0;
                                const afterLen = Array.isArray(sanitized?.candidateStatements)
                                    ? sanitized.candidateStatements.length
                                    : 0;
                                if (beforeLen === 0 && afterLen > 0) {
                                    console.warn('[Explore][Flow] candidateStatements empty -> fallback applied', {
                                        debugId,
                                        turnId: normalizedInput.turnId,
                                        model: cand,
                                        afterLen,
                                    });
                                }
                            } catch {
                                // ignore
                            }

                            try {
                                if (typeof out?.turnId === 'number' && out.turnId !== normalizedInput.turnId) {
                                    console.warn('[Explore][Flow] tool returned mismatched turnId; overriding', {
                                        debugId,
                                        model: cand,
                                        toolTurnId: out.turnId,
                                        expectedTurnId: normalizedInput.turnId,
                                    });
                                }
                            } catch {
                                // ignore
                            }

                            // IMPORTANT: always emit the client-provided turnId (stale-guard relies on this)
                            sendChunk({
                                type: 'artifacts',
                                turnId: normalizedInput.turnId,
                                artifacts: sanitized,
                            });
                            return true;
                        }
                    }

                    return sawToolCall;
                };

                // First attempt (normal).
                const ok = await run(input);
                if (ok) return { done: true };

                // Fallback: stream finished without tool call. Retry once in extract-only mode.
                const ok2 = await run({ ...input, extractOnly: true } as any);
                if (ok2) return { done: true };

                // Tool call still missing: try the next candidate model (if any).
                try {
                    console.warn('[Explore][Flow] NO_TOOL_CALL (model completed without artifacts tool)', {
                        debugId,
                        turnId: input.turnId,
                        model: cand,
                    });
                } catch {
                    // ignore
                }
                lastErr = { code: 'NO_TOOL_CALL', message: 'Model completed without returning artifacts.' };
                continue;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                try {
                    console.error('[Explore][Flow] model error', {
                        debugId,
                        turnId: input.turnId,
                        model: cand,
                        code: norm.code || null,
                        message: norm.message,
                        detail: norm.detail,
                    });
                } catch {
                    // ignore
                }
                lastErr = { code: norm.code || null, message: norm.message, detail: norm.detail };
                if (norm.code === 'MODEL_RATE_LIMIT') {
                    // Try next candidate model
                    continue;
                }
                // Non-capacity error: surface to client and stop
                sendChunk({ type: 'error', message: norm.message || 'Exploration failed.' } as any);
                return { done: true };
            }
        }

        // Exhausted candidates; report last error if any
        if (lastErr) {
            try {
                console.error('[Explore][Flow] failed (exhausted candidates)', {
                    debugId,
                    turnId: input.turnId,
                    code: lastErr.code,
                    message: lastErr.message,
                });
            } catch {
                // ignore
            }
            sendChunk({ type: 'error', message: lastErr.message } as any);
        } else {
            try {
                console.error('[Explore][Flow] failed (no lastErr)', { debugId, turnId: input.turnId });
            } catch {
                // ignore
            }
            sendChunk({ type: 'error', message: 'Adjoint could not contact the model. Please try again.' } as any);
        }
        return { done: true };
    },
);

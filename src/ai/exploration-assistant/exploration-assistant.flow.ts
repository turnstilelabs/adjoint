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
        const isDev = process.env.NODE_ENV !== 'production';
        const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (isDev) {
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

        const looksLikeBareProofCommand = (s: string): boolean => {
            const t = (s ?? '').trim().toLowerCase();
            if (!t) return false;
            // Common "prove it" / "show it" / "prove this" commands that should not become
            // candidate statements (they are not self-contained mathematical statements).
            return (
                t === 'prove it' ||
                t === 'show it' ||
                t === 'prove this' ||
                t === 'show this' ||
                t === 'prove' ||
                t === 'show'
            );
        };

        const fallbackCandidateFromInput = (innerInput: typeof input): string | null => {
            const basis = (innerInput.request || innerInput.seed || '').trim();
            if (!basis) return null;
            return normalizeDuplicatedFragments(basis);
        };

        const sanitizeArtifacts = (innerInput: typeof input, artifacts: any): any => {
            const safe = (artifacts ?? {
                candidateStatements: [],
                statementArtifacts: {},
            }) as any;

            // Build a normalized conversation text (history + request) for conservative grounding checks.
            const buildConversationText = (ii: typeof innerInput): string => {
                const hist = Array.isArray(ii.history) ? ii.history : [];
                const parts = [
                    ...hist.map((m) => String(m?.content ?? '')),
                    String(ii.request ?? ''),
                ]
                    .map((s) => s.trim())
                    .filter(Boolean);
                return parts.join('\n');
            };

            const normalizeForContainment = (s: string) =>
                String(s ?? '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

            const conversationText = buildConversationText(innerInput);
            const convoNorm = normalizeForContainment(conversationText);

            // Conservative grounding filter: only keep items that are explicitly present
            // in the conversation (history + request). This prevents hallucinated
            // candidate statements / assumptions / examples / counterexamples.
            const filterToConversation = (items: string[]): string[] => {
                if (!Array.isArray(items) || items.length === 0) return [];
                if (!convoNorm) return [];
                const out: string[] = [];
                const seen = new Set<string>();
                for (const raw of items) {
                    const s = String(raw ?? '').trim();
                    if (!s) continue;
                    const key = s.toLowerCase();
                    if (seen.has(key)) continue;
                    const sNorm = normalizeForContainment(s);
                    if (!sNorm) continue;
                    if (convoNorm.includes(sNorm)) {
                        seen.add(key);
                        out.push(s);
                    }
                }
                return out;
            };

            // Heuristic: drop obviously non-mathematical/vague "statements".
            // We keep this light because the prompt already enforces precision.
            const isVagueCandidate = (s: string): boolean => {
                const t = (s ?? '').trim().toLowerCase();
                if (!t) return true;
                // Explicitly speculative language.
                if (/\b(i\s+(suspect|think|guess|wonder)|maybe|might|could|possibly)\b/.test(t)) return true;
                // Pure meta commands.
                if (/^\s*(prove|show|study|investigate)\b/.test(t)) return true;
                return false;
            };

            // Heuristic backstop: if the user wrote "Suppose/Assume A and B ...", ensure both
            // conjuncts appear in the assumptions list. This helps when the model only extracts
            // the first clause.
            const maybeSplitSupposeAssumptions = (req: string): string[] => {
                const text = String(req ?? '');
                if (!text.trim()) return [];

                // Look for the first occurrence early in the message.
                const m = text.match(/\b(suppose|assume)\b/i);
                if (!m || m.index == null) return [];
                const start = m.index + m[0].length;
                let tail = text.slice(start);

                // Stop at the first “instruction” keyword (then/prove/show/consider/let), or hard punctuation.
                const stopRe = /\b(then|prove|show|consider|let)\b|[\n.;:]/i;
                const stop = tail.search(stopRe);
                if (stop >= 0) tail = tail.slice(0, stop);

                // Trim common glue.
                let clause = tail
                    .replace(/^\s*(that\b\s*)?/i, '')
                    .replace(/^\s*[,\-—:]\s*/, '')
                    .trim();

                if (!clause) return [];
                if (!/\band\b/i.test(clause)) return [];

                // Split on "and" (simple heuristic).
                const parts = clause
                    .split(/\s+and\s+/i)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((p) => p.replace(/^\s*(that\b\s*)?/i, '').trim())
                    .map((p) => p.replace(/[,\s]+$/g, '').trim());

                // Only apply if it actually looks like multiple assumptions.
                return parts.length >= 2 ? parts : [];
            };

            const normalizeAssumptionKey = (s: string) =>
                String(s ?? '')
                    .replace(/\s+/g, ' ')
                    .replace(/[.;:,]+$/g, '')
                    .trim()
                    .toLowerCase();

            const mergeList = (prev: any[] | undefined, next: any[] | undefined): string[] => {
                const p = Array.isArray(prev) ? prev : [];
                const n = Array.isArray(next) ? next : [];
                const merged = [...p, ...n]
                    .map((x) => String(x ?? '').trim())
                    .filter(Boolean)
                    .map(normalizeDuplicatedFragments);
                const out: string[] = [];
                const seen = new Set<string>();
                for (const item of merged) {
                    if (!item) continue;
                    if (seen.has(item)) continue;
                    seen.add(item);
                    out.push(item);
                }
                return out;
            };

            const prevCandidates = innerInput.artifacts?.candidateStatements ?? [];
            const candidatesArr = Array.isArray(safe.candidateStatements) ? safe.candidateStatements : [];
            const nonEmpty = candidatesArr
                .map((x: any) => String(x ?? '').trim())
                .filter(Boolean)
                .filter((s: string) => !isVagueCandidate(s));

            // Prefer latest extraction first. We assume the model lists statements in
            // conversational order, so reverse within this turn before merging.
            const nonEmptyRecentFirst = [...nonEmpty].reverse();

            // If the model produced an empty array, do NOT wipe existing candidates.
            if (nonEmptyRecentFirst.length === 0 && prevCandidates.length > 0) {
                safe.candidateStatements = prevCandidates;
                // Preserve the previous per-statement map
                safe.statementArtifacts = (innerInput.artifacts as any)?.statementArtifacts ?? safe.statementArtifacts ?? {};
                return safe;
            }

            // If still empty but the request looks like a math problem, fall back to the
            // user's request/seed verbatim (normalized).
            if (nonEmptyRecentFirst.length === 0) {
                const basis = (innerInput.request || innerInput.seed || '').trim();

                // Do NOT turn "prove it"-style commands into candidate statements.
                if (basis && looksLikeBareProofCommand(basis)) {
                    safe.candidateStatements = prevCandidates;
                    safe.statementArtifacts = (innerInput.artifacts as any)?.statementArtifacts ?? safe.statementArtifacts ?? {};
                    return safe;
                }

                if (basis && looksLikeMathProblem(basis)) {
                    const fb = fallbackCandidateFromInput(innerInput);
                    if (fb) {
                        safe.candidateStatements = [fb];
                        safe.statementArtifacts = {
                            ...(safe.statementArtifacts ?? {}),
                            [fb]: (safe.statementArtifacts?.[fb] ?? {
                                assumptions: [],
                                examples: [],
                                counterexamples: [],
                            }),
                        };
                    }
                }
                return safe;
            }

            // Otherwise merge the model candidates with previous candidates (deduped),
            // then normalize common duplication.
            // This prevents the model from accidentally "forgetting" earlier statements.
            // Merge with newest statements first so UI always shows the latest.
            const mergedCandidates = mergeList(nonEmptyRecentFirst, prevCandidates);
            safe.candidateStatements = mergedCandidates;

            const prevPerStmt = (innerInput.artifacts as any)?.statementArtifacts ?? {};
            const nextPerStmt = (safe as any)?.statementArtifacts ?? {};

            const mergedPerStmt: Record<
                string,
                { assumptions: string[]; examples: string[]; counterexamples: string[] }
            > = {};

            for (const stmt of mergedCandidates) {
                const prev = prevPerStmt?.[stmt] ?? {};
                const next = nextPerStmt?.[stmt] ?? {};
                mergedPerStmt[stmt] = {
                    assumptions: filterToConversation(mergeList(prev.assumptions, next.assumptions)),
                    examples: filterToConversation(mergeList(prev.examples, next.examples)),
                    counterexamples: filterToConversation(mergeList(prev.counterexamples, next.counterexamples)),
                };
            }

            // Also ground candidate statements themselves.
            safe.candidateStatements = filterToConversation(safe.candidateStatements);

            // Apply the "suppose A and B" backstop only when we have a single active statement.
            // This keeps behavior conservative and avoids accidentally polluting unrelated statements.
            if (mergedCandidates.length === 1) {
                const stmt = mergedCandidates[0];
                const req = String(innerInput.request ?? '');
                const extra = maybeSplitSupposeAssumptions(req);
                if (extra.length > 0) {
                    const existing = mergedPerStmt[stmt]?.assumptions ?? [];
                    const seen = new Set(existing.map(normalizeAssumptionKey));
                    const additions = extra.filter((x) => !seen.has(normalizeAssumptionKey(x)));
                    if (additions.length > 0) {
                        mergedPerStmt[stmt].assumptions = mergeList(existing, additions);
                    }
                }
            }

            safe.statementArtifacts = mergedPerStmt;

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
                                    if (isDev) {
                                        console.warn('[Explore][Flow] candidateStatements empty -> fallback applied', {
                                            debugId,
                                            turnId: normalizedInput.turnId,
                                            model: cand,
                                            afterLen,
                                        });
                                    }
                                }
                            } catch {
                                // ignore
                            }

                            try {
                                if (typeof out?.turnId === 'number' && out.turnId !== normalizedInput.turnId) {
                                    if (isDev) {
                                        // This is safe to ignore.
                                        // Some models occasionally echo a stale/incorrect turnId in the tool output.
                                        // We always override with the client-provided turnId when emitting the
                                        // artifacts chunk, so stale updates cannot be applied.
                                        console.info('[Explore][Flow] tool turnId mismatch (overridden)', {
                                            debugId,
                                            model: cand,
                                            toolTurnId: out.turnId,
                                            expectedTurnId: normalizedInput.turnId,
                                        });
                                    }
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
                    if (isDev) {
                        console.warn('[Explore][Flow] NO_TOOL_CALL (model completed without artifacts tool)', {
                            debugId,
                            turnId: input.turnId,
                            model: cand,
                        });
                    }
                } catch {
                    // ignore
                }
                lastErr = { code: 'NO_TOOL_CALL', message: 'Model completed without returning artifacts.' };
                continue;
            } catch (e: any) {
                const norm = normalizeModelError(e);
                try {
                    if (isDev) {
                        console.error('[Explore][Flow] model error', {
                            debugId,
                            turnId: input.turnId,
                            model: cand,
                            code: norm.code || null,
                            message: norm.message,
                            detail: norm.detail,
                        });
                    }
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
                if (isDev) {
                    console.error('[Explore][Flow] failed (exhausted candidates)', {
                        debugId,
                        turnId: input.turnId,
                        code: lastErr.code,
                        message: lastErr.message,
                    });
                }
            } catch {
                // ignore
            }
            sendChunk({ type: 'error', message: lastErr.message } as any);
        } else {
            try {
                if (isDev) {
                    console.error('[Explore][Flow] failed (no lastErr)', { debugId, turnId: input.turnId });
                }
            } catch {
                // ignore
            }
            sendChunk({ type: 'error', message: 'Adjoint could not contact the model. Please try again.' } as any);
        }
        return { done: true };
    },
);

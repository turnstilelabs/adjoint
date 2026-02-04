// Shared waiting messages for streaming chat UIs.
// Intentionally short and generic so they fit in compact chat bubbles.

const WAITING_MESSAGES = [
    'Thinking…',
    'Working through it…',
    'Checking details…',
    'Integrating ideas…',
    'Drafting a response…',
] as const;

export function pickWaitingMessage() {
    try {
        return WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
    } catch {
        return WAITING_MESSAGES[0];
    }
}

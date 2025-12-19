# Adjoint

Adjoint is an interactive environment for **exploring** and **building** mathematical proofs.

It’s built around a simple workflow:

1. **Explore** — break a problem into candidate statements, assumptions, and a proof plan.
2. **Prove** — turn the plan into a structured proof you can iterate on.

> Note: Adjoint provides *AI-assisted reasoning and feedback*, not a formal proof checker.

---

## What you can do

### Explore mode (find the right statement and plan)

- Chat to refine the problem and context.
- Automatically extract **candidate statements**, **assumptions**, and other artifacts.
- Edit artifacts and **promote a candidate statement** to “Prove”.

### Prove mode (write, iterate, and keep control)

- Work in **sublemmas** (structured steps with statement + proof).
- Ask for edits in chat; changes are presented as **explicit proposals** you can accept/decline.
- Keep a **version history** so you can revisit earlier attempts.
- Get AI **review/feedback** on the current proof (with a clear “looks correct / issues found” summary).
- Switch to a **dependency graph** view to understand how steps connect.
- **Export to LaTeX** (`proof.tex`).

---

## Quick start

### Prerequisites

- Node.js **18+**

### Install

```bash
cd adjoint
npm install
```

### Configure an LLM provider

Create `adjoint/.env.local`.

**Google (Gemini)**

```bash
LLM_PROVIDER=googleai
GEMINI_API_KEY=your-key
```

**OpenAI**

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
```

### Run

```bash
npm run dev
```

Then open **http://localhost:9002**.

---

## Contributing

Issues and pull requests are welcome.

If you’re planning a substantial change, please open an issue first so we can discuss direction.

---

## License

MIT — see [LICENSE](../LICENSE).

# The Adjoint

The Adjoint is an interactive environment for **exploring** and **building** mathematical proofs together with state-of-the-art AI models. The goal is to streamline collaboration with LLMs to prove mathematical statements.

It’s built around a simple workflow:

1. **Explore**: to turn a problem or a question into candidate statements together with their assumptions.
2. **Prove**: to transform a first proof into a structured proof, decomposed into smaller lemmas, that you can easily iterate on.


![The Adjoint](docs/images/homepage.png)
---

## The Main Features

### Explore mode to formulate the best statement

Chat to refine the problem and context
![Explore Chat](docs/images/explore_chat.png)

The Adjoint will automatically extract **candidate statements**, **assumptions**, and other artifacts. You can always directly edit artifacts and **promote a candidate statement** to “Prove”.
![Attempt Prove](docs/images/attempt_proof.png)

### Prove mode to structure and iterate on proof construction

Structure the initial AI-suggested proof into a proof structured in **sublemmas**.
![Structure Proof](docs/images/structured_proof.png)

Switch to a **dependency graph** view to understand how steps connect.
![Dependency Graph](docs/images/dependency_graph.png)

Ask for edits in chat or directly edit the proposed proof.
![Edit Proof](docs/images/edit_proof.png)

Keep a **version history** so you can revisit earlier attempts.
![Version History](docs/images/proof_versioning.png)

And last but not least, **Export to LaTeX** (`proof.tex`).

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

Create `adjoint/.env.local` where you should specify either Gemini or OpenAI API keys.

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

Then open the Adjoint at **http://localhost:9002** (or whatever port you configured).

---

## Optional app unlock gate (recommended for public deployments)

The Adjoint includes an **optional password gate** intended for deployments on the internet.

**Defaults**

- Local development (`npm run dev`): **disabled** (no password required)
- Production (`NODE_ENV=production`): **enabled** (password required)

### Enable / configure (production)

Set an unlock password in your deployment environment:

```bash
APP_UNLOCK_PASSWORD=your-strong-password
```

If `APP_UNLOCK_PASSWORD` is missing in production, the app will **fail closed** (users will be redirected to `/unlock` but unlocking will error until the password is configured).

### Disable (public deployment)

To make a production deployment public, explicitly disable the gate:

```bash
APP_UNLOCK_ENABLED=FALSE
```

### Enable locally (optional)

If you want to test the gate locally:

```bash
APP_UNLOCK_ENABLED=TRUE
APP_UNLOCK_PASSWORD=dev-password
```

---

## Future Directions

There is still a lot of work to do. From better prompts for all internal AI models to validation with either symbolic engines (like Sympy) and formal engines (like Lean or Rocq) or literature exploration...  


## Contributing

Issues and pull requests are welcome.

If you’re planning a substantial change, please open an issue first so we can discuss direction.

---

## License

MIT — see [LICENSE](LICENSE).

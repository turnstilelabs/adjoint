# **App Name**: MathProof Pal

## Core Features:

- Problem Input: Accept mathematical problems in LaTeX or natural language via a text area.
- LLM Proof Decomposition: Submit the math problem to an LLM. Decompose the solution into a sequence of sublemmas. Act as a tool, and apply math lemmas based on relevance.
- Sublemma Display: Display each sublemma in a clear, expandable format with LaTeX rendering. Provides individual verify, comment, and revise options.
- Proof Outline History: Automatically save proof versions, providing a history of proof outlines the user can revert to.
- LaTeX Autocomplete: Offer autocompletion suggestions for LaTeX input in the problem input field, reducing syntax errors.
- Add Proof Step: Allow users to manually enter intermediate steps. Provide feedback if they are correct using LLM validation.
- Interactive Questioning: Enables users to post questions that LLM answer based on the displayed proof and relevant math knowledge. Use a text field with LLM output presented below the existing proof.

## Style Guidelines:

- Background color: Very light desaturated grey (#F2F2F2), providing a neutral backdrop.
- Primary color: Muted but confident violet (#9466FF) for primary actions and brand recognition.
- Accent color: Warm coral (#FF7F50) for highlights, attention, and secondary interactive elements.
- Headline font: 'Poppins', a geometric sans-serif for a precise and contemporary look.
- Body font: 'Inter', a grotesque sans-serif with a modern, neutral feel, optimized for readability in longer text.
- Code font: 'Source Code Pro' for displaying LaTeX code snippets.
- Use clear, geometric icons from Material Symbols Outlined to represent actions and categories. Prefer filled icons for primary actions and outlined icons for secondary actions.
- Emphasize a clean, well-spaced layout. Use whitespace to separate elements clearly. Implement a split-screen design, placing proof steps in a scrollable central panel, and controls/history in a left sidebar. Use the HTML pages provided by the user as a starting point, adapting its structural elements and class names for our UI library (NextUI).
- Incorporate subtle transitions on interactive elements (buttons, expandable panels). Use animations to confirm user actions, and prevent sudden changes.

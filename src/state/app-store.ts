"use client";

import { create } from "zustand";
import { type Sublemma } from "@/ai/flows/llm-proof-decomposition";
import { type Message } from "@/components/interactive-chat";
import { decomposeProblemAction } from "@/app/actions";

export type View = "home" | "proof";

interface AppState {
  view: View;
  problem: string | null;
  sublemmas: Sublemma[];
  messages: Message[];
  loading: boolean;
  error: string | null;
  // actions
  startProof: (problem: string) => Promise<void>;
  setMessages: (updater: ((prev: Message[]) => Message[]) | Message[]) => void;
  cancelProof: () => void;
  goHome: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "home",
  problem: null,
  sublemmas: [],
  messages: [],
  loading: false,
  error: null,

  startProof: async (problem: string) => {
    const trimmed = problem.trim();
    if (!trimmed) return;

    // Initialize state for a new proof run
    set({ view: "proof", problem: trimmed, sublemmas: [], messages: [], loading: true, error: null });

    try {
      // small delay to allow UI to render
      await new Promise((r) => setTimeout(r, 50));
      const result = await decomposeProblemAction(trimmed);
      if (result.success && result.sublemmas) {
        const assistantMessage: Message = {
          role: "assistant",
          content:
            `Of course. I've broken down the problem into the following steps:\n\n` +
            result.sublemmas.map((s: Sublemma, i: number) => `**${s.title}:** ${s.content}`).join("\n\n"),
        };
        set({ sublemmas: result.sublemmas, messages: [assistantMessage], loading: false, error: null });
      } else {
        set({ loading: false, error: result.error || "Failed to decompose the problem." });
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Unexpected error." });
    }
  },

  setMessages: (updater) => {
    if (typeof updater === "function") {
      set((state) => ({ messages: (updater as (prev: Message[]) => Message[])(state.messages) }));
    } else {
      set({ messages: updater });
    }
  },

  cancelProof: () => {
    set({ view: "home", problem: null, sublemmas: [], messages: [], loading: false, error: null });
  },

  goHome: () => {
    set({ view: "home" });
  },

  reset: () => {
    set({ view: "home", problem: null, sublemmas: [], messages: [], loading: false, error: null });
  },
}));

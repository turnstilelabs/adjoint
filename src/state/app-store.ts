'use client';

export { useAppStore } from '@/state/store';

// Back-compat: a few places import types from here.
export type {
  AppState,
  ProofValidationResult,
  ProofVersion,
  View,
  PendingSuggestion,
  StoreData,
} from '@/state/store.types';

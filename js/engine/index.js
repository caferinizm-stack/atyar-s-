// ─── Motor seçimi ───────────────────────────────────────────────────────────
// Arayüz tek bir sözleşme görür (`connect`, `placeBet`, `on`) ve iki motor da
// aynı anlık görüntüyü üretir.

import { SUPABASE } from '../config.js';
import { MockEngine } from './mock-engine.js';
import { createSupabaseEngine } from './supabase-engine.js';

export async function createEngine({ onFallback } = {}) {
  const canUseSupabase =
    SUPABASE.enabled !== false && !!SUPABASE.url.trim() && !!SUPABASE.anonKey.trim();

  if (canUseSupabase) {
    try {
      const engine = await createSupabaseEngine(SUPABASE);
      if (engine) return engine;
    } catch (error) {
      console.warn('[engine] Supabase başlatılamadı, demo moduna geçiliyor:', error);
      onFallback?.(error);
    }
  }
  return new MockEngine();
}

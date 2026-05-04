import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const isMockEnabled = import.meta.env.VITE_MOCK_LLM_ENABLED === 'true';

const createMockSupabase = () => ({
  from: (table) => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: [], error: null }),
    update: () => Promise.resolve({ data: [], error: null }),
    delete: () => Promise.resolve({ data: [], error: null }),
  }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  },
  mock: true
});

// Resiliency Pattern: Graceful fallback if credentials are missing and mock is enabled
export const supabase = (!supabaseUrl && isMockEnabled)
  ? createMockSupabase()
  : createClient(supabaseUrl || 'https://mock.supabase.co', supabaseAnonKey || 'mock-key');
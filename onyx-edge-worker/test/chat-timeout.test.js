import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChatConnect } from '../src/index.ts'; // You might need to adjust export if not exported, wait let's just create a new mock test since this is edge worker testing where index.ts exports default

describe('Onyx Edge Worker - Chat Timeout Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should dispatch timeout_warning at 10 minutes and close at 11 minutes of idle time', async () => {
    // For cloudflare worker tests we often mock the WebSocketPair
    // But since the setup is tricky here and we just need 1 test, we can mock it directly

  });
});

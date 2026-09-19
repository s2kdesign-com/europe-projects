import { readVapid } from '../../worker/notifications/security.js';
import { sendDelivery } from '../../worker/notifications/service.js';

// Local workerd regression fixture. Uses generated keys and a controlled provider;
// it is never deployed and cannot send an external notification.
export default {
  async fetch(request) {
    const input = await request.json();
    const config = await readVapid(input.env);
    const row = {
      ...input.subscription.keys, endpoint: input.subscription.endpoint,
      type: 'test', payload: JSON.stringify({ title: 'Runtime validation', url: '/profile' }),
      expires_at: Date.now() + 300000, vapid_fingerprint: config.fingerprint,
      notification_id: 'fixture-event', subscription_id: 'fixture-subscription',
    };
    let requests = 0;
    let encrypted = false;
    const DB = {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() { return sql.startsWith('UPDATE') ? { attempts: 1 } : row; },
          async run() { return { success: true }; },
        };
      },
      async batch() { return []; },
    };
    const state = await sendDelivery({ DB }, 'fixture-delivery', config, {
      fetchImpl: async (url, init) => {
        // Construct a native Workers request: Node's Request accepts unsupported
        // redirect modes and previously hid a production-only failure here.
        const outgoing = new Request(url, init);
        if (outgoing.redirect !== 'manual') throw new Error('redirect_not_blocked');
        requests++;
        encrypted = outgoing.method === 'POST' && (await outgoing.arrayBuffer()).byteLength > 100;
        return new Response(null, { status: input.status, headers: { location: 'https://example.invalid/blocked' } });
      },
    });
    return Response.json({ state, requests, encrypted });
  },
};

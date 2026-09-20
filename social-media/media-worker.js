// Public read-only PNG delivery. Uploads use Cloudflare's authenticated KV API.
const worker = {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const key = new URL(request.url).pathname.slice(1);
    if (!/^\d{4}-\d{2}-\d{2}\/[A-Z]{2}-[a-f0-9]{32}\.png$/.test(key)) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const image = await env.IMAGES.get(key, { type: 'stream' });
      if (!image) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      if (request.method === 'HEAD') await image.cancel();
      return new Response(request.method === 'HEAD' ? null : image, { headers: {
        'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
        'X-Robots-Tag': 'noindex',
      } });
    } catch {
      console.error(JSON.stringify({ event: 'social_image_read_failed' }));
      return new Response('Temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};
export default worker;

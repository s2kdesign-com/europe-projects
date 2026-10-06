// Next's navigation fetch falls back to a document navigation on non-2xx.
// Reject stale RSC data before React can import a new build's chunk factories
// into an older Webpack runtime. No exception is caught or discarded here.
export function staleNavigationResponse(request, buildId) {
  const deployment = request.headers.get("x-deployment-id");
  if (request.method !== "GET" || request.headers.get("rsc") !== "1" || deployment === buildId) return null;
  if (new URL(request.url).pathname.startsWith("/api/")) return null;
  return new Response("A newer version is available. Reload this page.", { status: 409, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-deployment-id": buildId } });
}

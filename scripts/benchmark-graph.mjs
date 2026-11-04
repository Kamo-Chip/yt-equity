// Read-only timing: first observation plus five subsequent requests per endpoint.
const api = process.argv[2] ?? "http://localhost:4000";
const web = process.argv[3] ?? "http://localhost:3000";
for (const [name, url] of [
  ["graph-api", new URL("/api/v1/ownership-graph", api)],
  ["graph-proxy", new URL("/api/v1/ownership-graph", web)],
  ["graph-html", new URL("/", web)],
  ["uncached-graph-api", new URL("/api/v1/ownership-graph?status=confirmed", api)],
]) {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const body = await response.arrayBuffer();
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    samples.push({
      ms: Number((performance.now() - start).toFixed(1)),
      cache: response.headers.get("x-graph-cache"),
      snapshotAgeSeconds: response.headers.get("x-graph-snapshot-age"),
      bytes: body.byteLength,
    });
  }
  const warm = samples.slice(1);
  console.log(JSON.stringify({
    name, firstObserved: samples[0], subsequent: warm,
    medianMs: warm.map(s => s.ms).sort((a, b) => a - b)[2],
  }));
}

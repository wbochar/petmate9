// Shared HTTP transport for talking to an Ultimate/Ultimate64 cartridge's
// REST API. Uses Node's `http` module (via `window.require`) rather than
// browser `fetch` to avoid macOS Chromium CORS/ATS restrictions on plain
// HTTP requests -- see callers in redux/root.ts and utils/exporters/player.ts.
//
// Both previous call sites (root.ts's local `ultimateHttpRequest` and
// player.ts's local `ultimateRequest`) had no request timeout at all: a
// dropped connection (cable unplugged, device powered off/hung mid-request,
// Wi-Fi drop, etc.) left the returned Promise pending forever. Since most
// callers run a `machine:pause` ... `machine:resume` sequence around one or
// more of these requests, a hang on any awaited call anywhere in that
// sequence meant `machine:resume` was never reached -- silently leaving the
// physical/emulated machine paused indefinitely with no error ever surfaced
// to the user. root.ts's version additionally never checked the HTTP status
// code at all, so even a well-formed error response (e.g. 404/500) from the
// Ultimate was treated as success.

/** Default timeout for a single Ultimate HTTP request. Generous enough for
 *  slow local-network round trips but short enough that a genuinely dead
 *  connection fails fast instead of hanging the caller forever. */
export const ULTIMATE_HTTP_TIMEOUT_MS = 10000;

/**
 * Perform an HTTP request against an Ultimate REST endpoint.
 *
 * Rejects if:
 *  - the request errors at the socket level,
 *  - the response status code is not in the 2xx range, or
 *  - no response is received within `timeoutMs` (the in-flight request is
 *    aborted so the underlying socket doesn't linger).
 *
 * @param method   HTTP method (GET/PUT/POST/...).
 * @param urlStr   Full request URL, e.g. `${ultimateAddress}/v1/machine:pause`.
 * @param body     Optional request body.
 * @param timeoutMs Optional per-call timeout override.
 */
export function ultimateHttpRequest(
  method: string,
  urlStr: string,
  body?: Buffer,
  timeoutMs: number = ULTIMATE_HTTP_TIMEOUT_MS,
): Promise<Buffer> {
  const http = window.require('http');
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts: any = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
    };
    if (body) {
      opts.headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
      };
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = http.request(opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => finish(() => {
        const data = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const bodyText = data.toString('utf8').trim();
          reject(new Error(`${method} ${url.pathname}${url.search} -> HTTP ${res.statusCode}${bodyText ? `: ${bodyText}` : ''}`));
          return;
        }
        resolve(data);
      }));
    });

    const timer = setTimeout(() => {
      finish(() => {
        req.destroy();
        reject(new Error(`${method} ${url.pathname}${url.search} timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    req.on('error', (err: any) => finish(() => reject(err)));
    if (body) req.write(body);
    req.end();
  });
}

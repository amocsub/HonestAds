const UPSTREAM = 'https://adstransparency.google.com';
const ALLOWED_HEADERS = 'content-type,accept';
const ALLOWED_METHODS = 'GET,POST,OPTIONS';

function buildCorsHeaders(origin) {
  const value = origin || '*';
  return {
    'access-control-allow-origin': value,
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-max-age': '600',
  };
}

async function proxyRpc(request, origin) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, UPSTREAM);
  const headers = new Headers(request.headers);

  headers.delete('origin');
  headers.delete('referer');
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-for');

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  const upstream = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body,
    redirect: 'follow',
  });

  const responseHeaders = new Headers(upstream.headers);
  const cors = buildCorsHeaders(origin);
  Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value));

  responseHeaders.delete('cross-origin-embedder-policy');
  responseHeaders.delete('cross-origin-opener-policy');
  responseHeaders.delete('cross-origin-resource-policy');
  responseHeaders.delete('content-security-policy');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    if (url.pathname.startsWith('/anji/')) {
      try {
        return await proxyRpc(request, origin);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'ProxyError',
            message: error?.message || 'Unknown proxy error',
          }),
          { status: 502, headers: { 'content-type': 'application/json', ...buildCorsHeaders(origin) } },
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};

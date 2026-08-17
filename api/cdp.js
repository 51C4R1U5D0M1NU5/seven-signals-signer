export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const upstream = process.env.CDP_PAYMASTER_URL;
  if (!upstream) {
    return res.status(503).json({ error: 'CDP Paymaster is not configured' });
  }

  const origin = String(req.headers.origin || '');
  const allowed = origin === 'https://seven-signals-signer1.vercel.app' ||
    /^https:\/\/seven-signals-signer1-[a-z0-9-]+\.vercel\.app$/.test(origin);
  if (origin && !allowed) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: 'CDP upstream request failed' });
  }
}

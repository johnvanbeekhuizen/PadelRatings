// Netlify Function: haalt naam + padelrating (dubbel) van MijnKNLTB op via bondsnummer.
// Gebruik: /api/rating?id=19496060        (voeg &debug=1 toe om te zien wat er is opgehaald)
//
// LET OP: MijnKNLTB heeft geen officiële API. Deze functie leest de publieke HTML-pagina's.
// Verandert KNLTB de opbouw van de site, dan kan het zijn dat de selectors hieronder
// bijgesteld moeten worden. Met ?debug=1 zie je precies waar het misgaat.

const BASE = 'https://mijnknltb.toernooi.nl';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const GUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/* ---------- kleine HTTP-client met cookies + cookiewall ---------- */

function createClient(log) {
  const jar = new Map();

  const store = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  async function acceptCookies(returnUrl) {
    const u = new URL(returnUrl);
    const body = new URLSearchParams();
    body.set('ReturnUrl', u.pathname + u.search);
    body.set('SettingsOpen', 'false');
    for (const p of ['1', '2', '4', '16']) body.append('CookiePurposes', p);
    const res = await fetch(`${BASE}/cookiewall/Save`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader(),
      },
      body: body.toString(),
    });
    store(res);
    log.push(`cookiewall accepteren -> HTTP ${res.status}`);
  }

  async function get(url, { depth = 0, triedCookiewall = false, headers = {} } = {}) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': UA,
        'accept-language': 'nl-NL,nl;q=0.9,en;q=0.5',
        accept: 'text/html,application/xhtml+xml',
        cookie: cookieHeader(),
        ...headers,
      },
    });
    store(res);

    if ([301, 302, 303, 307, 308].includes(res.status) && depth < 6) {
      const loc = new URL(res.headers.get('location') || '/', url).toString();
      if (/\/cookiewall/i.test(loc)) {
        if (triedCookiewall) throw new Error('Cookiewall blijft terugkomen');
        await acceptCookies(url);
        return get(url, { depth: depth + 1, triedCookiewall: true, headers });
      }
      return get(loc, { depth: depth + 1, triedCookiewall, headers });
    }
    const html = await res.text();
    log.push(`GET ${url} -> HTTP ${res.status} (${html.length} tekens)`);
    return { status: res.status, html, url };
  }

  return { get };
}

/* ---------- parsen ---------- */

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function findProfileLinks(html) {
  // elke href met een GUID erin en het woord "player"/"profile" in het pad
  const re = new RegExp(`href=["']([^"']*${GUID}[^"']*)["']`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]);
    if (!/player|profile|speler/i.test(href)) continue;
    const abs = new URL(href, BASE).toString();
    const base = abs.match(new RegExp(`^(.*${GUID})`, 'i'));
    const url = base ? base[1] : abs;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

function allGuidLinks(html) {
  const re = new RegExp(`href=["']([^"']*${GUID}[^"']*)["']`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) && out.length < 10) out.push(decodeEntities(m[1]));
  return out;
}

function parseName(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = htmlToText(h1[1]);
    if (t && t.length < 80) return t;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const t = htmlToText(title[1]).split(/\s[-|–]\s/)[0].trim();
    if (t) return t;
  }
  return null;
}

const NUM = '(\\d{1,2}[.,]\\d{4})';
const toNumber = (s) => Number(s.replace(',', '.'));

// Zoekt de padel-dubbelrating in de tekst van een profielpagina.
function parsePadelRating(text) {
  const snippets = [];
  const re = /padel/gi;
  let m;
  while ((m = re.exec(text))) {
    const slice = text.slice(m.index, m.index + 700);
    snippets.push(slice);
    const dubbel = slice.match(new RegExp(`dubbel[^0-9]{0,80}?${NUM}`, 'i'));
    if (dubbel) return { rating: toNumber(dubbel[1]), how: 'padel+dubbel', snippets };
    const rating = slice.match(new RegExp(`rating[^0-9]{0,60}?${NUM}`, 'i'));
    if (rating) return { rating: toNumber(rating[1]), how: 'padel+rating', snippets };
  }
  return { rating: null, how: 'niet gevonden', snippets };
}

/* ---------- hoofdlogica ---------- */

async function lookup(id, log) {
  const client = createClient(log);
  const ajax = { 'x-requested-with': 'XMLHttpRequest', accept: 'text/html, */*; q=0.01' };
  const searches = [
    { url: `${BASE}/find?q=${id}` },
    { url: `${BASE}/find/player/DoSearch?Query=${id}`, headers: ajax },
    { url: `${BASE}/find/player/DoSearch?q=${id}`, headers: ajax },
    { url: `${BASE}/find/player?q=${id}` },
    { url: `${BASE}/find?query=${id}` },
    { url: `${BASE}/search?q=${id}` },
  ];

  let candidates = [];
  for (const s of searches) {
    try {
      const { html, status } = await client.get(s.url, { headers: s.headers || {} });
      const text = htmlToText(html);
      log.push(`  begin van pagina: ${text.slice(0, 200)}`);
      log.push(`  cookiewall op pagina: ${/cookiewall|cookie-?instellingen/i.test(html)}`);
      log.push(`  links met GUID: ${JSON.stringify(allGuidLinks(html))}`);
      if (status >= 400) continue;
      candidates = findProfileLinks(html);
      log.push(`zoekresultaat: ${candidates.length} profiel-link(s)`);
      if (candidates.length) break;
    } catch (e) {
      log.push(`fout bij ${s.url}: ${e.message}`);
    }
  }
  if (!candidates.length) {
    return { ok: false, error: 'Speler niet gevonden op MijnKNLTB' };
  }

  let fallback = null;
  for (const profileUrl of candidates.slice(0, 5)) {
    const { html, status } = await client.get(profileUrl);
    if (status >= 400) continue;
    const text = htmlToText(html);
    const name = parseName(html);
    const hasId = text.includes(String(id));
    const parsed = parsePadelRating(text);
    const result = { id, name, rating: parsed.rating, profileUrl, how: parsed.how, snippets: parsed.snippets };
    if (hasId && parsed.rating != null) return { ok: true, ...result };
    if (!fallback && (hasId || candidates.length === 1)) fallback = result;
  }

  if (fallback) {
    if (fallback.rating != null) return { ok: true, ...fallback };
    return {
      ok: false,
      error: 'Profiel gevonden, maar geen padelrating gevonden (heeft de speler een padelrating?)',
      id,
      name: fallback.name,
      profileUrl: fallback.profileUrl,
      snippets: fallback.snippets,
    };
  }
  return { ok: false, error: 'Geen profiel gevonden dat bij dit bondsnummer hoort' };
}

exports.handler = async (event) => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  const params = event.queryStringParameters || {};
  const id = String(params.id || '').trim();
  const debug = params.debug === '1';

  if (!/^\d{5,10}$/.test(id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Ongeldig bondsnummer' }) };
  }

  const log = [];
  try {
    const r = await lookup(id, log);
    const body = {
      ok: r.ok,
      id,
      name: r.name || null,
      rating: r.rating ?? null,
      error: r.error || null,
      fetchedAt: new Date().toISOString(),
    };
    if (debug) {
      body.debug = { log, how: r.how, profileUrl: r.profileUrl, snippets: (r.snippets || []).slice(0, 3) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  } catch (e) {
    const body = { ok: false, id, error: `Ophalen mislukt: ${e.message}` };
    if (debug) body.debug = { log };
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  }
};

// voor tests
exports._internals = { parsePadelRating, findProfileLinks, htmlToText, parseName };

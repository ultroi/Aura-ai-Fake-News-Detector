const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('node:url');
const dns = require('node:dns').promises;
const net = require('node:net');
const { env } = require('../config/env');

const BLOCKED_DOMAINS = ['facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'twitter.com', 'x.com'];

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return net.isIPv6(ip) && (ip === '::1' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80'));
};

const isValidUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.length > 0 && value.length <= 2048;
  } catch {
    return false;
  }
};

const isBlockedDomain = (hostname) => BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

const assertPublicHost = async (hostname) => {
  if (isBlockedDomain(hostname)) throw new Error('This URL domain is not supported for server-side analysis.');
  if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('Local URLs are not supported.');

  const records = await dns.lookup(hostname, { all: true });
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error('Private or local network URLs are not supported.');
  }
};

const extractMainText = (html, sourceUrl) => {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, nav, footer, header, form').remove();

  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const bodyText = $('article, main, [role="main"], body').first().text(' ').replace(/\s+/g, ' ').trim();
  const content = [description, bodyText].filter(Boolean).join('\n\n').slice(0, env.maxUrlContent);

  return { title, description, content, url: sourceUrl };
};

const fetchUrlContent = async (sourceUrl) => {
  if (!isValidUrl(sourceUrl)) return { success: false, error: 'Invalid URL format' };

  try {
    const parsed = new URL(sourceUrl);
    await assertPublicHost(parsed.hostname);

    const response = await axios.get(sourceUrl, {
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: 3 * 1024 * 1024,
      headers: {
        'User-Agent': 'AuraAI/2.0 (+fact-checking research client)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.7',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = String(response.headers['content-type'] || '');
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { success: false, error: 'The URL does not contain readable HTML/text content.' };
    }

    const result = contentType.includes('text/html')
      ? extractMainText(String(response.data), sourceUrl)
      : { title: '', description: '', content: String(response.data).slice(0, env.maxUrlContent), url: sourceUrl };

    return { success: Boolean(result.content), ...result };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to fetch URL' };
  }
};

module.exports = { isValidUrl, isBlockedDomain, fetchUrlContent };

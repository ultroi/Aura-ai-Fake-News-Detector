const axios = require('axios');
const { env } = require('../config/env');

const domainFromUrl = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const searchTavily = async (query, maxResults = env.tavilyMaxResults) => {
  if (!env.tavilyApiKey || !query?.trim()) return [];

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: env.tavilyApiKey,
      query: query.trim(),
      search_depth: env.tavilySearchDepth,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: true,
    }, { timeout: 20000 });

    return (response.data?.results || []).map((item) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.content || '',
      raw_content: item.raw_content || '',
      source_domain: domainFromUrl(item.url || ''),
    }));
  } catch (error) {
    console.warn('[search] Tavily request failed:', error.response?.data?.detail || error.message);
    return [];
  }
};

const dedupeResults = (results) => {
  const seen = new Set();
  return results.filter((result) => {
    const key = String(result.url || `${result.title}:${result.source_domain}`).toLowerCase().replace(/\/$/, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const searchMultipleQueries = async (queryBundle) => {
  const queryItems = (queryBundle?.queries || []).filter((item) => item?.query).slice(0, 3);
  const results = await Promise.all(queryItems.map(async (item) => ({
    ...item,
    results: await searchTavily(item.query),
  })));
  return {
    query_results: results,
    combined_results: dedupeResults(results.flatMap((item) => item.results)).slice(0, env.maxSearchResults),
  };
};

module.exports = { searchTavily, searchMultipleQueries, dedupeResults, domainFromUrl };

const { generateText } = require('./llmClient');
const { parseModelJson } = require('../utils/json');

const fallbackQueries = (claim, mode) => {
  const base = String(claim || '').trim();
  return {
    mode,
    queries: [
      { id: 'q1', query: base, strategy: 'direct', rationale: 'Direct claim search' },
      { id: 'q2', query: `${base} fact check`, strategy: 'factcheck', rationale: 'Look for independent fact-checking coverage' },
      { id: 'q3', query: `${base} official source`, strategy: 'official', rationale: 'Look for primary or official evidence' },
    ],
    primary_query: base,
  };
};

const generateSearchQueries = async ({ claim, entities = [], dates = [], mode = 'verify' }) => {
  const system = `You are Aura AI's search strategist. Generate 2-3 concise, diverse web search queries. Verify mode must cover confirmation, fact-checking, and primary-source evidence. Research mode should favor authoritative explanatory sources. Return strict JSON: {"mode":"...","queries":[{"id":"q1","query":"...","strategy":"direct|factcheck|official|counter|context","rationale":"..."}],"primary_query":"..."}.`;
  const user = `Mode: ${mode}\nClaim/topic: ${claim}\nEntities: ${entities.join(', ') || 'none'}\nDates: ${dates.join(', ') || 'none'}`;

  const result = await generateText({ system, user, json: true });
  const parsed = result ? parseModelJson(result.text) : null;
  const queries = Array.isArray(parsed?.queries)
    ? parsed.queries.filter((item) => item?.query).slice(0, 3).map((item, index) => ({
      id: item.id || `q${index + 1}`,
      query: String(item.query).trim(),
      strategy: item.strategy || 'direct',
      rationale: item.rationale || '',
    }))
    : [];

  return queries.length ? { ...parsed, mode, queries, primary_query: parsed.primary_query || queries[0].query } : fallbackQueries(claim, mode);
};

module.exports = { generateSearchQueries };

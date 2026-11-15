const axios = require('axios');
const { env } = require('../config/env');

const http = axios.create({ timeout: env.llmTimeoutMs });

// Groq deprecated llama-3.3-70b-versatile for developer-tier accounts in Aug 2026.
// Keep a supported production model as a fallback so stale .env values do not
// stop the analysis pipeline. Prefer configuring GROQ_MODEL explicitly as well.
const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b';

const getGroqErrorMessage = (error) => String(
  error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || '',
);

const isUnavailableGroqModel = (error) => {
  const message = getGroqErrorMessage(error);
  return [400, 404].includes(error?.response?.status)
    && /model.*(does not exist|not found|unavailable|do not have access|don't have access|access to it)/i.test(message);
};

const callGroq = async ({ system, user, json = false }) => {
  if (!env.groqApiKey) return null;

  const configuredModel = String(env.groqModel || '').trim();
  const models = [...new Set([configuredModel, GROQ_FALLBACK_MODEL].filter(Boolean))];
  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const response = await http.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          temperature: env.llmTemperature,
          max_tokens: env.llmMaxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        { headers: { Authorization: `Bearer ${env.groqApiKey}`, 'Content-Type': 'application/json' } },
      );

      const content = response.data?.choices?.[0]?.message?.content?.trim();
      if (content) return content;
      return null;
    } catch (error) {
      lastError = error;
      const hasFallback = index < models.length - 1;
      if (hasFallback && isUnavailableGroqModel(error)) {
        console.warn(`[llm] Groq model "${model}" is unavailable; retrying with "${models[index + 1]}".`);
        continue;
      }
      throw error;
    }
  }

  if (lastError) throw lastError;
  return null;
};

const callGemini = async ({ system, user, json = false }) => {
  if (!env.geminiApiKey) return null;

  const prompt = `${system}\n\n${user}`;
  const response = await http.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: env.llmTemperature,
        maxOutputTokens: env.llmMaxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );

  return response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')?.trim() || null;
};

const generateText = async (options) => {
  try {
    const groqResult = await callGroq(options);
    if (groqResult) return { text: groqResult, provider: 'groq' };
  } catch (error) {
    console.warn('[llm] Groq failed:', getGroqErrorMessage(error));
  }

  try {
    const geminiResult = await callGemini(options);
    if (geminiResult) return { text: geminiResult, provider: 'gemini' };
  } catch (error) {
    console.warn('[llm] Gemini failed:', error.response?.data?.error?.message || error.message);
  }

  return null;
};

module.exports = { callGroq, callGemini, generateText };
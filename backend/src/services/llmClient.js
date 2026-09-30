const axios = require('axios');
const { env } = require('../config/env');

const http = axios.create({ timeout: env.llmTimeoutMs });

const callGroq = async ({ system, user, json = false }) => {
  if (!env.groqApiKey) return null;

  const response = await http.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: env.groqModel,
      temperature: env.llmTemperature,
      max_tokens: env.llmMaxTokens,
      response_format: json ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    { headers: { Authorization: `Bearer ${env.groqApiKey}`, 'Content-Type': 'application/json' } },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
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
    console.warn('[llm] Groq failed:', error.response?.data?.error?.message || error.message);
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

const stripCodeFence = (text) => String(text || '')
  .replace(/^```(?:json)?/i, '')
  .replace(/```$/i, '')
  .trim();

const parseModelJson = (text) => {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {}

  const firstObject = cleaned.indexOf('{');
  const lastObject = cleaned.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) {
    try {
      return JSON.parse(cleaned.slice(firstObject, lastObject + 1));
    } catch {}
  }

  const firstArray = cleaned.indexOf('[');
  const lastArray = cleaned.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    try {
      return JSON.parse(cleaned.slice(firstArray, lastArray + 1));
    } catch {}
  }

  return null;
};

module.exports = { parseModelJson };

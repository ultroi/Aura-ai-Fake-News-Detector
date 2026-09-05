export const extractURLs = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
};

export const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const separateURLsFromQuery = (input) => {
  const urls = extractURLs(input);
  let query = input;

  // Remove URLs from the query
  urls.forEach((url) => {
    query = query.replace(url, '').trim();
  });

  // Clean up extra whitespace
  query = query.replace(/\s+/g, ' ').trim();

  return { urls, query };
};

export const detectInputType = (input) => {
  const { urls, query } = separateURLsFromQuery(input);

  if (urls.length === 0) {
    return {
      type: 'text',
      urls: [],
      query,
    };
  }

  if (query.length === 0) {
    return {
      type: 'url_only',
      urls,
      query: '',
    };
  }

  return {
    type: 'url_with_prompt',
    urls,
    query,
  };
};

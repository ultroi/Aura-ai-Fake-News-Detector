const { createWorker } = require('tesseract.js');

const DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,(.+)$/i;
let workerPromise;

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = createWorker(['eng', 'hin']).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

const extractTextFromImage = async (imageData) => {
  const match = String(imageData || '').match(DATA_URL);
  if (!match) return '';

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(Buffer.from(match[1], 'base64'));
    return String(data?.text || '').trim();
  } catch (error) {
    console.warn('[ocr] OCR failed:', error.message);
    return '';
  }
};

const extractTextsFromImages = async (images) => Promise.all(images.map(extractTextFromImage));

module.exports = { extractTextsFromImages };

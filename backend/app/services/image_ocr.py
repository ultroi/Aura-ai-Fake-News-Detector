import base64
import logging
import re
from io import BytesIO
from typing import List, Optional

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    import pytesseract
    import os
    OCR_AVAILABLE = True
    tesseract_cmd = os.getenv("TESSERACT_CMD")
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
except Exception as e:
    OCR_AVAILABLE = False
    logger.warning(f"OCR support is unavailable: {e}")

IMAGE_DATA_URL_RE = re.compile(r"^data:image/[^;]+;base64,(.+)$")


def _decode_image_data(image_data: str) -> Optional[BytesIO]:
    if not image_data or not isinstance(image_data, str):
        return None

    match = IMAGE_DATA_URL_RE.match(image_data.strip())
    if match:
        image_data = match.group(1)

    try:
        decoded = base64.b64decode(image_data)
        return BytesIO(decoded)
    except Exception as e:
        logger.warning(f"Failed to decode image data: {e}")
        return None


def extract_text_from_image(image_data: str) -> str:
    if not OCR_AVAILABLE:
        logger.warning("OCR is not available because required libraries are missing.")
        return ""

    image_bytes = _decode_image_data(image_data)
    if not image_bytes:
        return ""

    try:
        with Image.open(image_bytes) as image:
            image = image.convert("RGB")
            text = pytesseract.image_to_string(image)
            return text.strip()
    except Exception as e:
        logger.warning(f"Failed to extract text from image: {e}")
        return ""


async def extract_texts_from_images(image_data_list: List[str]) -> List[str]:
    if not OCR_AVAILABLE:
        return []

    texts = []
    for image_data in image_data_list or []:
        text = extract_text_from_image(image_data)
        if text:
            texts.append(text)
    return texts

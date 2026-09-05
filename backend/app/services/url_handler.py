"""URL fetching and content extraction for link-based fact-checking"""

import logging
import asyncio
from typing import Optional
from urllib.parse import urlparse, urljoin
import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

MAX_URL_LENGTH = 2048
MAX_CONTENT_LENGTH = 50000
REQUEST_TIMEOUT = 15
MAX_RETRIES = 2

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

INVALID_DOMAINS = ['facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'twitter.com']


def is_valid_url(url: str) -> bool:
    """Validate URL format and scheme"""
    if not url or len(url) > MAX_URL_LENGTH:
        return False
    try:
        result = urlparse(url)
        return all([result.scheme in ['http', 'https'], result.netloc])
    except Exception:
        return False


def is_blocked_domain(url: str) -> bool:
    """Check if domain is blocked from fetching"""
    try:
        domain = urlparse(url).netloc.lower()
        return any(blocked in domain for blocked in INVALID_DOMAINS)
    except Exception:
        return False


async def fetch_url_content(url: str) -> Optional[dict]:
    """
    Fetch URL and extract text content.
    
    Returns:
        Dict with:
        - success: bool
        - content: extracted text
        - title: page title
        - description: meta description
        - error: error message if failed
    """
    if not is_valid_url(url):
        return {
            "success": False,
            "error": "Invalid URL format",
            "content": None,
            "title": None,
            "description": None
        }
    
    if is_blocked_domain(url):
        return {
            "success": False,
            "error": "Content extraction not available for this domain",
            "content": None,
            "title": None,
            "description": None
        }
    
    try:
        timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for attempt in range(MAX_RETRIES):
                try:
                    async with session.get(url, headers=HEADERS, ssl=False) as response:
                        if response.status == 200:
                            html = await response.text()
                            return _parse_html(html, url)
                        elif response.status == 404:
                            return {"success": False, "error": "URL not found (404)", "content": None, "title": None, "description": None}
                        else:
                            if attempt == MAX_RETRIES - 1:
                                return {"success": False, "error": f"HTTP {response.status}", "content": None, "title": None, "description": None}
                except asyncio.TimeoutError:
                    if attempt == MAX_RETRIES - 1:
                        return {"success": False, "error": "Request timeout", "content": None, "title": None, "description": None}
                    await asyncio.sleep(1)
    except Exception as e:
        logger.error(f"Error fetching URL {url}: {str(e)}")
        return {
            "success": False,
            "error": f"Failed to fetch URL: {str(e)[:100]}",
            "content": None,
            "title": None,
            "description": None
        }


def _parse_html(html: str, url: str) -> dict:
    """Extract text, title, and description from HTML"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "noscript"]):
            script.decompose()
        
        # Get title
        title = None
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text().strip()
        
        # Get meta description
        description = None
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            description = meta_desc.get('content', '').strip()
        
        # Get main content
        # Try common content containers
        content_selectors = [
            'article', 'main', 
            {'class': lambda x: x and 'content' in x.lower()},
            {'class': lambda x: x and 'post' in x.lower()},
            {'class': lambda x: x and 'entry' in x.lower()},
        ]
        
        content_element = None
        for selector in content_selectors:
            content_element = soup.find(selector)
            if content_element:
                break
        
        if not content_element:
            content_element = soup.find('body') or soup
        
        # Extract text
        text = content_element.get_text(separator=' ', strip=True)
        
        # Clean up whitespace
        text = ' '.join(text.split())[:MAX_CONTENT_LENGTH]
        
        if not text or len(text) < 50:
            return {
                "success": False,
                "error": "No readable content found on page",
                "content": None,
                "title": title,
                "description": description
            }
        
        return {
            "success": True,
            "content": text,
            "title": title,
            "description": description,
            "error": None,
            "source_url": url
        }
    
    except Exception as e:
        logger.error(f"Error parsing HTML: {str(e)}")
        return {
            "success": False,
            "error": f"Failed to parse content: {str(e)[:100]}",
            "content": None,
            "title": None,
            "description": None
        }

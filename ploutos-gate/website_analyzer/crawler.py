import asyncio
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler
from crawl4ai.async_configs import HTTPCrawlerConfig
from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy

BROWSER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "DNT": "1",
}


def _normalize_url(base_url: str, link: str) -> str | None:
    if link.startswith("#") or link.startswith("javascript:"):
        return None
    full = urljoin(base_url, link)
    parsed = urlparse(full)
    if parsed.scheme not in ("http", "https"):
        return None
    return full


async def crawl_website(url: str, max_pages: int = 5) -> str:
    http_config = HTTPCrawlerConfig(headers=BROWSER_HEADERS, follow_redirects=True)
    strategy = AsyncHTTPCrawlerStrategy(browser_config=http_config)
    async with AsyncWebCrawler(crawler_strategy=strategy) as crawler:
        result = await crawler.arun(url)
        if not result.success:
            raise RuntimeError(f"Failed to crawl {url}: {result.error_message}")

        md_obj = result.markdown
        md = (md_obj.fit_markdown or md_obj.raw_markdown or "") if md_obj else ""
        md = md.strip()
        content_parts = [f"# Page: {url}\n\n{md}"] if md else []

        internal_links = set()
        if hasattr(result, "links") and result.links:
            for link in result.links.get("internal", []):
                href = link.get("href") if isinstance(link, dict) else link
                if href:
                    normalized = _normalize_url(url, href)
                    if normalized and normalized.rstrip("/") != url.rstrip("/"):
                        internal_links.add(normalized)

        if not internal_links:
            parsed = urlparse(url)
            base = f"{parsed.scheme}://{parsed.netloc}"
            common_paths = ["about", "about-us", "products", "services", "company", "team"]
            for path in common_paths:
                internal_links.add(f"{base}/{path}")

        urls_to_crawl = list(internal_links)[: max_pages - 1]
        if urls_to_crawl:
            tasks = [crawler.arun(u) for u in urls_to_crawl]
            sub_results = await asyncio.gather(*tasks, return_exceptions=True)
            for sub_result, crawled_url in zip(sub_results, urls_to_crawl):
                if isinstance(sub_result, Exception):
                    continue
                if sub_result.success:
                    md_obj = sub_result.markdown
                    md = (md_obj.fit_markdown or md_obj.raw_markdown or "") if md_obj else ""
                    md = md.strip()
                    if md:
                        content_parts.append(f"# Page: {crawled_url}\n\n{md}")

        return "\n\n---\n\n".join(content_parts) if content_parts else ""

"""
Fire-and-forget enrichment agent for to_learn captures.

Extracts: topic, resource_type, url, author, book_title, page
If a URL is present, fetches the page title and uses it as the topic/summary
when the capture content was just a bare link.
"""
import json
import re
import logging
import httpx
from html.parser import HTMLParser
from app.storage import db
from app.agents.client import anthropic_client as client, HAIKU

logger = logging.getLogger(__name__)

_SYSTEM = """You are an enrichment assistant for a personal knowledge capture app.
Given the raw text of a to-learn capture, extract metadata as JSON.

Return ONLY valid JSON with these fields:
{
  "topic": "<high-level subject, e.g. 'machine learning', 'cooking', 'finance'>",
  "resource_type": "<article | video | book | course | quote | other>",
  "url": "<url string or null>",
  "author": "<author name or null>",
  "book_title": "<full book title or null>",
  "page": "<page number or null>",
  "search_queries": ["<query 1>", "<query 2>", "<query 3>"]
}

Rules:
- resource_type is "quote" if the text looks like a quoted passage or excerpt.
- resource_type defaults to "other" if unclear.
- url is null unless a URL appears in the text.
- topic should be concise (1-4 words).
- author/book_title/page are null unless clearly present in the text.
- IMPORTANT: If the text contains a caption, description, or hashtags alongside a URL, extract the topic
  from that TEXT CONTENT — not from the URL domain. Example: "Mohsin Ali on Instagram: 'RAG approach
  without chunking #rag #aiagents'" → topic is "RAG approach", NOT "Instagram".
- CRITICAL: NEVER invent, guess, or imagine the content of a URL you cannot read.
  If the surrounding text is too thin to determine a real subject (e.g. "check this out https://..."),
  return null for topic and [] for search_queries. It is far better to return null than to hallucinate.
- search_queries: 3 specific Google search queries to go deeper on the ACTUAL SUBJECT MATTER.
  Base queries only on readable text content — not on URL path slugs or inferred URL content.
  If there is not enough text to write meaningful queries, return [].
  Vary the angle: one foundational, one practical, one comparative or recent.

When a "--- Scraped page content ---" section appears after the capture text, use it as the
primary source of truth for topic and search_queries. The scraped content is real page text,
not inference. Extract the actual subject matter from it, not from the URL.
"""

_URL_RE = re.compile(r'https?://\S+', re.IGNORECASE)
_BARE_URL_RE = re.compile(r'^\s*https?://\S+\s*$')
_YOUTUBE_RE = re.compile(
    r'https?://(?:www\.)?(?:youtube\.com/watch|youtu\.be/)', re.IGNORECASE
)


class _TitleParser(HTMLParser):
    """Extract <title>, og:title, and og:description from HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.description: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            attr_dict = dict(attrs)
            prop = attr_dict.get("property", "")
            name = attr_dict.get("name", "")
            content = attr_dict.get("content", "").strip()
            if prop == "og:title" and content:
                self.title = content  # og:title wins over <title>
            elif prop == "og:description" and content and not self.description:
                self.description = content
            elif name == "description" and content and not self.description:
                self.description = content

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and self.title is None:
            self.title = data.strip()


async def _fetch_youtube_title(url: str) -> str | None:
    """Use YouTube's oEmbed API to get the real video title — no JS needed."""
    from urllib.parse import quote
    try:
        oembed_url = f"https://www.youtube.com/oembed?url={quote(url, safe='')}&format=json"
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client_http:
            resp = await client_http.get(oembed_url)
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("title", "").strip()
                return title or None
    except Exception as exc:
        logger.debug("youtube oembed failed for %s: %s", url, exc)
    return None


async def _fetch_page_title_html(url: str) -> tuple[str | None, str | None]:
    """Plain HTTP fetch — returns (title, description).
    Extracts og:title / og:description so social posts with rich meta tags
    (Instagram, Reddit, etc.) return real post content without needing Jina.
    """
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client_http:
            resp = await client_http.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                return None, None
            content_type = resp.headers.get("content-type", "")
            if "html" not in content_type:
                return None, None
            parser = _TitleParser()
            parser.feed(resp.text[:32_000])  # parse first 32KB only
            return parser.title or None, parser.description or None
    except Exception as exc:
        logger.debug("title fetch failed for %s: %s", url, exc)
        return None, None


async def _fetch_page_title_jina(url: str) -> tuple[str | None, str | None]:
    """Jina Reader fallback — handles JS-rendered pages and login walls.
    Returns (title, content_snippet) where content_snippet is the first ~2000 chars
    of the markdown body, stripped of the title line.
    """
    try:
        jina_url = f"https://r.jina.ai/{url}"
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client_http:
            resp = await client_http.get(
                jina_url,
                headers={"Accept": "application/json", "X-Return-Format": "markdown"},
            )
            if resp.status_code == 200:
                data = resp.json()
                payload = data.get("data") or {}
                title = payload.get("title", "").strip() or None
                # Extract a content snippet from the markdown body
                body = payload.get("content", "").strip()
                snippet: str | None = None
                if body:
                    # Drop the first line if it mirrors the title (avoid duplication)
                    lines = body.splitlines()
                    if lines and title and lines[0].lstrip("#").strip() == title:
                        lines = lines[1:]
                    snippet = "\n".join(lines).strip()[:2000] or None
                return title, snippet
    except Exception as exc:
        logger.debug("jina title fetch failed for %s: %s", url, exc)
    return None, None


async def _fetch_page_title(url: str) -> tuple[str | None, str | None]:
    """Fetch the page title and optional content snippet.
    Order: oEmbed (YouTube) → HTML scrape (og:title + og:description) → Jina.
    Returns (title, content). content comes from og:description or Jina markdown.
    """
    if _YOUTUBE_RE.search(url):
        title = await _fetch_youtube_title(url)
        if title:
            return title, None
        # oEmbed failed — fall through to HTML scrape

    title, description = await _fetch_page_title_html(url)
    if title and _is_useful_title(title):
        return title, description or None

    # HTML scrape failed or returned a login wall — try Jina
    logger.debug("falling back to Jina for %s", url)
    return await _fetch_page_title_jina(url)


_SOCIAL_ATTRIBUTION_RE = re.compile(
    r'^[^:]{1,60}\s+on\s+(?:Instagram|Facebook|TikTok|LinkedIn|Threads|Reddit|YouTube|Twitter|X)\s*:\s*["\']?',
    re.IGNORECASE,
)

def _clean_title(title: str) -> str:
    """Strip site suffixes and social media attribution prefixes.
    - ' | YouTube', ' - Medium' etc. (suffix)
    - 'Username on Instagram: "...' → strips the attribution, keeps the post text
    Requires whitespace before suffix separator to avoid breaking mid-word hyphens.
    """
    # Strip social attribution prefix: "Ask GPTs on Instagram: '...' " → "..."
    title = _SOCIAL_ATTRIBUTION_RE.sub("", title).strip().strip('"\'').strip()
    # Strip trailing site suffix: ' | SiteName' or ' - SiteName'
    cleaned = re.sub(r'\s+[\|—–-]\s+[^\|—–]{3,40}$', '', title).strip()
    return cleaned or title


# Titles that indicate the page required login — not useful as a topic.
_LOGIN_TITLE_PATTERNS = re.compile(
    r'^(log\s*in|sign\s*in|sign\s*up|create\s*an?\s*account|join\s+\w+|please\s*log\s*in)',
    re.IGNORECASE,
)


def _is_useful_title(title: str) -> bool:
    """Return False if the title is a login/auth wall, not the real page title."""
    if not title:
        return False
    return not _LOGIN_TITLE_PATTERNS.match(title.strip())


# Platforms that serve no og:title/og:description to plain HTTP clients.
# For these, even a successful HTML fetch gives us nothing useful to work with.
# Instagram, TikTok, Facebook, etc. DO expose post content via og tags — handled
# by the normal fetch path. Only list platforms where og tags are absent/empty.
_OPAQUE_SOCIAL_DOMAINS = frozenset({
    "twitter.com", "x.com",  # JS-only, og tags stripped
})


def _is_opaque_social_url(url: str) -> bool:
    """Return True if the URL points to a login-walled social platform."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().replace("www.", "")
        return host in _OPAQUE_SOCIAL_DOMAINS
    except Exception:
        return False


_PLATFORM_MAP: dict[str, str] = {
    "instagram.com": "Instagram",
    "twitter.com": "Twitter",
    "x.com": "Twitter",
    "facebook.com": "Facebook",
    "tiktok.com": "TikTok",
    "threads.net": "Threads",
    "snapchat.com": "Snapchat",
    "linkedin.com": "LinkedIn",
    "reddit.com": "Reddit",
    "github.com": "GitHub",
    "medium.com": "Medium",
    "substack.com": "Substack",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
}


def _domain_fallback_topic(url: str) -> str | None:
    """Extract a human-readable platform name from a URL as a last-resort topic."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower().replace("www.", "")
        if host in _PLATFORM_MAP:
            return _PLATFORM_MAP[host]
        root = host.split(".")[0]
        return root.capitalize() if root else None
    except Exception:
        return None


async def enrich_to_learn(capture_id: int, content: str, metadata: dict) -> None:
    """Extract enrichment fields from a to_learn capture and persist."""
    try:
        # Detect opaque social URLs early.
        # Sending these to an LLM produces hallucinations — the model invents
        # post content it cannot see. Skip AI entirely and use domain fallback.
        # This applies whether the URL is bare OR has thin surrounding text like
        # "check this out https://instagram.com/p/xyz" — the model still can't
        # read the post, so any AI topic would be invented.
        url_match = _URL_RE.search(content)
        raw_url = url_match.group(0) if url_match else metadata.get("url")
        is_bare = bool(_BARE_URL_RE.match(content))

        if raw_url and _is_opaque_social_url(raw_url):
            merged = {**metadata, **{
                "topic":          raw_url,
                "resource_type":  "other",
                "url":            raw_url,
                "search_queries": [],
            }}
            db.update_metadata(capture_id, merged)
            return

        # Extract URL from content first so we can pre-fetch page content
        # before calling the AI — giving it real page text to work from.
        url_pre = _URL_RE.search(content)
        pre_url = url_pre.group(0) if url_pre else metadata.get("url")

        page_title: str | None = None
        page_content: str | None = None
        if pre_url:
            raw_title, page_content = await _fetch_page_title(pre_url)
            if raw_title:
                cleaned = _clean_title(raw_title)
                if len(cleaned) <= 120:
                    page_title = cleaned
                else:
                    # Title is the full post body (social media og:title) —
                    # too long to display directly. Fold it into page_content
                    # so the AI can generate a concise topic from the real text.
                    page_content = cleaned if not page_content else f"{page_content}\n\n{cleaned}"

        # Build enrichment prompt: original capture + scraped content (if available)
        if page_content:
            user_message = (
                f"{content}\n\n"
                f"--- Scraped page content ---\n{page_content}"
            )
        else:
            user_message = content

        response = await client.messages.create(
            model=HAIKU,
            max_tokens=256,
            system=_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = response.content[0].text.strip()
        enriched = json.loads(raw)

        url = enriched.get("url") or pre_url or metadata.get("url")

        # If AI resolved a different/canonical URL, fetch its title too.
        if enriched.get("url") and enriched.get("url") != pre_url:
            raw_title2, _ = await _fetch_page_title(enriched["url"])
            if raw_title2:
                page_title = _clean_title(raw_title2)

        # Priority: fetched page title > enrichment AI topic > domain fallback > classifier topic
        # Do NOT use the classifier's topic as primary fallback — it's often the full caption
        # text or a generic description, while the enrichment AI is specifically prompted to
        # return a concise 1-4 word subject. Only use classifier topic as absolute last resort.
        enriched_topic = enriched.get("topic")  # concise topic from enrichment AI

        if page_title:
            final_topic = page_title
        elif enriched_topic:
            final_topic = enriched_topic
        elif url:
            final_topic = url
        else:
            final_topic = metadata.get("topic") or None

        search_queries = enriched.get("search_queries", [])
        if isinstance(search_queries, list):
            search_queries = [q for q in search_queries if isinstance(q, str)][:4]
        else:
            search_queries = []

        merged = {**metadata, **{
            "topic":          final_topic,
            "resource_type":  enriched.get("resource_type") or metadata.get("resource_type") or "other",
            "url":            url,
            "author":         enriched.get("author")        or metadata.get("author"),
            "book_title":     enriched.get("book_title")    or metadata.get("book_title"),
            "page":           enriched.get("page")          or metadata.get("page"),
            "search_queries": search_queries,
            **({"link_title": page_title} if page_title else {}),
        }}
        db.update_metadata(capture_id, merged)

        if page_title:
            db.update_summary(capture_id, page_title)
        elif enriched_topic and enriched_topic != (pre_url or metadata.get("url")):
            db.update_summary(capture_id, enriched_topic)

    except Exception as exc:
        logger.warning("to_learn enrichment failed for capture %d: %s", capture_id, exc)

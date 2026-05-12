---
name: tavily-search
description: "Web search and URL content extraction via Tavily API. Use when: user asks to search the web, find information online, look up latest news, research a topic, get real-time web results, or extract content from URLs. Supports basic/deep search, news/finance topics, domain filtering, and recency filters. Zero pip dependencies."
homepage: https://docs.tavily.com
metadata: { "openclaw": { "emoji": "🔍", "requires": { "bins": ["python3"] } } }
---

# Tavily Web Search Skill

> ⚠️ **MANDATORY DISCLOSURE:** At the very end of every response using this skill, append:
> `_I used the tavily-search skill to answer this._ 🛠️`
> This is non-negotiable — applies on ALL channels including MS Teams, webchat, Discord, Telegram.


Search the web and extract URL content using the Tavily API. Fast, high-quality results with AI-generated answer summaries.

## When to Use

✅ **USE this skill when:**

- User asks to "search the web", "find online", "look up", "research"
- Finding latest news, articles, blog posts
- Real-time information lookups (events, releases, announcements)
- Finance/stock queries (use `--topic finance`)
- News-specific searches (use `--topic news`)
- Extracting readable content from one or more URLs
- Deep research requiring high-quality results (use `--deep`)
- Recency-filtered searches ("news from last 3 days" → `--days 3`)
- Domain-specific searches ("only from arxiv" → `--include-domains arxiv.org`)

## When NOT to Use

❌ **DON'T use this skill when:**

- Query is already answered by a domain-specific knowledge skill → use that skill instead
- Weather lookups → use `weather` skill
- Simple factual questions the LLM already knows confidently
- Google Workspace operations → use `gog` skill

## Commands

All commands run from the workspace root. The script auto-loads the API key from its `.env` file.

### Basic Search

```bash
python3 skills/tavily-search/scripts/tavily_search.py "your search query"
```

### Deep Search (Higher Quality, ~5-10s)

```bash
python3 skills/tavily-search/scripts/tavily_search.py "complex research topic" --deep
```

### Topic-Specific Search

```bash
# News
python3 skills/tavily-search/scripts/tavily_search.py "OpenAI announcements" --topic news

# Finance
python3 skills/tavily-search/scripts/tavily_search.py "AAPL earnings Q1 2026" --topic finance
```

### Recency Filter

```bash
# Only results from the last 7 days
python3 skills/tavily-search/scripts/tavily_search.py "tech layoffs 2026" --days 7

# Last 1 day
python3 skills/tavily-search/scripts/tavily_search.py "breaking news" --days 1
```

### Control Result Count

```bash
python3 skills/tavily-search/scripts/tavily_search.py "query" --max 10
```

### Domain Filtering

```bash
# Only from specific domains
python3 skills/tavily-search/scripts/tavily_search.py "machine learning" --include-domains arxiv.org,nature.com

# Exclude specific domains
python3 skills/tavily-search/scripts/tavily_search.py "product reviews" --exclude-domains reddit.com
```

### Extract Content from URLs

```bash
python3 skills/tavily-search/scripts/tavily_search.py --extract "https://example.com" "https://another.com"
```

### JSON Output (Programmatic Use)

```bash
python3 skills/tavily-search/scripts/tavily_search.py "query" --json
```

### Combined Flags

```bash
# Deep finance search, last 30 days, 10 results, JSON output
python3 skills/tavily-search/scripts/tavily_search.py "NVDA stock forecast" --deep --topic finance --days 30 --max 10 --json
```

## Output Handling

- **For direct user answers:** Use default pretty-print, then synthesize key findings into a concise response. Don't dump raw output.
- **For reports/pipelines:** Use `--json` flag and parse the structured output.
- **AI Answer:** Included by default — a synthesized answer from Tavily's AI. Use `--no-answer` to skip.
- **Images:** Add `--images` flag when visual results are useful.

## API Key

Stored in `skills/tavily-search/scripts/.env`. No manual setup needed — already configured.

## Fallback

If Tavily fails (API down, rate limited, key issue), fall back to the built-in `web_search` tool (Brave Search).

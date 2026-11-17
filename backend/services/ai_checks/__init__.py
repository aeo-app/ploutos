"""
services/ai_checks — real answers from AI tools, for the dashboard numbers (no estimates)
================================================================================
Each tracked question is asked to each AI tool for real, with web search on, and the real
answer is read to see whether the customer's business is mentioned or linked, at what
position, and which competitors and platforms are named instead.

One module per AI tool, each exposing `is_ready()` and `ask(question, country) -> EngineAnswer`:

  chatgpt.py        OpenAI Responses API + web search          OPENAI_API_KEY
  claude.py         Claude on Amazon Bedrock + AgentCore Web Search (our AWS account)
  gemini.py         Gemini API + Grounding with Google Search  GEMINI_API_KEY
  ai_overviews.py   Google AI Overviews via DataForSEO SERP     DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD

reader.py reads one answer (which businesses it names, is the customer mentioned / linked),
runner.py asks every question to every ready tool in parallel and totals the results.
search_volume.py gives the real monthly Google searches for each question's short keyword
(Google Ads data via DataForSEO, same login).
backlinks.py gives the real website strength of the customer and each competitor, and the websites
that link to competitors but not to the customer (DataForSEO Backlinks API, same login).
"""

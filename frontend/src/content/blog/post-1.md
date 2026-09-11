---
title: "How to Check If Your Website Is Invisible to AI Crawlers (Free 10-Minute Audit)"
description: "A 5-step checklist to ensure AI systems like ChatGPT, Perplexity, and Claude can find, read, and cite your site."
date: "2026-07-17"
featured_image: https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80
tags: ["AEO", "SEO", "AI Crawlers", "Web Development"]
---

The 5-step checklist — under 10 minutes, no sign-up needed:
* View page source vs. the rendered page
* Check robots.txt for AI crawler blocks
* Run Google Search Console's URL Inspection tool
* Validate schema markup with Google's Rich Results Test
* Check whether an `llms.txt` file exists

Run all five, and you'll know whether AI systems like ChatGPT and Perplexity can actually see your site — not just whether Google can.

**Why this matters:** Buyers now ask ChatGPT or Perplexity for recommendations before they ever Google your brand name. If your site is invisible to those crawlers, you're missing the entire research phase — and it won't show up in your analytics because there's no click to measure.

A quick note before you start: these checks look at AI visibility separately from your normal SEO ranking. A site can rank well on Google and still be invisible to AI crawlers, because the two use different rules for what counts as accessible content. That's exactly why each check below covers both — how to run it, and why it matters specifically for AI, not just search rank.

---

**AI Visibility vs. SEO Ranking: Why They're Not the Same Thing**

Ranking #1 on Google and being cited by ChatGPT are two different problems, solved by two different mechanisms. Here's the short version, side by side:

| Factor | Google Search (SEO) | AI Crawlers (AEO / AI visibility) |
| :--- | :--- | :--- |
| **How it reads pages** | Renders JavaScript before indexing, in most cases | Mostly reads raw HTML; many still don't render JS |
| **What happens if it's blocked** | Rare — most sites allow Googlebot by default | Common by accident — old `robots.txt` files don't name GPTBot, ClaudeBot, etc. |
| **Fallback when content is unclear** | Can still rank using backlinks, click data, domain history | Usually just skips the page and cites a competitor instead |
| **Newer signals (`llms.txt`, clean schema)** | Little to no effect on ranking | Directly shapes whether you get cited |
| **What "doing well" here tells you** | Whether Google can find and rank your page | Whether ChatGPT, Perplexity, Claude etc. can read and quote your page |

Four things drive that gap in practice:

1. **Less rendering power:** Googlebot has gotten good at running JavaScript over the years — it renders pages with an evergreen, Chrome-based system before indexing them. Most AI crawlers haven't made that investment. A joint analysis by Vercel and the SEO firm MERJ, examining more than 500 million real GPTBot requests, found zero evidence of JavaScript execution: GPTBot fetched JS files about 11.5% of the time but never ran them. The same study found the same pattern for ClaudeBot and PerplexityBot.
   * *Example:* A SaaS pricing page built with client-side rendering (React or Vue, no server-side rendering) often loads its plan names and prices through an API call after the page loads. A human — and Googlebot — sees a full pricing table. Raw HTML shows only `<div id="root"></div>` and a loading spinner. An AI crawler reading that raw HTML has nothing to cite.
2. **Stricter about being blocked:** Google has one main crawler that most sites already allow. AI systems run several separate, named crawlers instead — OpenAI alone operates three (GPTBot for training, OAI-SearchBot for ChatGPT search, and ChatGPT-User for live user requests), each controllable independently in `robots.txt`, per OpenAI's own crawler documentation. A `robots.txt` file written before these existed has no idea any of them do — so they often get blocked by accident, not on purpose.
   * *Example:* A `robots.txt` last edited in 2019 might explicitly allow Googlebot and Bingbot, with a leftover `Disallow: /` rule under a wildcard user-agent (`User-agent: *`) that was meant to block a staging environment years ago and never got cleaned up. Google is named and excluded from that rule. GPTBot isn't named anywhere, so it falls under the wildcard block — shut out without anyone deciding to shut it out.
3. **No "10 blue links" fallback:** If Google can't fully parse a page, it can still rank it using signals like backlinks and click behavior. AI systems mostly just skip what they can't cleanly read and cite a competitor instead.
   * *Example:* An e-commerce category page with broken or missing schema might still hold a decent Google ranking on the strength of backlinks and years of traffic. An AI system comparing two similar category pages has no such history to fall back on — it picks whichever page hands over clean, structured facts, and moves on.
4. **Newer standards, lower adoption:** Things like `llms.txt` don't affect Google rankings at all. Adoption is still low across the web — single digits to roughly one site in ten, depending on which tracker you check — so most sites haven't touched it yet. Whether AI systems actually read it consistently is still an open question, but the fact that adoption remains low is exactly why publishing one is a cheap way to stand out from most competitors.

This is why a site can look completely healthy in Google Search Console and Google Analytics and still be functionally invisible to the AI tools your buyers are increasingly using instead of search.

---

**1. View Source vs. Rendered Page**

**How to check:**
* Open a key page — homepage, product page, or pricing page — in your browser.
* Right-click anywhere on the page and choose "View Page Source" (or press `Ctrl+U` on Windows, `Cmd+Option+U` on Mac).
* Use `Ctrl+F` / `Cmd+F` inside that source view to search for a specific piece of visible text — a headline, a price, a product name.
* Compare what you find in the source to what you see on the normal, rendered page.

> **Real example:** Search for your homepage's main headline in the source view. If it's sitting right there in plain text, you're fine. If a search for your $49/month pricing figure returns zero matches in the source — even though it's clearly visible on the live page — that price is being injected by JavaScript after the page loads, and it's invisible to any crawler that doesn't run that script.

* **Pass:** Your visible text — headlines, pricing, features — also appears in the raw source.
* **Fail:** The source is mostly empty tags and scripts, with no real content until JavaScript runs.

**Why it matters for AI visibility:** Many AI crawlers don't fully execute JavaScript. If your content only appears after rendering, they may see a blank page even though your site looks fine to humans and ranks fine on Google.

---

**2. Check robots.txt for AI Crawler Blocks**

**How to check:**
* Go to `yourdomain.com/robots.txt`
* Scan the file for these four user-agent names, each on its own line:
  * `GPTBot` (ChatGPT)
  * `ClaudeBot` (Claude)
  * `PerplexityBot` (Perplexity)
  * `Google-Extended` (Google AI features)
* For each one you find, check the lines directly under it for a `Disallow` rule. Also check the very top of the file for a wildcard user-agent (`*`) that might block everyone by default.

**What a block looks like:**
```text
User-agent: GPTBot
Disallow: /
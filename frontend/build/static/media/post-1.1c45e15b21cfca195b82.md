---
title: "How to Check If Your Website Is Invisible to AI Crawlers (Free 10-Minute Audit)"
description: "A free 5-step, 10-minute checklist to see whether ChatGPT, Perplexity, and other AI crawlers can actually read and cite your site — not just whether Google can rank it."
featured_image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80"
date: "2026-07-15"
tags: ["AEO", "SEO", "AI Search", "robots.txt", "llms.txt", "Schema"]
---

**The 5-step checklist — under 10 minutes, no sign-up needed:**

1. View page source vs. the rendered page
2. Check robots.txt for AI crawler blocks
3. Run Google Search Console's URL Inspection tool
4. Validate schema markup with Google's Rich Results Test
5. Check whether an llms.txt file exists

Run all five, and you'll know whether AI systems like ChatGPT and Perplexity can actually see your site — not just whether Google can.

**Why this matters:** Buyers now ask ChatGPT or Perplexity for recommendations before they ever Google your brand name. If your site is invisible to those crawlers, you're missing the entire research phase — and it won't show up in your analytics because there's no click to measure.

**A quick note before you start:** these checks look at AI visibility separately from your normal SEO ranking. A site can rank well on Google and still be invisible to AI crawlers, because the two use different rules for what counts as accessible content. That's exactly why each check below covers both — how to run it, and why it matters specifically for AI, not just search rank.

---

**AI Visibility vs. SEO Ranking: Why They're Not the Same Thing**

Ranking #1 on Google and being cited by ChatGPT are two different problems, solved by two different mechanisms. Here's the short version, side by side:

| Factor | Google Search (SEO) | AI Crawlers (AEO / AI visibility) |
|---|---|---|
| How it reads pages | Renders JavaScript before indexing, in most cases | Mostly reads raw HTML; many still don't render JS |
| What happens if it's blocked | Rare — most sites allow Googlebot by default | Common by accident — old robots.txt files don't name GPTBot, ClaudeBot, etc. |
| Fallback when content is unclear | Can still rank using backlinks, click data, domain history | Usually just skips the page and cites a competitor instead |
| Newer signals (llms.txt, clean schema) | Little to no effect on ranking | Directly shapes whether you get cited |
| What "doing well" here tells you | Whether Google can find and rank your page | Whether ChatGPT, Perplexity, Claude etc. can read and quote your page |

Four things drive that gap in practice:

**1. Less rendering power**

Googlebot has gotten good at running JavaScript over the years — it renders pages with an evergreen, Chrome-based system before indexing them. Most AI crawlers haven't made that investment. A joint analysis by Vercel and the SEO firm MERJ, examining more than 500 million real GPTBot requests, found zero evidence of JavaScript execution: GPTBot fetched JS files about 11.5% of the time but never ran them. The same study found the same pattern for ClaudeBot and PerplexityBot.

*Example:* a SaaS pricing page built with client-side rendering (React or Vue, no server-side rendering) often loads its plan names and prices through an API call after the page loads. A human — and Googlebot — sees a full pricing table. Raw HTML shows only `<div id="root"></div>` and a loading spinner. An AI crawler reading that raw HTML has nothing to cite.

**2. Stricter about being blocked**

Google has one main crawler that most sites already allow. AI systems run several separate, named crawlers instead — OpenAI alone operates three (GPTBot for training, OAI-SearchBot for ChatGPT search, and ChatGPT-User for live user requests), each controllable independently in robots.txt, per OpenAI's own crawler documentation. A robots.txt file written before these existed has no idea any of them do — so they often get blocked by accident, not on purpose.

*Example:* a robots.txt last edited in 2019 might explicitly allow Googlebot and Bingbot, with a leftover `Disallow: /` rule under a wildcard user-agent (`User-agent: *`) that was meant to block a staging environment years ago and never got cleaned up. Google is named and excluded from that rule. GPTBot isn't named anywhere, so it falls under the wildcard block — shut out without anyone deciding to shut it out.

**3. No "10 blue links" fallback**

If Google can't fully parse a page, it can still rank it using signals like backlinks and click behavior. AI systems mostly just skip what they can't cleanly read and cite a competitor instead.

*Example:* an e-commerce category page with broken or missing schema might still hold a decent Google ranking on the strength of backlinks and years of traffic. An AI system comparing two similar category pages has no such history to fall back on — it picks whichever page hands over clean, structured facts, and moves on.

**4. Newer standards, lower adoption**

Things like llms.txt don't affect Google rankings at all. Adoption is still low across the web — single digits to roughly one site in ten, depending on which tracker you check — so most sites haven't touched it yet. Whether AI systems actually read it consistently is still an open question (more on that in Step 5), but the fact that adoption remains low is exactly why publishing one is a cheap way to stand out from most competitors.

This is why a site can look completely healthy in Google Search Console and Google Analytics and still be functionally invisible to the AI tools your buyers are increasingly using instead of search.

---

**1. View Source vs. Rendered Page**

**How to check:**

1. Open a key page — homepage, product page, or pricing page — in your browser.
2. Right-click anywhere on the page and choose "View Page Source" (or press Ctrl+U on Windows, Cmd+Option+U on Mac).
3. Use Ctrl+F / Cmd+F inside that source view to search for a specific piece of visible text — a headline, a price, a product name.
4. Compare what you find in the source to what you see on the normal, rendered page.

*Real example:* search for your homepage's main headline in the source view. If it's sitting right there in plain text, you're fine. If a search for your $49/month pricing figure returns zero matches in the source — even though it's clearly visible on the live page — that price is being injected by JavaScript after the page loads, and it's invisible to any crawler that doesn't run that script.

**Pass:** Your visible text — headlines, pricing, features — also appears in the raw source.

**Fail:** The source is mostly empty tags and scripts, with no real content until JavaScript runs.

**Why it matters for AI visibility:** Many AI crawlers don't fully execute JavaScript. If your content only appears after rendering, they may see a blank page even though your site looks fine to humans and ranks fine on Google.

---

**2. Check robots.txt for AI Crawler Blocks**

**How to check:**

1. Go to yourdomain.com/robots.txt
2. Scan the file for these four user-agent names, each on its own line:
   1. GPTBot (ChatGPT)
   2. ClaudeBot (Claude)
   3. PerplexityBot (Perplexity)
   4. Google-Extended (Google AI features)
3. For each one you find, check the lines directly under it for a Disallow rule. Also check the very top of the file for a wildcard user-agent ("*") that might block everyone by default.

*What a block looks like:*

> User-agent: GPTBot
> Disallow: /

*What it should look like instead (if you want that crawler in):*

> User-agent: GPTBot
> Allow: /

**Pass:** None of the four are under a `Disallow: /` rule, and there's no blanket block on all user-agents.

**Fail:** Any of them are disallowed, or a wildcard rule blocks everyone by default.

**Why it matters for AI visibility:** A robots.txt block doesn't slow a crawler down — it tells the AI system not to access your content at all, no matter how good it is.

---

**3. Test With Google Search Console's URL Inspection Tool**

**How to check:**

1. Log into Google Search Console for your property.
2. Paste a key URL into the search bar at the top.
3. Click "View Crawled Page" once the inspection loads.
4. Check both the "HTML" tab (the raw code Google stored) and the rendered screenshot next to it.

*Real example:* the screenshot tab often looks completely normal — full page, images, pricing table and all — because it's a rendered view. The HTML tab tells the real story: if your pricing table's text is missing there even though the screenshot shows it, that's the same JavaScript-rendering gap from Step 1, confirmed from Google's own crawl data.

**Pass:** Both the crawled HTML and the screenshot show your real content in full.

**Fail:** The screenshot looks fine, but the HTML tab is missing content — or the page shows as blocked or excluded.

**Why it matters for AI visibility:** This is the closest free way to see your site as a bot sees it, not as a human with a full browser sees it — and many AI crawlers render less than Googlebot does.

---

**4. Validate Schema Markup With Google's Rich Results Test**

**How to check:**

1. Open Google's Rich Results Test.
2. Paste in your homepage URL first, then run it again for a product page or FAQ page.
3. Review the results panel for detected item types and for any errors or warnings listed under them.

*Real example:* an FAQ page might have FAQPage schema present — so it looks fine at a glance — but flagged with a warning for a duplicate mainEntity field, left over from a page template that was copy-pasted and never fully edited. A human reader never notices. An AI system reading that schema for clean facts sees a contradiction and may disregard the whole block.

**Pass:** Structured data (Organization, Product, FAQPage, etc.) is detected with zero errors and zero warnings.

**Fail:** No structured data is found, or it's flagged with errors — duplicate fields, missing properties, bad formatting.

**Why it matters for AI visibility:** Schema hands AI systems clean, labeled facts instead of making them guess from paragraphs of copy. Broken schema can be worse than none — it signals your data can't be trusted.

---

**5. Check for an llms.txt File**

**How to check:**

1. Go to yourdomain.com/llms.txt
2. If it loads, check that it lists your key pages with short, plain descriptions rather than sitting empty or duplicating your sitemap.

*What a minimal, usable llms.txt looks like:*

> \# Your Company Name
>
> \> One-line description of what you do and who it's for.
>
> \## Docs
> - \[Getting Started\](https://yourdomain.com/docs/start): Setup guide for new users
> - \[Pricing\](https://yourdomain.com/pricing): Plans and what's included
>
> \## About
> - \[FAQ\](https://yourdomain.com/faq): Common questions answered

**Pass:** The file loads and lists key pages — product, docs, comparisons — with brief descriptions.

**Fail:** You get a 404 error. The file doesn't exist yet.

**Why it matters for AI visibility:** llms.txt adoption is still low — independent trackers put it anywhere from roughly 5% to 10% of sites depending on the sample and month measured, and an Ahrefs server-log study found 97% of published llms.txt files got zero AI-crawler requests. Google has also said it doesn't use the file. In plain terms: this is a low-cost, low-risk addition rather than a guaranteed win, and it's worth doing precisely because so few competitors have bothered — not because any AI vendor has confirmed it drives citations.

---

**What to Do If You Failed Any of These Checks**

**Blocked in robots.txt?**

Remove the disallow rule for that crawler, or add an explicit Allow rule under its own user-agent line, as shown in Step 2 above. This is a one-line text edit — no deployment needed beyond re-uploading the file.

**JavaScript-only content?**

Add server-side rendering or a static fallback. In practice this usually means one of three routes, roughly in order of effort:

1. **Static generation:** if the page content doesn't change per visitor (pricing, product, marketing pages), pre-build the HTML at deploy time — for example, static export in Next.js or Nuxt — so the full content ships in the initial HTML.
2. **Server-side rendering:** render the page to HTML on the server for every request, rather than in the visitor's browser, so both bots and users get complete markup immediately.
3. **Dynamic rendering for bots:** keep your existing client-side-rendered site for human visitors, but serve a pre-rendered HTML snapshot specifically when the request comes from a known crawler user-agent. This is the smallest change if a full rebuild isn't realistic right now.

**Broken or missing schema?**

Fix the specific errors or warnings the Rich Results Test lists — usually a missing required property or a duplicate field, as in the Step 4 example — then re-run the test until it comes back clean.

**No llms.txt?**

Publish a basic version pointing to your key pages, following the template shown in Step 5. Ten to fifteen lines covering your most important pages is enough to start.

None of this needs a full site rebuild — most fixes are a developer task measured in hours, not weeks. Send this checklist straight to whoever manages your site, and you should have a clear pass/fail on all five within a day.

---

**Frequently Asked Questions**

**Do I need a developer for all five checks?**

No — all five checks themselves just need a browser. Only the fixes (steps 1, 2, and 4) usually need a developer; llms.txt (step 5) can often be added by anyone comfortable editing a plain text file.

**How often should I re-run this checklist?**

Once a quarter is enough for most sites, and always after a site redesign, a CMS migration, or a new page builder rollout — those are the moments blocks and broken schema tend to sneak in.

**Will fixing these five things guarantee AI systems cite my site?**

No — structure gets you back in the running; it doesn't guarantee a citation. Content quality and relevance still decide who actually gets cited once a site is technically visible.

**What if I only have time to fix one thing first?**

Start with robots.txt. It's the fastest check to run, the fastest fix to make, and the one most likely to be silently blocking every AI crawler at once — the other four fixes don't matter if the crawler can't get in the door to begin with.

**Does this apply to every page on my site, or just a few?**

Focus on the pages that actually drive business first — homepage, pricing, top product or service pages, and your main FAQ. These are the pages most likely to get pulled into an AI answer, so they're where a block or a schema error costs you the most. Once those pass, you can run the same five checks across the rest of the site as time allows.

**I run a small team with no in-house developer — is this still doable?**

Yes. All five checks only need a browser, so you can run the full audit yourself in under 10 minutes without touching any code. For the fixes, robots.txt and llms.txt are usually simple text-file edits you can hand to a freelancer or your hosting support team for a quick turnaround; only the JavaScript rendering fix tends to need someone with real development experience.

---

**Want This Done for You?**

AEO Intel runs this same audit automatically, plus a few dozen additional checks, and returns a scored report in minutes. Run a free scan of your site with AEO Intel to see exactly where you stand.

---

**Sources**

OpenAI, [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots) — official documentation for GPTBot, OAI-SearchBot, OAI-AdsBot, and ChatGPT-User, including robots.txt behavior.

Vercel & MERJ, [JavaScript Rendering and AI Crawlers](https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa) — analysis of 500M+ GPTBot fetches finding no JavaScript execution, with the same pattern found for ClaudeBot and PerplexityBot.

Originality.ai, [llms.txt adoption tracker coverage](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/) — year-long tracking study of llms.txt adoption, cross-referenced with an Ahrefs server-log study on how often AI crawlers actually request the file.

Rankability, [LLMS.txt Adoption Tracker](https://www.rankability.com/data/llms-txt-adoption/) — monthly-updated adoption rate among the top 1,000 and top 10,000 websites.

---
title: "How to Add FAQPage Schema in 10 Minutes (No-Code Guide)"
description: "A no-code, step-by-step guide to generating, validating, and deploying FAQPage schema — and why it still matters for AI crawlers even after Google dropped the SERP dropdown."
featured_image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80"
date: "2026-09-01"
tags: ["AEO", "SEO", "Schema", "FAQPage", "JSON-LD"]
---

If your SaaS blog and help pages have an FAQ section, you're sitting on something worth structuring properly. FAQPage schema is a small piece of code that tells search engines, and increasingly AI crawlers like GPTBot and PerplexityBot, exactly which text on your page is a question and which is the answer. You don't need a developer, and you don't need to touch your site's design. You need about ten minutes and this guide.

By the end, you'll have FAQPage schema live on your site, validated correctly, and prioritised on the three pages that matter most.

---

**What FAQPage Schema Actually Does (and What It Stopped Doing)**

Schema markup, also called structured data, is invisible code sitting in the background of a page. It doesn't change how anything looks to a visitor; it changes how machines read your content.

**Key Changes:**

* **Google SERP Dropdown Removed:** FAQPage schema used to earn an expandable Q&A dropdown right under your Google listing. Google officially deprecated this on May 7, 2026, and the rich result stopped appearing in Search that same day.
* **Reporting Tool Phase-Out:** The FAQ search-appearance filter and Rich Results Test support are ending in June 2026, followed by Search Console API support in August 2026.

**Why You Should Still Use It:**

None of that makes the FAQPage type invalid. Google's own notice confirms unused structured data doesn't cause problems for Search, and the markup remains a valid schema.org type.

The pitch has shifted: you're not chasing a Google search-results dropdown anymore. Instead, you are labelling your Q&A content clearly so that Bing, and AI crawlers like GPTBot and PerplexityBot, can parse it without guessing.

---

**Step 1: Pick the FAQ Content You Want to Mark Up**

* **Copy Existing Text:** Before opening any tool, go to the page and copy the exact questions and answers as they appear. Keep answers concise (a few sentences each works best).
* **Visible Content Only:** If the page doesn't have an FAQ section yet, add 3 to 5 real, relevant questions first. Schema only works on content that is actually visible to visitors.

---

**Step 2: Generate the Code With a Free Schema Generator**

You don't need to write JSON-LD by hand. Use free, no-signup tools like Merkle's Schema Markup Generator or TechnicalSEO.com's FAQ Schema Generator.

1. Select **"FAQPage"** as the schema type in the generator.
2. Enter your first question and matching answer.
3. Click **"Add Question"** and repeat for each Q&A pair.
4. The tool will automatically generate the code block wrapped in `<script type="application/ld+json">` tags. Leave those tags in place.

---

**Step 3: Copy the Generated Code**

Select the full code block, starting from `<script type="application/ld+json">` and ending at `</script>`, and copy it. Make sure not to leave out the script tags, as they tell your site this is structured data, not plain text.

---

**Step 4: Paste It Into Google Tag Manager (or Your CMS Header)**

Choose one of the two common paths depending on your setup:

* **Option A — Google Tag Manager (GTM):** Open your GTM workspace and click **"New Tag."** Choose **"Custom HTML"** as the tag type, and paste your full script block into the HTML field. Set the trigger to fire only on the specific page(s) where this FAQ content lives, name the tag, and publish the container.
* **Option B — CMS Header (WordPress, Webflow, etc.):** Paste the script into the page-specific header code field so it only loads on that particular page.

---

**Step 5: Validate the Markup Properly**

Google's Rich Results Test is losing FAQ support, so it is no longer the right tool for confirmation.

1. Use the **Schema.org Validator** instead.
2. Paste in your page URL or the raw code.
3. Run the check and look for **"FAQPage"** recognised with **zero errors**.
4. Confirm the questions and answers in the code match what is visibly written on the page word-for-word.

---

**Finished FAQ JSON-LD Example**

Here is a completed, validator-clean block for a simple two-question FAQ template:

```json
<script type="application/ld+json">
{
"@context": "https://schema.org",
"@type": "FAQPage",
"mainEntity": [
{
"@type": "Question",
"name": "What is FAQPage schema?",
"acceptedAnswer": {
"@type": "Answer",
"text": "FAQPage schema is structured data that labels the questions and answers on a page so search engines and AI tools can identify and read them accurately."
}
},
{
"@type": "Question",
"name": "Do I need a developer to add FAQ schema?",
"acceptedAnswer": {
"@type": "Answer",
"text": "No. You can generate the code with a free tool and paste it into Google Tag Manager or your CMS header without writing any code yourself."
}
}
]
}
</script>
```

---

**Which Pages to Prioritise First**

You don't need to mark up every page on day one. Start with these three:

1. **Homepage:** Usually your highest-traffic page with broad product or brand FAQs.
2. **Pricing Page:** Directly answers questions about plans, costs, and features that users often type into AI search engines.
3. **Top-Performing Blog Post:** Your highest-traffic organic post, making its answers easier for crawlers to process.

---

**Sources**

* [Google Search Central — FAQ rich result deprecation coverage, Search Engine Journal](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/)
* [Schema.org Validator](https://validator.schema.org/) — official tool for checking structured data syntax
* Google Search Central documentation changelog — deprecation notice added to the FAQ structured data page, May 7–8, 2026, with removal of FAQ documentation and Rich Results Test support following in June 2026
* Google's generative AI search guidance (published mid-May 2026) — confirms structured data isn't required for AI Overviews or AI Mode, and there's no special [schema.org](http://schema.org/) markup for either
* Google Tag Manager Help — Custom HTML tags — official steps for creating and triggering a Custom HTML tag

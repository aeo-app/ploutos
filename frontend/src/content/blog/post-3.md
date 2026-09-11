---
title: "How to Add FAQPage Schema in 10 Minutes (No-Code Guide)"
description: "A simple guide to adding structured FAQ data to your site for search engines and AI crawlers without touching code."
featured_image: https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80
date: "2026-09-01"
tags: ["AEO", "SEO", "Schema", "Guide"]
---

If your SaaS blog and help pages have an FAQ section, you’re sitting on something worth structuring properly. FAQPage schema is a small piece of code that tells search engines, and increasingly AI crawlers like GPTBot and PerplexityBot, exactly which text on your page is a question and which is the answer. You don’t need a developer, and you don’t need to touch your site’s design. You need about ten minutes and this guide.

By the end, you’ll have FAQPage schema live on your site, validated correctly, and prioritised on the three pages that matter most.

---

**What FAQPage Schema Actually Does (and What It Stopped Doing)**

Schema markup, also called structured data, is invisible code sitting in the background of a page. It doesn’t change how anything looks to a visitor; it changes how machines read your content.

**Key Changes:**
* **Google SERP Dropdown Removed:** FAQPage schema used to earn an expandable Q&A dropdown right under your Google listing. Google officially deprecated this on May 7, 2026, and the rich result stopped appearing in Search that same day.
* **Reporting Tool Phase-Out:** The FAQ search-appearance filter and Rich Results Test support are ending in June 2026, followed by Search Console API support in August 2026[cite: 3].

**Why You Should Still Use It:**[cite: 3]
None of that makes the FAQPage type invalid[cite: 3]. Google’s own notice confirms unused structured data doesn’t cause problems for Search, and the markup remains a valid schema.org type[cite: 3].

The pitch has shifted: you’re not chasing a Google search-results dropdown anymore[cite: 3]. Instead, you are labelling your Q&A content clearly so that Bing, and AI crawlers like GPTBot and PerplexityBot, can parse it without guessing[cite: 3].

---

**5 Steps to Implement FAQPage Schema**[cite: 3]

**Step 1: Pick the FAQ Content You Want to Mark Up**[cite: 3]
* **Copy Existing Text:** Before opening any tool, go to the page and copy the exact questions and answers as they appear[cite: 3]. Keep answers concise (a few sentences each works best)[cite: 3].
* **Visible Content Only:** If the page doesn’t have an FAQ section yet, add 3 to 5 real, relevant questions first[cite: 3]. Schema only works on content that is actually visible to visitors[cite: 3].

**Step 2: Generate the Code With a Free Schema Generator**[cite: 3]
You don’t need to write JSON-LD by hand[cite: 3]. Use free, no-signup tools like Merkle’s Schema Markup Generator or TechnicalSEO.com’s FAQ Schema Generator[cite: 3].
* Select “FAQPage” as the schema type in the generator[cite: 3].
* Enter your first question and matching answer[cite: 3].
* Click “Add Question” and repeat for each Q&A pair[cite: 3].
* The tool will automatically generate the code block wrapped in `<script type="application/ld+json">` tags[cite: 3]. Leave those tags in place[cite: 3].

**Step 3: Copy the Generated Code**[cite: 3]
Select the full code block, starting from `<script type="application/ld+json">` and ending at `</script>`, and copy it[cite: 3]. Make sure not to leave out the script tags, as they tell your site this is structured data, not plain text[cite: 3].

**Step 4: Paste It Into Google Tag Manager (or Your CMS Header)**[cite: 3]
Choose one of the two common paths depending on your setup:
* **Option A — Google Tag Manager (GTM):** Open your GTM workspace and click “New Tag.”[cite: 3] Choose “Custom HTML” as the tag type, and paste your full script block into the HTML field[cite: 3]. Set the trigger to fire only on the specific page(s) where this FAQ content lives, name the tag, and publish the container[cite: 3].
* **Option B — CMS Header (WordPress, Webflow, etc.):** Paste the script into the page-specific header code field so it only loads on that particular page[cite: 3].

**Step 5: Validate the Markup Properly**[cite: 3]
Google’s Rich Results Test is losing FAQ support, so it is no longer the right tool for confirmation[cite: 3].
* Use the **Schema.org Validator** instead[cite: 3].
* Paste in your page URL or the raw code[cite: 3].
* Run the check and look for “FAQPage” recognised with zero errors[cite: 3].
* Confirm the questions and answers in the code match what is visibly written on the page word-for-word[cite: 3].

---

**Finished FAQ JSON-LD Example**[cite: 3]

Here is a completed, validator-clean block for a simple two-question FAQ template[cite: 3]:

```json
<script type="application/ld+json">
{
  "@context": "[https://schema.org](https://schema.org)",
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
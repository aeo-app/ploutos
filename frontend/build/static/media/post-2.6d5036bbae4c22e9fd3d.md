---
title: "How ChatGPT, Perplexity, and Gemini Actually Choose What to Recommend"
description: "Why high Google rankings don't guarantee AI citations, and how to structure content using recognized standards to be verified and quoted."
featured_image: https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80
date: "2026-08-11"
tags: ["AEO", "SEO", "AI Search", "Content Strategy", "Schema"]
---

Ranking high on Google doesn't mean you will show up in AI answers. You also need to structure content so AI can easily read, evaluate, and use it.

* **Traditional Search Engines:** They just give you a list of website links. Websites compete to rank at the top of the page.
* **AI Search Engines:** They gather information from multiple websites and give you a direct, combined answer. Here, websites compete to be trusted and cited as a source by the AI.

A site can hold the top Google position for a topic and still be absent from an AI-generated answer on that same topic, because the two systems are solving different problems: one ranks documents, the other verifies and assembles facts. Multiple independent citation studies report that a meaningful share of what AI tools cite falls outside the usual top-10 Google results for the same query — and that share has grown year over year. The overlap between "what ranks" and "what gets cited" is narrowing, not widening.

This article explains, in plain terms, how these systems locate sources, what they retrieve, and why they use some content while skipping other content. To keep the analysis grounded rather than speculative, it draws on established, publicly documented standards and frameworks — including the U.S. National Institute of Standards and Technology's AI Risk Management Framework (NIST AI RMF), the Federal Trade Commission's Endorsement Guides, and the W3C's structured-data standards — rather than relying solely on unverified industry commentary. It closes with a practical, standards-aligned checklist.

---

**A Standards-Based View of AI Trust**

AI companies do not make up their own rules when deciding which sources to trust; instead, they follow official guidelines like the NIST AI Risk Management Framework (AI RMF 1.0) introduced in January 2023. These standards state that for an AI system to be trustworthy, the information it shares must be accurate and repeatable — not just popular — and the system must remain transparent by clearly showing where its details come from.

Two of those characteristics explain most of what follows in this article:
* A system built to be valid and reliable has to check whether the information it surfaces is accurate and reproducible, not merely popular.
* A system built to be accountable and transparent has to be able to show where a claim came from.

That is why AI engines favour content that is independently corroborated, clearly structured, and dated — properties that make a source easy to verify and attribute.

---

**1. AI Tools Don't Rank Pages. They Pull Facts and Build an Answer.**

An AI search engine typically breaks a complex prompt into several targeted sub-queries, retrieves candidate pages for each, and cites only the sources that contribute directly to the final answer. Traditional ranking position influences retrieval, but it is not the deciding factor, as content teams often assume.

**What is Query Fan-Out?** Instead of doing just one search, an AI does multiple smaller searches to answer your single question.

**Why the Sources Look Different:** Because the AI searches for different details in multiple places, the sources it lists may look completely different from Google's top page results.

**The three major AI engines handle retrieval differently:**

* **Perplexity:** Behaves like a research assistant. It searches the live web for most queries and draws from a wide mix of sources, including forums and specialist sites with granular detail that larger general sites often lack.
* **ChatGPT:** Applies a narrower filter. When it searches the web, it evaluates a batch of candidate pages for relevance and trustworthiness, then draws from a small number — often two to four sources — rather than citing everything it reviewed.
* **Gemini:** Draws heavily on Google's own index and applies a similar multi-query approach. It often shows fewer visible citations than the other two, especially when it paraphrases rather than quotes directly.

**Practical implication:** optimise for retrieval across multiple engines and multiple sub-queries on a topic, not for a single ranking algorithm.

---

**2. Structure That Aligns With Recognised Web Standards Improves Retrieval**

AI systems do not read a page top to bottom the way a person does. They scan for discrete, self-contained facts — a definition, a figure, a procedural step — that can be extracted without losing meaning. Content that states its answer early is retrieved more often than content that arrives at the point after several paragraphs of introduction.

This is not merely a stylistic preference. The structured-data markup that makes a page's content explicit to machines — most commonly expressed as JSON-LD — is built on **JSON-LD 1.1**, a formal **World Wide Web Consortium (W3C) Recommendation** published in July 2020. The vocabulary used inside that markup, Schema.org, is itself developed through open W3C Community Groups and is expressed using W3C-defined formats (JSON-LD, RDFa) alongside the WHATWG Microdata format. In other words, using structured markup correctly is an act of conformance with recognised, publicly governed interoperability standards for the Web — the same standards that browsers, search engines, and AI retrieval systems all rely on to parse content unambiguously.

**In practice, that means:**

* Marking up FAQs, step-by-step procedures, and product or organisation details using Schema.org vocabulary in JSON-LD format.
* Using distinct, descriptive headings that map to the actual sections of the page, rather than decorative or vague labels.
* Keeping paragraphs brief and answers close to the top of each section, so both the visible content and its underlying markup describe the identical structure.

Even without technical markup, plain formatting — short paragraphs, clear headings, numbered steps, simple tables — signals structure that both conventional search engines and AI retrieval systems pick up on. Structured markup formalises that signal in a machine-readable, standards-compliant form.

---

**3. Independent Corroboration Functions Like Substantiation**

A brand controls what it says about itself. A business can describe itself as the leading provider in its category on its own website, and that claim carries the weight the business chooses to give it — but AI systems are built to treat self-description with more caution than externally verified fact, because a party describing itself has an inherent, undisclosed interest in the outcome.

A useful, if imperfect, real-world parallel is how the **FTC's Guides Concerning the Use of Endorsements and Testimonials in Advertising (16 CFR Part 255)** and the FTC's related advertising substantiation doctrine treat marketing claims. Those Guides require that endorsements be truthful, reflect genuine and substantiated experience, and disclose any material connection between an endorser and the business being promoted — the underlying principle being that a claim's credibility depends on its independence from the party making it, and on whether competent, reliable evidence backs it up. The FTC framework governs advertising disclosure, not AI citation behaviour, but the evidentiary logic is the same one AI systems apply: an unsubstantiated first-party claim is treated as weaker evidence than a claim corroborated by independent, disinterested sources.

**In practice, the sources that build this kind of independent corroboration include:**

* Forum discussions
* Video reviews
* Comparison articles
* Review platforms
* Press coverage

Each one gives an AI system something to check a brand's own claims against. When many unrelated sources describe a product the same way the business itself does, that consistency functions as corroborating evidence. When a business's own website is the only place making a claim, the AI system has comparatively little basis to treat that claim as verified.

A separate, practical point: being mentioned by an AI system is not the same as being linked. Several AI tools name a brand in a generated answer without providing a clickable citation. Independent corroboration can therefore improve the likelihood of being cited without guaranteeing referral traffic — a distinction that did not significantly exist in a search-engine-only environment.

---

**4. Currency, Provenance, and the "Valid and Reliable" Standard**

Search engines have long favoured freshness. AI systems have another reason to care: when an AI system states a fact, it is putting its own output's accuracy on the line, not simply pointing a user to a page that may be outdated. That raises the operational cost of citing stale or unverifiable information, a practical expression of the NIST AI RMF's validity and reliability characteristic described above.

This is also consistent with recognised data-governance practice outside the AI context. The **FAIR Data Principles** (Findable, Accessible, Interoperable, Reusable), first published by Wilkinson et al. in *Scientific Data* in 2016 and widely adopted as a data-stewardship standard, specifically call for data and metadata to carry clear provenance and licensing information so that a downstream user — human or machine — can judge whether the material is current and trustworthy enough to reuse. Dating a claim, citing the source it came from, and updating figures on a defined schedule are, in effect, provenance practices in the FAIR sense, applied to a web page rather than a research dataset.

Different AI systems appear to apply different freshness windows — some seem to favour content updated within the past week, others operate on more of a monthly or quarterly cycle — but the direction is consistent: a page untouched for a year is treated as a riskier citation than a recently reviewed one, even where the underlying facts have not changed.

**Practical implication:** date every material claim, cite the primary source it rests on, and review key pages on a defined schedule rather than an ad-hoc one.

---

**5. A Standards-Aligned Five-Point Checklist**

Each item below ties to the specific principle it draws on, so the rationale — not just the instruction — travels with the checklist.

**1. Answer first, then explain**

State the answer to the implied question in the first line of each section, then support it. This directly serves the NIST AI RMF's explainability and interpretability characteristic: content that states its conclusion plainly is easier for a retrieval system to extract without misreading it.

**2. Use W3C-conformant structured markup**

Implement FAQ, HowTo, Product, and Organization markup in JSON-LD, per the W3C's JSON-LD 1.1 Recommendation and the Schema.org vocabulary. This is a standards-compliance measure, not a ranking trick, and it gives AI systems and search engines a shared, unambiguous description of the page's content.

**3. Build independent, off-site corroboration**

Pursue genuine mentions on:

* Review platforms
* Comparison sites
* Forums
* Video platforms
* Press outlets

Applying the same logic behind the FTC's substantiation standard, treat every independently sourced, accurate mention as evidence that strengthens a first-party claim — and treat first-party claims with no outside corroboration as inherently weaker evidence, because that is how AI retrieval systems tend to treat them too.

**4. Maintain claim consistency across all sources**

Describe the brand, product names, and core factual claims the same way on the company website and everywhere else that description can be influenced. Consistency across independent sources lets an AI system treat a claim as accountable and verifiable rather than an isolated, unconfirmed assertion — directly supporting the NIST framework's accountable and transparent characteristic.

**5. Maintain dated, provenance-backed content**

Update key pages on a defined schedule, refresh figures, and visibly date material claims and their sources. This reflects the provenance requirement in the FAIR Data Principles and directly supports the validity and reliability that NIST identifies as the foundation of trustworthy AI output.

Conventional SEO fundamentals are not obsolete; they remain the baseline. What has changed is the objective above that baseline: the goal is no longer solely to secure a ranking position, but to become a source that AI systems can verify, attribute, and trust enough to quote.

---

**Sources**

National Institute of Standards and Technology, [Artificial Intelligence Risk Management Framework (AI RMF 1.0) — NIST AI 100-1](https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf) (January 2023).

Federal Trade Commission, [Guides Concerning the Use of Endorsements and Testimonials in Advertising, 16 CFR Part 255](https://www.federalregister.gov/documents/2023/07/26/2023-14795/guides-concerning-the-use-of-endorsements-and-testimonials-in-advertising) — see also the FTC's plain-language [summary for businesses](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).

World Wide Web Consortium, [JSON-LD 1.1 — A JSON-based Serialization for Linked Data](https://www.w3.org/TR/json-ld11/) (W3C Recommendation, 16 July 2020); Schema.org, [How We Work](https://google.schema.org/docs/howwework.html).

Wilkinson, M.D. et al., [The FAIR Guiding Principles for Scientific Data Management and Stewardship](https://www.nature.com/articles/sdata201618), Scientific Data 3, 160018 (2016).

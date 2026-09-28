(function () {
  "use strict";

  var THEME_KEY = "ploutos.theme";
  var DOMAIN_KEY = "ploutos.domain";

  var PAGES = [
    { id: "start", file: "index.html", label: "Start" },
    { id: "competitors", file: "competitors.html", label: "Competitors" },
    { id: "keywords", file: "keywords.html", label: "Keywords" },
    { id: "profile", file: "profile.html", label: "Your site" },
    { id: "rankings", file: "rankings.html", label: "Rankings" },
    { id: "channels", file: "channels.html", label: "Channels" },
    { id: "authority", file: "authority.html", label: "Trust" },
    { id: "content", file: "content.html", label: "What to write" },
    { id: "social", file: "social.html", label: "When to post" },
    { id: "summary", file: "summary.html", label: "Plan" }
  ];

  var AI_ENGINES = ["ChatGPT", "Gemini", "Perplexity", "Claude", "Microsoft Copilot"];

  var CHANNEL_GROUPS = [
    {
      name: "Classic search",
      note: "The two engines people type into directly. Everything else leans on one of these.",
      channels: [
        {
          name: "Google",
          tactics: [
            "Answer the question in the first two sentences. That is the text AI Overviews lift.",
            "Finish your Google Business Profile and reply to every review within 24 hours.",
            "Add FAQPage schema to your three best pages."
          ]
        },
        {
          name: "Bing",
          tactics: [
            "Ping IndexNow every time you publish, so new pages show up within hours.",
            "Fix whatever Google Search Console flags. Bing reads the same signals.",
            "Keep your name, address and phone identical on every site and profile."
          ]
        }
      ]
    },
    {
      name: "AI answers",
      note: "These five quote pages instead of listing them. Being named is the whole game.",
      channels: [
        {
          name: "ChatGPT",
          tactics: [
            "Publish a curated /llms.txt listing your pages in plain language.",
            "Make the first sentence a complete answer, not an introduction.",
            "Earn real third-party mentions. ChatGPT weighs forums and directories heavily."
          ]
        },
        {
          name: "Gemini",
          tactics: [
            "Publish clear, factual pages with a visible date on them.",
            "Seed your Business Profile Q&A with the exact words customers type.",
            "Keep pages fast. Gemini favours quick, well-structured answers."
          ]
        },
        {
          name: "Perplexity",
          tactics: [
            "Publish citable source pages: clean data tables with a stated source.",
            "Get linked from sites Perplexity already trusts.",
            "Answer forum questions with a real, specific figure."
          ]
        },
        {
          name: "Claude",
          tactics: [
            "Write deeper, better-structured pages. Claude rewards substance over length tricks.",
            "State facts plainly and say where they came from.",
            "Keep /llms.txt honest about what you want read."
          ]
        },
        {
          name: "Microsoft Copilot",
          tactics: [
            "You are found through Bing, so fix Bing indexing first.",
            "Use IndexNow. Copilot favours what was published most recently.",
            "Republish proven pages with today's date instead of writing near-duplicates."
          ]
        }
      ]
    },
    {
      name: "Social and video",
      note: "Where you post what you published, and where the transcripts get read.",
      channels: [
        {
          name: "YouTube",
          tactics: [
            "Publish one Short for every blog post. The transcript is what engines read.",
            "The first two lines of your About section must answer what you do.",
            "Say the target question out loud in the first two seconds."
          ]
        },
        {
          name: "Instagram",
          tactics: [
            "Reels only for reach: 30 seconds maximum, hook in two seconds, captions on.",
            "One Reel for every post you publish.",
            "Reply to every comment within a day."
          ]
        },
        {
          name: "Facebook",
          tactics: [
            "Show up in the city and expat groups your customers already read.",
            "Answer fully first, then add one link only if it genuinely helps.",
            "Ask every fifth happy customer for a review."
          ]
        },
        {
          name: "LinkedIn",
          tactics: [
            "Lead with the customer story, not the service list.",
            "Post the same content within 24 hours of the blog going live.",
            "Comment on five relevant posts a week under your own name."
          ]
        }
      ]
    }
  ];

  var PUBLISH_PLAN = [
    {
      day: 7,
      format: "Tactical post",
      piece: function (c) {
        return "What \u201c" + c.kw1 + "\u201d actually costs";
      },
      why: "The highest-volume search you are not ranking for. Quickest win on the whole list.",
      channels: ["Blog", "LinkedIn", "Reels", "Instagram", "Google Profile"]
    },
    {
      day: 9,
      format: "Pillar post",
      piece: function (c) {
        return "How to choose an international mover in " + c.noun;
      },
      why: "The page every other page links to. Long, honest, and worth updating forever.",
      channels: ["Blog", "LinkedIn", "Reels", "YouTube"]
    },
    {
      day: 14,
      format: "Tactical post",
      piece: function () {
        return "How to avoid getting a bad quote";
      },
      why: "Fear of being ripped off is the reason people hesitate. Answer it and they contact you.",
      channels: ["Blog", "LinkedIn", "Reels", "Instagram", "Google Profile"]
    },
    {
      day: 16,
      format: "Pillar post",
      piece: function () {
        return "The twelve questions to ask any mover";
      },
      why: "The single most useful thing you can own. Quoted, linked and shared more than anything else.",
      channels: ["Blog", "LinkedIn", "Reels", "Facebook"]
    },
    {
      day: 21,
      format: "Explainer",
      piece: function (c) {
        return "What \u201c" + c.kw2 + "\u201d actually includes";
      },
      why: "Service pages are quoted word for word by AI engines when they answer in plain language.",
      channels: ["Blog", "LinkedIn", "Reels", "Google Profile"]
    },
    {
      day: 23,
      format: "Data post",
      piece: function (c) {
        return "Cost of moving out of " + c.noun + " to 15 countries";
      },
      why: "Tables get quoted verbatim by every AI engine. A citable table is the cheapest authority you can build.",
      channels: ["Blog", "LinkedIn", "YouTube", "Instagram"]
    },
    {
      day: 25,
      format: "Criteria roundup",
      piece: function () {
        return "What separates a good mover from a bad one";
      },
      why: "Clear, checkable criteria win this category. Marketing copy loses it.",
      channels: ["Blog", "LinkedIn", "Reels", "Facebook"]
    },
    {
      day: 28,
      format: "Case study",
      piece: function (c) {
        return "What 30 days did for " + c.display;
      },
      why: "Proves the rest of the plan works, and is the kind of page AI engines quote as evidence.",
      channels: ["Blog", "LinkedIn", "YouTube", "Google Profile"]
    }
  ];

  var NOUNS = [
    "Sydney",
    "Melbourne",
    "Brisbane",
    "Auckland",
    "Singapore",
    "Tokyo"
  ];

  var SERVICES = [
    "international removals",
    "student visa help",
    "skilled migration",
    "corporate relocation",
    "school enrolment advice"
  ];

  function read(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (err) {
      return "";
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      return;
    }
  }

  function clear(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      return;
    }
  }

  function currentPageId() {
    return document.body.getAttribute("data-page") || "start";
  }

  function pageIndex() {
    var id = currentPageId();
    for (var i = 0; i < PAGES.length; i++) {
      if (PAGES[i].id === id) {
        return i;
      }
    }
    return 0;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeDomain(raw) {
    var value = String(raw || "").trim().toLowerCase();
    value = value.replace(/^[a-z]+:\/\//, "");
    value = value.replace(/^www\./, "");
    value = value.split("/")[0].split("?")[0].split("#")[0];
    value = value.replace(/:\d+$/, "");
    value = value.replace(/[.,;]+$/, "");
    return value;
  }

  function isValidDomain(value) {
    if (!value || value.length > 253) {
      return false;
    }
    if (!value.indexOf(".") || value.indexOf(".") === value.length - 1) {
      return false;
    }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) {
      return false;
    }
    return value.split(".").every(function (part) {
      return part.length > 0 && part.length <= 63 && part.indexOf("-") !== 0;
    });
  }

  function displayDomain(domain) {
    var parts = domain.split(".");
    var name = parts[0].replace(/[-_]/g, " ");
    var tail = parts.slice(1).join(".");
    return name.charAt(0).toUpperCase() + name.slice(1) + (tail ? "." + tail : "");
  }

  function hashString(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function makeRandom(seed) {
    var state = seed || 1;
    return function () {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, list) {
    return list[Math.floor(rand() * list.length) % list.length];
  }

  function between(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  function thousands(rand, min, max) {
    return between(rand, min, max).toLocaleString("en-US");
  }

  function buildProfile(domain) {
    var rand = makeRandom(hashString(domain + "::profile"));
    var noun = pick(rand, NOUNS);
    var service = pick(rand, SERVICES);
    var second = pick(makeRandom(hashString(domain + "::second")), SERVICES);
    return {
      rand: rand,
      display: displayDomain(domain),
      noun: noun,
      service: service,
      second: second,
      summary:
        "A relocation company helping people and businesses move to " +
        noun +
        ". They mostly talk about " +
        service +
        ", and they also cover " +
        second +
        ".",
      audience: "Families, students and small companies moving across the world",
      topics: [
        service,
        "moving to " + noun,
        "cost of " + service,
        second,
        noun + " cost of living",
        "visa basics"
      ],
      age: between(rand, 2, 11),
      articles: between(rand, 24, 160)
    };
  }

  function buildCompetitors(domain) {
    var base = hashString(domain + "::competitors");
    var rand = makeRandom(base);
    var name = displayDomain(domain).split(".")[0];
    var rows = [];
    var used = {};
    for (var i = 0; i < 3; i++) {
      var candidate;
      do {
        candidate = pick(rand, NOUNS).toLowerCase() + pick(rand, [
          "movals",
          "relocation",
          "movers",
          "partners"
        ]) + ".com";
      } while (used[candidate]);
      used[candidate] = true;
      rows.push({
        name: candidate,
        strength: between(rand, 42, 92),
        monthly: thousands(rand, 900, 24000),
        reason: pick(rand, [
          "Has more pages written on " + pick(rand, NOUNS),
          "Ranks for most " + pick(rand, SERVICES) + " searches",
          "Publishes new guides every week",
          "Gets mentioned by local news sites"
        ])
      });
    }
    rows.sort(function (a, b) {
      return b.strength - a.strength;
    });
    return { name: name, rows: rows };
  }

  function buildKeywords(profile) {
    var rand = makeRandom(hashString(profile.display + "::keywords"));
    var rows = [];
    for (var i = 0; i < 5; i++) {
      var term = pick(rand, [
        profile.service + " " + profile.noun,
        "moving to " + profile.noun + " cost",
        profile.second + " " + profile.noun,
        profile.noun + " suburbs guide",
        "best " + profile.service + " company",
        "how long does moving to " + profile.noun + " take"
      ]);
      if (rows.some(function (row) {
        return row.term === term;
      })) {
        i -= 1;
        continue;
      }
      var search = between(rand, 8, 240) * 10;
      var difficulty = between(rand, 12, 78);
      rows.push({
        term: term,
        search: search.toLocaleString("en-US"),
        difficulty: difficulty,
        youRank: rand() > 0.62 ? between(rand, 4, 30) : 0
      });
    }
    rows.sort(function (a, b) {
      return Number(b.search.replace(/,/g, "")) - Number(a.search.replace(/,/g, ""));
    });
    return rows;
  }

  function buildAuthority(profile) {
    var rand = makeRandom(hashString(profile.display + "::authority"));
    var score = between(rand, 18, 74);
    return {
      score: score,
      label: score > 55 ? "Strong" : score > 32 ? "Growing" : "Early",
      links: thousands(rand, 40, 900),
      referring: between(rand, 20, 240),
      age: profile.age,
      notes: [
        "Link to " + profile.service + " guides from your busiest pages",
        "Ask three happy customers for a short review on their own sites",
        "Get listed on two " + profile.noun + " community sites"
      ]
    };
  }

  function buildPlan(profile, keywords) {
    var kw0 = keywords[0].term;
    var kw1 = keywords[1].term;
    var kw2 = keywords[2].term;

    var days = [
      {
        title: "See where you start",
        tag: "checkpoint",
        steps: [
          "Write down the five searches your customers type most. Start with \u201c" + kw0 + "\u201d.",
          "Ask each one to ChatGPT, Gemini, Perplexity, Claude and Copilot. Screenshot every answer.",
          "Be honest about whether you appear. \u201cNo mention\u201d is a real result, not a failure.",
          "Save your current review count and star rating. That is the number you beat on Day 27."
        ]
      },
      {
        title: "Add structured data to your main pages",
        steps: [
          "Add MovingCompany schema to your homepage and every service page.",
          "Add FAQPage schema to your three best existing pages.",
          "Validate each one before you move on. A broken schema helps nobody."
        ]
      },
      {
        title: "Make your site easy for AI engines to read",
        steps: [
          "Write a short, curated /llms.txt listing your pages in plain language.",
          "Resubmit your sitemap in Google Search Console and Bing.",
          "Do a speed pass: compress images, drop unused scripts, check mobile."
        ]
      },
      {
        title: "Set up the channels you will post from",
        steps: [
          "Create your YouTube channel. The first two lines of the About section should answer what you do.",
          "Complete your Google Business Profile: category, services, service area, hours, real photos.",
          "Join the communities you want to post in now. Approval can take days.",
          "Create one tracker sheet: citations, progress, links, forum answers, reviews."
        ]
      },
      {
        title: "Checkpoint: is everything ready?",
        tag: "signoff",
        steps: [
          "Confirm the schema validates, /llms.txt is live, your Business Profile is filled in and your community applications are approved.",
          "Fix anything missing today. Do not start publishing into a broken setup.",
          "Decide: go, or push the sprint back a week. Better now than at Day 20."
        ]
      },
      {
        title: "Draft week one",
        tag: "light",
        steps: [
          "Write drafts of your three blog posts.",
          "Film your first short video: 30 seconds maximum, hook in the first two seconds.",
          "Or use today to catch up on anything you missed."
        ]
      },
      {
        title: "Publish: the cost guide",
        steps: [
          "Publish your tactical post for \u201c" + kw1 + "\u201d.",
          "Share it on LinkedIn as a short teaser, and post the short video.",
          "Post your weekly Google Business Profile update.",
          "Read everything yourself before it goes out. Never publish a placeholder number."
        ]
      },
      {
        title: "Answer real questions online",
        steps: [
          "Find two or three live questions in the communities you joined and answer them properly.",
          "Answer fully in the first two or three sentences, as if no link existed.",
          "Add at most one link, only if it genuinely helps. Say you are a moving company where the rules ask."
        ]
      },
      {
        title: "Publish: your pillar page",
        steps: [
          "Publish the page that answers the big question in your field. Your longest, best page.",
          "Turn it into a LinkedIn carousel and a short video.",
          "Link to it from your three busiest older posts."
        ]
      },
      {
        title: "Earn your first links",
        steps: [
          "60 minutes, five emails maximum. Quality beats volume.",
          "Target two publications, one directory or association, and one expert-quote opportunity.",
          "Offer data or a template. Never ask for a link in the first email.",
          "Read the final text of every email before it sends."
        ]
      },
      {
        title: "Refresh, do not repeat",
        steps: [
          "Find a page you already rank for. Update it with fresh information and a new date.",
          "Publish a customer case study on your Google Business Profile.",
          "A refreshed proven page beats a brand-new thin one, every time."
        ]
      },
      {
        title: "Week one wrap-up",
        tag: "light",
        steps: [
          "Seed five questions and answers on your Business Profile, using the words customers actually type.",
          "Reply to every new review within 24 hours.",
          "Spend 15 minutes filling in your tracker. Then stop."
        ]
      },
      {
        title: "Draft week two",
        tag: "light",
        steps: [
          "Write drafts for the week two posts, and film your next two short videos.",
          "Pick the page you already rank for that needs the most refreshing."
        ]
      },
      {
        title: "Publish: how to avoid getting it wrong",
        steps: [
          "Publish the post that warns people about the mistake they are about to make.",
          "Share it on LinkedIn and post the short video.",
          "Post your weekly Business Profile update."
        ]
      },
      {
        title: "Answer real questions, round two",
        steps: [
          "Two or three more genuine answers, same rules: answer first, one link at most.",
          "Log every answer and the links it earned."
        ]
      },
      {
        title: "Publish: the questions page",
        steps: [
          "Publish your \u201ctwelve questions to ask\u201d page \u2014 the single most useful thing you can own.",
          "Keep it scannable. Numbered questions, short answers.",
          "Turn it into a carousel and a short video."
        ]
      },
      {
        title: "Earn links, round two",
        steps: [
          "Same 60 minutes, same five-email cap.",
          "Reference the target's real post or statistic in every email. Generic outreach gets ignored."
        ]
      },
      {
        title: "Refresh another proven page",
        steps: [
          "Upgrade your second-best page with fresh information and today's date.",
          "Publish a case study on your Business Profile."
        ]
      },
      {
        title: "Business Profile questions and reviews",
        steps: [
          "Seed the next five questions and answers on your profile.",
          "Answer every new review, and ask every fifth happy customer for one."
        ]
      },
      {
        title: "Draft week three",
        tag: "light",
        steps: [
          "Draft the service explainer and the data table.",
          "Gather the real figures for the table from your founder. Never invent a number."
        ]
      },
      {
        title: "Publish: what your service actually includes",
        steps: [
          "Publish the page that defines your service in plain words, for \u201c" + kw2 + "\u201d.",
          "Say exactly what is included and what is not. Vagueness is why people leave.",
          "Share it and post the short video."
        ]
      },
      {
        title: "Answer real questions, round three",
        steps: [
          "Two or three answers, same rules.",
          "Look for the question that keeps coming up. That is your next article."
        ]
      },
      {
        title: "Publish: the data table",
        steps: [
          "Publish a table-heavy post: real costs to fifteen destinations, dated this year.",
          "Keep the table clean. AI engines quote tables word for word, so make it worth quoting.",
          "State where the numbers came from."
        ]
      },
      {
        title: "Earn links, round three",
        steps: [
          "The data table is your best outreach asset this month. Offer it as a citable source.",
          "Five emails, one hour, founder approves each one."
        ]
      },
      {
        title: "Publish: what separates the good from the bad",
        steps: [
          "Publish the criteria roundup \u2014 how a reader should actually choose in " + profile.noun + ".",
          "Use honest, checkable criteria. This audience punishes marketing copy.",
          "Publish the case study on your Business Profile too."
        ]
      },
      {
        title: "Mid-sprint check",
        tag: "checkpoint",
        steps: [
          "Re-run two of your five searches in the AI tools. Has anything moved?",
          "Tally mentions and links earned so far.",
          "If nothing has moved, the content is the problem, not the volume. Fix the next post, not the schedule."
        ]
      },
      {
        title: "Re-run the baseline test",
        tag: "checkpoint",
        steps: [
          "Run all five searches across all five engines again and compare against Day 1.",
          "Log every change, including the ones that got worse."
        ]
      },
      {
        title: "Publish: your own 30 days",
        steps: [
          "Publish what these 30 days did for " + profile.display + ".",
          "Pull the numbers: search, Business Profile, video, forum answers, links.",
          "Honest figures make this page worth reading. Leave out the flat ones and nobody trusts the rest."
        ]
      },
      {
        title: "Fix your weakest pages",
        steps: [
          "Refresh your worst one or two pages with fresh FAQ blocks and today's date.",
          "Write down what you would do differently. That list is your next 30 days."
        ]
      },
      {
        title: "Decide: keep, adjust or expand",
        tag: "signoff",
        steps: [
          "Publish your tracker summary.",
          "Decide what continues. One thing that works beats five that half-work.",
          "Book the next 30 days in the same calendar before you close this one."
        ]
      }
    ];

    var context = {
      display: profile.display,
      noun: profile.noun,
      kw0: kw0,
      kw1: kw1,
      kw2: kw2
    };

    for (var p = 0; p < PUBLISH_PLAN.length; p++) {
      var item = PUBLISH_PLAN[p];
      var target = days[item.day - 1];
      target.piece = item.piece(context);
      target.format = item.format;
      target.why = item.why;
      target.channels = item.channels;
    }

    var weeks = [];
    for (var i = 0; i < days.length; i++) {
      var weekNumber = Math.floor(i / 7) + 1;
      var day = days[i];
      if (!weeks[weekNumber - 1]) {
        weeks[weekNumber - 1] = { title: "Week " + weekNumber, days: [] };
      }
      weeks[weekNumber - 1].days.push({
        number: i + 1,
        title: day.title,
        tag: day.tag || "",
        steps: day.steps,
        piece: day.piece || "",
        format: day.format || "",
        why: day.why || "",
        channels: day.channels || []
      });
    }

    var signoff = 0;
    var checkpoint = 0;
    var publish = 0;
    for (var j = 0; j < days.length; j++) {
      if (days[j].tag === "signoff") {
        signoff += 1;
      }
      if (days[j].tag === "checkpoint") {
        checkpoint += 1;
      }
      if (days[j].title.indexOf("Publish:") === 0) {
        publish += 1;
      }
    }

    return { weeks: weeks, days: days.length, signoff: signoff, checkpoint: checkpoint, publish: publish };
  }

  function buildRankings(profile, keywords, competitors) {
    var rand = makeRandom(hashString(profile.display + "::rankings"));

    var google = keywords.map(function (row) {
      return {
        term: row.term,
        position: rand() > 0.42 ? between(rand, 1, 22) : 0
      };
    });

    var bing = google.map(function (row, i) {
      var local = makeRandom(hashString(profile.display + "::bing" + i + row.term))();
      if (row.position === 0) {
        return { term: row.term, position: local > 0.5 ? between(rand, 1, 30) : 0 };
      }
      var shifted = row.position + between(rand, -3, 6);
      return { term: row.term, position: shifted < 1 ? 1 : shifted };
    });

    var ai = AI_ENGINES.map(function (engine) {
      var engineRand = makeRandom(hashString(profile.display + "::ai" + engine));
      var reach =
        engine === "ChatGPT"
          ? 0.12 + engineRand() * 0.5
          : engine === "Copilot"
            ? 0.04 + engineRand() * 0.34
            : 0.06 + engineRand() * 0.42;
      var named = keywords
        .map(function (row, i) {
          return makeRandom(hashString(profile.display + "::aim" + engine + i + row.term))() <
            reach
            ? row.term
            : null;
        })
        .filter(Boolean);
      return {
        name: engine,
        named: named.length,
        total: keywords.length,
        examples: named.slice(0, 2)
      };
    });

    var social = [
      { name: "YouTube", followers: between(rand, 0, 4) === 0 ? 0 : between(rand, 20, 4200), reach: 0 },
      { name: "Instagram", followers: between(rand, 0, 3) === 0 ? 0 : between(rand, 80, 9400), reach: 0 },
      { name: "Facebook", followers: between(rand, 0, 4) === 0 ? 0 : between(rand, 150, 12000), reach: 0 },
      { name: "LinkedIn", followers: between(rand, 0, 4) === 0 ? 0 : between(rand, 40, 3100), reach: 0 }
    ].map(function (row) {
      row.reach = row.followers === 0 ? 0 : Math.round(row.followers * (0.3 + rand() * 1.4));
      return row;
    });

    var listed = google.filter(function (row) {
      return row.position > 0;
    });
    var average = listed.length
      ? Math.round(
          listed.reduce(function (sum, row) {
            return sum + row.position;
          }, 0) / listed.length
        )
      : 0;

    var aiTotal = ai.reduce(function (sum, engine) {
      return sum + engine.named;
    }, 0);
    var aiMax = AI_ENGINES.length * keywords.length;

    var board = competitors.rows
      .map(function (row) {
        var rowRand = makeRandom(hashString(row.name + "::board"));
        var positions = [];
        for (var k = 0; k < keywords.length; k++) {
          if (rowRand() > 0.5) {
            positions.push(between(rowRand, 1, 18));
          }
        }
        var avg = positions.length
          ? Math.round(
              positions.reduce(function (sum, value) {
                return sum + value;
              }, 0) / positions.length
            )
          : 0;
        return {
          name: row.name,
          average: avg,
          mentions: between(rowRand, 3, 22),
          isYou: false
        };
      })
      .sort(function (a, b) {
        return a.average - b.average || b.mentions - a.mentions;
      });

    board.unshift({
      name: profile.display,
      average: average,
      mentions: aiTotal,
      isYou: true
    });

    return {
      google: google,
      bing: bing,
      ai: ai,
      social: social,
      board: board,
      average: average,
      listed: listed.length,
      aiTotal: aiTotal,
      aiMax: aiMax,
      presence: 0
    };
  }

  function buildChannels(profile, rankings) {
    var groups = CHANNEL_GROUPS.map(function (group) {
      return {
        name: group.name,
        note: group.note,
        channels: group.channels.map(function (channel) {
          var score = presenceScoreFor(channel.name, rankings);
          return {
            name: channel.name,
            tactics: channel.tactics,
            score: score,
            status: statusFor(score),
            detail: presenceDetailFor(channel.name, rankings)
          };
        })
      };
    });

    var all = [];
    var present = 0;
    for (var i = 0; i < groups.length; i++) {
      all = all.concat(groups[i].channels);
    }
    for (var j = 0; j < all.length; j++) {
      if (all[j].score > 0) {
        present += 1;
      }
    }
    all.sort(function (a, b) {
      return a.score - b.score;
    });

    return {
      groups: groups,
      weakest: all[0],
      total: all.length,
      present: present
    };
  }

  function presenceScoreFor(name, rankings) {
    if (name === "Google" || name === "Bing") {
      var rows = name === "Google" ? rankings.google : rankings.bing;
      var listed = rows.filter(function (row) {
        return row.position > 0;
      });
      if (!listed.length) {
        return 0;
      }
      var total = listed.reduce(function (sum, row) {
        return sum + row.position;
      }, 0);
      var average = total / listed.length;
      var score = Math.round(100 - (average - 1) * 5.5);
      score = Math.max(4, Math.min(96, score));
      return name === "Bing" ? Math.max(0, score - 14) : score;
    }

    for (var i = 0; i < AI_ENGINES.length; i++) {
      if (AI_ENGINES[i] === name) {
        var engine = rankings.ai[i];
        if (!engine || engine.named === 0) {
          return 0;
        }
        return Math.round((engine.named / engine.total) * 100);
      }
    }

    for (var j = 0; j < rankings.social.length; j++) {
      if (rankings.social[j].name === name) {
        var followers = rankings.social[j].followers;
        if (followers === 0) {
          return 0;
        }
        var log = Math.log(followers + 1) / Math.LN10;
        return Math.max(12, Math.min(88, Math.round(15 + log * 16)));
      }
    }

    return 0;
  }

  function presenceDetailFor(name, rankings) {
    if (name === "Google" || name === "Bing") {
      var rows = name === "Google" ? rankings.google : rankings.bing;
      var listed = rows.filter(function (row) {
        return row.position > 0;
      });
      if (!listed.length) {
        return "Not ranking for any of your target searches";
      }
      var base = "Ranking for " + listed.length + " of " + rows.length + " searches";
      if (name === "Bing") {
        var googleListed = rankings.google.filter(function (row) {
          return row.position > 0;
        });
        if (googleListed.length > listed.length) {
          return base + ", but behind Google";
        }
      }
      return base;
    }

    for (var i = 0; i < AI_ENGINES.length; i++) {
      if (AI_ENGINES[i] === name) {
        var engine = rankings.ai[i];
        if (!engine || engine.named === 0) {
          return "Never named in an answer";
        }
        return "Named in " + engine.named + " of " + engine.total + " answers";
      }
    }

    for (var j = 0; j < rankings.social.length; j++) {
      if (rankings.social[j].name === name) {
        var row = rankings.social[j];
        if (row.followers === 0) {
          return "No channel set up yet";
        }
        return row.followers.toLocaleString("en-US") + " followers";
      }
    }

    return "";
  }

  function statusFor(score) {
    if (score >= 70) {
      return { label: "Strong", cls: "tag-good" };
    }
    if (score >= 40) {
      return { label: "Building", cls: "tag" };
    }
    if (score >= 20) {
      return { label: "Barely there", cls: "tag-warn" };
    }
    if (score > 0) {
      return { label: "Almost invisible", cls: "tag-warn" };
    }
    return { label: "Not started", cls: "tag-warn" };
  }

  function buildCalendar(plan) {
    var items = [];
    for (var w = 0; w < plan.weeks.length; w++) {
      for (var d = 0; d < plan.weeks[w].days.length; d++) {
        var day = plan.weeks[w].days[d];
        if (day.piece) {
          items.push({
            day: day.number,
            piece: day.piece,
            format: day.format,
            why: day.why,
            channels: day.channels
          });
        }
      }
    }
    return items;
  }

  function positionLabel(position) {
    if (position === 0) {
      return '<span class="tag tag-warn">Not in top 30</span>';
    }
    var cls = position <= 3 ? "tag tag-good" : position <= 10 ? "tag" : "tag tag-warn";
    return '<span class="' + cls + '">#' + position + "</span>";
  }

  function renderRankings(profile, data) {
    var stats = [
      {
        value: data.listed + " / " + data.google.length,
        label: "Searches you appear in on Google"
      },
      {
        value: data.average ? "#" + data.average : "\u2014",
        label: "Average Google position"
      },
      {
        value: data.aiTotal + " / " + data.aiMax,
        label: "Times an AI engine names you"
      },
      {
        value: data.presence + " / " + (data.ai.length + data.social.length),
        label: "Platforms you show up on"
      }
    ];

    var statHtml = stats
      .map(function (stat) {
        return (
          '<div class="stat"><div class="stat-value" style="font-size:1.5rem">' +
          escapeHtml(stat.value) +
          '</div><div class="stat-label">' +
          escapeHtml(stat.label) +
          "</div></div>"
        );
      })
      .join("");

    var searchRows = data.google
      .map(function (row) {
        return (
          "<tr><td>" +
          escapeHtml(row.term) +
          "</td><td>" +
          positionLabel(row.position) +
          "</td><td>" +
          positionLabel(data.bing[data.google.indexOf(row)].position) +
          "</td></tr>"
        );
      })
      .join("");

    var aiRows = data.ai
      .map(function (engine) {
        var cls =
          engine.named === 0 ? "tag tag-warn" : engine.named >= 3 ? "tag tag-good" : "tag";
        var note =
          engine.named === 0
            ? "Never mentioned"
            : "Named for \u201c" + engine.examples[0] + "\u201d";
        return (
          "<tr><td>" +
          escapeHtml(engine.name) +
          '</td><td><span class="' +
          cls +
          '">' +
          engine.named +
          " of " +
          engine.total +
          "</span></td><td>" +
          escapeHtml(note) +
          "</td></tr>"
        );
      })
      .join("");

    var socialRows = data.social
      .map(function (row) {
        var value = row.followers === 0 ? "Not set up" : row.followers.toLocaleString("en-US");
        return (
          "<tr><td>" +
          escapeHtml(row.name) +
          '</td><td class="num">' +
          value +
          '</td><td class="num">' +
          (row.reach === 0 ? "\u2014" : row.reach.toLocaleString("en-US")) +
          "</td></tr>"
        );
      })
      .join("");

    var boardRows = data.board
      .map(function (row) {
        return (
          '<tr' +
          (row.isYou ? ' class="is-you"' : "") +
          "><td>" +
          (row.isYou ? "Your site" : escapeHtml(row.name)) +
          '</td><td class="num">' +
          (row.average ? "#" + row.average : "\u2014") +
          '</td><td class="num">' +
          row.mentions +
          " / " +
          data.aiMax +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<div class="stat-row">' +
      statHtml +
      "</div>" +
      '<h2 class="section-title">Where you rank on Google and Bing</h2>' +
      '<div class="table-scroll"><table class="table"><thead><tr><th>Search</th>' +
      "<th>Google</th><th>Bing</th></tr></thead><tbody>" +
      searchRows +
      "</tbody></table></div>" +
      '<h2 class="section-title">Do the AI assistants know you?</h2>' +
      '<div class="table-scroll"><table class="table"><thead><tr><th>Assistant</th>' +
      "<th>Named you</th><th>When</th></tr></thead><tbody>" +
      aiRows +
      "</tbody></table></div>" +
      '<h2 class="section-title">Your channels</h2>' +
      '<div class="table-scroll"><table class="table"><thead><tr><th>Channel</th>' +
      "<th>Followers</th><th>Monthly reach</th></tr></thead><tbody>" +
      socialRows +
      "</tbody></table></div>" +
      '<h2 class="section-title">You against your competitors</h2>' +
      '<div class="table-scroll"><table class="table"><thead><tr><th>Site</th>' +
      "<th>Average position</th><th>AI mentions</th></tr></thead><tbody>" +
      boardRows +
      "</tbody></table></div>" +
      '<p class="note">Positions for ' +
      escapeHtml(profile.display) +
      ". The number to move is AI mentions: the three competitors above you are " +
      "already being quoted.</p>"
    );
  }

  function renderChannels(data) {
    var groups = data.groups
      .map(function (group) {
        var cards = group.channels
          .map(function (channel) {
            var tactics = channel.tactics
              .map(function (tactic) {
                return (
                  '<li><span class="tick">&#10003;</span><span>' +
                  escapeHtml(tactic) +
                  "</span></li>"
                );
              })
              .join("");
            return (
              '<div class="card"><div class="card-head"><h3>' +
              escapeHtml(channel.name) +
              '</h3><span class="tag ' +
              channel.status.cls +
              '">' +
              escapeHtml(channel.status.label) +
              "</span></div>" +
              '<div class="bar"><div class="bar-fill" data-width="' +
              channel.score +
              '"></div></div>' +
              '<p class="card-sub">' +
              escapeHtml(channel.detail) +
              "</p>" +
              '<ul class="checklist" style="margin-top:14px">' +
              tactics +
              "</ul></div>"
            );
          })
          .join("");
        return (
          '<h2 class="section-title">' +
          escapeHtml(group.name) +
          '</h2><p class="card-sub" style="margin:-6px 0 14px">' +
          escapeHtml(group.note) +
          '</p><div class="card-list">' +
          cards +
          "</div>"
        );
      })
      .join("");

    return (
      '<div class="card"><h2>Weakest spot: ' +
      escapeHtml(data.weakest.name) +
      "</h2><p class=\"card-sub\">" +
      escapeHtml(data.weakest.detail) +
      ". Everything below is a tactic, not theory. Fix the weak ones first " +
      "\u2014 they move the others.</p></div>" +
      groups +
      '<p class="note">Presence scores are a starting estimate, not a ranking. ' +
      "They tell you where to spend the next week.</p>"
    );
  }

  function renderCalendar(profile, data) {
    var rows = data
      .map(function (item) {
        var channels = item.channels
          .map(function (channel) {
            return '<span class="tag">' + escapeHtml(channel) + "</span>";
          })
          .join("");
        return (
          '<div class="cal-row"><div><div class="cal-day">Day ' +
          item.day +
          '</div><div class="cal-format">' +
          escapeHtml(item.format) +
          "</div></div>" +
          '<div><div class="cal-title">' +
          escapeHtml(item.piece) +
          '</div><p class="cal-why">' +
          escapeHtml(item.why) +
          '</p><div class="tags">' +
          channels +
          "</div></div></div>"
        );
      })
      .join("");

    return (
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-value">' +
      data.length +
      '</div><div class="stat-label">Pieces to publish in 30 days</div></div>' +
      '<div class="stat"><div class="stat-value">3</div><div class="stat-label">Pillar pages</div></div>' +
      '<div class="stat"><div class="stat-value">1</div><div class="stat-label">Data table worth quoting</div></div>' +
      "</div>" +
      '<h2 class="section-title">What we write, and where each piece goes</h2>' +
      '<div class="cal">' +
      rows +
      "</div>" +
      '<p class="note">One piece, posted everywhere it fits. Write once, then ' +
      "republish on every channel above on the same day.</p>"
    );
  }

  function renderCompetitors(data) {
    var cards = data.rows
      .map(function (row) {
        return (
          '<div class="card">' +
          '<div class="card-head"><h3>' +
          escapeHtml(row.name) +
          "</h3><span class=\"tag\">" +
          row.strength +
          " / 100 strength</span></div>" +
          '<p class="card-sub">' +
          escapeHtml(row.reason) +
          ".</p>" +
          '<p class="card-sub">Around <strong>' +
          row.monthly +
          " visitors</strong> a month search for what they offer.</p>" +
          '<div class="bar"><div class="bar-fill" data-width="' +
          row.strength +
          '"></div></div></div>'
        );
      })
      .join("");

    return (
      '<h2 class="section-title">The three sites you are up against</h2>' +
      '<div class="card-list">' +
      cards +
      "</div>" +
      '<p class="note">You do not need to beat all three. Pick the one that is ' +
      "weakest on the topics you care about, and win there first.</p>"
    );
  }

  function renderKeywords(data) {
    var rows = data
      .map(function (row) {
        var status = row.youRank
          ? '<span class="tag tag-good">You rank #' + row.youRank + "</span>"
          : '<span class="tag tag-warn">Not ranking</span>';
        return (
          "<tr><td>" +
          escapeHtml(row.term) +
          "</td><td class=\"num\">" +
          row.search +
          '</td><td class="num">' +
          row.difficulty +
          " / 100</td><td>" +
          status +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<h2 class="section-title">What people are searching for</h2>' +
      '<div class="table-scroll"><table class="table"><thead><tr>' +
      "<th>Search</th><th>People / month</th><th>Hard to rank</th><th>You</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>" +
      '<p class="note">Start with anything marked <em>Not ranking</em> that ' +
      "still gets a decent number of searches. That is the easiest win.</p>"
    );
  }

  function renderProfile(profile) {
    var topics = profile.topics
      .map(function (topic) {
        return '<span class="tag">' + escapeHtml(topic) + "</span>";
      })
      .join("");

    return (
      '<div class="card"><h2>What your site is about</h2><p class="card-sub" style="font-size:1.02rem">' +
      escapeHtml(profile.summary) +
      '</p><div class="tags">' +
      topics +
      "</div></div>" +
      '<h2 class="section-title">At a glance</h2>' +
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-value">' +
      profile.age +
      ' yrs</div><div class="stat-label">Site has been running</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      profile.articles +
      '</div><div class="stat-label">Pages written</div></div>' +
      '<div class="stat"><div class="stat-value">1</div><div class="stat-label">Main thing you sell</div></div>' +
      "</div>" +
      '<h2 class="section-title">Who you are writing for</h2>' +
      '<div class="card"><p class="card-sub">' +
      escapeHtml(profile.audience) +
      ". Keep every new page aimed at them.</p></div>"
    );
  }

  function renderAuthority(data) {
    var circumference = 2 * Math.PI * 62;
    var offset = circumference * (1 - data.score / 100);

    return (
      '<div class="card"><h2>How trusted your site looks</h2>' +
      '<div class="dial-wrap" style="margin-top:16px"><svg viewBox="0 0 148 148" aria-hidden="true">' +
      '<defs><linearGradient id="dialGradient" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="#7c5cff"/>' +
      '</linearGradient></defs><circle class="dial-track" cx="74" cy="74" r="62"/>' +
      '<circle class="dial-ring" cx="74" cy="74" r="62" stroke-dasharray="' +
      circumference.toFixed(1) +
      '" stroke-dashoffset="' +
      circumference.toFixed(1) +
      '" data-dial="' +
      offset.toFixed(1) +
      '"/></svg>' +
      '<div class="dial-center"><div class="dial-score">' +
      data.score +
      '</div><div class="dial-note">' +
      data.label +
      "</div></div></div>" +
      '<p class="card-sub" style="text-align:center;margin-top:14px">A score of 70 or more is a strong, ' +
      "trusted site. You do not need to reach it to grow.</p></div>" +
      '<h2 class="section-title">The numbers behind it</h2>' +
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-value">' +
      data.links +
      '</div><div class="stat-label">Links pointing to you</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      data.referring +
      '</div><div class="stat-label">Sites linking here</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      data.score +
      '</div><div class="stat-label">Trust score</div></div>' +
      "</div>" +
      '<h2 class="section-title">Three things to do this month</h2>' +
      '<ul class="checklist">' +
      data.notes
        .map(function (note) {
          return '<li><span class="tick">&#10003;</span><span>' + escapeHtml(note) + "</span></li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function dayTagHtml(tag) {
    if (tag === "signoff") {
      return '<span class="tag tag-warn">Needs you</span>';
    }
    if (tag === "checkpoint") {
      return '<span class="tag">Checkpoint</span>';
    }
    if (tag === "light") {
      return '<span class="tag">Light day</span>';
    }
    return "";
  }

  function renderPlan(profile, plan) {
    var stats = [
      { value: String(plan.days), label: "Days, one thing at a time" },
      { value: String(plan.publish), label: "Days you publish" },
      { value: String(plan.signoff), label: "Days that need you" },
      { value: String(plan.checkpoint), label: "Checkpoints" }
    ];

    var statHtml = stats
      .map(function (stat) {
        return (
          '<div class="stat"><div class="stat-value">' +
          escapeHtml(stat.value) +
          '</div><div class="stat-label">' +
          escapeHtml(stat.label) +
          "</div></div>"
        );
      })
      .join("");

    var weeks = plan.weeks
      .map(function (week) {
        var rows = week.days
          .map(function (day) {
            var steps = day.steps
              .map(function (step) {
                return "<li>" + escapeHtml(step) + "</li>";
              })
              .join("");
            return (
              '<details class="day"><summary><span class="day-num">Day ' +
              day.number +
              '</span><span class="day-title">' +
              escapeHtml(day.title) +
              "</span>" +
              dayTagHtml(day.tag) +
              '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></summary>' +
              '<div class="day-body"><ol>' +
              steps +
              "</ol></div></details>"
            );
          })
          .join("");

        var range =
          "Days " + week.days[0].number + "\u2013" + week.days[week.days.length - 1].number;

        return (
          '<h2 class="section-title">' +
          escapeHtml(week.title) +
          " &middot; " +
          range +
          '</h2><div class="days">' +
          rows +
          "</div>"
        );
      })
      .join("");

    return (
      '<div class="stat-row">' +
      statHtml +
      "</div>" +
      "<p class=\"note\">Click any day to see exactly what to do. Days marked " +
      "<em>Needs you</em> are the ones only you can approve.</p>" +
      weeks +
      '<p class="note">Built for ' +
      escapeHtml(profile.display) +
      ". The plan stays the same shape for every site, so you always know what comes next.</p>"
    );
  }

  function renderSummary(profile, data) {
    var rows = [
      { label: "Trust score", value: data.authority.score + " / 100" },
      { label: "Pages written", value: String(profile.articles) },
      { label: "Platforms you appear on", value: data.rankings.presence + " / 9" },
      { label: "Pieces to publish", value: String(data.calendar.length) },
      { label: "Competitors ahead of you", value: String(data.competitors.rows.length) },
      { label: "Days that need you", value: String(data.plan.signoff) }
    ];

    var recap = rows
      .map(function (row) {
        return (
          '<div class="stat"><div class="stat-value" style="font-size:1.35rem">' +
          escapeHtml(row.value) +
          '</div><div class="stat-label">' +
          escapeHtml(row.label) +
          "</div></div>"
        );
      })
      .join("");

    return (
      '<div class="card"><h2>Your plan for ' +
      escapeHtml(profile.display) +
      '</h2><p class="card-sub" style="font-size:1.02rem">Here is everything we ' +
      "found, in the order we would tackle it.</p></div>" +
      '<h2 class="section-title">Where you stand</h2>' +
      '<div class="recap">' +
      recap +
      "</div>" +
      '<h2 class="section-title">Start here</h2>' +
      '<ul class="checklist">' +
      [
        "Write the piece for \u201c" + data.keywords[0].term + "\u201d \u2014 most searches, no ranking yet",
        "Fix the platform you are weakest on: " + data.channels.weakest.name.toLowerCase(),
        "Answer every new review within 24 hours. It moves Google, and Google feeds Copilot"
      ]
        .map(function (item) {
          return '<li><span class="tick">&#10003;</span><span>' + escapeHtml(item) + "</span></li>";
        })
        .join("") +
      "</ul>" +
      '<p class="note">This report used sample data to show how the tool works. ' +
      'Connect a real data source to see your own numbers.</p>'
    );
  }

  function buildAll(domain) {
    var profile = buildProfile(domain);
    var keywords = buildKeywords(profile);
    var competitors = buildCompetitors(domain);
    var plan = buildPlan(profile, keywords);
    var rankings = buildRankings(profile, keywords, competitors);
    var channels = buildChannels(profile, rankings);
    rankings.presence = channels.present;
    return {
      profile: profile,
      competitors: competitors,
      keywords: keywords,
      authority: buildAuthority(profile),
      plan: plan,
      calendar: buildCalendar(plan),
      rankings: rankings,
      channels: channels
    };
  }

  function renderResults(pageId, domain) {
    var data = buildAll(domain);
    if (pageId === "competitors") {
      return renderCompetitors(data.competitors);
    }
    if (pageId === "keywords") {
      return renderKeywords(data.keywords);
    }
    if (pageId === "profile") {
      return renderProfile(data.profile);
    }
    if (pageId === "rankings") {
      return renderRankings(data.profile, data.rankings);
    }
    if (pageId === "channels") {
      return renderChannels(data.channels);
    }
    if (pageId === "authority") {
      return renderAuthority(data.authority);
    }
    if (pageId === "content") {
      return renderCalendar(data.profile, data.calendar);
    }
    if (pageId === "social") {
      return renderPlan(data.profile, data.plan);
    }
    if (pageId === "summary") {
      return renderSummary(data.profile, data);
    }
    return "";
  }

  function animateBars(root) {
    var fills = root.querySelectorAll(".bar-fill");
    window.requestAnimationFrame(function () {
      for (var i = 0; i < fills.length; i++) {
        fills[i].style.width = fills[i].getAttribute("data-width") + "%";
      }
    });
  }

  function animateDial(root) {
    var ring = root.querySelector("[data-dial]");
    if (!ring) {
      return;
    }
    window.requestAnimationFrame(function () {
      ring.setAttribute("stroke-dashoffset", ring.getAttribute("data-dial"));
    });
  }

  function showLoading(host) {
    host.innerHTML =
      '<div class="loading"><span class="spinner"></span><span>Looking at ' +
      escapeHtml(host.getAttribute("data-loading-text") || "your site") +
      "…</span></div>";
  }

  function showEmpty(host) {
    host.innerHTML =
      '<div class="empty"><strong>No site picked yet</strong>Type your website above ' +
      "and we will fill this page in.</div>";
  }

  function paint(host, domain) {
    var pageId = currentPageId();
    if (pageId === "start") {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    showLoading(host);
    window.setTimeout(function () {
      host.innerHTML = '<div class="fade-in">' + renderResults(pageId, domain) + "</div>";
      host.querySelectorAll("[data-mention-domain]").forEach(function (el) {
        el.textContent = displayDomain(domain);
      });
      animateBars(host);
      animateDial(host);
    }, 620);
  }

  function setChip(domain) {
    var chips = document.querySelectorAll("[data-domain-chip]");
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      if (domain) {
        chip.hidden = false;
        chip.querySelector("[data-chip-text]").textContent = displayDomain(domain);
        chip.setAttribute("href", "index.html");
        chip.setAttribute("title", "Change website");
      } else {
        chip.hidden = true;
      }
    }
  }

  function initTheme() {
    var stored = read(THEME_KEY);
    var prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);

    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        var next =
          document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        write(THEME_KEY, next);
      });
    }
  }

  function initNav() {
    var index = pageIndex();
    var page = PAGES[index];
    var prev = index > 0 ? PAGES[index - 1] : null;
    var next = index < PAGES.length - 1 ? PAGES[index + 1] : null;

    var bar = document.querySelector("[data-progress]");
    if (bar) {
      bar.style.width = (((index + 1) / PAGES.length) * 100).toFixed(1) + "%";
    }

    var label = document.querySelector("[data-step-label]");
    if (label) {
      label.textContent = "Step " + (index + 1) + " of " + PAGES.length;
    }

    var nav = document.querySelector("[data-step-nav]");
    if (!nav) {
      return;
    }

    var html = "";
    if (prev) {
      html += '<a class="btn btn-ghost" href="' + prev.file + '">&larr; Back</a>';
    } else {
      html += '<a class="btn btn-ghost" href="' + page.file + '">&larr; Back</a>';
    }

    html += '<div class="dots">';
    for (var i = 0; i < PAGES.length; i++) {
      var cls = i === index ? "dot is-current" : i < index ? "dot is-done" : "dot";
      html +=
        '<a class="' +
        cls +
        '" href="' +
        PAGES[i].file +
        '" title="' +
        PAGES[i].label +
        '"><span class="dot-label">' +
        PAGES[i].label +
        "</span></a>";
    }
    html += "</div>";

    if (next) {
      html +=
        '<a class="btn btn-primary" href="' + next.file + '">Next: ' + next.label + " &rarr;</a>";
    } else {
      html += '<button class="btn btn-primary" type="button" data-restart>Start again</button>';
    }

    nav.innerHTML = html;

    var restart = nav.querySelector("[data-restart]");
    if (restart) {
      restart.addEventListener("click", function () {
        clear(DOMAIN_KEY);
        window.location.href = "index.html";
      });
    }
  }

  function initForm() {
    var form = document.querySelector("[data-domain-form]");
    var results = document.querySelector("[data-results]");
    if (!form) {
      return;
    }

    var input = form.querySelector("input");
    var hint = form.querySelector("[data-domain-hint]");
    var stored = normalizeDomain(read(DOMAIN_KEY));
    if (stored) {
      input.value = stored;
      setChip(stored);
      if (results) {
        paint(results, stored);
      }
    } else {
      setChip("");
      if (results) {
        results.hidden = false;
        showEmpty(results);
      }
      window.setTimeout(function () {
        input.focus();
      }, 120);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = normalizeDomain(input.value);
      var valid = isValidDomain(value);

      input.classList.toggle("is-invalid", !valid);
      hint.classList.toggle("is-error", !valid);

      if (!valid) {
        hint.textContent = stored
          ? "That does not look right — try something like yourcompany.com"
          : "Type just your website name, like yourcompany.com";
        input.focus();
        return;
      }

      hint.textContent = "Saved. You can change it any time.";
      write(DOMAIN_KEY, value);
      setChip(value);

      var index = pageIndex();
      if (index === 0) {
        window.location.href = PAGES[1].file;
        return;
      }
      if (results) {
        paint(results, value);
      }
    });

    input.addEventListener("input", function () {
      input.classList.remove("is-invalid");
      hint.classList.remove("is-error");
      if (input.value.trim() === "") {
        hint.textContent = "Type just the name — we will fill in the rest.";
      }
    });
  }

  initTheme();
  initNav();
  initForm();
})();

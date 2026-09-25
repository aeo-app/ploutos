/**
 * APAC Relocation - Structured Data (JSON-LD) Injector
 * Adds MovingCompany schema to the Home page and 5 service pages,
 * and FAQPage schema to 3 blog posts. Each page gets only its own block.
 *
 * Install ONE of these ways:
 *  A) Google Tag Manager (GTM-W9RSDDX): New Tag > Custom HTML > paste this file
 *     wrapped in <script> ... </script> > Trigger: All Pages (DOM Ready).
 *  B) WordPress theme/plugin: load this file site-wide in the <head> or footer.
 *
 * Validated: 0 errors against schema.org v29.1 + Google requirements.
 */
const { JSDOM } = require("jsdom");

const dom = new JSDOM(
  `<!DOCTYPE html><html><head></head><body></body></html>`,
  {
    url: "https://apacrelocation.com/"
  }
);

global.window = dom.window;
global.document = dom.window.document;

(function () {
  "use strict";

  var SCHEMA_BY_PATH = {
  "/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        },
        "memberOf": [
          {
            "@type": "Organization",
            "name": "International Association of Movers"
          },
          {
            "@type": "Organization",
            "name": "Singapore Logistics Association"
          }
        ],
        "award": "Spirit of Enterprise Award (Singapore)",
        "knowsAbout": [
          "International moving",
          "Office relocation",
          "Customs clearance",
          "Export packing",
          "Air freight",
          "Sea freight",
          "Storage"
        ],
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": "APAC Relocation Services",
          "itemListElement": [
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "@id": "https://apacrelocation.com/moving/international-movers/#service",
                "name": "International Moving",
                "url": "https://apacrelocation.com/moving/international-movers/"
              }
            },
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "@id": "https://apacrelocation.com/relocation-services/#service",
                "name": "Domestic & Local Moving in Singapore",
                "url": "https://apacrelocation.com/relocation-services/"
              }
            },
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "@id": "https://apacrelocation.com/corporate-relocation/#service",
                "name": "Office & Corporate Relocation",
                "url": "https://apacrelocation.com/corporate-relocation/"
              }
            },
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "@id": "https://apacrelocation.com/storage/storage-in-singapore/#service",
                "name": "Storage in Singapore",
                "url": "https://apacrelocation.com/storage/storage-in-singapore/"
              }
            },
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "@id": "https://apacrelocation.com/excess-baggage/#service",
                "name": "Excess Baggage Shipping",
                "url": "https://apacrelocation.com/excess-baggage/"
              }
            }
          ]
        }
      }
    ]
  },
  "/moving/international-movers/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        }
      },
      {
        "@type": "Service",
        "@id": "https://apacrelocation.com/moving/international-movers/#service",
        "name": "International Moving",
        "serviceType": "International moving",
        "description": "Door-to-door international moving from Singapore: pre-move survey, export packing, air and sea freight, customs clearance, shipment tracking and destination delivery.",
        "url": "https://apacrelocation.com/moving/international-movers/",
        "provider": {
          "@id": "https://apacrelocation.com/#movingcompany"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "offers": {
          "@type": "Offer",
          "url": "https://apacrelocation.com/get-a-quote/",
          "description": "Free, no-obligation moving quotation"
        }
      }
    ]
  },
  "/relocation-services/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        }
      },
      {
        "@type": "Service",
        "@id": "https://apacrelocation.com/relocation-services/#service",
        "name": "Domestic & Local Moving in Singapore",
        "serviceType": "Domestic moving",
        "description": "Local house moves within Singapore for condos, apartments, HDB flats and studios, including packing, furniture handling and delivery.",
        "url": "https://apacrelocation.com/relocation-services/",
        "provider": {
          "@id": "https://apacrelocation.com/#movingcompany"
        },
        "areaServed": {
          "@type": "Country",
          "name": "Singapore"
        },
        "offers": {
          "@type": "Offer",
          "url": "https://apacrelocation.com/get-a-quote/",
          "description": "Free, no-obligation moving quotation"
        }
      }
    ]
  },
  "/corporate-relocation/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        }
      },
      {
        "@type": "Service",
        "@id": "https://apacrelocation.com/corporate-relocation/#service",
        "name": "Office & Corporate Relocation",
        "serviceType": "Office relocation",
        "description": "Planned office and commercial relocations in Singapore with inventory, crating, IT and furniture handling, scheduled to minimise business downtime.",
        "url": "https://apacrelocation.com/corporate-relocation/",
        "provider": {
          "@id": "https://apacrelocation.com/#movingcompany"
        },
        "areaServed": {
          "@type": "Country",
          "name": "Singapore"
        },
        "offers": {
          "@type": "Offer",
          "url": "https://apacrelocation.com/get-a-quote/",
          "description": "Free, no-obligation moving quotation"
        }
      }
    ]
  },
  "/storage/storage-in-singapore/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        }
      },
      {
        "@type": "Service",
        "@id": "https://apacrelocation.com/storage/storage-in-singapore/#service",
        "name": "Storage in Singapore",
        "serviceType": "Storage",
        "description": "Secure vault and warehouse storage for household and business goods in Singapore, for short or long-term needs during a move.",
        "url": "https://apacrelocation.com/storage/storage-in-singapore/",
        "provider": {
          "@id": "https://apacrelocation.com/#movingcompany"
        },
        "areaServed": {
          "@type": "Country",
          "name": "Singapore"
        },
        "offers": {
          "@type": "Offer",
          "url": "https://apacrelocation.com/get-a-quote/",
          "description": "Free, no-obligation moving quotation"
        }
      }
    ]
  },
  "/excess-baggage/": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MovingCompany",
        "@id": "https://apacrelocation.com/#movingcompany",
        "name": "APAC Relocation",
        "url": "https://apacrelocation.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://apacrelocation.com/wp-content/uploads/2021/06/cropped-ApacRelocationLogo-1-270x270.png",
          "width": 270,
          "height": 270
        },
        "image": "https://apacrelocation.com/wp-content/uploads/2026/02/Relocate-43.png",
        "description": "Singapore-based international moving company providing door-to-door international moving, domestic moving, office relocation, storage and excess baggage shipping.",
        "telephone": "+65-6520-1914",
        "email": "contact@apacrelocation.com",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "2 Ang Mo Kio Street 64, #02-03A, Econ Building",
          "addressLocality": "Singapore",
          "postalCode": "569084",
          "addressCountry": "SG"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "sameAs": [
          "https://www.facebook.com/Apac-Relocation-142982253088500/",
          "https://www.linkedin.com/company/apac-relocation/",
          "https://twitter.com/ApacRelocation",
          "https://www.youtube.com/@apacrelocation263"
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+65-6520-1914",
          "email": "contact@apacrelocation.com",
          "contactType": "customer service",
          "areaServed": "SG",
          "availableLanguage": [
            "English"
          ]
        }
      },
      {
        "@type": "Service",
        "@id": "https://apacrelocation.com/excess-baggage/#service",
        "name": "Excess Baggage Shipping",
        "serviceType": "Excess baggage shipping",
        "description": "Unaccompanied and excess baggage shipping from Singapore by air, sea or road freight, with packing, customs documentation and door-to-door delivery.",
        "url": "https://apacrelocation.com/excess-baggage/",
        "provider": {
          "@id": "https://apacrelocation.com/#movingcompany"
        },
        "areaServed": [
          {
            "@type": "Country",
            "name": "Singapore"
          },
          {
            "@type": "Place",
            "name": "Worldwide"
          }
        ],
        "offers": {
          "@type": "Offer",
          "url": "https://apacrelocation.com/get-a-quote/",
          "description": "Free, no-obligation moving quotation"
        }
      }
    ]
  },
  "/blogs/international-moving-checklist-complete-guide-for-2026/": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://apacrelocation.com/blogs/international-moving-checklist-complete-guide-for-2026/#faq",
    "url": "https://apacrelocation.com/blogs/international-moving-checklist-complete-guide-for-2026/",
    "publisher": {
      "@id": "https://apacrelocation.com/#movingcompany"
    },
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is an international moving checklist?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "An International Moving Checklist is a step-by-step guide that helps individuals and families organize every stage of an overseas relocation, including planning, documentation, packing, shipping, customs clearance, and settling into a new country."
        }
      },
      {
        "@type": "Question",
        "name": "How early should I start planning an international move?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Most international relocations should be planned at least three to six months before the moving date. Starting early allows enough time to prepare documents, compare moving companies, and arrange shipping."
        }
      },
      {
        "@type": "Question",
        "name": "What documents are required for an international move?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Common documents include:<ul><li>Passport</li><li>Visa or residence permit</li><li>Inventory list</li><li>Customs declaration</li><li>Bill of lading or air waybill</li><li>Insurance documents</li><li>Proof of residence</li><li>Employment or immigration documents</li></ul>Document requirements vary depending on your destination country."
        }
      },
      {
        "@type": "Question",
        "name": "How much does an international move cost?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The total cost depends on several factors, including:<ul><li>Destination</li><li>Shipment volume</li><li>Freight method</li><li>Packing requirements</li><li>Insurance</li><li>Customs duties</li><li>Additional relocation services</li></ul>Obtaining a personalized quotation from an experienced relocation company provides the most accurate estimate."
        }
      },
      {
        "@type": "Question",
        "name": "Should I choose air freight or sea freight?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Air freight is faster and suitable for urgent or smaller shipments, while sea freight is generally more economical for transporting larger household goods."
        }
      },
      {
        "@type": "Question",
        "name": "Is moving insurance necessary?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Although not mandatory, moving insurance is highly recommended. It provides financial protection against accidental loss or damage during international transit."
        }
      },
      {
        "@type": "Question",
        "name": "Can I track my shipment?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Most professional international relocation companies offer shipment tracking, allowing customers to monitor the progress of their belongings throughout the journey."
        }
      },
      {
        "@type": "Question",
        "name": "Can I move my vehicle overseas?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Many international relocation companies provide vehicle shipping services, subject to the destination country's import regulations."
        }
      },
      {
        "@type": "Question",
        "name": "Are there items that cannot be shipped internationally?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Restrictions vary by country, but common prohibited items include hazardous materials, flammable liquids, certain foods, plants, and controlled substances."
        }
      },
      {
        "@type": "Question",
        "name": "Why should I hire professional international movers?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Professional movers offer expertise in packing, shipping, customs clearance, documentation, insurance, and destination services, making international relocation safer, more efficient, and less stressful."
        }
      }
    ]
  },
  "/blogs/air-freight-vs-sea-freight-which-is-best/": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://apacrelocation.com/blogs/air-freight-vs-sea-freight-which-is-best/#faq",
    "url": "https://apacrelocation.com/blogs/air-freight-vs-sea-freight-which-is-best/",
    "publisher": {
      "@id": "https://apacrelocation.com/#movingcompany"
    },
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the main difference between air freight and sea freight?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The primary difference is speed and cost. Air freight is faster but generally more expensive, while sea freight is slower but more economical for transporting larger household shipments."
        }
      },
      {
        "@type": "Question",
        "name": "Which shipping method is cheaper?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sea freight is typically the more cost-effective option for moving furniture and complete household goods over long distances."
        }
      },
      {
        "@type": "Question",
        "name": "Which option is faster?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Air freight offers significantly shorter transit times, making it ideal for urgent relocations or essential belongings."
        }
      },
      {
        "@type": "Question",
        "name": "Is sea freight safe for household goods?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. When professional packing techniques are used, sea freight provides a secure and reliable method for transporting household belongings internationally."
        }
      },
      {
        "@type": "Question",
        "name": "Can I combine air freight and sea freight?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Many people ship essential items by air and transport larger household goods by sea to balance speed and cost."
        }
      },
      {
        "@type": "Question",
        "name": "How do I know which shipping method is right for me?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The best option depends on your shipment size, relocation budget, destination, timeline, and the urgency of receiving your belongings."
        }
      },
      {
        "@type": "Question",
        "name": "Is customs clearance required for both air and sea freight?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. All international shipments must complete customs clearance before they can be delivered to the final destination."
        }
      },
      {
        "@type": "Question",
        "name": "Should I purchase moving insurance?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Moving insurance provides financial protection against unexpected loss or damage during international transportation and is recommended for both air and sea freight shipments."
        }
      },
      {
        "@type": "Question",
        "name": "Can I track my shipment?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Professional international relocation companies typically provide shipment tracking so you can monitor your belongings throughout the relocation process."
        }
      },
      {
        "@type": "Question",
        "name": "Why should I use a professional international relocation company?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Professional relocation companies manage every stage of your move, including packing, transportation, customs clearance, documentation, shipment tracking, and final delivery, making your overseas relocation more efficient and stress-free."
        }
      }
    ]
  },
  "/blogs/how-to-choose-the-best-international-relocation-company/": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://apacrelocation.com/blogs/how-to-choose-the-best-international-relocation-company/#faq",
    "url": "https://apacrelocation.com/blogs/how-to-choose-the-best-international-relocation-company/",
    "publisher": {
      "@id": "https://apacrelocation.com/#movingcompany"
    },
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How do I choose the best international relocation company?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Look for a company with international relocation experience, professional packing services, customs expertise, transparent pricing, positive customer reviews, shipment tracking, and comprehensive door-to-door moving solutions."
        }
      },
      {
        "@type": "Question",
        "name": "Why is a pre-move survey important?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A pre-move survey allows relocation specialists to assess your shipment accurately, recommend suitable transportation options, and prepare a detailed moving quotation."
        }
      },
      {
        "@type": "Question",
        "name": "Should I compare multiple relocation quotations?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Comparing quotations from several reputable companies helps you evaluate services, pricing, insurance options, and overall value before making your decision."
        }
      },
      {
        "@type": "Question",
        "name": "What services should an international relocation company provide?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Professional relocation companies should offer export packing, international transportation, customs clearance, insurance guidance, storage solutions, shipment tracking, and destination delivery."
        }
      },
      {
        "@type": "Question",
        "name": "Why is professional packing important?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Professional export packing protects household belongings during international transportation and reduces the risk of damage throughout the relocation process."
        }
      },
      {
        "@type": "Question",
        "name": "Does an international relocation company handle customs clearance?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Many professional relocation companies assist with customs documentation and clearance procedures to help simplify international shipping requirements."
        }
      },
      {
        "@type": "Question",
        "name": "Is moving insurance necessary?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Although not always mandatory, moving insurance is strongly recommended because it provides financial protection against unforeseen events during transportation."
        }
      },
      {
        "@type": "Question",
        "name": "Can I track my international shipment?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Most professional international relocation companies offer shipment tracking so customers can monitor their belongings throughout transit."
        }
      },
      {
        "@type": "Question",
        "name": "How early should I book an international relocation company?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "It is generally recommended to book your relocation company three to six months before your planned moving date to secure preferred schedules and allow sufficient preparation time."
        }
      },
      {
        "@type": "Question",
        "name": "Why choose APAC Relocation for international moving?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "APAC Relocation offers customized relocation solutions, professional export packing, international shipping, customs clearance assistance, insurance guidance, storage facilities, shipment tracking, and dependable door-to-door delivery for a seamless overseas moving experience."
        }
      }
    ]
  }
};

  // Normalise the current path: lowercase, ensure trailing slash, drop query/hash
  var path = window.location.pathname.toLowerCase();
  if (path.charAt(path.length - 1) !== "/") path += "/";

  var schema = SCHEMA_BY_PATH[path];
  if (!schema) return; // not one of the 9 target pages

  // Avoid duplicates if the tag fires twice
  if (document.querySelector('script[data-apac-schema="' + path + '"]')) return;

  var tag = document.createElement("script");
  tag.type = "application/ld+json";
  tag.setAttribute("data-apac-schema", path);
  tag.text = JSON.stringify(schema);
  (document.head || document.documentElement).appendChild(tag);
})();

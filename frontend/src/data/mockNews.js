export const mockArticles = [
  // POLITICS
  {
    id: "art_001",
    headline: "Punjab Government Announces New Education Policy",
    source: "Dawn",
    sourceUrl: "https://dawn.com",
    category: "Politics",
    publishedAt: "2026-05-01T09:30:00Z",
    thumbnail: "https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=600&auto=format&fit=crop",
    biasScore: 32,
    sentiment: "neutral",
    credibilityScore: 8.4,
    summary: "The Punjab government unveiled a comprehensive education policy aimed at reforming the current curriculum and increasing access to digital resources across public schools.",
    content: "The Punjab government unveiled a comprehensive education policy aimed at reforming the current curriculum and increasing access to digital resources across public schools. Chief Minister of Punjab stated that this is a necessary step. The Ministry of Education will oversee the implementation starting next academic year.",
    highlightedWords: [
      { word: "comprehensive", type: "biased", reason: "Slightly subjective adjective" }
    ],
    namedEntities: ["Punjab Government", "Ministry of Education"],
    topicTags: ["Education", "Punjab", "Policy"],
    relatedArticleIds: ["art_002"],
    versionHistory: [
      {
        timestamp: "2026-05-01T08:00:00Z",
        headline: "Punjab Government Plans New Education Policy",
        biasScore: 25,
        sentiment: "neutral"
      },
      {
        timestamp: "2026-05-01T09:30:00Z",
        headline: "Punjab Government Announces New Education Policy",
        biasScore: 32,
        sentiment: "neutral"
      }
    ]
  },
  {
    id: "art_002",
    headline: "Controversial Education Policy Claimed to Fix Schools in Punjab",
    source: "Geo News",
    sourceUrl: "https://geo.tv",
    category: "Politics",
    publishedAt: "2026-05-01T10:15:00Z",
    thumbnail: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",
    biasScore: 68,
    sentiment: "negative",
    credibilityScore: 7.5,
    summary: "A controversial new education policy was announced in Punjab, drawing criticism from opposition leaders who claim it lacks funding.",
    content: "A controversial new education policy was announced in Punjab, drawing criticism from opposition leaders who claim it lacks funding. The Chief Minister touted the policy as a game-changer, but teachers unions are threatening protests.",
    highlightedWords: [
      { word: "Controversial", type: "biased", reason: "Loaded adjective with no citation" },
      { word: "Claimed", type: "biased", reason: "Casts doubt on the assertion" }
    ],
    namedEntities: ["Punjab"],
    topicTags: ["Education", "Punjab", "Protests"],
    relatedArticleIds: ["art_001"],
    versionHistory: [
      {
        timestamp: "2026-05-01T09:45:00Z",
        headline: "New Education Policy Announced in Punjab",
        biasScore: 40,
        sentiment: "neutral"
      },
      {
        timestamp: "2026-05-01T10:15:00Z",
        headline: "Controversial Education Policy Claimed to Fix Schools in Punjab",
        biasScore: 68,
        sentiment: "negative"
      }
    ]
  },
  {
    id: "art_003",
    headline: "Punjab Education Reform: A Step towards a Better Future",
    source: "ARY News",
    sourceUrl: "https://arynews.tv",
    category: "Politics",
    publishedAt: "2026-05-01T11:00:00Z",
    thumbnail: "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?q=80&w=600&auto=format&fit=crop",
    biasScore: 45,
    sentiment: "positive",
    credibilityScore: 8.0,
    summary: "ARY News presents the Punjab education policy as a long-term reform that will modernize learning and create new opportunities for students.",
    content: "ARY News presents the Punjab education policy as a long-term reform that will modernize learning and create new opportunities for students. Officials say the policy is designed to improve both infrastructure and curriculum with future-focused goals.",
    highlightedWords: [
      { word: "modernize", type: "positive", reason: "Optimistic framing" },
      { word: "opportunities", type: "positive", reason: "Benefit-focused language" }
    ],
    namedEntities: ["Punjab Government", "ARY News"],
    topicTags: ["Education", "Punjab", "Policy"],
    relatedArticleIds: []
  },

  // TECHNOLOGY
  {
    id: "art_004",
    headline: "Tech Giants Announce Joint AI Safety Initiative",
    source: "BBC",
    sourceUrl: "https://bbc.com",
    category: "Technology",
    publishedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=600&auto=format&fit=crop",
    biasScore: 15,
    sentiment: "positive",
    credibilityScore: 9.1,
    summary: "Major technology companies have formed a consortium to establish safety guidelines for advanced artificial intelligence development.",
    content: "Major technology companies including Google, Microsoft, and OpenAI have formed a consortium to establish safety guidelines for advanced artificial intelligence development. The initiative aims to prevent potential misuse of generative AI models while fostering innovation.",
    highlightedWords: [],
    namedEntities: ["Google", "Microsoft", "OpenAI"],
    topicTags: ["AI", "Technology", "Safety", "AI Regulation"],
    relatedArticleIds: []
  },
  {
    id: "art_005",
    headline: "New Quantum Chip Breakthrough Could Revolutionize Computing",
    source: "Dawn",
    sourceUrl: "https://dawn.com",
    category: "Technology",
    publishedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop",
    biasScore: 10,
    sentiment: "positive",
    credibilityScore: 8.8,
    summary: "Researchers have successfully stabilized a new type of quantum bit, paving the way for commercially viable quantum computers within the decade.",
    content: "Researchers at leading universities have successfully stabilized a new type of quantum bit (qubit) at room temperature. This breakthrough could dramatically accelerate the development of commercially viable quantum computers.",
    highlightedWords: [],
    namedEntities: [],
    topicTags: ["Quantum Computing", "Research"],
    relatedArticleIds: []
  },
  {
    id: "art_006",
    headline: "Social Media Platform Faces Backlash Over Privacy Policy",
    source: "Express",
    sourceUrl: "https://tribune.com.pk",
    category: "Technology",
    publishedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=600&auto=format&fit=crop",
    biasScore: 55,
    sentiment: "negative",
    credibilityScore: 7.9,
    summary: "Users are threatening to boycott a popular social media platform after unannounced changes to its data sharing policies.",
    content: "A massive user boycott is brewing against a major social media platform following covert updates to its privacy policy. The changes reportedly allow the company to sell user data to third-party advertisers without explicit consent.",
    highlightedWords: [
      { word: "massive", type: "manipulative", reason: "Exaggeration" },
      { word: "covert", type: "biased", reason: "Implies malicious intent" }
    ],
    namedEntities: [],
    topicTags: ["Social Media", "Privacy"],
    relatedArticleIds: []
  },

  // HEALTH
  {
    id: "art_007",
    headline: "National Health Crisis: Hospitals Overwhelmed by Dengue Outbreak",
    source: "ARY News",
    sourceUrl: "https://arynews.tv",
    category: "Health",
    publishedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?q=80&w=600&auto=format&fit=crop",
    biasScore: 82,
    sentiment: "negative",
    credibilityScore: 6.8,
    summary: "Hospitals across major cities are collapsing under the weight of a severe dengue outbreak, with the government failing to provide adequate response.",
    content: "Hospitals across major cities are collapsing under the weight of a severe dengue outbreak, with the incompetent government utterly failing to provide an adequate response. Patients are dying in the hallways as medicine stocks run completely dry.",
    highlightedWords: [
      { word: "collapsing", type: "manipulative", reason: "Alarmist language" },
      { word: "incompetent", type: "biased", reason: "Subjective insult" }
    ],
    namedEntities: [],
    topicTags: ["Health", "Dengue", "Crisis"],
    relatedArticleIds: []
  },
  {
    id: "art_008",
    headline: "Ministry of Health Reports Decline in Polio Cases",
    source: "Geo News",
    sourceUrl: "https://geo.tv",
    category: "Health",
    publishedAt: new Date(Date.now() - 3600000 * 60).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=600&auto=format&fit=crop",
    biasScore: 25,
    sentiment: "positive",
    credibilityScore: 8.5,
    summary: "The latest health report indicates a significant drop in nationwide polio cases following an intensive vaccination drive.",
    content: "The Ministry of Health announced a 40% reduction in new polio cases this year. Officials attribute this success to the recent nationwide door-to-door vaccination campaign and increased public awareness.",
    highlightedWords: [],
    namedEntities: ["Ministry of Health"],
    topicTags: ["Polio", "Vaccination"],
    relatedArticleIds: []
  },

  // BUSINESS
  {
    id: "art_009",
    headline: "Stock Market Reaches Record High Amid Tech Rally",
    source: "Express",
    sourceUrl: "https://tribune.com.pk",
    category: "Business",
    publishedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=600&auto=format&fit=crop",
    biasScore: 20,
    sentiment: "positive",
    credibilityScore: 8.9,
    summary: "The national stock exchange closed at an unprecedented high today, driven largely by massive gains in the technology sector.",
    content: "The national stock exchange closed at an unprecedented high today, driven largely by massive gains in the technology sector. Investors remain optimistic about future earnings reports.",
    highlightedWords: [],
    namedEntities: ["Stock Exchange"],
    topicTags: ["Business", "Stocks"],
    relatedArticleIds: []
  },
  {
    id: "art_010",
    headline: "Local Startups Secure $50M in Series A Funding",
    source: "Dawn",
    sourceUrl: "https://dawn.com",
    category: "Business",
    publishedAt: new Date(Date.now() - 3600000 * 84).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1556761175-5973dc0f32d7?q=80&w=600&auto=format&fit=crop",
    biasScore: 15,
    sentiment: "positive",
    credibilityScore: 8.7,
    summary: "Three local fintech startups have collectively raised $50 million from international venture capitalists to expand their operations.",
    content: "In a major boost to the local tech ecosystem, three prominent fintech startups have successfully closed their Series A funding rounds, raising a combined total of $50 million. The funds will be used for regional expansion and product development.",
    highlightedWords: [],
    namedEntities: [],
    topicTags: ["Startups", "Venture Capital"],
    relatedArticleIds: []
  },

  // WORLD
  {
    id: "art_011",
    headline: "Global Climate Summit Ends in Deadlock",
    source: "BBC",
    sourceUrl: "https://bbc.com",
    category: "World",
    publishedAt: new Date(Date.now() - 3600000 * 96).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop",
    biasScore: 40,
    sentiment: "negative",
    credibilityScore: 9.2,
    summary: "World leaders failed to reach a consensus on carbon emission targets at the latest climate summit.",
    content: "World leaders failed to reach a consensus on carbon emission targets at the latest climate summit, leaving environmental activists deeply frustrated with the lack of progress.",
    highlightedWords: [],
    namedEntities: ["Global Climate Summit"],
    topicTags: ["Climate Change", "Environment", "World"],
    relatedArticleIds: []
  },
  {
    id: "art_012",
    headline: "Tensions Rise in the Middle East After Border Skirmish",
    source: "ARY News",
    sourceUrl: "https://arynews.tv",
    category: "World",
    publishedAt: new Date(Date.now() - 3600000 * 108).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1534293230397-c06bfff995eb?q=80&w=600&auto=format&fit=crop",
    biasScore: 65,
    sentiment: "negative",
    credibilityScore: 7.2,
    summary: "A minor border skirmish has escalated tensions between neighboring nations in the Middle East, drawing international concern.",
    content: "Fears of a wider conflict are growing rapidly following a violent and unprovoked border skirmish in the Middle East. International observers are warning that the fragile peace in the region is on the brink of total collapse.",
    highlightedWords: [
      { word: "violent and unprovoked", type: "biased", reason: "Assumes blame without full context" },
      { word: "total collapse", type: "manipulative", reason: "Alarmist forecasting" }
    ],
    namedEntities: ["Middle East"],
    topicTags: ["Middle East", "Conflict"],
    relatedArticleIds: []
  },

  // ECONOMY
  {
    id: "art_013",
    headline: "Inflation Hits Double Digits, Putting Pressure on Middle Class",
    source: "Geo News",
    sourceUrl: "https://geo.tv",
    category: "Economy",
    publishedAt: new Date(Date.now() - 3600000 * 120).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=600&auto=format&fit=crop",
    biasScore: 60,
    sentiment: "negative",
    credibilityScore: 7.8,
    summary: "Recent economic data shows inflation surging past 10%, crippling the purchasing power of everyday citizens.",
    content: "Recent economic data shows inflation surging past 10%, crippling the purchasing power of everyday citizens. The government seems paralyzed on how to handle the crisis.",
    highlightedWords: [
      { word: "crippling", type: "manipulative", reason: "Highly emotional language" },
      { word: "paralyzed", type: "biased", reason: "Subjective criticism" }
    ],
    namedEntities: [],
    topicTags: ["Inflation", "Economy"],
    relatedArticleIds: []
  },
  {
    id: "art_014",
    headline: "Central Bank Announces Surprise Interest Rate Cut",
    source: "Dawn",
    sourceUrl: "https://dawn.com",
    category: "Economy",
    publishedAt: new Date(Date.now() - 3600000 * 132).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?q=80&w=600&auto=format&fit=crop",
    biasScore: 25,
    sentiment: "positive",
    credibilityScore: 8.6,
    summary: "In an unexpected move, the Central Bank lowered benchmark interest rates by 50 basis points to stimulate economic growth.",
    content: "The Central Bank surprised markets today by announcing a 50 basis point reduction in the key interest rate. Analysts believe this aggressive move is aimed at spurring lending and boosting industrial output ahead of the fiscal year end.",
    highlightedWords: [
      { word: "aggressive", type: "biased", reason: "Subjective characterization of standard monetary policy" }
    ],
    namedEntities: ["Central Bank"],
    topicTags: ["Economy", "Interest Rates"],
    relatedArticleIds: []
  }
];

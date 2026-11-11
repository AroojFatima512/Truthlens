export const mockSources = [
  {
    id: "src_01",
    name: "Dawn",
    url: "https://dawn.com",
    category: "General News",
    status: "Active",
    credibilityScore: 8.5,
    lastCrawled: new Date().toISOString(),
    articlesCount: 12450
  },
  {
    id: "src_02",
    name: "Geo News",
    url: "https://geo.tv",
    category: "General News",
    status: "Active",
    credibilityScore: 7.2,
    lastCrawled: new Date(Date.now() - 3600000).toISOString(),
    articlesCount: 15200
  },
  {
    id: "src_03",
    name: "ARY News",
    url: "https://arynews.tv",
    category: "General News",
    status: "Active",
    credibilityScore: 6.8,
    lastCrawled: new Date(Date.now() - 7200000).toISOString(),
    articlesCount: 18300
  },
  {
    id: "src_04",
    name: "BBC",
    url: "https://bbc.com",
    category: "International",
    status: "Active",
    credibilityScore: 9.2,
    lastCrawled: new Date().toISOString(),
    articlesCount: 45000
  }
];

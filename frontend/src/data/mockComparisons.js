export const mockComparisons = [
  {
    id: "cmp_001",
    topic: "Punjab Education Policy",
    articleA: "art_001",
    articleB: "art_002",
    semanticSimilarity: 0.71,
    biasDifference: 36,
    sentimentShift: "Dawn: Neutral → Geo: Negative",
    keyDifferences: [
      { type: "omission", source: "Geo News", detail: "Omits digital resources allocation details" },
      { type: "framing", source: "Geo News", detail: "Uses 'controversial' and 'claimed' instead of 'announced'" },
      { type: "addition", source: "Geo News", detail: "Adds unverified quotes about opposition criticism" }
    ],
    diffTextA: [
      { text: "The Punjab government unveiled a comprehensive education policy aimed at reforming the current curriculum and increasing access to digital resources across public schools.", type: "paraphrased" },
      { text: " Chief Minister of Punjab stated that this is a necessary step.", type: "unique" },
      { text: " The Ministry of Education will oversee the implementation starting next academic year.", type: "shared" }
    ],
    diffTextB: [
      { text: "A controversial new education policy was announced in Punjab, drawing criticism from opposition leaders who claim it lacks funding.", type: "paraphrased" },
      { text: " The Chief Minister touted the policy as a game-changer, but teachers unions are threatening protests.", type: "unique" },
      { text: " It remains to be seen if the Ministry of Education can deliver on these lofty promises.", type: "shared" }
    ]
  }
];

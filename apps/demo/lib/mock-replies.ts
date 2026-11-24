const replies = {
  "en-IN": {
    help: "Try asking how many questions are in Physics or say take me to pricing.",
    openQuestion: "Open a question first, then say bookmark this question.",
    opening: (title: string) => `Opening ${title}.`,
    count: (n: number, subject?: string) =>
      subject ? `There are ${n} questions in ${subject}.` : `There are ${n} questions.`,
    topics: (names: string) => `Topics: ${names}.`,
    bookmarked: (id: number) => `Bookmarked question ${id}.`,
    bookmarks: (ids: string) => `Your bookmarks: ${ids}.`,
    emptyBookmarks: "You have no bookmarks yet.",
    signIn: "Sign in to see your bookmarks.",
    noResults: "I could not find a matching topic or question.",
    declined: "The bookmark was not saved.",
    failure: (message: string) => `Sorry, that did not work: ${message}`,
    unknown: "No usable result.",
    titles: {
      Home: "Home",
      Subjects: "Subjects",
      Subject: "Subject",
      Practice: "Practice",
      Question: "Question",
      Pricing: "Pricing",
      About: "About",
      "Sign in": "Sign in",
    },
  },
  "te-IN": {
    help: "భౌతిక శాస్త్రంలో ఎన్ని ప్రశ్నలు ఉన్నాయి అని అడగండి లేదా ధరలు చూపించు అని చెప్పండి.",
    openQuestion: "ముందు ఒక ప్రశ్నను తెరిచి, ఈ ప్రశ్నను బుక్‌మార్క్ చేయి అని చెప్పండి.",
    opening: (title: string) => `${title} తెరుస్తున్నాను.`,
    count: (n: number, subject?: string) =>
      subject ? `${subject}లో ${n} ప్రశ్నలు ఉన్నాయి.` : `${n} ప్రశ్నలు ఉన్నాయి.`,
    topics: (names: string) => `అంశాలు: ${names}.`,
    bookmarked: (id: number) => `ప్రశ్న ${id} బుక్‌మార్క్ అయింది.`,
    bookmarks: (ids: string) => `మీ బుక్‌మార్క్‌లు: ${ids}.`,
    emptyBookmarks: "మీకు ఇంకా బుక్‌మార్క్‌లు లేవు.",
    signIn: "బుక్‌మార్క్‌లను చూడటానికి సైన్ ఇన్ చేయండి.",
    noResults: "సరిపోయే అంశం లేదా ప్రశ్న దొరకలేదు.",
    declined: "బుక్‌మార్క్ సేవ్ కాలేదు.",
    failure: (message: string) => `క్షమించండి, అది పని చేయలేదు: ${message}`,
    unknown: "ఉపయోగకరమైన ఫలితం లేదు.",
    titles: {
      Home: "హోమ్",
      Subjects: "విషయాలు",
      Subject: "విషయం",
      Practice: "ప్రాక్టీస్",
      Question: "ప్రశ్న",
      Pricing: "ధరలు",
      About: "గురించి",
      "Sign in": "సైన్ ఇన్",
    },
  },
  "hi-IN": {
    help: "पूछें कि भौतिकी में कितने प्रश्न हैं या कहें कि कीमत दिखाओ।",
    openQuestion: "पहले कोई प्रश्न खोलें, फिर कहें कि इस प्रश्न को बुकमार्क करें।",
    opening: (title: string) => `${title} खोल रहे हैं।`,
    count: (n: number, subject?: string) =>
      subject ? `${subject} में ${n} प्रश्न हैं।` : `${n} प्रश्न हैं।`,
    topics: (names: string) => `विषय सूची: ${names}।`,
    bookmarked: (id: number) => `प्रश्न ${id} बुकमार्क किया गया।`,
    bookmarks: (ids: string) => `आपके बुकमार्क: ${ids}।`,
    emptyBookmarks: "आपके पास अभी कोई बुकमार्क नहीं है।",
    signIn: "बुकमार्क देखने के लिए साइन इन करें।",
    noResults: "कोई मिलता-जुलता विषय या प्रश्न नहीं मिला।",
    declined: "बुकमार्क सहेजा नहीं गया।",
    failure: (message: string) => `क्षमा करें, यह नहीं हो पाया: ${message}`,
    unknown: "कोई उपयोगी परिणाम नहीं मिला।",
    titles: {
      Home: "होम",
      Subjects: "विषय",
      Subject: "विषय",
      Practice: "अभ्यास",
      Question: "प्रश्न",
      Pricing: "कीमतें",
      About: "परिचय",
      "Sign in": "साइन इन",
    },
  },
};

/** Selects the localized templates using the server's language instruction. */
export function localizedReply(system: string) {
  const language = system.match(/^Always reply in [^(\n]+\((te-IN|hi-IN|en-IN)\)/m)?.[1];
  const tag = language === "te-IN" || language === "hi-IN" ? language : "en-IN";
  return {
    text: replies[tag],
    name: tag === "te-IN" ? ("te" as const) : tag === "hi-IN" ? ("hi" as const) : ("en" as const),
  };
}

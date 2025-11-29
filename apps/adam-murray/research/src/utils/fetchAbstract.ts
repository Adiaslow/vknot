/**
 * Normalize abstract text by removing common prefixes and cleaning formatting
 */
function normalizeAbstract(text: string): string {
  if (!text) return "";

  let normalized = text;

  // Remove JATS XML tags thoroughly
  normalized = normalized
    // Remove all JATS tags with any attributes
    .replace(/<jats:[^>]*>/gi, "")
    .replace(/<\/jats:[^>]*>/gi, " ")
    // Remove any remaining XML/HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Remove common abstract prefixes (case-insensitive, with optional colon/newline)
  const prefixes = [
    /^abstract\s*[:\-–—]?\s*/i,
    /^summary\s*[:\-–—]?\s*/i,
    /^background\s*[:\-–—]?\s*/i,
    /^introduction\s*[:\-–—]?\s*/i,
    /^purpose\s*[:\-–—]?\s*/i,
    /^objective\s*[:\-–—]?\s*/i,
    /^objectives\s*[:\-–—]?\s*/i,
    /^motivation\s*[:\-–—]?\s*/i,
    /^highlights\s*[:\-–—]?\s*/i,
  ];

  for (const prefix of prefixes) {
    normalized = normalized.replace(prefix, "");
  }

  // Clean up whitespace
  normalized = normalized
    // Replace multiple newlines with single space
    .replace(/\n+/g, " ")
    // Replace multiple spaces with single space
    .replace(/\s+/g, " ")
    // Remove leading/trailing whitespace
    .trim();

  // Capitalize first letter if it's lowercase
  if (normalized.length > 0 && normalized[0] === normalized[0].toLowerCase()) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Fetch abstract from Semantic Scholar API
 * Semantic Scholar typically has cleaner, more complete abstracts
 */
async function fetchFromSemanticScholar(doi: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=abstract`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site",
        },
      }
    );

    if (!response.ok) return "";

    const data = await response.json();
    return data?.abstract || "";
  } catch {
    return "";
  }
}

/**
 * Fetch abstract from CrossRef API
 */
async function fetchFromCrossRef(doi: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site (mailto:research@example.com)",
        },
      }
    );

    if (!response.ok) return "";

    const data = await response.json();
    return data?.message?.abstract || "";
  } catch {
    return "";
  }
}

/**
 * Fetch abstract from OpenAlex API
 * OpenAlex uses inverted index, so we need to reconstruct the text
 */
async function fetchFromOpenAlex(doi: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "mailto:research@example.com",
        },
      }
    );

    if (!response.ok) return "";

    const data = await response.json();
    const invertedIndex = data?.abstract_inverted_index;

    if (!invertedIndex) return "";

    // Reconstruct abstract from inverted index
    const words: [string, number][] = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions as number[]) {
        words.push([word, pos]);
      }
    }
    words.sort((a, b) => a[1] - b[1]);
    return words.map(w => w[0]).join(" ");
  } catch {
    return "";
  }
}

/**
 * Fetch and normalize abstract from multiple sources
 * Priority: Semantic Scholar > CrossRef > OpenAlex
 */
export async function fetchAbstractFromCrossRef(doi: string): Promise<string> {
  if (!doi) return "";

  // Try sources in parallel for speed
  const [semanticScholar, crossRef, openAlex] = await Promise.all([
    fetchFromSemanticScholar(doi),
    fetchFromCrossRef(doi),
    fetchFromOpenAlex(doi),
  ]);

  // Use first available abstract, prioritizing Semantic Scholar
  const rawAbstract = semanticScholar || crossRef || openAlex;

  if (!rawAbstract) return "";

  // Normalize and clean the abstract
  return normalizeAbstract(rawAbstract);
}

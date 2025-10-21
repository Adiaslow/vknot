/**
 * Publication metrics from various sources
 */
export interface PublicationMetrics {
  citations?: number;
  altmetricScore?: number;
  tweets?: number;
  news?: number;
  blogs?: number;
  readers?: number;
  views?: number;
}

/**
 * Fetch citation count from CrossRef API
 */
async function fetchCitationsFromCrossRef(doi: string): Promise<number | undefined> {
  try {
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site (mailto:your-email@example.com)",
        },
      }
    );

    if (!response.ok) return undefined;

    const data = await response.json();
    return data?.message?.["is-referenced-by-count"] || 0;
  } catch (error) {
    console.warn(`Failed to fetch citations from CrossRef for DOI ${doi}:`, error);
    return undefined;
  }
}

/**
 * Fetch Altmetric data (social media mentions, news, etc.)
 * Altmetric API is free for basic queries
 */
async function fetchAltmetricData(doi: string): Promise<Partial<PublicationMetrics>> {
  try {
    const response = await fetch(
      `https://api.altmetric.com/v1/doi/${encodeURIComponent(doi)}`
    );

    if (!response.ok) return {};

    const data = await response.json();

    return {
      altmetricScore: data?.score,
      tweets: data?.cited_by_tweeters_count,
      news: data?.cited_by_msm_count,
      blogs: data?.cited_by_feeds_count,
      readers: data?.readers_count,
    };
  } catch (error) {
    console.warn(`Failed to fetch Altmetric data for DOI ${doi}:`, error);
    return {};
  }
}

/**
 * Fetch metrics from Europe PMC (PubMed Central)
 * Good for life sciences papers - provides view counts
 */
async function fetchEuropePMCMetrics(doi: string): Promise<Partial<PublicationMetrics>> {
  try {
    const response = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${encodeURIComponent(doi)}&format=json`
    );

    if (!response.ok) return {};

    const data = await response.json();
    const result = data?.resultList?.result?.[0];

    if (!result) return {};

    return {
      citations: result?.citedByCount,
      views: result?.pubModel === "Print-Electronic" ? result?.pageViews : undefined,
    };
  } catch (error) {
    console.warn(`Failed to fetch Europe PMC metrics for DOI ${doi}:`, error);
    return {};
  }
}

/**
 * Fetch all available metrics for a publication
 * Combines data from multiple sources
 */
export async function fetchPublicationMetrics(doi: string): Promise<PublicationMetrics> {
  if (!doi) return {};

  // Fetch from all sources in parallel
  const [crossrefCitations, altmetricData, pmcData] = await Promise.all([
    fetchCitationsFromCrossRef(doi),
    fetchAltmetricData(doi),
    fetchEuropePMCMetrics(doi),
  ]);

  // Combine metrics, preferring more reliable sources
  return {
    // Use PMC citations if available, otherwise CrossRef
    citations: pmcData.citations ?? crossrefCitations,
    altmetricScore: altmetricData.altmetricScore,
    tweets: altmetricData.tweets,
    news: altmetricData.news,
    blogs: altmetricData.blogs,
    readers: altmetricData.readers,
    views: pmcData.views,
  };
}

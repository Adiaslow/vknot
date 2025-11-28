/**
 * Publication metrics from various sources
 */
export interface PublicationMetrics {
  // Citation metrics
  citations?: number;
  influentialCitations?: number;

  // Altmetric data
  altmetricScore?: number;
  tweets?: number;
  news?: number;
  blogs?: number;
  readers?: number;

  // Usage metrics
  views?: number;

  // Open Access status
  isOpenAccess?: boolean;
  oaStatus?: 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';
  oaUrl?: string;

  // Auto-detected topics/fields
  fieldsOfStudy?: string[];
  concepts?: Array<{ name: string; score: number }>;

  // Publication context
  references?: number;
  publicationTypes?: string[];

  // Venue/Journal (fetched from APIs)
  venue?: string;
}

/**
 * Fetch citation count and venue from CrossRef API
 */
async function fetchFromCrossRef(doi: string): Promise<{ citations?: number; venue?: string }> {
  try {
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site (mailto:your-email@example.com)",
        },
      }
    );

    if (!response.ok) return {};

    const data = await response.json();
    const message = data?.message;

    // Get container-title (journal name) - it's an array, take first
    const containerTitle = message?.["container-title"]?.[0];

    // For preprints, also check institution name
    const institution = message?.institution?.[0]?.name;

    return {
      citations: message?.["is-referenced-by-count"] || 0,
      venue: containerTitle || institution,
    };
  } catch (error) {
    console.warn(`Failed to fetch from CrossRef for DOI ${doi}:`, error);
    return {};
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
 * Fetch data from Semantic Scholar API
 * Provides citations, influential citations, fields of study, and more
 * Free, no API key required (rate limited to 100 requests per 5 minutes)
 */
async function fetchSemanticScholarData(doi: string): Promise<Partial<PublicationMetrics>> {
  try {
    const fields = 'citationCount,influentialCitationCount,fieldsOfStudy,referenceCount,publicationTypes,isOpenAccess';
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site",
        },
      }
    );

    if (!response.ok) return {};

    const data = await response.json();

    return {
      citations: data?.citationCount,
      influentialCitations: data?.influentialCitationCount,
      fieldsOfStudy: data?.fieldsOfStudy || [],
      references: data?.referenceCount,
      publicationTypes: data?.publicationTypes || [],
      isOpenAccess: data?.isOpenAccess,
    };
  } catch (error) {
    console.warn(`Failed to fetch Semantic Scholar data for DOI ${doi}:`, error);
    return {};
  }
}

/**
 * Fetch data from OpenAlex API
 * Provides citations, concepts (auto-tagged topics), open access info, and venue
 * Completely free, no API key required
 */
async function fetchOpenAlexData(doi: string): Promise<Partial<PublicationMetrics>> {
  try {
    const response = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "mailto:your-email@example.com",
        },
      }
    );

    if (!response.ok) return {};

    const data = await response.json();

    // Extract top concepts (those with score > 0.3)
    const concepts = (data?.concepts || [])
      .filter((c: any) => c.score > 0.3)
      .slice(0, 5)
      .map((c: any) => ({
        name: c.display_name,
        score: c.score,
      }));

    // Map OpenAlex OA status to our enum
    let oaStatus: PublicationMetrics['oaStatus'] = 'closed';
    if (data?.open_access?.oa_status) {
      const status = data.open_access.oa_status;
      if (['gold', 'green', 'hybrid', 'bronze'].includes(status)) {
        oaStatus = status as PublicationMetrics['oaStatus'];
      }
    }

    // Get venue from primary_location or host_venue
    const venue = data?.primary_location?.source?.display_name
      || data?.host_venue?.display_name;

    return {
      citations: data?.cited_by_count,
      isOpenAccess: data?.open_access?.is_oa,
      oaStatus: oaStatus,
      oaUrl: data?.open_access?.oa_url,
      concepts: concepts.length > 0 ? concepts : undefined,
      venue: venue,
    };
  } catch (error) {
    console.warn(`Failed to fetch OpenAlex data for DOI ${doi}:`, error);
    return {};
  }
}

/**
 * Fetch Open Access status from Unpaywall
 * Simple and reliable OA detection
 */
async function fetchUnpaywallData(doi: string): Promise<Partial<PublicationMetrics>> {
  try {
    // Unpaywall requires an email parameter
    const email = "research@example.com";
    const response = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${email}`
    );

    if (!response.ok) return {};

    const data = await response.json();

    // Map Unpaywall OA status
    let oaStatus: PublicationMetrics['oaStatus'] = 'closed';
    if (data?.oa_status) {
      const status = data.oa_status;
      if (['gold', 'green', 'hybrid', 'bronze'].includes(status)) {
        oaStatus = status as PublicationMetrics['oaStatus'];
      }
    }

    return {
      isOpenAccess: data?.is_oa,
      oaStatus: oaStatus,
      oaUrl: data?.best_oa_location?.url,
    };
  } catch (error) {
    console.warn(`Failed to fetch Unpaywall data for DOI ${doi}:`, error);
    return {};
  }
}

/**
 * Fetch all available metrics for a publication
 * Combines data from multiple sources with intelligent fallbacks
 */
export async function fetchPublicationMetrics(doi: string): Promise<PublicationMetrics> {
  if (!doi) return {};

  // Fetch from all sources in parallel
  const [crossrefData, altmetricData, pmcData, semanticScholar, openAlex, unpaywall] = await Promise.all([
    fetchFromCrossRef(doi),
    fetchAltmetricData(doi),
    fetchEuropePMCMetrics(doi),
    fetchSemanticScholarData(doi),
    fetchOpenAlexData(doi),
    fetchUnpaywallData(doi),
  ]);

  // Combine metrics with priority ordering for overlapping fields
  // Priority: Semantic Scholar > OpenAlex > PMC > CrossRef for citations
  const citations = semanticScholar.citations
    ?? openAlex.citations
    ?? pmcData.citations
    ?? crossrefData.citations;

  // Combine fields of study and concepts
  const fieldsOfStudy = semanticScholar.fieldsOfStudy?.length
    ? semanticScholar.fieldsOfStudy
    : undefined;

  const concepts = openAlex.concepts?.length
    ? openAlex.concepts
    : undefined;

  // OA status: prefer Unpaywall, fallback to OpenAlex, then Semantic Scholar
  const isOpenAccess = unpaywall.isOpenAccess
    ?? openAlex.isOpenAccess
    ?? semanticScholar.isOpenAccess;

  const oaStatus = unpaywall.oaStatus !== 'closed'
    ? unpaywall.oaStatus
    : openAlex.oaStatus !== 'closed'
    ? openAlex.oaStatus
    : 'closed';

  const oaUrl = unpaywall.oaUrl ?? openAlex.oaUrl;

  // Venue: prefer OpenAlex, fallback to CrossRef
  const venue = openAlex.venue || crossrefData.venue;

  return {
    // Citation metrics
    citations,
    influentialCitations: semanticScholar.influentialCitations,

    // Altmetric data
    altmetricScore: altmetricData.altmetricScore,
    tweets: altmetricData.tweets,
    news: altmetricData.news,
    blogs: altmetricData.blogs,
    readers: altmetricData.readers,

    // Usage
    views: pmcData.views,

    // Open Access
    isOpenAccess,
    oaStatus,
    oaUrl,

    // Topics and context
    fieldsOfStudy,
    concepts,
    references: semanticScholar.references,
    publicationTypes: semanticScholar.publicationTypes,

    // Venue
    venue,
  };
}

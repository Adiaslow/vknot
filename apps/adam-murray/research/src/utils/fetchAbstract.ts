/**
 * Fetch abstract from CrossRef API using DOI
 * CrossRef provides metadata for scholarly works including abstracts
 */
export async function fetchAbstractFromCrossRef(doi: string): Promise<string> {
  if (!doi) return "";

  try {
    // CrossRef API endpoint - free and doesn't require authentication
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: {
          "User-Agent": "Adam Murray Research Site (mailto:your-email@example.com)",
        },
      }
    );

    if (!response.ok) {
      console.warn(`CrossRef API returned ${response.status} for DOI: ${doi}`);
      return "";
    }

    const data = await response.json();

    // CrossRef returns abstract in JATS XML format, we need to extract plain text
    const abstract = data?.message?.abstract;

    if (!abstract) {
      return "";
    }

    // Remove JATS XML tags to get plain text
    // CrossRef abstracts often have <jats:p>, <jats:italic>, etc.
    const plainText = abstract
      .replace(/<jats:p>/g, "")
      .replace(/<\/jats:p>/g, "\n\n")
      .replace(/<jats:title>/g, "")
      .replace(/<\/jats:title>/g, ": ")
      .replace(/<jats:italic>/g, "")
      .replace(/<\/jats:italic>/g, "")
      .replace(/<jats:bold>/g, "")
      .replace(/<\/jats:bold>/g, "")
      .replace(/<jats:sub>/g, "")
      .replace(/<\/jats:sub>/g, "")
      .replace(/<jats:sup>/g, "")
      .replace(/<\/jats:sup>/g, "")
      .replace(/\n\n+/g, "\n\n")
      .trim();

    return plainText;
  } catch (error) {
    console.warn(`Failed to fetch abstract for DOI ${doi}:`, error);
    return "";
  }
}

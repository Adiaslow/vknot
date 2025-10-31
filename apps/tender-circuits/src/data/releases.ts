/**
 * Tender Circuits Release Catalog
 *
 * This file contains all release metadata for the label.
 * Spotify provides: track data, artwork, durations, release dates
 * This config provides: catalog info, descriptions, credits, custom metadata
 */

export interface ReleaseCredits {
  [role: string]: string;
}

export interface Release {
  // Routing & Identification
  slug: string;
  catalogNumber: string;
  spotifyAlbumId: string;

  // Artist Info
  artistName: string;
  artistSlug: string; // for linking to artist page

  // Release Metadata (not from Spotify)
  description: string;
  genres: string[];
  subgenres: string[];
  style: string;

  // Artwork
  vinylArtwork?: string; // Optional custom vinyl cover artwork with transparency

  // Credits & Notes
  credits: ReleaseCredits;
  notes: string;
}

/**
 * All Tender Circuits Releases
 * Add new releases to this array
 */
export const releases: Release[] = [
  {
    slug: 'life-is-fragile',
    catalogNumber: 'TC001',
    spotifyAlbumId: '6HCJ9AIBTHrdG3fI5kUPVO',

    artistName: 'Soft Systems',
    artistSlug: 'soft-systems',

    description:
      'A contemplative exploration of transient beauty through processed field recordings and generative synthesis. Life Is Fragile examines the delicate balance between structure and dissolution, using algorithmic composition and environmental sound to create an immersive meditation on impermanence.',

    genres: ['Electronic', 'Ambient', 'Avant Garde'],
    subgenres: ['Lower-case Music'],
    style: 'Instrumental',

    vinylArtwork: '/tender_circuits/images/releases/Life is Fragile - Website.png',

    credits: {
      'Composed & Produced': 'Soft Systems',
      'Field Recordings': 'Various locations, California',
      'Mastered': 'Soft Systems',
      'Artwork': 'Tender Circuits',
      'Label': 'Tender Circuits',
    },

    notes:
      'Recorded using generative Max/MSP patches, field recordings captured with handheld devices, and processed through custom granular synthesis tools. All sounds sourced from environmental recordings made between 2024-2025.',
  },

  // Future releases: just add a new object here following the same structure
];

/**
 * Helper function to get a release by slug
 */
export function getReleaseBySlug(slug: string): Release | undefined {
  return releases.find(release => release.slug === slug);
}

/**
 * Helper function to get all releases by artist
 */
export function getReleasesByArtist(artistSlug: string): Release[] {
  return releases.filter(release => release.artistSlug === artistSlug);
}

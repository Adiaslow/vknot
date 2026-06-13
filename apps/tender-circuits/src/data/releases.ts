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

  // Release status: omit for published, or set to a pre-release state
  comingSoon?: boolean;
  preRelease?: boolean;
  title?: string;

  // Optional year for listings that don't fetch Spotify (e.g. artist pages)
  year?: number;

  // Visibility: set to hide this release everywhere on the site without removing it
  hidden?: boolean;

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

    year: 2025,
    title: 'Life Is Fragile',

    description:
      'The debut from Soft Systems. Seven tracks in fifteen minutes, rooted in a life that began in the sharp hum of a NICU and has been softening toward the world ever since. Everything arrives at once \u2014 warm tones that fill the room and stay, sudden bright ruptures that offer no warning and no explanation. Between the jaggedness, gentleness. Between the overwhelm, grace. The album sits inside the too-muchness of things and settles where it can, finding love and peace in the spaces a lifelong sharpness leaves behind.',

    genres: ['Ambient', 'Experimental'],
    subgenres: [],
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

  {
    slug: 'high-visibility-sweatsuit',
    catalogNumber: 'TC002',
    spotifyAlbumId: '06pQjxvBCzoBwMq1N6K7yi',

    artistName: 'Tony',
    artistSlug: 'tony',

    preRelease: true,
    hidden: true,
    title: 'High Visibility Sweatsuit',

    description: '',

    genres: [],
    subgenres: [],
    style: '',

    vinylArtwork: '/tender_circuits/images/releases/Welcome to the Tonesperience - Website.png',

    credits: {
      'Label': 'Tender Circuits',
    },

    notes: '',
  },

  {
    slug: 'slow-light',
    catalogNumber: 'TC003',
    spotifyAlbumId: '5U5DpSql1A82wj32g7rKsV',

    artistName: 'Soft Systems',
    artistSlug: 'soft-systems',

    year: 2026,

    title: 'Slow Light',

    description:
      'The second Soft Systems album begins where the first settled \u2014 but deeper, and with more room to breathe. Everything sunken a little lower. Piano and analog synthesizer move through long stretches of near-silence. What was frenetic has become patient. What was sharp has worn smooth. The album doesn\u2019t reach for the listener \u2014 it trusts you to come to it. Less a record about survival, more about choice.',

    genres: ['Ambient', 'Post-Minimalist'],
    subgenres: [],
    style: 'Instrumental',

    vinylArtwork: '/tender_circuits/images/releases/Slow Light - Website.png',

    credits: {
      'Composed & Produced': 'Soft Systems',
      'Mastered': 'Soft Systems',
      'Artwork': 'Tender Circuits',
      'Label': 'Tender Circuits',
    },

    notes: '',
  },
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

/**
 * All releases that should appear on the site (excludes hidden)
 */
export function getVisibleReleases(): Release[] {
  return releases.filter(release => !release.hidden);
}

/**
 * Visible releases by artist (excludes hidden) — for listings
 */
export function getVisibleReleasesByArtist(artistSlug: string): Release[] {
  return getReleasesByArtist(artistSlug).filter(release => !release.hidden);
}

export type ReleaseStatus = 'published' | 'preRelease' | 'comingSoon';

/**
 * Single source of truth for a release's status, used to drive badges and
 * conditional rendering across pages.
 */
export function getReleaseStatus(release: Release): ReleaseStatus {
  if (release.preRelease) return 'preRelease';
  if (release.comingSoon) return 'comingSoon';
  return 'published';
}

/**
 * Get genres for an artist derived from their releases,
 * ordered by frequency (descending) then alphabetically.
 * Includes genres, subgenres, and style.
 */
export function getArtistGenres(artistSlug: string): string[] {
  const artistReleases = getReleasesByArtist(artistSlug);
  const counts = new Map<string, number>();

  for (const r of artistReleases) {
    for (const g of r.genres) {
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    for (const s of r.subgenres) {
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    if (r.style) {
      counts.set(r.style, (counts.get(r.style) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}

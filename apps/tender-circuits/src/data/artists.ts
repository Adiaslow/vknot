/**
 * Tender Circuits Artist Roster
 *
 * Single source of truth for artist metadata. Each artist's releases are
 * derived from `releases.ts` via `getReleasesByArtist`, and genres via
 * `getArtistGenres` — nothing about releases is duplicated here.
 *
 * To add an artist: append an entry below. Their directory listing and
 * profile page are generated automatically (see pages/artists/[slug].astro).
 */

export interface Artist {
  // Routing & Identification
  slug: string;
  name: string;

  // Profile
  tagline?: string; // short hook for the artist directory; falls back to description
  description: string; // full bio for the profile page; may be '' for a minimal profile
  location?: string; // shown alongside release count when set
  approach?: string[]; // renders an "Approach & Methods" section when set

  // Roster flags
  featured?: boolean; // shows a "Featured Artist" badge
  hidden?: boolean; // hide everywhere on the site without removing
}

export const artists: Artist[] = [
  {
    slug: 'soft-systems',
    name: 'Soft Systems',
    tagline:
      'The solo ambient and post-minimalist project of Addie. Music built with uncommon structural precision but experienced as something closer to weather than architecture.',
    description:
      'Soft Systems is the solo ambient and post-minimalist project of Addie, released through Tender Circuits. The music is built with uncommon structural precision but experienced as something closer to weather than architecture — dense with detail that rewards attention but never demands it. When not composing, Addie works as a computational researcher specializing in biomolecular engineering and biophysics.',
    location: 'California',
    approach: [
      'Generative and algorithmic composition techniques',
      'Field recording and environmental sound processing',
      'Granular and spectral synthesis',
      'Real-time audio manipulation and live coding',
    ],
    featured: true,
  },
  {
    slug: 'tony',
    name: 'Tony',
    description: '',
    hidden: true,
  },
];

/**
 * Helper function to get an artist by slug
 */
export function getArtistBySlug(slug: string): Artist | undefined {
  return artists.find(artist => artist.slug === slug);
}

/**
 * All artists that should appear on the site (excludes hidden)
 */
export function getVisibleArtists(): Artist[] {
  return artists.filter(artist => !artist.hidden);
}

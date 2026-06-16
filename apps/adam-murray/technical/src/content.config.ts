import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { categoryIds } from '@vknot/ui/lib/arxiv-taxonomy';

// Tags are arXiv category IDs (e.g. "q-bio.BM"), validated against the
// cached taxonomy in @vknot/ui. A typo'd or stale category fails the
// build. Refresh the cache with `pnpm --filter @vknot/ui sync:taxonomy`.
const ARXIV_CATEGORIES = new Set<string>(categoryIds);

// Content Layer API (Astro 6+). The `glob` loader replaces the legacy
// `type: 'content'` shorthand and is more explicit about file discovery —
// pattern selects which files become entries, base anchors the relative
// paths used for the entry IDs.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(40),
    date: z.date(),
    tags: z
      .array(
        z.string().refine((t) => ARXIV_CATEGORIES.has(t), (t) => ({
          message: `"${t}" is not a known arXiv category id`,
        })),
      )
      .min(1),
    image: z.string().optional(),
    draft: z.boolean().default(false),
    readingTimeMinutes: z.number().optional()
  })
});

export const collections = {
  blog
};

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    tags: z.array(z.string()).min(1),
    image: z.string().optional(),
    draft: z.boolean().default(false),
    readingTimeMinutes: z.number().optional()
  })
});

export const collections = {
  blog
};

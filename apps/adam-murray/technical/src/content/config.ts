import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
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


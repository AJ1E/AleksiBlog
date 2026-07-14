import { defineCollection, z } from "astro:content";
import { file, glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    excerpt: z.string(),
    publishedAt: z.date(),
    updatedAt: z.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    readTime: z.string(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    coverPosition: z.string().optional(),
    author: z.object({
      name: z.string(),
      avatar: z.string(),
      bio: z.string()
    })
  })
});

const subscriptions = defineCollection({
  loader: glob({ base: "./src/content/subscriptions", pattern: "**/*.yaml" }),
  schema: z.object({
    name: z.string(),
    category: z.string(),
    provider: z.string(),
    status: z.enum(["active", "paused", "planned"]),
    startedAt: z.string(),
    tags: z.array(z.string()).default([]),
    renewal: z.object({
      unit: z.enum(["day", "month", "year"]),
      interval: z.number().int().positive().default(1),
      anchor: z.string().optional()
    }),
    renewalUrl: z.string().url().optional(),
    price: z.object({
      amount: z.number(),
      currency: z.string().default("USD")
    }),
    usage: z.object({
      percent: z.number().min(0).max(100).default(0),
      note: z.string().default("")
    }),
    description: z.string(),
    note: z.string().default(""),
    badge: z.string(),
    accent: z.string().default("orange"),
    icon: z.string(),
    iconLabel: z.string().default(""),
    color: z.string()
  })
});

const apis = defineCollection({
  loader: glob({ base: "./src/content/apis", pattern: "**/*.yaml" }),
  schema: z.object({
    name: z.string(),
    category: z.string(),
    provider: z.string(),
    integrationState: z.enum(["placeholder", "wired", "planned"]),
    useCase: z.string(),
    endpointHint: z.string(),
    note: z.string(),
    accent: z.string().default("teal")
  })
});

const servers = defineCollection({
  loader: glob({ base: "./src/content/servers", pattern: "**/*.yaml" }),
  schema: z.object({
    name: z.string(),
    location: z.string(),
    region: z.string(),
    flag: z.string(),
    lat: z.number(),
    lon: z.number(),
    provider: z.string(),
    beszelId: z.string(),
  })
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    name: z.string(),
    title: z.string().optional(),
    summary: z.string(),
    category: z.string(),
    status: z.enum(["ongoing", "experimental", "paused", "archived"]).default("ongoing"),
    year: z.string(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    coverPosition: z.string().optional(),
    accent: z.enum(["orange", "teal", "purple", "green", "yellow", "red", "blue"]).default("orange"),
    pattern: z.enum(["grid", "dots", "rings", "lines", "topo"]).default("grid"),
    initial: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(50),
    links: z
      .array(
        z.object({
          type: z.enum(["article", "github", "external", "doc", "demo"]),
          href: z.string(),
          label: z.string()
        })
      )
      .default([]),
    draft: z.boolean().default(false)
  })
});

const notes = defineCollection({
  loader: glob({ base: "./.cache/notes/content", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    sourcePath: z.string(),
    sourceUrl: z.string(),
    folder: z.string().default("Root"),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    created: z.string().optional(),
    updated: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

const bucketlist = defineCollection({
  loader: file("./src/content/bucketlist/catalog.json"),
  schema: z.object({
    kind: z.enum(["movie", "tv", "book", "destination"]),
    rank: z.number().int().positive().optional(),
    imdbId: z.string().optional(),
    titleZh: z.string(),
    titleEn: z.string(),
    releaseYear: z.number().int().optional(),
    runtimeMinutes: z.number().int().positive().optional(),
    genres: z.array(z.string()).default([]),
    summary: z.string(),
    imdbUrl: z.string().url().optional(),
    poster: z.string().optional()
  })
});

export const collections = { blog, subscriptions, apis, servers, projects, notes, bucketlist };

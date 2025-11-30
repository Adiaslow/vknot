export const siteMeta = {
  host: 'https://vknot.love',
  apps: {
    landing: {
      base: '/',
      title: 'VKnot'
    },
    research: {
      base: '/adam-murray/research',
      title: 'Research',
      description: 'Computational peptide drug design and developmental neuroscience at UC Santa Cruz and UC Davis.'
    },
    technical: {
      base: '/adam-murray/technical',
      title: 'Technical',
      description: 'Long-form engineering notes, tutorials, and design systems.'
    },
    projects: {
      base: '/adam-murray/projects',
      title: 'Projects',
      description: 'Software, tools, and creative experiments.'
    },
    tenderCircuits: {
      base: '/tender_circuits',
      title: 'Tender Circuits',
      description: 'Independent music label for experimental and electronic releases.'
    }
  }
} as const;

export type SiteIdentifier = keyof typeof siteMeta.apps;


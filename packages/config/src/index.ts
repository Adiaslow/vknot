export const siteMeta = {
  host: 'https://vknot.love',
  apps: {
    landing: {
      base: '/',
      title: 'VKnot — Creative Technology Collective'
    },
    research: {
      base: '/adam-murray/research',
      title: 'Adam Murray — Computational Research'
    },
    technical: {
      base: '/adam-murray/technical',
      title: 'Adam Murray — Technical Writing'
    },
    tenderCircuits: {
      base: '/tender_circuits',
      title: 'Tender Circuits — Independent Label'
    }
  }
} as const;

export type SiteIdentifier = keyof typeof siteMeta.apps;


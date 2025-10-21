import type { CSSProperties, ReactNode } from 'react';

export type NavigationTheme = 'academic' | 'blog' | 'music' | 'minimal';

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

export interface NavCta {
  readonly label: string;
  readonly href: string;
  readonly variant?: 'primary' | 'secondary';
}

export interface NavigationProps {
  readonly theme: NavigationTheme;
  readonly siteName: string;
  readonly baseUrl: string;
  readonly links?: ReadonlyArray<NavLink>;
  readonly ctas?: ReadonlyArray<NavCta>;
  readonly logo?: ReactNode;
}

export function Navigation({
  theme,
  siteName,
  baseUrl,
  links = [],
  ctas = [],
  logo
}: NavigationProps) {
  const styles = resolveThemeStyles(theme);

  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <a href={baseUrl} aria-label={siteName} style={styles.homeLink}>
          {logo ?? <span style={styles.siteName}>{siteName}</span>}
        </a>
      </div>
      <nav aria-label="Primary navigation" style={styles.nav}>
        <ul style={styles.linkList}>
          {links.map((link) => (
            <li key={link.href} style={styles.linkItem}>
              <a
                href={link.href}
                style={styles.link}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noreferrer noopener' : undefined}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {ctas.length > 0 ? (
        <div style={styles.ctaGroup}>
          {ctas.map((cta) => (
            <a key={cta.href} href={cta.href} style={styles.cta(cta.variant ?? 'primary')}>
              {cta.label}
            </a>
          ))}
        </div>
      ) : null}
    </header>
  );
}

interface ThemeStyles {
  readonly header: CSSProperties;
  readonly brand: CSSProperties;
  readonly homeLink: CSSProperties;
  readonly siteName: CSSProperties;
  readonly nav: CSSProperties;
  readonly linkList: CSSProperties;
  readonly linkItem: CSSProperties;
  readonly link: CSSProperties;
  readonly ctaGroup: CSSProperties;
  readonly cta: (variant: 'primary' | 'secondary') => CSSProperties;
}

const basePalette = {
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate100: '#f1f5f9',
  white: '#ffffff'
};

const flexRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center'
};

function resolveThemeStyles(theme: NavigationTheme): ThemeStyles {
  const primaryButton: CSSProperties = {
    borderRadius: 999,
    paddingInline: '16px',
    paddingBlock: '10px',
    fontSize: '0.9rem',
    fontWeight: 600,
    textDecoration: 'none',
    background: basePalette.slate900,
    color: basePalette.white,
    transition: 'background 200ms ease'
  };

  const secondaryButton: CSSProperties = {
    ...primaryButton,
    background: 'transparent',
    color: basePalette.slate700,
    border: `1px solid ${basePalette.slate300 ?? '#cbd5f5'}`
  };

  const base: ThemeStyles = {
    header: {
      ...flexRow,
      justifyContent: 'space-between',
      gap: '24px',
      paddingInline: '32px',
      paddingBlock: '18px',
      borderBottom: `1px solid ${basePalette.slate100}`,
      background: basePalette.white,
      position: 'sticky',
      top: 0,
      zIndex: 20,
      backdropFilter: 'blur(12px)'
    },
    brand: {
      ...flexRow,
      gap: '12px'
    },
    homeLink: {
      ...flexRow,
      gap: '8px',
      color: basePalette.slate900,
      textDecoration: 'none',
      fontWeight: 600
    },
    siteName: {
      fontSize: '1.1rem',
      letterSpacing: '-0.01em'
    },
    nav: {
      ...flexRow,
      gap: '24px'
    },
    linkList: {
      ...flexRow,
      gap: '18px',
      listStyle: 'none',
      margin: 0,
      padding: 0,
      fontSize: '0.95rem'
    },
    linkItem: {
      display: 'block'
    },
    link: {
      color: basePalette.slate700,
      textDecoration: 'none',
      fontWeight: 500
    },
    ctaGroup: {
      ...flexRow,
      gap: '12px'
    },
    cta: (variant) => (variant === 'secondary' ? secondaryButton : primaryButton)
  };

  const themeOverrides: Record<NavigationTheme, Partial<ThemeStyles>> = {
    academic: {
      header: {
        ...base.header,
        background: '#f8fafc',
        borderBottom: `1px solid ${'#e2e8f0'}`
      },
      siteName: {
        ...base.siteName,
        fontFamily: '"Literata", serif',
        fontSize: '1.25rem'
      }
    },
    blog: {
      header: {
        ...base.header,
        background: basePalette.white
      }
    },
    music: {
      header: {
        ...base.header,
        background: 'linear-gradient(90deg,#0f172a 0%,#312e81 100%)',
        borderBottom: 'none',
        color: basePalette.white
      },
      homeLink: {
        ...base.homeLink,
        color: basePalette.white
      },
      link: {
        ...base.link,
        color: '#e2e8f0'
      },
      cta: () => ({
        ...primaryButton,
        background: 'linear-gradient(90deg,#ec4899 0%,#6366f1 100%)',
        boxShadow: '0 10px 30px rgba(236,72,153,0.25)'
      })
    },
    minimal: {
      header: {
        ...base.header,
        paddingInline: '24px',
        background: 'transparent',
        borderBottom: '1px solid transparent'
      },
      nav: {
        ...base.nav,
        gap: '16px'
      }
    }
  };

  return mergeStyles(base, themeOverrides[theme]);
}

function mergeStyles(base: ThemeStyles, overrides: Partial<ThemeStyles>): ThemeStyles {
  return {
    header: { ...base.header, ...overrides.header },
    brand: { ...base.brand, ...overrides.brand },
    homeLink: { ...base.homeLink, ...overrides.homeLink },
    siteName: { ...base.siteName, ...overrides.siteName },
    nav: { ...base.nav, ...overrides.nav },
    linkList: { ...base.linkList, ...overrides.linkList },
    linkItem: { ...base.linkItem, ...overrides.linkItem },
    link: { ...base.link, ...overrides.link },
    ctaGroup: { ...base.ctaGroup, ...overrides.ctaGroup },
    cta: overrides.cta ?? base.cta
  };
}


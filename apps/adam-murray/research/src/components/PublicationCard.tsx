import type { FC } from 'react';

interface PublicationMetrics {
  citations?: number;
  altmetricScore?: number;
  tweets?: number;
  news?: number;
  blogs?: number;
  readers?: number;
  views?: number;
}

interface PublicationCardProps {
  readonly title: string;
  readonly abstract: string;
  readonly venue?: string;
  readonly year?: number;
  readonly date?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly type?: string;
  readonly showAbstract?: boolean;
  readonly metrics?: PublicationMetrics;
}

const PublicationCard: FC<PublicationCardProps> = ({
  title,
  abstract,
  venue,
  year,
  date,
  doi,
  url,
  type,
  showAbstract = true,
  metrics
}) => {
  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <article 
      className={`group relative flex flex-col bg-white border border-gray-2/60 rounded-lg p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-gray-3/80 ${
        url ? 'cursor-pointer hover:-translate-y-1' : ''
      }`}
      onClick={handleClick}
    >
      {/* Publication Type Badge */}
      {type && (
        <div className="absolute -top-2 left-4">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
            type === 'journal-article' 
              ? 'bg-emerald-1 text-emerald-8 border border-emerald-2' 
              : type === 'preprint' 
              ? 'bg-amber-1 text-amber-8 border border-amber-2'
              : 'bg-blue-1 text-blue-8 border border-blue-2'
          }`}>
            {type.replace('-', ' ')}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 pt-2">
        {/* Title */}
        <h3 className={`text-xl font-bold leading-tight text-gray-9 group-hover:text-blue-9 transition-colors ${url ? 'hover:text-blue-7' : ''}`}>
          {title}
        </h3>

        {/* Abstract */}
        {showAbstract && (
          <p className="text-base text-gray-6 leading-relaxed line-clamp-4" style={{
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {abstract}
          </p>
        )}
      </div>
      
      {/* Publication Details */}
      <div className="mt-auto pt-4 space-y-3 border-t border-gray-1">
        {/* Venue and Date */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-8 italic truncate" title={venue ?? 'In Review'}>
              {venue ?? 'In Review'}
            </p>
          </div>
          {(date || year) && (
            <time className="flex-shrink-0 text-sm font-medium text-gray-5 tabular-nums">
              {date || year}
            </time>
          )}
        </div>

        {/* Metrics */}
        {metrics && (metrics.citations !== undefined || metrics.altmetricScore !== undefined || metrics.views !== undefined || metrics.tweets !== undefined) && (
          <div className="flex flex-wrap gap-3 pt-2">
            {metrics.citations !== undefined && metrics.citations > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg className="w-4 h-4 text-blue-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium text-gray-7">{metrics.citations}</span>
                <span className="text-gray-5">citations</span>
              </div>
            )}
            {metrics.views !== undefined && metrics.views > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg className="w-4 h-4 text-emerald-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="font-medium text-gray-7">{metrics.views.toLocaleString()}</span>
                <span className="text-gray-5">views</span>
              </div>
            )}
            {metrics.altmetricScore !== undefined && metrics.altmetricScore > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg className="w-4 h-4 text-purple-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span className="font-medium text-gray-7">{metrics.altmetricScore}</span>
                <span className="text-gray-5">altmetric</span>
              </div>
            )}
            {metrics.tweets !== undefined && metrics.tweets > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg className="w-4 h-4 text-sky-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                </svg>
                <span className="font-medium text-gray-7">{metrics.tweets}</span>
                <span className="text-gray-5">tweets</span>
              </div>
            )}
            {metrics.readers !== undefined && metrics.readers > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg className="w-4 h-4 text-amber-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="font-medium text-gray-7">{metrics.readers}</span>
                <span className="text-gray-5">readers</span>
              </div>
            )}
          </div>
        )}

        {/* DOI */}
        {doi && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-5 uppercase tracking-wider">DOI</span>
            <code className="text-xs bg-gray-0.5 border border-gray-2 rounded px-2 py-1 text-gray-7 font-mono break-all">
              {doi}
            </code>
          </div>
        )}

        {/* View Link */}
        {url && (
          <div className="flex items-center gap-2 pt-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-6 group-hover:text-blue-7 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>View Publication</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

export default PublicationCard;


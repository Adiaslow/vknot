import type { FC } from 'react';
import { FileText, Eye, BarChart3, Twitter, Users } from 'lucide-react';

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
  readonly isIndexPage?: boolean;
  readonly publicationId?: string;
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
  metrics,
  isIndexPage = false,
  publicationId
}) => {
  const handleClick = () => {
    if (isIndexPage && publicationId) {
      window.location.href = `/adam-murray/research/publications#${publicationId}`;
    }
  };

  return (
    <article
      id={publicationId}
      className={`group relative flex flex-col bg-white border border-gray-2/60 rounded-lg p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-gray-3/80 ${
        isIndexPage && publicationId ? 'cursor-pointer hover:-translate-y-1' : ''
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

        {/* Metrics and DOI */}
        {(metrics && (metrics.citations !== undefined || metrics.altmetricScore !== undefined || metrics.views !== undefined || metrics.tweets !== undefined) || doi) && (
          <div className="flex items-start justify-between gap-4 pt-2">
            {/* Metrics */}
            {metrics && (metrics.citations !== undefined || metrics.altmetricScore !== undefined || metrics.views !== undefined || metrics.tweets !== undefined) && (
              <div className="flex flex-wrap gap-3 flex-1">
                {metrics.citations !== undefined && metrics.citations > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <FileText className="w-4 h-4 text-blue-6" />
                    <span className="font-medium text-gray-7">{metrics.citations}</span>
                    <span className="text-gray-5">citations</span>
                  </div>
                )}
                {metrics.views !== undefined && metrics.views > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Eye className="w-4 h-4 text-emerald-6" />
                    <span className="font-medium text-gray-7">{metrics.views.toLocaleString()}</span>
                    <span className="text-gray-5">views</span>
                  </div>
                )}
                {metrics.altmetricScore !== undefined && metrics.altmetricScore > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <BarChart3 className="w-4 h-4 text-purple-6" />
                    <span className="font-medium text-gray-7">{metrics.altmetricScore}</span>
                    <span className="text-gray-5">altmetric</span>
                  </div>
                )}
                {metrics.tweets !== undefined && metrics.tweets > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Twitter className="w-4 h-4 text-sky-6" />
                    <span className="font-medium text-gray-7">{metrics.tweets}</span>
                    <span className="text-gray-5">tweets</span>
                  </div>
                )}
                {metrics.readers !== undefined && metrics.readers > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Users className="w-4 h-4 text-amber-6" />
                    <span className="font-medium text-gray-7">{metrics.readers}</span>
                    <span className="text-gray-5">readers</span>
                  </div>
                )}
              </div>
            )}

            {/* DOI */}
            {doi && (
              <div className="flex flex-col gap-1 items-end flex-shrink-0">
                <span className="text-xs font-medium text-gray-5 uppercase tracking-wider">DOI</span>
                <a
                  href={`https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs bg-gray-0.5 border border-gray-2 rounded px-2 py-1 text-blue-6 hover:text-blue-7 hover:border-blue-3 font-mono break-all transition-colors"
                >
                  {doi}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default PublicationCard;


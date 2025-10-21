import type { FC } from 'react';

interface PublicationCardProps {
  readonly title: string;
  readonly abstract: string;
  readonly venue?: string;
  readonly year?: number;
  readonly date?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly type?: string;
}

const PublicationCard: FC<PublicationCardProps> = ({ 
  title, 
  abstract, 
  venue, 
  year, 
  date,
  doi, 
  url, 
  type 
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
        <p className="text-base text-gray-6 leading-relaxed line-clamp-4" style={{
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {abstract}
        </p>
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


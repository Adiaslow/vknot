import type { FC } from 'react';
import { FileText, Eye, BarChart3, Twitter, Users, Unlock, Star, Tag } from 'lucide-react';

interface PublicationMetrics {
  // Citation metrics
  citations?: number;
  influentialCitations?: number;

  // Altmetric data
  altmetricScore?: number;
  tweets?: number;
  news?: number;
  blogs?: number;
  readers?: number;

  // Usage metrics
  views?: number;

  // Open Access status
  isOpenAccess?: boolean;
  oaStatus?: 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';
  oaUrl?: string;

  // Auto-detected topics/fields
  fieldsOfStudy?: string[];
  concepts?: Array<{ name: string; score: number }>;

  // Publication context
  references?: number;
  publicationTypes?: string[];

  // Venue/Journal (fetched from APIs)
  venue?: string;
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

const OA_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gold: { bg: 'bg-amber-1', text: 'text-amber-8', border: 'border-amber-3' },
  green: { bg: 'bg-emerald-1', text: 'text-emerald-8', border: 'border-emerald-3' },
  hybrid: { bg: 'bg-blue-1', text: 'text-blue-8', border: 'border-blue-3' },
  bronze: { bg: 'bg-orange-1', text: 'text-orange-8', border: 'border-orange-3' },
};

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

  const hasMetrics = metrics && (
    metrics.citations !== undefined ||
    metrics.altmetricScore !== undefined ||
    metrics.views !== undefined ||
    metrics.tweets !== undefined ||
    metrics.influentialCitations !== undefined
  );

  const hasTopics = metrics && (
    (metrics.fieldsOfStudy && metrics.fieldsOfStudy.length > 0) ||
    (metrics.concepts && metrics.concepts.length > 0)
  );

  return (
    <article
      id={publicationId}
      className={`group relative flex flex-col bg-white border border-gray-2/60 rounded-lg p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-gray-3/80 ${
        isIndexPage && publicationId ? 'cursor-pointer hover:-translate-y-1' : ''
      }`}
      onClick={handleClick}
    >
      {/* Publication Type Badge and OA Status */}
      <div className="absolute -top-2 left-4 flex items-center gap-2">
        {type && (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
            type === 'journal-article'
              ? 'bg-emerald-1 text-emerald-8 border border-emerald-2'
              : type === 'preprint'
              ? 'bg-amber-1 text-amber-8 border border-amber-2'
              : 'bg-blue-1 text-blue-8 border border-blue-2'
          }`}>
            {type.replace('-', ' ')}
          </span>
        )}
        {metrics?.isOpenAccess && metrics.oaStatus && metrics.oaStatus !== 'closed' && (
          <a
            href={metrics.oaUrl || (doi ? `https://doi.org/${doi}` : undefined)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase border transition-opacity hover:opacity-80 ${
              OA_STATUS_COLORS[metrics.oaStatus]?.bg || 'bg-emerald-1'
            } ${OA_STATUS_COLORS[metrics.oaStatus]?.text || 'text-emerald-8'} ${
              OA_STATUS_COLORS[metrics.oaStatus]?.border || 'border-emerald-3'
            }`}
            title={`Open Access (${metrics.oaStatus})`}
          >
            <Unlock className="w-3 h-3" />
            {metrics.oaStatus}
          </a>
        )}
      </div>

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

        {/* Auto-detected Topics */}
        {hasTopics && (
          <div className="flex flex-wrap gap-1.5">
            {metrics?.fieldsOfStudy?.slice(0, 3).map((field, idx) => (
              <span
                key={`field-${idx}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-violet-7 bg-violet-1 border border-violet-2 rounded-full"
              >
                <Tag className="w-3 h-3" />
                {field}
              </span>
            ))}
            {metrics?.concepts?.slice(0, 3).map((concept, idx) => (
              <span
                key={`concept-${idx}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-cyan-7 bg-cyan-1 border border-cyan-2 rounded-full"
                title={`Relevance: ${Math.round(concept.score * 100)}%`}
              >
                {concept.name}
              </span>
            ))}
          </div>
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
        {(hasMetrics || doi) && (
          <div className="flex items-start justify-between gap-4 pt-2">
            {/* Metrics */}
            {hasMetrics && (
              <div className="flex flex-wrap gap-3 flex-1">
                {metrics?.citations !== undefined && metrics.citations > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <FileText className="w-4 h-4 text-blue-6" />
                    <span className="font-medium text-gray-7">{metrics.citations}</span>
                    <span className="text-gray-5">citations</span>
                  </div>
                )}
                {metrics?.influentialCitations !== undefined && metrics.influentialCitations > 0 && (
                  <div className="flex items-center gap-1.5 text-xs" title="Highly influential citations from Semantic Scholar">
                    <Star className="w-4 h-4 text-amber-5" />
                    <span className="font-medium text-gray-7">{metrics.influentialCitations}</span>
                    <span className="text-gray-5">influential</span>
                  </div>
                )}
                {metrics?.views !== undefined && metrics.views > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Eye className="w-4 h-4 text-emerald-6" />
                    <span className="font-medium text-gray-7">{metrics.views.toLocaleString()}</span>
                    <span className="text-gray-5">views</span>
                  </div>
                )}
                {metrics?.altmetricScore !== undefined && metrics.altmetricScore > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <BarChart3 className="w-4 h-4 text-purple-6" />
                    <span className="font-medium text-gray-7">{metrics.altmetricScore}</span>
                    <span className="text-gray-5">altmetric</span>
                  </div>
                )}
                {metrics?.tweets !== undefined && metrics.tweets > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Twitter className="w-4 h-4 text-sky-6" />
                    <span className="font-medium text-gray-7">{metrics.tweets}</span>
                    <span className="text-gray-5">tweets</span>
                  </div>
                )}
                {metrics?.readers !== undefined && metrics.readers > 0 && (
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

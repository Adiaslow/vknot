import type { FC } from 'react';

export interface ReadingTimeProps {
  readonly minutes: number;
}

export const ReadingTime: FC<ReadingTimeProps> = ({ minutes }) => {
  if (Number.isNaN(minutes) || minutes <= 0) {
    return null;
  }

  const rounded = Math.max(1, Math.round(minutes));
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>{rounded} min read</span>
    </span>
  );
};


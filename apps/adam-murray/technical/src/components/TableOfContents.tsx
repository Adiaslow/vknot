import type { FC } from 'react';

export interface TocItem {
  readonly id: string;
  readonly title: string;
  readonly depth: number;
}

interface TableOfContentsProps {
  readonly items: ReadonlyArray<TocItem>;
}

export const TableOfContents: FC<TableOfContentsProps> = ({ items }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="sticky top-32 hidden h-max w-64 flex-col gap-2 text-sm text-slate-500 lg:flex">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">On this page</span>
      <nav>
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className={depthClass(item.depth)}>
              <a href={`#${item.id}`} className="rounded px-2 py-1 transition hover:text-slate-900">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

function depthClass(depth: number): string {
  switch (depth) {
    case 2:
      return 'pl-0 font-medium';
    case 3:
      return 'pl-4 text-slate-400';
    default:
      return 'pl-6 text-slate-400';
  }
}


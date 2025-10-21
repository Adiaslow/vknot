import type { FC, ReactNode } from 'react';
import { useMemo, useState } from 'react';

interface CodePlaygroundProps {
  readonly code: string;
  readonly children?: ReactNode;
}

export const CodePlayground: FC<CodePlaygroundProps> = ({ code, children }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const trimmedCode = useMemo(() => code.trim(), [code]);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={tabClass(activeTab === 'preview')}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button type="button" className={tabClass(activeTab === 'code')} onClick={() => setActiveTab('code')}>
            Code
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-0">
        {activeTab === 'preview' ? (
          <div className="min-h-[200px] bg-white p-6">{children}</div>
        ) : (
          <pre className="overflow-auto bg-slate-900 p-6 text-sm text-slate-50">
            <code>{trimmedCode}</code>
          </pre>
        )}
      </div>
    </section>
  );
};

function tabClass(active: boolean): string {
  return active
    ? 'rounded-md bg-white px-3 py-1 text-slate-900 shadow-sm'
    : 'rounded-md px-3 py-1 text-slate-500 transition hover:text-slate-900';
}


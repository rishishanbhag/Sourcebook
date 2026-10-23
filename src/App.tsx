import { useEffect, useState } from 'react';
import { DbCtx } from './Fact';
import type { Db } from './types';
import { Muted, Tabs } from './components/ui';
import Overview from './pages/Overview';
import Registry from './pages/Registry';
import CityPack from './pages/CityPack';
import Compare from './pages/Compare';
import Incentives from './pages/Incentives';
import Providers from './pages/Providers';
import Method from './pages/Method';

const TABS = {
  Overview, Registry, 'City pack': CityPack, 'Compare cities': Compare, 'State incentives': Incentives, Providers, Method,
};
type Tab = keyof typeof TABS;

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  useEffect(() => {
    fetch('/db.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('run npm run build:data'))))
      .then(setDb, (e) => setError(String(e)));
  }, []);
  if (error) return <main className="mx-auto max-w-6xl px-4 py-6"><p className="font-semibold">Could not load db.json: {error}</p></main>;
  if (!db) return <main className="mx-auto max-w-6xl px-4 py-6"><Muted>Loading...</Muted></main>;
  const Page = TABS[tab];
  return (
    <DbCtx.Provider value={db}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="font-serif text-2xl font-semibold">India GCC Registry</h1>
          <Muted>Private draft. Every figure shows its source. Built {db.generated_at.slice(0, 16).replace('T', ' ')} UTC.</Muted>
        </header>
        <Tabs tabs={Object.keys(TABS) as Tab[]} current={tab} onChange={setTab} />
        <Page />
        <footer className="mt-12 border-t border-neutral-200 pt-4">
          <Muted>Figures come from public sources and are shown as reported. Check the original before relying on them. This is not legal or investment advice.</Muted>
        </footer>
      </main>
    </DbCtx.Provider>
  );
}

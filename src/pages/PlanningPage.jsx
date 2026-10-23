import { lazy, useState } from 'react';
import { collections } from './collections.js';

const CollectionPage = lazy(() => import('./CollectionPage.jsx'));

const sections = [
  ['areas', 'مجالات الحياة'], ['goals', 'الأهداف'], ['projects', 'المشاريع'],
];
export default function PlanningPage({ language, onUnauthorized }) {
  const [section, setSection] = useState('projects');
  return <>
    <section className="page-card">
      <header className="page-heading"><div><h1>التخطيط</h1><p>قسّم أهدافك إلى مجالات ومشاريع قابلة للتنفيذ.</p></div></header>
      <div className="record-actions">{sections.map(([key, label]) => <button className={`button ${section === key ? 'button-primary' : 'button-quiet'}`} key={key} onClick={() => setSection(key)}>{label}</button>)}</div>
    </section>
    <CollectionPage config={collections[section]} language={language} onUnauthorized={onUnauthorized} />
  </>;
}

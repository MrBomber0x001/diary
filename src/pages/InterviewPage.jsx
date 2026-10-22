import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';
import { useLocation } from '../navigation.jsx';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import CollectionPage from './CollectionPage.jsx';
import { collections } from './collections.js';

const topicFields = [{ key: 'title', label: 'موضوع التدريب', required: true }];
const cardFields = [
  { key: 'question', label: 'السؤال', type: 'textarea', wide: true, required: true },
  { key: 'answer', label: 'الإجابة', type: 'textarea', wide: true, required: true },
];
const roundFields = [
  { key: 'round_name', label: 'اسم الجولة' },
  { key: 'occurred_on', label: 'تاريخ المقابلة', type: 'date' },
  { key: 'scheduled_start', label: 'موعد البداية', type: 'datetime-local' },
  { key: 'scheduled_end', label: 'موعد النهاية', type: 'datetime-local' },
  { key: 'questions_answers', label: 'الأسئلة والإجابات', type: 'textarea', wide: true },
  { key: 'questions_for_them', label: 'أسئلة لطرحها', type: 'textarea', wide: true },
  { key: 'experience', label: 'الخبرة والدروس', type: 'textarea', wide: true },
  { key: 'follow_up', label: 'المتابعة', type: 'textarea', wide: true },
];

export default function InterviewPage({ language, onUnauthorized }) {
  const location = useLocation();
  const [section, setSection] = useState('applications');
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState(null);
  const [application, setApplication] = useState(null);
  const [editingRound, setEditingRound] = useState(null);
  const [showAnswer, setShowAnswer] = useState({});
  const [adding, setAdding] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [cardSearch, setCardSearch] = useState('');
  const [cardPage, setCardPage] = useState(0);
  const [error, setError] = useState('');
  const t = messages[language];
  const loadTopics = useCallback(async () => {
    try { setTopics(await api('/interviews/mock')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { loadTopics(); }, [loadTopics]);
  useEffect(() => {
    const applicationId = new URLSearchParams(location.split('?')[1] || '').get('application');
    if (!applicationId || !/^\d+$/.test(applicationId)) return;
    let active = true;
    api('/interviews').then(rows => {
      if (!active) return;
      const match = rows.find(row => String(row.id) === applicationId);
      if (match) {
        setSection('applications');
        setApplication(match);
      } else setError(language === 'ar' ? 'طلب التوظيف المرتبط غير موجود.' : 'The linked job application was not found.');
    }).catch(failure => {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    });
    return () => { active = false; };
  }, [language, location, onUnauthorized]);

  async function openTopic(row) {
    try { const result = await api(`/interviews/topics/${row.id}/cards`); setTopic({ ...row, cards: result.cards || [] }); setShowAnswer({}); setQuiz(null); setCardPage(0); setCardSearch(''); }
    catch (failure) { setError(failure.message); }
  }
  async function addTopic(value) {
    try { const row = await api('/interviews/topics', { method: 'POST', body: value }); setAdding(false); await loadTopics(); await openTopic(row); }
    catch (failure) { setError(failure.message); }
  }
  async function addCard(value) {
    try {
      await api(`/interviews/topics/${topic.id}/cards`, { method: 'POST', body: value });
      setTopic(current => ({ ...current, cards: [...current.cards, value] }));
      setAdding(false);
      await openTopic(topic);
    } catch (failure) { setError(failure.message); }
  }
  async function startQuiz() {
    try { const result = await api(`/interviews/topics/${topic.id}/quiz?count=10`); setQuiz({ ...result, current: 0 }); }
    catch (failure) { setError(failure.message); }
  }
  async function reloadApplication(id) {
    const rows = await api('/interviews');
    setApplication(rows.find(row => row.id === id) || null);
  }
  async function saveRound(value) {
    try {
      await api(editingRound?.id
        ? `/interviews/${application.id}/rounds/${editingRound.id}`
        : `/interviews/${application.id}/rounds`, { method: editingRound?.id ? 'PUT' : 'POST', body: value });
      setEditingRound(null);
      await reloadApplication(application.id);
    } catch (failure) { setError(failure.message); }
  }
  async function deleteRound(roundId) {
    try { await api(`/interviews/${application.id}/rounds/${roundId}`, { method: 'DELETE' }); await reloadApplication(application.id); }
    catch (failure) { setError(failure.message); }
  }
  async function deleteCard(cardId) {
    try {
      await api(`/interviews/topics/${topic.id}/cards/${cardId}`, { method: 'DELETE' });
      setTopic(current => ({ ...current, cards: current.cards.filter(card => card.id !== cardId) }));
      await loadTopics();
    } catch (failure) { setError(failure.message); }
  }
  return <>
    <section className="page-card">
      <header className="page-heading"><div><p className="eyebrow">CAREER WORKSPACE</p><h1>{t.interviews}</h1><p>نظّم فرصك، واستعد للمقابلة بخطة واضحة.</p></div></header>
      <div className="interview-tabs" role="tablist" aria-label="أقسام المقابلات">
        <button role="tab" aria-selected={section === 'applications'} className={`interview-tab ${section === 'applications' ? 'active' : ''}`} onClick={() => setSection('applications')}><span aria-hidden="true">▣</span> طلبات التوظيف</button>
        <button role="tab" aria-selected={section === 'cards'} className={`interview-tab ${section === 'cards' ? 'active' : ''}`} onClick={() => setSection('cards')}><span aria-hidden="true">✧</span> محاكاة المقابلات</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
    {section === 'applications' ? application ? <section className="page-card application-detail">
      <header className="page-heading"><div><button className="button button-quiet" onClick={() => { setApplication(null); setEditingRound(null); }}>← العودة للطلبات</button><p className="eyebrow">APPLICATION DETAILS</p><h2>{application.company}</h2><p>{application.role} · {application.applied_on || ''}</p></div>
        <span className={`application-status ${application.status}`}>{({ applied: 'تم التقديم', screening: 'فرز أولي', interviewing: 'مقابلات', offer: 'عرض وظيفي', rejected: 'مرفوض', withdrawn: 'منسحب' })[application.status] || application.status}</span></header>
      {application.job_url && <a href={application.job_url} target="_blank" rel="noreferrer">رابط الوظيفة</a>}
      <p>{application.notes}</p>
      <button className="button button-primary" onClick={() => setEditingRound({})}>＋ جولة مقابلة</button>
      {editingRound !== null && <Editor fields={roundFields} value={editingRound} language={language} onSubmit={saveRound} onCancel={() => setEditingRound(null)} onUnauthorized={onUnauthorized} />}
      <div className="interview-round-list">{(application.rounds || []).map((round, index) => <article className="interview-round" key={round.id}>
        <span className="round-index">{String(index + 1).padStart(2, '0')}</span><div className="interview-round-content">
          <header><div><h3>{round.round_name || `الجولة ${index + 1}`}</h3><time>{round.scheduled_start || round.occurred_on || ''}</time></div><div className="record-actions"><ActionIcon action="edit" label={`تعديل الجولة: ${round.round_name || index + 1}`} onClick={() => setEditingRound(round)} /><ActionIcon action="delete" label={`حذف الجولة: ${round.round_name || index + 1}`} onClick={() => deleteRound(round.id)} /></div></header>
          <div className="round-notes-grid">
            {round.questions_answers && <section><h4>أسئلة المقابلة وإجاباتك</h4><p>{round.questions_answers}</p></section>}
            {round.questions_for_them && <section><h4>أسئلة تطرحها عليهم</h4><p>{round.questions_for_them}</p></section>}
            {round.experience && <section><h4>ملاحظاتك وما تعلمته</h4><p>{round.experience}</p></section>}
            {round.follow_up && <section><h4>الخطوة التالية</h4><p>{round.follow_up}</p></section>}
          </div>
        </div>
      </article>)}</div>
    </section> : <CollectionPage config={{ ...collections.interviews, open: setApplication }} language={language} onUnauthorized={onUnauthorized} /> : (
      <section className="page-card">
        <header className="page-heading"><div><p className="eyebrow">PRACTICE DECKS</p><h2>{topic?.title || 'موضوعات التدريب'}</h2><p>{topic ? `${topic.cards?.length || 0} بطاقة — رتّبها حسب حاجتك وابدأ جولة تدريب قصيرة.` : 'أنشئ مجموعة لكل مجال، مثل تصميم الأنظمة أو قواعد البيانات.'}</p></div>
          {topic ? <button className="button button-quiet" onClick={() => { setTopic(null); setQuiz(null); }}>كل الموضوعات</button> :
            <button className="button button-primary" onClick={() => setAdding(true)}>＋ موضوع</button>}
        </header>
        {adding && <Editor fields={topic ? cardFields : topicFields} language={language} onSubmit={topic ? addCard : addTopic} onCancel={() => setAdding(false)} onUnauthorized={onUnauthorized} />}
        {!topic ? <div className="topic-grid">{topics.map((row, index) => <button className="topic-deck" type="button" key={row.id} onClick={() => openTopic(row)}>
          <span className="topic-deck-icon" aria-hidden="true">{['◈', '⌘', '⌁', '✧'][index % 4]}</span><span className="topic-deck-copy"><strong>{row.title}</strong><small>{row.card_count} بطاقة تدريبية</small></span><span className="topic-deck-arrow" aria-hidden="true">←</span>
        </button>)}</div> : <>
          <div className="record-actions"><button className="button button-primary" onClick={startQuiz}>ابدأ الاختبار</button><button className="button button-quiet" onClick={() => setAdding(true)}>＋ بطاقة</button></div>
          {quiz && <article className="quiz-card">
            {quiz.cards.length ? <>
              <div className="quiz-progress-heading"><span>جلسة تدريبية</span><strong>{quiz.current + 1} / {quiz.total}</strong></div>
              <div className="quiz-progress-track"><span style={{ width: `${(quiz.current + 1) / quiz.total * 100}%` }} /></div>
              <h3>{quiz.cards[quiz.current]?.question}</h3>
              {showAnswer.quiz && <p className="quiz-answer">{quiz.cards[quiz.current]?.answer}</p>}
              <div className="record-actions">
                <button className="button button-quiet" onClick={() => setShowAnswer(current => ({ ...current, quiz: !current.quiz }))}>{showAnswer.quiz ? 'إخفاء الإجابة' : 'عرض الإجابة'}</button>
                <button className="button button-primary" onClick={() => { setShowAnswer({}); setQuiz(current => current.current + 1 < current.total ? { ...current, current: current.current + 1 } : null); }}>{quiz.current + 1 < quiz.total ? 'السؤال التالي' : 'إنهاء الاختبار'}</button>
              </div>
            </> : <p>أضف بطاقات لهذا الموضوع قبل بدء الاختبار.</p>}
          </article>}
          <div className="flashcard-library-heading"><div><h3>مكتبة البطاقات</h3><p>{topic.cards.length} بطاقة في هذا الموضوع</p></div><input aria-label="ابحث في البطاقات" placeholder="ابحث في الأسئلة…" value={cardSearch} onChange={event => { setCardSearch(event.target.value); setCardPage(0); }} /></div>
          {(() => {
            const matchedCards = topic.cards.filter(card => `${card.question} ${card.answer}`.toLocaleLowerCase().includes(cardSearch.toLocaleLowerCase()));
            const pages = Math.ceil(matchedCards.length / 12);
            return <>
              <div className="flashcard-grid">{matchedCards.slice(cardPage * 12, cardPage * 12 + 12).map((card, index) => {
                const cardIndex = cardPage * 12 + index;
                return <article className="flashcard" key={card.id || cardIndex}>
                  <div className="flashcard-label"><span>بطاقة {cardIndex + 1}</span><ActionIcon action="delete" label={`حذف البطاقة ${cardIndex + 1}`} onClick={() => deleteCard(card.id)} /></div>
                  <h4>{card.question}</h4>
                  {showAnswer[cardIndex] && <p>{card.answer}</p>}
                  <button className="flashcard-reveal" onClick={() => setShowAnswer(current => ({ ...current, [cardIndex]: !current[cardIndex] }))}>{showAnswer[cardIndex] ? 'إخفاء الإجابة ↑' : 'عرض الإجابة ↓'}</button>
                </article>;
              })}</div>
              {pages > 1 && <div className="flashcard-pagination"><button className="button button-quiet" disabled={cardPage === 0} onClick={() => setCardPage(page => page - 1)}>السابق</button><span>{cardPage + 1} من {pages}</span><button className="button button-quiet" disabled={cardPage + 1 === pages} onClick={() => setCardPage(page => page + 1)}>التالي</button></div>}
              {!matchedCards.length && <p className="notice">لا توجد بطاقات تطابق هذا البحث.</p>}
            </>;
          })()}
        </>}
      </section>
    )}
  </>;
}

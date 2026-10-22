import { useCallback, useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import { Link } from '../navigation.jsx';

const TRANSACTIONS_PER_PAGE = 10;
const SUBSCRIPTIONS_PER_PAGE = 6;
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const financeAIOptions = [
  { key: 'spending', ar: 'الإنفاق والتصنيفات', en: 'Spending and categories' },
  { key: 'budgets', ar: 'الميزانيات', en: 'Budgets' },
  { key: 'subscriptions', ar: 'الاشتراكات', en: 'Subscriptions' },
  { key: 'cashflow', ar: 'التدفق النقدي', en: 'Cash flow' },
];

const transactionFields = [
  { key: 'type', label: 'النوع', type: 'select', options: ['expense', 'income'] },
  { key: 'description', label: 'الوصف', required: true },
  { key: 'amount', label: 'المبلغ', type: 'number', min: 0.01, required: true },
  { key: 'category', label: 'التصنيف' },
  { key: 'transaction_date', label: 'التاريخ', type: 'date', defaultValue: todayDate() },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
];
const subscriptionFields = [
  { key: 'name', label: 'الاشتراك', required: true },
  { key: 'amount', label: 'المبلغ', type: 'number', min: 0.01, required: true },
  { key: 'billing_cycle', label: 'دورة الدفع', type: 'select', options: ['monthly', 'yearly'] },
  { key: 'next_renewal_date', label: 'التجديد القادم', type: 'date', required: true },
  { key: 'category', label: 'التصنيف' },
  { key: 'status', label: 'الحالة', type: 'select', options: ['active', 'paused', 'cancelled'] },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
];
const budgetFields = [
  { key: 'month', label: 'الشهر', type: 'month', required: true },
  { key: 'category', label: 'التصنيف', required: true },
  { key: 'amount', label: 'المبلغ', type: 'number', min: 0.01, required: true },
];

export default function FinancePage({ language, onUnauthorized }) {
  const [finance, setFinance] = useState(null);
  const [editing, setEditing] = useState('');
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionPage, setTransactionPage] = useState(1);
  const [subscriptionSort, setSubscriptionSort] = useState('renewal');
  const [subscriptionFilter, setSubscriptionFilter] = useState('active');
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [monthLoading, setMonthLoading] = useState(false);
  const [financeAI, setFinanceAI] = useState(null);
  const [financeAIReport, setFinanceAIReport] = useState(null);
  const [financeAIScopes, setFinanceAIScopes] = useState(financeAIOptions.map(option => option.key));
  const [financeAIHistoryPage, setFinanceAIHistoryPage] = useState(1);
  const [financeAIConsent, setFinanceAIConsent] = useState(false);
  const [financeAIBusy, setFinanceAIBusy] = useState(false);
  const [error, setError] = useState('');
  const [financeAIError, setFinanceAIError] = useState('');
  const t = messages[language];
  const load = useCallback(async () => {
    try { setFinance(await api('/finance')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);
  const loadFinanceAI = useCallback(async () => {
    try { setFinanceAI(await api('/finance/ai/reports')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setFinanceAIError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { loadFinanceAI(); }, [loadFinanceAI]);

  async function save(path, method, value) {
    setError('');
    try { await api(path, { method, body: value }); setEditing(''); await load(); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }
  async function remove(path) {
    try { await api(path, { method: 'DELETE' }); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function analyzeFinances() {
    if (!finance || !financeAIConsent || !financeAIScopes.length || financeAIBusy) return;
    setFinanceAIBusy(true);
    setFinanceAIError('');
    setFinanceAIReport(null);
    try {
      const report = await api('/finance/ai/analyze', {
        method: 'POST',
        body: { month: finance.month, scopes: financeAIScopes, language, confirmDataSharing: financeAIConsent },
      });
      setFinanceAIReport(report);
      setFinanceAI(current => ({ ...current, reports: [report, ...(current?.reports || []).filter(item => item.id !== report.id)].slice(0, 20) }));
      setFinanceAIHistoryPage(1);
      setFinanceAIConsent(false);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setFinanceAIError(failure.message);
    } finally {
      setFinanceAIBusy(false);
    }
  }
  async function deleteFinanceReport(id) {
    try {
      await api(`/finance/ai/reports/${id}`, { method: 'DELETE' });
      setFinanceAI(current => ({ ...current, reports: current.reports.filter(report => report.id !== id) }));
      if (financeAIReport?.id === id) setFinanceAIReport(null);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setFinanceAIError(failure.message);
    }
  }
  async function changeMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setMonthLoading(true);
    setError('');
    try {
      setFinance(await api(`/finance?month=${month}`));
      setTransactionPage(1);
      setSubscriptionPage(1);
      setFinanceAIConsent(false);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setMonthLoading(false);
    }
  }
  if (!finance) return <section className="page-card">{error || t.loading}</section>;
  const { summary, transactions, subscriptions, budgets, currency, trends = [] } = finance;
  const money = amount => new Intl.NumberFormat(language === 'ar' ? 'ar' : 'en', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(Number(amount || 0));
  const summaryCards = [
    ['income', language === 'ar' ? 'الدخل' : 'Income', '＋'],
    ['expenses', language === 'ar' ? 'المصروفات' : 'Expenses', '−'],
    ['balance', language === 'ar' ? 'الرصيد' : 'Balance', '＝'],
    ['monthlySubscriptions', language === 'ar' ? 'الاشتراكات الشهرية' : 'Monthly subscriptions', '↻'],
  ];
  const categoryTotals = transactions.filter(row => row.type === 'expense').reduce((totals, row) => {
    const category = row.category || (language === 'ar' ? 'أخرى' : 'Other');
    totals[category] = (totals[category] || 0) + Number(row.amount);
    return totals;
  }, {});
  const largestCategory = Math.max(1, ...Object.values(categoryTotals));
  const visibleTransactions = transactions.filter(row => {
    if (transactionFilter === 'all') return true;
    if (transactionFilter === 'subscription') {
      const text = `${row.category || ''} ${row.description || ''}`.toLocaleLowerCase();
      return Boolean(row.subscription_id) || /subscription|اشتراك/.test(text);
    }
    return row.type === transactionFilter;
  }).filter(row => !transactionSearch.trim()
    || `${row.description} ${row.category}`.toLocaleLowerCase(language === 'ar' ? 'ar' : 'en')
      .includes(transactionSearch.trim().toLocaleLowerCase(language === 'ar' ? 'ar' : 'en')))
    .sort((a, b) => String(b.transaction_date || '').localeCompare(String(a.transaction_date || '')) || b.id - a.id);
  const totalPages = Math.max(1, Math.ceil(visibleTransactions.length / TRANSACTIONS_PER_PAGE));
  const currentPage = Math.min(transactionPage, totalPages);
  const pagedTransactions = visibleTransactions.slice((currentPage - 1) * TRANSACTIONS_PER_PAGE, currentPage * TRANSACTIONS_PER_PAGE);
  const [selectedYear, selectedMonth] = finance.month.split('-').map(Number);
  const years = Array.from({ length: 9 }, (_, index) => selectedYear - 4 + index);
  const formatMonth = value => {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1, 12));
  };
  const monthLabel = formatMonth(finance.month);
  const shiftMonth = offset => {
    const next = new Date(selectedYear, selectedMonth - 1 + offset, 1, 12);
    changeMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    if (subscriptionSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), language === 'ar' ? 'ar' : 'en');
    if (subscriptionSort === 'amount') return Number(b.amount) - Number(a.amount);
    return String(a.next_renewal_date || '').localeCompare(String(b.next_renewal_date || ''));
  });
  const visibleSubscriptions = sortedSubscriptions.filter(row => subscriptionFilter === 'all' || row.status === 'active');
  const subscriptionPages = Math.max(1, Math.ceil(visibleSubscriptions.length / SUBSCRIPTIONS_PER_PAGE));
  const currentSubscriptionPage = Math.min(subscriptionPage, subscriptionPages);
  const pagedSubscriptions = visibleSubscriptions.slice((currentSubscriptionPage - 1) * SUBSCRIPTIONS_PER_PAGE,
    currentSubscriptionPage * SUBSCRIPTIONS_PER_PAGE);
  const monthShort = value => new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { month: 'short' })
    .format(new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1, 12));
  const maxTrendAmount = Math.max(1, ...trends.flatMap(row => [Number(row.income), Number(row.expenses)]));
  const trendPoints = key => trends.map((row, index) => `${35 + index * 106},${176 - (Number(row[key]) / maxTrendAmount) * 140}`).join(' ');
  const previousTrend = trends.at(-2);
  const financeAIHistoryPages = Math.max(1, Math.ceil((financeAI?.reports?.length || 0) / 4));
  const currentFinanceAIHistoryPage = Math.min(financeAIHistoryPage, financeAIHistoryPages);
  const pagedFinanceAIReports = (financeAI?.reports || []).slice((currentFinanceAIHistoryPage - 1) * 4, currentFinanceAIHistoryPage * 4);
  const expenseChange = previousTrend?.expenses > 0
    ? Math.round(((summary.expenses - previousTrend.expenses) / previousTrend.expenses) * 100)
    : null;
  const scopeLabels = Object.fromEntries(financeAIOptions.map(option => [option.key, language === 'ar' ? option.ar : option.en]));
  return (
    <section className="page-card workspace-section finance-page">
      <header className="page-heading finance-heading"><div><span className="finance-eyebrow">{language === 'ar' ? 'صورة أوضح لأموالك' : 'YOUR MONEY, IN FOCUS'}</span><h1>{t.finance}</h1><p>{language === 'ar' ? 'تابع تدفق أموالك وميزانياتك والتزاماتك من مكان واحد.' : 'Track your cash flow, budgets, and recurring commitments in one place.'}</p></div>
        <div className="finance-month-picker" aria-label={language === 'ar' ? 'اختيار الشهر' : 'Choose month'}>
          <button className="icon-button" type="button" aria-label={language === 'ar' ? 'الشهر السابق' : 'Previous month'} disabled={monthLoading} onClick={() => shiftMonth(-1)}>‹</button>
          <label><span className="sr-only">{language === 'ar' ? 'الشهر' : 'Month'}</span>
            <select value={selectedMonth} disabled={monthLoading} onChange={event => changeMonth(`${selectedYear}-${String(Number(event.target.value)).padStart(2, '0')}`)}>
              {MONTHS.map(month => <option key={month} value={month}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { month: 'long' }).format(new Date(2020, month - 1, 1, 12))}</option>)}
            </select>
          </label>
          <label><span className="sr-only">{language === 'ar' ? 'السنة' : 'Year'}</span>
            <select value={selectedYear} disabled={monthLoading} onChange={event => changeMonth(`${event.target.value}-${String(selectedMonth).padStart(2, '0')}`)}>
              {years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <button className="icon-button" type="button" aria-label={language === 'ar' ? 'الشهر التالي' : 'Next month'} disabled={monthLoading} onClick={() => shiftMonth(1)}>›</button>
        </div>
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {financeAIError && <p className="notice error" role="alert">{financeAIError}</p>}
      <div className="finance-summary">
        {summaryCards.map(([key, label, icon]) => <article className={`finance-summary-card finance-${key}`} key={key}>
          <span className="finance-summary-top"><span className="finance-summary-label">{label}</span><span className="finance-summary-icon" aria-hidden="true">{icon}</span></span>
          <strong>{money(summary[key])}</strong>
          {key === 'expenses' && expenseChange !== null && <small className={`finance-month-change ${expenseChange > 0 ? 'higher' : 'lower'}`}>
            {expenseChange > 0 ? '↑' : expenseChange < 0 ? '↓' : '→'} {Math.abs(expenseChange)}% {language === 'ar' ? 'مقارنة بالشهر السابق' : 'vs previous month'}
          </small>}
          {key === 'balance' && <small className="finance-summary-caption">{language === 'ar' ? 'الدخل ناقص المصروفات' : 'Income minus expenses'}</small>}
        </article>)}
      </div>
      <div className="finance-dashboard-grid">
        <section className="finance-dashboard-card finance-trend-card">
          <header className="finance-section-heading">
            <div><h2>{language === 'ar' ? 'اتجاه التدفق النقدي' : 'Cash-flow trend'}</h2><p>{language === 'ar' ? 'الدخل والمصروفات خلال آخر ٦ أشهر' : 'Income and expenses over the last 6 months'}</p></div>
            <div className="finance-chart-legend"><span className="income-dot">{language === 'ar' ? 'الدخل' : 'Income'}</span><span className="expense-dot">{language === 'ar' ? 'المصروفات' : 'Expenses'}</span></div>
          </header>
          {trends.some(row => row.income || row.expenses) ? <div className="finance-trend-chart">
            <svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img"
              aria-label={language === 'ar' ? 'مخطط اتجاه الدخل والمصروفات لستة أشهر' : 'Six-month income and expense trend chart'}>
              {[36, 78, 120, 162].map(y => <line key={y} x1="25" x2="575" y1={y} y2={y} className="finance-chart-gridline" />)}
              <polyline points={trendPoints('income')} className="finance-chart-line income-line" />
              <polyline points={trendPoints('expenses')} className="finance-chart-line expense-line" />
              {trends.map((row, index) => <g key={row.month}>
                <circle cx={35 + index * 106} cy={176 - (Number(row.income) / maxTrendAmount) * 140} r="4" className="finance-chart-point income-point"><title>{`${monthShort(row.month)} · ${language === 'ar' ? 'الدخل' : 'Income'}: ${money(row.income)}`}</title></circle>
                <circle cx={35 + index * 106} cy={176 - (Number(row.expenses) / maxTrendAmount) * 140} r="4" className="finance-chart-point expense-point"><title>{`${monthShort(row.month)} · ${language === 'ar' ? 'المصروفات' : 'Expenses'}: ${money(row.expenses)}`}</title></circle>
              </g>)}
            </svg>
            <div className="finance-chart-months">{trends.map(row => <span key={row.month}>{monthShort(row.month)}</span>)}</div>
          </div> : <p className="finance-chart-empty">{language === 'ar' ? 'أضف عملياتك المالية لعرض الاتجاهات الشهرية.' : 'Add transactions to see your monthly trend.'}</p>}
        </section>
        <section className="finance-dashboard-card finance-ai-card">
          <header className="finance-ai-heading"><span aria-hidden="true">✦</span><div><span className="finance-eyebrow">{language === 'ar' ? 'مساعدك المالي' : 'YOUR FINANCE COACH'}</span>
            <h2>{language === 'ar' ? 'حلّل إنفاقي' : 'Analyze my finances'}</h2></div></header>
          <p>{language === 'ar' ? 'احصل على ملاحظات عملية مبنية على اتجاهاتك وميزانياتك واشتراكاتك.' : 'Get practical observations based on your trends, budgets, and subscriptions.'}</p>
          {!financeAI?.configured || !financeAI?.encryptionReady ? <div className="finance-ai-connect">
            <span>{financeAI?.configured && !financeAI.encryptionReady
              ? (language === 'ar' ? 'يتطلب الاتصال إعداد سر التشفير على الخادم.' : 'The server encryption secret must be configured to use AI.')
              : (language === 'ar' ? 'اربط مزود الذكاء الاصطناعي في الإعدادات للبدء.' : 'Connect your AI provider in Settings to get started.')}</span>
            <Link className="button button-quiet" to="/?view=settings">{language === 'ar' ? 'الإعدادات' : 'Settings'}</Link>
          </div> : <>
            <fieldset className="finance-ai-scopes"><legend>{language === 'ar' ? 'ما الذي تريد تحليله؟' : 'What should it analyze?'}</legend>
              {financeAIOptions.map(option => <label key={option.key}><input type="checkbox" checked={financeAIScopes.includes(option.key)}
                onChange={event => {
                  setFinanceAIScopes(current => event.target.checked
                    ? [...current, option.key]
                    : current.filter(scope => scope !== option.key));
                  setFinanceAIConsent(false);
                  setFinanceAIReport(null);
                }} /><span>{language === 'ar' ? option.ar : option.en}</span></label>)}
            </fieldset>
            <p className="finance-ai-data-note">{language === 'ar'
              ? `تتضمن المشاركة مجاميع شهرية وتصنيفات الفئات المحددة. عند اختيار الاشتراكات، تُرسل أسماء الاشتراكات النشطة وتصنيفاتها ومبالغها ودوراتها ومواعيد تجديدها. لا تُرسل أوصاف العمليات أو ملاحظاتها.`
              : 'Sharing includes monthly totals and selected category data. If subscriptions are selected, their names, categories, amounts, billing cycles, and renewal dates are included. Transaction descriptions and notes are never shared.'}</p>
            <label className="finance-ai-consent"><input type="checkbox" checked={financeAIConsent} onChange={event => setFinanceAIConsent(event.target.checked)} />
              <span>{language === 'ar'
                ? `أوافق على إرسال البيانات والمجالات المحددة أعلاه إلى مزود الذكاء الاصطناعي لتحليل فترة الستة أشهر المنتهية في ${monthLabel}.`
                : `I consent to sending the selected data and analysis areas above to my AI provider for the six-month period ending ${monthLabel}.`}</span>
            </label>
            <button className="button button-primary finance-ai-run" type="button" disabled={!financeAIConsent || !financeAIScopes.length || financeAIBusy}
              onClick={analyzeFinances}>{financeAIBusy ? (language === 'ar' ? 'جارٍ التحليل…' : 'Analyzing…') : (language === 'ar' ? 'أنشئ تحليلاً' : 'Generate analysis')}</button>
          </>}
          <p className="finance-ai-privacy">{language === 'ar' ? 'يتطلب كل تحليل موافقتك. تُحفظ التقارير في حسابك ويمكن حذفها. الملاحظات تعليمية وليست نصيحة مالية مهنية.' : 'Each analysis requires your consent. Reports are saved to your account and can be deleted. Insights are educational, not professional financial advice.'}</p>
          {financeAIReport && <article className="finance-ai-report" aria-live="polite">
            <span className="finance-report-period">{formatMonth(financeAIReport.month)} · {financeAIReport.scopes.map(scope => scopeLabels[scope]).join(' · ')}</span>
            <h3>{language === 'ar' ? 'ملخص التحليل' : 'Analysis summary'}</h3><p dir="auto">{financeAIReport.report.overview}</p>
            {!!financeAIReport.report.observations.length && <><h4>{language === 'ar' ? 'ملاحظات' : 'Observations'}</h4><ul>{financeAIReport.report.observations.map((item, index) => <li dir="auto" key={index}>{item}</li>)}</ul></>}
            {!!financeAIReport.report.actions.length && <><h4>{language === 'ar' ? 'خطوات عملية' : 'Practical actions'}</h4><ul>{financeAIReport.report.actions.map((item, index) => <li dir="auto" key={index}><strong>{item.category && `${item.category}: `}</strong>{item.action}</li>)}</ul></>}
            {!!financeAIReport.report.watchouts.length && <><h4>{language === 'ar' ? 'تنبيهات' : 'Watch-outs'}</h4><ul>{financeAIReport.report.watchouts.map((item, index) => <li dir="auto" key={index}>{item}</li>)}</ul></>}
          </article>}
          {!!financeAI?.reports?.length && <div className="finance-ai-history"><h3>{language === 'ar' ? 'تحليلات سابقة' : 'Previous analyses'}</h3>
            {pagedFinanceAIReports.map(report => <div className="finance-ai-history-row" key={report.id}>
              <button type="button" onClick={() => setFinanceAIReport(report)}><span>{report.month}</span><strong>{report.report.overview}</strong></button>
              <ActionIcon action="delete" label={language === 'ar' ? `حذف تحليل ${report.month}` : `Delete ${report.month} analysis`} onClick={() => deleteFinanceReport(report.id)} />
            </div>)}
            {financeAIHistoryPages > 1 && <nav className="finance-ai-history-pagination" aria-label={language === 'ar' ? 'صفحات التحليلات المالية' : 'Finance report pages'}>
              <button type="button" disabled={currentFinanceAIHistoryPage <= 1} onClick={() => setFinanceAIHistoryPage(page => Math.max(1, page - 1))}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
              <span>{currentFinanceAIHistoryPage} / {financeAIHistoryPages}</span>
              <button type="button" disabled={currentFinanceAIHistoryPage >= financeAIHistoryPages} onClick={() => setFinanceAIHistoryPage(page => Math.min(financeAIHistoryPages, page + 1))}>{language === 'ar' ? 'التالي' : 'Next'}</button>
            </nav>}
          </div>}
        </section>
      </div>
      <div className="record-actions">
        <button className="button button-primary" onClick={() => setEditing('transaction')}>＋ {language === 'ar' ? 'عملية مالية' : 'Transaction'}</button>
        <button className="button button-quiet" onClick={() => setEditing('subscription')}>＋ {language === 'ar' ? 'اشتراك' : 'Subscription'}</button>
        <button className="button button-quiet" onClick={() => setEditing('budget')}>＋ {language === 'ar' ? 'ميزانية' : 'Budget'}</button>
      </div>
      {editing && <Editor fields={editing === 'transaction' ? transactionFields : editing === 'subscription' ? subscriptionFields : budgetFields} language={language}
        onSubmit={value => save(editing === 'transaction' ? '/finance/transactions' : editing === 'subscription' ? '/finance/subscriptions' : '/finance/budgets', editing === 'budget' ? 'PUT' : 'POST', value)}
        onCancel={() => setEditing('')} onUnauthorized={onUnauthorized} />}
      <section className="finance-section">
        <header className="finance-section-heading"><div><h2>{language === 'ar' ? 'العمليات المالية' : 'Transactions'}</h2><p>{language === 'ar' ? 'حركة الأموال خلال هذا الشهر' : 'Money movement this month'}</p></div>
          <div className="task-filter-row">
            {[['all', language === 'ar' ? 'الكل' : 'All'], ['expense', language === 'ar' ? 'مصروفات' : 'Expenses'], ['income', language === 'ar' ? 'دخل' : 'Income'], ['subscription', language === 'ar' ? 'الاشتراكات' : 'Subscriptions']].map(([key, label]) =>
              <button key={key} className={`task-filter ${transactionFilter === key ? 'active' : ''}`} onClick={() => { setTransactionFilter(key); setTransactionPage(1); }}>{label}</button>)}
          </div>
        </header>
        <label className="finance-transaction-search"><span className="sr-only">{language === 'ar' ? 'ابحث في العمليات' : 'Search transactions'}</span>
          <input type="search" value={transactionSearch} placeholder={language === 'ar' ? 'ابحث بالوصف أو التصنيف…' : 'Search description or category…'}
            onChange={event => { setTransactionSearch(event.target.value); setTransactionPage(1); }} />
        </label>
        <div className="finance-transaction-list">{pagedTransactions.map(row => <article className="finance-transaction" key={row.id}>
          <span className={`finance-transaction-icon ${row.type}`} aria-hidden="true">{row.type === 'income' ? '↙' : '↗'}</span>
          <div className="finance-transaction-copy"><strong>{row.description}</strong><span>{[row.category, row.transaction_date].filter(Boolean).join(' · ')}</span></div>
          <strong className={`finance-amount ${row.type}`}>{row.type === 'income' ? '+' : '−'}{money(row.amount)}</strong>
          <ActionIcon action="delete" label={`${t.delete}: ${row.description}`} onClick={() => remove(`/finance/transactions/${row.id}`)} />
        </article>)}
        {!visibleTransactions.length && <p className="notice">{language === 'ar' ? 'لا توجد عمليات في هذا الشهر.' : 'No transactions for this month.'}</p>}</div>
        {visibleTransactions.length > TRANSACTIONS_PER_PAGE && <nav className="finance-pagination" aria-label={language === 'ar' ? 'صفحات العمليات' : 'Transaction pages'}>
          <button className="button button-quiet" type="button" disabled={currentPage <= 1} onClick={() => setTransactionPage(page => Math.max(1, page - 1))}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
          <span>{language === 'ar' ? `صفحة ${currentPage} من ${totalPages}` : `Page ${currentPage} of ${totalPages}`} · {visibleTransactions.length}</span>
          <button className="button button-quiet" type="button" disabled={currentPage >= totalPages} onClick={() => setTransactionPage(page => Math.min(totalPages, page + 1))}>{language === 'ar' ? 'التالي' : 'Next'}</button>
        </nav>}
      </section>
      {Object.keys(categoryTotals).length > 0 && <section className="finance-section">
        <header className="finance-section-heading"><div><h2>{language === 'ar' ? 'توزيع المصروفات' : 'Spending by category'}</h2><p>{language === 'ar' ? 'أعلى الفئات إنفاقاً هذا الشهر' : 'Top categories this month'}</p></div></header>
        <div className="finance-category-list">{Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, amount]) =>
          <div className="finance-category" key={category}><div><strong>{category}</strong><span>{money(amount)}</span></div><div className="budget-track"><span style={{ width: `${Math.max(3, amount / largestCategory * 100)}%` }} /></div></div>)}</div>
      </section>}
      <section className="finance-section finance-subscriptions-section">
      <header className="finance-section-heading finance-subscriptions-heading"><div><h2>{language === 'ar' ? 'الاشتراكات' : 'Subscriptions'}</h2><p>{language === 'ar' ? 'التجديدات القادمة وتكلفتها المتكررة' : 'Upcoming renewals and recurring costs'}</p></div>
        <div className="finance-subscription-tools">
          <label>{language === 'ar' ? 'عرض' : 'Show'} <select value={subscriptionFilter} onChange={event => { setSubscriptionFilter(event.target.value); setSubscriptionPage(1); }}>
            <option value="active">{language === 'ar' ? 'النشطة فقط' : 'Active only'}</option>
            <option value="all">{language === 'ar' ? 'كل الاشتراكات' : 'All subscriptions'}</option>
          </select></label>
          <label>{language === 'ar' ? 'ترتيب' : 'Sort'} <select value={subscriptionSort} onChange={event => setSubscriptionSort(event.target.value)}>
            <option value="renewal">{language === 'ar' ? 'موعد التجديد' : 'Renewal date'}</option>
            <option value="name">{language === 'ar' ? 'الاسم' : 'Name'}</option>
            <option value="amount">{language === 'ar' ? 'المبلغ الأعلى' : 'Highest amount'}</option>
          </select></label>
        </div>
      </header>
      <div className="record-grid">{pagedSubscriptions.map(row => <article className="record-card finance-subscription-card" key={row.id}>
        <div className="finance-subscription-card-top"><span className="finance-subscription-icon" aria-hidden="true">↻</span><span className={`finance-subscription-status ${row.status}`}>{row.status === 'active' ? (language === 'ar' ? 'نشط' : 'Active') : row.status === 'paused' ? (language === 'ar' ? 'متوقف' : 'Paused') : (language === 'ar' ? 'ملغي' : 'Cancelled')}</span></div>
        <h3>{row.name}</h3><p>{money(row.amount)} · {row.billing_cycle === 'yearly' ? (language === 'ar' ? 'سنوي' : 'Yearly') : (language === 'ar' ? 'شهري' : 'Monthly')}</p>
        <span className="finance-renewal-date">{language === 'ar' ? 'التجديد القادم' : 'Next renewal'} · {row.next_renewal_date}</span>
        <div className="record-actions">{row.status === 'active' && <button className="button button-quiet" onClick={() => save(`/finance/subscriptions/${row.id}/pay`, 'POST', { period: row.next_renewal_date })}>{language === 'ar' ? 'تسجيل الدفع' : 'Record payment'}</button>}
        <ActionIcon action="delete" label={`${t.delete}: ${row.name}`} onClick={() => remove(`/finance/subscriptions/${row.id}`)} /></div>
      </article>)}</div>
      {!pagedSubscriptions.length && <p className="notice">{language === 'ar' ? 'لا توجد اشتراكات مطابقة.' : 'No matching subscriptions.'}</p>}
      {visibleSubscriptions.length > SUBSCRIPTIONS_PER_PAGE && <nav className="finance-pagination" aria-label={language === 'ar' ? 'صفحات الاشتراكات' : 'Subscription pages'}>
        <button className="button button-quiet" type="button" disabled={currentSubscriptionPage <= 1} onClick={() => setSubscriptionPage(page => Math.max(1, page - 1))}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
        <span>{language === 'ar' ? `صفحة ${currentSubscriptionPage} من ${subscriptionPages}` : `Page ${currentSubscriptionPage} of ${subscriptionPages}`} · {visibleSubscriptions.length}</span>
        <button className="button button-quiet" type="button" disabled={currentSubscriptionPage >= subscriptionPages} onClick={() => setSubscriptionPage(page => Math.min(subscriptionPages, page + 1))}>{language === 'ar' ? 'التالي' : 'Next'}</button>
      </nav>}
      </section>
      <section className="finance-section finance-budgets-section">
      <header className="finance-section-heading"><div><h2>{language === 'ar' ? 'الميزانيات' : 'Budgets'}</h2><p>{language === 'ar' ? `مقارنة الإنفاق بحدودك لشهر ${monthLabel}` : `Spending against your limits for ${monthLabel}`}</p></div></header>
      <div className="record-grid">{budgets.map(row => {
        const percent = row.amount > 0 ? Math.round(row.spent / row.amount * 100) : 0;
        return <article className={`record-card finance-budget-card ${percent >= 100 ? 'over-limit' : percent >= 80 ? 'near-limit' : ''}`} key={row.id}>
        <div className="budget-heading"><h3>{row.category}</h3><ActionIcon action="delete" label={`${t.delete}: ${row.category}`} onClick={() => remove(`/finance/budgets/${row.id}`)} /></div>
        <p>{money(row.spent)} {language === 'ar' ? 'من' : 'of'} {money(row.amount)}</p>
        <div className="budget-track"><span className={percent >= 100 ? 'over-budget' : ''} style={{ width: `${Math.min(100, percent)}%` }} /></div>
        <small className="finance-budget-status">{percent}% {percent >= 100 ? (language === 'ar' ? 'من الحد' : 'of limit') : language === 'ar' ? 'مستخدم' : 'used'}</small>
      </article>;
      })}</div>
      {!budgets.length && <p className="finance-chart-empty">{language === 'ar' ? 'أضف ميزانية لتتابع الإنفاق مقابل خطتك.' : 'Add a budget to compare spending with your plan.'}</p>}
      </section>
    </section>
  );
}

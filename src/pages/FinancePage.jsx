import { useCallback, useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';

const TRANSACTIONS_PER_PAGE = 10;
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

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
  const [transactionPage, setTransactionPage] = useState(1);
  const [subscriptionSort, setSubscriptionSort] = useState('renewal');
  const [monthLoading, setMonthLoading] = useState(false);
  const [error, setError] = useState('');
  const t = messages[language];
  const load = useCallback(async () => {
    try { setFinance(await api('/finance')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function save(path, method, value) {
    setError('');
    try { await api(path, { method, body: value }); setEditing(''); await load(); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }
  async function remove(path) {
    try { await api(path, { method: 'DELETE' }); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function changeMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setMonthLoading(true);
    setError('');
    try {
      setFinance(await api(`/finance?month=${month}`));
      setTransactionPage(1);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setMonthLoading(false);
    }
  }
  if (!finance) return <section className="page-card">{error || t.loading}</section>;
  const { summary, transactions, subscriptions, budgets, currency } = finance;
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
      return /subscription|اشتراك/.test(text);
    }
    return row.type === transactionFilter;
  }).sort((a, b) => String(b.transaction_date || '').localeCompare(String(a.transaction_date || '')) || b.id - a.id);
  const totalPages = Math.max(1, Math.ceil(visibleTransactions.length / TRANSACTIONS_PER_PAGE));
  const currentPage = Math.min(transactionPage, totalPages);
  const pagedTransactions = visibleTransactions.slice((currentPage - 1) * TRANSACTIONS_PER_PAGE, currentPage * TRANSACTIONS_PER_PAGE);
  const [selectedYear, selectedMonth] = finance.month.split('-').map(Number);
  const years = Array.from({ length: 9 }, (_, index) => selectedYear - 4 + index);
  const monthLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { month: 'long', year: 'numeric' })
    .format(new Date(selectedYear, selectedMonth - 1, 1, 12));
  const shiftMonth = offset => {
    const next = new Date(selectedYear, selectedMonth - 1 + offset, 1, 12);
    changeMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    if (subscriptionSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), language === 'ar' ? 'ar' : 'en');
    if (subscriptionSort === 'amount') return Number(b.amount) - Number(a.amount);
    return String(a.next_renewal_date || '').localeCompare(String(b.next_renewal_date || ''));
  });
  return (
    <section className="page-card workspace-section finance-page">
      <header className="page-heading"><div><h1>{t.finance}</h1><p>{monthLabel} · {currency}</p></div>
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
      <div className="finance-summary">
        {summaryCards.map(([key, label, icon]) => <article className={`finance-summary-card finance-${key}`} key={key}>
          <span className="finance-summary-icon" aria-hidden="true">{icon}</span>
          <span className="finance-summary-label">{label}</span>
          <strong>{money(summary[key])}</strong>
        </article>)}
      </div>
      <div className="record-actions">
        <button className="button button-primary" onClick={() => setEditing('transaction')}>＋ عملية مالية</button>
        <button className="button button-quiet" onClick={() => setEditing('subscription')}>＋ اشتراك</button>
        <button className="button button-quiet" onClick={() => setEditing('budget')}>＋ ميزانية</button>
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
      <header className="finance-section-heading finance-subscriptions-heading"><div><h2>{language === 'ar' ? 'الاشتراكات' : 'Subscriptions'}</h2><p>{language === 'ar' ? 'مرتبة حسب موعد التجديد' : 'Keep renewals in view'}</p></div>
        <label>{language === 'ar' ? 'ترتيب حسب' : 'Sort by'} <select value={subscriptionSort} onChange={event => setSubscriptionSort(event.target.value)}>
          <option value="renewal">{language === 'ar' ? 'موعد التجديد' : 'Renewal date'}</option>
          <option value="name">{language === 'ar' ? 'الاسم' : 'Name'}</option>
          <option value="amount">{language === 'ar' ? 'المبلغ الأعلى' : 'Highest amount'}</option>
        </select></label>
      </header>
      <div className="record-grid">{sortedSubscriptions.map(row => <article className="record-card" key={row.id}>
        <h3>{row.name}</h3><p>{money(row.amount)} · {row.billing_cycle === 'yearly' ? (language === 'ar' ? 'سنوي' : 'Yearly') : (language === 'ar' ? 'شهري' : 'Monthly')} · {row.next_renewal_date}</p>
        <span className={`finance-subscription-status ${row.status}`}>{row.status === 'active' ? (language === 'ar' ? 'نشط' : 'Active') : row.status === 'paused' ? (language === 'ar' ? 'متوقف' : 'Paused') : (language === 'ar' ? 'ملغي' : 'Cancelled')}</span>
        <div className="record-actions">{row.status === 'active' && <button className="button button-quiet" onClick={() => save(`/finance/subscriptions/${row.id}/pay`, 'POST', { period: row.next_renewal_date })}>{language === 'ar' ? 'تسجيل الدفع' : 'Record payment'}</button>}
        <ActionIcon action="delete" label={`${t.delete}: ${row.name}`} onClick={() => remove(`/finance/subscriptions/${row.id}`)} /></div>
      </article>)}</div>
      <h2>{language === 'ar' ? 'الميزانيات' : 'Budgets'}</h2>
      <div className="record-grid">{budgets.map(row => <article className="record-card" key={row.id}>
        <div className="budget-heading"><h3>{row.category}</h3><ActionIcon action="delete" label={`${t.delete}: ${row.category}`} onClick={() => remove(`/finance/budgets/${row.id}`)} /></div>
        <p>{money(row.spent)} {language === 'ar' ? 'من' : 'of'} {money(row.amount)}</p>
        <div className="budget-track"><span className={row.spent > row.amount ? 'over-budget' : ''} style={{ width: `${Math.min(100, Number(row.amount) > 0 ? row.spent / row.amount * 100 : 0)}%` }} /></div>
        <small>{row.amount > 0 ? Math.round(row.spent / row.amount * 100) : 0}% {language === 'ar' ? 'مستخدم' : 'used'}</small>
      </article>)}</div>
    </section>
  );
}

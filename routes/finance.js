const express = require('express');

function createFinanceRouter({ db, text, now, localToday }) {
  const router = express.Router();

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function amountMinor(value) {
    const input = typeof value === 'number' ? String(value) : text(value);
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(input)) return null;
    const amount = Math.round(Number(input) * 100);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  function currencyFor(userId) {
    return db.prepare('SELECT finance_currency FROM user_preferences WHERE user_id=?').get(userId)?.finance_currency || 'EGP';
  }

  function transactionForUser(id, userId) {
    const transaction = db.prepare(`SELECT id,type,description,amount_minor,currency,category,transaction_date,notes,
      subscription_id,subscription_period,created_at,updated_at FROM finance_transactions WHERE id=? AND user_id=?`)
      .get(id, userId);
    return transaction && { ...transaction, amount: transaction.amount_minor / 100 };
  }

  function subscriptionForUser(id, userId) {
    const subscription = db.prepare(`SELECT id,name,amount_minor,currency,billing_cycle,next_renewal_date,
      category,notes,status,created_at,updated_at FROM finance_subscriptions WHERE id=? AND user_id=?`)
      .get(id, userId);
    return subscription && { ...subscription, amount: subscription.amount_minor / 100 };
  }

  function validTransaction(body) {
    const transaction = {
      type: text(body?.type),
      description: text(body?.description),
      amountMinor: amountMinor(body?.amount),
      category: text(body?.category) || 'عام',
      transactionDate: text(body?.transaction_date || localToday()),
      notes: text(body?.notes),
    };
    if (!['income', 'expense'].includes(transaction.type) || !transaction.description || transaction.description.length > 160
      || transaction.amountMinor === null || transaction.category.length > 80
      || !validDate(transaction.transactionDate) || transaction.notes.length > 1000) {
      return { error: 'تحقق من نوع العملية والوصف والمبلغ الموجب والتصنيف والتاريخ.' };
    }
    return { transaction };
  }

  function validSubscription(body) {
    const subscription = {
      name: text(body?.name),
      amountMinor: amountMinor(body?.amount),
      billingCycle: text(body?.billing_cycle),
      nextRenewalDate: text(body?.next_renewal_date),
      category: text(body?.category) || 'اشتراكات',
      notes: text(body?.notes),
      status: text(body?.status || 'active'),
    };
    if (!subscription.name || subscription.name.length > 160 || subscription.amountMinor === null
      || !['monthly', 'yearly'].includes(subscription.billingCycle) || !validDate(subscription.nextRenewalDate)
      || subscription.category.length > 80 || subscription.notes.length > 1000
      || !['active', 'paused', 'cancelled'].includes(subscription.status)) {
      return { error: 'تحقق من اسم الاشتراك والمبلغ ودورة الدفع وتاريخ التجديد.' };
    }
    return { subscription };
  }

  function addCycle(dateValue, cycle) {
    const date = new Date(`${dateValue}T00:00:00.000Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    if (cycle === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCFullYear(date.getUTCFullYear() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString().slice(0, 10);
  }

  router.get('/finance/reminders', (req, res) => {
    res.json(db.prepare(`SELECT id,name,next_renewal_date
      FROM finance_subscriptions WHERE user_id=? AND status='active'
      ORDER BY next_renewal_date,name`).all(req.user.id));
  });

  router.get('/finance', (req, res) => {
    const month = text(req.query.month) || localToday().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'اختر شهراً صحيحاً.' });
    const userId = req.user.id;
    const currency = currencyFor(userId);
    const bounds = [`${month}-01`, `${month}-31`];
    const totals = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount_minor ELSE 0 END),0) AS income_minor,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount_minor ELSE 0 END),0) AS expense_minor
      FROM finance_transactions WHERE user_id=? AND currency=? AND transaction_date BETWEEN ? AND ?`)
      .get(userId, currency, ...bounds);
    const subscriptions = db.prepare(`SELECT id,name,amount_minor,currency,billing_cycle,next_renewal_date,
      category,notes,status,created_at,updated_at FROM finance_subscriptions
      WHERE user_id=? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,next_renewal_date,id`)
      .all(userId).map(subscription => ({ ...subscription, amount: subscription.amount_minor / 100 }));
    const transactions = db.prepare(`SELECT id,type,description,amount_minor,currency,category,transaction_date,notes,
      subscription_id,subscription_period,created_at,updated_at FROM finance_transactions
      WHERE user_id=? AND currency=? AND transaction_date BETWEEN ? AND ? ORDER BY transaction_date DESC,id DESC`)
      .all(userId, currency, ...bounds).map(transaction => ({ ...transaction, amount: transaction.amount_minor / 100 }));
    const budgets = db.prepare(`SELECT b.id,b.month,b.category,b.amount_minor,b.currency,
      COALESCE(SUM(t.amount_minor),0) AS spent_minor
      FROM finance_budgets b LEFT JOIN finance_transactions t ON t.user_id=b.user_id AND t.currency=b.currency
        AND t.type='expense' AND t.category=b.category AND t.transaction_date BETWEEN ? AND ?
      WHERE b.user_id=? AND b.month=? AND b.currency=? GROUP BY b.id ORDER BY b.category COLLATE NOCASE`)
      .all(...bounds, userId, month, currency).map(budget => ({
      ...budget,
      amount: budget.amount_minor / 100,
      spent: budget.spent_minor / 100,
    }));
    const monthlySubscriptionsMinor = subscriptions
      .filter(subscription => subscription.status === 'active' && subscription.currency === currency)
      .reduce((total, subscription) => total + (subscription.billing_cycle === 'yearly'
        ? Math.round(subscription.amount_minor / 12)
        : subscription.amount_minor), 0);
    res.json({
      month,
      currency,
      summary: {
        income: totals.income_minor / 100,
        expenses: totals.expense_minor / 100,
        balance: (totals.income_minor - totals.expense_minor) / 100,
        monthlySubscriptions: monthlySubscriptionsMinor / 100,
      },
      transactions,
      subscriptions,
      budgets,
    });

  });

  router.post('/finance/transactions', (req, res) => {
    const { transaction, error } = validTransaction(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO finance_transactions(user_id,type,description,amount_minor,currency,category,
      transaction_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(req.user.id, transaction.type, transaction.description, transaction.amountMinor, currencyFor(req.user.id),
        transaction.category, transaction.transactionDate, transaction.notes, timestamp, timestamp);
    res.status(201).json(transactionForUser(result.lastInsertRowid, req.user.id));
  });

  router.put('/finance/transactions/:id', (req, res) => {
    const existing = transactionForUser(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'العملية المالية غير موجودة.' });
    const { transaction, error } = validTransaction(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE finance_transactions SET type=?,description=?,amount_minor=?,category=?,transaction_date=?,
      notes=?,updated_at=? WHERE id=? AND user_id=?`)
      .run(transaction.type, transaction.description, transaction.amountMinor, transaction.category,
        transaction.transactionDate, transaction.notes, now(), existing.id, req.user.id);
    res.json(transactionForUser(existing.id, req.user.id));
  });

  router.delete('/finance/transactions/:id', (req, res) => {
    const result = db.prepare('DELETE FROM finance_transactions WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'العملية المالية غير موجودة.' });
    res.json({ ok: true });
  });

  router.post('/finance/subscriptions', (req, res) => {
    const { subscription, error } = validSubscription(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO finance_subscriptions(user_id,name,amount_minor,currency,billing_cycle,
      next_renewal_date,category,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.user.id, subscription.name, subscription.amountMinor, currencyFor(req.user.id), subscription.billingCycle,
        subscription.nextRenewalDate, subscription.category, subscription.notes, subscription.status, timestamp, timestamp);
    res.status(201).json(subscriptionForUser(result.lastInsertRowid, req.user.id));
  });

  router.put('/finance/subscriptions/:id', (req, res) => {
    const existing = subscriptionForUser(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'الاشتراك غير موجود.' });
    const { subscription, error } = validSubscription(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE finance_subscriptions SET name=?,amount_minor=?,billing_cycle=?,next_renewal_date=?,
      category=?,notes=?,status=?,updated_at=? WHERE id=? AND user_id=?`)
      .run(subscription.name, subscription.amountMinor, subscription.billingCycle, subscription.nextRenewalDate,
        subscription.category, subscription.notes, subscription.status, now(), existing.id, req.user.id);
    res.json(subscriptionForUser(existing.id, req.user.id));
  });

  router.delete('/finance/subscriptions/:id', (req, res) => {
    const result = db.prepare('DELETE FROM finance_subscriptions WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'الاشتراك غير موجود.' });
    res.json({ ok: true });
  });

  router.post('/finance/subscriptions/:id/pay', (req, res) => {
    const subscription = db.prepare('SELECT * FROM finance_subscriptions WHERE id=? AND user_id=?')
      .get(req.params.id, req.user.id);
    if (!subscription || subscription.status !== 'active') {
      return res.status(404).json({ error: 'الاشتراك غير موجود أو غير نشط.' });
    }
    const billedPeriod = text(req.body?.period);
    if (billedPeriod !== subscription.next_renewal_date) {
      return res.status(409).json({ error: 'تغيّر تاريخ التجديد. حدّث الصفحة ثم سجّل الدفعة الحالية.' });
    }
    if (db.prepare('SELECT id FROM finance_transactions WHERE subscription_id=? AND subscription_period=?')
      .get(subscription.id, billedPeriod)) {
      return res.status(409).json({ error: 'تم تسجيل دفعة هذا التجديد بالفعل.' });
    }
    const paidDate = text(req.body?.paid_date) || localToday();
    if (!validDate(paidDate)) return res.status(400).json({ error: 'أدخل تاريخ دفع صحيحاً.' });
    const timestamp = now();
    const createPayment = db.transaction(() => {
      const result = db.prepare(`INSERT INTO finance_transactions(user_id,type,description,amount_minor,currency,category,
        transaction_date,notes,subscription_id,subscription_period,created_at,updated_at)
        VALUES (?,'expense',?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, subscription.name, subscription.amount_minor, subscription.currency, subscription.category,
          paidDate, `Subscription renewal for ${billedPeriod}`, subscription.id, billedPeriod, timestamp, timestamp);
      db.prepare('UPDATE finance_subscriptions SET next_renewal_date=?,updated_at=? WHERE id=? AND user_id=?')
        .run(addCycle(billedPeriod, subscription.billing_cycle), timestamp, subscription.id, req.user.id);
      return result.lastInsertRowid;
    });
    const transactionId = createPayment();
    res.status(201).json({
      transaction: transactionForUser(transactionId, req.user.id),
      subscription: subscriptionForUser(subscription.id, req.user.id),
    });
  });

  router.put('/finance/budgets', (req, res) => {
    const month = text(req.body?.month);
    const category = text(req.body?.category);
    const amount = amountMinor(req.body?.amount);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !category || category.length > 80 || amount === null) {
      return res.status(400).json({ error: 'أدخل شهراً وتصنيفاً ومبلغ ميزانية صحيحاً.' });
    }
    const timestamp = now();
    db.prepare(`INSERT INTO finance_budgets(user_id,month,category,amount_minor,currency,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,month,category) DO UPDATE SET
      amount_minor=excluded.amount_minor,currency=excluded.currency,updated_at=excluded.updated_at`)
      .run(req.user.id, month, category, amount, currencyFor(req.user.id), timestamp, timestamp);
    res.json({ ok: true });
  });

  router.delete('/finance/budgets/:id', (req, res) => {
    const result = db.prepare('DELETE FROM finance_budgets WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'الميزانية غير موجودة.' });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createFinanceRouter;

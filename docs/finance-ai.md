# Finance AI coach

The Finance workspace can generate a personal finance coaching report using the OpenAI-compatible provider connection configured in Settings. It does not need a separate API key. The server requires `PERSONAL_MEMO_AI_ENCRYPTION_KEY` to be set for the saved provider credential; see the [AI interviewer setup guide](./ai-interviewer.md) for generating and preserving that secret.

## Consent and shared data

Every analysis requires a new, explicit confirmation. Choose which areas to include:

- **Spending:** monthly income and expense totals plus expense totals grouped by category for the six-month window ending in the selected month.
- **Budgets:** category, budget amount, and recorded spending for budgeted months in that window.
- **Subscriptions:** active subscription name, category, amount, billing cycle, currency, and next renewal date.
- **Cash flow:** monthly income, expenses, and net totals for the same six-month window.

Transaction descriptions and notes are never included in the AI request. The request includes only the selected sections and your configured currency context. The provider processes the request; review its data handling terms before using the feature.

The report contains an overview, evidence-based observations, practical actions, and any watch-outs or data limitations. Reports are saved to your account so you can revisit them, and can be individually deleted. Removing a report does not change transactions, subscriptions, or budgets.

AI output is educational budgeting guidance, not professional financial, investment, tax, or legal advice. The coach cannot move money, make purchases, or alter finance records.

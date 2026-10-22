# AI interviewer setup and data handling

The AI interviewer connects to an OpenAI-compatible Chat Completions endpoint. Configure a provider separately for each account in **Settings → AI provider connection**. Enter its HTTPS base URL (for example, `https://api.openai.com/v1`), model name, and API key. Use **Test connection** before saving.

## Server encryption secret

Before saving a provider key, configure `PERSONAL_MEMO_AI_ENCRYPTION_KEY` in the Express server's environment. It must be exactly 64 hexadecimal characters (32 random bytes). Generate a value with Node:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

In PowerShell, set the generated value in the server's environment before starting or restarting the server:

```powershell
$env:PERSONAL_MEMO_AI_ENCRYPTION_KEY = "<generated 64-character value>"
npm start
```

For a persistent deployment, configure the variable in the service manager or secret store that launches Node. Do not put the real secret in source control, a client-side variable, or a backup. Keep it stable and backed up separately: provider keys in SQLite are encrypted using this secret, so losing it makes saved provider connections unusable. The full database backup includes the encrypted provider key and AI interview history, but never the encryption secret.

The AI endpoint must use HTTPS and resolve only to public IP addresses. Private, loopback, and link-local endpoints are rejected; requests are pinned to the checked DNS address and do not follow redirects. This prevents a user-provided provider URL from accessing internal server resources. The app sends only Chat Completions requests and limits response size and duration.

## Interview data

Each session requires explicit confirmation that interview answers will be sent to the configured provider and saved in the user's account. The user separately chooses whether to include a job description and resume text; unselected fields are neither sent nor stored with the session. Session questions, written answers, feedback, and reports are account-scoped and retained until the user deletes the session. A session can be removed from its history.

The model receives role, interview type, difficulty, question count, and only the optional context the user selected. It asks an initial question, evaluates each submitted or skipped answer, selects adaptive follow-up questions, and produces a final report. Job-description and resume content is treated as untrusted reference material. AI scores are coaching feedback, not objective hiring assessments or hiring-outcome predictions. Review provider terms and retention policies before sending sensitive information.

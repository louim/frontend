import { expect, test } from '@playwright/test'

const API = process.env.E2E_API_URL || 'http://localhost:2021/api/v1'

// Dev account seeded in donetick.db (see CLAUDE.md "Local dev credentials").
const DEV_USER = process.env.E2E_USER || 'louim'
const DEV_PASS = process.env.E2E_PASS || 'donetick123'

// Capture every request the page makes to the API, with its Authorization
// header, plus any 401 responses. This lets us SEE whether a malformed token
// (`Bearer undefined` / `Bearer null`) is ever sent — the #254 signature.
function instrument(page) {
  const apiRequests = []
  const malformedAuth = []
  const unauthorized = []
  const consoleErrors = []

  page.on('request', req => {
    const url = req.url()
    if (!url.includes('/api/v1/')) return
    const auth = req.headers()['authorization']
    const endpoint = url.split('/api/v1')[1]
    apiRequests.push({ endpoint, method: req.method(), auth })
    if (auth && /Bearer (undefined|null|\s*$)/.test(auth)) {
      malformedAuth.push({ endpoint, auth })
    }
  })

  page.on('response', async res => {
    const url = res.url()
    if (!url.includes('/api/v1/')) return
    if (res.status() === 401) {
      let body = ''
      try {
        body = await res.text()
      } catch {
        /* ignore */
      }
      unauthorized.push({ endpoint: url.split('/api/v1')[1], body })
    }
  })

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  return { apiRequests, malformedAuth, unauthorized, consoleErrors }
}

test('local login → dashboard renders without infinite spinner or malformed token', async ({
  page,
}) => {
  const captured = instrument(page)

  await page.goto('/login')

  // Fill the username/password form. The login view uses MUI Joy inputs.
  await page.getByRole('textbox').first().fill(DEV_USER)
  await page.locator('input[type="password"]').first().fill(DEV_PASS)
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click()

  // Should land on /chores and render the real dashboard, NOT hang on the
  // "This is taking longer than usual" spinner.
  await page.waitForURL('**/chores', { timeout: 20_000 })

  // The infinite-spinner bug shows this submessage and never resolves.
  const spinnerMsg = page.getByText(/taking longer than usual/i)

  // Give the app a moment to settle / fire its first authenticated calls.
  await page.waitForTimeout(8_000)

  // eslint-disable-next-line no-console
  console.log('\n=== API requests after login ===')
  for (const r of captured.apiRequests) {
    // eslint-disable-next-line no-console
    console.log(`${r.method} ${r.endpoint}  auth=${r.auth ?? '(none)'}`)
  }
  // eslint-disable-next-line no-console
  console.log('=== malformed auth headers ===', captured.malformedAuth)
  // eslint-disable-next-line no-console
  console.log('=== 401 responses ===', captured.unauthorized)
  // eslint-disable-next-line no-console
  console.log('=== console errors ===', captured.consoleErrors)

  await expect(spinnerMsg).toHaveCount(0)
  expect(
    captured.malformedAuth,
    'a request sent a malformed Bearer token (the #254 signature)',
  ).toEqual([])
  expect(
    captured.unauthorized.filter(u =>
      /invalid number of segments/.test(u.body),
    ),
    'a request hit the "invalid number of segments" 401',
  ).toEqual([])
})

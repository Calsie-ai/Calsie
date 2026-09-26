# Google sign-in return on production

Production origin: https://www.calsie.com.au

## Application behavior

The browser client uses Supabase's existing implicit session flow. Before the SDK consumes an auth fragment, the singleton captures only the return kind and safe-destination inputs, never access or refresh tokens. An actual OAuth session return to `/` waits for SDK session restoration, then continues to the requested internal destination or `/dashboard?panel=overview`. Normal authenticated homepage visits stay on the homepage. Recovery/signup fragments are not treated as Google returns. Provider cancellation/failed session restoration goes to login with a concrete message.

A same-tab destination marker lasts ten minutes, is consumed once, and preserves saved payment/template navigation if the provider falls back to the Site URL. It contains no session credentials. Storage failures fall back to the default dashboard destination. Existing callback handling remains supported. For authorization codes, the provider waits for SDK initialization before deciding whether the existing callback still needs to exchange the code.

## Production configuration verification

The public login initiation was inspected: it requests `https://www.calsie.com.au/auth/callback?next=%2Fdashboard%3Fpanel%3Doverview` and receives a redirect to Google. The connected Supabase account denied project access; the actual allow-list and a completed Google consent round-trip could not be inspected. Homepage fallback is a likely explanation of the reported symptom, not a confirmed configuration diagnosis.

In Supabase Authentication > URL Configuration, verify that the Site URL uses the production origin and that the requested `www` callback URLs (including supported destination query strings) match the allow-list. Keep preview/local entries scoped to their actual hosts. Do not use a catch-all external host rule. If supporting an apex domain, redirect to the chosen canonical host before beginning login so browser storage remains on the same origin.

Supabase's Google provider callback in Google Cloud remains the Supabase `/auth/v1/callback` URL; it is different from the application's `/auth/callback` page. No GoDaddy DNS, Google provider, Supabase configuration, or environment values were changed by this PR.

Sources:
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/social-login/auth-google

## Verification before production acceptance

After deploying the PR, use a fresh browser session on www.calsie.com.au. Complete Continue with Google once and confirm dashboard overview. Repeat with a saved campaign and confirm its intended destination. Test cancellation and an ordinary homepage visit while already signed in. Local fixtures exercise these paths without production writes; they do not replace the real consent round-trip.

# Formfuel

A data-driven survey exchange where students post questionnaires and earn rewards by answering others’.

Students sign in with Google, write surveys on Formfuel (not as links to Google Forms), and earn credits by completing other students’ surveys. Credits raise a survey’s response cap or promote it. There is no audience filter: any signed-in student can answer any open survey except their own.

Built for BUHack 2.0.

## Credit rules

The numbers live in [`lib/config.ts`](lib/config.ts) and are seeded into `public.product_rules`. **The database row is what awards and spends enforce.** Signed-in screens read that row. If you change a rule, update both places.

| Rule | Default |
| --- | --- |
| Free response cap on a new survey | 10 |
| Credits for a valid completion | 8 |
| Cost to raise the cap by 10 | 8 |
| Cost to promote a survey | 12, for 7 days |
| Free published surveys per new user | 1 |
| Cost to publish after the free one | 8 credits |
| Minimum completion time | 2 minutes |

Drafts are free, up to 10 per person. The free quota is spent when a survey is **published**, not when a draft is saved. One valid completion pays for one extra survey. Publishing is blocked until the balance covers it. Deletes do not refund credits. A promotion extends from the later of “now” and the current promotion end.

Balances live on `profiles` and every change is written to `credit_ledger` in the same transaction, so a completion cannot be credited twice and a spend cannot overdraw.

## Anti-cheat

- One response per user per survey.
- The clock starts on the server when the answer page calls `start_response`. Refreshing does not reset it. Submitting too fast still saves the response, marks it invalid, and awards nothing.
- Screening questions are single- or multiple-choice with a correct answer stored in `private.screening_keys`, not on a table the browser can select. A wrong screening answer is saved as invalid and awards nothing.
- Short answers cannot be screening questions.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth and Postgres. The app uses the anon key and Row Level Security. It does not use the service role key.

Privileged work (save, publish, credits, start, submit) is in the `private` schema. `public` only has thin functions that pass `auth.uid()` through. Do not add `private` to the Data API exposed schemas.

## Local development

```bash
npm install
cp .env.example .env.local
# fill in the Supabase URL and anon key
npm run dev
```

Without those keys the app runs in preview mode so the screens can be clicked through. Nothing is saved.

```bash
npm run typecheck
npm run build
```

## Environment variables

| Name | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | Not used. Leave it unset. |

## Apply the database migration

The SQL is in [`supabase/migrations`](supabase/migrations). On the empty Formfuel project:

1. Open the Supabase SQL editor.
2. Paste `supabase/migrations/20261113153000_init_formfuel.sql` and run it.
3. In **Project Settings → Data API**, keep exposed schemas to `public` (and `graphql_public` if you use it). Do not expose `private`.

Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to the project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates a profile when a user signs up (`auth.users` trigger), enables RLS on every public table, and reloads the API schema.

## Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → Google. Paste the client id and secret.
4. Authentication → URL configuration:
   - Site URL: `http://localhost:3000` (and your production URL later)
   - Redirect allow list: `http://localhost:3000/auth/callback`

The app sends users back to `/auth/callback`, which exchanges the code for a session.

## Demo path

1. Sign in with Google.
2. Create a survey. Mark one choice question as screening and pick the correct option. Publish (the first one is free).
3. Sign in as someone else, answer it, and wait out the minimum time.
4. Open My surveys → the dashboard. Check valid and invalid counts, the bar chart, and Download CSV.
5. Spend credits to promote it or raise the cap. The ledger is under the credits pill.

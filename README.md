# Formfuel

A data-driven survey exchange where students post questionnaires and earn rewards by answering others’.

Students sign in with Google, write surveys on Formfuel (not as links to Google Forms), and earn credits by completing other students’ surveys. Credits fund response slots on a survey or promote it. Each survey has a search code and tags. There is no audience filter: any signed-in student can answer any open survey except their own.

Built for BUHack 2.0.

## Credit rules

The numbers live in [`lib/config.ts`](lib/config.ts) and are seeded into `public.product_rules`. **The database row is what awards and spends enforce.** Signed-in screens read that row. If you change a rule, update both places.

One credit covers 10 questions.

| Rule | Formula |
| --- | --- |
| Starting balance | 10 credits, granted once when the profile is created |
| Cost of one response | `ceil(question_count / 10)` credits |
| Response cap | `floor(credits_allocated / cost of one response)` |
| Valid completion | Earns the cost of one response. A 6-question survey earns 1 credit. A 15-question survey earns 2. |
| Publish | Spend the credits you allocate. At least one response slot is required. There is no separate publish fee. |
| Add responses later | Allocate more credits. The cap is recomputed from the new total. |
| Promote a survey | 12 credits, for 7 days |
| Minimum completion time | Set per survey. Maximum is `question_count × 20` seconds. The create form defaults to 60 seconds, or that maximum when the survey is shorter (20 seconds for 1 question, 40 for 2, 60 for 3 or more). |

Example: a survey with 6 questions costs 1 credit per response. Allocating 10 credits funds 10 responses. A survey with 15 questions costs 2 credits per response, so 10 credits fund 5 responses.

Drafts are free, up to 10 per person. Credits are spent when a survey is **published**, not when a draft is saved. Deletes do not refund credits. A promotion extends from the later of “now” and the current promotion end.

Balances live on `profiles` and every change is written to `credit_ledger` in the same transaction, so a completion cannot be credited twice and a spend cannot overdraw. New accounts get a `signup_grant` row. Funding a survey uses `fund_survey`.

## Search codes and tags

Each survey gets a unique 6-character code when it is created. The code is shown on browse cards, the survey page, the draft editor, and the owner dashboard. Browse search matches that code, a tag, or the title. Owners can add up to 5 tags. Tags appear on cards and survey pages, and clicking one filters browse.

## Anti-cheat

- One response per user per survey.
- The clock starts on the server when the answer page calls `start_response`. Refreshing does not reset it. Elapsed time is `floor(extract(epoch from (now() - started_at)))`. A response is too fast only when elapsed is strictly below that survey’s minimum, so a time equal to the minimum is valid. Submitting too fast still saves the response, marks it invalid, uses a cap slot, and awards nothing. The answer screen shows a live countdown of the remaining wait. Submit stays available.
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
3. Paste `supabase/migrations/20261114101500_search_codes_credit_allocation.sql` and run it.
4. In **Project Settings → Data API**, keep exposed schemas to `public` (and `graphql_public` if you use it). Do not expose `private`.

On a database that already ran the init migration, run only the second file. It grants 10 credits to profiles whose balance is 0, assigns a search code to every survey, keeps existing open caps by recording the credits that formula needs, and clamps old 120-second minimums down to `question_count × 20` when that is lower.

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

1. Sign in with Google. A new profile starts with 10 credits.
2. Create a survey. Add tags, set the minimum time, and allocate credits. Publish. Note the search code on the dashboard.
3. Sign in as someone else, find it by that code or a tag, and answer it. The countdown shows how long is left. Waiting exactly the minimum is valid.
4. Open My surveys → the dashboard. Check valid and invalid counts, the bar chart, and Download CSV.
5. Add more credits to raise the cap, or spend 12 to promote it. The ledger is under the credits pill.

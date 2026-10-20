# Coaching notifications

AI Gym Coach can send up to two coaching reminders a day. The manual test notification on Profile is unchanged and does not count toward that limit.

Reminders are decided on the server. The iPhone does not need to be open. Nothing is sent overnight, and a reminder is skipped when the related action is already done.

## What you need to add

The app already has the VAPID keys. Do not regenerate them.

Add these two server-only variables in Vercel, for Production, then redeploy:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API → the secret key (`sb_secret_...`). This lets the Vercel route read your training and nutrition data. It is not the publishable key.
- `CRON_SECRET` — any long random string. The coaching route rejects a call that does not send this value.

Vercel Hobby cannot run a job every 30 minutes, so the app does not declare a Vercel cron. Supabase Cron calls `https://YOUR-PRODUCTION-DOMAIN/api/cron/coaching-notifications` every 30 minutes and sends `CRON_SECRET`. The reminder rules still run on Vercel.

Store these two Vault secrets in the Supabase dashboard. Do not put the values in Git:

1. Open the Supabase project → SQL Editor.
2. Run the statements below after replacing both placeholders. Use the same `CRON_SECRET` value as Vercel, and your real production address.

```sql
select vault.create_secret(
  'https://YOUR-PRODUCTION-DOMAIN/api/cron/coaching-notifications',
  'coaching_notifications_url',
  'Production coaching notification endpoint'
);

select vault.create_secret(
  'PASTE_THE_SAME_CRON_SECRET_AS_VERCEL',
  'coaching_notifications_cron_secret',
  'Bearer token for the coaching notification route'
);
```

If a secret name already exists, delete that Vault secret in the dashboard and create it again. Do not create a second secret with the same name.

To change the schedule later, run `select public.install_coaching_notifications_schedule();` in the SQL editor. To stop it, run `select public.remove_coaching_notifications_schedule();`.

The database job is not enough on its own. Reminders start only after the Vault secrets exist, Vercel has the same `CRON_SECRET` and the Supabase secret key, and a later check shows Supabase actually reached the Vercel route.

Quiet hours are 9:30pm–7:00am in the timezone saved on your profile. The default timezone is `Europe/London`. Change it under Profile → Notifications.

## How timing works

Each reminder has a default window until there are at least **5** recorded examples in the previous **28 days** (not including today):

| Reminder | Default local time | Learned from |
| --- | --- | --- |
| Morning plan | 7:00–10:00 | Check-in times |
| Protein | 15:00–18:30 | Meal log times |
| Workout | 16:30–20:00 | Workout log times |
| Evening check-in | 20:00–21:15 | Evening coach messages |

With 5 or more examples, the window becomes 45 minutes before the typical time through 90 minutes after it, still inside waking hours. One or two logs do not move the time.

A run only sends a reminder that is still inside its window. If the scheduler was offline, it does not send a backlog later.

## What is skipped

- Morning plan: skipped after today’s check-in, or if today’s workout is already done.
- Protein: skipped when logged protein has already reached the target, or a meal was logged in the last 3 hours. If protein was not estimated, the message asks what you have eaten. It does not say you have not eaten.
- Workout: skipped on a rest day, when nothing is planned, when the plan is skipped, or when the session is already logged.
- Evening: skipped after an evening check-in or an evening coach reply.
- Same reminder is not sent twice on the same local day.
- A second scheduler run cannot send the same reminder again.
- Coaching reminders stay off when the Profile switch is off. Turning them off does not sign you out.

Tapping a reminder opens Today, Train, or a Coach chat with a short draft you can edit before sending. The draft is not sent automatically.

## Test on iPhone

1. Finish the Vault and Vercel setup above. Wait until a check of Supabase’s cron history shows a successful call to the production route.
2. Open the Home Screen app, go to Profile, and confirm coaching reminders are on and the timezone is right.
3. Leave the app. A reminder can arrive only inside its time window, and only if that part of the day is still open.
4. The test button still sends immediately and does not schedule coaching.

# Coaching notifications

AI Gym Coach can send up to two coaching reminders a day. The manual test notification on Profile is unchanged and does not count toward that limit.

Reminders are decided on the server. The iPhone does not need to be open. Nothing is sent overnight, and a reminder is skipped when the related action is already done.

## What you need to add

The app already has the VAPID keys. Do not regenerate them.

Add these two server-only variables in Vercel, for Production, then redeploy:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API → `service_role`. This lets the scheduler read your own training and nutrition data. It is not the publishable key.
- `CRON_SECRET` — any long random string. Vercel sends it automatically with the scheduled job. The public site cannot trigger reminders without it.

`vercel.json` schedules `/api/cron/coaching-notifications` every 30 minutes. Vercel’s Hobby plan only allows a cron once per day, so this schedule needs a Pro plan. If the deployment rejects the schedule, the reminders will not run until the plan supports it.

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

1. Wait until the Vercel deployment that contains this scheduler is live, and the two variables above are set.
2. Open the Home Screen app, go to Profile, and confirm coaching reminders are on and the timezone is right.
3. Leave the app. A reminder can arrive only inside its time window, and only if that part of the day is still open.
4. The test button still sends immediately and does not schedule coaching.

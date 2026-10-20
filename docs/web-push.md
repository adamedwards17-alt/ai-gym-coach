# Web Push setup

AI Gym Coach uses standard Web Push (VAPID) so a Home Screen install on iPhone and desktop browsers can receive notifications. Scheduled coaching reminders are not implemented yet. This only covers device setup and a manual test send.

Package manager: **npm**. Deployment: **Vercel**, triggered by a push to `main`. Database: **Supabase** (`npm run supabase:*`).

## 1. Install the dependency

```bash
npm install web-push
```

`web-push` is a server-only package. Do not import it from client components.

## 2. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Put the keys in `.env.local` (already gitignored). Never commit the private key and never prefix it with `NEXT_PUBLIC_`.

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=paste_public_key
VAPID_PRIVATE_KEY=paste_private_key
VAPID_SUBJECT=mailto:you@example.com
```

`VAPID_SUBJECT` must be a `mailto:` or `https:` URL. It is not a secret. It identifies the sender to push services.

Add the same three variables in the Vercel project settings, then redeploy. The public key is exposed to the browser by design. The private key must stay on the server.

## 3. Apply the database migration

The migration is `supabase/migrations/20261020132000_push_subscriptions.sql`. It stores `endpoint`, `p256dh`, and `auth` per signed-in user, with row level security so a user can only read and change their own rows.

```bash
npm run supabase:migration:list
npm run supabase:db:push:dry-run
npm run supabase:db:push
```

Confirm `20261020132000` appears on both local and remote.

## 4. What was added

- `src/app/manifest.ts` — standalone Home Screen manifest using the existing dark theme.
- `public/icon-192.png`, `public/icon-512.png`, `src/app/icon.png`, `src/app/apple-icon.png` — Home Screen icons. There was no previous app icon set.
- `public/sw.js` — the only service worker. It shows a notification as soon as a push arrives and opens the URL in the payload (default `/today`).
- Profile → **Enable notifications** — permission is requested only from that button.
- **Send test notification** — calls a signed-in server action. It is not a public send URL.

## 5. Test on iPhone

Web Push on iPhone requires iOS 16.4 or later and the app opened from the Home Screen. A normal Safari tab cannot subscribe.

1. Deploy, or run locally with HTTPS (`npx next dev --experimental-https`).
2. Open the site in Safari.
3. Tap Share → Add to Home Screen.
4. Open **AI Gym Coach** from the new icon (not the Safari tab).
5. Sign in and open Profile.
6. Tap **Enable notifications** and allow the system prompt.
7. Tap **Send test notification**. A real push should appear even if you leave the app.

If permission was denied: iPhone Settings → Notifications → AI Gym Coach → Allow.

If the button says to add the app to the Home Screen, you are still in a Safari tab.

## 6. Test on desktop

Use Chrome, Edge, Firefox, or Safari 16 on macOS 13+. Open Profile while signed in, tap **Enable notifications**, then **Send test notification**.

## 7. Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
npm test
```

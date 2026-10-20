/* AI Gym Coach service worker — push display only. No offline caching. */

self.addEventListener("push", (event) => {
  let title = "AI Gym Coach";
  let body = "You have a new update.";
  let url = "/today";

  try {
    if (event.data) {
      const data = event.data.json();
      if (typeof data.title === "string" && data.title.trim()) {
        title = data.title.trim().slice(0, 80);
      }
      if (typeof data.body === "string" && data.body.trim()) {
        body = data.body.trim().slice(0, 180);
      }
      if (typeof data.url === "string" && data.url.startsWith("/")) {
        url = data.url;
      }
    }
  } catch {
    // Still show a notification. Safari revokes push permission if a push
    // event does not display one.
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path =
    event.notification.data &&
    typeof event.notification.data.url === "string" &&
    event.notification.data.url.startsWith("/")
      ? event.notification.data.url
      : "/today";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.focus().then((focused) => {
              if (focused && "navigate" in focused) {
                return focused.navigate(target);
              }
              return focused;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
        return undefined;
      }),
  );
});

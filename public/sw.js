/* Service Worker do SIGEP-18BPM
   - habilita instalacao (PWA)
   - recebe e exibe notificacoes Web Push
   - abre o sistema ao clicar na notificacao
*/

self.addEventListener('install', (event) => {
  // ativa o novo SW imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe um push e mostra a notificacao
self.addEventListener('push', (event) => {
  let dados = {
    title: 'SIGEP 18º BPM',
    body: 'Você tem uma nova notificação.',
    url: '/dashboard',
  };

  try {
    if (event.data) {
      dados = { ...dados, ...event.data.json() };
    }
  } catch (e) {
    // payload nao-JSON: usa o texto cru no corpo
    if (event.data) dados.body = event.data.text();
  }

  const opcoes = {
    body: dados.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: dados.url || '/dashboard' },
    vibrate: [120, 60, 120],
    tag: dados.tag || 'sigep',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(dados.title, opcoes));
});

// Clique na notificacao: foca uma aba aberta ou abre uma nova
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) {
          cliente.navigate(destino);
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
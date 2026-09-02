/* Service Worker do SIGEP-18BPM
   - habilita instalacao (PWA)
   - recebe e exibe notificacoes Web Push
   - abre o sistema ao clicar na notificacao
   - no chat: botao "Marcar como lida" direto no aviso e bolinha com o total
     de nao lidas no icone do app
*/

self.addEventListener('install', (event) => {
  // ativa o novo SW imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Bolinha com o numero no icone do app (Android/desktop instalados).
// Onde nao existe, simplesmente nao faz nada.
function bolinha(n) {
  try {
    if (typeof n !== 'number' || n < 0) return;
    if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {});
    if (n === 0 && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* navegador sem suporte */ }
}

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

  const ehChat = dados.tipo === 'chat' && !!dados.com;

  const opcoes = {
    body: dados.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: dados.url || '/dashboard', com: dados.com || null, tipo: dados.tipo || null },
    vibrate: [120, 60, 120],
    tag: dados.tag || 'sigep',
    renotify: true,
    // no chat, da para resolver pela propria notificacao
    actions: ehChat
      ? [
          { action: 'abrir', title: 'Responder' },
          { action: 'lida', title: 'Marcar como lida' },
        ]
      : [],
  };

  bolinha(dados.contador);
  event.waitUntil(self.registration.showNotification(dados.title, opcoes));
});

// Clique na notificacao: foca uma aba aberta ou abre uma nova.
// No botao "Marcar como lida" nao abre nada: so limpa e sai.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const dados = event.notification.data || {};
  const destino = dados.url || '/dashboard';

  if (event.action === 'lida' && dados.com) {
    event.waitUntil(
      fetch('/api/chat/lida', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ com: dados.com }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && typeof d.naoLidas === 'number') bolinha(d.naoLidas); })
        .catch(() => { /* sem rede: fica como estava, a pessoa abre depois */ })
    );
    return;
  }

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

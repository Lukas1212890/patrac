const CACHE = 'patrac-assets-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/patrac-mobile.webp', '/patrac-forest.webp', '/offline.html']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('patrac-') && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); return; }
  if (['/patrac-mobile.webp', '/patrac-forest.webp'].includes(url.pathname) || url.pathname.startsWith('/vendor/')) event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const title=typeof data.title==='string'?data.title:'Pátrač – administrace';
 event.waitUntil(self.registration.showNotification(title,{body:typeof data.body==='string'?data.body:'Nové upozornění v administraci.',icon:'/patrac-admin-icon-192.png',badge:'/patrac-admin-icon-192.png',tag:typeof data.tag==='string'?data.tag:'patrac-admin',data:{url:'/admin'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){const url=new URL(client.url);if(url.origin===self.location.origin&&url.pathname==='/admin'){await client.focus();return;}}await self.clients.openWindow('/admin');})());
});

// A separate IndexedDB holds large photo drafts without localStorage's cap.
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('patrac-drafts-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function draftOperation(action, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('drafts');
    const request = action === 'get' ? store.get('current') : action === 'delete' ? store.delete('current') : store.put(value, 'current');
    tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

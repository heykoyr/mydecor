'use client';

/**
 * Local persistence.
 *
 * The product is local-first for now: a scan is usable the moment it is taken,
 * with no account, no upload, and no round trip. That is a deliberate product
 * position as much as a technical one — people are photographing the inside of
 * their homes, and not sending those photos anywhere is a feature.
 *
 * Everything goes through the repository interfaces in this directory, so
 * moving a store to a server (Postgres behind an API route, object storage for
 * images) is a new implementation of one interface, not a rewrite of the
 * screens that read it.
 */

const DB_NAME = 'mydecor';
const DB_VERSION = 1;

export const STORES = {
  rooms: 'rooms',
  savedProducts: 'savedProducts',
  visualizations: 'visualizations',
  preferences: 'preferences',
  analytics: 'analytics',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let connection: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser has no IndexedDB support.'));
  }

  if (connection) return connection;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.rooms)) {
        db.createObjectStore(STORES.rooms, { keyPath: 'id' }).createIndex(
          'createdAt',
          'createdAt',
        );
      }
      if (!db.objectStoreNames.contains(STORES.savedProducts)) {
        db.createObjectStore(STORES.savedProducts, { keyPath: 'productId' });
      }
      if (!db.objectStoreNames.contains(STORES.visualizations)) {
        db.createObjectStore(STORES.visualizations, { keyPath: 'id' }).createIndex(
          'roomId',
          'roomId',
        );
      }
      if (!db.objectStoreNames.contains(STORES.preferences)) {
        db.createObjectStore(STORES.preferences);
      }
      if (!db.objectStoreNames.contains(STORES.analytics)) {
        db.createObjectStore(STORES.analytics, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local store.'));
    // Private browsing modes and quota refusals surface here.
    request.onblocked = () => reject(new Error('The local store is blocked by another tab.'));
  });

  connection = pending;
  // Never cache a failed connection: the next caller should get a fresh attempt.
  pending.catch(() => {
    if (connection === pending) connection = null;
  });

  return pending;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = operation(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(`Store operation failed: ${store}`));
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) =>
    run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),

  getAll: <T>(store: StoreName) =>
    run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),

  put: <T>(store: StoreName, value: T, key?: IDBValidKey) =>
    run<IDBValidKey>(store, 'readwrite', (s) => s.put(value as unknown as object, key)),

  delete: (store: StoreName, key: IDBValidKey) =>
    run<undefined>(store, 'readwrite', (s) => s.delete(key)),

  clear: (store: StoreName) => run<undefined>(store, 'readwrite', (s) => s.clear()),
};

/** True when local persistence is usable. Private modes can refuse it. */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await openDatabase();
    return true;
  } catch {
    return false;
  }
}

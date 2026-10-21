import type { PracticeTrack } from '../types';

export interface SavedPractice {
  id: string;
  track: PracticeTrack;
  audio?: Blob;
  audioKind?: 'original' | 'synthesized';
  synthSignature?: string;
  image?: Blob;
  updatedAt: number;
}

let connection: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('stringnote-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('practices', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(new Error('本机存储暂不可用，请导出曲谱备份。')); };
  });
  return connection;
}

export async function getLibrary(): Promise<SavedPractice[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('practices').objectStore('practices').getAll();
    request.onsuccess = () => resolve((request.result as SavedPractice[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(new Error('读取本机谱库失败。'));
  });
}

export async function savePractice(record: SavedPractice): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('practices', 'readwrite');
    transaction.objectStore('practices').put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('保存失败，可能是本机存储空间不足。请先导出曲谱。'));
    transaction.onabort = () => reject(new Error('保存中断，请导出曲谱备份。'));
  });
}

export async function removePractice(id: string): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('practices', 'readwrite');
    transaction.objectStore('practices').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('删除失败，请重试。'));
  });
}

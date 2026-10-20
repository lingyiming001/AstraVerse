import type { Resource } from "@/features/library/resources";
export interface StoredResource extends Omit<Resource, "url"> {
  blob: Blob;
}
const DATABASE = "astraverse-library";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("resources"))
        request.result.createObjectStore("resources", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("浏览器本地资源存储不可用"));
    request.onblocked = () =>
      reject(new Error("本地资源库被其他页面占用，请刷新其他页面后重试"));
  });
}
export async function readLocalResources(): Promise<StoredResource[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("resources", "readonly");
    const request = transaction.objectStore("resources").getAll();
    request.onsuccess = () => resolve(request.result as StoredResource[]);
    request.onerror = () => reject(new Error("本地资源读取失败"));
    transaction.oncomplete = () => db.close();
    transaction.onabort = () => {
      db.close();
      reject(new Error("本地资源读取被中断"));
    };
  });
}
export async function saveLocalResource(
  resource: Resource,
  blob: Blob,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("resources", "readwrite");
    const { url, ...metadata } = resource;
    transaction
      .objectStore("resources")
      .put({ ...metadata, persistent: true, blob });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(new Error("本地空间不足或资源保存失败"));
    };
  });
}
export async function deleteLocalResource(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("resources", "readwrite");
    transaction.objectStore("resources").delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(new Error("资源删除失败，请重试"));
    };
  });
}

export async function updateLocalResource(
  id: string,
  patch: Pick<Resource, "name" | "description">,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("resources", "readwrite");
    const store = tx.objectStore("resources");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...patch });
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("资源信息保存失败"));
    };
  });
}

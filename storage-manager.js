// Storage Manager - handles all storage operations
class StorageManager {
    constructor() {
        this.CACHE_NAME = 'documents-cache-v1';
        this.DB_NAME = 'jpbilpleie';
        this.STORE_NAME = 'documents';
        this.directory = null;
    }

    // Initialize storage
    async init() {
        // Request persistent storage permission
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Persistent storage granted: ${isPersisted}`);
        }

        // Open IndexedDB
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };
        });

        // Try to get file system access
        try {
            this.directory = await navigator.storage.getDirectory();
        } catch (e) {
            console.warn('File System Access not available:', e);
        }

        return db;
    }

    // Save document to all available storages
    async saveDocument(entry, dataUri) {
        const id = Date.now().toString();
        const fileName = this._generateFileName(entry);
        const blob = await fetch(dataUri).then(r => r.blob());

        try {
            // 1. Save to Cache Storage
            const cache = await caches.open(this.CACHE_NAME);
            await cache.put(
                `/documents/${fileName}`,
                new Response(blob, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'X-Document-ID': id,
                        'X-Document-Meta': JSON.stringify(entry)
                    }
                })
            );

            // 2. Save to IndexedDB
            const db = await this.init();
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.add({
                    id,
                    fileName,
                    entry,
                    dataUri,
                    timestamp: Date.now()
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // 3. Try to save to File System
            if (this.directory) {
                try {
                    const fileHandle = await this.directory.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (e) {
                    console.warn('Failed to save to file system:', e);
                }
            }

            return { id, fileName };
        } catch (e) {
            console.error('Failed to save document:', e);
            throw e;
        }
    }

    // Try to send document to server
    async sendDocument(id) {
        try {
            // First try Cache Storage
            const cache = await caches.open(this.CACHE_NAME);
            const cacheKeys = await cache.keys();
            const cacheMatch = cacheKeys.find(key => 
                key.url.includes(id) || 
                key.headers?.get('X-Document-ID') === id
            );

            if (cacheMatch) {
                const response = await cache.match(cacheMatch);
                const meta = JSON.parse(response.headers.get('X-Document-Meta'));
                const blob = await response.blob();
                const success = await this._sendToServer(meta, blob);
                if (success) {
                    await this.deleteDocument(id);
                    return true;
                }
            }

            // If not in cache, try IndexedDB
            const db = await this.init();
            const doc = await new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (doc) {
                const blob = await fetch(doc.dataUri).then(r => r.blob());
                const success = await this._sendToServer(doc.entry, blob);
                if (success) {
                    await this.deleteDocument(id);
                    return true;
                }
            }

            return false;
        } catch (e) {
            console.error('Failed to send document:', e);
            return false;
        }
    }

    // Delete document from all storages
    async deleteDocument(id) {
        try {
            // Delete from Cache Storage
            const cache = await caches.open(this.CACHE_NAME);
            const cacheKeys = await cache.keys();
            const cacheMatch = cacheKeys.find(key => 
                key.url.includes(id) || 
                key.headers?.get('X-Document-ID') === id
            );
            if (cacheMatch) {
                await cache.delete(cacheMatch);
            }

            // Delete from IndexedDB
            const db = await this.init();
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Try to delete from File System
            if (this.directory) {
                try {
                    const fileName = `${id}.pdf`;
                    await this.directory.removeEntry(fileName);
                } catch (e) {
                    console.warn('Failed to delete from file system:', e);
                }
            }
        } catch (e) {
            console.error('Failed to delete document:', e);
            throw e;
        }
    }

    // Get all pending documents
    async getPendingDocuments() {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('Failed to get pending documents:', e);
            return [];
        }
    }

    // Private helper methods
    _generateFileName(entry) {
        const brandLabel = [entry.car.brand, entry.car.model]
            .filter(Boolean)
            .join('_') || 'uten_merke';
        return `jp_bilpleie_${brandLabel}_${entry.date||''}_${Date.now()}.pdf`
            .replace(/\s+/g,'_')
            .toLowerCase();
    }

    async _sendToServer(entry, blob) {
        try {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });

            const response = await fetch('https://script.google.com/macros/s/AKfycbxVa38bi3gpRpy99fnvfSRtHDt8naGRo2haCpG7BraxdnwQHwhcnQMfvoUo7VIZTkMx/exec', {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    fileName: this._generateFileName(entry),
                    pdfBase64: base64,
                    companyCode: entry.companyCode,
                    companyName: entry.companyName,
                    date: entry.date,
                    brand: entry.car.brand || "",
                    model: entry.car.model || ""
                })
            });

            return true;
        } catch (e) {
            console.error('Failed to send to server:', e);
            return false;
        }
    }
}
/* ============================================================
   MEDICAL STUDY HUB — LIBRARY ENGINE
   File upload, IndexedDB storage, topic tagging, search
   ============================================================ */

'use strict';

const LibraryEngine = {

  /* ── Upload File ── */
  async uploadFile(file) {
    if (!file) return null;

    // Validate type
    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
      Toast.show('Only .txt files are accepted', 'error');
      return null;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      Toast.show('File too large. Maximum size is 10MB', 'error');
      return null;
    }

    try {
      const content = await this.readFileAsText(file);

      // Check for duplicate filename
      const existing = await DB.getAllFiles();
      const duplicate = existing.find(f => f.filename === file.name);
      if (duplicate) {
        Toast.show(`"${file.name}" already exists. Delete it first to re-upload.`, 'warning');
        return null;
      }

      const topics = autoTagTopics(content);

      const fileObj = {
        filename: file.name,
        content: content,
        uploadDate: new Date().toISOString(),
        charCount: content.length,
        topics: topics,
      };

      const id = await DB.addFile(fileObj);
      fileObj.id = id;

      Toast.show(`"${file.name}" uploaded successfully`, 'success');
      return fileObj;
    } catch (err) {
      console.error('Upload error:', err);
      Toast.show(`Upload failed: ${err.message}`, 'error');
      return null;
    }
  },

  /* ── Read File as Text ── */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsText(file, 'UTF-8');
    });
  },

  /* ── Get All Files ── */
  async getAllFiles() {
    try {
      return await DB.getAllFiles();
    } catch (err) {
      console.error('Error loading files:', err);
      return [];
    }
  },

  /* ── Delete File ── */
  async deleteFile(id) {
    try {
      await DB.deleteFile(id);
      Toast.show('File deleted', 'success');
      return true;
    } catch (err) {
      Toast.show('Failed to delete file', 'error');
      return false;
    }
  },

  /* ── Clear All Files ── */
  async clearAll() {
    try {
      await DB.clearAll();
      Toast.show('All notes cleared', 'success');
      return true;
    } catch (err) {
      Toast.show('Failed to clear notes', 'error');
      return false;
    }
  },

  /* ── Search Across All Files ── */
  async search(keyword) {
    if (!keyword || keyword.trim().length < 2) return [];

    const files = await this.getAllFiles();
    const results = [];
    const lower = keyword.toLowerCase();

    files.forEach(file => {
      const content = file.content.toLowerCase();
      let pos = content.indexOf(lower);
      while (pos !== -1 && results.length < 50) {
        // Extract context around match
        const start = Math.max(0, pos - 100);
        const end = Math.min(file.content.length, pos + keyword.length + 100);
        const snippet = file.content.substring(start, end);

        results.push({
          filename: file.filename,
          fileId: file.id,
          snippet: (start > 0 ? '...' : '') + snippet + (end < file.content.length ? '...' : ''),
          position: pos,
        });

        pos = content.indexOf(lower, pos + 1);
        if (results.length >= 30) break; // limit per-file
      }
    });

    return results;
  },

  /* ── Get Storage Stats ── */
  async getStorageStats() {
    const files = await this.getAllFiles();
    const totalChars = files.reduce((sum, f) => sum + (f.charCount || 0), 0);
    const estimatedBytes = totalChars * 2; // rough UTF-16 estimate
    const mb = (estimatedBytes / (1024 * 1024)).toFixed(2);
    return {
      fileCount: files.length,
      totalChars,
      estimatedMB: mb,
    };
  },

  /* ── Format File Size ── */
  formatSize(charCount) {
    const kb = (charCount / 500).toFixed(1); // rough KB estimate
    if (parseFloat(kb) > 1000) {
      return `${(charCount / 500000).toFixed(2)} MB`;
    }
    return `${kb} KB (~${charCount.toLocaleString()} chars)`;
  },

  /* ── Format Date ── */
  formatDate(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return isoString; }
  },
};

window.LibraryEngine = LibraryEngine;

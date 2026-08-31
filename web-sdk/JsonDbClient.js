/**
 * Unified JSON REST DB Client SDK for Web / Node.js
 * Supports Master Developer Management, App-User Auth, and Document CRUD.
 */
export class JsonDbClient {
    /**
     * @param {string} [baseUrl='http://localhost:4000'] - REST API Server base URL
     * @param {string} [projectId=null] - Default Project ID for app-user mode
     */
    constructor(baseUrl = 'http://localhost:4000', projectId = null) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.projectId = projectId;

        this.token = this._loadStorage('auth_token') || this._loadStorage('dev_token');
        this.username = this._loadStorage('auth_user') || this._loadStorage('dev_username');
        this.role = this._loadStorage('auth_role');
    }

    // ====================================================
    // 1. MASTER DEVELOPER AUTHENTICATION
    // ====================================================

    async registerDev(username, password) {
        const res = await fetch(`${this.baseUrl}/api/auth/dev/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return await this._handleResponse(res);
    }

    async loginDev(username, password) {
        const res = await fetch(`${this.baseUrl}/api/auth/dev/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await this._handleResponse(res);
        this.token = data.token;
        this.username = data.username;
        this.role = 'dev';

        this._saveStorage('dev_token', data.token);
        this._saveStorage('dev_username', data.username);
        this._saveStorage('auth_token', data.token);
        this._saveStorage('auth_user', data.username);
        this._saveStorage('auth_role', 'dev');

        return data;
    }

    // ====================================================
    // 2. PROJECT SUB-ACCOUNT (APP USER) AUTHENTICATION
    // ====================================================

    async register(username, password, projectId = this.projectId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return await this._handleResponse(res);
    }

    async login(username, password, projectId = this.projectId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await this._handleResponse(res);
        this.token = data.token;
        this.username = data.username;
        this.projectId = data.projectId;
        this.role = 'app_user';

        this._saveStorage('auth_token', data.token);
        this._saveStorage('auth_user', data.username);
        this._saveStorage('auth_role', 'app_user');
        this._saveStorage('auth_project_id', data.projectId);

        return data;
    }

    logout() {
        this.token = null;
        this.username = null;
        this.role = null;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_role');
            localStorage.removeItem('dev_token');
            localStorage.removeItem('dev_username');
            localStorage.removeItem('auth_project_id');
        }
    }

    // ====================================================
    // 3. PROJECT MANAGEMENT (Developer Privileges)
    // ====================================================

    async listProjects() {
        const res = await fetch(`${this.baseUrl}/api/dev/projects`, { headers: this._headers() });
        return await this._handleResponse(res);
    }

    async createProject(name) {
        const res = await fetch(`${this.baseUrl}/api/dev/projects`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ name })
        });
        return await this._handleResponse(res);
    }

    async deleteProject(projectId) {
        const res = await fetch(`${this.baseUrl}/api/dev/projects/${projectId}`, {
            method: 'DELETE',
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    // ====================================================
    // 4. SUB-ACCOUNT MANAGEMENT (Developer Privileges)
    // ====================================================

    async listSubUsers(projectId = this.projectId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/users`, { headers: this._headers() });
        return await this._handleResponse(res);
    }

    async createSubUser(projectId = this.projectId, username, password) {
        return await this.register(username, password, projectId);
    }

    async deleteSubUser(projectId = this.projectId, userId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/users/${userId}`, {
            method: 'DELETE',
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    // ====================================================
    // 5. DATABASE & COLLECTION MANAGEMENT
    // ====================================================

    async listDatabases(projectId = this.projectId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases`, { headers: this._headers() });
        return await this._handleResponse(res);
    }

    async createDatabase(projectId = this.projectId, name) {
        let projId = projectId;
        let dbName = name;
        if (!name && this.projectId) {
            dbName = projectId;
            projId = this.projectId;
        }
        projId = this._resolveProjectId(projId);

        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ name: dbName })
        });
        return await this._handleResponse(res);
    }

    async deleteDatabase(projectId = this.projectId, name) {
        let projId = projectId;
        let dbName = name;
        if (!name && this.projectId) {
            dbName = projectId;
            projId = this.projectId;
        }
        projId = this._resolveProjectId(projId);

        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases/${dbName}`, {
            method: 'DELETE',
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    async listCollections(projectId = this.projectId, database) {
        let projId = projectId;
        let db = database;
        if (!database && this.projectId) {
            db = projectId;
            projId = this.projectId;
        }
        projId = this._resolveProjectId(projId);

        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases/${db}/collections`, {
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    async createCollection(projectId = this.projectId, database, name) {
        let projId = projectId;
        let db = database;
        let colName = name;
        if (arguments.length === 2 && this.projectId) {
            db = arguments[0];
            colName = arguments[1];
            projId = this.projectId;
        }
        projId = this._resolveProjectId(projId);

        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases/${db}/collections`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({ name: colName })
        });
        return await this._handleResponse(res);
    }

    async deleteCollection(projectId = this.projectId, database, name) {
        let projId = projectId;
        let db = database;
        let colName = name;
        if (arguments.length === 2 && this.projectId) {
            db = arguments[0];
            colName = arguments[1];
            projId = this.projectId;
        }
        projId = this._resolveProjectId(projId);

        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/databases/${db}/collections/${colName}`, {
            method: 'DELETE',
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    // ====================================================
    // 6. DOCUMENT CRUD OPERATIONS
    // ====================================================

    async getAllDocs(projectId, database, collection, filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const url = `${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs${params ? `?${params}` : ''}`;
        const res = await fetch(url, { headers: this._headers() });
        const result = await this._handleResponse(res);
        if (Array.isArray(result)) return result;
        if (result && typeof result === 'object') return [result];
        return [];
    }

    async getAll(database, collection, filters = {}) {
        return await this.getAllDocs(this._resolveProjectId(this.projectId), database, collection, filters);
    }

    async createDoc(projectId, database, collection, data) {
        const payload = { ...data };
        delete payload.id;
        delete payload._id;

        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(payload)
        });
        return await this._handleResponse(res);
    }

    async create(database, collection, data) {
        return await this.createDoc(this._resolveProjectId(this.projectId), database, collection, data);
    }

    async updateDoc(projectId, database, collection, id, data) {
        const payload = { ...data };
        delete payload.id;
        delete payload._id;

        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs/${id}`, {
            method: 'PUT',
            headers: this._headers(),
            body: JSON.stringify(payload)
        });
        return await this._handleResponse(res);
    }

    async update(database, collection, id, data) {
        return await this.updateDoc(this._resolveProjectId(this.projectId), database, collection, id, data);
    }

    async deleteDoc(projectId, database, collection, id) {
        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs/${id}`, {
            method: 'DELETE',
            headers: this._headers()
        });
        return await this._handleResponse(res);
    }

    async delete(database, collection, id) {
        return await this.deleteDoc(this._resolveProjectId(this.projectId), database, collection, id);
    }

    // ====================================================
    // INTERNAL HELPERS & ROBUST TOKENIZER
    // ====================================================

    _resolveProjectId(passedId) {
        const id = passedId || this.projectId;
        if (!id) throw new Error('[JsonDbClient] Missing projectId. Pass a projectId or set one in constructor.');
        return id;
    }

    _headers() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        return headers;
    }

    async _handleResponse(res) {
        const text = await res.text();
        let data = null;

        try {
            data = this._parseJsonSafely(text);
        } catch (err) {
            data = { raw: text, parseError: err.message };
        }

        if (!res.ok) {
            const serverMsg = (data && typeof data === 'object') 
                ? (data.error || data.message || (data.errors ? JSON.stringify(data.errors) : null)) 
                : null;
            const errorMsg = serverMsg || `HTTP ${res.status}: ${res.statusText} (${text.slice(0, 250)})`;
            throw new Error(errorMsg);
        }

        return data;
    }

    _parseJsonSafely(text) {
        if (!text || typeof text !== 'string') return text;
        const trimmed = text.trim();
        if (!trimmed) return null;

        try {
            return JSON.parse(trimmed);
        } catch (_) {}

        const results = [];
        let inString = false;
        let isEscaped = false;
        let braceDepth = 0;
        let bracketDepth = 0;
        let startIndex = -1;

        for (let i = 0; i < trimmed.length; i++) {
            const char = trimmed[i];

            if (isEscaped) { isEscaped = false; continue; }
            if (char === '\\' && inString) { isEscaped = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (char === '{') {
                if (braceDepth === 0 && bracketDepth === 0) startIndex = i;
                braceDepth++;
            } else if (char === '}') {
                braceDepth--;
                if (braceDepth === 0 && bracketDepth === 0 && startIndex !== -1) {
                    try { results.push(JSON.parse(trimmed.slice(startIndex, i + 1))); } catch (_) {}
                    startIndex = -1;
                }
            } else if (char === '[') {
                if (braceDepth === 0 && bracketDepth === 0) startIndex = i;
                bracketDepth++;
            } else if (char === ']') {
                bracketDepth--;
                if (braceDepth === 0 && bracketDepth === 0 && startIndex !== -1) {
                    try { results.push(JSON.parse(trimmed.slice(startIndex, i + 1))); } catch (_) {}
                    startIndex = -1;
                }
            }
        }

        if (results.length === 0) throw new Error(`Invalid JSON format: ${trimmed.slice(0, 150)}`);
        if (results.length === 1) return results[0];
        if (results.every(r => Array.isArray(r))) return results.flat();
        return results.flatMap(r => Array.isArray(r) ? r : [r]);
    }

    _saveStorage(key, val) {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
    }

    _loadStorage(key) {
        if (typeof localStorage !== 'undefined') return localStorage.getItem(key) || null;
        return null;
    }
}
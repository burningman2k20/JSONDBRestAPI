/**
 * Unified JSON REST DB Client SDK
 * Supports Dev Master Management, Project Sub-Accounts, and Document CRUD.
 */
export class JsonDbClient {
    /**
     * @param {string} [baseUrl='http://localhost:4000'] - REST API Server base URL
     * @param {string} [projectId=null] - Optional default Project ID for app-user mode
     */
    constructor(baseUrl = 'http://localhost:4000', projectId = null) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.projectId = projectId;

        // Load active tokens and usernames
        this.token = this._loadStorage('auth_token') || this._loadStorage('dev_token');
        this.username = this._loadStorage('auth_user') || this._loadStorage('dev_username');
        this.role = this._loadStorage('auth_role'); // 'dev' or 'app_user'
    }

    // ====================================================
    // 1. MASTER DEVELOPER AUTHENTICATION
    // ====================================================

    /**
     * Register a new Master Developer Account
     */
    async registerDev(username, password) {
        const res = await fetch(`${this.baseUrl}/api/auth/dev/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return await this._handleResponse(res);
    }

    /**
     * Log in as Master Developer and persist dev session
     */
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

    /**
     * Register an end-user / player under a specific project
     */
    async register(username, password, projectId = this.projectId) {
        const projId = this._resolveProjectId(projectId);
        const res = await fetch(`${this.baseUrl}/api/projects/${projId}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return await this._handleResponse(res);
    }

    /**
     * Log in as an end-user / player under a specific project
     */
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

    /**
     * Clear active session (both Dev and App-User tokens)
     */
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
        // If only 1 argument was provided and it's a string, treat as (name)
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

    /**
     * Query all documents in a collection.
     * Can be called as: getAllDocs(projectId, database, collection, filters)
     *               or: getAll(database, collection, filters)
     */
    async getAllDocs(projectId, database, collection, filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const url = `${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs${params ? `?${params}` : ''}`;
        const res = await fetch(url, { headers: this._headers() });
        return await this._handleResponse(res);
    }

    async getAll(database, collection, filters = {}) {
        return await this.getAllDocs(this._resolveProjectId(this.projectId), database, collection, filters);
    }

    /**
     * Create a new document.
     * Can be called as: createDoc(projectId, database, collection, data)
     *               or: create(database, collection, data)
     */
    async createDoc(projectId, database, collection, data) {
        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(data)
        });
        return await this._handleResponse(res);
    }

    async create(database, collection, data) {
        return await this.createDoc(this._resolveProjectId(this.projectId), database, collection, data);
    }

    /**
     * Update a document by ID.
     * Can be called as: updateDoc(projectId, database, collection, id, data)
     *               or: update(database, collection, id, data)
     */
    async updateDoc(projectId, database, collection, id, data) {
        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/databases/${database}/collections/${collection}/docs/${id}`, {
            method: 'PUT',
            headers: this._headers(),
            body: JSON.stringify(data)
        });
        return await this._handleResponse(res);
    }

    async update(database, collection, id, data) {
        return await this.updateDoc(this._resolveProjectId(this.projectId), database, collection, id, data);
    }

    /**
     * Delete a document by ID.
     * Can be called as: deleteDoc(projectId, database, collection, id)
     *               or: delete(database, collection, id)
     */
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
    // INTERNAL HELPERS
    // ====================================================

    _resolveProjectId(passedId) {
        const id = passedId || this.projectId;
        if (!id) {
            throw new Error('[JsonDbClient] Missing projectId. Pass a projectId or set one in constructor.');
        }
        return id;
    }

    _headers() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async _handleResponse(res) {
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
        }
        return data;
    }

    _saveStorage(key, val) {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, val);
        }
    }

    _loadStorage(key) {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key) || null;
        }
        return null;
    }
}
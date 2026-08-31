package com.yourpackage

import android.content.Context
import android.util.Log
import com.google.gson.*
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class JsonDbClient(
    context: Context,
    val projectId: String,
    @PublishedApi internal val baseUrl: String = "http://10.0.2.2:4000"
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    @PublishedApi internal val gson: Gson = GsonBuilder()
        .registerTypeAdapter(
            object : TypeToken<List<ManagerPayRate>>() {}.type,
            ManagerPayRatesDeserializer()
        )
        .create()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val prefs = context.getSharedPreferences("json_db_${projectId}", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("auth_token", null)
        private set(value) = prefs.edit().putString("auth_token", value).apply()

    var username: String?
        get() = prefs.getString("auth_username", null)
        private set(value) = prefs.edit().putString("auth_username", value).apply()

    // 1. App-User Authentication
    suspend fun register(username: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
        val payload = mapOf("username" to username, "password" to pass)
        val body = gson.toJson(payload).toRequestBody(jsonMediaType)
        val request = Request.Builder().url("$baseUrl/api/projects/$projectId/auth/register").post(body).build()

        executeRequest(request).mapCatching { json ->
            json.asJsonObject.get("userId")?.asString ?: "created"
        }
    }

    suspend fun login(username: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
        val payload = mapOf("username" to username, "password" to pass)
        val body = gson.toJson(payload).toRequestBody(jsonMediaType)
        val request = Request.Builder().url("$baseUrl/api/projects/$projectId/auth/login").post(body).build()

        executeRequest(request).mapCatching { json ->
            val authToken = json.asJsonObject.get("token").asString
            this@JsonDbClient.token = authToken
            this@JsonDbClient.username = username
            this@JsonDbClient.prefs.edit().putString("auth_username", username).apply()
            authToken
        }
    }

    fun logout() {
        this.token = null
        this.username = null
        prefs.edit().remove("auth_token").remove("auth_username").apply()
    }

    // 2. Document CRUD Operations
    suspend fun <T> createDocument(db: String, collection: String, data: T): Result<JsonObject> = withContext(Dispatchers.IO) {
        val jsonString = if (data is String) data else gson.toJson(data)
        val body = jsonString.toRequestBody(jsonMediaType)
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs").post(body).build()
        executeRequest(request).mapCatching { it.asJsonObject }
    }

    suspend inline fun <reified T> getDocuments(
        db: String, 
        collection: String, 
        filters: Map<String, String> = emptyMap()
    ): Result<List<T>> = withContext(Dispatchers.IO) {
        val queryParams = if (filters.isNotEmpty()) {
            "?" + filters.entries.joinToString("&") { "${it.key}=${it.value}" }
        } else ""

        val url = "$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs$queryParams"
        val request = authorizedRequest(url).get().build()

        executeRequest(request).mapCatching { json ->
            val type = object : TypeToken<List<T>>() {}.type
            if (json.isJsonArray) {
                gson.fromJson(json, type)
            } else {
                val single = gson.fromJson<T>(json, object : TypeToken<T>() {}.type)
                listOf(single)
            }
        }
    }

    suspend fun <T> updateDocument(db: String, collection: String, id: String, data: T): Result<JsonObject> = withContext(Dispatchers.IO) {
        val jsonString = if (data is String) data else gson.toJson(data)
        val body = jsonString.toRequestBody(jsonMediaType)
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs/$id").put(body).build()
        executeRequest(request).mapCatching { it.asJsonObject }
    }

    suspend fun deleteDocument(db: String, collection: String, id: String): Result<JsonObject> = withContext(Dispatchers.IO) {
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs/$id").delete().build()
        executeRequest(request).mapCatching { it.asJsonObject }
    }

    // 3. Database & Collection Management
    suspend fun listDatabases(): Result<List<String>> = withContext(Dispatchers.IO) {
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases").get().build()
        executeRequest(request).mapCatching { json ->
            gson.fromJson(json, object : TypeToken<List<String>>() {}.type)
        }
    }

    suspend fun listCollections(database: String): Result<List<String>> = withContext(Dispatchers.IO) {
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$database/collections").get().build()
        executeRequest(request).mapCatching { json ->
            gson.fromJson(json, object : TypeToken<List<String>>() {}.type)
        }
    }

    // Request Execution Helper
    @PublishedApi
    internal fun authorizedRequest(url: String): Request.Builder = Request.Builder().url(url).apply {
        token?.let { addHeader("Authorization", "Bearer $it") }
    }

    @PublishedApi
    internal fun executeRequest(request: Request): Result<JsonElement> {
        return try {
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty().trim()
                if (response.isSuccessful) {
                    Result.success(parseJsonSafely(body))
                } else {
                    Log.e("JsonDbClient", "HTTP Error ${response.code} on ${request.url}: $body")
                    Result.failure(Exception("HTTP ${response.code}: $body"))
                }
            }
        } catch (e: Exception) {
            Log.e("JsonDbClient", "Network Exception on ${request.url}", e)
            Result.failure(e)
        }
    }

    @PublishedApi
    internal fun parseJsonSafely(text: String): JsonElement {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return JsonObject()

        try {
            return gson.fromJson(trimmed, JsonElement::class.java)
        } catch (_: Exception) {}

        val elements = mutableListOf<JsonElement>()
        var inString = false
        var isEscaped = false
        var braceDepth = 0
        var bracketDepth = 0
        var startIndex = -1

        for (i in trimmed.indices) {
            val char = trimmed[i]
            if (isEscaped) { isEscaped = false; continue }
            if (char == '\\' && inString) { isEscaped = true; continue }
            if (char == '"') { inString = !inString; continue }
            if (inString) continue

            if (char == '{') {
                if (braceDepth == 0 && bracketDepth == 0) startIndex = i
                braceDepth++
            } else if (char == '}') {
                braceDepth--
                if (braceDepth == 0 && bracketDepth == 0 && startIndex != -1) {
                    val chunk = trimmed.substring(startIndex, i + 1)
                    try { elements.add(gson.fromJson(chunk, JsonElement::class.java)) } catch (_: Exception) {}
                    startIndex = -1
                }
            } else if (char == '[') {
                if (braceDepth == 0 && bracketDepth == 0) startIndex = i
                bracketDepth++
            } else if (char == ']') {
                bracketDepth--;
                if (braceDepth == 0 && bracketDepth == 0 && startIndex != -1) {
                    val chunk = trimmed.substring(startIndex, i + 1)
                    try { elements.add(gson.fromJson(chunk, JsonElement::class.java)) } catch (_: Exception) {}
                    startIndex = -1
                }
            }
        }

        if (elements.isEmpty()) return gson.fromJson(trimmed, JsonElement::class.java)
        if (elements.size == 1) return elements.first()

        val array = JsonArray()
        for (el in elements) {
            if (el.isJsonArray) el.asJsonArray.forEach { array.add(it) } else array.add(el)
        }
        return array
    }
}

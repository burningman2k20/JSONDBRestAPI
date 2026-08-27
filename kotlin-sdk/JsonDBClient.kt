package com.yourpackage

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class JsonDbClient(
    context: Context,
    val projectId: String,
    @PublishedApi internal val baseUrl: String = "http://10.0.2.2:4000"
) {
    private val client = OkHttpClient()
    @PublishedApi internal val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val prefs = context.getSharedPreferences("json_db_${projectId}", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("auth_token", null)
        private set(value) = prefs.edit().putString("auth_token", value).apply()

    var username: String?
        get() = prefs.getString("auth_username", null)
        private set(value) = prefs.edit().putString("auth_username", value).apply()

    // 1. App-User Authentication
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

    // 2. Project Document Operations (CREATE)
    suspend fun <T> createDocument(db: String, collection: String, data: T): Result<JsonObject> = withContext(Dispatchers.IO) {
        val jsonString = if (data is String) data else gson.toJson(data)
        val body = jsonString.toRequestBody(jsonMediaType)
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs").post(body).build()
        executeRequest(request).mapCatching { it.asJsonObject }
    }

    // 3. Project Document Operations (READ - Public Reified Inline)
    suspend inline fun <reified T> getDocuments(db: String, collection: String): Result<List<T>> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs"
        val request = authorizedRequest(url).get().build()

        executeRequest(request).mapCatching { json ->
            val type = object : TypeToken<List<T>>() {}.type
            gson.fromJson(json, type)
        }
    }

    // 4. Project Document Operations (UPDATE / PUT)
    suspend fun <T> updateDocument(db: String, collection: String, id: String, data: T): Result<JsonObject> = withContext(Dispatchers.IO) {
        val jsonString = if (data is String) data else gson.toJson(data)
        val body = jsonString.toRequestBody(jsonMediaType)
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs/$id").put(body).build()
        executeRequest(request).mapCatching { it.asJsonObject }
    }

    // Published internal helper functions
    @PublishedApi
    internal fun authorizedRequest(url: String): Request.Builder = Request.Builder().url(url).apply {
        token?.let { addHeader("Authorization", "Bearer $it") }
    }

    @PublishedApi
    internal fun executeRequest(request: Request): Result<JsonElement> {
        return try {
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    Result.success(gson.fromJson(body, JsonElement::class.java))
                } else {
                    Result.failure(Exception("HTTP ${response.code}: $body"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

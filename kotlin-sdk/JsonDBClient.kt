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
    private val baseUrl: String = "http://10.0.2.2:4000"
) {
    private val client = OkHttpClient()
    private val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val prefs = context.getSharedPreferences("json_db_${projectId}", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("auth_token", null)
        private set(value) = prefs.edit().putString("auth_token", value).apply()

    // 1. App-User Authentication
    suspend fun login(username: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
        val payload = mapOf("username" to username, "password" to pass)
        val body = gson.toJson(payload).toRequestBody(jsonMediaType)
        val request = Request.Builder().url("$baseUrl/api/projects/$projectId/auth/login").post(body).build()

        executeRequest(request) { json ->
            val authToken = json.asJsonObject.get("token").asString
            this@JsonDbClient.token = authToken
            authToken
        }
    }

    // 2. Project Document Operations
    suspend fun <T> createDocument(db: String, collection: String, data: T): Result<JsonObject> = withContext(Dispatchers.IO) {
        val jsonString = if (data is String) data else gson.toJson(data)
        val body = jsonString.toRequestBody(jsonMediaType)
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs").post(body).build()
        executeRequest(request) { it.asJsonObject }
    }

    suspend inline fun <reified T> getDocuments(db: String, collection: String): Result<List<T>> = withContext(Dispatchers.IO) {
        val request = authorizedRequest("$baseUrl/api/projects/$projectId/databases/$db/collections/$collection/docs").get().build()
        executeRequest(request) { json ->
            val type = object : TypeToken<List<T>>() {}.type
            gson.fromJson(json, type)
        }
    }

    private fun authorizedRequest(url: String) = Request.Builder().url(url).apply {
        token?.let { addHeader("Authorization", "Bearer $it") }
    }

    private inline fun <T> executeRequest(request: Request, parser: (JsonElement) -> T): Result<T> {
        return try {
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    Result.success(parser(gson.fromJson(body, JsonElement::class.java)))
                } else {
                    Result.failure(Exception("HTTP ${response.code}: $body"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
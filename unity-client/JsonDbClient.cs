using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Unified JSON REST DB Client SDK for Unity (C#)
/// Supports Player/App-User Authentication and Document CRUD.
/// </summary>
public class JsonDbClient
{
    public string BaseUrl { get; private set; }
    public string ProjectId { get; private set; }
    public string Token { get; private set; }
    public string Username { get; private set; }

    public JsonDbClient(string baseUrl = "http://localhost:4000", string projectId = null)
    {
        BaseUrl = baseUrl.TrimEnd('/');
        ProjectId = projectId;
        Token = PlayerPrefs.GetString($"json_db_{projectId}_token", null);
        Username = PlayerPrefs.GetString($"json_db_{projectId}_user", null);
    }

    // ====================================================
    // 1. APP-USER / PLAYER AUTHENTICATION
    // ====================================================

    [Serializable]
    private class AuthPayload { public string username; public string password; }
    
    [Serializable]
    public class AuthResponse { public string token; public string username; public string userId; public string projectId; public string role; }

    public async Task<AuthResponse> RegisterAsync(string username, string password, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string url = $"{BaseUrl}/api/projects/{projId}/auth/register";
        string jsonBody = JsonUtility.ToJson(new AuthPayload { username = username, password = password });

        string responseText = await SendRequestAsync(url, "POST", jsonBody, false);
        return JsonUtility.FromJson<AuthResponse>(responseText);
    }

    public async Task<AuthResponse> LoginAsync(string username, string password, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string url = $"{BaseUrl}/api/projects/{projId}/auth/login";
        string jsonBody = JsonUtility.ToJson(new AuthPayload { username = username, password = password });

        string responseText = await SendRequestAsync(url, "POST", jsonBody, false);
        AuthResponse res = JsonUtility.FromJson<AuthResponse>(responseText);

        Token = res.token;
        Username = res.username;
        ProjectId = res.projectId;

        PlayerPrefs.SetString($"json_db_{ProjectId}_token", res.token);
        PlayerPrefs.SetString($"json_db_{ProjectId}_user", res.username);
        PlayerPrefs.Save();

        return res;
    }

    public void Logout()
    {
        Token = null;
        Username = null;
        PlayerPrefs.DeleteKey($"json_db_{ProjectId}_token");
        PlayerPrefs.DeleteKey($"json_db_{ProjectId}_user");
        PlayerPrefs.Save();
    }

    // ====================================================
    // 2. DOCUMENT CRUD OPERATIONS
    // ====================================================

    public async Task<string> CreateDocumentAsync(string database, string collection, string jsonPayload, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string url = $"{BaseUrl}/api/projects/{projId}/databases/{database}/collections/{collection}/docs";
        return await SendRequestAsync(url, "POST", jsonPayload, true);
    }

    public async Task<string> CreateDocumentAsync<T>(string database, string collection, T data, string projectId = null)
    {
        return await CreateDocumentAsync(database, collection, JsonUtility.ToJson(data), projectId);
    }

    public async Task<string> GetDocumentsRawAsync(string database, string collection, Dictionary<string, string> filters = null, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string queryParams = "";
        if (filters != null && filters.Count > 0)
        {
            List<string> pairs = new List<string>();
            foreach (var kv in filters) pairs.Add($"{UnityWebRequest.EscapeURL(kv.Key)}={UnityWebRequest.EscapeURL(kv.Value)}");
            queryParams = "?" + string.Join("&", pairs);
        }

        string url = $"{BaseUrl}/api/projects/{projId}/databases/{database}/collections/{collection}/docs{queryParams}";
        return await SendRequestAsync(url, "GET", null, true);
    }

    public async Task<List<T>> GetDocumentsAsync<T>(string database, string collection, Dictionary<string, string> filters = null, string projectId = null)
    {
        string rawJson = await GetDocumentsRawAsync(database, collection, filters, projectId);
        return JsonHelper.FromJsonList<T>(rawJson);
    }

    public async Task<string> UpdateDocumentAsync(string database, string collection, string docId, string jsonPayload, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string url = $"{BaseUrl}/api/projects/{projId}/databases/{database}/collections/{collection}/docs/{docId}";
        return await SendRequestAsync(url, "PUT", jsonPayload, true);
    }

    public async Task<string> UpdateDocumentAsync<T>(string database, string collection, string docId, T data, string projectId = null)
    {
        return await UpdateDocumentAsync(database, collection, docId, JsonUtility.ToJson(data), projectId);
    }

    public async Task<string> DeleteDocumentAsync(string database, string collection, string docId, string projectId = null)
    {
        string projId = ResolveProjectId(projectId);
        string url = $"{BaseUrl}/api/projects/{projId}/databases/{database}/collections/{collection}/docs/{docId}";
        return await SendRequestAsync(url, "DELETE", null, true);
    }

    // ====================================================
    // INTERNAL REQUEST ENGINE
    // ====================================================

    private string ResolveProjectId(string passedId)
    {
        string id = !string.IsNullOrEmpty(passedId) ? passedId : ProjectId;
        if (string.IsNullOrEmpty(id)) throw new Exception("[JsonDbClient] Missing Project ID.");
        return id;
    }

    private Task<string> SendRequestAsync(string url, string method, string jsonBody, bool authenticated)
    {
        var tcs = new TaskCompletionSource<string>();

        UnityWebRequest request = new UnityWebRequest(url, method);
        if (!string.IsNullOrEmpty(jsonBody))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
        }
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");

        if (authenticated && !string.IsNullOrEmpty(Token))
        {
            request.SetRequestHeader("Authorization", $"Bearer {Token}");
        }

        var operation = request.SendWebRequest();
        operation.completed += _ =>
        {
            if (request.result == UnityWebRequest.Result.Success)
            {
                tcs.SetResult(request.downloadHandler.text);
            }
            else
            {
                string errorBody = request.downloadHandler != null ? request.downloadHandler.text : "";
                tcs.SetException(new Exception($"HTTP {request.responseCode} ({request.error}): {errorBody}"));
            }
            request.Dispose();
        };

        return tcs.Task;
    }

    // Helper to deserialize top-level JSON arrays using Unity's JsonUtility
    public static class JsonHelper
    {
        [Serializable]
        private class Wrapper<T> { public T[] items; }

        public static List<T> FromJsonList<T>(string json)
        {
            if (string.IsNullOrEmpty(json)) return new List<T>();
            string wrapped = "{\"items\":" + json.Trim() + "}";
            Wrapper<T> wrapper = JsonUtility.FromJson<Wrapper<T>>(wrapped);
            return wrapper != null && wrapper.items != null ? new List<T>(wrapper.items) : new List<T>();
        }
    }
}
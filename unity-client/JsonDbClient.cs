using System;
using System.Text;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class JsonDbClient : MonoBehaviour
{
    [Header("API Config")]
    public string baseUrl = "http://localhost:4000";
    private string authToken = "";

    [Serializable]
    private class AuthRequest
    {
        public string username;
        public string password;
    }

    [Serializable]
    private class AuthResponse
    {
        public string token;
        public string username;
    }

    // 1. Authenticate & Save Session
    public IEnumerator Login(string username, string password, Action<bool, string> callback)
    {
        string endpoint = $"{baseUrl}/api/auth/login";
        string json = JsonUtility.ToJson(new AuthRequest { username = username, password = password });

        using (UnityWebRequest req = new UnityWebRequest(endpoint, "POST"))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
            req.uploadHandler = new UploadHandlerRaw(bodyRaw);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                AuthResponse res = JsonUtility.FromJson<AuthResponse>(req.downloadHandler.text);
                this.authToken = res.token;
                callback?.Invoke(true, "Authentication successful");
            }
            else
            {
                callback?.Invoke(false, req.error + ": " + req.downloadHandler.text);
            }
        }
    }

    // 2. User-scoped Document Operations
    public IEnumerator CreateDocument(string db, string collection, string jsonBody, Action<bool, string> callback)
    {
        string endpoint = $"{baseUrl}/api/databases/{db}/{collection}";
        yield return SendAuthorizedRequest(endpoint, "POST", jsonBody, callback);
    }

    public IEnumerator GetDocuments(string db, string collection, Action<bool, string> callback)
    {
        string endpoint = $"{baseUrl}/api/databases/{db}/{collection}";
        yield return SendAuthorizedRequest(endpoint, "GET", null, callback);
    }

    public IEnumerator UpdateDocument(string db, string collection, string id, string jsonBody, Action<bool, string> callback)
    {
        string endpoint = $"{baseUrl}/api/databases/{db}/{collection}/{id}";
        yield return SendAuthorizedRequest(endpoint, "PUT", jsonBody, callback);
    }

    public IEnumerator DeleteDocument(string db, string collection, string id, Action<bool, string> callback)
    {
        string endpoint = $"{baseUrl}/api/databases/{db}/{collection}/{id}";
        yield return SendAuthorizedRequest(endpoint, "DELETE", null, callback);
    }

    private IEnumerator SendAuthorizedRequest(string uri, string method, string jsonBody, Action<bool, string> callback)
    {
        using (UnityWebRequest req = new UnityWebRequest(uri, method))
        {
            if (!string.IsNullOrEmpty(jsonBody))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
            }

            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("Authorization", $"Bearer {authToken}");

            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                callback?.Invoke(true, req.downloadHandler.text);
            }
            else
            {
                callback?.Invoke(false, req.error + ": " + req.downloadHandler.text);
            }
        }
    }
}
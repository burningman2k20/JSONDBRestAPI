# JSONDBRestAPI

Rest API code for web, and kotlin included.Wil upload examples soon.

Developer Documentation & Usage Guide

Architecture Overview

+-------------------------------+
                        |   REST API Server (Port 4000) |
                        +---------------+---------------+
                                        |
       +--------------------------------+--------------------------------+
       |                                |                                |
+------v-------+                +-------v-------+                +-------v-------+
|   Web App    |                |  Android App  |                |   Unity App   |
| (Javascript) |                |   (Kotlin)    |                |     (C#)      |
+--------------+                +---------------+                +---------------+

The database engine runs an isolated, multi-tenant JSON REST architecture:
Each app communicates with an assigned Project ID (proj_xxxxxxxx).
Collections are automatically mapped to .json files inside data/projects/<projId>/databases/<dbName>/.
All write operations use atomic file locks, ensuring concurrent web and mobile clients never overwrite or corrupt data.
SDK Usage by Platform

## 🌐 Web / React / Vite (JavaScript)
1. Initialization
`
JavaScript
import { JsonDbClient } from './JsonDbClient';

const client = new JsonDbClient('http://localhost:4000', 'proj_50ea309f');
`
2. User Authentication
```
JavaScript
// Register a new user
await client.register('john_doe', 'Password123');

// Login and cache session
const session = await client.login('john_doe', 'Password123');
console.log('Logged in as:', session.username, 'Token:', client.token);

// Logout (clears localStorage)
client.logout();
```

3. Document CRUD

```
JavaScript
const DB = 'work_manager_db';
const COL = 'time_logs';

// CREATE
const newLog = await client.create(DB, COL, {
  username: 'john_doe',
  clock_in: new Date().toISOString(),
  status: 'active',
  total_break_minutes: 0
});

// READ with Filters (e.g., ?username=john_doe)
const activeLogs = await client.getAll(DB, COL, { username: 'john_doe', status: 'active' });

// UPDATE (auto-strips immutable ID)
await client.update(DB, COL, newLog._id, {
  ...newLog,
  status: 'completed',
  clock_out: new Date().toISOString()
});

// DELETE
await client.delete(DB, COL, newLog._id);
```

# 📱 Android (Kotlin / Coroutines)
1. Initialization & Dependency
Ensure your app/build.gradle.kts has OkHttp and Gson:
11
Kotlin
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.google.code.gson:gson:2.10.1")
Instantiate the client:
```
Kotlin
val client = JsonDbClient(
    context = applicationContext,
    projectId = "proj_50ea309f",
    baseUrl = "http://10.0.2.2:4000" // Use 10.0.2.2 for Android Emulator, or LAN IP for hardware devices
)
```
2. Authentication Flow
```
Kotlin
// Login in ViewModel / CoroutineScope
viewModelScope.launch {
    client.login("john_doe", "Password123")
        .onSuccess { token ->
            Log.d("Auth", "Authenticated successfully with token: $token")
        }
        .onFailure { error ->
            Log.e("Auth", "Login failed: ${error.message}")
        }
}
```
3. Strongly-Typed Document CRUD
```
Kotlin
data class PlayerScore(
    val username: String,
    val score: Int,
    val level: Int
)

// CREATE
val newScore = PlayerScore("john_doe", 4500, 5)
client.createDocument("game_db", "scores", newScore)
    .onSuccess { jsonObject ->
        val generatedId = jsonObject.get("_id").asString
        Log.d("DB", "Score saved with ID: $generatedId")
    }

// READ ALL with Filters (?username=john_doe)
client.getDocuments<PlayerScore>(
    db = "game_db",
    collection = "scores",
    filters = mapOf("username" to "john_doe")
).onSuccess { scoreList ->
    scoreList.forEach { item ->
        Log.d("DB", "Score: ${item.score}, Level: ${item.level}")
    }
}

// UPDATE
client.updateDocument("game_db", "scores", "doc_id_here", updatedScore)

// DELETE
client.deleteDocument("game_db", "scores", "doc_id_here")
```

# 🎮 Unity (C#)
1. Integration
Place JsonDbClient.cs in Assets/Scripts/. Create a manager component:
```
C#
using UnityEngine;
using System.Collections.Generic;

public class GameManager : MonoBehaviour
{
    private JsonDbClient client;

    [System.Serializable]
    public class PlayerProfile
    {
        public string username;
        public int gold;
        public int level;
    }

    async void Start()
    {
        // 1. Initialize Client
        client = new JsonDbClient("http://localhost:4000", "proj_50ea309f");

        // 2. Authenticate Player
        try
        {
            var auth = await client.LoginAsync("player_one", "SecretPass123");
            Debug.Log($"Welcome back {auth.username}! Token cached.");
        }
        catch
        {
            // If account does not exist, register then login
            await client.RegisterAsync("player_one", "SecretPass123");
            await client.LoginAsync("player_one", "SecretPass123");
            Debug.Log("Account created & logged in.");
        }

        // 3. Save Game Data (CREATE)
        PlayerProfile profile = new PlayerProfile { username = "player_one", gold = 250, level = 3 };
        string responseJson = await client.CreateDocumentAsync("game_db", "profiles", profile);
        Debug.Log("Document Created: " + responseJson);

        // 4. Fetch Game Data (READ with filter ?username=player_one)
        var filters = new Dictionary<string, string> { { "username", "player_one" } };
        List<PlayerProfile> profiles = await client.GetDocumentsAsync<PlayerProfile>("game_db", "profiles", filters);

        if (profiles.Count > 0)
        {
            Debug.Log($"Loaded Profile - Gold: {profiles[0].gold}, Level: {profiles[0].level}");
        }
    }
}
```

REST API Status Codes & Responses

| Status Code                            	| Meaning                                            	| Common Cause                                                               	|
|----------------------------------------	|----------------------------------------------------	|----------------------------------------------------------------------------	|
|                                        	|                                                    	|                                                                            	|
| 200 OK  Request Succeeded              	| Successful read, update, or login request.         	|                                                                            	|
| 201 Created Document / Account Created 	| New document, user account, or project registered. 	|                                                                            	|
| 400 Bad Request                        	| Invalid Payload or Format                          	| Missing fields or illegal characters in collection/database names.         	|
| 401 Unauthorized                       	| Missing or Invalid Token                           	| Bearer token expired, missing, or invalid password.                        	|
| 403 Forbidden                          	| Scope Access Denied                                	| Sub-user attempted to access a database outside their assigned Project ID. 	|
| 404 Not Found                          	| Resource Missing                                   	| Document ID, Collection, or Project ID does not exist on server.           	|
| 409 Conflict                           	| Duplicate Key                                      	| Username or Project identifier is already registered.                      	|
 

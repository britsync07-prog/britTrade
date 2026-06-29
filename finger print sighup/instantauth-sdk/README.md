# InstantAuth SDK – Quick Start

🔹 Step 1: Add SDK
```gradle
implementation 'com.instantauth:sdk:1.0.0'
```

🔹 Step 2: Initialize
```kotlin
InstantAuth.init(
    key = "YOUR_API_KEY",
    url = "https://api.yourdomain.com"
)
```

🔹 Step 3: Add Button
```kotlin
InstantAuthButton {
    AuthManager.startAuth(this) { sessionToken ->
        // user logged in
    }
}
```

🔹 Step 4: Done 🎉

That’s it.

No forms. No password.

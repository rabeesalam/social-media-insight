import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Local-only config (client IDs, Supabase anon key) — never committed. See local.properties.example.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun localProp(key: String) = localProps.getProperty(key) ?: ""

android {
    namespace = "com.puresquare.socialinsight"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.puresquare.socialinsight"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"${localProp("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${localProp("SUPABASE_ANON_KEY")}\"")
        buildConfigField("String", "INSTAGRAM_CLIENT_ID", "\"${localProp("INSTAGRAM_CLIENT_ID")}\"")
        buildConfigField("String", "TIKTOK_CLIENT_KEY", "\"${localProp("TIKTOK_CLIENT_KEY")}\"")
        buildConfigField("String", "YOUTUBE_CLIENT_ID", "\"${localProp("YOUTUBE_CLIENT_ID")}\"")
        buildConfigField("String", "FACEBOOK_CLIENT_ID", "\"${localProp("FACEBOOK_CLIENT_ID")}\"")
        buildConfigField("String", "THREADS_CLIENT_ID", "\"${localProp("THREADS_CLIENT_ID")}\"")
        buildConfigField("String", "X_CLIENT_ID", "\"${localProp("X_CLIENT_ID")}\"")

        // OAuth redirect deep link (Instagram/TikTok/Facebook/Threads/X) — must be registered as
        // the exact redirect_uri in each platform's developer console. Matched by the first
        // intent-filter in AndroidManifest.xml.
        manifestPlaceholders["oauthRedirectScheme"] = "com.puresquare.socialinsight"
        manifestPlaceholders["oauthRedirectHost"] = "oauth-callback"

        // Some platforms' Android OAuth clients require an HTTPS App Link redirect instead of a
        // custom scheme — confirmed for Google (ADR-0008) and TikTok (its Android redirect_uri
        // rules require HTTPS too, per docs/platform-capability-matrix.md). Shared by any platform
        // that needs it — this is the Vercel deployment's own domain since it already serves
        // .well-known/assetlinks.json.
        buildConfigField("String", "APP_LINK_REDIRECT_URI", "\"https://web-jet-eight-66.vercel.app/oauth-callback\"")
        manifestPlaceholders["appLinkRedirectHost"] = "web-jet-eight-66.vercel.app"
    }

    signingConfigs {
        getByName("debug") {
            // A committed, persistent debug keystore — not the ephemeral one AGP would otherwise
            // generate fresh per machine/CI-runner. Without this, every CI build gets a different
            // random signing key, so Android refuses to install a new debug build over an existing
            // one ("signatures don't match"), forcing an uninstall that wipes the app's local
            // device identity (EncryptedSharedPreferences) and makes it re-register as a brand-new
            // device every single update. This is a standard, low-risk thing to commit — debug
            // builds can't be published to any app store and this key carries no real trust
            // anchor, unlike a release signing key (which must NEVER be committed — see
            // .gitignore's `*.keystore` / `!debug.keystore` exception).
            storeFile = file("../debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // OAuth authorization pages open in a real, trusted browser tab — not a WebView we control —
    // so the platform's own login/account-chooser UI is what the user sees and types into.
    implementation("androidx.browser:browser:1.8.0")

    // Device identity (device_uuid/device_secret) storage — Android Keystore-backed, never plain
    // SharedPreferences. See docs/decisions/0002-secret-boundary-and-auth-model.md.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    implementation("androidx.work:work-runtime-ktx:2.10.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}

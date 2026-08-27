plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0" apply false
    // Required separately since Kotlin 2.0 — the Compose compiler is no longer bundled with the
    // `compose = true` buildFeature flag. Found via a real CI build failure, not anticipated.
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}

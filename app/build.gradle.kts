plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.luckynate.quivermobile"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.luckynate.quivermobile"
        minSdk = 26
        targetSdk = 35
        versionCode = (project.findProperty("appVersionCode")?.toString()?.toIntOrNull() ?: 1)
        versionName = "0.1.${versionCode}"
        ndk { abiFilters += listOf("arm64-v8a") }
    }
    val ksPath = System.getenv("KEYSTORE_FILE")
    signingConfigs {
        if (!ksPath.isNullOrBlank()) {
            create("deployment") {
                storeFile = file(ksPath)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            if (!ksPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("deployment")
        }
        getByName("release") {
            isMinifyEnabled = false
            if (!ksPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("deployment")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.14.0")
}

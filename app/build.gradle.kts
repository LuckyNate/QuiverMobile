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
        externalNativeBuild { cmake { cppFlags += "-std=c++17" } }
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
        getByName("release") {
            isMinifyEnabled = false
            if (!ksPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("deployment")
        }
    }
    buildFeatures { buildConfig = true }
    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt") } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
}

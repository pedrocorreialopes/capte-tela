// Print Fácil — módulo app
// A interface (HTML/CSS/JS do repositório) é empacotada em assets/www pelo
// tarefa `syncWebAssets`, sem duplicar arquivos no git.
import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.printfacil"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.printfacil"
        minSdk = 26          // necessário para TYPE_APPLICATION_OVERLAY
        targetSdk = 34       // Android 14: foreground service tipado
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // Os arquivos web vivem na raiz do repositório e são copiados para
    // build/generated/webassets/www antes de cada build.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
}

val webRoot: File = rootProject.projectDir.parentFile.parentFile  // <repo>/

val syncWebAssets by tasks.registering(Copy::class) {
    from(webRoot) {
        include(
            "index.html",
            "manifest.webmanifest",
            "sw.js",
            "css/**",
            "js/**",
            "assets/**"
        )
        exclude("tools/**", "docs/**")
    }
    into(layout.buildDirectory.dir("generated/webassets/www"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    // WebViewAssetLoader: serve a interface em https://appassets.androidplatform.net
    // (origem segura, necessária para localStorage/IndexedDB/Clipboard no WebView)
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.24")
}

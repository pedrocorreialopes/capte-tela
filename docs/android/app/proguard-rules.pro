-keep class br.com.printfacil.WebAppBridge { *; }
-keepclassmembers class br.com.printfacil.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}

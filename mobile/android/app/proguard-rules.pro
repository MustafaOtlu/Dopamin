# Capacitor and Cordova plugins are protected by Capacitor's consumer rules.
# JavaScript calls these methods by name; keep their names through R8.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,Signature

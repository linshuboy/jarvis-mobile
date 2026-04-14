const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING_PROPERTIES_BLOCK = `def releaseStoreFile = findProperty('android.releaseStoreFile') ?: System.getenv("ANDROID_RELEASE_STORE_FILE")
def releaseStorePassword = findProperty('android.releaseStorePassword') ?: System.getenv("ANDROID_RELEASE_STORE_PASSWORD")
def releaseKeyAlias = findProperty('android.releaseKeyAlias') ?: System.getenv("ANDROID_RELEASE_KEY_ALIAS")
def releaseKeyPassword = findProperty('android.releaseKeyPassword') ?: System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword`;

const RELEASE_SIGNING_BLOCK = `        if (hasReleaseSigning) {
            release {
                storeFile file(releaseStoreFile)
                storePassword releaseStorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }`;

function patchAndroidReleaseSigning(contents) {
  let patched = contents;

  if (!patched.includes("def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword")) {
    const androidBlockPattern = /\nandroid\s*\{/;
    if (!androidBlockPattern.test(patched)) {
      throw new Error("Unable to locate Android block for release signing patch.");
    }

    patched = patched.replace(androidBlockPattern, `\n${SIGNING_PROPERTIES_BLOCK}\n\nandroid {`);
  }

  if (!patched.includes("if (hasReleaseSigning)")) {
    const signingConfigsPattern = /(signingConfigs\s*\{\n\s*debug\s*\{[\s\S]*?\n\s*}\n)(\s*}\n\s*buildTypes\s*\{)/;
    if (!signingConfigsPattern.test(patched)) {
      throw new Error("Unable to locate signingConfigs block for release signing patch.");
    }

    patched = patched.replace(
      signingConfigsPattern,
      `$1${RELEASE_SIGNING_BLOCK}\n$2`
    );
  }

  patched = patched.replace(
    /(buildTypes\s*\{[\s\S]*?debug\s*\{[\s\S]*?signingConfig signingConfigs\.debug[\s\S]*?\}\n\s*release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    "$1signingConfig hasReleaseSigning ? signingConfigs.release : signingConfigs.debug"
  );

  return patched;
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = patchAndroidReleaseSigning(config.modResults.contents);
    return config;
  });
};

const { withProjectBuildGradle } = require("expo/config-plugins");

const TARGET_KOTLIN_VERSION = "1.9.25";

function patchRootKotlinVersion(contents) {
  const marker = `ext.kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'`;
  const kotlinClasspath = `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${TARGET_KOTLIN_VERSION}')`;

  let patched = contents;

  if (!patched.includes(marker)) {
    const buildscriptPattern = /buildscript\s*\{/;
    if (!buildscriptPattern.test(patched)) {
      throw new Error("Unable to locate Android root buildscript block for kotlinVersion patch.");
    }

    patched = patched.replace(
      buildscriptPattern,
      (match) => `ext.kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'\n\n${match}`
    );
  }

  if (!patched.includes(kotlinClasspath)) {
    patched = patched.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]+)?['"]\)/,
      kotlinClasspath
    );
  }

  return patched;
}

module.exports = function withAndroidRootKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = patchRootKotlinVersion(config.modResults.contents);
    return config;
  });
};

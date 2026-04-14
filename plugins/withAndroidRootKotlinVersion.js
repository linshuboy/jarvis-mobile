const { withProjectBuildGradle } = require("expo/config-plugins");

const TARGET_KOTLIN_VERSION = "1.9.25";

function patchRootKotlinVersion(contents) {
  const marker = `ext.kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'`;

  if (contents.includes(marker)) {
    return contents;
  }

  const buildscriptPattern = /buildscript\s*\{/;
  if (!buildscriptPattern.test(contents)) {
    throw new Error("Unable to locate Android root buildscript block for kotlinVersion patch.");
  }

  return contents.replace(
    buildscriptPattern,
    (match) => `ext.kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'\n\n${match}`
  );
}

module.exports = function withAndroidRootKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = patchRootKotlinVersion(config.modResults.contents);
    return config;
  });
};

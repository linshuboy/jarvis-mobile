const { withProjectBuildGradle } = require("expo/config-plugins");

const TARGET_KOTLIN_VERSION = "1.9.25";

function patchRootKotlinVersion(contents) {
  const marker = `kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'`;

  if (contents.includes(marker)) {
    return contents;
  }

  const buildscriptPattern = /buildscript\s*\{\s*[\r\n]+(?:\s*ext\s*\{\s*[\r\n]+)?/;
  if (!buildscriptPattern.test(contents)) {
    throw new Error("Unable to locate Android root buildscript block for kotlinVersion patch.");
  }

  return contents.replace(
    buildscriptPattern,
    (match) => `${match}        kotlinVersion = findProperty('kotlinVersion') ?: findProperty('android.kotlinVersion') ?: '${TARGET_KOTLIN_VERSION}'\n`
  );
}

module.exports = function withAndroidRootKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = patchRootKotlinVersion(config.modResults.contents);
    return config;
  });
};

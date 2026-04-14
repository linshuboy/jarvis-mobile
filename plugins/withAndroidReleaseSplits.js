const { withAppBuildGradle } = require("expo/config-plugins");

const ABI_SPLITS_BLOCK = `    splits {\n        abi {\n            enable true\n            reset()\n            include "armeabi-v7a", "arm64-v8a", "x86_64"\n            universalApk false\n        }\n    }`;

function patchAndroidReleaseSplits(contents) {
  if (contents.includes("universalApk false") && contents.includes('include "armeabi-v7a", "arm64-v8a", "x86_64"')) {
    return contents;
  }

  const androidResourcesPattern = /(\n\s*androidResources\s*\{)/;
  if (!androidResourcesPattern.test(contents)) {
    throw new Error("Unable to locate androidResources block for ABI split patch.");
  }

  return contents.replace(androidResourcesPattern, `\n${ABI_SPLITS_BLOCK}$1`);
}

module.exports = function withAndroidReleaseSplits(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = patchAndroidReleaseSplits(config.modResults.contents);
    return config;
  });
};

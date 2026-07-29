const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const sharedFrontendRoot = path.resolve(projectRoot, '../../packages/frontend')
const appNodeModules = path.resolve(projectRoot, 'node_modules')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...new Set([...(config.watchFolders || []), sharedFrontendRoot])]
config.resolver.nodeModulesPaths = [appNodeModules]
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(appNodeModules, 'react'),
  'react-native': path.resolve(appNodeModules, 'react-native'),
}

module.exports = config

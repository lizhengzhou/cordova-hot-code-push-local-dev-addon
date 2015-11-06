/*
Hook is called when project is prepared for the build.
If local development mode is activated - it will inject local server's url into
platform specific config.xml file and increase build version of the app, so it would
trigger the re-install of the assets folder.
*/
var fs = require('fs'),
  path = require('path'),
  chcpConfigXmlReader = require('./lib/chcpConfigXmlReader.js'),
  chcpConfigXmlWriter = require('./lib/chcpConfigXmlWriter.js'),
  buildVersionUpdater = require('./lib/buildVersionUpdater.js'),
  HOT_CODE_PUSH_PLUGIN_NAME = 'cordova-hot-code-push-plugin',
  CHCP_CLI_ENVIRONMENT_CONFIG = '.chcpenv',
  RELEASE_BUILD_FLAG = '--release';

// region Plugin validation

/**
 * Check if Hot Code Push plugin is installed.
 * If not - there is no point in doing any work.
 *
 * @param {Object} ctx - cordova context
 * @return {Boolean} true - if Hot Code Push plugin is installed; otherwise - false
 */
function isChcpPluginInstalled(ctx) {
  var pathToChcpPluginConfig = path.join(ctx.opts.projectRoot, 'plugins', HOT_CODE_PUSH_PLUGIN_NAME, 'plugin.xml'),
    isInstalled = false;

  try {
    var pluginXmlContent = fs.readFileSync(pathToChcpPluginConfig);
    isInstalled = true;
  } catch(err) {
  }

  return isInstalled;
}

/**
 * Check if we are building release version.
 *
 * @param {Object} ctx - cordova context
 * @return {Boolean} true - if this is a release version; otherwise - false
 */
function isBuildingForRelease(ctx) {
  var consoleOptions = ctx.opts.options;
  for (var idx in consoleOptions) {
    if (consoleOptions[idx] === RELEASE_BUILD_FLAG) {
      return true;
    }
  }

  return false;
}

/**
 * Check if plugin is allowed to work.
 *
 * @param {Object} ctx - cordova context
 * @param {Object} pluginPreferences - plugin preferences from the project's config.xml
 * @return {Boolean} true - if we can do our work; otherwise - false
 */
function isExecutionAllowed(ctx, pluginPreferences) {
  if (!isChcpPluginInstalled(ctx)) {
    printError('WARNING! Hot Code Push plugin is not installed. Exiting.');
    return false;
  }

  if (isBuildingForRelease(ctx)) {
    printError('WARNING! You are building for release! Consider removing this plugin from your app beforing publishing it on the store.');
    return false;
  }

  if (!pluginPreferences['local-development'].enabled) {
    printLog('Local development mode for CHCP plugin is disabled. Doing nothing.');
    return false;
  }

  return true;
}

// endregion

// region Reading .chcpenv file

/**
 * Helper method to read JSON object from the file.
 *
 * @param {String} filePath - path to the file
 * @return {Object} JSON object from the file; null - in the case of the error
 */
function readObjectFromFile(filePath) {
  var objData = null;
  try {
    var data = fs.readFileSync(filePath, 'utf-8');
    objData = JSON.parse(data, 'utf-8');
  } catch (err) {
  }

  return objData;
}

/**
 * Read .chcpenv file and get config_url preference from it.
 * This is a url to the chcp.json file on the local server.
 * We will inject it into config.xml.
 */
function getLocalServerURLFromEnvironmentConfig(ctx) {
  var chcpEnvFilePath = path.join(ctx.opts.projectRoot, CHCP_CLI_ENVIRONMENT_CONFIG),
    envConfig = readObjectFromFile(chcpEnvFilePath);

  if (envConfig) {
    return envConfig.config_url;
  }

  return null;
};

// endregion

// region Logging

/**
 * Print header to indicate, the next messages is for this plugin.
 */
function printStartHeader() {
  console.log("CHCP Local Development Add-on:");
}

/**
 * Print error/warning message to the console.
 *
 * @param {String} msg - message to print
 */
function printError(msg) {
  printLog(msg, true);
}

/**
 * Print message to the console.
 *
 * @param {String} msg - message to print
 * @param {Boolean} isError - is this is an error message.
 */
function printLog(msg, isError = false) {
  var formattedMsg = '    ' + msg;
  if (isError) {
    console.warn(formattedMsg);
  } else {
    console.log(formattedMsg);
  }
}

// endregion

module.exports = function(ctx) {
  printStartHeader();

  var pluginPreferences = chcpConfigXmlReader.readOptions(ctx);
  if (!pluginPreferences) {
    printError('WARNING! Can\'t find config.xml! Exiting.');
    return;
  }

  if (!isExecutionAllowed(ctx, pluginPreferences)) {
    return;
  }

  if (pluginPreferences['config-file'].length == 0) {
    printLog('Config-file is not set, local-development mode is enabled by default.');
  }

  var localServerURL = getLocalServerURLFromEnvironmentConfig(ctx);
  if (!localServerURL) {
    printError('Can\'t find .chcpenv config file with local server preferences. Did you run "cordova-hcp server"?');
    return;
  }

  printLog('Setting config-file to local server: ' + localServerURL);

  pluginPreferences['config-file'] = localServerURL;
  chcpConfigXmlWriter.writeOptions(ctx, pluginPreferences);

  buildVersionUpdater.increaseBuildVersion(ctx);
};

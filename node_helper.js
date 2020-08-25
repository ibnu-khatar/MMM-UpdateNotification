/** All credit to Michael Teeuw https://michaelteeuw.nl **/
/** modified by @bugsounet for TelegramBot and NPM_UPDATE checker support **/

const SimpleGit = require("simple-git")
const simpleGits = []
const fs = require("fs")
const path = require("path")
const defaultModules = require(__dirname + "/../default/defaultmodules.js")
const Log = require(__dirname + "/../../js/logger.js")
const NodeHelper = require("node_helper")

module.exports = NodeHelper.create({
  config: {},

  updateTimer: null,
  updateProcessStarted: false,

  start: function () {
    console.log("[UPDATE] MMM-UpdateNotification Version:", require('./package.json').version)
    },

  configureModules: function (modules) {
    // Push MagicMirror itself , biggest chance it'll show up last in UI and isn't overwritten
    // others will be added in front
    // this method returns promises so we can't wait for every one to resolve before continuing
    simpleGits.push({ module: "default", git: SimpleGit(path.normalize(__dirname + "/../../")) })

    var promises = []

    for (var moduleName in modules) {
      if (!this.ignoreUpdateChecking(moduleName)) {
        // Default modules are included in the main MagicMirror repo
        var moduleFolder = path.normalize(__dirname + "/../" + moduleName)

        try {
          console.log("Checking git for module: " + moduleName)
          let stat = fs.statSync(path.join(moduleFolder, ".git"))
          promises.push(this.resolveRemote(moduleName, moduleFolder))
        } catch (err) {
          // Error when directory .git doesn't exist
          // This module is not managed with git, skip
          continue
        }
      }
    }

    return Promise.all(promises)
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG") {
      this.config = payload
    } else if (notification === "MODULES") {
      // if this is the 1st time thru the update check process
      if (!this.updateProcessStarted) {
        this.updateProcessStarted = true
        this.configureModules(payload).then(() => this.performFetch())
      }
    }
  },

  resolveRemote: function (moduleName, moduleFolder) {
    return new Promise((resolve, reject) => {
      var git = SimpleGit(moduleFolder)
      git.getRemotes(true, (err, remotes) => {
        if (remotes.length < 1 || remotes[0].name.length < 1) {
          // No valid remote for folder, skip
          return resolve()
        }
        // Folder has .git and has at least one git remote, watch this folder
        simpleGits.unshift({ module: moduleName, git: git })
        resolve()
      })
    })
  },

  performFetch: function () {
    simpleGits.forEach((sg) => {
      sg.git.fetch().status((err, data) => {
        data.module = sg.module
        if (!err) {
          sg.git.log({ "-1": null }, (err, data2) => {
            if (!err && data2.latest && "hash" in data2.latest) {
              data.hash = data2.latest.hash
              this.sendSocketNotification("STATUS", data)
            }
          })
        }
      })
    })

    this.scheduleNextFetch(this.config.updateInterval)
  },

  scheduleNextFetch: function (delay) {
    if (delay < 60 * 1000) {
      delay = 60 * 1000
    }

    clearTimeout(this.updateTimer)
    this.updateTimer = setTimeout(() => {
      this.performFetch()
    }, delay)
  },

  ignoreUpdateChecking: function (moduleName) {
    // Should not check for updates for default modules
    if (defaultModules.indexOf(moduleName) >= 0) {
      return true
    }

    // Should not check for updates for ignored modules
    if (this.config.ignoreModules.indexOf(moduleName) >= 0) {
      return true
    }

    // The rest of the modules that passes should check for updates
    return false
  }
});

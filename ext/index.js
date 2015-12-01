/* global console, clearTimeout:true, self:true, setTimeout:true */
"use strict";

const self = require("sdk/self");
const pageMod = require("sdk/page-mod");
const childProcess = require("sdk/system/child_process");
const { emit } = require("sdk/event/core");
const system = require("sdk/system");
const { URL, toFilename } = require("sdk/url");
const { setTimeout, clearTimeout } = require("sdk/timers");
const { allValidAppIds } = require("./appIdValidator");
const { viewFor } = require("sdk/view/core");
const {get: _} = require("sdk/l10n");

var activeRequest;

function cleanNotification() {
  if (!activeRequest)
    return;
  if (activeRequest.notification)
    viewFor(activeRequest.worker.tab).ownerGlobal.
      PopupNotifications.remove(activeRequest.notification);
    activeRequest.notification = null;
}

function showNotification(msg) {
  let tab = viewFor(activeRequest.worker.tab);
  if (activeRequest.notification)
    cleanNotification();

  activeRequest.notification = tab.ownerGlobal.
    PopupNotifications.show(tab.linkedBrowser, "u2f-device-info", msg, null, null,
      null, {
        popupIconURL: self.data.url("../icon.png"),
        removeOnDismissal: true
      });
}

function killExe() {
  if (!activeRequest)
    return;
  cleanNotification();
  clearTimeout(activeRequest.timer);
  try {
    activeRequest.cmd.kill();
  } catch (ex) {
    console.info("killExe", ex);
  }
  activeRequest = null;
}

function toHex(num) {
  return (0x10000 + num).toString(16).substr(1);
}

function execBin(event, origin, challenges, callbackid, worker, timeout) {
  let facetId = URL(origin);

  allValidAppIds(facetId, challenges).then(ch => {
    if (ch.length == 0) {
      worker.port.emit(event, callbackid, {
        errorCode: 2,
        errorMessage: "Invalid input"
      });
      return;
    }
    _execBin(event, origin, ch, callbackid, worker, timeout);
  });
}

function _execBin(event, origin, challenges, callbackid, worker, timeout) {
  console.info("EB1", event, origin, challenges);
  var [arch, ext] = system.platform == "winnt" ? ["x86", ".exe"] : [system.architecture, ""];
  var exe = system.platform + "_" + arch + "-" + system.compiler + "/u2f" + ext;
  var path = toFilename(self.data.url("../bin/" + exe));
  console.info("EB2", path);
  var cmd = childProcess.spawn(path, [], {});
  console.info("EB3", cmd);
  var response = {
    value: "",
    responded: false
  };

  var timer = setTimeout(function() {
    killExe();
  }, timeout);

  cmd.stdout.on("data", function(data) {
    console.info("EBD", data);
    response.value += data;
    if (response.value[0] == "i") {
      console.info("insert device");
      showNotification(_("Please plug-in your U2F device"));
      response.value = response.value.substr(1);
    }
    if (response.value[0] == "j") {
      cleanNotification();
      console.info("device inserted");
      response.value = response.value.substr(1);
    }
    if (response.value[0] == "b") {
      console.info("device waits for button press");
      showNotification(_("Please press button on your U2F device"));
      response.value = response.value.substr(1);
    }
    var r = response.value.match(/^(.)(....)/);
    var len = r && parseInt(r[2], 16);
    if (r && response.value.length >= len + 5) {
      worker.port.emit("U2FRequestResponse", callbackid, JSON.parse(response.value.substr(5, len)));
      response.value = response.value.substr(5 + len);
      response.responded = true;
    }
  });
  cmd.on("error", function() {
    worker.port.emit("U2FRequestResponse", callbackid, {
      errorCode: 1,
      errorMessage: "Couldn't spawn binary"
    });
    killExe();
  });
  cmd.on("exit", function(code, signal) {
    console.info("exit", code, signal);
    cleanNotification();
    clearTimeout(timer);
    activeRequest = null;

    if (cmd.killed)
      return;

    if (code == null || code < 0)
      worker.port.emit("U2FRequestResponse", callbackid, {
        errorCode: 1,
        errorMessage: "Couldn't spawn binary"
      });
    else if (!response.responded)
      worker.port.emit("U2FRequestResponse", callbackid, {
        errorCode: 1,
        errorMessage: "No response from binary: " + response.value
      });
  });
  if (challenges.length > 16)
    challenges = challenges.slice(0, 16);

  let strChallenges = challenges.map(JSON.stringify);
  let stdin = (event == "sign" ? "s" : "r") + toHex(origin.length) +
    toHex(challenges.length) + strChallenges.map(v => toHex(v.length)).join("") +
    origin + strChallenges.join("");

  console.info("stdin", stdin);

  activeRequest = {
    worker: worker,
    cmd: cmd,
    timer: timer
  };

  emit(cmd.stdin, "data", stdin);
  emit(cmd.stdin, "end");
}

pageMod.PageMod({ // eslint-disable-line new-cap
  include: "*",
  contentScriptWhen: "start",
  attachTo: ["top", "frame"],
  contentScriptFile: "./content-script.js",
  onAttach: function(worker) {
    worker.port.on("U2FRequest", function(msg, callbackid, domain, timeout) {
      var req;

      if (msg.type == "register")
        req = msg.requests;
      else
        req = msg.signRequests;

      req = Array.isArray(req) ? req : [req];
      execBin(msg.type, domain, req, callbackid, worker, timeout);
    });
    worker.on("detach", function() {
      if (activeRequest && activeRequest.worker == worker) {
        killExe();
      }
    });
  }
});

/* global console, uneval, clearTimeout:true, self:true, setTimeout:true, require:true */
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
const events = require("sdk/system/events");
const tabs = require("sdk/tabs");


var activeRequest;
var timeStart = Date.now();

var logs = [];
function log() {
  var msg = Array.map(arguments, v => typeof(v) == "string" ? v : uneval(v)).join(" ");
  logs.push((Date.now()-timeStart)+" "+msg);

  if (logs.length > 100)
    logs.shift();

  console.info.apply(console, arguments);
}

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
    log("killExe exception", ex);
  }
  activeRequest = null;
}

function toHex(num) {
  return (0x10000 + num).toString(16).substr(1);
}

function challengesToStr(signRequest, origin, challenges) {
  if (challenges.length > 16)
    challenges = challenges.slice(0, 16);

  let strChallenges = challenges.map(JSON.stringify);
  return (signRequest ? "s" : "r") + toHex(origin.length) +
    toHex(challenges.length) + strChallenges.map(v => toHex(v.length)).join("") +
    origin + strChallenges.join("");

}

function execBin(event, origin, challenges, checkSignChallenges, callbackid, worker, timeout) {
  let facetId = URL(origin);
  allValidAppIds(facetId, challenges).then(ch => {
    if (ch.length == 0) {
      worker.port.emit(event, callbackid, {
        errorCode: 2,
        errorMessage: "Invalid input"
      });
      return;
    }
    if (checkSignChallenges && checkSignChallenges.length > 0) {
      allValidAppIds(facetId, checkSignChallenges).then(sch => {
        if (sch.length == 0) {
          worker.port.emit(event, callbackid, {
            errorCode: 2,
            errorMessage: "Invalid input"
          });
          return;
      }
      _execBin(event, origin, ch, sch, callbackid, worker, timeout);
    });
  } else
    _execBin(event, origin, ch, null, callbackid, worker, timeout);
  });
}

function _execBin(event, origin, challenges, checkSignChallenges, callbackid, worker, timeout) {
  log("execBin event =", event, "origin =", origin, "challeges =",challenges, "checkSignChallenges =",checkSignChallenges);
  var [arch, ext] = system.platform == "winnt" ? ["x86", ".exe"] : [system.architecture, ""];
  var exe = system.platform + "_" + arch + "-" + system.compiler + "/u2f" + ext;
  var path = toFilename(self.data.url("../bin/" + exe));
  log("exec path", path);
  var cmd = childProcess.spawn(path, [], {});
  log("exec cmd", cmd);
  var response = {
    value: "",
    responded: false
  };

  var timer = setTimeout(function() {
    killExe();
  }, timeout);

  cmd.stdout.on("data", function(data) {
    log("device data", data);
    response.value += data;
    if (response.value[0] == "i") {
      log("insert device");
      showNotification(_("Please plug in your U2F device"));
      response.value = response.value.substr(1);
    }
    if (response.value[0] == "j") {
      cleanNotification();
      log("device inserted");
      response.value = response.value.substr(1);
    }
    if (response.value[0] == "b") {
      log("device waits for button press");
      showNotification(_("Please press button on your U2F device"));
      response.value = response.value.substr(1);
    }
    var r = response.value.match(/^(.)(....)/);
    var len = r && parseInt(r[2], 16);
    if (r && response.value.length >= len + 5) {
      if (checkSignChallenges) {
        let json = JSON.parse(response.value.substr(5, len));
        if (json.errorCode == 4) {
          checkSignChallenges = null;
          let stdin = challengesToStr(false, origin, challenges);
          emit(cmd.stdin, "data", stdin);
        } else if (json.errorCode) {
          worker.port.emit("U2FRequestResponse", callbackid, {
            errorCode: 1,
            errorMessage: "Unknown error"
          });
        } else {
          worker.port.emit("U2FRequestResponse", callbackid, {
            errorCode: 4,
            errorMessage: "Device already registered"
          });
        }
        response.value = response.value.substr(5 + len);
        emit(cmd.stdin, "end");
      } else {
        worker.port.emit("U2FRequestResponse", callbackid, JSON.parse(response.value.substr(5, len)));
        response.value = response.value.substr(5 + len);
        response.responded = true;
      }
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
    log("exit code =", code, "signal =",signal, "killed =",cmd.killed, "activeRequest =", !!activeRequest);
    cleanNotification();
    clearTimeout(timer);

    if (cmd.killed || !activeRequest) {
      activeRequest = null;
      return;
    }
    activeRequest = null;

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

  let stdin = challengesToStr(checkSignChallenges || event == "sign", origin,
   checkSignChallenges ? checkSignChallenges : challenges);
  log("stdin", stdin);

  activeRequest = {
    worker: worker,
    cmd: cmd,
    timer: timer
  };

  emit(cmd.stdin, "data", stdin);
  if (!checkSignChallenges)
    emit(cmd.stdin, "end");
}

pageMod.PageMod({ // eslint-disable-line new-cap
  include: "*",
  contentScriptWhen: "start",
  attachTo: ["top", "frame"],
  contentScriptFile: "./content-script.js",
  onAttach: function(worker) {
    worker.port.on("U2FRequest", function(msg, callbackid, domain, timeout) {
      let req, signCheckReq;

      if (msg.type == "register")
        [req, signCheckReq] = [msg.requests, msg.signRequests];
      else
        [req, signCheckReq] = [msg.signRequests, null];

      req = Array.isArray(req) ? req : [req];
      execBin(msg.type, domain, req, signCheckReq, callbackid, worker, timeout);
    });
    worker.on("detach", function() {
      if (activeRequest && activeRequest.worker == worker) {
        killExe();
      }
    });
  }
});

function showLogs() {
  log("showLogsCalled");
  tabs.open({
    url: self.data.url("logs.html"),
    onReady: function(tab) {
      var worker = tab.attach({
        contentScriptFile: self.data.url("./logs.js")
      });
      worker.port.emit("logs", logs);
    }
  });
}

function optionsDisplayed(event) {
  if (event.type != "addon-options-displayed" ||
      event.data != "u2f4moz@prefiks.org")
    return;
  var doc = event.subject;
  var el = doc.getElementById("showLogsButton");
  el.label = "Show Logs";
  el.addEventListener("command", showLogs);
}

events.on("addon-options-displayed", optionsDisplayed);

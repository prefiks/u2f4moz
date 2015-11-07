/* global console, clearTimeout:true, self:true, setTimeout:true */
"use strict";

var self = require("sdk/self");
var pageMod = require("sdk/page-mod");
var childProcess = require("sdk/system/child_process");
var { emit } = require("sdk/event/core");
var system = require("sdk/system");
var url = require("sdk/url");
var { setTimeout, clearTimeout } = require("sdk/timers");

var activeRequest;

function execBin(event, domain, challenge, callbackid, worker, timeout) {
  console.info("EB1", event, domain, challenge);
  var exe = system.platform + "_" + system.architecture + "-" + system.compiler + "/u2f" +
    (system.platform == "winnt" ? ".exe" : "");
  var path = url.toFilename(self.data.url("../bin/" + exe));
  console.info("EB2", path);
  var cmd = childProcess.spawn(path, [], {});
  console.info("EB3", cmd);
  var response = {value: "", responded: false};

  var timer = setTimeout(function () {
    cmd.kill();
  }, timeout);

  cmd.stdout.on("data", function(data) {
    console.info("EBD", data);
    response.value += data;
    if (response.value[0] == "i") {
      console.info("insert device");
      worker.port.emit("insert");
      response.value = response.value.substr(1);
    }
    var r = response.value.match(/^(.)(....)/);
    var len = r && parseInt(r[2], 16);
    if (r && response.value.length >= len + 5) {
      worker.port.emit(event, callbackid, JSON.parse(response.value.substr(5, len)));
      response.value = response.value.substr(5 + len);
      response.responded = true;
    }
  });
  cmd.on("exit", function(code, signal) {
    console.info("exit", code, signal);
    clearTimeout(timer);
    activeRequest = null;

    if (cmd.killed)
      return;

    if (code == null || code < 0)
      worker.port.emit(event, callbackid, {errorCode: 1, errorMessage: "Couldn't spawn binary"});
    else if (!response.responded)
      worker.port.emit(event, callbackid, {errorCode: 1, errorMessage: "No response from binary: " + response.value});
  });
  var stdin = (event == "signResponse" ? "s" : "r") +
    [domain, challenge].map(v => (0x10000 + v.length).toString(16).substr(1)).join("") +
    domain + challenge;

  activeRequest = {worker: worker, cmd: cmd};

  emit(cmd.stdin, "data", stdin);
  emit(cmd.stdin, "end");
}

pageMod.PageMod({ // eslint-disable-line new-cap
  include: "*",
  contentScriptWhen: "start",
  attachTo: ["top", "frame"],
  contentScriptFile: "./content-script.js",
  onAttach: function(worker) {
    worker.port.on("register", function(requests, callbackid, domain, timeout) {
      var req = Array.isArray(requests) ? requests[0] : requests;
      var reqS = JSON.stringify(req);
      execBin("registerResponse", domain, reqS, callbackid, worker, timeout);
    });
    worker.port.on("sign", function(signRequests, callbackid, domain, timeout) {
      var req = Array.isArray(signRequests) ? signRequests[0] : signRequests;
      var reqS = JSON.stringify(req);
      execBin("signResponse", domain, reqS, callbackid, worker, timeout);
    });
    worker.on("detach", function() {
      if (activeRequest && activeRequest.worker == worker) {
        activeRequest.cmd.kill();
        activeRequest = null;
      }
    });
  }
});

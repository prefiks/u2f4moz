/*global self:true*/
"use strict";

var self = require("sdk/self");
var pageMod = require("sdk/page-mod");
var childProcess = require("sdk/system/child_process");
var { emit } = require("sdk/event/core");
var system = require("sdk/system");
var url = require("sdk/url");

function execBin(args, stdin, event, callbackid, worker) {
  console.info("EB1", args, event);
  var exe = system.platform + "_" + system.architecture + "-" + system.compiler + "/u2f" +
    (system.platform == "winnt" ? ".exe" : "");
  var path = url.toFilename(self.data.url("../bin/" + exe));
  console.info("EB2", path);
  var cmd = childProcess.spawn(path, args, {});
  console.info("EB3", cmd);
  var response = {value: ""};
  cmd.stdout.on("data", function(data) {
    console.info("EBD", data);
    response.value += data;
  });
  cmd.on("close", function(code) {
    console.info("EBC", code, response.value.length);
    if (code == 0 && response.value.length) {
      worker.port.emit(event, callbackid, JSON.parse(response.value));
    } else {
      worker.port.emit(event, callbackid, {errorCode: 1});
    }
  });
  emit(cmd.stdin, "data", stdin);
  emit(cmd.stdin, "end");
}

pageMod.PageMod({ // eslint-disable-line new-cap
  include: "*",
  contentScriptWhen: "start",
  attachTo: ["existing", "top", "frame"],
  contentScriptFile: "./content-script.js",
  onAttach: function(worker) {

    worker.port.on("register", function(requests, callbackid, domain) {
      var req = Array.isArray(requests) ? requests[0] : requests;
      execBin(["r", domain], JSON.stringify(req),
       "registerResponse", callbackid, worker);
    });
    worker.port.on("sign", function(signRequests, callbackid, domain) {
      var req = Array.isArray(signRequests) ? signRequests[0] : signRequests;
      execBin(["s", domain], JSON.stringify(req),
       "signResponse", callbackid, worker);
    });
  }
});

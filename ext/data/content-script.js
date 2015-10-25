/* globals cloneInto, createObjectIn, exportFunction, unsafeWindow */
"use strict";

console.info("insidePage");

self.port.on("registerResponse", function(id, response) {
  var value = cloneInto({id: id, response: response}, document.defaultView);
  var event = new CustomEvent("u2f-register-response", { bubbles: true, detail: value});
  document.documentElement.dispatchEvent(event);
});

self.port.on("signResponse", function(id, response) {
  var value = cloneInto({id: id, response: response}, document.defaultView);
  var event = new CustomEvent("u2f-sign-response", { bubbles: true, detail: value});
  document.documentElement.dispatchEvent(event);
});

var callbackId = 0;
var callbacks = {};
function sendToChrome(type, requests, callback, timeout) {
  var origin = document.location.origin;
  var id = callbackId;
  callbacks[callbackId++] = callback;
  setTimeout(function() {
    if (id in callbacks) {
      callback({errorCode: 5});
    }
    delete callbacks[id];
  }, 1000 * (timeout || 30));
  var handler = function(event) {
    try{
      if (id in callbacks) {
        callbacks[id].call(null, event.detail.response);
      }
      delete callbacks[id];
    } catch (ex) {
      console.info(ex + "");
    }

    window.removeEventListener("u2f-" + type + "-response", handler, false);
  };
  window.addEventListener("u2f-" + type + "-response", handler, false);
  self.port.emit(type, requests, id, origin);
}

function register(requests, signRequests, callback, timeout) {
  sendToChrome("register", requests, callback, timeout);
}

function sign(signRequests, callback, timeout) {
  sendToChrome("sign", signRequests, callback, timeout);
}

var u2fonpage = createObjectIn(unsafeWindow, {defineAs: "u2f"});
exportFunction(register, u2fonpage, {defineAs: "register"});
exportFunction(sign, u2fonpage, {defineAs: "sign"});

Object.freeze(u2fonpage);

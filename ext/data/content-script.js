/* globals cloneInto, createObjectIn, exportFunction, unsafeWindow */
"use strict";

const DEFAULT_TIMEOUT_SECONDS = 30;

console.info("insidePage");

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
  }, 1000 * (timeout || DEFAULT_TIMEOUT_SECONDS));

  self.port.once(type + "Response", function(id, response) {
    var value = cloneInto({id: id, response: response}, document.defaultView);

    try {
      if (id in callbacks) {
        callbacks[id].call(null, value.response);
      }
      delete callbacks[id];
    } catch (ex) {
      console.info(ex + "");
    }
  });

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

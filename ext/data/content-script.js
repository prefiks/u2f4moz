/* eslint-env browser */
/* globals cloneInto, createObjectIn, exportFunction, unsafeWindow */
"use strict";

const DEFAULT_TIMEOUT_SECONDS = 30;

var nextCallbackID = 0;

function sendToChrome(type, requests, callback, timeout) {
  var origin = document.location.origin;
  var callbackID = nextCallbackID++;

  timeout = 1000 * (timeout || DEFAULT_TIMEOUT_SECONDS);
  var timer = setTimeout(function() {
    callback({errorCode: 5});
    timer = null;
  }, timeout);

  self.port.on(type + "Response", function onResponse(id, response) {
    if (id != callbackID || !timer) {
      return;
    }
    self.port.removeListener(type + "Response", onResponse);

    if (response.errorMessage)
      console.info("U2F error response:", response.errorMessage);
    delete response.errorMessage;

    var value = cloneInto({id: id, response: response}, document.defaultView);

    try {
      callback(value.response);
      clearTimeout(timer);
      timer = null;
    } catch (ex) {
      console.info(ex + "");
    }
  });

  self.port.emit(type, requests, callbackID, origin, timeout);
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

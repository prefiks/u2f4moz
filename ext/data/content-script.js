/* eslint-env browser */
/* globals cloneInto, exportFunction, unsafeWindow */
"use strict";

const DEFAULT_TIMEOUT_SECONDS = 30;

var nextCallbackID = 0;

var noopOnPage = exportFunction(() => {}, unsafeWindow);

function sendToChrome(msg, callback, timeout) {
  var origin = document.location.origin;
  var callbackID = nextCallbackID++;

  timeout = 1000 * (timeout || DEFAULT_TIMEOUT_SECONDS);
  var timer = setTimeout(function() {
    var value = cloneInto({errorCode: 5}, document.defaultView);
    callback(value);
    timer = null;
  }, timeout);

  self.port.once("U2FRequestResponse", function onResponse(id, response) {
    if (id != callbackID || !timer) {
      return;
    }

    if (response.errorMessage)
      console.info("U2F error response:", response.errorMessage);

    delete response.errorMessage;

    var value = cloneInto(response, document.defaultView);

    try {
      callback(value);
      clearTimeout(timer);
      timer = null;
    } catch (ex) {
      console.info(ex + "");
    }
  });

  self.port.emit("U2FRequest", msg, callbackID, origin, timeout);
}

function cloneFunctions(obj, clone) {
  Object.getOwnPropertyNames(obj).forEach(i => {
    if (typeof obj[i] == "function") {
      // instead of freezing the clone use accessor property to allow further extension
      let value = exportFunction(obj[i], clone);
      let getter = exportFunction(() => {
        return value;
      }, clone);
      Object.defineProperty(clone, i, {
        get: getter,
        set: noopOnPage // readonly: silently avoid strict mode TypeError on assignment
      });
    } else if (typeof obj[i] == "object") {
      cloneFunctions(obj[i], clone[i]);
    }
  });
}

var u2f = {
  register: function(requests, signRequests, callback, timeout) {
    if (typeof(timeout) == "function" && typeof(callback) != "function") {
      let appId, keys;
      [appId, requests, keys, callback, timeout] = Array.from(arguments);
      Array.forEach(requests, v => v.appId = appId);
      signRequests = Array.map(keys, v => ({
        version: v.version,
        challenge: requests[0].challenge,
        keyHandle: v.keyHandle,
        appId: appId
      }));
    }

    sendToChrome({
      type: "register",
      requests: requests,
      signRequests: signRequests
    }, callback, timeout);
  },

  sign: function(signRequests, callback, timeout, extra) {
    if (typeof(extra) == "function" && typeof(callback) != "function") {
      let appId, challenge, keys;
      [appId, challenge, keys, callback, timeout] = Array.from(arguments);
      signRequests = Array.map(keys, v => ({
        version: v.version,
        challenge: challenge,
        keyHandle: v.keyHandle,
        appId: appId
      }));
    }

    sendToChrome({
      type: "sign",
      signRequests: signRequests
    }, callback, timeout);
  }
};

exportFunction(function(){}, unsafeWindow, {
  defineAs: "u2f"
});
cloneFunctions(u2f, unsafeWindow.u2f);

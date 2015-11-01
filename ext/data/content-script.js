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
    callback({
      errorCode: 5
    });
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

    if (!("errorCode" in response))
      response.errorCode = 0;

    var value = cloneInto({
      id: id,
      response: response
    }, document.defaultView);

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

function cloneFunctions(obj, clone) {
  for (var i in obj) {
    if (!obj.hasOwnProperty(i))
      continue;
    else if (typeof obj[i] == "function")
      exportFunction(obj[i], clone, {
        defineAs: i
      });
    else if (typeof obj[i] == "object")
      cloneFunctions(obj[i], clone[i]);
  }
}
/* eslint-disable no-unused-vars */
function cloneFullyInto(obj, scope) {
  var clone = cloneInto(obj, scope);
  cloneFunctions(obj, clone);
}
/* eslint-enable no-unused-vars */

var u2f = {
  register: function(requests, signRequests, callback, timeout) {
    sendToChrome("register", requests, callback, timeout);
  },

  sign: function(signRequests, callback, timeout) {
    sendToChrome("sign", signRequests, callback, timeout);
  }
};

var u2fOnPage = createObjectIn(unsafeWindow, {
  defineAs: "u2f"
});
cloneFunctions(u2f, u2fOnPage);

Object.freeze(u2fOnPage);

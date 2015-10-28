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

function register(requests, signRequests, callback, timeout) {
  sendToChrome("register", requests, callback, timeout);
}

function sign(signRequests, callback, timeout) {
  sendToChrome("sign", signRequests, callback, timeout);
}

var u2fonpage = createObjectIn(unsafeWindow, {
  defineAs: "u2f"
});
exportFunction(register, u2fonpage, {
  defineAs: "register"
});
exportFunction(sign, u2fonpage, {
  defineAs: "sign"
});
//Object.freeze(u2fonpage);

var chromeOnPage = createObjectIn(unsafeWindow, {
  defineAs: "chrome"
});
var chromeRuntimeOnPage = createObjectIn(chromeOnPage, {
  defineAs: "runtime"
});

function chromeSendMessage(id, msg, callback) {
  if (id == "kmendfapggjehodndflmmgagdbamhnfd")
    chromeRuntimeOnPage.lastError = null;
  else
    chromeRuntimeOnPage.lastError = {
      message: "Not found"
    };
  callback();
}

function chromeConnect() {
  var msgListeners = [];
  var obj = cloneInto({
    name: "U2f",
    onMessage: { }
  }, unsafeWindow);
  exportFunction(function(msg) {
    if (msg.type == "u2f_sign_request") {
      sign(msg.signRequests, function(resp) {
        resp.version = "U2F_V2";
        var r = cloneInto({
          type: "u2f_sign_response",
          responseData: resp,
          requestId: msg.requestId
        }, unsafeWindow);
        console.info("resp", JSON.stringify(r));
        for (var listener of msgListeners)
          listener(r);
      }, msg.timeoutSeconds);
    } else if (msg.type == "u2f_register_request") {
      register(msg.registerRequests, msg.signRequests, function(resp) {
        resp.version = "U2F_V2";
        var r = cloneInto({
          type: "u2f_register_response",
          responseData: resp,
          requestId: msg.requestId
        }, unsafeWindow);
        console.info("resp", JSON.stringify(r));
        for (var listener of msgListeners)
          listener(r);
      }, msg.timeoutSeconds);
    }
  }, obj, {
    defineAs: "postMessage"
  });
  exportFunction(function(listener) {
    msgListeners.push(listener);
  }, obj.onMessage, {
    defineAs: "addListener"
  });
  return obj;
}

exportFunction(chromeSendMessage, chromeRuntimeOnPage, {
  defineAs: "sendMessage"
});
exportFunction(chromeConnect, chromeRuntimeOnPage, {
  defineAs: "connect"
});

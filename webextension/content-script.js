/* eslint-env browser */
/* globals browser cloneInto exportFunction */
"use strict";

const DEFAULT_TIMEOUT_SECONDS = 30;

let nextCallbackID = 0;
let activeRequests = 0;
const callbacks = [];

function deliverResponse(id, payload) {
    if (!callbacks[id])
        return;

    let value = cloneInto(payload, window.wrappedJSObject);

    try {
        clearTimeout(callbacks[id].timer);
        callbacks[id].callback(value);
        delete callbacks[id];
    }
    catch (ex) {
        console.info(ex + "");
    }

    if (--activeRequests === 0)
        self.port.removeListener("U2FRequestResponse", processChromeResponse);
}

function processChromeResponse(payload) {
    console.info("Got response from chrome", payload);
    if (payload.response.errorMessage)
        console.info("U2F error response:", payload.response.errorMessage);

    delete payload.response.errorMessage;

    deliverResponse(payload.callbackid, payload.response);
}

function handleTimeout(id) {
    deliverResponse(id, {errorCode: 5});
}

let backgroundPort;

function sendToChrome(msg, callback, timeout) {
    console.info("Sending to chrome", msg, nextCallbackID);
    const origin = document.location.origin;
    const callbackID = nextCallbackID++;
    if (!backgroundPort) {
        backgroundPort = browser.runtime.connect({name: "u2f"});
        backgroundPort.onMessage.addListener(processChromeResponse);
    }

    timeout = 1000 * (timeout || DEFAULT_TIMEOUT_SECONDS);
    const timer = setTimeout(handleTimeout, timeout, callbackID);

    callbacks[callbackID] = {callback: callback, timer: timer};

    backgroundPort.postMessage({request: msg, callbackid: callbackID, origin: origin, timeout: timeout});
}

const u2f = {
    register: function(requests, signRequests, callback, timeout) {
        if (typeof(timeout) === "function" && typeof(callback) !== "function") {
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
        if (typeof(extra) === "function" && typeof(callback) !== "function") {
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

const noopOnPage = exportFunction(() => {}, window.wrappedJSObject);

function readonlyClone(obj, clone) {
    Object.getOwnPropertyNames(obj).forEach(i => {
        if (typeof obj[i] === "function") {
            // instead of freezing the clone use accessor property to allow further extension
            let value = exportFunction(obj[i], clone);
            let getter = exportFunction(() => {
                return value;
            }, clone);
            Object.defineProperty(clone.wrappedJSObject, i, {
                get: getter,
                set: noopOnPage, // readonly: silently avoid strict mode TypeError on assignment
                enumerable: true
            });
        } else if (typeof obj[i] === "object") {
            readonlyClone(obj[i], clone[i]);
        }
    });
}

let allowToOverride = document.location.origin.indexOf(".google.") >= 0;
const u2fOnPage = cloneInto({}, window);
readonlyClone(u2f, u2fOnPage);
const u2fGetter = exportFunction(() => u2fOnPage, window.wrappedJSObject);

if (!allowToOverride) {
    Object.defineProperty(window.wrappedJSObject, "u2f", {
        get: u2fGetter,
        set: noopOnPage,
        configurable: true,
        enumerable: true
    });
}

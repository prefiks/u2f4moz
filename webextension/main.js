/* global console, uneval, clearTimeout:true, setTimeout:true, require:true browser */
"use strict";

const timeStart = Date.now();

const logs = [];

function log() {
    const msg = Array.map(arguments, v => typeof (v) === "string" ? v : uneval(v)).join(" ");
    logs.push((Date.now() - timeStart) + " " + msg);

    if (logs.length > 100)
        logs.shift();

    console.info.apply(console, arguments);
}

function cleanNotification() {
    browser.notifications.clear("notification");
}

function showNotification(msg) {
    cleanNotification();

    browser.notifications.create("notification", {
        type: "basic",
        iconUrl: browser.extension.getURL("icons/icon48.png"),
        message: msg,
        title: "U2F for Firefox"
    });
}

function challengesToStr(signRequest, origin, challenges) {
    if (challenges.length > 16)
        challenges = challenges.slice(0, 16);

    return {
        sign: !!signRequest,
        challenges: challenges,
        origin: origin
    };
}

let requestsQueue = [];

function scheduleNextOperation(operation) {
    /*let facetId = URL(origin);
    allValidAppIds(facetId, challenges).then(ch => {
      if (ch.length == 0) {
        port.postMessage({callbackid: callbackid, response: {
          errorCode: 2,
          errorMessage: "Invalid input"
        }});
        return;
      }
      if (checkSignChallenges && checkSignChallenges.length > 0) {
        allValidAppIds(facetId, checkSignChallenges).then(sch => {
          if (sch.length == 0) {
            port.postMessage({callbackid: callbackid, response: {
              errorCode: 2,
              errorMessage: "Invalid input"
            }});
            return;
        }
        _execBin(event, origin, ch, sch, callbackid, port, timeout);
      });
    } else
      _execBin(event, origin, ch, null, callbackid, port, timeout);
    });*/
    requestsQueue.push(operation);
    if (requestsQueue.length === 1)
        executeNextOperation(false);
}

function executeNextOperation(dropFirst) {
    if (dropFirst) {
        clearTimeout(requestsQueue[0].timer);
        requestsQueue.shift();
    }

    if (!binaryPort) {
        if (!requestsQueue.length)
            return;

        binaryPort = browser.runtime.connectNative("utwof");
        binaryPort.onDisconnect.addListener(binaryOnDisconnect);
        binaryPort.onMessage.addListener(binaryOnMessage);
    }

    if (requestsQueue.length) {
        let req = requestsQueue[0];

        log("executing operation =", req.event, "origin =", req.origin, "challeges =", req.challenges, "checkSignChallenges =",
            req.checkSignChallenges);

        req.timer = setTimeout(() => dropActiveRequest({errorCode: 5}), req.timeout);
        let binMsg = challengesToStr(req.signChallenges || req.type === "sign",
            req.origin, req.signChallenges ? req.signChallenges : req.challenges);
        log("messaging binary", binMsg);
        binaryPort.postMessage(binMsg);
    } else {
        binaryPort.disconnect();
        cleanNotification();
        binaryPort = null;
    }
}

function dropActiveRequest(response) {
    if (requestsQueue.length === 0)
        return;

    if (response) {
        requestsQueue[0].port.postMessage({
            callbackid: requestsQueue[0].callbackid,
            response: response
        });
    }
    binaryPort.disconnect();
    binaryPort = null;
    executeNextOperation(true);
}

function binaryOnMessage(data) {
    log("device data", data);
    if (data.type === "i") {
        log("insert device");
        showNotification(("Please plug in your U2F device"));
    } else if (data.type === "j") {
        cleanNotification();
        log("device inserted");
    } else if (data.type === "b") {
        log("device waits for button press");
        showNotification(("Please press button on your U2F device"));
    } else if (data.type === "e" || data.type === "r") {
        let req = requestsQueue[0];
        if (req.signChallenges) {
            if (data.errorCode === 4) {
                req.signChallenges = null;
                let stdin = challengesToStr(false, req.origin, req.challenges);
                log("emit data", stdin);
                binaryPort.postMessage(stdin);
            } else if (data.errorCode) {
                req.port.postMessage({
                    callbackid: req.callbackid,
                    response: {
                        errorCode: 1,
                        errorMessage: "Unknown error"
                    }
                });
                executeNextOperation(true);
            } else {
                req.port.postMessage({
                    callbackid: req.callbackid,
                    response: {
                        errorCode: 4,
                        errorMessage: "Device already registered"
                    }
                });
                executeNextOperation(true);
            }
        } else {
            delete data.type;
            if (!data.version && data.registrationData)
                data.version = "U2F_V2";
            req.port.postMessage({
                callbackid: req.callbackid,
                response: data
            });
            executeNextOperation(true);
        }
    } else {
        log("Unknown type: " + data.type);
    }
}

function binaryOnDisconnect(cause) {
    log("exit code =", cause.error, "activeRequest =", !!activeRequest,
        "activeRequest.killing =", activeRequest && activeRequest.killing);

    binaryPort = null;
    cleanNotification();

    if (requestsQueue.length) {
        requestsQueue[0].port.postMessage({
            callbackid: requestsQueue[0].callbackid,
            response: {
                errorCode: 1,
                errorMessage: "Binary part closed"
            }
        });
        if (requestsQueue.length > 1)
            executeNextOperation(true);
        else
            requestsQueue = [];
    }
}

let binaryPort;

browser.runtime.onConnect.addListener(port => {
    port.onMessage.addListener(msg => {
        log("got request", msg);
        let req, signCheckReq;

        if (msg.request.type === "register")
            [req, signCheckReq] = [msg.request.requests, msg.request.signRequests];
        else
            [req, signCheckReq] = [msg.request.signRequests, null];

        req = Array.isArray(req) ? req : [req];
        scheduleNextOperation({
            type: msg.request.type,
            origin: msg.origin,
            challenges: req,
            signChallenges: signCheckReq && signCheckReq.length ? signCheckReq : null,
            callbackid: msg.callbackid,
            port: port,
            timeout: msg.timeout
        });
    });
    port.onDisconnect.addListener(() => {
        let ourOperationActive = requestsQueue[0].port === port;
        requestsQueue = requestsQueue.filter(r => r.port !== port);
        if (ourOperationActive) {
            requestsQueue.unshift(1);
            dropActiveRequest();
        }
    });
});

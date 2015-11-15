/* global exports, console:true */
"use strict";

const { Request } = require("sdk/request");
const { resolve, reject, defer } = require('sdk/core/promise');
const { URL, getTLD } = require("sdk/url");

function allValid(promises) {
  const { resolve, promise } = defer();
  var goodValues = [];
  var valuesLeft = {count: promises.length};
  var finished = function() {
    if (--valuesLeft)
      return;
    resolve(goodValues.sort((a,b) => a[0] - b[0]).map(v=>v[1]));
  };
  promises.forEach((p,i) => p.then(v => {
    goodValues.push([i, v]);
    finished();
  }).catch(v => {
    console.info("Failed resolve", v);
    finished();
  }));
  return promise;
}

function fetchTrustedFacetsList(url) {
  const { resolve, reject, promise } = defer();
  let r = new Request({
    url: url,
    anonymous: true,
    onComplete: res => {
      if (res.status < 200 || res.status > 399)
        reject("Can't fetch trusted facets list");

      if (!res.json || !res.json.trustedFacets || !Array.isArray(res.json.trustedFacets))
        reject("Invalid content of trusted facets list");

      let facets = res.json.trustedFacets.filter(v => v.version && v.version.major ==
        1 && v.version.minor == 0);
      if (facets.length != 1)
        reject("No trusted facet with version 1.0");

      resolve(facets.ids);
    }
  });
  r.get();
  return promise;
}

function url2str(url, includePath) {
  let port;
  if (!url.port || (url.scheme == "https" && url.port == 433) ||
    (url.scheme == "http" && url.port == 80))
    port = "";
  else
    port = ":" + url.port;

  return url.scheme + "://" + url.host + port + (includePath ? url.path : "");
}

function getTLDPlusOne(url) {
  if (typeof(url) == "string") {
    try {
      url = URL(url);
    } catch (ex) {
      return "";
    }
  }

  let tld = getTLD(url);
  return url.host.slice(0, -tld.length - 1).replace(/.*\.([^.])$/, "$1." + tld);
}

function hasValidAppId(facetId, challenge) {
  try {
    let ou = URL(facetId);

    if (!challenge.appId) {
      challenge.appId = url2str(ou, true);
      return resolve(challenge);
    }

    let u = URL(challenge.appId);

    if (u.scheme == "http")
      if (url2str(u, true) == url2str(ou, true))
        return resolve(challenge);
      else
        return reject("Not matching appID");

    if (url2str(u) == url2str(ou))
      return resolve(challenge);

    if (getTLDPlusOne(u) != getTLDPlusOne(ou))
      return reject("Not matching origin domain and appID");

    {
      const { resolve, reject, promise } = defer();

      fetchTrustedFacetsList(challenge.appId).then(ids => {
        let tld = getTLDPlusOne(u);
        try {
          ids = ids.map(v => url2str(v));
        } catch (ex) {
          reject("Invalid entry in trusted facet list");
          return;
        }
        if (!ids.all(id => getTLDPlusOne(id) == tld)) {
          reject("Invalid entry in trusted facet list");
          return;
        }
        if (!(url2str(ou) in ids)) {
          reject("No entry fot facet in trusted facet list");
          return;
        }
        resolve(challenge);
      });
      return promise;
    }
  } catch (ex) {
    reject("Invalid appId");
  }
}

function allValidAppIds(facetId, challenges) {
  return allValid(challenges.map(c => hasValidAppId(facetId, c)));
}

exports.hasValidAppId = hasValidAppId;
exports.allValidAppIds = allValidAppIds;

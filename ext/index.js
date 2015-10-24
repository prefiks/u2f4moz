var self = require("sdk/self");
var pageMod = require("sdk/page-mod");
var child_process = require("sdk/system/child_process");
var { emit } = require('sdk/event/core');
var system = require("sdk/system");
var url = require("sdk/url");

function execBin(args, stdin, event, callbackid, worker) {
  console.info("EB1",args,event);
  var path = url.toFilename(self.data.url("../bin/"+system.platform+"_"+system.architecture+"-"+system.compiler+"/u2f"));
  console.info("EB2",path);
  var cmd = child_process.spawn(path, args, {});
  console.info("EB3",cmd);
  var response = {value:""};
  cmd.stdout.on("data", function(data) {
    console.info("EBD",data);
    response.value += data;
  })
  cmd.on("close", function(code) {
    console.info("EBC",code,response.value.length);
    if (code == 0 && response.value.length)
      worker.port.emit(event, callbackid, JSON.parse(response.value));
    else
      worker.port.emit(event, callbackid, {errorCode: 1});
  })
  emit(cmd.stdin, "data", stdin);
  emit(cmd.stdin, "end");
}

pageMod.PageMod({
  include: "*",
  contentScriptWhen: "start",
  attachTo: ["existing", "top"],
  contentScriptFile: "./content-script.js",
  onAttach: function(worker) {

    worker.port.on("register", function(requests, callbackid, domain) {
      var req = Array.isArray(requests) ? requests[0] : requests;
      execBin(["r", domain], JSON.stringify(req),
       "registerResponse", callbackid, worker);
    })
    worker.port.on("sign", function(signRequests, callbackid, domain) {
      var req = Array.isArray(signRequests) ? signRequests[0] : signRequests;
      execBin(["s", domain], JSON.stringify(req),
       "signResponse", callbackid, worker);
    })
  }
});

/*
https://demo.yubico.com/u2f
u2f.sign([{appId:"https://demo.yubico.com", challenge:"ti2VON7Oc1Ud5uEixs3g1iMJhTYqgjQ4bDzW0LfQJaY", keyHandle:"t5dp7gHHrh6UpoYxpbbBcT31ub0tC-SfAPpHQVWzXnJzbE2vhDVF5oaHxcjmiwr7Xl4cDOHiyMZz6BWldooVyQ", version:"U2F_V2"}], function(c){window.c=c;console.info("res",c)})
u2f.register([{challenge:"zLA9a6ifD28iWXgM9ka1MIf55OGHPP-PD8jdvCPKQVw", version: "U2F_V2", appId: "https://demo.yubico.com"}], [], c=>console.info("RESPO", c), 10)
SMH4Lvt
*/

/* global self, document */
var receivedLogs;

function displayLogs() {
  if (!receivedLogs)
    return;

  var ul = document.getElementsByTagName("ul")[0];
  var hd = document.getElementById("hide-data").checked;

  while (ul.firstChild)
    ul.removeChild(ul.firstChild);

  receivedLogs.forEach(v => {
    var el = document.createElement("li");
    if (hd)
      v = v.replace(/("?challenge"?)\s*:\s*".*?"/g, "$1:\"...\"").
        replace(/("?keyHandle"?)\s*:\s*".*?"/g, "$1:\"...\"").
        replace(/("?signatureData"?)\s*:\s*".*?"/g, "$1:\"...\"").
        replace(/("?clientData"?)\s*:\s*".*?"/g, "$1:\"...\"");
    el.textContent = v;
    ul.appendChild(el);
  });
}

self.port.on("logs", function(logs) {
  receivedLogs = logs;
  displayLogs();
});

document.getElementById("hide-data").addEventListener("input", displayLogs, false);

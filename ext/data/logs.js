/* global self, document */
self.port.on("logs", function(logs) {
  var ul = document.getElementsByTagName("ul")[0];
  logs.forEach(v => {
    var el = document.createElement("li");
    el.textContent = v;
    ul.appendChild(el);
  });
});

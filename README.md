# U2F Support Firefox Extension

This extension adds support for the U2F specification with Yubico devices to Firefox.

It can be used by accessing window.u2f object from content pages.

Install from https://addons.mozilla.org/firefox/addon/u2f-support-add-on/

## Build instructions ##

1. `cd c_src`
2. `cmake`
3. `make && make install`
4. `cd ../ext`
5. `jpm run`

On OS X the u2f binary may lose its executable bit upon packaging as an XPI.

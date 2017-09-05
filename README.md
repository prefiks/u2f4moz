# U2F Support Firefox Extension [![Build Status](https://travis-ci.org/prefiks/u2f4moz.svg?branch=master)](https://travis-ci.org/prefiks/u2f4moz)

This extension adds support for the U2F specification with Yubico devices to Firefox.

It can be used by accessing window.u2f object from content pages.

Install from https://addons.mozilla.org/firefox/addon/u2f-support-add-on/

## Build instructions ##

1. `cd c_src`
2. `cmake`
3. `make && make install`
4. `cd ../ext`
5. `jpm run`

On OS X and Linux the u2f binary may lose its executable bit upon packaging XPI this way.

It's possible to make XPI file manually by executing `cd ext; zip -9r ../u2f.xpi *` or
included bash script `scripts/make-xpi.sh`, this way permissions in final file will be correct.

## Permissions tweaks for Linux ##

On Linux access to U2F devices may not be permitted to Firefox, installing extra
[udev rules](https://github.com/Yubico/libu2f-host/blob/master/70-u2f.rules) may help
in this situation.

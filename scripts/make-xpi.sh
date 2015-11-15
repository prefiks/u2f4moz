#!/bin/bash

(cd ext; zip -9r ../u2f.xpi bin/* `git ls-files`)

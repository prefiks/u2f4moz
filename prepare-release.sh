#!/bin/bash

git stash

VERSION=`perl -ne 'print $1 if (/"version"\s*:\s*"(.*?)"/)' ext/package.json`
MINVER=`perl -ne 'print $1 if (/minVersion>\s*(.*?)\s*</)' ext/install.rdf`
MAXVER=`perl -ne 'print $1 if (/maxVersion>\s*(.*?)\s*</)' ext/install.rdf`

cp ext/install.rdf install.rdf
perl -pi -e 's!(\s*<em:targetApplication)!<em:updateURL>https://prefiks.github.io/u2f4moz/update.rdf</em:updateURL>\n$1!' ext/install.rdf
#(cd ext; zip -9r ../u2f-$VERSION-github.xpi *)

mv install.rdf ext/install.rdf
#(cd ext; zip -9r ../u2f-$VERSION.xpi *)

git archive --format zip HEAD >u2f-src-$VERSION.zip

SHA=`sha256sum u2f-$VERSION-github.xpi | cut -f1 -d' '`

XPIURL="https://github.com/prefiks/u2f4moz/releases/download/v${VERSION}/u2f-${VERSION}-github.xpi"

echo '<?xml version="1.0" encoding="UTF-8"?>
<RDF:RDF xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:em="http://www.mozilla.org/2004/em-rdf#">
  <RDF:Description about="urn:mozilla:extension:u2f4moz@prefiks.org">
    <em:updates>
      <RDF:Seq>
        <RDF:li>
          <RDF:Description>
            <em:version>@VER@</em:version>
            <em:targetApplication>
              <RDF:Description>
                <em:id>{ec8030f7-c20a-464f-9b0e-13a3a9e97384}</em:id>
                <em:minVersion>@MINVER@</em:minVersion>
                <em:maxVersion>@MAXVER@</em:maxVersion>
                <em:updateLink>@XPIURL@</em:updateLink>
                <em:updateHash>sha256:@SHA@</em:updateHash>
              </RDF:Description>
            </em:targetApplication>
          </RDF:Description>
        </RDF:li>
      </RDF:Seq>
    </em:updates>
  </RDF:Description>
</RDF:RDF>' | perl -pe "
s/\@VER\@/$VERSION/g;
s/\@MINVER\@/$MINVER/g;
s/\@MAXVER\@/$MAXVER/g;
s/\@SHA\@/$SHA/g;
s!\@XPIURL\@!$XPIURL!g;
"> update.rdf

git stash pop

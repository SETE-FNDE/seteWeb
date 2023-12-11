#!/bin/bash

find src -name '*.html' -exec sed -i '' 's/=\".\/modules/=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/modules/g' {} \;
find src -name '*.html' -exec sed -i '' 's/=\".\/img/=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/img/g' {} \;
find src -name '*.html' -exec sed -i '' 's/=\"img/=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/img/g' {} \;
find src -name '*.html' -exec sed -i '' 's/href=\"css/href=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/css/g' {} \;
find src -name '*.html' -exec sed -i '' 's/href=\"css/href=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/css/g' {} \;
find src -name '*.html' -exec sed -i '' 's/src=\"js/src=\"https:\/\/www.fnde.gov.br\/sete\/src\/renderer\/js/g' {} \;
find src -name '*common.js' -exec sed -i '' 's/remoteNavigation[[:space:]]=[[:space:]]false/remoteNavigation=true/g' {} \;

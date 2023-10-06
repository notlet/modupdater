if [ -z "$1" ]; then
    echo "No version specified!"
    exit 1
fi

ver="v$1"

rm -v "modupdater_$ver.zip"

zip "modupdater_$ver.zip" modupdater.js
zip "modupdater_$ver.zip" package.json
zip "modupdater_$ver.zip" run.*

echo Done.
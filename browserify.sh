if [ "$1" == "debug" ]; then
  browserify ./examples/browserify-main.js -o ./examples/bundle.js --debug
else
  browserify ./examples/browserify-main.js -o ./examples/bundle.js
fi

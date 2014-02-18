(function() {
    'use strict';

    var localStorageWrapper = require('./drivers/localstorage');
    var asyncStorage = require('./drivers/indexeddb');
    var webSQLStorage = require('./drivers/websql');

    // Promises!
    var Promise = window.Promise;

    // Avoid those magic constants!
    var MODULE_TYPE_DEFINE = 1;
    var MODULE_TYPE_EXPORT = 2;
    var MODULE_TYPE_WINDOW = 3;

    // Attaching to window (i.e. no module loader) is the assumed,
    // simple default.
    var moduleType = MODULE_TYPE_WINDOW;

    // Find out what kind of module setup we have; if none, we'll just attach
    // localForage to the main window.
    if (typeof define === 'function' && define.amd) {
        moduleType = MODULE_TYPE_DEFINE;
    } else if (typeof module !== 'undefined' && module.exports) {
        moduleType = MODULE_TYPE_EXPORT;
    }

    // Initialize IndexedDB; fall back to vendor-prefixed versions if needed.
    var indexedDB = indexedDB || window.indexedDB || window.webkitIndexedDB ||
                    window.mozIndexedDB || window.OIndexedDB ||
                    window.msIndexedDB;

    // The actual localForage object that we expose as a module or via a global.
    // It's extended by pulling in one of our other libraries.
    var _this = this;
    var INDEXEDDB = "asyncStorage";
    var WEBSQL = "webSQLStorage";
    var LOCALSTORAGE = "localStorageWrapper";

    var localForage = {};

    localForage[INDEXEDDB] = asyncStorage;
    localForage[LOCALSTORAGE] =  localStorageWrapper;
    localForage[WEBSQL] = webSQLStorage;
    localForage.setDriver = function(driverName, callback) {
            return new Promise(function(resolve, reject) {
                if ((!indexedDB && driver === Object.keys(localForage)[0].toString()) ||
                    (!window.openDatabase && driverName === Object.keys(localForage)[2].toString())) {
                    if (callback) {
                        callback(localForage);
                    }

                    reject(localForage);

                    return;
                }

                // We allow localForage to be declared as a module or as a library
                // available without AMD/require.js.
                if (moduleType === MODULE_TYPE_DEFINE) {
                    require([driverName], function(lib) {
                        localForage._extend(lib);

                        if (callback) {
                            callback(localForage);
                        }

                        resolve(localForage);
                    });
                } else if (moduleType === MODULE_TYPE_EXPORT) {
                    localForage._extend(localForage[driverName]);

                    if (callback) {
                        callback(localForage);
                    }

                    resolve(localForage);
                } else {
                    localForage._extend(_this[driverName]);

                    if (callback) {
                        callback(localForage);
                    }

                    resolve(localForage);
                }
            });
        };
     localForage._extend = function(libraryMethodsAndProperties) {
            for (var i in libraryMethodsAndProperties) {
                if (libraryMethodsAndProperties.hasOwnProperty(i)) {
                    this[i] = libraryMethodsAndProperties[i];
                }
            }
        };

    var storageLibrary;
    // Check to see if IndexedDB is available; it's our preferred backend
    // library.
    if (indexedDB) {
        storageLibrary = localForage.INDEXEDDB;
    } else if (window.openDatabase) { // WebSQL is available, so we'll use that.
        storageLibrary = localForage.WEBSQL;
    } else { // If nothing else is available, we use localStorage.
        storageLibrary = localForage.LOCALSTORAGE;
    }

    // Set the (default) driver.
    localForage.setDriver(storageLibrary);

    // We allow localForage to be declared as a module or as a library
    // available without AMD/require.js.
    if (moduleType === MODULE_TYPE_DEFINE) {
        define(function() {
            return localForage;
        });
    } else if (moduleType === MODULE_TYPE_EXPORT) {
        module.exports = localForage;
    } else {
        this.localforage = localForage;
    }
}).call(this);

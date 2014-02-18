(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var localforage = require('../src/localforage');
console.log(localforage.setItem);
localforage.setDriver('localStorageWrapper').then(function(lf){
    var key = 'STORE_KEY';
    var value = 'What we save offline';
    var UNKNOWN_KEY = 'unknown_key';

    lf.setItem(key, value, function() {
      console.log('SAVING', value);

      lf.getItem(key, function(readValue) {
        console.log('READING', readValue);
      });
    });

    // Promises code.
    lf.setItem('promise', 'ring', function() {
      lf.getItem('promise').then(function(readValue) {
        console.log('YOU PROMISED!', readValue);
      });
    });

    // Since this key hasn't been set yet, we'll get a null value
    lf.getItem(UNKNOWN_KEY, function(readValue) {
      console.log('FAILED READING', UNKNOWN_KEY, readValue);
    });
});

},{"../src/localforage":5}],2:[function(require,module,exports){
(function() {
    'use strict';

    /**
     * This file defines an asynchronous version of the localStorage API, backed by
     * an IndexedDB database. It creates a global asyncStorage object that has
     * methods like the localStorage object.
     *
     * To store a value use setItem:
     *
     *     asyncStorage.setItem('key', 'value');
     *
     * If you want confirmation that the value has been stored, pass a callback
     * function as the third argument:
     *
     *    asyncStorage.setItem('key', 'newvalue', function() {
     *        console.log('new value stored');
     *    });
     *
     * To read a value, call getItem(), but note that you must supply a callback
     * function that the value will be passed to asynchronously:
     *
     *    asyncStorage.getItem('key', function(value) {
     *        console.log('The value of key is:', value);
     *    });
     *
     * Note that unlike localStorage, asyncStorage does not allow you to store and
     * retrieve values by setting and querying properties directly. You cannot just
     * write asyncStorage.key; you have to explicitly call setItem() or getItem().
     *
     * removeItem(), clear(), length(), and key() are like the same-named methods of
     * localStorage, but, like getItem() and setItem() they take a callback
     * argument.
     *
     * The asynchronous nature of getItem() makes it tricky to retrieve multiple
     * values. But unlike localStorage, asyncStorage does not require the values you
     * store to be strings.    So if you need to save multiple values and want to
     * retrieve them together, in a single asynchronous operation, just group the
     * values into a single object. The properties of this object may not include
     * DOM elements, but they may include things like Blobs and typed arrays.
     */

    var DBNAME = 'asyncStorage';
    var DBVERSION = 1;
    var STORENAME = 'keyvaluepairs';
    var Promise = window.Promise;
    var db = null;

    // Initialize IndexedDB; fall back to vendor-prefixed versions if needed.
    var indexedDB = indexedDB || window.indexedDB || window.webkitIndexedDB ||
                    window.mozIndexedDB || window.OIndexedDB ||
                    window.msIndexedDB;

    // If IndexedDB isn't available, we get outta here!
    if (!indexedDB) {
        return;
    }

    function withStore(type, f) {
        if (db) {
            f(db.transaction(STORENAME, type).objectStore(STORENAME));
        } else {
            var openreq = indexedDB.open(DBNAME, DBVERSION);
            openreq.onerror = function withStoreOnError() {
                console.error("asyncStorage: can't open database:", openreq.error.name);
            };
            openreq.onupgradeneeded = function withStoreOnUpgradeNeeded() {
                // First time setup: create an empty object store
                openreq.result.createObjectStore(STORENAME);
            };
            openreq.onsuccess = function withStoreOnSuccess() {
                db = openreq.result;
                f(db.transaction(STORENAME, type).objectStore(STORENAME));
            };
        }
    }

    function getItem(key, callback) {
        return new Promise(function(resolve, reject) {
            withStore('readonly', function getItemBody(store) {
                var req = store.get(key);
                req.onsuccess = function getItemOnSuccess() {
                    var value = req.result;
                    if (value === undefined) {
                        value = null;
                    }

                    if (callback) {
                        callback(value);
                    }

                    resolve(value);
                };
                req.onerror = function getItemOnError() {
                    console.error('Error in asyncStorage.getItem(): ', req.error.name);
                };
            });
        });
    }

    function setItem(key, value, callback) {
        return new Promise(function(resolve, reject) {
            withStore('readwrite', function setItemBody(store) {
                // Cast to undefined so the value passed to callback/promise is
                // the same as what one would get out of `getItem()` later.
                // This leads to some weirdness (setItem('foo', undefined) will
                // return "null"), but it's not my fault localStorage is our
                // baseline and that it's weird.
                if (value === undefined) {
                    value = null;
                }

                var req = store.put(value, key);
                req.onsuccess = function setItemOnSuccess() {
                    if (callback) {
                        callback(value);
                    }

                    resolve(value);
                };
                req.onerror = function setItemOnError() {
                    console.error('Error in asyncStorage.setItem(): ', req.error.name);
                };
            });
        });
    }

    function removeItem(key, callback) {
        return new Promise(function(resolve, reject) {
            withStore('readwrite', function removeItemBody(store) {
                // We use `['delete']` instead of `.delete` because IE 8 will
                // throw a fit if it sees the reserved word "delete" in this
                // scenario. See: https://github.com/mozilla/localForage/pull/67
                //
                // This can be removed once we no longer care about IE 8, for
                // what that's worth.
                // TODO: Write a test against this? Maybe IE in general? Also,
                // make sure the minify step doesn't optimise this to `.delete`,
                // though it currently doesn't.
                var req = store['delete'](key);
                req.onsuccess = function removeItemOnSuccess() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                };
                req.onerror = function removeItemOnError() {
                    console.error('Error in asyncStorage.removeItem(): ', req.error.name);
                };
            });
        });
    }

    function clear(callback) {
        return new Promise(function(resolve, reject) {
            withStore('readwrite', function clearBody(store) {
                var req = store.clear();
                req.onsuccess = function clearOnSuccess() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                };
                req.onerror = function clearOnError() {
                    console.error('Error in asyncStorage.clear(): ', req.error.name);
                };
            });
        });
    }

    function length(callback) {
        return new Promise(function(resolve, reject) {
            withStore('readonly', function lengthBody(store) {
                var req = store.count();
                req.onsuccess = function lengthOnSuccess() {
                    if (callback) {
                        callback(req.result);
                    }

                    resolve(req.result);
                };
                req.onerror = function lengthOnError() {
                    console.error('Error in asyncStorage.length(): ', req.error.name);
                };
            });
        });
    }

    function key(n, callback) {
        return new Promise(function(resolve, reject) {
            if (n < 0) {
                if (callback) {
                    callback(null);
                }

                resolve(null);

                return;
            }

            withStore('readonly', function keyBody(store) {
                var advanced = false;
                var req = store.openCursor();
                req.onsuccess = function keyOnSuccess() {
                    var cursor = req.result;
                    if (!cursor) {
                        // this means there weren't enough keys
                        if (callback) {
                            callback(null);
                        }

                        resolve(null);

                        return;
                    }
                    if (n === 0) {
                        // We have the first key, return it if that's what they wanted
                        if (callback) {
                            callback(cursor.key);
                        }

                        resolve(cursor.key);
                    } else {
                        if (!advanced) {
                            // Otherwise, ask the cursor to skip ahead n records
                            advanced = true;
                            cursor.advance(n);
                        } else {
                            // When we get here, we've got the nth key.
                            if (callback) {
                                callback(cursor.key);
                            }

                            resolve(cursor.key);
                        }
                    }
                };

                req.onerror = function keyOnError() {
                    console.error('Error in asyncStorage.key(): ', req.error.name);
                };
            });
        });
    }

    var asyncStorage = {
        driver: 'asyncStorage',
        getItem: getItem,
        setItem: setItem,
        removeItem: removeItem,
        clear: clear,
        length: length,
        key: key
    };

    if (typeof define === 'function' && define.amd) {
        define('asyncStorage', function() {
            return asyncStorage;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = asyncStorage;
    } else {
        this.asyncStorage = asyncStorage;
    }
}).call(this);

},{}],3:[function(require,module,exports){
// If IndexedDB isn't available, we'll fall back to localStorage.
// Note that this will have considerable performance and storage
// side-effects (all data will be serialized on save and only data that
// can be converted to a string via `JSON.stringify()` will be saved).
(function() {
    'use strict';

    var Promise = window.Promise;

    // If the app is running inside a Google Chrome packaged webapp, we don't
    // use localStorage.
    if (window.chrome && window.chrome.runtime) {
        return;
    }

    // Initialize localStorage and create a variable to use throughout the code.
    var localStorage = window.localStorage;

    // Remove all keys from the datastore, effectively destroying all data in
    // the app's key/value store!
    function clear(callback) {
        return new Promise(function(resolve, reject) {
            localStorage.clear();

            if (callback) {
                callback();
            }

            resolve();
        });
    }

    // Retrieve an item from the store. Unlike the original async_storage
    // library in Gaia, we don't modify return values at all. If a key's value
    // is `undefined`, we pass that value to the callback function.
    function getItem(key, callback) {
        return new Promise(function(resolve, reject) {
            try {
                var result = localStorage.getItem(key);

                // If a result was found, parse it from serialized JSON into a
                // JS object. If result isn't truthy, the key is likely
                // undefined and we'll pass it straight to the callback.
                if (result) {
                    result = JSON.parse(result);
                }

                if (callback) {
                    callback(result);
                }

                resolve(result);
            } catch (e) {
                reject(e);
            }
        });
    }

    // Same as localStorage's key() method, except takes a callback.
    function key(n, callback) {
        return new Promise(function(resolve, reject) {
            var result = localStorage.key(n);

            if (callback) {
                callback(result);
            }

            resolve(result);
        });
    }

    // Supply the number of keys in the datastore to the callback function.
    function length(callback) {
        return new Promise(function(resolve, reject) {
            var result = localStorage.length;

            if (callback) {
                callback(result);
            }

            resolve(result);
        });
    }

    // Remove an item from the store, nice and simple.
    function removeItem(key, callback) {
        return new Promise(function(resolve, reject) {
            localStorage.removeItem(key);

            if (callback) {
                callback();
            }

            resolve();
        });
    }

    // Set a key's value and run an optional callback once the value is set.
    // Unlike Gaia's implementation, the callback function is passed the value,
    // in case you want to operate on that value only after you're sure it
    // saved, or something like that.
    function setItem(key, value, callback) {
        return new Promise(function(resolve, reject) {
            // Convert undefined values to null.
            // https://github.com/mozilla/localForage/pull/42
            if (value === undefined) {
                value = null;
            }

            // Save the original value to pass to the callback.
            var originalValue = value;

            try {
                value = JSON.stringify(value);
            } catch (e) {
                console.error("Couldn't convert value into a JSON string: ",
                              value);
                reject(e);
            }

            localStorage.setItem(key, value);

            if (callback) {
                callback(originalValue);
            }

            resolve(originalValue);
        });
    }

    var localStorageWrapper = {
        driver: 'localStorageWrapper',
        // Default API, from Gaia/localStorage.
        getItem: getItem,
        setItem: setItem,
        removeItem: removeItem,
        clear: clear,
        length: length,
        key: key
    };

    if (typeof define === 'function' && define.amd) {
        define('localStorageWrapper', function() {
            return localStorageWrapper;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = localStorageWrapper;
    } else {
        this.localStorageWrapper = localStorageWrapper;
    }
}).call(this);

},{}],4:[function(require,module,exports){
(function() {
    'use strict';

    var DB_NAME = 'localforage';
    // Default DB size is _JUST UNDER_ 5MB, as it's the highest size we can use
    // without a prompt.
    //
    // TODO: Add a way to increase this size programmatically?
    var DB_SIZE = 4980736;
    var DB_VERSION = '1.0';
    var SERIALIZED_MARKER = '__lfsc__:';
    var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;
    var STORE_NAME = 'keyvaluepairs';
    var Promise = window.Promise;

    // If WebSQL methods aren't available, we can stop now.
    if (!window.openDatabase) {
        return;
    }

    // Open the database; the openDatabase API will automatically create it for
    // us if it doesn't exist.
    var db = window.openDatabase(DB_NAME, DB_VERSION, STORE_NAME, DB_SIZE);

    // Create our key/value table if it doesn't exist.
    // TODO: Technically I can imagine this being as race condition, as I'm not
    // positive on the WebSQL API enough to be sure that other transactions
    // won't be run before this? But I assume not.
    db.transaction(function (t) {
        t.executeSql('CREATE TABLE IF NOT EXISTS localforage (id INTEGER PRIMARY KEY, key unique, value)');
    });

    function getItem(key, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('SELECT * FROM localforage WHERE key = ? LIMIT 1', [key], function (t, results) {
                    var result = results.rows.length ? results.rows.item(0).value : null;

                    // Check to see if this is serialized content we need to
                    // unpack.
                    if (result && result.substr(0, SERIALIZED_MARKER_LENGTH) === SERIALIZED_MARKER) {
                        try {
                            result = JSON.parse(result.slice(SERIALIZED_MARKER_LENGTH));
                        } catch (e) {
                            reject(e);
                        }
                    }

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    function setItem(key, value, callback) {
        return new Promise(function(resolve, reject) {
            // The localStorage API doesn't return undefined values in an
            // "expected" way, so undefined is always cast to null in all
            // drivers. See: https://github.com/mozilla/localForage/pull/42
            if (value === undefined) {
                value = null;
            }

            // We need to serialize certain types of objects using WebSQL;
            // otherwise they'll get stored as strings as be useless when we
            // use getItem() later.
            var valueToSave;
            if (typeof(value) === 'boolean' || typeof(value) === 'number' || typeof(value) === 'object') {
                // Mark the content as "localForage serialized content" so we
                // know to run JSON.parse() on it when we get it back out from
                // the database.
                valueToSave = SERIALIZED_MARKER + JSON.stringify(value);
            } else {
                valueToSave = value;
            }

            db.transaction(function (t) {
                t.executeSql('INSERT OR REPLACE INTO localforage (key, value) VALUES (?, ?)', [key, valueToSave], function() {
                    if (callback) {
                        callback(value);
                    }

                    resolve(value);
                }, null);
            });
        });
    }

    function removeItem(key, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('DELETE FROM localforage WHERE key = ? LIMIT 1', [key], function() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, null);
            });
        });
    }

    // Deletes every item in the table with a TRUNCATE call.
    // TODO: Find out if this resets the AUTO_INCREMENT number.
    function clear(callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('DELETE FROM localforage', [], function(t, results) {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, null);
            });
        });
    }

    // Does a simple `COUNT(key)` to get the number of items stored in
    // localForage.
    function length(callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                // Ahhh, SQL makes this one soooooo easy.
                t.executeSql('SELECT COUNT(key) as c FROM localforage', [], function (t, results) {
                    var result = results.rows.item(0).c;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    // Return the key located at key index X; essentially gets the key from a
    // `WHERE id = ?`. This is the most efficient way I can think to implement
    // this rarely-used (in my experience) part of the API, but it can seem
    // inconsistent, because we do `INSERT OR REPLACE INTO` on `setItem()`, so
    // the ID of each key will change every time it's updated. Perhaps a stored
    // procedure for the `setItem()` SQL would solve this problem?
    // TODO: Don't change ID on `setItem()`.
    function key(n, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('SELECT key FROM localforage WHERE id = ? LIMIT 1', [n + 1], function (t, results) {
                    var result = results.rows.length ? results.rows.item(0).key : null;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    var webSQLStorage = {
        driver: 'webSQLStorage',
        getItem: getItem,
        setItem: setItem,
        removeItem: removeItem,
        clear: clear,
        length: length,
        key: key
    };

    if (typeof define === 'function' && define.amd) {
        define('webSQLStorage', function() {
            return webSQLStorage;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = webSQLStorage;
    } else {
        this.webSQLStorage = webSQLStorage;
    }
}).call(this);

},{}],5:[function(require,module,exports){
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

},{"./drivers/indexeddb":2,"./drivers/localstorage":3,"./drivers/websql":4}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL3ZpdmVuL1Byb2plY3RzL2ZvcmtzL2xvY2FsRm9yYWdlL2V4YW1wbGVzL2Jyb3dzZXJpZnktbWFpbi5qcyIsIi9Vc2Vycy92aXZlbi9Qcm9qZWN0cy9mb3Jrcy9sb2NhbEZvcmFnZS9zcmMvZHJpdmVycy9pbmRleGVkZGIuanMiLCIvVXNlcnMvdml2ZW4vUHJvamVjdHMvZm9ya3MvbG9jYWxGb3JhZ2Uvc3JjL2RyaXZlcnMvbG9jYWxzdG9yYWdlLmpzIiwiL1VzZXJzL3ZpdmVuL1Byb2plY3RzL2ZvcmtzL2xvY2FsRm9yYWdlL3NyYy9kcml2ZXJzL3dlYnNxbC5qcyIsIi9Vc2Vycy92aXZlbi9Qcm9qZWN0cy9mb3Jrcy9sb2NhbEZvcmFnZS9zcmMvbG9jYWxmb3JhZ2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGxvY2FsZm9yYWdlID0gcmVxdWlyZSgnLi4vc3JjL2xvY2FsZm9yYWdlJyk7XG5jb25zb2xlLmxvZyhsb2NhbGZvcmFnZS5zZXRJdGVtKTtcbmxvY2FsZm9yYWdlLnNldERyaXZlcignbG9jYWxTdG9yYWdlV3JhcHBlcicpLnRoZW4oZnVuY3Rpb24obGYpe1xuICAgIHZhciBrZXkgPSAnU1RPUkVfS0VZJztcbiAgICB2YXIgdmFsdWUgPSAnV2hhdCB3ZSBzYXZlIG9mZmxpbmUnO1xuICAgIHZhciBVTktOT1dOX0tFWSA9ICd1bmtub3duX2tleSc7XG5cbiAgICBsZi5zZXRJdGVtKGtleSwgdmFsdWUsIGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS5sb2coJ1NBVklORycsIHZhbHVlKTtcblxuICAgICAgbGYuZ2V0SXRlbShrZXksIGZ1bmN0aW9uKHJlYWRWYWx1ZSkge1xuICAgICAgICBjb25zb2xlLmxvZygnUkVBRElORycsIHJlYWRWYWx1ZSk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIFByb21pc2VzIGNvZGUuXG4gICAgbGYuc2V0SXRlbSgncHJvbWlzZScsICdyaW5nJywgZnVuY3Rpb24oKSB7XG4gICAgICBsZi5nZXRJdGVtKCdwcm9taXNlJykudGhlbihmdW5jdGlvbihyZWFkVmFsdWUpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1lPVSBQUk9NSVNFRCEnLCByZWFkVmFsdWUpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBTaW5jZSB0aGlzIGtleSBoYXNuJ3QgYmVlbiBzZXQgeWV0LCB3ZSdsbCBnZXQgYSBudWxsIHZhbHVlXG4gICAgbGYuZ2V0SXRlbShVTktOT1dOX0tFWSwgZnVuY3Rpb24ocmVhZFZhbHVlKSB7XG4gICAgICBjb25zb2xlLmxvZygnRkFJTEVEIFJFQURJTkcnLCBVTktOT1dOX0tFWSwgcmVhZFZhbHVlKTtcbiAgICB9KTtcbn0pO1xuIiwiKGZ1bmN0aW9uKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qKlxuICAgICAqIFRoaXMgZmlsZSBkZWZpbmVzIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIHRoZSBsb2NhbFN0b3JhZ2UgQVBJLCBiYWNrZWQgYnlcbiAgICAgKiBhbiBJbmRleGVkREIgZGF0YWJhc2UuIEl0IGNyZWF0ZXMgYSBnbG9iYWwgYXN5bmNTdG9yYWdlIG9iamVjdCB0aGF0IGhhc1xuICAgICAqIG1ldGhvZHMgbGlrZSB0aGUgbG9jYWxTdG9yYWdlIG9iamVjdC5cbiAgICAgKlxuICAgICAqIFRvIHN0b3JlIGEgdmFsdWUgdXNlIHNldEl0ZW06XG4gICAgICpcbiAgICAgKiAgICAgYXN5bmNTdG9yYWdlLnNldEl0ZW0oJ2tleScsICd2YWx1ZScpO1xuICAgICAqXG4gICAgICogSWYgeW91IHdhbnQgY29uZmlybWF0aW9uIHRoYXQgdGhlIHZhbHVlIGhhcyBiZWVuIHN0b3JlZCwgcGFzcyBhIGNhbGxiYWNrXG4gICAgICogZnVuY3Rpb24gYXMgdGhlIHRoaXJkIGFyZ3VtZW50OlxuICAgICAqXG4gICAgICogICAgYXN5bmNTdG9yYWdlLnNldEl0ZW0oJ2tleScsICduZXd2YWx1ZScsIGZ1bmN0aW9uKCkge1xuICAgICAqICAgICAgICBjb25zb2xlLmxvZygnbmV3IHZhbHVlIHN0b3JlZCcpO1xuICAgICAqICAgIH0pO1xuICAgICAqXG4gICAgICogVG8gcmVhZCBhIHZhbHVlLCBjYWxsIGdldEl0ZW0oKSwgYnV0IG5vdGUgdGhhdCB5b3UgbXVzdCBzdXBwbHkgYSBjYWxsYmFja1xuICAgICAqIGZ1bmN0aW9uIHRoYXQgdGhlIHZhbHVlIHdpbGwgYmUgcGFzc2VkIHRvIGFzeW5jaHJvbm91c2x5OlxuICAgICAqXG4gICAgICogICAgYXN5bmNTdG9yYWdlLmdldEl0ZW0oJ2tleScsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICogICAgICAgIGNvbnNvbGUubG9nKCdUaGUgdmFsdWUgb2Yga2V5IGlzOicsIHZhbHVlKTtcbiAgICAgKiAgICB9KTtcbiAgICAgKlxuICAgICAqIE5vdGUgdGhhdCB1bmxpa2UgbG9jYWxTdG9yYWdlLCBhc3luY1N0b3JhZ2UgZG9lcyBub3QgYWxsb3cgeW91IHRvIHN0b3JlIGFuZFxuICAgICAqIHJldHJpZXZlIHZhbHVlcyBieSBzZXR0aW5nIGFuZCBxdWVyeWluZyBwcm9wZXJ0aWVzIGRpcmVjdGx5LiBZb3UgY2Fubm90IGp1c3RcbiAgICAgKiB3cml0ZSBhc3luY1N0b3JhZ2Uua2V5OyB5b3UgaGF2ZSB0byBleHBsaWNpdGx5IGNhbGwgc2V0SXRlbSgpIG9yIGdldEl0ZW0oKS5cbiAgICAgKlxuICAgICAqIHJlbW92ZUl0ZW0oKSwgY2xlYXIoKSwgbGVuZ3RoKCksIGFuZCBrZXkoKSBhcmUgbGlrZSB0aGUgc2FtZS1uYW1lZCBtZXRob2RzIG9mXG4gICAgICogbG9jYWxTdG9yYWdlLCBidXQsIGxpa2UgZ2V0SXRlbSgpIGFuZCBzZXRJdGVtKCkgdGhleSB0YWtlIGEgY2FsbGJhY2tcbiAgICAgKiBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIFRoZSBhc3luY2hyb25vdXMgbmF0dXJlIG9mIGdldEl0ZW0oKSBtYWtlcyBpdCB0cmlja3kgdG8gcmV0cmlldmUgbXVsdGlwbGVcbiAgICAgKiB2YWx1ZXMuIEJ1dCB1bmxpa2UgbG9jYWxTdG9yYWdlLCBhc3luY1N0b3JhZ2UgZG9lcyBub3QgcmVxdWlyZSB0aGUgdmFsdWVzIHlvdVxuICAgICAqIHN0b3JlIHRvIGJlIHN0cmluZ3MuICAgIFNvIGlmIHlvdSBuZWVkIHRvIHNhdmUgbXVsdGlwbGUgdmFsdWVzIGFuZCB3YW50IHRvXG4gICAgICogcmV0cmlldmUgdGhlbSB0b2dldGhlciwgaW4gYSBzaW5nbGUgYXN5bmNocm9ub3VzIG9wZXJhdGlvbiwganVzdCBncm91cCB0aGVcbiAgICAgKiB2YWx1ZXMgaW50byBhIHNpbmdsZSBvYmplY3QuIFRoZSBwcm9wZXJ0aWVzIG9mIHRoaXMgb2JqZWN0IG1heSBub3QgaW5jbHVkZVxuICAgICAqIERPTSBlbGVtZW50cywgYnV0IHRoZXkgbWF5IGluY2x1ZGUgdGhpbmdzIGxpa2UgQmxvYnMgYW5kIHR5cGVkIGFycmF5cy5cbiAgICAgKi9cblxuICAgIHZhciBEQk5BTUUgPSAnYXN5bmNTdG9yYWdlJztcbiAgICB2YXIgREJWRVJTSU9OID0gMTtcbiAgICB2YXIgU1RPUkVOQU1FID0gJ2tleXZhbHVlcGFpcnMnO1xuICAgIHZhciBQcm9taXNlID0gd2luZG93LlByb21pc2U7XG4gICAgdmFyIGRiID0gbnVsbDtcblxuICAgIC8vIEluaXRpYWxpemUgSW5kZXhlZERCOyBmYWxsIGJhY2sgdG8gdmVuZG9yLXByZWZpeGVkIHZlcnNpb25zIGlmIG5lZWRlZC5cbiAgICB2YXIgaW5kZXhlZERCID0gaW5kZXhlZERCIHx8IHdpbmRvdy5pbmRleGVkREIgfHwgd2luZG93LndlYmtpdEluZGV4ZWREQiB8fFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubW96SW5kZXhlZERCIHx8IHdpbmRvdy5PSW5kZXhlZERCIHx8XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5tc0luZGV4ZWREQjtcblxuICAgIC8vIElmIEluZGV4ZWREQiBpc24ndCBhdmFpbGFibGUsIHdlIGdldCBvdXR0YSBoZXJlIVxuICAgIGlmICghaW5kZXhlZERCKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3aXRoU3RvcmUodHlwZSwgZikge1xuICAgICAgICBpZiAoZGIpIHtcbiAgICAgICAgICAgIGYoZGIudHJhbnNhY3Rpb24oU1RPUkVOQU1FLCB0eXBlKS5vYmplY3RTdG9yZShTVE9SRU5BTUUpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvcGVucmVxID0gaW5kZXhlZERCLm9wZW4oREJOQU1FLCBEQlZFUlNJT04pO1xuICAgICAgICAgICAgb3BlbnJlcS5vbmVycm9yID0gZnVuY3Rpb24gd2l0aFN0b3JlT25FcnJvcigpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiYXN5bmNTdG9yYWdlOiBjYW4ndCBvcGVuIGRhdGFiYXNlOlwiLCBvcGVucmVxLmVycm9yLm5hbWUpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG9wZW5yZXEub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24gd2l0aFN0b3JlT25VcGdyYWRlTmVlZGVkKCkge1xuICAgICAgICAgICAgICAgIC8vIEZpcnN0IHRpbWUgc2V0dXA6IGNyZWF0ZSBhbiBlbXB0eSBvYmplY3Qgc3RvcmVcbiAgICAgICAgICAgICAgICBvcGVucmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShTVE9SRU5BTUUpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG9wZW5yZXEub25zdWNjZXNzID0gZnVuY3Rpb24gd2l0aFN0b3JlT25TdWNjZXNzKCkge1xuICAgICAgICAgICAgICAgIGRiID0gb3BlbnJlcS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgZihkYi50cmFuc2FjdGlvbihTVE9SRU5BTUUsIHR5cGUpLm9iamVjdFN0b3JlKFNUT1JFTkFNRSkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEl0ZW0oa2V5LCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICB3aXRoU3RvcmUoJ3JlYWRvbmx5JywgZnVuY3Rpb24gZ2V0SXRlbUJvZHkoc3RvcmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVxID0gc3RvcmUuZ2V0KGtleSk7XG4gICAgICAgICAgICAgICAgcmVxLm9uc3VjY2VzcyA9IGZ1bmN0aW9uIGdldEl0ZW1PblN1Y2Nlc3MoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHJlcS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUodmFsdWUpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVxLm9uZXJyb3IgPSBmdW5jdGlvbiBnZXRJdGVtT25FcnJvcigpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYXN5bmNTdG9yYWdlLmdldEl0ZW0oKTogJywgcmVxLmVycm9yLm5hbWUpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0SXRlbShrZXksIHZhbHVlLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICB3aXRoU3RvcmUoJ3JlYWR3cml0ZScsIGZ1bmN0aW9uIHNldEl0ZW1Cb2R5KHN0b3JlKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2FzdCB0byB1bmRlZmluZWQgc28gdGhlIHZhbHVlIHBhc3NlZCB0byBjYWxsYmFjay9wcm9taXNlIGlzXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNhbWUgYXMgd2hhdCBvbmUgd291bGQgZ2V0IG91dCBvZiBgZ2V0SXRlbSgpYCBsYXRlci5cbiAgICAgICAgICAgICAgICAvLyBUaGlzIGxlYWRzIHRvIHNvbWUgd2VpcmRuZXNzIChzZXRJdGVtKCdmb28nLCB1bmRlZmluZWQpIHdpbGxcbiAgICAgICAgICAgICAgICAvLyByZXR1cm4gXCJudWxsXCIpLCBidXQgaXQncyBub3QgbXkgZmF1bHQgbG9jYWxTdG9yYWdlIGlzIG91clxuICAgICAgICAgICAgICAgIC8vIGJhc2VsaW5lIGFuZCB0aGF0IGl0J3Mgd2VpcmQuXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciByZXEgPSBzdG9yZS5wdXQodmFsdWUsIGtleSk7XG4gICAgICAgICAgICAgICAgcmVxLm9uc3VjY2VzcyA9IGZ1bmN0aW9uIHNldEl0ZW1PblN1Y2Nlc3MoKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXEub25lcnJvciA9IGZ1bmN0aW9uIHNldEl0ZW1PbkVycm9yKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBhc3luY1N0b3JhZ2Uuc2V0SXRlbSgpOiAnLCByZXEuZXJyb3IubmFtZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVJdGVtKGtleSwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgd2l0aFN0b3JlKCdyZWFkd3JpdGUnLCBmdW5jdGlvbiByZW1vdmVJdGVtQm9keShzdG9yZSkge1xuICAgICAgICAgICAgICAgIC8vIFdlIHVzZSBgWydkZWxldGUnXWAgaW5zdGVhZCBvZiBgLmRlbGV0ZWAgYmVjYXVzZSBJRSA4IHdpbGxcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBhIGZpdCBpZiBpdCBzZWVzIHRoZSByZXNlcnZlZCB3b3JkIFwiZGVsZXRlXCIgaW4gdGhpc1xuICAgICAgICAgICAgICAgIC8vIHNjZW5hcmlvLiBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2xvY2FsRm9yYWdlL3B1bGwvNjdcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgY2FuIGJlIHJlbW92ZWQgb25jZSB3ZSBubyBsb25nZXIgY2FyZSBhYm91dCBJRSA4LCBmb3JcbiAgICAgICAgICAgICAgICAvLyB3aGF0IHRoYXQncyB3b3J0aC5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBXcml0ZSBhIHRlc3QgYWdhaW5zdCB0aGlzPyBNYXliZSBJRSBpbiBnZW5lcmFsPyBBbHNvLFxuICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgbWluaWZ5IHN0ZXAgZG9lc24ndCBvcHRpbWlzZSB0aGlzIHRvIGAuZGVsZXRlYCxcbiAgICAgICAgICAgICAgICAvLyB0aG91Z2ggaXQgY3VycmVudGx5IGRvZXNuJ3QuXG4gICAgICAgICAgICAgICAgdmFyIHJlcSA9IHN0b3JlWydkZWxldGUnXShrZXkpO1xuICAgICAgICAgICAgICAgIHJlcS5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiByZW1vdmVJdGVtT25TdWNjZXNzKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXEub25lcnJvciA9IGZ1bmN0aW9uIHJlbW92ZUl0ZW1PbkVycm9yKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBhc3luY1N0b3JhZ2UucmVtb3ZlSXRlbSgpOiAnLCByZXEuZXJyb3IubmFtZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhcihjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICB3aXRoU3RvcmUoJ3JlYWR3cml0ZScsIGZ1bmN0aW9uIGNsZWFyQm9keShzdG9yZSkge1xuICAgICAgICAgICAgICAgIHZhciByZXEgPSBzdG9yZS5jbGVhcigpO1xuICAgICAgICAgICAgICAgIHJlcS5vbnN1Y2Nlc3MgPSBmdW5jdGlvbiBjbGVhck9uU3VjY2VzcygpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmVxLm9uZXJyb3IgPSBmdW5jdGlvbiBjbGVhck9uRXJyb3IoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIGFzeW5jU3RvcmFnZS5jbGVhcigpOiAnLCByZXEuZXJyb3IubmFtZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsZW5ndGgoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgd2l0aFN0b3JlKCdyZWFkb25seScsIGZ1bmN0aW9uIGxlbmd0aEJvZHkoc3RvcmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVxID0gc3RvcmUuY291bnQoKTtcbiAgICAgICAgICAgICAgICByZXEub25zdWNjZXNzID0gZnVuY3Rpb24gbGVuZ3RoT25TdWNjZXNzKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHJlcS5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXEucmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJlcS5vbmVycm9yID0gZnVuY3Rpb24gbGVuZ3RoT25FcnJvcigpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYXN5bmNTdG9yYWdlLmxlbmd0aCgpOiAnLCByZXEuZXJyb3IubmFtZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBrZXkobiwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgaWYgKG4gPCAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpdGhTdG9yZSgncmVhZG9ubHknLCBmdW5jdGlvbiBrZXlCb2R5KHN0b3JlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFkdmFuY2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdmFyIHJlcSA9IHN0b3JlLm9wZW5DdXJzb3IoKTtcbiAgICAgICAgICAgICAgICByZXEub25zdWNjZXNzID0gZnVuY3Rpb24ga2V5T25TdWNjZXNzKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3Vyc29yID0gcmVxLnJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXJzb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgbWVhbnMgdGhlcmUgd2VyZW4ndCBlbm91Z2gga2V5c1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAobiA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgaGF2ZSB0aGUgZmlyc3Qga2V5LCByZXR1cm4gaXQgaWYgdGhhdCdzIHdoYXQgdGhleSB3YW50ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGN1cnNvci5rZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGN1cnNvci5rZXkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFhZHZhbmNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgYXNrIHRoZSBjdXJzb3IgdG8gc2tpcCBhaGVhZCBuIHJlY29yZHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLmFkdmFuY2Uobik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gd2UgZ2V0IGhlcmUsIHdlJ3ZlIGdvdCB0aGUgbnRoIGtleS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soY3Vyc29yLmtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShjdXJzb3Iua2V5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICByZXEub25lcnJvciA9IGZ1bmN0aW9uIGtleU9uRXJyb3IoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIGFzeW5jU3RvcmFnZS5rZXkoKTogJywgcmVxLmVycm9yLm5hbWUpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgdmFyIGFzeW5jU3RvcmFnZSA9IHtcbiAgICAgICAgZHJpdmVyOiAnYXN5bmNTdG9yYWdlJyxcbiAgICAgICAgZ2V0SXRlbTogZ2V0SXRlbSxcbiAgICAgICAgc2V0SXRlbTogc2V0SXRlbSxcbiAgICAgICAgcmVtb3ZlSXRlbTogcmVtb3ZlSXRlbSxcbiAgICAgICAgY2xlYXI6IGNsZWFyLFxuICAgICAgICBsZW5ndGg6IGxlbmd0aCxcbiAgICAgICAga2V5OiBrZXlcbiAgICB9O1xuXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoJ2FzeW5jU3RvcmFnZScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGFzeW5jU3RvcmFnZTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGFzeW5jU3RvcmFnZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmFzeW5jU3RvcmFnZSA9IGFzeW5jU3RvcmFnZTtcbiAgICB9XG59KS5jYWxsKHRoaXMpO1xuIiwiLy8gSWYgSW5kZXhlZERCIGlzbid0IGF2YWlsYWJsZSwgd2UnbGwgZmFsbCBiYWNrIHRvIGxvY2FsU3RvcmFnZS5cbi8vIE5vdGUgdGhhdCB0aGlzIHdpbGwgaGF2ZSBjb25zaWRlcmFibGUgcGVyZm9ybWFuY2UgYW5kIHN0b3JhZ2Vcbi8vIHNpZGUtZWZmZWN0cyAoYWxsIGRhdGEgd2lsbCBiZSBzZXJpYWxpemVkIG9uIHNhdmUgYW5kIG9ubHkgZGF0YSB0aGF0XG4vLyBjYW4gYmUgY29udmVydGVkIHRvIGEgc3RyaW5nIHZpYSBgSlNPTi5zdHJpbmdpZnkoKWAgd2lsbCBiZSBzYXZlZCkuXG4oZnVuY3Rpb24oKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIFByb21pc2UgPSB3aW5kb3cuUHJvbWlzZTtcblxuICAgIC8vIElmIHRoZSBhcHAgaXMgcnVubmluZyBpbnNpZGUgYSBHb29nbGUgQ2hyb21lIHBhY2thZ2VkIHdlYmFwcCwgd2UgZG9uJ3RcbiAgICAvLyB1c2UgbG9jYWxTdG9yYWdlLlxuICAgIGlmICh3aW5kb3cuY2hyb21lICYmIHdpbmRvdy5jaHJvbWUucnVudGltZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBsb2NhbFN0b3JhZ2UgYW5kIGNyZWF0ZSBhIHZhcmlhYmxlIHRvIHVzZSB0aHJvdWdob3V0IHRoZSBjb2RlLlxuICAgIHZhciBsb2NhbFN0b3JhZ2UgPSB3aW5kb3cubG9jYWxTdG9yYWdlO1xuXG4gICAgLy8gUmVtb3ZlIGFsbCBrZXlzIGZyb20gdGhlIGRhdGFzdG9yZSwgZWZmZWN0aXZlbHkgZGVzdHJveWluZyBhbGwgZGF0YSBpblxuICAgIC8vIHRoZSBhcHAncyBrZXkvdmFsdWUgc3RvcmUhXG4gICAgZnVuY3Rpb24gY2xlYXIoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLmNsZWFyKCk7XG5cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmV0cmlldmUgYW4gaXRlbSBmcm9tIHRoZSBzdG9yZS4gVW5saWtlIHRoZSBvcmlnaW5hbCBhc3luY19zdG9yYWdlXG4gICAgLy8gbGlicmFyeSBpbiBHYWlhLCB3ZSBkb24ndCBtb2RpZnkgcmV0dXJuIHZhbHVlcyBhdCBhbGwuIElmIGEga2V5J3MgdmFsdWVcbiAgICAvLyBpcyBgdW5kZWZpbmVkYCwgd2UgcGFzcyB0aGF0IHZhbHVlIHRvIHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cbiAgICBmdW5jdGlvbiBnZXRJdGVtKGtleSwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KTtcblxuICAgICAgICAgICAgICAgIC8vIElmIGEgcmVzdWx0IHdhcyBmb3VuZCwgcGFyc2UgaXQgZnJvbSBzZXJpYWxpemVkIEpTT04gaW50byBhXG4gICAgICAgICAgICAgICAgLy8gSlMgb2JqZWN0LiBJZiByZXN1bHQgaXNuJ3QgdHJ1dGh5LCB0aGUga2V5IGlzIGxpa2VseVxuICAgICAgICAgICAgICAgIC8vIHVuZGVmaW5lZCBhbmQgd2UnbGwgcGFzcyBpdCBzdHJhaWdodCB0byB0aGUgY2FsbGJhY2suXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBKU09OLnBhcnNlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU2FtZSBhcyBsb2NhbFN0b3JhZ2UncyBrZXkoKSBtZXRob2QsIGV4Y2VwdCB0YWtlcyBhIGNhbGxiYWNrLlxuICAgIGZ1bmN0aW9uIGtleShuLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gbG9jYWxTdG9yYWdlLmtleShuKTtcblxuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2socmVzdWx0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdXBwbHkgdGhlIG51bWJlciBvZiBrZXlzIGluIHRoZSBkYXRhc3RvcmUgdG8gdGhlIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICAgIGZ1bmN0aW9uIGxlbmd0aChjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gbG9jYWxTdG9yYWdlLmxlbmd0aDtcblxuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2socmVzdWx0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgYW4gaXRlbSBmcm9tIHRoZSBzdG9yZSwgbmljZSBhbmQgc2ltcGxlLlxuICAgIGZ1bmN0aW9uIHJlbW92ZUl0ZW0oa2V5LCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNldCBhIGtleSdzIHZhbHVlIGFuZCBydW4gYW4gb3B0aW9uYWwgY2FsbGJhY2sgb25jZSB0aGUgdmFsdWUgaXMgc2V0LlxuICAgIC8vIFVubGlrZSBHYWlhJ3MgaW1wbGVtZW50YXRpb24sIHRoZSBjYWxsYmFjayBmdW5jdGlvbiBpcyBwYXNzZWQgdGhlIHZhbHVlLFxuICAgIC8vIGluIGNhc2UgeW91IHdhbnQgdG8gb3BlcmF0ZSBvbiB0aGF0IHZhbHVlIG9ubHkgYWZ0ZXIgeW91J3JlIHN1cmUgaXRcbiAgICAvLyBzYXZlZCwgb3Igc29tZXRoaW5nIGxpa2UgdGhhdC5cbiAgICBmdW5jdGlvbiBzZXRJdGVtKGtleSwgdmFsdWUsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIC8vIENvbnZlcnQgdW5kZWZpbmVkIHZhbHVlcyB0byBudWxsLlxuICAgICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvbG9jYWxGb3JhZ2UvcHVsbC80MlxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNhdmUgdGhlIG9yaWdpbmFsIHZhbHVlIHRvIHBhc3MgdG8gdGhlIGNhbGxiYWNrLlxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsVmFsdWUgPSB2YWx1ZTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgY29udmVydCB2YWx1ZSBpbnRvIGEgSlNPTiBzdHJpbmc6IFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUpO1xuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG9yaWdpbmFsVmFsdWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlKG9yaWdpbmFsVmFsdWUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB2YXIgbG9jYWxTdG9yYWdlV3JhcHBlciA9IHtcbiAgICAgICAgZHJpdmVyOiAnbG9jYWxTdG9yYWdlV3JhcHBlcicsXG4gICAgICAgIC8vIERlZmF1bHQgQVBJLCBmcm9tIEdhaWEvbG9jYWxTdG9yYWdlLlxuICAgICAgICBnZXRJdGVtOiBnZXRJdGVtLFxuICAgICAgICBzZXRJdGVtOiBzZXRJdGVtLFxuICAgICAgICByZW1vdmVJdGVtOiByZW1vdmVJdGVtLFxuICAgICAgICBjbGVhcjogY2xlYXIsXG4gICAgICAgIGxlbmd0aDogbGVuZ3RoLFxuICAgICAgICBrZXk6IGtleVxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZSgnbG9jYWxTdG9yYWdlV3JhcHBlcicsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZVdyYXBwZXI7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBsb2NhbFN0b3JhZ2VXcmFwcGVyO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9jYWxTdG9yYWdlV3JhcHBlciA9IGxvY2FsU3RvcmFnZVdyYXBwZXI7XG4gICAgfVxufSkuY2FsbCh0aGlzKTtcbiIsIihmdW5jdGlvbigpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgREJfTkFNRSA9ICdsb2NhbGZvcmFnZSc7XG4gICAgLy8gRGVmYXVsdCBEQiBzaXplIGlzIF9KVVNUIFVOREVSXyA1TUIsIGFzIGl0J3MgdGhlIGhpZ2hlc3Qgc2l6ZSB3ZSBjYW4gdXNlXG4gICAgLy8gd2l0aG91dCBhIHByb21wdC5cbiAgICAvL1xuICAgIC8vIFRPRE86IEFkZCBhIHdheSB0byBpbmNyZWFzZSB0aGlzIHNpemUgcHJvZ3JhbW1hdGljYWxseT9cbiAgICB2YXIgREJfU0laRSA9IDQ5ODA3MzY7XG4gICAgdmFyIERCX1ZFUlNJT04gPSAnMS4wJztcbiAgICB2YXIgU0VSSUFMSVpFRF9NQVJLRVIgPSAnX19sZnNjX186JztcbiAgICB2YXIgU0VSSUFMSVpFRF9NQVJLRVJfTEVOR1RIID0gU0VSSUFMSVpFRF9NQVJLRVIubGVuZ3RoO1xuICAgIHZhciBTVE9SRV9OQU1FID0gJ2tleXZhbHVlcGFpcnMnO1xuICAgIHZhciBQcm9taXNlID0gd2luZG93LlByb21pc2U7XG5cbiAgICAvLyBJZiBXZWJTUUwgbWV0aG9kcyBhcmVuJ3QgYXZhaWxhYmxlLCB3ZSBjYW4gc3RvcCBub3cuXG4gICAgaWYgKCF3aW5kb3cub3BlbkRhdGFiYXNlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBPcGVuIHRoZSBkYXRhYmFzZTsgdGhlIG9wZW5EYXRhYmFzZSBBUEkgd2lsbCBhdXRvbWF0aWNhbGx5IGNyZWF0ZSBpdCBmb3JcbiAgICAvLyB1cyBpZiBpdCBkb2Vzbid0IGV4aXN0LlxuICAgIHZhciBkYiA9IHdpbmRvdy5vcGVuRGF0YWJhc2UoREJfTkFNRSwgREJfVkVSU0lPTiwgU1RPUkVfTkFNRSwgREJfU0laRSk7XG5cbiAgICAvLyBDcmVhdGUgb3VyIGtleS92YWx1ZSB0YWJsZSBpZiBpdCBkb2Vzbid0IGV4aXN0LlxuICAgIC8vIFRPRE86IFRlY2huaWNhbGx5IEkgY2FuIGltYWdpbmUgdGhpcyBiZWluZyBhcyByYWNlIGNvbmRpdGlvbiwgYXMgSSdtIG5vdFxuICAgIC8vIHBvc2l0aXZlIG9uIHRoZSBXZWJTUUwgQVBJIGVub3VnaCB0byBiZSBzdXJlIHRoYXQgb3RoZXIgdHJhbnNhY3Rpb25zXG4gICAgLy8gd29uJ3QgYmUgcnVuIGJlZm9yZSB0aGlzPyBCdXQgSSBhc3N1bWUgbm90LlxuICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgIHQuZXhlY3V0ZVNxbCgnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbG9jYWxmb3JhZ2UgKGlkIElOVEVHRVIgUFJJTUFSWSBLRVksIGtleSB1bmlxdWUsIHZhbHVlKScpO1xuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gZ2V0SXRlbShrZXksIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgICAgICAgICAgdC5leGVjdXRlU3FsKCdTRUxFQ1QgKiBGUk9NIGxvY2FsZm9yYWdlIFdIRVJFIGtleSA9ID8gTElNSVQgMScsIFtrZXldLCBmdW5jdGlvbiAodCwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gcmVzdWx0cy5yb3dzLmxlbmd0aCA/IHJlc3VsdHMucm93cy5pdGVtKDApLnZhbHVlIDogbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayB0byBzZWUgaWYgdGhpcyBpcyBzZXJpYWxpemVkIGNvbnRlbnQgd2UgbmVlZCB0b1xuICAgICAgICAgICAgICAgICAgICAvLyB1bnBhY2suXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN1YnN0cigwLCBTRVJJQUxJWkVEX01BUktFUl9MRU5HVEgpID09PSBTRVJJQUxJWkVEX01BUktFUikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBKU09OLnBhcnNlKHJlc3VsdC5zbGljZShTRVJJQUxJWkVEX01BUktFUl9MRU5HVEgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgbnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0SXRlbShrZXksIHZhbHVlLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICAvLyBUaGUgbG9jYWxTdG9yYWdlIEFQSSBkb2Vzbid0IHJldHVybiB1bmRlZmluZWQgdmFsdWVzIGluIGFuXG4gICAgICAgICAgICAvLyBcImV4cGVjdGVkXCIgd2F5LCBzbyB1bmRlZmluZWQgaXMgYWx3YXlzIGNhc3QgdG8gbnVsbCBpbiBhbGxcbiAgICAgICAgICAgIC8vIGRyaXZlcnMuIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvbG9jYWxGb3JhZ2UvcHVsbC80MlxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gc2VyaWFsaXplIGNlcnRhaW4gdHlwZXMgb2Ygb2JqZWN0cyB1c2luZyBXZWJTUUw7XG4gICAgICAgICAgICAvLyBvdGhlcndpc2UgdGhleSdsbCBnZXQgc3RvcmVkIGFzIHN0cmluZ3MgYXMgYmUgdXNlbGVzcyB3aGVuIHdlXG4gICAgICAgICAgICAvLyB1c2UgZ2V0SXRlbSgpIGxhdGVyLlxuICAgICAgICAgICAgdmFyIHZhbHVlVG9TYXZlO1xuICAgICAgICAgICAgaWYgKHR5cGVvZih2YWx1ZSkgPT09ICdib29sZWFuJyB8fCB0eXBlb2YodmFsdWUpID09PSAnbnVtYmVyJyB8fCB0eXBlb2YodmFsdWUpID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIC8vIE1hcmsgdGhlIGNvbnRlbnQgYXMgXCJsb2NhbEZvcmFnZSBzZXJpYWxpemVkIGNvbnRlbnRcIiBzbyB3ZVxuICAgICAgICAgICAgICAgIC8vIGtub3cgdG8gcnVuIEpTT04ucGFyc2UoKSBvbiBpdCB3aGVuIHdlIGdldCBpdCBiYWNrIG91dCBmcm9tXG4gICAgICAgICAgICAgICAgLy8gdGhlIGRhdGFiYXNlLlxuICAgICAgICAgICAgICAgIHZhbHVlVG9TYXZlID0gU0VSSUFMSVpFRF9NQVJLRVIgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlVG9TYXZlID0gdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgICAgICAgICAgdC5leGVjdXRlU3FsKCdJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIGxvY2FsZm9yYWdlIChrZXksIHZhbHVlKSBWQUxVRVMgKD8sID8pJywgW2tleSwgdmFsdWVUb1NhdmVdLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9LCBudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVJdGVtKGtleSwgY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgICAgZGIudHJhbnNhY3Rpb24oZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgICAgICAgICB0LmV4ZWN1dGVTcWwoJ0RFTEVURSBGUk9NIGxvY2FsZm9yYWdlIFdIRVJFIGtleSA9ID8gTElNSVQgMScsIFtrZXldLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH0sIG51bGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIERlbGV0ZXMgZXZlcnkgaXRlbSBpbiB0aGUgdGFibGUgd2l0aCBhIFRSVU5DQVRFIGNhbGwuXG4gICAgLy8gVE9ETzogRmluZCBvdXQgaWYgdGhpcyByZXNldHMgdGhlIEFVVE9fSU5DUkVNRU5UIG51bWJlci5cbiAgICBmdW5jdGlvbiBjbGVhcihjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBkYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodCkge1xuICAgICAgICAgICAgICAgIHQuZXhlY3V0ZVNxbCgnREVMRVRFIEZST00gbG9jYWxmb3JhZ2UnLCBbXSwgZnVuY3Rpb24odCwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSwgbnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gRG9lcyBhIHNpbXBsZSBgQ09VTlQoa2V5KWAgdG8gZ2V0IHRoZSBudW1iZXIgb2YgaXRlbXMgc3RvcmVkIGluXG4gICAgLy8gbG9jYWxGb3JhZ2UuXG4gICAgZnVuY3Rpb24gbGVuZ3RoKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIGRiLnRyYW5zYWN0aW9uKGZ1bmN0aW9uICh0KSB7XG4gICAgICAgICAgICAgICAgLy8gQWhoaCwgU1FMIG1ha2VzIHRoaXMgb25lIHNvb29vb28gZWFzeS5cbiAgICAgICAgICAgICAgICB0LmV4ZWN1dGVTcWwoJ1NFTEVDVCBDT1VOVChrZXkpIGFzIGMgRlJPTSBsb2NhbGZvcmFnZScsIFtdLCBmdW5jdGlvbiAodCwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gcmVzdWx0cy5yb3dzLml0ZW0oMCkuYztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSwgbnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHRoZSBrZXkgbG9jYXRlZCBhdCBrZXkgaW5kZXggWDsgZXNzZW50aWFsbHkgZ2V0cyB0aGUga2V5IGZyb20gYVxuICAgIC8vIGBXSEVSRSBpZCA9ID9gLiBUaGlzIGlzIHRoZSBtb3N0IGVmZmljaWVudCB3YXkgSSBjYW4gdGhpbmsgdG8gaW1wbGVtZW50XG4gICAgLy8gdGhpcyByYXJlbHktdXNlZCAoaW4gbXkgZXhwZXJpZW5jZSkgcGFydCBvZiB0aGUgQVBJLCBidXQgaXQgY2FuIHNlZW1cbiAgICAvLyBpbmNvbnNpc3RlbnQsIGJlY2F1c2Ugd2UgZG8gYElOU0VSVCBPUiBSRVBMQUNFIElOVE9gIG9uIGBzZXRJdGVtKClgLCBzb1xuICAgIC8vIHRoZSBJRCBvZiBlYWNoIGtleSB3aWxsIGNoYW5nZSBldmVyeSB0aW1lIGl0J3MgdXBkYXRlZC4gUGVyaGFwcyBhIHN0b3JlZFxuICAgIC8vIHByb2NlZHVyZSBmb3IgdGhlIGBzZXRJdGVtKClgIFNRTCB3b3VsZCBzb2x2ZSB0aGlzIHByb2JsZW0/XG4gICAgLy8gVE9ETzogRG9uJ3QgY2hhbmdlIElEIG9uIGBzZXRJdGVtKClgLlxuICAgIGZ1bmN0aW9uIGtleShuLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICBkYi50cmFuc2FjdGlvbihmdW5jdGlvbiAodCkge1xuICAgICAgICAgICAgICAgIHQuZXhlY3V0ZVNxbCgnU0VMRUNUIGtleSBGUk9NIGxvY2FsZm9yYWdlIFdIRVJFIGlkID0gPyBMSU1JVCAxJywgW24gKyAxXSwgZnVuY3Rpb24gKHQsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHJlc3VsdHMucm93cy5sZW5ndGggPyByZXN1bHRzLnJvd3MuaXRlbSgwKS5rZXkgOiBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2socmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9LCBudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB2YXIgd2ViU1FMU3RvcmFnZSA9IHtcbiAgICAgICAgZHJpdmVyOiAnd2ViU1FMU3RvcmFnZScsXG4gICAgICAgIGdldEl0ZW06IGdldEl0ZW0sXG4gICAgICAgIHNldEl0ZW06IHNldEl0ZW0sXG4gICAgICAgIHJlbW92ZUl0ZW06IHJlbW92ZUl0ZW0sXG4gICAgICAgIGNsZWFyOiBjbGVhcixcbiAgICAgICAgbGVuZ3RoOiBsZW5ndGgsXG4gICAgICAgIGtleToga2V5XG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgZGVmaW5lKCd3ZWJTUUxTdG9yYWdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gd2ViU1FMU3RvcmFnZTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHdlYlNRTFN0b3JhZ2U7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy53ZWJTUUxTdG9yYWdlID0gd2ViU1FMU3RvcmFnZTtcbiAgICB9XG59KS5jYWxsKHRoaXMpO1xuIiwiKGZ1bmN0aW9uKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciBsb2NhbFN0b3JhZ2VXcmFwcGVyID0gcmVxdWlyZSgnLi9kcml2ZXJzL2xvY2Fsc3RvcmFnZScpO1xuICAgIHZhciBhc3luY1N0b3JhZ2UgPSByZXF1aXJlKCcuL2RyaXZlcnMvaW5kZXhlZGRiJyk7XG4gICAgdmFyIHdlYlNRTFN0b3JhZ2UgPSByZXF1aXJlKCcuL2RyaXZlcnMvd2Vic3FsJyk7XG5cbiAgICAvLyBQcm9taXNlcyFcbiAgICB2YXIgUHJvbWlzZSA9IHdpbmRvdy5Qcm9taXNlO1xuXG4gICAgLy8gQXZvaWQgdGhvc2UgbWFnaWMgY29uc3RhbnRzIVxuICAgIHZhciBNT0RVTEVfVFlQRV9ERUZJTkUgPSAxO1xuICAgIHZhciBNT0RVTEVfVFlQRV9FWFBPUlQgPSAyO1xuICAgIHZhciBNT0RVTEVfVFlQRV9XSU5ET1cgPSAzO1xuXG4gICAgLy8gQXR0YWNoaW5nIHRvIHdpbmRvdyAoaS5lLiBubyBtb2R1bGUgbG9hZGVyKSBpcyB0aGUgYXNzdW1lZCxcbiAgICAvLyBzaW1wbGUgZGVmYXVsdC5cbiAgICB2YXIgbW9kdWxlVHlwZSA9IE1PRFVMRV9UWVBFX1dJTkRPVztcblxuICAgIC8vIEZpbmQgb3V0IHdoYXQga2luZCBvZiBtb2R1bGUgc2V0dXAgd2UgaGF2ZTsgaWYgbm9uZSwgd2UnbGwganVzdCBhdHRhY2hcbiAgICAvLyBsb2NhbEZvcmFnZSB0byB0aGUgbWFpbiB3aW5kb3cuXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBtb2R1bGVUeXBlID0gTU9EVUxFX1RZUEVfREVGSU5FO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlVHlwZSA9IE1PRFVMRV9UWVBFX0VYUE9SVDtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIEluZGV4ZWREQjsgZmFsbCBiYWNrIHRvIHZlbmRvci1wcmVmaXhlZCB2ZXJzaW9ucyBpZiBuZWVkZWQuXG4gICAgdmFyIGluZGV4ZWREQiA9IGluZGV4ZWREQiB8fCB3aW5kb3cuaW5kZXhlZERCIHx8IHdpbmRvdy53ZWJraXRJbmRleGVkREIgfHxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93Lm1vekluZGV4ZWREQiB8fCB3aW5kb3cuT0luZGV4ZWREQiB8fFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubXNJbmRleGVkREI7XG5cbiAgICAvLyBUaGUgYWN0dWFsIGxvY2FsRm9yYWdlIG9iamVjdCB0aGF0IHdlIGV4cG9zZSBhcyBhIG1vZHVsZSBvciB2aWEgYSBnbG9iYWwuXG4gICAgLy8gSXQncyBleHRlbmRlZCBieSBwdWxsaW5nIGluIG9uZSBvZiBvdXIgb3RoZXIgbGlicmFyaWVzLlxuICAgIHZhciBfdGhpcyA9IHRoaXM7XG4gICAgdmFyIElOREVYRUREQiA9IFwiYXN5bmNTdG9yYWdlXCI7XG4gICAgdmFyIFdFQlNRTCA9IFwid2ViU1FMU3RvcmFnZVwiO1xuICAgIHZhciBMT0NBTFNUT1JBR0UgPSBcImxvY2FsU3RvcmFnZVdyYXBwZXJcIjtcblxuICAgIHZhciBsb2NhbEZvcmFnZSA9IHt9O1xuXG4gICAgbG9jYWxGb3JhZ2VbSU5ERVhFRERCXSA9IGFzeW5jU3RvcmFnZTtcbiAgICBsb2NhbEZvcmFnZVtMT0NBTFNUT1JBR0VdID0gIGxvY2FsU3RvcmFnZVdyYXBwZXI7XG4gICAgbG9jYWxGb3JhZ2VbV0VCU1FMXSA9IHdlYlNRTFN0b3JhZ2U7XG4gICAgbG9jYWxGb3JhZ2Uuc2V0RHJpdmVyID0gZnVuY3Rpb24oZHJpdmVyTmFtZSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoKCFpbmRleGVkREIgJiYgZHJpdmVyID09PSBPYmplY3Qua2V5cyhsb2NhbEZvcmFnZSlbMF0udG9TdHJpbmcoKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgKCF3aW5kb3cub3BlbkRhdGFiYXNlICYmIGRyaXZlck5hbWUgPT09IE9iamVjdC5rZXlzKGxvY2FsRm9yYWdlKVsyXS50b1N0cmluZygpKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGxvY2FsRm9yYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChsb2NhbEZvcmFnZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFdlIGFsbG93IGxvY2FsRm9yYWdlIHRvIGJlIGRlY2xhcmVkIGFzIGEgbW9kdWxlIG9yIGFzIGEgbGlicmFyeVxuICAgICAgICAgICAgICAgIC8vIGF2YWlsYWJsZSB3aXRob3V0IEFNRC9yZXF1aXJlLmpzLlxuICAgICAgICAgICAgICAgIGlmIChtb2R1bGVUeXBlID09PSBNT0RVTEVfVFlQRV9ERUZJTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZShbZHJpdmVyTmFtZV0sIGZ1bmN0aW9uKGxpYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxGb3JhZ2UuX2V4dGVuZChsaWIpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhsb2NhbEZvcmFnZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUobG9jYWxGb3JhZ2UpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG1vZHVsZVR5cGUgPT09IE1PRFVMRV9UWVBFX0VYUE9SVCkge1xuICAgICAgICAgICAgICAgICAgICBsb2NhbEZvcmFnZS5fZXh0ZW5kKGxvY2FsRm9yYWdlW2RyaXZlck5hbWVdKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGxvY2FsRm9yYWdlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUobG9jYWxGb3JhZ2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsRm9yYWdlLl9leHRlbmQoX3RoaXNbZHJpdmVyTmFtZV0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobG9jYWxGb3JhZ2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShsb2NhbEZvcmFnZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgIGxvY2FsRm9yYWdlLl9leHRlbmQgPSBmdW5jdGlvbihsaWJyYXJ5TWV0aG9kc0FuZFByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgaW4gbGlicmFyeU1ldGhvZHNBbmRQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpYnJhcnlNZXRob2RzQW5kUHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW2ldID0gbGlicmFyeU1ldGhvZHNBbmRQcm9wZXJ0aWVzW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgIHZhciBzdG9yYWdlTGlicmFyeTtcbiAgICAvLyBDaGVjayB0byBzZWUgaWYgSW5kZXhlZERCIGlzIGF2YWlsYWJsZTsgaXQncyBvdXIgcHJlZmVycmVkIGJhY2tlbmRcbiAgICAvLyBsaWJyYXJ5LlxuICAgIGlmIChpbmRleGVkREIpIHtcbiAgICAgICAgc3RvcmFnZUxpYnJhcnkgPSBsb2NhbEZvcmFnZS5JTkRFWEVEREI7XG4gICAgfSBlbHNlIGlmICh3aW5kb3cub3BlbkRhdGFiYXNlKSB7IC8vIFdlYlNRTCBpcyBhdmFpbGFibGUsIHNvIHdlJ2xsIHVzZSB0aGF0LlxuICAgICAgICBzdG9yYWdlTGlicmFyeSA9IGxvY2FsRm9yYWdlLldFQlNRTDtcbiAgICB9IGVsc2UgeyAvLyBJZiBub3RoaW5nIGVsc2UgaXMgYXZhaWxhYmxlLCB3ZSB1c2UgbG9jYWxTdG9yYWdlLlxuICAgICAgICBzdG9yYWdlTGlicmFyeSA9IGxvY2FsRm9yYWdlLkxPQ0FMU1RPUkFHRTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIChkZWZhdWx0KSBkcml2ZXIuXG4gICAgbG9jYWxGb3JhZ2Uuc2V0RHJpdmVyKHN0b3JhZ2VMaWJyYXJ5KTtcblxuICAgIC8vIFdlIGFsbG93IGxvY2FsRm9yYWdlIHRvIGJlIGRlY2xhcmVkIGFzIGEgbW9kdWxlIG9yIGFzIGEgbGlicmFyeVxuICAgIC8vIGF2YWlsYWJsZSB3aXRob3V0IEFNRC9yZXF1aXJlLmpzLlxuICAgIGlmIChtb2R1bGVUeXBlID09PSBNT0RVTEVfVFlQRV9ERUZJTkUpIHtcbiAgICAgICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGxvY2FsRm9yYWdlO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKG1vZHVsZVR5cGUgPT09IE1PRFVMRV9UWVBFX0VYUE9SVCkge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGxvY2FsRm9yYWdlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9jYWxmb3JhZ2UgPSBsb2NhbEZvcmFnZTtcbiAgICB9XG59KS5jYWxsKHRoaXMpO1xuIl19

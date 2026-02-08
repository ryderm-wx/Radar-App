var nexrad = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "node_modules/base64-js/index.js"(exports) {
      "use strict";
      init_shim_buffer();
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "node_modules/ieee754/index.js"(exports) {
      init_shim_buffer();
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "node_modules/buffer/index.js"(exports) {
      "use strict";
      init_shim_buffer();
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer(b) {
        return b != null && b._isBuffer === true && b !== Buffer3.prototype;
      };
      Buffer3.compare = function compare(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
        if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b) {
        if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer3.compare(this, b) === 0;
      };
      Buffer3.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul *= 256)) {
          val += this[offset + --i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // scripts/shim-buffer.js
  var import_buffer;
  var init_shim_buffer = __esm({
    "scripts/shim-buffer.js"() {
      import_buffer = __toESM(require_buffer());
      globalThis.Buffer = require_buffer().Buffer;
    }
  });

  // node_modules/seek-bzip/lib/bitreader.js
  var require_bitreader = __commonJS({
    "node_modules/seek-bzip/lib/bitreader.js"(exports, module) {
      init_shim_buffer();
      var BITMASK = [0, 1, 3, 7, 15, 31, 63, 127, 255];
      var BitReader = function(stream) {
        this.stream = stream;
        this.bitOffset = 0;
        this.curByte = 0;
        this.hasByte = false;
      };
      BitReader.prototype._ensureByte = function() {
        if (!this.hasByte) {
          this.curByte = this.stream.readByte();
          this.hasByte = true;
        }
      };
      BitReader.prototype.read = function(bits) {
        var result = 0;
        while (bits > 0) {
          this._ensureByte();
          var remaining = 8 - this.bitOffset;
          if (bits >= remaining) {
            result <<= remaining;
            result |= BITMASK[remaining] & this.curByte;
            this.hasByte = false;
            this.bitOffset = 0;
            bits -= remaining;
          } else {
            result <<= bits;
            var shift = remaining - bits;
            result |= (this.curByte & BITMASK[bits] << shift) >> shift;
            this.bitOffset += bits;
            bits = 0;
          }
        }
        return result;
      };
      BitReader.prototype.seek = function(pos) {
        var n_bit = pos % 8;
        var n_byte = (pos - n_bit) / 8;
        this.bitOffset = n_bit;
        this.stream.seek(n_byte);
        this.hasByte = false;
      };
      BitReader.prototype.pi = function() {
        var buf = new import_buffer.Buffer(6), i;
        for (i = 0; i < buf.length; i++) {
          buf[i] = this.read(8);
        }
        return buf.toString("hex");
      };
      module.exports = BitReader;
    }
  });

  // node_modules/seek-bzip/lib/stream.js
  var require_stream = __commonJS({
    "node_modules/seek-bzip/lib/stream.js"(exports, module) {
      init_shim_buffer();
      var Stream = function() {
      };
      Stream.prototype.readByte = function() {
        throw new Error("abstract method readByte() not implemented");
      };
      Stream.prototype.read = function(buffer, bufOffset, length) {
        var bytesRead = 0;
        while (bytesRead < length) {
          var c = this.readByte();
          if (c < 0) {
            return bytesRead === 0 ? -1 : bytesRead;
          }
          buffer[bufOffset++] = c;
          bytesRead++;
        }
        return bytesRead;
      };
      Stream.prototype.seek = function(new_pos) {
        throw new Error("abstract method seek() not implemented");
      };
      Stream.prototype.writeByte = function(_byte) {
        throw new Error("abstract method readByte() not implemented");
      };
      Stream.prototype.write = function(buffer, bufOffset, length) {
        var i;
        for (i = 0; i < length; i++) {
          this.writeByte(buffer[bufOffset++]);
        }
        return length;
      };
      Stream.prototype.flush = function() {
      };
      module.exports = Stream;
    }
  });

  // node_modules/seek-bzip/lib/crc32.js
  var require_crc32 = __commonJS({
    "node_modules/seek-bzip/lib/crc32.js"(exports, module) {
      init_shim_buffer();
      module.exports = (function() {
        var crc32Lookup = new Uint32Array([
          0,
          79764919,
          159529838,
          222504665,
          319059676,
          398814059,
          445009330,
          507990021,
          638119352,
          583659535,
          797628118,
          726387553,
          890018660,
          835552979,
          1015980042,
          944750013,
          1276238704,
          1221641927,
          1167319070,
          1095957929,
          1595256236,
          1540665371,
          1452775106,
          1381403509,
          1780037320,
          1859660671,
          1671105958,
          1733955601,
          2031960084,
          2111593891,
          1889500026,
          1952343757,
          2552477408,
          2632100695,
          2443283854,
          2506133561,
          2334638140,
          2414271883,
          2191915858,
          2254759653,
          3190512472,
          3135915759,
          3081330742,
          3009969537,
          2905550212,
          2850959411,
          2762807018,
          2691435357,
          3560074640,
          3505614887,
          3719321342,
          3648080713,
          3342211916,
          3287746299,
          3467911202,
          3396681109,
          4063920168,
          4143685023,
          4223187782,
          4286162673,
          3779000052,
          3858754371,
          3904687514,
          3967668269,
          881225847,
          809987520,
          1023691545,
          969234094,
          662832811,
          591600412,
          771767749,
          717299826,
          311336399,
          374308984,
          453813921,
          533576470,
          25881363,
          88864420,
          134795389,
          214552010,
          2023205639,
          2086057648,
          1897238633,
          1976864222,
          1804852699,
          1867694188,
          1645340341,
          1724971778,
          1587496639,
          1516133128,
          1461550545,
          1406951526,
          1302016099,
          1230646740,
          1142491917,
          1087903418,
          2896545431,
          2825181984,
          2770861561,
          2716262478,
          3215044683,
          3143675388,
          3055782693,
          3001194130,
          2326604591,
          2389456536,
          2200899649,
          2280525302,
          2578013683,
          2640855108,
          2418763421,
          2498394922,
          3769900519,
          3832873040,
          3912640137,
          3992402750,
          4088425275,
          4151408268,
          4197601365,
          4277358050,
          3334271071,
          3263032808,
          3476998961,
          3422541446,
          3585640067,
          3514407732,
          3694837229,
          3640369242,
          1762451694,
          1842216281,
          1619975040,
          1682949687,
          2047383090,
          2127137669,
          1938468188,
          2001449195,
          1325665622,
          1271206113,
          1183200824,
          1111960463,
          1543535498,
          1489069629,
          1434599652,
          1363369299,
          622672798,
          568075817,
          748617968,
          677256519,
          907627842,
          853037301,
          1067152940,
          995781531,
          51762726,
          131386257,
          177728840,
          240578815,
          269590778,
          349224269,
          429104020,
          491947555,
          4046411278,
          4126034873,
          4172115296,
          4234965207,
          3794477266,
          3874110821,
          3953728444,
          4016571915,
          3609705398,
          3555108353,
          3735388376,
          3664026991,
          3290680682,
          3236090077,
          3449943556,
          3378572211,
          3174993278,
          3120533705,
          3032266256,
          2961025959,
          2923101090,
          2868635157,
          2813903052,
          2742672763,
          2604032198,
          2683796849,
          2461293480,
          2524268063,
          2284983834,
          2364738477,
          2175806836,
          2238787779,
          1569362073,
          1498123566,
          1409854455,
          1355396672,
          1317987909,
          1246755826,
          1192025387,
          1137557660,
          2072149281,
          2135122070,
          1912620623,
          1992383480,
          1753615357,
          1816598090,
          1627664531,
          1707420964,
          295390185,
          358241886,
          404320391,
          483945776,
          43990325,
          106832002,
          186451547,
          266083308,
          932423249,
          861060070,
          1041341759,
          986742920,
          613929101,
          542559546,
          756411363,
          701822548,
          3316196985,
          3244833742,
          3425377559,
          3370778784,
          3601682597,
          3530312978,
          3744426955,
          3689838204,
          3819031489,
          3881883254,
          3928223919,
          4007849240,
          4037393693,
          4100235434,
          4180117107,
          4259748804,
          2310601993,
          2373574846,
          2151335527,
          2231098320,
          2596047829,
          2659030626,
          2470359227,
          2550115596,
          2947551409,
          2876312838,
          2788305887,
          2733848168,
          3165939309,
          3094707162,
          3040238851,
          2985771188
        ]);
        var CRC32 = function() {
          var crc = 4294967295;
          this.getCRC = function() {
            return ~crc >>> 0;
          };
          this.updateCRC = function(value) {
            crc = crc << 8 ^ crc32Lookup[(crc >>> 24 ^ value) & 255];
          };
          this.updateCRCRun = function(value, count) {
            while (count-- > 0) {
              crc = crc << 8 ^ crc32Lookup[(crc >>> 24 ^ value) & 255];
            }
          };
        };
        return CRC32;
      })();
    }
  });

  // node_modules/seek-bzip/package.json
  var require_package = __commonJS({
    "node_modules/seek-bzip/package.json"(exports, module) {
      module.exports = {
        name: "seek-bzip",
        version: "2.0.0",
        contributors: [
          "C. Scott Ananian (http://cscott.net)",
          "Eli Skeggs",
          "Kevin Kwok",
          "Rob Landley (http://landley.net)"
        ],
        description: "a pure-JavaScript Node.JS module for random-access decoding bzip2 data",
        main: "./lib/index.js",
        repository: {
          type: "git",
          url: "https://github.com/cscott/seek-bzip.git"
        },
        license: "MIT",
        bin: {
          "seek-bunzip": "./bin/seek-bunzip",
          "seek-table": "./bin/seek-bzip-table"
        },
        directories: {
          test: "test"
        },
        dependencies: {
          commander: "^6.0.0"
        },
        devDependencies: {
          fibers: "^5.0.0",
          mocha: "^8.1.0"
        },
        scripts: {
          test: "mocha"
        }
      };
    }
  });

  // node_modules/seek-bzip/lib/index.js
  var require_lib = __commonJS({
    "node_modules/seek-bzip/lib/index.js"(exports, module) {
      init_shim_buffer();
      var BitReader = require_bitreader();
      var Stream = require_stream();
      var CRC32 = require_crc32();
      var pjson = require_package();
      var MAX_HUFCODE_BITS = 20;
      var MAX_SYMBOLS = 258;
      var SYMBOL_RUNA = 0;
      var SYMBOL_RUNB = 1;
      var MIN_GROUPS = 2;
      var MAX_GROUPS = 6;
      var GROUP_SIZE = 50;
      var WHOLEPI = "314159265359";
      var SQRTPI = "177245385090";
      var mtf = function(array, index) {
        var src = array[index], i;
        for (i = index; i > 0; i--) {
          array[i] = array[i - 1];
        }
        array[0] = src;
        return src;
      };
      var Err = {
        OK: 0,
        LAST_BLOCK: -1,
        NOT_BZIP_DATA: -2,
        UNEXPECTED_INPUT_EOF: -3,
        UNEXPECTED_OUTPUT_EOF: -4,
        DATA_ERROR: -5,
        OUT_OF_MEMORY: -6,
        OBSOLETE_INPUT: -7,
        END_OF_BLOCK: -8
      };
      var ErrorMessages = {};
      ErrorMessages[Err.LAST_BLOCK] = "Bad file checksum";
      ErrorMessages[Err.NOT_BZIP_DATA] = "Not bzip data";
      ErrorMessages[Err.UNEXPECTED_INPUT_EOF] = "Unexpected input EOF";
      ErrorMessages[Err.UNEXPECTED_OUTPUT_EOF] = "Unexpected output EOF";
      ErrorMessages[Err.DATA_ERROR] = "Data error";
      ErrorMessages[Err.OUT_OF_MEMORY] = "Out of memory";
      ErrorMessages[Err.OBSOLETE_INPUT] = "Obsolete (pre 0.9.5) bzip format not supported.";
      var _throw = function(status, optDetail) {
        var msg = ErrorMessages[status] || "unknown error";
        if (optDetail) {
          msg += ": " + optDetail;
        }
        var e = new TypeError(msg);
        e.errorCode = status;
        throw e;
      };
      var Bunzip = function(inputStream, outputStream) {
        this.writePos = this.writeCurrent = this.writeCount = 0;
        this._start_bunzip(inputStream, outputStream);
      };
      Bunzip.prototype._init_block = function() {
        var moreBlocks = this._get_next_block();
        if (!moreBlocks) {
          this.writeCount = -1;
          return false;
        }
        this.blockCRC = new CRC32();
        return true;
      };
      Bunzip.prototype._start_bunzip = function(inputStream, outputStream) {
        var buf = new import_buffer.Buffer(4);
        if (inputStream.read(buf, 0, 4) !== 4 || String.fromCharCode(buf[0], buf[1], buf[2]) !== "BZh")
          _throw(Err.NOT_BZIP_DATA, "bad magic");
        var level = buf[3] - 48;
        if (level < 1 || level > 9)
          _throw(Err.NOT_BZIP_DATA, "level out of range");
        this.reader = new BitReader(inputStream);
        this.dbufSize = 1e5 * level;
        this.nextoutput = 0;
        this.outputStream = outputStream;
        this.streamCRC = 0;
      };
      Bunzip.prototype._get_next_block = function() {
        var i, j, k;
        var reader = this.reader;
        var h = reader.pi();
        if (h === SQRTPI) {
          return false;
        }
        if (h !== WHOLEPI)
          _throw(Err.NOT_BZIP_DATA);
        this.targetBlockCRC = reader.read(32) >>> 0;
        this.streamCRC = (this.targetBlockCRC ^ (this.streamCRC << 1 | this.streamCRC >>> 31)) >>> 0;
        if (reader.read(1))
          _throw(Err.OBSOLETE_INPUT);
        var origPointer = reader.read(24);
        if (origPointer > this.dbufSize)
          _throw(Err.DATA_ERROR, "initial position out of bounds");
        var t = reader.read(16);
        var symToByte = new import_buffer.Buffer(256), symTotal = 0;
        for (i = 0; i < 16; i++) {
          if (t & 1 << 15 - i) {
            var o = i * 16;
            k = reader.read(16);
            for (j = 0; j < 16; j++)
              if (k & 1 << 15 - j)
                symToByte[symTotal++] = o + j;
          }
        }
        var groupCount = reader.read(3);
        if (groupCount < MIN_GROUPS || groupCount > MAX_GROUPS)
          _throw(Err.DATA_ERROR);
        var nSelectors = reader.read(15);
        if (nSelectors === 0)
          _throw(Err.DATA_ERROR);
        var mtfSymbol = new import_buffer.Buffer(256);
        for (i = 0; i < groupCount; i++)
          mtfSymbol[i] = i;
        var selectors = new import_buffer.Buffer(nSelectors);
        for (i = 0; i < nSelectors; i++) {
          for (j = 0; reader.read(1); j++)
            if (j >= groupCount) _throw(Err.DATA_ERROR);
          selectors[i] = mtf(mtfSymbol, j);
        }
        var symCount = symTotal + 2;
        var groups = [], hufGroup;
        for (j = 0; j < groupCount; j++) {
          var length = new import_buffer.Buffer(symCount), temp = new Uint16Array(MAX_HUFCODE_BITS + 1);
          t = reader.read(5);
          for (i = 0; i < symCount; i++) {
            for (; ; ) {
              if (t < 1 || t > MAX_HUFCODE_BITS) _throw(Err.DATA_ERROR);
              if (!reader.read(1))
                break;
              if (!reader.read(1))
                t++;
              else
                t--;
            }
            length[i] = t;
          }
          var minLen, maxLen;
          minLen = maxLen = length[0];
          for (i = 1; i < symCount; i++) {
            if (length[i] > maxLen)
              maxLen = length[i];
            else if (length[i] < minLen)
              minLen = length[i];
          }
          hufGroup = {};
          groups.push(hufGroup);
          hufGroup.permute = new Uint16Array(MAX_SYMBOLS);
          hufGroup.limit = new Uint32Array(MAX_HUFCODE_BITS + 2);
          hufGroup.base = new Uint32Array(MAX_HUFCODE_BITS + 1);
          hufGroup.minLen = minLen;
          hufGroup.maxLen = maxLen;
          var pp = 0;
          for (i = minLen; i <= maxLen; i++) {
            temp[i] = hufGroup.limit[i] = 0;
            for (t = 0; t < symCount; t++)
              if (length[t] === i)
                hufGroup.permute[pp++] = t;
          }
          for (i = 0; i < symCount; i++)
            temp[length[i]]++;
          pp = t = 0;
          for (i = minLen; i < maxLen; i++) {
            pp += temp[i];
            hufGroup.limit[i] = pp - 1;
            pp <<= 1;
            t += temp[i];
            hufGroup.base[i + 1] = pp - t;
          }
          hufGroup.limit[maxLen + 1] = Number.MAX_VALUE;
          hufGroup.limit[maxLen] = pp + temp[maxLen] - 1;
          hufGroup.base[minLen] = 0;
        }
        var byteCount = new Uint32Array(256);
        for (i = 0; i < 256; i++)
          mtfSymbol[i] = i;
        var runPos = 0, dbufCount = 0, selector = 0, uc;
        var dbuf = this.dbuf = new Uint32Array(this.dbufSize);
        symCount = 0;
        for (; ; ) {
          if (!symCount--) {
            symCount = GROUP_SIZE - 1;
            if (selector >= nSelectors) {
              _throw(Err.DATA_ERROR);
            }
            hufGroup = groups[selectors[selector++]];
          }
          i = hufGroup.minLen;
          j = reader.read(i);
          for (; ; i++) {
            if (i > hufGroup.maxLen) {
              _throw(Err.DATA_ERROR);
            }
            if (j <= hufGroup.limit[i])
              break;
            j = j << 1 | reader.read(1);
          }
          j -= hufGroup.base[i];
          if (j < 0 || j >= MAX_SYMBOLS) {
            _throw(Err.DATA_ERROR);
          }
          var nextSym = hufGroup.permute[j];
          if (nextSym === SYMBOL_RUNA || nextSym === SYMBOL_RUNB) {
            if (!runPos) {
              runPos = 1;
              t = 0;
            }
            if (nextSym === SYMBOL_RUNA)
              t += runPos;
            else
              t += 2 * runPos;
            runPos <<= 1;
            continue;
          }
          if (runPos) {
            runPos = 0;
            if (dbufCount + t > this.dbufSize) {
              _throw(Err.DATA_ERROR);
            }
            uc = symToByte[mtfSymbol[0]];
            byteCount[uc] += t;
            while (t--)
              dbuf[dbufCount++] = uc;
          }
          if (nextSym > symTotal)
            break;
          if (dbufCount >= this.dbufSize) {
            _throw(Err.DATA_ERROR);
          }
          i = nextSym - 1;
          uc = mtf(mtfSymbol, i);
          uc = symToByte[uc];
          byteCount[uc]++;
          dbuf[dbufCount++] = uc;
        }
        if (origPointer < 0 || origPointer >= dbufCount) {
          _throw(Err.DATA_ERROR);
        }
        j = 0;
        for (i = 0; i < 256; i++) {
          k = j + byteCount[i];
          byteCount[i] = j;
          j = k;
        }
        for (i = 0; i < dbufCount; i++) {
          uc = dbuf[i] & 255;
          dbuf[byteCount[uc]] |= i << 8;
          byteCount[uc]++;
        }
        var pos = 0, current = 0, run = 0;
        if (dbufCount) {
          pos = dbuf[origPointer];
          current = pos & 255;
          pos >>= 8;
          run = -1;
        }
        this.writePos = pos;
        this.writeCurrent = current;
        this.writeCount = dbufCount;
        this.writeRun = run;
        return true;
      };
      Bunzip.prototype._read_bunzip = function(outputBuffer, len) {
        var copies, previous, outbyte;
        if (this.writeCount < 0) {
          return 0;
        }
        var gotcount = 0;
        var dbuf = this.dbuf, pos = this.writePos, current = this.writeCurrent;
        var dbufCount = this.writeCount, outputsize = this.outputsize;
        var run = this.writeRun;
        while (dbufCount) {
          dbufCount--;
          previous = current;
          pos = dbuf[pos];
          current = pos & 255;
          pos >>= 8;
          if (run++ === 3) {
            copies = current;
            outbyte = previous;
            current = -1;
          } else {
            copies = 1;
            outbyte = current;
          }
          this.blockCRC.updateCRCRun(outbyte, copies);
          while (copies--) {
            this.outputStream.writeByte(outbyte);
            this.nextoutput++;
          }
          if (current != previous)
            run = 0;
        }
        this.writeCount = dbufCount;
        if (this.blockCRC.getCRC() !== this.targetBlockCRC) {
          _throw(Err.DATA_ERROR, "Bad block CRC (got " + this.blockCRC.getCRC().toString(16) + " expected " + this.targetBlockCRC.toString(16) + ")");
        }
        return this.nextoutput;
      };
      var coerceInputStream = function(input) {
        if ("readByte" in input) {
          return input;
        }
        var inputStream = new Stream();
        inputStream.pos = 0;
        inputStream.readByte = function() {
          return input[this.pos++];
        };
        inputStream.seek = function(pos) {
          this.pos = pos;
        };
        inputStream.eof = function() {
          return this.pos >= input.length;
        };
        return inputStream;
      };
      var coerceOutputStream = function(output) {
        var outputStream = new Stream();
        var resizeOk = true;
        if (output) {
          if (typeof output === "number") {
            outputStream.buffer = new import_buffer.Buffer(output);
            resizeOk = false;
          } else if ("writeByte" in output) {
            return output;
          } else {
            outputStream.buffer = output;
            resizeOk = false;
          }
        } else {
          outputStream.buffer = new import_buffer.Buffer(16384);
        }
        outputStream.pos = 0;
        outputStream.writeByte = function(_byte) {
          if (resizeOk && this.pos >= this.buffer.length) {
            var newBuffer = new import_buffer.Buffer(this.buffer.length * 2);
            this.buffer.copy(newBuffer);
            this.buffer = newBuffer;
          }
          this.buffer[this.pos++] = _byte;
        };
        outputStream.getBuffer = function() {
          if (this.pos !== this.buffer.length) {
            if (!resizeOk)
              throw new TypeError("outputsize does not match decoded input");
            var newBuffer = new import_buffer.Buffer(this.pos);
            this.buffer.copy(newBuffer, 0, 0, this.pos);
            this.buffer = newBuffer;
          }
          return this.buffer;
        };
        outputStream._coerced = true;
        return outputStream;
      };
      Bunzip.Err = Err;
      Bunzip.decode = function(input, output, multistream) {
        var inputStream = coerceInputStream(input);
        var outputStream = coerceOutputStream(output);
        var bz = new Bunzip(inputStream, outputStream);
        while (true) {
          if ("eof" in inputStream && inputStream.eof()) break;
          if (bz._init_block()) {
            bz._read_bunzip();
          } else {
            var targetStreamCRC = bz.reader.read(32) >>> 0;
            if (targetStreamCRC !== bz.streamCRC) {
              _throw(Err.DATA_ERROR, "Bad stream CRC (got " + bz.streamCRC.toString(16) + " expected " + targetStreamCRC.toString(16) + ")");
            }
            if (multistream && "eof" in inputStream && !inputStream.eof()) {
              bz._start_bunzip(inputStream, outputStream);
            } else break;
          }
        }
        if ("getBuffer" in outputStream)
          return outputStream.getBuffer();
      };
      Bunzip.decodeBlock = function(input, pos, output) {
        var inputStream = coerceInputStream(input);
        var outputStream = coerceOutputStream(output);
        var bz = new Bunzip(inputStream, outputStream);
        bz.reader.seek(pos);
        var moreBlocks = bz._get_next_block();
        if (moreBlocks) {
          bz.blockCRC = new CRC32();
          bz.writeCopies = 0;
          bz._read_bunzip();
        }
        if ("getBuffer" in outputStream)
          return outputStream.getBuffer();
      };
      Bunzip.table = function(input, callback, multistream) {
        var inputStream = new Stream();
        inputStream.delegate = coerceInputStream(input);
        inputStream.pos = 0;
        inputStream.readByte = function() {
          this.pos++;
          return this.delegate.readByte();
        };
        if (inputStream.delegate.eof) {
          inputStream.eof = inputStream.delegate.eof.bind(inputStream.delegate);
        }
        var outputStream = new Stream();
        outputStream.pos = 0;
        outputStream.writeByte = function() {
          this.pos++;
        };
        var bz = new Bunzip(inputStream, outputStream);
        var blockSize = bz.dbufSize;
        while (true) {
          if ("eof" in inputStream && inputStream.eof()) break;
          var position = inputStream.pos * 8 + bz.reader.bitOffset;
          if (bz.reader.hasByte) {
            position -= 8;
          }
          if (bz._init_block()) {
            var start = outputStream.pos;
            bz._read_bunzip();
            callback(position, outputStream.pos - start);
          } else {
            var crc = bz.reader.read(32);
            if (multistream && "eof" in inputStream && !inputStream.eof()) {
              bz._start_bunzip(inputStream, outputStream);
              console.assert(
                bz.dbufSize === blockSize,
                "shouldn't change block size within multistream file"
              );
            } else break;
          }
        }
      };
      Bunzip.Stream = Stream;
      Bunzip.version = pjson.version;
      Bunzip.license = pjson.license;
      module.exports = Bunzip;
    }
  });

  // node_modules/nexrad-level-3-data/src/randomaccessfile/index.js
  var require_randomaccessfile = __commonJS({
    "node_modules/nexrad-level-3-data/src/randomaccessfile/index.js"(exports, module) {
      init_shim_buffer();
      var BIG_ENDIAN = 0;
      var LITTLE_ENDIAN = 1;
      var RandomAccessFile = class {
        constructor(file, endian = BIG_ENDIAN, stringFormat = "utf-8") {
          this.offset = 0;
          this.buffer = null;
          this.stringFormat = stringFormat;
          if (endian < 0) return;
          this.bigEndian = endian === BIG_ENDIAN;
          if (typeof file === "string") {
            this.buffer = import_buffer.Buffer.from(file, "binary");
          } else {
            this.buffer = file;
          }
          if (this.bigEndian) {
            this.readFloatLocal = this.buffer.readFloatBE.bind(this.buffer);
            this.readIntLocal = this.buffer.readIntBE.bind(this.buffer);
            this.readUIntLocal = this.buffer.readUIntBE.bind(this.buffer);
          } else {
            this.readFloatLocal = this.buffer.readFloatLE.bind(this.buffer);
            this.readIntLocal = this.buffer.readIntLE.bind(this.buffer);
            this.readUIntLocal = this.buffer.readUIntLE.bind(this.buffer);
          }
        }
        // return the current buffer length
        getLength() {
          return this.buffer.length;
        }
        // return the current position in the file
        getPos() {
          return this.offset;
        }
        // seek to a provided buffer offset
        seek(byte) {
          this.offset = byte;
        }
        // read a string from the buffer
        readString(bytes) {
          const data = this.buffer.toString(this.stringFormat, this.offset, this.offset += bytes);
          return data;
        }
        // read a float from the buffer
        readFloat() {
          const float = this.readFloatLocal(this.offset);
          this.offset += 4;
          return float;
        }
        // read a number from the buffer
        readInt() {
          const int = this.readIntLocal(this.offset, 4);
          this.offset += 4;
          return int;
        }
        // read an unsigned number from the buffer
        readUInt() {
          const int = this.readUIntLocal(this.offset, 4);
          this.offset += 4;
          return int;
        }
        // read a short from the buffer
        readShort() {
          const short = this.readIntLocal(this.offset, 2);
          this.offset += 2;
          return short;
        }
        // read an unsigned short from the buffer
        readUShort() {
          const short = this.readUIntLocal(this.offset, 2);
          this.offset += 2;
          return short;
        }
        // read a byte from the buffer
        readByte() {
          return this.read()[0];
        }
        // read a set number of bytes from the buffer and return as an array
        read(bytes = 1) {
          const data = this.buffer.slice(this.offset, this.offset + bytes);
          this.offset += bytes;
          return data;
        }
        // skip a set number of bites and update the offset
        skip(bytes) {
          this.offset += bytes;
        }
      };
      module.exports.RandomAccessFile = RandomAccessFile;
      module.exports.BIG_ENDIAN = BIG_ENDIAN;
      module.exports.LITTLE_ENDIAN = LITTLE_ENDIAN;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/text.js
  var require_text = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/text.js"(exports, module) {
      init_shim_buffer();
      var parse = (raf) => {
        const text = {};
        text.fileType = raf.readString(6);
        raf.readString(1);
        text.id = raf.readString(4);
        raf.readString(1);
        text.ddhhmm = raf.readString(6);
        raf.readString(3);
        text.type = raf.readString(3);
        text.id3 = raf.readString(3);
        raf.readString(3);
        return text;
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/message.js
  var require_message = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/message.js"(exports, module) {
      init_shim_buffer();
      var parse = (raf) => ({
        code: raf.readShort(),
        julianDate: raf.readShort(),
        seconds: raf.readInt(),
        length: raf.readInt(),
        source: raf.readShort(),
        dest: raf.readShort(),
        blocks: raf.readShort()
      });
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/productdescription.js
  var require_productdescription = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/productdescription.js"(exports, module) {
      init_shim_buffer();
      var MODE_MAINTENANCE = 0;
      var MODE_CLEAN_AIR = 1;
      var MODE_PRECIPITATION = 2;
      var parse = (raf, product) => {
        const divider = raf.readShort();
        if (divider !== -1) throw new Error(`Invalid product description divider: ${divider}`);
        const result = {
          abbreviation: product.abbreviation,
          description: product.description,
          latitude: raf.readInt() / 1e3,
          longitude: raf.readInt() / 1e3,
          height: raf.readShort(),
          code: raf.readShort(),
          mode: raf.readShort(),
          vcp: raf.readShort(),
          sequenceNumber: raf.readShort(),
          volumeScanNumber: raf.readShort(),
          volumeScanDate: raf.readShort(),
          volumeScanTime: raf.readInt(),
          productDate: raf.readShort(),
          productTime: raf.readInt(),
          // halfwords 27-28 are product dependent
          ...product?.productDescription?.halfwords27_28?.(raf.read(4)) ?? { dependent27_28: raf.read(4) },
          elevationNumber: raf.readShort(),
          // halfwords 30-53 are product dependent
          ...product?.productDescription?.halfwords30_53?.(raf.read(48)) ?? { dependent30_53: raf.read(48) },
          version: raf.readByte(),
          spotBlank: raf.readByte(),
          offsetSymbology: raf.readInt(),
          offsetGraphic: raf.readInt(),
          offsetTabular: raf.readInt(),
          supplemental: product.supplemental
        };
        return result;
      };
      module.exports = {
        parse,
        MODE_MAINTENANCE,
        MODE_CLEAN_AIR,
        MODE_PRECIPITATION
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/symbologytext.js
  var require_symbologytext = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/symbologytext.js"(exports, module) {
      init_shim_buffer();
      var parse = (raf) => {
        const pages = [];
        let lines = [];
        let length = raf.readShort();
        do {
          while (length !== -1) {
            lines.push(raf.readString(length));
            length = raf.readShort();
          }
          pages.push(lines);
          lines = [];
          if (raf.getPos() < raf.getLength()) {
            length = raf.readShort();
          } else {
            length = -1;
          }
        } while (length === 80);
        raf.skip(-4);
        return { pages };
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/symbology.js
  var require_symbology = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/symbology.js"(exports, module) {
      init_shim_buffer();
      var symbologyText = require_symbologytext();
      var textSymbologies = [3, 4, 5, 6, 7];
      var parse = (raf) => {
        const blockDivider = raf.readShort();
        const blockId = raf.readShort();
        if (textSymbologies.includes(blockId)) return symbologyText(raf);
        const blockLength = raf.readInt();
        if (blockDivider !== -1) throw new Error(`Invalid symbology block divider: ${blockDivider}`);
        if (blockId !== 1) throw new Error(`Invalid symbology id: ${blockId}`);
        if (blockLength + raf.getPos() - 8 > raf.getLength()) throw new Error(`Block length ${blockLength} overruns file length for block id: ${blockId}`);
        const result = {
          numberLayers: raf.readShort()
        };
        return result;
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/tabular.js
  var require_tabular = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/tabular.js"(exports, module) {
      init_shim_buffer();
      var parseMessageHeader = require_message();
      var { parse: parseProductDescription } = require_productdescription();
      var parse = (raf, product) => {
        const blockDivider = raf.readShort();
        const blockId = raf.readShort();
        const blockLength = raf.readInt();
        if (blockDivider !== -1) throw new Error(`Invalid tabular block divider: ${blockDivider}`);
        if (blockId !== 3) throw new Error(`Invalid tabular id: ${blockId}`);
        if (blockLength < 1 || blockLength > 65535) throw new Error(`Invalid block length ${blockLength}`);
        if (blockLength + raf.getPos() - 8 > raf.getLength()) throw new Error(`Block length ${blockLength} overruns file length for block id: ${blockId}`);
        const messageHeader = parseMessageHeader(raf);
        const productDescription = parseProductDescription(raf, product);
        const blockDivider2 = raf.readShort();
        if (blockDivider2 !== -1) throw new Error(`Invalid second tabular block divider: ${blockDivider2}`);
        const result = {
          messageHeader,
          productDescription,
          totalPages: raf.readShort(),
          charactersPerLine: raf.readShort(),
          pages: []
        };
        for (let i = 0; i < result.totalPages; i += 1) {
          const lines = [];
          let line = "";
          let chars = raf.readShort();
          while (chars !== -1) {
            if (chars !== 80) {
              line += String.fromCharCode(chars >> 8);
              if (line.length % result.charactersPerLine === 0) {
                lines.push(line);
                line = "";
              }
              line += String.fromCharCode(chars & 255);
              if (line.length % result.charactersPerLine === 0) {
                lines.push(line);
                line = "";
              }
            }
            chars = raf.readShort();
          }
          result.pages.push(lines);
        }
        return result;
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/1.js
  var require__ = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/1.js"(exports, module) {
      init_shim_buffer();
      var code = 1;
      var description = "Text and Special Symbol Packets";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          iStartingPoint: raf.readShort(),
          jStartingPoint: raf.readShort()
        };
        result.packetCodeHex = packetCode.toString(16);
        result.text = raf.readString(lengthOfBlock - 4);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/2.js
  var require__2 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/2.js"(exports, module) {
      init_shim_buffer();
      var code = 2;
      var description = "Text and Special Symbol Packets";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          iStartingPoint: raf.readShort(),
          jStartingPoint: raf.readShort(),
          text: raf.readString(lengthOfBlock - 4)
        };
        result.packetCodeHex = packetCode.toString(16);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/6.js
  var require__3 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/6.js"(exports, module) {
      init_shim_buffer();
      var code = 6;
      var description = "Linked Vector Packet";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          iStartingPoint: raf.readShort(),
          jStartingPoint: raf.readShort(),
          vectors: []
        };
        result.packetCodeHex = packetCode.toString(16);
        const endByte = raf.getPos() + lengthOfBlock - 4;
        while (raf.getPos() < endByte) {
          result.vectors.push({
            i: raf.readShort(),
            j: raf.readShort()
          });
        }
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/8.js
  var require__4 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/8.js"(exports, module) {
      init_shim_buffer();
      var code = 8;
      var description = "Text and Special Symbol Packets";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        const result = {
          color: raf.readShort(),
          iStartingPoint: raf.readShort(),
          jStartingPoint: raf.readShort()
        };
        result.packetCodeHex = packetCode.toString(16);
        result.text = raf.readString(lengthOfBlock - 6);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/10.js
  var require__5 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/10.js"(exports, module) {
      init_shim_buffer();
      var code = 16;
      var description = "Digital Radial Data Array Packet";
      var parser = (raf, productDescription) => {
        const packetCode = raf.readUShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          firstBin: raf.readShort(),
          numberBins: raf.readShort(),
          iSweepCenter: raf.readShort(),
          jSweepCenter: raf.readShort(),
          rangeScale: raf.readShort() / 1e3,
          numberRadials: raf.readShort()
        };
        result.packetCodeHex = packetCode.toString(16);
        const scaling = {
          scale: productDescription?.plot?.scale ?? 1,
          offset: productDescription?.plot?.offset ?? 0
        };
        const scaled = [];
        let start = 0;
        if (productDescription?.plot?.leadingFlags?.noData === 0) {
          start = 1;
          scaled[0] = null;
        }
        if (productDescription?.plot?.maxDataValue !== void 0) {
          for (let i = start; i <= productDescription.plot.maxDataValue; i += 1) {
            scaled.push((i - scaling.offset) / scaling.scale);
          }
        } else if (productDescription?.plot?.dataLevels !== void 0) {
          scaled[0] = null;
          scaled[1] = null;
          for (let i = 2; i <= productDescription.plot.dataLevels; i += 1) {
            scaled[i] = productDescription.plot.minimumDataValue + i * productDescription.plot.dataIncrement;
          }
        }
        const radials = [];
        const radialsRaw = [];
        for (let r = 0; r < result.numberRadials; r += 1) {
          const bytesInRadial = raf.readShort();
          const radial = {
            startAngle: raf.readShort() / 10,
            angleDelta: raf.readShort() / 10,
            bins: []
          };
          const radialRaw = { ...radial, bins: [] };
          for (let i = 0; i < result.numberBins; i += 1) {
            const value = raf.readByte();
            radial.bins.push(scaled[value]);
            radialRaw.bins.push(value);
          }
          radials.push(radial);
          radialsRaw.push(radialRaw);
          if (bytesInRadial !== result.numberBins) raf.skip(bytesInRadial - result.numberBins);
        }
        result.radials = radials;
        result.radialsRaw = radialsRaw;
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/13.js
  var require__6 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/13.js"(exports, module) {
      init_shim_buffer();
      var code = 19;
      var description = "Special Graphic Symbol Packet";
      var featureKey = {
        1: "mesocyclone (extrapolated)",
        3: "mesocyclone (persistent, new or increasing)",
        5: "TVS (extrapolated)",
        6: "ETVS (extrapolated)",
        7: "TVS (persistent, new or increasing)",
        8: "ETVS (persistent, new or increasing)",
        9: "MDA Circulation with Strength Rank >= 5 AND with a Base Height <= 1 km ARL or with its base on the lowest elevation angle",
        10: "MDA Circulation with Strength Rank >= 5 AND with a Base Height > 1 km ARL AND that Base is not on the lowest elevation angle",
        11: " MDA Circulation with Strength Rank< 5"
      };
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          points: []
        };
        result.packetCodeHex = packetCode.toString(16);
        let i = 0;
        for (i = 0; i < lengthOfBlock && i + 8 < lengthOfBlock; i += 8) {
          const iStartingPoint = raf.readShort();
          const jStartingPoint = raf.readShort();
          const pointFeatureType = raf.readShort();
          const pointFeatureAttribute = raf.readShort();
          result.points.push({
            iStartingPoint,
            jStartingPoint,
            pointFeatureType,
            pointFeatureAttribute
          });
        }
        raf.skip(result.lengthOfBlock - i);
        return result;
      };
      module.exports = {
        code,
        description,
        parser,
        supplemental: { featureKey }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/14.js
  var require__7 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/14.js"(exports, module) {
      init_shim_buffer();
      var code = 20;
      var description = "Special Graphic Symbol Packet";
      var featureKey = {
        1: "mesocyclone (extrapolated)",
        3: "mesocyclone (persistent, new or increasing)",
        5: "TVS (extrapolated)",
        6: "ETVS (extrapolated)",
        7: "TVS (persistent, new or increasing)",
        8: "ETVS (persistent, new or increasing)",
        9: "MDA Circulation with Strength Rank >= 5 AND with a Base Height <= 1 km ARL or with its base on the lowest elevation angle",
        10: "MDA Circulation with Strength Rank >= 5 AND with a Base Height > 1 km ARL AND that Base is not on the lowest elevation angle",
        11: " MDA Circulation with Strength Rank< 5"
      };
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          points: []
        };
        result.packetCodeHex = packetCode.toString(16);
        let i = 0;
        for (i = 0; i < lengthOfBlock && i + 8 <= lengthOfBlock; i += 8) {
          const iStartingPoint = raf.readShort();
          const jStartingPoint = raf.readShort();
          const pointFeatureType = raf.readShort();
          const pointFeatureAttribute = raf.readShort() / 4;
          result.points.push({
            iStartingPoint,
            jStartingPoint,
            pointFeatureType,
            pointFeatureAttribute
          });
        }
        raf.skip(result.lengthOfBlock - i);
        return result;
      };
      module.exports = {
        code,
        description,
        parser,
        supplemental: { featureKey }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/utilities/ij.js
  var require_ij = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/utilities/ij.js"(exports, module) {
      init_shim_buffer();
      var ijToAzDeg = (i, j, rawScale = 8, conversion = 0.539957) => {
        const nm = Math.sqrt(i ** 2 + j ** 2) / rawScale * conversion;
        let deg = 0;
        if (i === 0) {
          deg = Math.atan(-j / i) * 180 / Math.PI + 90;
          if (deg < 0) deg += 180;
        }
        return {
          deg,
          nm
        };
      };
      module.exports = {
        ijToAzDeg
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/15.js
  var require__8 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/15.js"(exports, module) {
      init_shim_buffer();
      var code = 21;
      var description = "Special Graphic Symbol Packet";
      var { ijToAzDeg } = require_ij();
      var trendCodeScale = [
        null,
        // index zero is unused
        100,
        // feet
        100,
        // feet
        100,
        // feet
        1,
        // %
        1,
        // %
        1,
        // kg/m^2
        1,
        // dBz
        100
        // feet
      ];
      var trendCodes = {
        1: "Cell top, feet",
        2: "Cell base, feet",
        3: "Max ref height, feet",
        4: "Probability of Hail, %",
        5: "Probability of Severe Hail, %",
        6: "Cell based VIL, kg/m^2",
        7: "Max ref, dBz",
        8: "Centroid height, feet"
      };
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const packetLength = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const startPos = raf.getPos();
        const endPos = startPos + packetLength;
        const cellId = raf.readString(2);
        const result = {
          iPosition: raf.readShort(),
          jPosition: raf.readShort(),
          trends: []
        };
        const converted = ijToAzDeg(result.iPosition, result.jPosition);
        result.nm = converted.nm;
        result.deg = converted.deg;
        while (raf.getPos() < endPos) {
          const trendCode = raf.readShort();
          const numberVolumes = raf.readByte();
          const latestVolumePointer = raf.readByte() - 1;
          const trend = {
            type: trendCodes[trendCode],
            data: []
          };
          trend.type = trendCodes[trendCode];
          for (let j = 0; j < numberVolumes; j += 1) {
            let value = raf.readShort();
            if ([1, 2].includes(trendCode) && value > 700) value -= 1e3;
            trend.data.push(value * trendCodeScale[trendCode]);
          }
          trend.data = [...trend.data.slice(latestVolumePointer + 1), ...trend.data.slice(0, latestVolumePointer + 1)].reverse();
          result.trends[trendCode] = trend;
        }
        return { [cellId]: result };
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/16.js
  var require__9 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/16.js"(exports, module) {
      init_shim_buffer();
      var code = 22;
      var description = "Cell Trend Data Packet";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const numberVolumes = raf.readByte();
        const latestVolumePointer = raf.readByte() - 1;
        const result = {
          volumeTimes: []
        };
        for (let i = 0; i < numberVolumes; i += 1) {
          result.volumeTimes.push(raf.readShort());
        }
        result.volumeTimes = [...result.volumeTimes.slice(latestVolumePointer + 1), ...result.volumeTimes.slice(0, latestVolumePointer + 1)].reverse();
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/17.js
  var require__10 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/17.js"(exports, module) {
      init_shim_buffer();
      var code = 23;
      var description = "Special Graphic Symbol Packet";
      var parser = (raf) => {
        const { parser: packetParser } = require_packets();
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        const endPos = raf.getPos() + lengthOfBlock;
        const result = {
          packets: []
        };
        while (raf.getPos() < endPos) {
          result.packets.push(packetParser(raf));
        }
        result.packetCodeHex = packetCode.toString(16);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/18.js
  var require__11 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/18.js"(exports, module) {
      init_shim_buffer();
      var code = 24;
      var description = "Special Graphic Symbol Packet";
      var { parser } = require__10();
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/19.js
  var require__12 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/19.js"(exports, module) {
      init_shim_buffer();
      var code = 25;
      var description = "Special Graphic Symbol Packet";
      var { parser } = require__10();
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/32.js
  var require__13 = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/32.js"(exports, module) {
      init_shim_buffer();
      var code = 32;
      var description = "Special Graphic Symbol Packet";
      var featureKey = {
        1: "mesocyclone (extrapolated)",
        3: "mesocyclone (persistent, new or increasing)",
        5: "TVS (extrapolated)",
        6: "ETVS (extrapolated)",
        7: "TVS (persistent, new or increasing)",
        8: "ETVS (persistent, new or increasing)",
        9: "MDA Circulation with Strength Rank >= 5 AND with a Base Height <= 1 km ARL or with its base on the lowest elevation angle",
        10: "MDA Circulation with Strength Rank >= 5 AND with a Base Height > 1 km ARL AND that Base is not on the lowest elevation angle",
        11: " MDA Circulation with Strength Rank< 5"
      };
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          points: []
        };
        result.packetCodeHex = packetCode.toString(16);
        let i = 0;
        for (i = 0; i < lengthOfBlock && i + 8 < lengthOfBlock; i += 8) {
          const iStartingPoint = raf.readShort();
          const jStartingPoint = raf.readShort();
          const pointFeatureType = raf.readShort();
          const pointFeatureAttribute = raf.readShort();
          result.points.push({
            iStartingPoint,
            jStartingPoint,
            pointFeatureType,
            pointFeatureAttribute
          });
        }
        raf.skip(result.lengthOfBlock - i);
        return result;
      };
      module.exports = {
        code,
        description,
        parser,
        supplemental: { featureKey }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/a.js
  var require_a = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/a.js"(exports, module) {
      init_shim_buffer();
      var code = 10;
      var description = "Unlinked Vector Packet";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          color: raf.readShort(),
          vectors: []
        };
        result.packetCodeHex = packetCode.toString(16);
        const endByte = raf.getPos() + lengthOfBlock - 2;
        while (raf.getPos() < endByte) {
          result.vectors.push({
            start: {
              i: raf.readShort(),
              j: raf.readShort()
            },
            end: {
              i: raf.readShort(),
              j: raf.readShort()
            }
          });
        }
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/c.js
  var require_c = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/c.js"(exports, module) {
      init_shim_buffer();
      var code = 12;
      var description = "Tornado Vortex Signautre";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          points: []
        };
        result.packetCodeHex = packetCode.toString(16);
        let i = 0;
        for (i = 0; i < lengthOfBlock && i + 4 <= lengthOfBlock; i += 4) {
          const iStartingPoint = raf.readShort();
          const jStartingPoint = raf.readShort();
          result.points.push({
            iStartingPoint,
            jStartingPoint
          });
        }
        raf.skip(result.lengthOfBlock - i);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/f.js
  var require_f = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/f.js"(exports, module) {
      init_shim_buffer();
      var code = 15;
      var description = "Special Graphic Symbol Packet";
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        const lengthOfBlock = raf.readShort();
        const result = {
          symbols: []
        };
        const endPos = raf.getPos() + lengthOfBlock;
        while (raf.getPos() < endPos) {
          result.symbols.push({
            iStartingPoint: raf.readShort(),
            jStartingPoint: raf.readShort(),
            text: raf.readString(2)
          });
        }
        result.packetCodeHex = packetCode.toString(16);
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/utilities/rle.js
  var require_rle = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/utilities/rle.js"(exports, module) {
      init_shim_buffer();
      var expand4_4 = (byte) => {
        const run = byte >> 4;
        const value = byte & 15;
        const result = [];
        for (let i = 0; i < run; i += 1) {
          result.push(value);
        }
        return result;
      };
      module.exports = {
        expand4_4
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/af1f.js
  var require_af1f = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/af1f.js"(exports, module) {
      init_shim_buffer();
      var code = 44831;
      var description = "Radial Data Packet (16 Data Levels)";
      var rle = require_rle();
      var parser = (raf) => {
        const packetCode = raf.readUShort();
        if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);
        const result = {
          firstBin: raf.readShort(),
          numberBins: raf.readShort(),
          iSweepCenter: raf.readShort(),
          jSweepCenter: raf.readShort(),
          rangeScale: raf.readShort() / 1e3,
          numRadials: raf.readShort()
        };
        result.packetCodeHex = packetCode.toString(16);
        const radials = [];
        for (let r = 0; r < result.numRadials; r += 1) {
          const rleLength = raf.readShort() * 2;
          const radial = {
            startAngle: raf.readShort() / 10,
            angleDelta: raf.readShort() / 10,
            bins: []
          };
          for (let i = 0; i < rleLength; i += 1) {
            radial.bins.push(...rle.expand4_4(raf.readByte()));
          }
          radials.push(radial);
        }
        result.radials = radials;
        return result;
      };
      module.exports = {
        code,
        description,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/packets/index.js
  var require_packets = __commonJS({
    "node_modules/nexrad-level-3-data/src/packets/index.js"(exports, module) {
      init_shim_buffer();
      var packetsRaw = [
        require__(),
        require__2(),
        require__3(),
        require__4(),
        require__5(),
        require__6(),
        require__7(),
        require__8(),
        require__9(),
        require__10(),
        require__11(),
        require__12(),
        require__13(),
        require_a(),
        require_c(),
        require_f(),
        require_af1f()
      ];
      var packets = {};
      packetsRaw.forEach((packet) => {
        if (packets[packet.code]) {
          throw new Error(`Duplicate packet code ${packet.code}`);
        }
        packets[packet.code] = packet;
      });
      var parser = (raf, productDescription) => {
        const packetCode = raf.readUShort();
        raf.skip(-2);
        const packetCodeHex = packetCode.toString(16).padStart(4, "0");
        const packet = packets[packetCode];
        if (!packet) throw new Error(`Unsupported packet code 0x${packetCodeHex}`);
        return packet.parser(raf, productDescription);
      };
      module.exports = {
        packets,
        parser
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/graphic22.js
  var require_graphic22 = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/graphic22.js"(exports, module) {
      init_shim_buffer();
      var { parser } = require_packets();
      var parse22 = (raf) => {
        let result = {
          cells: {}
        };
        let divider = raf.readShort();
        while (divider !== -1 && raf.getPos() < raf.getLength()) {
          raf.skip(-2);
          const data = parser(raf);
          if (data.volumeTimes) result = { ...result, ...data };
          if (!data.volumeTimes) result.cells = { ...result.cells, ...data };
          if (raf.getPos() < raf.getLength()) divider = raf.readShort();
        }
        if (raf.getPos() < raf.getLength()) raf.skip(-2);
        return result;
      };
      module.exports = parse22;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/graphic.js
  var require_graphic = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/graphic.js"(exports, module) {
      init_shim_buffer();
      var { parser } = require_packets();
      var graphic22 = require_graphic22();
      var parse = (raf) => {
        const blockDivider = raf.readShort();
        if (blockDivider === 22) {
          raf.skip(-2);
          return graphic22(raf);
        }
        const blockId = raf.readShort();
        const blockLength = raf.readInt();
        if (blockDivider !== -1) throw new Error(`Invalid graphic block divider: ${blockDivider}`);
        if (blockId !== 2) throw new Error(`Invalid graphic id: ${blockId}`);
        if (blockLength < 1 || blockLength > 65535) throw new Error(`Invalid block length ${blockLength}`);
        if (blockLength + raf.getPos() - 8 > raf.getLength()) throw new Error(`Block length ${blockLength} overruns file length for block id: ${blockId}`);
        const numberPages = raf.readShort();
        const packets = [];
        if (numberPages < 1 || numberPages > 48 - 1) throw new Error(`Invalid graphic number of pages: ${numberPages}`);
        for (let pageNum = 0; pageNum < numberPages; pageNum += 1) {
          const pageNumber = raf.readShort();
          const pageLength = raf.readShort();
          const endByte = raf.getPos() + pageLength;
          if (pageNum + 1 !== pageNumber) throw new Error(`Invalid page number: ${pageNumber}`);
          while (raf.getPos() < endByte) {
            packets.push(parser(raf));
          }
        }
        return packets;
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/headers/radialpackets.js
  var require_radialpackets = __commonJS({
    "node_modules/nexrad-level-3-data/src/headers/radialpackets.js"(exports, module) {
      init_shim_buffer();
      var { parser } = require_packets();
      var parse = (raf, productDescription, layerCount, options) => {
        const layers = [];
        for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
          const startPos = raf.getPos();
          const layerDivider = raf.readShort();
          const layerLength = raf.readInt();
          if (layerDivider !== -1) throw new Error(`Invalid layer divider ${layerDivider} in layer ${layerIndex}`);
          if (layerLength + raf.getPos() > raf.getLength()) throw new Error(`Layer size overruns block size for layer ${layerIndex}`);
          try {
            const packets = [];
            while (raf.getPos() < startPos + layerLength) {
              packets.push(parser(raf, productDescription));
            }
            if (packets.length === 1) {
              layers.push(packets[0]);
            } else {
              layers.push(packets);
            }
          } catch (e) {
            options.logger.warn(e.stack);
            raf.seek(startPos + layerLength);
            layers.push(void 0);
          }
        }
        return layers;
      };
      module.exports = parse;
    }
  });

  // node_modules/nexrad-level-3-data/src/products/56/index.js
  var require__14 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/56/index.js"(exports, module) {
      init_shim_buffer();
      var code = 56;
      var abbreviation = ["N0S", "N1S", "N2S", "N3S"];
      var description = "Storm relative velocity";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          elevationAngle: raf.readShort() / 10,
          dependent31_46: raf.read(32),
          maxNegativeVelocity: raf.readShort(),
          // knots
          maxPositiveVelocity: raf.readShort(),
          // knots
          motionSourceFlag: raf.readShort(),
          // = -1
          dependent50: raf.readShort(),
          averageStormSpeed: raf.readShort() / 10,
          // knots
          averageStormDirection: raf.readShort() / 10
          // degrees
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/58/formatter.js
  var require_formatter = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/58/formatter.js"(exports, module) {
      init_shim_buffer();
      module.exports = (data) => {
        const pages = data?.tabular?.pages;
        if (!pages) return {};
        const result = {};
        pages.forEach((page) => {
          page.forEach((line) => {
            const idMatch = line.match(/ {2}([A-Z][0-9]) {5}[0-9 ]{3}\/[0-9 ]{3} {3}/);
            if (!idMatch) return;
            const id = idMatch[1];
            const rawPositions = [...line.matchAll(/([ 0-9]{3}\/[ 0-9]{3}|NO DATA| {2}NEW {2})/g)];
            const stringPositions = rawPositions.map((position, index) => parseStringPosition(position[1], index === 1));
            const [current, movement, ...forecast] = stringPositions;
            result[id] = {
              current,
              movement,
              forecast
            };
          });
        });
        return {
          storms: result
        };
      };
      var parseStringPosition = (position, kts = false) => {
        if (position === "NO DATA") return null;
        if (position === "  NEW  ") return "new";
        const values = position.match(/([ 0-9]{3})\/([ 0-9]{3})/);
        if (!values) return void 0;
        if (kts) {
          return {
            deg: +values[1],
            kts: +values[2]
          };
        }
        return {
          deg: +values[1],
          nm: +values[2]
        };
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/58/index.js
  var require__15 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/58/index.js"(exports, module) {
      init_shim_buffer();
      var code = 58;
      var abbreviation = ["NST"];
      var description = "Storm Tracking Information";
      var { RandomAccessFile } = require_randomaccessfile();
      var formatter = require_formatter();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          elevationAngle: raf.readShort() / 10,
          dependent31_46: raf.read(32),
          maxNegativeVelocity: raf.readShort(),
          // knots
          maxPositiveVelocity: raf.readShort(),
          // knots
          motionSourceFlag: raf.readShort(),
          // = -1
          dependent50: raf.readShort(),
          averageStormSpeed: raf.readShort() / 10,
          // knots
          averageStormDirection: raf.readShort() / 10
          // degrees
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        formatter,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/59/formatter.js
  var require_formatter2 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/59/formatter.js"(exports, module) {
      init_shim_buffer();
      module.exports = (data) => {
        const pages = data?.tabular?.pages;
        if (!pages) return {};
        const result = {};
        pages.forEach((page) => {
          page.forEach((line) => {
            const rawMatch = line.match(/ {8}([A-Z]\d) {4} *([0-9.]{1,3}) *([0-9.]{1,3}) *<?>?([0-9.]{4,6}) */);
            if (!rawMatch) return;
            const [, id, probSevere, probHail, maxSize] = [...rawMatch];
            result[id] = {
              probSevere: +probSevere,
              probHail: +probHail,
              maxSize: +maxSize
            };
          });
        });
        return {
          hail: result
        };
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/59/index.js
  var require__16 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/59/index.js"(exports, module) {
      init_shim_buffer();
      var code = 59;
      var abbreviation = ["NHI"];
      var description = "Hail Index";
      var formatter = require_formatter2();
      module.exports = {
        code,
        abbreviation,
        description,
        formatter,
        productDescription: {}
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/61/formatter.js
  var require_formatter3 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/61/formatter.js"(exports, module) {
      init_shim_buffer();
      module.exports = (data) => {
        const pages = data?.tabular?.pages;
        if (!pages) return {};
        const result = {};
        pages.forEach((page) => {
          page.forEach((line) => {
            const rawMatch = line.match(/ {2}([A-Z0-9]{3}) {4}([A-Z][0-9]) {3,5}([0-9.]{1,3})\/ {0,2}([0-9.]{1,3}) {3,5}([0-9.]{1,3}) {3,5}([0-9.]{1,3}) {3,5}([0-9.]{1,3})\/ {0,2}([0-9.]{1,3})[ <>]{4}([0-9.]{4})[ <>]{3,4}([0-9.]{3,4})\/ {0,2}([0-9.]{1,4}) {3,5}([0-9.]{2,4})\/ {0,2}([0-9.]{1,4})/);
            if (!rawMatch) return;
            const [, type, id, az, range, avfdv, lldv, mxdv, mvdvhgt, depth, base, top, maxshear, maxshearheight] = [...rawMatch];
            result[id] = {
              type,
              az: +az,
              range: +range,
              avfdv: +avfdv,
              lldv: +lldv,
              mxdv: +mxdv,
              mvdvhgt: +mvdvhgt,
              depth: +depth,
              base: +base,
              top: +top,
              maxshear: +maxshear,
              maxshearheight: +maxshearheight
            };
          });
        });
        return {
          tvs: result
        };
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/61/index.js
  var require__17 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/61/index.js"(exports, module) {
      init_shim_buffer();
      var code = 61;
      var abbreviation = ["NTV"];
      var description = "Tornadic Vortex Signature";
      var formatter = require_formatter3();
      module.exports = {
        code,
        abbreviation,
        description,
        formatter,
        productDescription: {}
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/62/index.js
  var require__18 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/62/index.js"(exports, module) {
      init_shim_buffer();
      var code = 62;
      var abbreviation = ["NSS"];
      var description = "Storm Structure";
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {}
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/78/index.js
  var require__19 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/78/index.js"(exports, module) {
      init_shim_buffer();
      var code = 78;
      var abbreviation = "N1P";
      var description = "One-hour precipitation";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        raf.seek(34);
        return {
          maxRainfall: raf.readShort() / 10,
          meanFieldBias: raf.readShort() / 100,
          sampleSize: raf.readShort() / 100,
          endRanifallDate: raf.readShort(),
          endRainfallMinutes: raf.readShort(),
          plot: {
            maxDataValue: 16
          }
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/80/index.js
  var require__20 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/80/index.js"(exports, module) {
      init_shim_buffer();
      var code = 80;
      var abbreviation = "NTP";
      var description = "Storm Total Rainfall Accumulation";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        raf.seek(34);
        return {
          maxRainfall: raf.readShort() / 10,
          beginRanifallDate: raf.readShort(),
          beginRainfallMinutes: raf.readShort(),
          endRanifallDate: raf.readShort(),
          endRainfallMinutes: raf.readShort(),
          meanFieldBias: raf.readShort() / 100,
          sampleSize: raf.readShort() / 100,
          plot: {
            maxDataValue: 16
          }
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/94/index.js
  var require__21 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/94/index.js"(exports, module) {
      init_shim_buffer();
      var code = 94;
      var abbreviation = ["NXQ", "NYQ", "NZQ", "N0Q", "NAQ", "N1Q", "NBQ", "N2Q", "N3Q"];
      var description = "Digital Base Reflectivity";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          elevationAngle: raf.readShort() / 10,
          plot: {
            minimumDataValue: raf.readShort() / 10,
            dataIncrement: raf.readShort() / 10,
            dataLevels: raf.readShort()
          },
          dependent34_46: raf.read(26),
          maxReflectivity: raf.readShort(),
          // dBZ
          dependent48_49: raf.read(4),
          ...deltaTime(raf.readShort()),
          compressionMethod: raf.readShort(),
          uncompressedProductSize: (raf.readUShort() << 16) + raf.readUShort()
        };
      };
      var deltaTime = (value) => ({
        deltaTime: (value & 65504) >> 5,
        nonSupplementalScan: (value & 31) === 0,
        sailsScan: (value & 31) === 1,
        mrleScan: (value & 31) === 2
      });
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/141/formatter.js
  var require_formatter4 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/141/formatter.js"(exports, module) {
      init_shim_buffer();
      module.exports = (data) => {
        const pages = data?.tabular?.pages;
        if (!pages) return {};
        const result = {};
        pages.forEach((page) => {
          page.forEach((line) => {
            const rawMatch = line.match(/ +([0-9.]+) +([0-9.]+)\/ *([0-9.]+) +([0-9.]+) +([A-Z0-9]{2}) +([0-9.]+) +([0-9.]+)[ <]+([0-9.]+)[ <>]+([0-9.]+)[ <>]+([0-9.]+)[ <>]+([0-9.]+)[ <>]+([0-9.]+) +([YN]) {1,4}([0-9.]*)\/* {0,3}([0-9.]*) +([0-9.]*)/);
            if (!rawMatch) return;
            const [, id, az, ran, sr, stmId, llRv, llDv, llBase, depthKft, depthStmrel, maxRvKft, maxrvKts, tvs, motionDeg, motionKts, msi] = [...rawMatch];
            let motion = false;
            if (motionDeg !== "") {
              motion = {
                deg: +motionDeg,
                kts: +motionKts
              };
            }
            result[id] = {
              az: +az,
              ran: +ran,
              sr: +sr,
              stmId,
              lowLevel: {
                rv: +llRv,
                dv: +llDv,
                base: +llBase
              },
              depth: {
                kft: +depthKft,
                stmrel: +depthStmrel
              },
              maxRv: {
                kft: +maxRvKft,
                kts: +maxrvKts
              },
              tvs: tvs === "Y",
              motion,
              msi: msi ?? null
            };
          });
        });
        return {
          mesocyclone: result
        };
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/141/index.js
  var require__22 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/141/index.js"(exports, module) {
      init_shim_buffer();
      var code = 141;
      var abbreviation = ["NMD"];
      var description = "Mesocyclone";
      var formatter = require_formatter4();
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords27_28 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          minimumReflectivity: raf.readShort(),
          overlapDisplayFilter: raf.readShort()
        };
      };
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          filterStrengthRank: raf.readShort()
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        formatter,
        productDescription: {
          halfwords27_28,
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/153/index.js
  var require__23 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/153/index.js"(exports, module) {
      init_shim_buffer();
      var code = 153;
      var abbreviation = ["N0B", "N1B", "N2B", "N3B"];
      var description = "Super Resolution Base Reflectivity";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          elevationAngle: raf.readShort() / 10,
          plot: {
            minimumDataValue: raf.readShort() / 10,
            dataIncrement: raf.readShort() / 10,
            dataLevels: raf.readShort()
          },
          dependent34_46: raf.read(26),
          maxReflectivity: raf.readShort(),
          // dBZ
          dependent48_49: raf.read(4),
          ...deltaTime(raf.readShort()),
          compressionMethod: raf.readShort(),
          uncompressedProductSize: (raf.readUShort() << 16) + raf.readUShort()
        };
      };
      var deltaTime = (value) => ({
        deltaTime: (value & 65504) >> 5,
        nonSupplementalScan: (value & 31) === 0,
        sailsScan: (value & 31) === 1,
        mrleScan: (value & 31) === 2
      });
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/165/index.js
  var require__24 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/165/index.js"(exports, module) {
      init_shim_buffer();
      var code = 165;
      var abbreviation = ["N0H", "N1H", "N2H", "N3H"];
      var description = "Hydrometeor Classification";
      var { RandomAccessFile } = require_randomaccessfile();
      var key = {
        0: "ND: Below Threshold",
        10: "BI: Biological",
        20: "GC: Anomalous Propagation/Ground Clutter",
        30: "IC: Ice Crystals",
        40: "DS: Dry Snow",
        50: "WS: Wet Snow",
        60: "RA: Light and/or Moderate Rain",
        70: "HR: Heavy Rain",
        80: "BD: Big Drops (rain)",
        90: "GR: Graupel",
        100: "HA: Hail, possibly with rain",
        110: "LH: Large Hail",
        120: "GH: Giant Hail",
        140: "UK: Unknown Classification",
        150: "RF: Range Folded"
      };
      var halfwords27_28 = (data) => ({
        halfwords27_28: data
      });
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          elevationAngle: raf.readShort() / 10,
          dependent31_49: raf.read(38),
          ...deltaTime(raf.readShort()),
          compressionMethod: raf.readShort(),
          uncompressedSize: (raf.readUShort() << 16) + raf.readUShort(),
          plot: { maxDataValue: 150 }
        };
      };
      var deltaTime = (value) => ({
        deltaTime: (value & 65504) >> 5,
        nonSupplementalScan: (value & 31) === 0,
        sailsScan: (value & 31) === 1,
        mrleScan: (value & 31) === 2
      });
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords27_28,
          halfwords30_53
        },
        supplemental: { key }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/170/index.js
  var require__25 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/170/index.js"(exports, module) {
      init_shim_buffer();
      var code = 170;
      var abbreviation = "DAA";
      var description = "Digital One Hour Accumulation";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords27_28 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          thresholdMinTime: raf.readShort(),
          totalTime: raf.readShort()
        };
      };
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          nullProductFlag: nullProductFlag(raf.readShort()),
          plot: {
            scale: raf.readFloat() * 100,
            offset: raf.readFloat(),
            dependent35: raf.readShort(),
            maxDataValue: raf.readShort(),
            leadingFlags: leadingFlags(raf.readShort()),
            trailingFlags: raf.readShort()
          },
          dependent39_46: raf.read(16),
          maxAccumulation: raf.readShort() / 10,
          accumulationEndDate: raf.readShort(),
          accumulationEndMinutes: raf.readShort(),
          meanFieldBias: raf.readShort() / 1e3,
          compressionMethod: raf.readShort(),
          uncompressedSize: (raf.readUShort() << 16) + raf.readUShort()
        };
      };
      var nullProductFlag = (data) => {
        if (data === 0) return false;
        let reason = "";
        switch (data) {
          case 0:
            reason = false;
            break;
          case 1:
            reason = "No accumulation available. Threshold: \u2018Elapsed Time to Restart\u2019 [TIMRS] xx minutes exceeded.";
            break;
          case 2:
            reason = "No precipitation detected during the specified time span.";
            break;
          case 3:
            reason = "No accumulation data available for the specified time span.";
            break;
          case 4:
            reason = "No precipitation detected since hh:mmZ. Threshold: 'Time Without Precipitation for Resetting Storm Totals' [RAINT] is xx minutes or No precipitation detected since RPG startup.";
            break;
          case 5:
            reason = "No precipitation detected since hh:mmZ or No precipitation detected since RPG startup.";
            break;
          case 6:
            reason = "No Top_of_Hour accumulation - Some problem encountered with the SQL query resulted in an error.";
            break;
          case 7:
            reason = "No Top_of_Hour accumulation because of excessive missing time encountered.";
            break;
          default:
            reason = "Undefined";
        }
        return {
          value: data,
          reason
        };
      };
      var leadingFlags = (data) => ({
        noData: data & false
      });
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords27_28,
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/172/index.js
  var require__26 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/172/index.js"(exports, module) {
      init_shim_buffer();
      var code = 172;
      var abbreviation = "DTA";
      var description = "Storm Total Precipitation";
      var { RandomAccessFile } = require_randomaccessfile();
      var halfwords27_28 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          accumulationStartDate: raf.readShort(),
          accumulationStartMinutes: raf.readShort()
        };
      };
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          nullProductFlag: nullProductFlag(raf.readShort()),
          plot: {
            scale: raf.readFloat() * 100,
            offset: raf.readFloat(),
            dependent35: raf.readShort(),
            maxDataValue: raf.readShort(),
            leadingFlags: leadingFlags(raf.readShort()),
            trailingFlags: raf.readShort()
          },
          dependent39_46: raf.read(16),
          maxAccumulation: raf.readShort() / 10,
          accumulationEndDate: raf.readShort(),
          accumulationEndMinutes: raf.readShort(),
          meanFieldBias: raf.readShort() / 1e3,
          compressionMethod: raf.readShort(),
          uncompressedSize: (raf.readUShort() << 16) + raf.readUShort()
        };
      };
      var nullProductFlag = (data) => {
        if (data === 0) return false;
        let reason = "";
        switch (data) {
          case 0:
            reason = false;
            break;
          case 1:
            reason = "No accumulation available. Threshold: \u2018Elapsed Time to Restart\u2019 [TIMRS] xx minutes exceeded.";
            break;
          case 2:
            reason = "No precipitation detected during the specified time span.";
            break;
          case 3:
            reason = "No accumulation data available for the specified time span.";
            break;
          case 4:
            reason = "No precipitation detected since hh:mmZ. Threshold: 'Time Without Precipitation for Resetting Storm Totals' [RAINT] is xx minutes or No precipitation detected since RPG startup.";
            break;
          case 5:
            reason = "No precipitation detected since hh:mmZ or No precipitation detected since RPG startup.";
            break;
          case 6:
            reason = "No Top_of_Hour accumulation - Some problem encountered with the SQL query resulted in an error.";
            break;
          case 7:
            reason = "No Top_of_Hour accumulation because of excessive missing time encountered.";
            break;
          default:
            reason = "Undefined";
        }
        return {
          value: data,
          reason
        };
      };
      var leadingFlags = (data) => ({
        noData: data & false
      });
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords27_28,
          halfwords30_53
        }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/177/index.js
  var require__27 = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/177/index.js"(exports, module) {
      init_shim_buffer();
      var code = 177;
      var abbreviation = "HHC";
      var description = "Hybrid Hydrometeor Classification";
      var { RandomAccessFile } = require_randomaccessfile();
      var { key } = require__24().supplemental;
      var halfwords27_28 = (data) => ({
        halfwords27_28: data
      });
      var halfwords30_53 = (data) => {
        const raf = new RandomAccessFile(data);
        return {
          dependent30_46: raf.read(34),
          modeFilter: raf.readShort(),
          hybridRatePercentBinsFilled: raf.readShort() / 100,
          highestElevation: raf.readShort() / 10,
          dependent50: raf.read(2),
          compressionMethod: raf.readShort(),
          uncompressedSize: (raf.readUShort() << 16) + raf.readUShort(),
          plot: { maxDataValue: 150 }
        };
      };
      module.exports = {
        code,
        abbreviation,
        description,
        productDescription: {
          halfwords27_28,
          halfwords30_53
        },
        supplemental: { key }
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/products/index.js
  var require_products = __commonJS({
    "node_modules/nexrad-level-3-data/src/products/index.js"(exports, module) {
      init_shim_buffer();
      var productsRaw = [
        require__14(),
        require__15(),
        require__16(),
        require__17(),
        require__18(),
        require__19(),
        require__20(),
        require__21(),
        require__22(),
        require__23(),
        require__24(),
        require__25(),
        require__26(),
        require__27()
      ];
      var products = {};
      productsRaw.forEach((product) => {
        if (products[product.code]) {
          throw new Error(`Duplicate product code ${product.code}`);
        }
        products[product.code] = product;
      });
      var productAbbreviations = productsRaw.map((product) => product.abbreviation).flat();
      module.exports = {
        products,
        productAbbreviations
      };
    }
  });

  // node_modules/nexrad-level-3-data/src/index.js
  var require_index = __commonJS({
    "node_modules/nexrad-level-3-data/src/index.js"(exports, module) {
      init_shim_buffer();
      var bzip = require_lib();
      var { RandomAccessFile } = require_randomaccessfile();
      var textHeader = require_text();
      var messageHeader = require_message();
      var { parse: productDescription } = require_productdescription();
      var symbologyHeader = require_symbology();
      var tabularHeader = require_tabular();
      var graphicHeader = require_graphic();
      var radialPackets = require_radialpackets();
      var { products, productAbbreviations } = require_products();
      var nexradLevel3Data = (file, _options) => {
        const options = combineOptions(_options);
        const raf = new RandomAccessFile(file);
        const result = {};
        result.textHeader = textHeader(raf);
        const textHeaderLength = raf.getPos();
        if (!result.textHeader.fileType.startsWith("SDUS")) throw new Error(`Incorrect file type header: ${result.textHeader.fileType}`);
        if (!productAbbreviations.includes(result.textHeader.type)) throw new Error(`Unsupported product type: ${result.textHeader.type}`);
        result.messageHeader = messageHeader(raf);
        const product = products[result.messageHeader.code.toString()];
        if (!product) throw new Error(`Unsupported product code: ${result.messageHeader.code}`);
        result.productDescription = productDescription(raf, product);
        let decompressed;
        if (result.productDescription.compressionMethod > 0) {
          const rafPos = raf.getPos();
          const compressed = raf.read(raf.getLength() - raf.getPos());
          const data = bzip.decode(compressed);
          raf.seek(0);
          decompressed = new RandomAccessFile(import_buffer.Buffer.concat([
            raf.read(rafPos),
            data
          ]));
          decompressed.seek(rafPos);
        } else {
          decompressed = raf;
        }
        try {
          if (result.productDescription.offsetSymbology !== 0) {
            const offsetSymbologyBytes = textHeaderLength + result.productDescription.offsetSymbology * 2;
            if (offsetSymbologyBytes > decompressed.getLength()) throw new Error(`Invalid symbology offset: ${result.productDescription.offsetSymbology}`);
            decompressed.seek(offsetSymbologyBytes);
            result.symbology = symbologyHeader(decompressed);
            result.radialPackets = radialPackets(decompressed, result.productDescription, result.symbology.numberLayers, options);
          }
        } catch (e) {
          options.logger.warn(e.stack);
          options.logger.warn("Unable to parse symbology data");
        }
        try {
          if (result.productDescription.offsetGraphic !== 0) {
            const offsetGraphicBytes = textHeaderLength + result.productDescription.offsetGraphic * 2;
            if (offsetGraphicBytes > decompressed.getLength()) throw new Error(`Invalid graphic offset: ${result.productDescription.offsetGraphic}`);
            decompressed.seek(offsetGraphicBytes);
            result.graphic = graphicHeader(decompressed);
          }
        } catch (e) {
          options.logger.warn(e.stack);
          options.logger.warn("Unable to parse graphic data");
        }
        try {
          if (result.productDescription.offsetTabular !== 0) {
            const offsetTabularBytes = textHeaderLength + result.productDescription.offsetTabular * 2;
            if (offsetTabularBytes > decompressed.getLength()) throw new Error(`Invalid tabular offset: ${result.productDescription.offsetTabular}`);
            decompressed.seek(offsetTabularBytes);
            result.tabular = tabularHeader(decompressed, product);
          }
        } catch (e) {
          options.logger.warn(e.stack);
          options.logger.warn("Unable to parse tabular data");
        }
        try {
          const formatted = product?.formatter?.(result);
          if (formatted) result.formatted = formatted;
        } catch (e) {
          options.logger.warn(e.stack);
          options.logger.warn("Unable to parse formatted tabular data");
        }
        return result;
      };
      var combineOptions = (newOptions) => {
        let logger = newOptions?.logger ?? console;
        if (logger === false) logger = nullLogger;
        return {
          ...newOptions,
          logger
        };
      };
      var nullLogger = {
        log: () => {
        },
        error: () => {
        },
        warn: () => {
        }
      };
      module.exports = nexradLevel3Data;
    }
  });
  return require_index();
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/

(function () {
  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createNode(tagName, className, text) {
    var node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (typeof text === "string") {
      node.textContent = text;
    }

    return node;
  }

  function clampNumber(value, min, max) {
    var numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return min;
    }

    return Math.min(Math.max(numericValue, min), max);
  }

  function toPercent(value) {
    return clampNumber(value, 0, 100) + "%";
  }

  function isFileProtocol() {
    return window.location.protocol === "file:";
  }

  function loadJson(path) {
    if (isFileProtocol()) {
      return tryFileProtocolStrategies(path);
    }

    return fetch(path).then(function (response) {
      if (!response.ok) {
        throw new Error("Could not read " + path + ".");
      }

      return response.json();
    });
  }

  function tryFileProtocolStrategies(path) {
    return fetch(path).then(function (response) {
      if (!response.ok) {
        throw new Error("Could not read " + path + ".");
      }

      return response.text();
    }).then(function (rawText) {
      return parseJsonText(rawText, path);
    }).catch(function () {
      return loadJsonFromFrame(path);
    });
  }

  // Chrome blocks local fetch on file:// pages, so this reads JSON through
  // a hidden frame when the app is opened by double-clicking index.html.
  function loadJsonFromFrame(path) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement("iframe");
      var timeoutId = window.setTimeout(function () {
        cleanup();
        reject(new Error("Timed out while loading " + path + "."));
      }, 5000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        frame.onload = null;
        frame.onerror = null;

        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      }

      frame.hidden = true;
      frame.setAttribute("aria-hidden", "true");
      frame.src = path;

      frame.onload = function () {
        try {
          var frameDocument = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
          var rawText = extractFrameText(frameDocument);

          resolve(parseJsonText(rawText, path));
        } catch (error) {
          reject(new Error("Could not parse " + path + "."));
        } finally {
          cleanup();
        }
      };

      frame.onerror = function () {
        cleanup();
        reject(new Error("Could not load " + path + "."));
      };

      document.body.appendChild(frame);
    });
  }

  function extractFrameText(frameDocument) {
    if (!frameDocument) {
      return "";
    }

    var candidates = [];

    if (frameDocument.body) {
      candidates.push(frameDocument.body.innerText);
      candidates.push(frameDocument.body.textContent);
    }

    if (frameDocument.documentElement) {
      candidates.push(frameDocument.documentElement.innerText);
      candidates.push(frameDocument.documentElement.textContent);
    }

    for (var index = 0; index < candidates.length; index += 1) {
      if (typeof candidates[index] === "string" && candidates[index].trim()) {
        return candidates[index];
      }
    }

    return "";
  }

  function parseJsonText(rawText, path) {
    var cleanText = String(rawText || "").replace(/^\uFEFF/, "").trim();

    if (!cleanText) {
      throw new Error("Could not parse " + path + ".");
    }

    try {
      return JSON.parse(cleanText);
    } catch (error) {
      var extracted = extractJsonLikePayload(cleanText);

      if (!extracted) {
        throw error;
      }

      return JSON.parse(extracted);
    }
  }

  function extractJsonLikePayload(text) {
    var objectStart = text.indexOf("{");
    var objectEnd = text.lastIndexOf("}");
    var arrayStart = text.indexOf("[");
    var arrayEnd = text.lastIndexOf("]");
    var objectPayload = objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart
      ? text.slice(objectStart, objectEnd + 1)
      : "";
    var arrayPayload = arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart
      ? text.slice(arrayStart, arrayEnd + 1)
      : "";

    if (objectPayload && arrayPayload) {
      return objectPayload.length >= arrayPayload.length ? objectPayload : arrayPayload;
    }

    return objectPayload || arrayPayload || "";
  }

  async function readJsonFromDirectoryHandle(rootHandle, relativePath) {
    var segments = relativePath.split(/[\\/]/).filter(Boolean);
    var currentHandle = rootHandle;

    for (var index = 0; index < segments.length - 1; index += 1) {
      currentHandle = await currentHandle.getDirectoryHandle(segments[index]);
    }

    var fileHandle = await currentHandle.getFileHandle(segments[segments.length - 1]);
    var file = await fileHandle.getFile();
    var rawText = await file.text();

    return parseJsonText(rawText, relativePath);
  }

  function applyBackgroundImage(path, enabled) {
    var value = enabled && path ? "url('" + path + "')" : "none";
    document.documentElement.style.setProperty("--background-image", value);
  }

  function getActionClassNames(action) {
    var classes = ["story-action"];
    var styleName = action && action.style ? action.style : "secondary";

    if (styleName === "primary") {
      classes.push("is-primary");
    } else if (styleName === "option") {
      classes.push("is-option");
    } else {
      classes.push("is-secondary");
    }

    return classes.join(" ");
  }

  window.ConclaveUtils = {
    applyBackgroundImage: applyBackgroundImage,
    clampNumber: clampNumber,
    clearNode: clearNode,
    createNode: createNode,
    getActionClassNames: getActionClassNames,
    loadJson: loadJson,
    readJsonFromDirectoryHandle: readJsonFromDirectoryHandle,
    toPercent: toPercent
  };
}());

(function () {
  var EXPECTED_SCREEN_COUNT = 50;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    var elements = getElements();
    var renderer = new window.ConclaveRenderer(elements, {});

    renderer.setStatus("Loading story…", "Reading the local content files.", false);
    loadAppData().then(function (data) {
      startApp(data.settings, data.story, elements, renderer);
    }).catch(function (error) {
      handleLoadError(error, elements, renderer);
    });
  }

  function loadAppData(rootHandle) {
    if (rootHandle) {
      return Promise.all([
        window.ConclaveUtils.readJsonFromDirectoryHandle(rootHandle, "data/settings.json"),
        window.ConclaveUtils.readJsonFromDirectoryHandle(rootHandle, "data/story.json")
      ]).then(function (results) {
        return {
          settings: results[0],
          story: results[1]
        };
      });
    }

    return Promise.all([
      window.ConclaveUtils.loadJson("data/settings.json"),
      window.ConclaveUtils.loadJson("data/story.json")
    ]).then(function (results) {
      return {
        settings: results[0],
        story: results[1]
      };
    });
  }

  function startApp(settings, story, elements, renderer) {
    var screenIndex;
    var allImagePaths;
    var imageCache;
    var engine;
    var audioController;
    var initialViewModel;

    validateStory(story);

    window.ConclaveUtils.applyBackgroundImage(settings.backgroundImage, settings.showBackgroundImage);

    screenIndex = buildScreenIndex(story);
    allImagePaths = collectStoryImagePaths(story);
    imageCache = window.ConclaveUtils.createImageCache();
    renderer.settings.imageCache = imageCache;
    engine = new window.ConclaveStoryEngine(story, settings);
    audioController = new window.ConclaveAudioController(
      settings,
      elements.audioToggle,
      elements.audioToggleIcon,
      elements.audioToggleText
    );

    audioController.init();
    initialViewModel = engine.getCurrentViewModel();
    bindActions(elements, engine, renderer, audioController, story, screenIndex, imageCache);
    renderView(initialViewModel, renderer, story, screenIndex, imageCache);
    startBackgroundImageWarmup(imageCache, getBackgroundImagePaths(story, initialViewModel, screenIndex, allImagePaths));
    renderer.setStatus("Story ready", "Edit data/story.json or replace the matching assets to customize the experience.", true);
    renderer.setStatusAction("", true, null);
    renderer.announce("Loaded " + story.screens.length + " screens.");
  }

  function handleLoadError(error, elements, renderer) {
    var isFileMode = window.location.protocol === "file:";
    var canPickDirectory = isFileMode && typeof window.showDirectoryPicker === "function";
    var message = error.message + " Check data/story.json and data/settings.json, then reopen index.html.";

    if (canPickDirectory) {
      message = error.message + " Chrome sometimes blocks local JSON on file:// pages. Use the button below and choose the project folder that contains index.html, data, js, css, and assets.";
    }

    renderer.setStatus("Could not load the app", message, false);

    if (!canPickDirectory) {
      renderer.setStatusAction("", true, null);
      return;
    }

    renderer.setStatusAction("Select Project Folder", false, function () {
      renderer.setStatus("Waiting for folder access", "Choose the project root folder, then the app will retry loading the JSON files.", false);
      renderer.setStatusAction("", true, null);

      window.showDirectoryPicker().then(function (rootHandle) {
        return loadAppData(rootHandle);
      }).then(function (data) {
        startApp(data.settings, data.story, elements, renderer);
      }).catch(function (pickerError) {
        handleLoadError(pickerError, elements, renderer);
      });
    });
  }

  function bindActions(elements, engine, renderer, audioController, story, screenIndex, imageCache) {
    if (elements.layout.dataset.controlsBound === "true") {
      return;
    }

    elements.layout.dataset.controlsBound = "true";
    elements.actionArea.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action-id]");

      if (!button) {
        return;
      }

      try {
        audioController.playClick();
        var viewModel = engine.handleAction(button.dataset.actionId);
        renderView(viewModel, renderer, story, screenIndex, imageCache);
        renderer.announce(viewModel.title + ". " + viewModel.clickCount + " clicks so far.");
      } catch (error) {
        renderer.setStatus("Action error", error.message, false);
      }
    });

    elements.restartButton.addEventListener("click", function () {
      audioController.playClick();
      var viewModel = engine.restart();
      renderView(viewModel, renderer, story, screenIndex, imageCache);
      renderer.announce("Restarted. " + viewModel.title + ".");
    });

    elements.backButton.addEventListener("click", function () {
      audioController.playClick();
      var viewModel = engine.canGoBack() ? engine.goBack() : engine.restart();
      renderView(viewModel, renderer, story, screenIndex, imageCache);
      renderer.announce(viewModel.title + ".");
    });
  }

  function renderView(viewModel, renderer, story, screenIndex, imageCache) {
    renderer.render(viewModel);
    imageCache.preloadImages(getPriorityImagePaths(story, viewModel, screenIndex));
  }

  function buildScreenIndex(story) {
    var index = {};
    var screens = story && Array.isArray(story.screens) ? story.screens : [];

    for (var screenIndex = 0; screenIndex < screens.length; screenIndex += 1) {
      index[screens[screenIndex].id] = screens[screenIndex];
    }

    return index;
  }

  function collectStoryImagePaths(story) {
    var screens = story && Array.isArray(story.screens) ? story.screens : [];
    var seen = {};
    var imagePaths = [];

    for (var screenIndex = 0; screenIndex < screens.length; screenIndex += 1) {
      var imagePath = getImagePath(screens[screenIndex]);

      if (!imagePath || seen[imagePath]) {
        continue;
      }

      seen[imagePath] = true;
      imagePaths.push(imagePath);
    }

    return imagePaths;
  }

  function getPriorityImagePaths(story, viewModel, screenIndex) {
    var seen = {};
    var priorityPaths = [];
    var earlyScreens = story && Array.isArray(story.screens) ? story.screens.slice(0, 4) : [];
    var actions = viewModel && Array.isArray(viewModel.actions) ? viewModel.actions : [];

    addImagePath(priorityPaths, seen, getImagePath(viewModel && viewModel.screen));

    for (var earlyIndex = 0; earlyIndex < earlyScreens.length; earlyIndex += 1) {
      addImagePath(priorityPaths, seen, getImagePath(earlyScreens[earlyIndex]));
    }

    for (var actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      var targetId = actions[actionIndex].type === "restart" ? story.startScreenId : actions[actionIndex].target;
      var targetScreen = targetId ? screenIndex[targetId] : null;

      addImagePath(priorityPaths, seen, getImagePath(targetScreen));
    }

    return priorityPaths;
  }

  function getBackgroundImagePaths(story, viewModel, screenIndex, allImagePaths) {
    var priorityLookup = {};
    var priorityPaths = getPriorityImagePaths(story, viewModel, screenIndex);
    var backgroundPaths = [];

    for (var priorityIndex = 0; priorityIndex < priorityPaths.length; priorityIndex += 1) {
      priorityLookup[priorityPaths[priorityIndex]] = true;
    }

    for (var imageIndex = 0; imageIndex < allImagePaths.length; imageIndex += 1) {
      if (!priorityLookup[allImagePaths[imageIndex]]) {
        backgroundPaths.push(allImagePaths[imageIndex]);
      }
    }

    return backgroundPaths;
  }

  function startBackgroundImageWarmup(imageCache, imagePaths) {
    var nextIndex = 0;
    var batchSize = 4;

    function queueNextBatch() {
      var batch = imagePaths.slice(nextIndex, nextIndex + batchSize);

      if (!batch.length) {
        return;
      }

      nextIndex += batch.length;
      imageCache.preloadImages(batch);

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(queueNextBatch, { timeout: 180 });
        return;
      }

      window.setTimeout(queueNextBatch, 90);
    }

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(queueNextBatch, { timeout: 120 });
      return;
    }

    window.setTimeout(queueNextBatch, 60);
  }

  function getImagePath(screen) {
    return screen && typeof screen.image === "string" ? screen.image.trim() : "";
  }

  function addImagePath(collection, seen, imagePath) {
    if (!imagePath || seen[imagePath]) {
      return;
    }

    seen[imagePath] = true;
    collection.push(imagePath);
  }

  function validateStory(story) {
    var screenIds = {};
    var actionIds = {};
    var screens = story && Array.isArray(story.screens) ? story.screens : [];

    if (screens.length !== EXPECTED_SCREEN_COUNT) {
      throw new Error("The story file does not contain the expected " + EXPECTED_SCREEN_COUNT + " screens.");
    }

    for (var screenIndex = 0; screenIndex < screens.length; screenIndex += 1) {
      var screen = screens[screenIndex];

      if (!screen.id) {
        throw new Error("A screen is missing its id.");
      }

      if (screenIds[screen.id]) {
        throw new Error("Duplicate screen id found: " + screen.id);
      }

      screenIds[screen.id] = true;

      if (screen.revealBlocks && !Array.isArray(screen.revealBlocks)) {
        throw new Error("Screen " + screen.id + " has invalid revealBlocks data.");
      }
    }

    if (!screenIds[story.startScreenId]) {
      throw new Error("The start screen id does not match any screen.");
    }

    for (screenIndex = 0; screenIndex < screens.length; screenIndex += 1) {
      screen = screens[screenIndex];
      var actions = Array.isArray(screen.actions) ? screen.actions : [];

      for (var actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
        var action = actions[actionIndex];

        if (!action.id) {
          throw new Error("A screen action is missing its id on " + screen.id + ".");
        }

        if (actionIds[action.id]) {
          throw new Error("Duplicate action id found: " + action.id);
        }

        actionIds[action.id] = true;

        if (action.type !== "goto" && action.type !== "restart") {
          throw new Error("Unsupported action type on " + action.id + ": " + action.type);
        }

        if (!action.target) {
          throw new Error("Action " + action.id + " is missing a target.");
        }

        if (!screenIds[action.target]) {
          throw new Error("Action " + action.id + " points to missing screen " + action.target + ".");
        }
      }
    }
  }

  function getElements() {
    return {
      actionArea: document.getElementById("action-area"),
      actionFooter: document.getElementById("action-footer"),
      actionStack: document.getElementById("action-stack"),
      audioToggle: document.getElementById("audio-toggle"),
      audioToggleIcon: document.getElementById("audio-toggle-icon"),
      audioToggleText: document.getElementById("audio-toggle-text"),
      backButton: document.getElementById("back-button"),
      description: document.getElementById("screen-description"),
      image: document.getElementById("screen-image"),
      layout: document.getElementById("story-layout"),
      liveRegion: document.getElementById("sr-live-region"),
      meter: document.getElementById("meter"),
      meterFill: document.getElementById("meter-fill"),
      meterValue: document.getElementById("meter-value"),
      placeholderCopy: document.getElementById("placeholder-copy"),
      restartButton: document.getElementById("restart-button"),
      statusAction: document.getElementById("status-action"),
      statusCard: document.getElementById("status-card"),
      statusCopy: document.getElementById("status-copy"),
      statusTitle: document.getElementById("status-title"),
      title: document.getElementById("screen-title"),
      visualFrame: document.getElementById("visual-frame")
    };
  }
}());

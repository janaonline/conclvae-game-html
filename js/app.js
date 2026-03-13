(function () {
  var EXPECTED_SCREEN_COUNT = 49;

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
    validateStory(story);

    window.ConclaveUtils.applyBackgroundImage(settings.backgroundImage, settings.showBackgroundImage);

    var engine = new window.ConclaveStoryEngine(story, settings);
    var audioController = new window.ConclaveAudioController(
      settings,
      elements.audioToggle,
      elements.audioToggleIcon,
      elements.audioToggleText
    );

    audioController.init();
    bindActions(elements, engine, renderer, audioController);
    renderer.render(engine.getCurrentViewModel());
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

  function bindActions(elements, engine, renderer, audioController) {
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
        renderer.render(viewModel);
        renderer.announce(viewModel.title + ". " + viewModel.clickCount + " clicks so far.");
      } catch (error) {
        renderer.setStatus("Action error", error.message, false);
      }
    });

    elements.restartButton.addEventListener("click", function () {
      audioController.playClick();
      var viewModel = engine.restart();
      renderer.render(viewModel);
      renderer.announce("Restarted. " + viewModel.title + ".");
    });

    elements.backButton.addEventListener("click", function () {
      audioController.playClick();
      var viewModel = engine.canGoBack() ? engine.goBack() : engine.restart();
      renderer.render(viewModel);
      renderer.announce(viewModel.title + ".");
    });
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

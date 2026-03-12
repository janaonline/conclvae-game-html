(function () {
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    var elements = getElements();
    var renderer = new window.ConclaveRenderer(elements, {});

    renderer.setStatus("Loading story...", "Reading the local content files.", false);
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
    if (!story.screens || story.screens.length !== 26) {
      throw new Error("The story file does not contain the expected 26 screens.");
    }

    document.title = settings.appTitle || document.title;
    window.ConclaveUtils.applyBackgroundImage(settings.backgroundImage, settings.showBackgroundImage);
    window.ConclaveUtils.applyUiSettings(settings.ui);
    renderer.settings = settings;
    renderer.setStory(story);

    var engine = new window.ConclaveStoryEngine(story, settings);
    var audioController = new window.ConclaveAudioController(
      settings,
      elements.audioToggle,
      elements.audioToggleIcon,
      elements.audioToggleText
    );

    audioController.init();
    bindActions(elements, engine, renderer, audioController);
    bindRestartControl(elements, engine, renderer, audioController);
    renderer.render(engine.getCurrentViewModel(), { initial: true });
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
    if (elements.actionArea.dataset.bound === "true") {
      return;
    }

    elements.actionArea.dataset.bound = "true";
    elements.actionArea.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action-id]");

      if (!button) {
        return;
      }

      try {
        audioController.handleStoryAction();
        var viewModel = engine.handleAction(button.dataset.actionId);
        renderer.render(viewModel);
        audioController.handleScreenChange(viewModel);
        renderer.announce(viewModel.title + ". " + viewModel.clickCount + " clicks so far.");
      } catch (error) {
        renderer.setStatus("Action error", error.message, false);
      }
    });
  }

  function bindRestartControl(elements, engine, renderer, audioController) {
    if (!elements.restartButton || elements.restartButton.dataset.bound === "true") {
      return;
    }

    elements.restartButton.dataset.bound = "true";
    elements.restartButton.addEventListener("click", function () {
      restartStory(engine, renderer, audioController);
    });
  }

  function restartStory(engine, renderer, audioController) {
    var viewModel;

    audioController.handleStoryAction();
    engine.reset();
    viewModel = engine.getCurrentViewModel();
    renderer.render(viewModel);
    audioController.handleScreenChange(viewModel);
    renderer.announce("Game restarted. " + viewModel.title + ".");
  }

  function getElements() {
    return {
      actionArea: document.getElementById("action-area"),
      actionFooter: document.getElementById("action-footer"),
      actionStack: document.getElementById("action-stack"),
      audioToggle: document.getElementById("audio-toggle"),
      audioToggleIcon: document.getElementById("audio-toggle-icon"),
      audioToggleText: document.getElementById("audio-toggle-text"),
      clickCounter: document.getElementById("click-counter"),
      description: document.getElementById("screen-description"),
      image: document.getElementById("screen-image"),
      layout: document.getElementById("story-layout"),
      liveRegion: document.getElementById("sr-live-region"),
      meter: document.getElementById("meter"),
      meterFill: document.getElementById("meter-fill"),
      meterValue: document.getElementById("meter-value"),
      placeholderCopy: document.getElementById("placeholder-copy"),
      restartButton: document.getElementById("restart-button"),
      screenChip: document.getElementById("screen-chip"),
      screenProgress: document.getElementById("screen-progress"),
      statusAction: document.getElementById("status-action"),
      statusCard: document.getElementById("status-card"),
      statusCopy: document.getElementById("status-copy"),
      statusTitle: document.getElementById("status-title"),
      title: document.getElementById("screen-title"),
      visualFrame: document.getElementById("visual-frame")
    };
  }
}());

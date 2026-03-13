(function () {
  function StoryEngine(story, settings) {
    if (!story || !Array.isArray(story.screens) || !story.startScreenId) {
      throw new Error("Story data is incomplete.");
    }

    this.story = story;
    this.settings = settings || {};
    this.screenIndex = {};

    for (var index = 0; index < story.screens.length; index += 1) {
      this.screenIndex[story.screens[index].id] = story.screens[index];
    }

    this.reset();
  }

  StoryEngine.prototype.reset = function () {
    this.previousStates = [];
    this.state = {
      authoredFrustration: 0,
      clickCount: 0,
      currentScreenId: this.story.startScreenId,
      failureReasonKey: null,
      history: [],
      lastActionId: null,
      lastScreenId: null,
      reformLoopCount: 0,
      routeContext: null,
      selectedReformKey: null,
      screenVisits: {}
    };

    this.state.screenVisits[this.story.startScreenId] = 1;
    this.state.authoredFrustration = this.resolveAuthoredFrustration(this.getCurrentScreen());
  };

  StoryEngine.prototype.restart = function () {
    this.reset();
    return this.getCurrentViewModel();
  };

  StoryEngine.prototype.getCurrentScreen = function () {
    return this.screenIndex[this.state.currentScreenId];
  };

  StoryEngine.prototype.getCurrentViewModel = function () {
    var screen = this.getCurrentScreen();

    return {
      actions: this.getVisibleActions(screen),
      canAdvanceMajorEvent: !!this.getMajorEventAction(screen),
      canGoBack: this.canGoBack(),
      clickCount: this.state.clickCount,
      dayCount: this.getDayCount(),
      description: this.resolveDescription(screen),
      giveUpScreenId: this.getGiveUpScreenId(),
      meter: this.getMeterData(screen),
      revealBlocks: this.resolveRevealBlocks(screen),
      screen: screen,
      title: screen.title
    };
  };

  StoryEngine.prototype.captureStateSnapshot = function () {
    return JSON.parse(JSON.stringify(this.state));
  };

  StoryEngine.prototype.canGoBack = function () {
    return this.previousStates.length > 0;
  };

  StoryEngine.prototype.goBack = function () {
    if (!this.canGoBack()) {
      return this.getCurrentViewModel();
    }

    this.state = this.previousStates.pop();
    return this.getCurrentViewModel();
  };

  StoryEngine.prototype.getDayCount = function () {
    return Math.max(1, this.state.clickCount + 1);
  };

  StoryEngine.prototype.getGiveUpScreenId = function () {
    if (this.story.giveUpScreenId && this.screenIndex[this.story.giveUpScreenId]) {
      return this.story.giveUpScreenId;
    }

    if (this.screenIndex["screen-49"]) {
      return "screen-49";
    }

    return this.story.startScreenId;
  };

  StoryEngine.prototype.getMajorEventAction = function (screen) {
    var currentScreen = screen || this.getCurrentScreen();
    var actions = this.getVisibleActions(currentScreen);
    var priorityStyles = ["primary", "option", "secondary"];
    var actionIndex;
    var styleIndex;

    if (!actions.length) {
      return null;
    }

    if (currentScreen.majorEventActionId) {
      for (actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
        if (actions[actionIndex].id === currentScreen.majorEventActionId) {
          return actions[actionIndex];
        }
      }
    }

    for (styleIndex = 0; styleIndex < priorityStyles.length; styleIndex += 1) {
      for (actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
        if (actions[actionIndex].type === "goto" && actions[actionIndex].style === priorityStyles[styleIndex]) {
          return actions[actionIndex];
        }
      }
    }

    for (actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      if (actions[actionIndex].type === "goto") {
        return actions[actionIndex];
      }
    }

    return null;
  };

  StoryEngine.prototype.advanceMajorEvent = function () {
    var action = this.getMajorEventAction(this.getCurrentScreen());

    if (!action) {
      return this.getCurrentViewModel();
    }

    return this.handleAction(action.id);
  };

  StoryEngine.prototype.giveUp = function () {
    var screen = this.getCurrentScreen();
    var targetId = this.getGiveUpScreenId();

    if (screen.id === targetId) {
      return this.getCurrentViewModel();
    }

    this.previousStates.push(this.captureStateSnapshot());
    this.state.clickCount += 1;
    this.state.history.push({
      actionId: "global-give-up",
      from: screen.id,
      to: targetId
    });
    this.state.lastActionId = "global-give-up";
    this.state.lastScreenId = screen.id;
    this.state.currentScreenId = targetId;
    this.state.screenVisits[this.state.currentScreenId] = (this.state.screenVisits[this.state.currentScreenId] || 0) + 1;
    this.state.authoredFrustration = this.resolveAuthoredFrustration(this.getCurrentScreen());

    return this.getCurrentViewModel();
  };

  StoryEngine.prototype.getVisibleActions = function (screen) {
    var actions = Array.isArray(screen.actions) ? screen.actions : [];
    var visibleActions = [];

    for (var index = 0; index < actions.length; index += 1) {
      if (this.shouldHideAction(actions[index])) {
        continue;
      }

      if (actions[index].maxReformLoops && this.state.reformLoopCount > actions[index].maxReformLoops) {
        continue;
      }

      visibleActions.push(actions[index]);
    }

    return visibleActions;
  };

  StoryEngine.prototype.shouldHideAction = function (action) {
    var label = action && typeof action.label === "string"
      ? action.label.replace(/\s+/g, " ").trim().toLowerCase()
      : "";

    return label === "give up" || label === "major events only";
  };

  StoryEngine.prototype.getMeterData = function (screen) {
    if (screen.showMeter === false) {
      return {
        authoredValue: null,
        displayValue: null,
        show: false
      };
    }

    var authoredValue = this.resolveAuthoredFrustration(screen);
    var threshold = Number(this.settings.clickThreshold);
    var shouldForceMax = Number.isFinite(threshold) && this.state.clickCount > threshold;

    return {
      authoredValue: authoredValue,
      displayValue: shouldForceMax && authoredValue < 100 ? 100 : authoredValue,
      show: true
    };
  };

  StoryEngine.prototype.resolveAuthoredFrustration = function (screen) {
    var meter = screen && screen.meter ? screen.meter : {};

    if (meter.mode === "fixed") {
      return meter.value;
    }

    if (meter.mode === "inherit") {
      return this.state && Number.isFinite(this.state.authoredFrustration)
        ? this.state.authoredFrustration
        : Number(this.settings.defaultFrustration || 0);
    }

    if (meter.mode === "byPreviousScreen") {
      if (this.state && meter.byPreviousScreen && meter.byPreviousScreen[this.state.lastScreenId] != null) {
        return meter.byPreviousScreen[this.state.lastScreenId];
      }

      return meter.defaultValue != null
        ? meter.defaultValue
        : this.state.authoredFrustration;
    }

    if (meter.mode === "byLastActionId") {
      if (this.state && meter.byLastActionId && meter.byLastActionId[this.state.lastActionId] != null) {
        return meter.byLastActionId[this.state.lastActionId];
      }

      return meter.defaultValue != null
        ? meter.defaultValue
        : this.state.authoredFrustration;
    }

    if (meter.mode === "byRouteContext") {
      if (this.state && meter.byRouteContext && meter.byRouteContext[this.state.routeContext] != null) {
        return meter.byRouteContext[this.state.routeContext];
      }

      return meter.defaultValue != null
        ? meter.defaultValue
        : this.state.authoredFrustration;
    }

    return this.state && Number.isFinite(this.state.authoredFrustration)
      ? this.state.authoredFrustration
      : Number(this.settings.defaultFrustration || 0);
  };

  StoryEngine.prototype.resolveDescription = function (screen) {
    if (screen.dynamicDescription) {
      return this.resolveDynamicDescription(screen.dynamicDescription);
    }

    return Array.isArray(screen.description) ? screen.description : [];
  };

  StoryEngine.prototype.resolveRevealBlocks = function (screen) {
    return Array.isArray(screen.revealBlocks) ? screen.revealBlocks : [];
  };

  StoryEngine.prototype.resolveDynamicDescription = function (dynamicDescription) {
    var stateValue = this.state[dynamicDescription.stateKey];
    var variants = dynamicDescription.variants || {};

    if (stateValue && variants[stateValue]) {
      return variants[stateValue];
    }

    return dynamicDescription.fallback || [];
  };

  StoryEngine.prototype.handleAction = function (actionId) {
    var screen = this.getCurrentScreen();
    var actions = Array.isArray(screen.actions) ? screen.actions : [];
    var selectedAction = null;

    for (var index = 0; index < actions.length; index += 1) {
      if (actions[index].id === actionId) {
        selectedAction = actions[index];
        break;
      }
    }

    if (!selectedAction) {
      throw new Error("Action not found: " + actionId);
    }

    if (selectedAction.type !== "restart" && !this.screenIndex[selectedAction.target]) {
      throw new Error("Target screen not found: " + selectedAction.target);
    }

    if (selectedAction.type !== "restart") {
      this.previousStates.push(this.captureStateSnapshot());
    }

    if (selectedAction.trackClick !== false) {
      this.state.clickCount += 1;
    }

    if (selectedAction.type === "restart") {
      return this.restart();
    }

    if (selectedAction.setFailureReasonKey) {
      this.state.failureReasonKey = selectedAction.setFailureReasonKey;
    }

    if (selectedAction.setSelectedReformKey) {
      this.state.selectedReformKey = selectedAction.setSelectedReformKey;
    }

    if (Object.prototype.hasOwnProperty.call(selectedAction, "setRouteContext")) {
      this.state.routeContext = selectedAction.setRouteContext;
    }

    this.state.history.push({
      actionId: selectedAction.id,
      from: screen.id,
      to: selectedAction.target
    });
    this.state.lastActionId = selectedAction.id;
    this.state.lastScreenId = screen.id;
    this.state.currentScreenId = selectedAction.target;
    this.state.screenVisits[this.state.currentScreenId] = (this.state.screenVisits[this.state.currentScreenId] || 0) + 1;

    this.state.authoredFrustration = this.resolveAuthoredFrustration(this.getCurrentScreen());
    return this.getCurrentViewModel();
  };

  window.ConclaveStoryEngine = StoryEngine;
}());

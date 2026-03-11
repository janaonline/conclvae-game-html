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
    this.state = {
      authoredFrustration: 0,
      clickCount: 0,
      currentScreenId: this.story.startScreenId,
      failureReasonKey: null,
      history: [],
      lastActionId: null,
      lastScreenId: null,
      reformLoopCount: 0,
      selectedReformKey: null,
      screenVisits: {}
    };

    this.state.screenVisits[this.story.startScreenId] = 1;
    this.state.authoredFrustration = this.resolveAuthoredFrustration(this.getCurrentScreen());
  };

  StoryEngine.prototype.getCurrentScreen = function () {
    return this.screenIndex[this.state.currentScreenId];
  };

  StoryEngine.prototype.getCurrentViewModel = function () {
    var screen = this.getCurrentScreen();

    return {
      actions: this.getVisibleActions(screen),
      clickCount: this.state.clickCount,
      description: this.resolveDescription(screen),
      meter: this.getMeterData(screen),
      screen: screen,
      title: screen.title
    };
  };

  StoryEngine.prototype.getVisibleActions = function (screen) {
    var actions = Array.isArray(screen.actions) ? screen.actions : [];
    var visibleActions = [];

    for (var index = 0; index < actions.length; index += 1) {
      if (actions[index].maxReformLoops && this.state.reformLoopCount > actions[index].maxReformLoops) {
        continue;
      }

      visibleActions.push(actions[index]);
    }

    return visibleActions;
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

    if (selectedAction.trackClick !== false) {
      this.state.clickCount += 1;
    }

    if (selectedAction.type === "restart") {
      this.reset();
      return this.getCurrentViewModel();
    }

    if (selectedAction.setFailureReasonKey) {
      this.state.failureReasonKey = selectedAction.setFailureReasonKey;
    }

    if (selectedAction.setSelectedReformKey) {
      this.state.selectedReformKey = selectedAction.setSelectedReformKey;
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

    if (this.state.currentScreenId === "screen-25") {
      this.state.reformLoopCount += 1;
    }

    this.state.authoredFrustration = this.resolveAuthoredFrustration(this.getCurrentScreen());
    return this.getCurrentViewModel();
  };

  window.ConclaveStoryEngine = StoryEngine;
}());

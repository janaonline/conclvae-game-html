(function () {
  function StoryRenderer(elements, settings) {
    this.elements = elements;
    this.settings = settings || {};
    this.story = null;
    this.screenPositions = {};
    this.pendingTimers = [];
    this.renderCycle = 0;
  }

  StoryRenderer.prototype.setStory = function (story) {
    var screens = story && Array.isArray(story.screens) ? story.screens : [];

    this.story = story || null;
    this.screenPositions = {};

    for (var index = 0; index < screens.length; index += 1) {
      this.screenPositions[screens[index].id] = {
        index: index + 1,
        total: screens.length
      };
    }
  };

  StoryRenderer.prototype.render = function (viewModel, options) {
    var isInitial = options && options.initial;
    var renderCycle;

    this.clearTimers();
    this.renderCycle += 1;
    renderCycle = this.renderCycle;

    if (isInitial) {
      this.applyViewModel(viewModel);
      this.elements.layout.classList.add("is-revealing");
      this.stopTransition(renderCycle);
      return;
    }

    this.startTransition();
    this.pendingTimers.push(window.setTimeout(function () {
      if (renderCycle !== this.renderCycle) {
        return;
      }

      this.applyViewModel(viewModel);
      this.elements.layout.classList.add("is-revealing");
      this.pendingTimers.push(window.setTimeout(function () {
        this.stopTransition(renderCycle);
      }.bind(this), 460));
    }.bind(this), 150));
  };

  StoryRenderer.prototype.applyViewModel = function (viewModel) {
    var screen = viewModel.screen;
    var frustrationBand = getFrustrationBand(viewModel.meter && viewModel.meter.displayValue);

    this.renderMeta(viewModel);
    this.renderMeter(viewModel.meter);
    this.renderCopy(viewModel.title, viewModel.description);
    this.renderImage(screen);
    this.renderActions(viewModel.actions);
    this.elements.layout.dataset.screenId = screen.id;
    this.elements.layout.dataset.screenType = screen.type || "choice";
    this.elements.layout.dataset.frustrationBand = frustrationBand;
  };

  StoryRenderer.prototype.renderMeta = function (viewModel) {
    var screen = viewModel.screen;
    var position = this.screenPositions[screen.id] || {
      index: 1,
      total: 1
    };

    this.elements.screenChip.textContent = formatScreenType(screen.type);
    this.elements.screenProgress.textContent = "Scene " + position.index + " / " + position.total;
    this.elements.clickCounter.textContent = viewModel.clickCount + (viewModel.clickCount === 1 ? " move" : " moves");
    setElementDelay(this.elements.screenChip, 20);
    setElementDelay(this.elements.screenProgress, 90);
    setElementDelay(this.elements.clickCounter, 160);
  };

  StoryRenderer.prototype.renderMeter = function (meter) {
    if (!meter.show) {
      this.elements.meter.hidden = true;
      return;
    }

    this.elements.meter.hidden = false;
    this.elements.meter.dataset.band = getFrustrationBand(meter.displayValue);
    this.elements.meterValue.textContent = window.ConclaveUtils.toPercent(meter.displayValue);
    this.elements.meterFill.style.width = window.ConclaveUtils.toPercent(meter.displayValue);
    setElementDelay(this.elements.meter, 220);
  };

  StoryRenderer.prototype.renderCopy = function (title, description) {
    var utils = window.ConclaveUtils;

    this.elements.title.textContent = title || "";
    setElementDelay(this.elements.title, 120);
    utils.clearNode(this.elements.description);

    for (var index = 0; index < description.length; index += 1) {
      var paragraph = utils.createNode("p", "", description[index]);

      setElementDelay(paragraph, 190 + (index * 70));
      this.elements.description.appendChild(paragraph);
    }
  };

  StoryRenderer.prototype.renderImage = function (screen) {
    var elements = this.elements;
    var image = elements.image;

    setElementDelay(elements.visualFrame, 80);
    elements.placeholderCopy.textContent = "Replace " + screen.image.split("/").pop() + " to update this screen image.";
    elements.visualFrame.classList.remove("has-image");

    image.onload = function () {
      elements.visualFrame.classList.add("has-image");
    };

    image.onerror = function () {
      elements.visualFrame.classList.remove("has-image");
    };

    image.alt = screen.imageAlt || "";
    image.src = screen.image || "";
  };

  StoryRenderer.prototype.renderActions = function (actions) {
    var utils = window.ConclaveUtils;
    var actionPresentation = getActionPresentation(actions);
    var targetContainer = actionPresentation.container === "footer"
      ? this.elements.actionFooter
      : this.elements.actionStack;

    utils.clearNode(this.elements.actionStack);
    utils.clearNode(this.elements.actionFooter);
    this.elements.actionArea.dataset.layout = actionPresentation.layout;
    this.elements.actionStack.dataset.layout = actionPresentation.container === "stack"
      ? actionPresentation.layout
      : "";
    this.elements.actionFooter.dataset.layout = actionPresentation.container === "footer"
      ? actionPresentation.layout
      : "";

    for (var index = 0; index < actions.length; index += 1) {
      var action = actions[index];
      var button = document.createElement("button");

      button.type = "button";
      button.className = utils.getActionClassNames(action);
      button.dataset.actionId = action.id;
      button.dataset.actionType = action.type || "goto";
      button.textContent = action.label;
      button.setAttribute("aria-label", action.label);
      setElementDelay(button, 260 + (index * 70));
      targetContainer.appendChild(button);
    }
  };

  StoryRenderer.prototype.setStatus = function (title, copy, hidden) {
    this.elements.statusTitle.textContent = title;
    this.elements.statusCopy.textContent = copy;
    this.elements.statusCard.classList.toggle("is-hidden", !!hidden);
  };

  StoryRenderer.prototype.setStatusAction = function (label, hidden, onClick) {
    this.elements.statusAction.textContent = label || "";
    this.elements.statusAction.hidden = !!hidden;
    this.elements.statusAction.onclick = onClick || null;
  };

  StoryRenderer.prototype.announce = function (message) {
    this.elements.liveRegion.textContent = message;
  };

  StoryRenderer.prototype.startTransition = function () {
    this.elements.layout.classList.add("is-transitioning");
    this.elements.layout.classList.remove("is-revealing");
  };

  StoryRenderer.prototype.stopTransition = function (renderCycle) {
    if (renderCycle != null && renderCycle !== this.renderCycle) {
      return;
    }

    this.elements.layout.classList.remove("is-transitioning");
  };

  StoryRenderer.prototype.clearTimers = function () {
    while (this.pendingTimers.length) {
      window.clearTimeout(this.pendingTimers.pop());
    }
  };

  function getActionPresentation(actions) {
    var actionCount = Array.isArray(actions) ? actions.length : 0;

    if (actionCount === 1) {
      return {
        container: "footer",
        layout: "single"
      };
    }

    if (actionCount === 2) {
      return {
        container: "footer",
        layout: "split"
      };
    }

    if (actionCount === 4) {
      return {
        container: "stack",
        layout: "grid-2x2"
      };
    }

    return {
      container: "stack",
      layout: "stack"
    };
  }

  function formatScreenType(type) {
    if (type === "result") {
      return "Outcome";
    }

    if (type === "ending") {
      return "Ending";
    }

    return "Decision";
  }

  function getFrustrationBand(value) {
    if (!Number.isFinite(Number(value))) {
      return "low";
    }

    if (Number(value) >= 70) {
      return "high";
    }

    if (Number(value) >= 40) {
      return "medium";
    }

    return "low";
  }

  function setElementDelay(element, delayMs) {
    if (!element) {
      return;
    }

    element.style.setProperty("--enter-delay", delayMs + "ms");
  }

  window.ConclaveRenderer = StoryRenderer;
}());

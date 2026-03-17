(function () {
  function StoryRenderer(elements, settings) {
    this.elements = elements;
    this.settings = settings || {};
    this.meterAnimationTimer = null;
    this.lastMeterValue = null;
    this.pendingTimers = [];
    this.renderVersion = 0;
  }

  StoryRenderer.prototype.render = function (viewModel) {
    var screen = viewModel.screen;
    var renderVersion = this.renderVersion + 1;

    this.renderVersion = renderVersion;
    this.clearPendingTimers();
    this.startTransition();
    this.schedule(function () {
      this.renderHeaderControls(viewModel);
      this.renderMeter(viewModel.meter);
      this.renderCopy(viewModel, renderVersion);
      this.renderImage(screen);
      this.elements.layout.dataset.screenId = screen.id;
      this.schedule(function () {
        if (renderVersion !== this.renderVersion) {
          return;
        }

        this.stopTransition();
      }.bind(this), 240);
    }.bind(this), 70);
  };

  StoryRenderer.prototype.renderHeaderControls = function (viewModel) {
    this.elements.backButton.disabled = !viewModel.canGoBack;
    this.elements.backButton.setAttribute("aria-disabled", viewModel.canGoBack ? "false" : "true");
  };

  StoryRenderer.prototype.renderMeter = function (meter) {
    var fillBands = ["meter-fill--yellow", "meter-fill--orange", "meter-fill--red"];
    var clampedValue;
    var previousValue = this.lastMeterValue;

    if (!meter.show) {
      this.elements.meter.hidden = true;
      this.clearMeterAnimationState();
      this.lastMeterValue = null;
      return;
    }

    clampedValue = window.ConclaveUtils.clampNumber(meter.displayValue, 0, 100);
    this.elements.meter.hidden = false;
    this.elements.meterValue.textContent = window.ConclaveUtils.toPercent(clampedValue);
    this.elements.meterFill.style.width = window.ConclaveUtils.toPercent(clampedValue);
    this.elements.meterFill.classList.remove(fillBands[0], fillBands[1], fillBands[2]);

    if (clampedValue <= 33) {
      this.elements.meterFill.classList.add("meter-fill--yellow");
    } else if (clampedValue <= 67) {
      this.elements.meterFill.classList.add("meter-fill--orange");
    } else {
      this.elements.meterFill.classList.add("meter-fill--red");
    }

    if (previousValue !== null && previousValue !== clampedValue) {
      this.triggerMeterAnimation(clampedValue > previousValue);
    }

    this.lastMeterValue = clampedValue;
  };

  StoryRenderer.prototype.triggerMeterAnimation = function (isRising) {
    this.clearMeterAnimationState();
    this.elements.meter.classList.add("is-updating");
    this.elements.meter.classList.add(isRising ? "meter--rising" : "meter--falling");

    this.meterAnimationTimer = window.setTimeout(function () {
      this.clearMeterAnimationState();
    }.bind(this), 700);
  };

  StoryRenderer.prototype.clearMeterAnimationState = function () {
    if (this.meterAnimationTimer) {
      window.clearTimeout(this.meterAnimationTimer);
      this.meterAnimationTimer = null;
    }

    this.elements.meter.classList.remove("is-updating", "meter--rising", "meter--falling");
  };

  StoryRenderer.prototype.renderCopy = function (viewModel, renderVersion) {
    var utils = window.ConclaveUtils;
    var copyBlocks = this.getCopyBlocks(viewModel.description, viewModel.revealBlocks);
    var totalDelay = 0;
    var hasDelayedReveal = false;

    this.elements.title.textContent = viewModel.title || "";
    utils.clearNode(this.elements.description);
    this.clearActionContainers();

    for (var index = 0; index < copyBlocks.length; index += 1) {
      totalDelay += copyBlocks[index].delayMs;
      hasDelayedReveal = hasDelayedReveal || copyBlocks[index].delayMs > 0;

      if (totalDelay === 0) {
        this.appendCopyBlock(copyBlocks[index]);
        continue;
      }

      this.schedule(function (block) {
        if (renderVersion !== this.renderVersion) {
          return;
        }

        this.appendCopyBlock(block);
      }.bind(this, copyBlocks[index]), totalDelay);
    }

    if (totalDelay === 0) {
      this.renderActions(viewModel.screen, viewModel.actions, false);
      return;
    }

    this.schedule(function () {
      if (renderVersion !== this.renderVersion) {
        return;
      }

      this.renderActions(viewModel.screen, viewModel.actions, hasDelayedReveal);
    }.bind(this), totalDelay);
  };

  StoryRenderer.prototype.renderImage = function (screen) {
    var elements = this.elements;
    var image = elements.image;

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

  StoryRenderer.prototype.renderActions = function (screen, actions, shouldFocus) {
    var utils = window.ConclaveUtils;
    var layout = this.resolveActionLayout(screen, actions);
    var targetContainer = layout === "stacked" ? this.elements.actionStack : this.elements.actionFooter;

    this.clearActionContainers();
    this.elements.actionFooter.dataset.layout = layout;

    for (var index = 0; index < actions.length; index += 1) {
      var action = actions[index];
      var button = document.createElement("button");

      button.type = "button";
      button.className = utils.getActionClassNames(action);
      button.dataset.actionId = action.id;
      button.textContent = action.label;
      button.setAttribute("aria-label", action.label);
      targetContainer.appendChild(button);
    }

    if (shouldFocus && targetContainer.firstElementChild) {
      var activeElement = document.activeElement;

      if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
        targetContainer.firstElementChild.focus();
      }
    }
  };

  StoryRenderer.prototype.getCopyBlocks = function (description, revealBlocks) {
    var blocks = [];
    var index;

    for (index = 0; index < description.length; index += 1) {
      blocks.push({
        delayMs: 0,
        style: "",
        text: description[index]
      });
    }

    for (index = 0; index < revealBlocks.length; index += 1) {
      blocks.push({
        delayMs: Number(revealBlocks[index].delayMs) || 0,
        style: revealBlocks[index].style || "",
        text: revealBlocks[index].text || ""
      });
    }

    return blocks;
  };

  StoryRenderer.prototype.appendCopyBlock = function (block) {
    var className = block.style === "prompt" ? "is-prompt" : "";

    this.elements.description.appendChild(window.ConclaveUtils.createNode("p", className, block.text));
  };

  StoryRenderer.prototype.resolveActionLayout = function (screen, actions) {
    if (actions.length === 4) {
      return "grid";
    }

    if (screen.actionLayout === "stacked" || screen.actionLayout === "grid" || screen.actionLayout === "split") {
      return screen.actionLayout;
    }

    if (screen.actionLayout === "footer") {
      return actions.length === 2 ? "split" : "single";
    }

    if (actions.length === 1) {
      return "single";
    }

    if (actions.length === 2) {
      return "split";
    }

    return "stacked";
  };

  StoryRenderer.prototype.clearActionContainers = function () {
    window.ConclaveUtils.clearNode(this.elements.actionStack);
    window.ConclaveUtils.clearNode(this.elements.actionFooter);
    this.elements.actionFooter.dataset.layout = "single";
  };

  StoryRenderer.prototype.schedule = function (callback, delayMs) {
    var timeoutId = window.setTimeout(callback, delayMs);

    this.pendingTimers.push(timeoutId);
    return timeoutId;
  };

  StoryRenderer.prototype.clearPendingTimers = function () {
    while (this.pendingTimers.length) {
      window.clearTimeout(this.pendingTimers.pop());
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
  };

  StoryRenderer.prototype.stopTransition = function () {
    this.elements.layout.classList.remove("is-transitioning");
  };

  window.ConclaveRenderer = StoryRenderer;
}());

(function () {
  function StoryRenderer(elements, settings) {
    this.elements = elements;
    this.settings = settings || {};
  }

  StoryRenderer.prototype.render = function (viewModel) {
    var screen = viewModel.screen;

    this.startTransition();
    window.setTimeout(function () {
      this.renderMeter(viewModel.meter);
      this.renderCopy(viewModel.title, viewModel.description);
      this.renderImage(screen);
      this.renderActions(screen, viewModel.actions);
      this.elements.layout.dataset.screenId = screen.id;
      this.stopTransition();
    }.bind(this), 20);
  };

  StoryRenderer.prototype.renderMeter = function (meter) {
    if (!meter.show) {
      this.elements.meter.hidden = true;
      return;
    }

    this.elements.meter.hidden = false;
    this.elements.meterValue.textContent = window.ConclaveUtils.toPercent(meter.displayValue);
    this.elements.meterFill.style.width = window.ConclaveUtils.toPercent(meter.displayValue);
  };

  StoryRenderer.prototype.renderCopy = function (title, description) {
    var utils = window.ConclaveUtils;

    this.elements.title.textContent = title || "";
    utils.clearNode(this.elements.description);

    for (var index = 0; index < description.length; index += 1) {
      this.elements.description.appendChild(utils.createNode("p", "", description[index]));
    }
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

  StoryRenderer.prototype.renderActions = function (screen, actions) {
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
      button.textContent = action.label;
      button.setAttribute("aria-label", action.label);
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
  };

  StoryRenderer.prototype.stopTransition = function () {
    this.elements.layout.classList.remove("is-transitioning");
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

  window.ConclaveRenderer = StoryRenderer;
}());

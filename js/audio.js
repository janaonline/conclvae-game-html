(function () {
  function AudioController(settings, button, icon, statusText) {
    this.settings = settings || {};
    this.button = button;
    this.icon = icon;
    this.statusText = statusText;
    this.audio = null;
    this.state = "off";
  }

  AudioController.prototype.init = function () {
    if (!this.settings.enableAudio) {
      this.button.hidden = true;
      return;
    }

    this.audio = document.createElement("audio");
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.playsInline = true;

    var sources = Array.isArray(this.settings.audioFiles) ? this.settings.audioFiles : [];
    for (var index = 0; index < sources.length; index += 1) {
      var source = document.createElement("source");
      source.src = sources[index].src;
      source.type = sources[index].type;
      this.audio.appendChild(source);
    }

    this.audio.addEventListener("error", this.markUnavailable.bind(this));
    this.button.addEventListener("click", this.toggle.bind(this));
    this.button.hidden = false;

    if (this.settings.audioToggleIcon) {
      this.icon.src = this.settings.audioToggleIcon;
    }

    this.tryAutoplayMuted();
  };

  AudioController.prototype.tryAutoplayMuted = function () {
    if (!this.audio) {
      return;
    }

    this.audio.muted = true;
    this.audio.play().then(function () {
      this.state = "muted";
      this.renderButtonState();
    }.bind(this)).catch(function () {
      this.state = "ready";
      this.renderButtonState();
    }.bind(this));
  };

  AudioController.prototype.toggle = function () {
    if (!this.audio || this.state === "unavailable") {
      return;
    }

    if (this.audio.paused) {
      this.audio.muted = false;
      this.audio.play().then(function () {
        this.state = "playing";
        this.renderButtonState();
      }.bind(this)).catch(this.markUnavailable.bind(this));
      return;
    }

    if (this.audio.muted) {
      this.audio.muted = false;
      this.state = "playing";
      this.renderButtonState();
      return;
    }

    this.audio.muted = true;
    this.state = "muted";
    this.renderButtonState();
  };

  AudioController.prototype.markUnavailable = function () {
    this.state = "unavailable";
    this.button.disabled = true;
    this.renderButtonState();
  };

  AudioController.prototype.renderButtonState = function () {
    var label = "Audio off";

    if (this.state === "playing") {
      label = "Audio on";
      this.button.setAttribute("aria-pressed", "true");
      this.button.title = "Audio on";
    } else if (this.state === "muted") {
      label = "Audio muted";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = "Audio muted";
    } else if (this.state === "ready") {
      label = "Enable audio";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = "Enable audio";
    } else if (this.state === "unavailable") {
      label = "Replace audio file to enable sound";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = label;
    }

    this.statusText.textContent = label;
  };

  window.ConclaveAudioController = AudioController;
}());

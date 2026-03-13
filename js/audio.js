(function () {
  function AudioController(settings, button, icon, statusText) {
    this.settings = settings || {};
    this.button = button;
    this.icon = icon;
    this.statusText = statusText;
    this.audio = null;
    this.audioContext = null;
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
    this.renderButtonState();
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

    this.resumeAudioContext();

    if (this.audio.paused) {
      this.audio.muted = false;
      this.audio.play().then(function () {
        this.state = "playing";
        this.renderButtonState();
        this.playClick(true);
      }.bind(this)).catch(this.markUnavailable.bind(this));
      return;
    }

    if (this.audio.muted) {
      this.audio.muted = false;
      this.state = "playing";
      this.renderButtonState();
      this.playClick(true);
      return;
    }

    this.playClick(true);
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
      label = "Mute sound";
      this.button.setAttribute("aria-pressed", "true");
      this.button.title = "Mute sound";
    } else if (this.state === "muted") {
      label = "Unmute sound";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = "Unmute sound";
    } else if (this.state === "ready") {
      label = "Enable sound";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = "Enable sound";
    } else if (this.state === "unavailable") {
      label = "Replace audio file to enable sound";
      this.button.setAttribute("aria-pressed", "false");
      this.button.title = label;
    }

    this.button.dataset.audioState = this.state;
    this.button.setAttribute("aria-label", label);
    this.statusText.textContent = label;
  };

  AudioController.prototype.ensureAudioContext = function () {
    var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextConstructor();
    }

    return this.audioContext;
  };

  AudioController.prototype.resumeAudioContext = function () {
    var context = this.ensureAudioContext();

    if (!context) {
      return Promise.resolve();
    }

    if (context.state === "suspended") {
      return context.resume();
    }

    return Promise.resolve();
  };

  AudioController.prototype.playClick = function (force) {
    if (!force && this.state !== "playing") {
      return Promise.resolve(false);
    }

    return this.resumeAudioContext().then(function () {
      var context = this.audioContext;

      if (!context) {
        return false;
      }

      var now = context.currentTime;
      var oscillator = context.createOscillator();
      var gainNode = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(force ? 960 : 840, now);
      oscillator.frequency.exponentialRampToValueAtTime(force ? 620 : 540, now + 0.095);
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(force ? 0.04 : 0.03, now + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.12);
      return true;
    }.bind(this)).catch(function () {
      return false;
    });
  };

  window.ConclaveAudioController = AudioController;
}());

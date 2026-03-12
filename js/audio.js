(function () {
  function AudioController(settings, button, icon, statusText) {
    this.settings = settings || {};
    this.button = button;
    this.icon = icon;
    this.statusText = statusText;
    this.audio = null;
    this.audioContext = null;
    this.masterGain = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.effectsEnabled = true;
    this.pendingCueTimer = 0;
    this.mediaCheckTimer = 0;
    this.backgroundMode = "none";
    this.backgroundPadNodes = [];
    this.backgroundSchedulerTimer = 0;
    this.nextPatternTime = 0;
    this.patternStep = 0;
    this.gestureHandler = null;
    this.preference = "auto";
    this.state = "off";
  }

  AudioController.prototype.init = function () {
    var sources = Array.isArray(this.settings.audioFiles) ? this.settings.audioFiles : [];

    if (!this.settings.enableAudio) {
      this.button.hidden = true;
      return;
    }

    this.effectsEnabled = !this.settings.soundEffects || this.settings.soundEffects.enabled !== false;
    this.button.addEventListener("click", this.handleToggleClick.bind(this));
    this.button.hidden = false;

    if (this.settings.audioToggleIcon) {
      this.icon.src = this.settings.audioToggleIcon;
    }

    if (sources.length) {
      this.audio = document.createElement("audio");
      this.audio.loop = true;
      this.audio.preload = "auto";
      this.audio.playsInline = true;
      this.audio.hidden = true;
      this.audio.setAttribute("aria-hidden", "true");
      this.audio.volume = clampVolume(this.settings.audioVolume, 0.32);
      this.audio.addEventListener("loadeddata", this.handleMediaReady.bind(this));
      this.audio.addEventListener("canplaythrough", this.handleMediaReady.bind(this));
      this.audio.addEventListener("playing", this.handleMediaReady.bind(this));
      this.audio.addEventListener("error", this.handleMediaFailure.bind(this));
      this.audio.addEventListener("stalled", this.handleMediaFailure.bind(this));

      for (var index = 0; index < sources.length; index += 1) {
        var source = document.createElement("source");

        source.src = sources[index].src;
        source.type = sources[index].type;
        this.audio.appendChild(source);
      }

      document.body.appendChild(this.audio);
      this.audio.load();
    }

    this.bindFirstGestureListener();
    this.state = "ready";
    this.renderButtonState();
    this.tryAutoplayOnLoad();
  };

  AudioController.prototype.tryAutoplayOnLoad = function () {
    var playResult;

    this.preference = "playing";

    if (!this.audio) {
      this.resumeSoundEngine();
      this.startSynthBackground();

      if (this.audioContext && this.audioContext.state === "running") {
        this.state = "playing";
        this.renderButtonState();
        return;
      }

      this.stopSynthBackground();
      this.preference = "auto";
      this.state = "ready";
      this.renderButtonState();
      return;
    }

    this.audio.muted = false;
    this.audio.volume = clampVolume(this.settings.audioVolume, 0.32);
    playResult = this.audio.play();

    if (!playResult || typeof playResult.then !== "function") {
      this.state = "playing";
      this.renderButtonState();
      this.mediaCheckTimer = window.setTimeout(this.verifyMediaPlayback.bind(this), 260);
      return;
    }

    playResult.then(function () {
      this.state = "playing";
      this.renderButtonState();
      this.mediaCheckTimer = window.setTimeout(this.verifyMediaPlayback.bind(this), 260);
    }.bind(this)).catch(function () {
      this.preference = "auto";
      this.tryAutoplayMuted();
    }.bind(this));
  };

  AudioController.prototype.tryAutoplayMuted = function () {
    var playResult;

    if (!this.audio) {
      this.state = "ready";
      this.renderButtonState();
      return;
    }

    this.audio.muted = true;
    playResult = this.audio.play();

    if (!playResult || typeof playResult.then !== "function") {
      this.state = "muted";
      this.renderButtonState();
      return;
    }

    playResult.then(function () {
      this.state = "muted";
      this.renderButtonState();
    }.bind(this)).catch(function () {
      this.state = "ready";
      this.renderButtonState();
    }.bind(this));
  };

  AudioController.prototype.bindFirstGestureListener = function () {
    if (this.gestureHandler) {
      return;
    }

    this.gestureHandler = this.handleFirstGesture.bind(this);
    document.addEventListener("pointerdown", this.gestureHandler);
    document.addEventListener("keydown", this.gestureHandler);
    document.addEventListener("touchstart", this.gestureHandler);
  };

  AudioController.prototype.handleFirstGesture = function (event) {
    if (event && event.target && typeof event.target.closest === "function" && event.target.closest("#audio-toggle")) {
      this.removeGestureListener();
      return;
    }

    this.removeGestureListener();

    if (this.preference === "muted") {
      return;
    }

    if (this.state === "playing") {
      return;
    }

    this.preference = "playing";
    this.enableAudioOutput();
  };

  AudioController.prototype.removeGestureListener = function () {
    if (!this.gestureHandler) {
      return;
    }

    document.removeEventListener("pointerdown", this.gestureHandler);
    document.removeEventListener("keydown", this.gestureHandler);
    document.removeEventListener("touchstart", this.gestureHandler);
    this.gestureHandler = null;
  };

  AudioController.prototype.handleMediaReady = function () {
    if (this.state === "playing" && this.preference !== "muted" && this.isPlayableMedia()) {
      this.stopSynthBackground();
    }
  };

  AudioController.prototype.handleMediaFailure = function () {
    window.clearTimeout(this.mediaCheckTimer);

    if (this.state === "playing" && this.preference !== "muted") {
      this.startSynthBackground();
    }
  };

  AudioController.prototype.isPlayableMedia = function () {
    return !!this.audio &&
      !this.audio.error &&
      this.audio.readyState >= 2 &&
      Number.isFinite(this.audio.duration) &&
      this.audio.duration > 0;
  };

  AudioController.prototype.handleToggleClick = function () {
    if (this.state === "playing") {
      this.playToggleTone("down");
      this.preference = "muted";
      this.muteAudioOutput();
      return;
    }

    this.preference = "playing";
    this.enableAudioOutput();
    this.playToggleTone("up");
  };

  AudioController.prototype.handleStoryAction = function () {
    if (!this.settings.enableAudio || this.preference === "muted") {
      return;
    }

    this.enableAudioOutput();
    this.playUiClick();
  };

  AudioController.prototype.handleScreenChange = function (viewModel) {
    window.clearTimeout(this.pendingCueTimer);

    if (!this.shouldPlayEffects() || !viewModel || !viewModel.screen) {
      return;
    }

    this.pendingCueTimer = window.setTimeout(function () {
      if (viewModel.screen.type === "ending") {
        this.playToneSequence([
          {
            delay: 0,
            duration: 0.12,
            frequency: 220,
            frequencyEnd: 164.81,
            type: "triangle",
            volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06)
          },
          {
            delay: 0.05,
            duration: 0.16,
            frequency: 277.18,
            frequencyEnd: 220,
            type: "sine",
            volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06) * 0.72
          }
        ]);
        return;
      }

      if (viewModel.screen.type === "result") {
        this.playToneSequence([
          {
            delay: 0,
            duration: 0.08,
            frequency: 392,
            frequencyEnd: 523.25,
            type: "triangle",
            volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06)
          }
        ]);
        return;
      }

      if (viewModel.meter && Number(viewModel.meter.displayValue) >= 70) {
        this.playToneSequence([
          {
            delay: 0,
            duration: 0.09,
            frequency: 240,
            frequencyEnd: 200,
            type: "sawtooth",
            volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06) * 0.65
          }
        ]);
      }
    }.bind(this), 170);
  };

  AudioController.prototype.enableAudioOutput = function () {
    if (this.state === "unavailable" || this.preference === "muted") {
      return;
    }

    this.resumeSoundEngine();
    this.state = "playing";
    this.renderButtonState();
    this.startBackgroundMusic();
  };

  AudioController.prototype.startBackgroundMusic = function () {
    var playResult;

    window.clearTimeout(this.mediaCheckTimer);

    if (!this.audio) {
      this.startSynthBackground();
      return;
    }

    this.audio.muted = false;
    this.audio.volume = clampVolume(this.settings.audioVolume, 0.32);
    playResult = this.audio.play();

    if (!playResult || typeof playResult.then !== "function") {
      this.mediaCheckTimer = window.setTimeout(this.verifyMediaPlayback.bind(this), 260);
      return;
    }

    playResult.then(function () {
      this.mediaCheckTimer = window.setTimeout(this.verifyMediaPlayback.bind(this), 260);
    }.bind(this)).catch(function () {
      this.startSynthBackground();
    }.bind(this));
  };

  AudioController.prototype.verifyMediaPlayback = function () {
    if (this.state !== "playing" || this.preference === "muted") {
      return;
    }

    if (this.isPlayableMedia() && !this.audio.paused) {
      this.stopSynthBackground();
      return;
    }

    this.resumeSoundEngine();
    this.startSynthBackground();
  };

  AudioController.prototype.muteAudioOutput = function () {
    window.clearTimeout(this.pendingCueTimer);
    window.clearTimeout(this.mediaCheckTimer);

    if (this.audio) {
      this.audio.muted = true;
      this.audio.pause();
    }

    this.stopSynthBackground();
    this.state = "muted";
    this.renderButtonState();
  };

  AudioController.prototype.shouldPlayEffects = function () {
    return this.effectsEnabled && this.preference !== "muted" && this.state === "playing";
  };

  AudioController.prototype.resumeSoundEngine = function () {
    var context = this.ensureAudioContext();

    if (context && context.state === "suspended") {
      context.resume();
    }
  };

  AudioController.prototype.ensureAudioContext = function () {
    var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextConstructor();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = clampVolume(this.settings.soundEffects && this.settings.soundEffects.masterVolume, 0.38);
      this.masterGain.connect(this.audioContext.destination);

      this.musicFilter = this.audioContext.createBiquadFilter();
      this.musicFilter.type = "lowpass";
      this.musicFilter.frequency.value = 3200;
      this.musicFilter.Q.value = 0.4;

      this.musicGain = this.audioContext.createGain();
      this.musicGain.gain.value = 0.0001;
      this.musicFilter.connect(this.musicGain);
      this.musicGain.connect(this.audioContext.destination);
    }

    return this.audioContext;
  };

  AudioController.prototype.startSynthBackground = function () {
    var context = this.ensureAudioContext();
    var frequencies = [174.61, 261.63, 349.23];
    var now;
    var targetVolume;
    var index;

    if (!context || !this.musicFilter || !this.musicGain) {
      return;
    }

    if (this.backgroundMode === "synth") {
      now = context.currentTime;
      targetVolume = clampVolume(this.settings.synthMusicVolume, 0.22);
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(Math.max(this.musicGain.gain.value, 0.0001), now);
      this.musicGain.gain.linearRampToValueAtTime(targetVolume, now + 0.18);
      return;
    }

    this.stopSynthBackground();
    this.backgroundMode = "synth";
    now = context.currentTime;
    targetVolume = clampVolume(this.settings.synthMusicVolume, 0.22);
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.linearRampToValueAtTime(targetVolume, now + 0.22);

    for (index = 0; index < frequencies.length; index += 1) {
      this.backgroundPadNodes.push(createPadNode(context, this.musicFilter, frequencies[index], index));
    }

    this.patternStep = 0;
    this.nextPatternTime = now + 0.18;
    this.scheduleBackgroundMusic();
    this.backgroundSchedulerTimer = window.setInterval(this.scheduleBackgroundMusic.bind(this), 240);
  };

  AudioController.prototype.scheduleBackgroundMusic = function () {
    var context = this.ensureAudioContext();
    var pattern = [
      { frequency: 392.0, harmony: 523.25, step: 0.64, duration: 0.36, volume: 0.09 },
      { frequency: 440.0, step: 0.48, duration: 0.28, volume: 0.075 },
      { frequency: 523.25, harmony: 659.25, step: 0.64, duration: 0.42, volume: 0.096 },
      { frequency: 392.0, step: 0.48, duration: 0.3, volume: 0.074 },
      { frequency: 349.23, harmony: 523.25, step: 0.64, duration: 0.42, volume: 0.088 },
      { frequency: 440.0, step: 0.48, duration: 0.28, volume: 0.072 },
      { frequency: 392.0, harmony: 587.33, step: 0.78, duration: 0.54, volume: 0.092 },
      { frequency: 329.63, step: 0.64, duration: 0.38, volume: 0.076 }
    ];
    var step;

    if (!context || this.backgroundMode !== "synth") {
      return;
    }

    while (this.nextPatternTime < context.currentTime + 1.6) {
      step = pattern[this.patternStep % pattern.length];
      this.scheduleMusicNote(step.frequency, this.nextPatternTime, step.duration, step.volume);

      if (step.harmony) {
        this.scheduleMusicNote(step.harmony, this.nextPatternTime + 0.04, step.duration * 0.9, step.volume * 0.62);
      }

      this.nextPatternTime += step.step;
      this.patternStep += 1;
    }
  };

  AudioController.prototype.scheduleMusicNote = function (frequency, startTime, duration, volume) {
    var context = this.ensureAudioContext();
    var oscillator;
    var filter;
    var gainNode;
    var safeVolume = clampVolume(volume, 0.07);

    if (!context || !this.musicFilter || this.backgroundMode !== "synth") {
      return;
    }

    oscillator = context.createOscillator();
    filter = context.createBiquadFilter();
    gainNode = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.detune.setValueAtTime(-2, startTime);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, startTime);
    filter.frequency.linearRampToValueAtTime(2800, startTime + duration);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(safeVolume, startTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.musicFilter);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  };

  AudioController.prototype.stopSynthBackground = function () {
    var context = this.audioContext;
    var now;
    var index;
    var padNode;

    window.clearInterval(this.backgroundSchedulerTimer);
    this.backgroundSchedulerTimer = 0;
    this.nextPatternTime = 0;
    this.patternStep = 0;

    if (!context || !this.musicGain) {
      this.backgroundMode = "none";
      this.backgroundPadNodes = [];
      return;
    }

    now = context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(this.musicGain.gain.value, 0.0001), now);
    this.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    for (index = 0; index < this.backgroundPadNodes.length; index += 1) {
      padNode = this.backgroundPadNodes[index];

      try {
        padNode.lfo.stop(now + 0.4);
      } catch (error) {
        // Ignore nodes that are already stopped.
      }

      try {
        padNode.oscillator.stop(now + 0.4);
      } catch (errorTwo) {
        // Ignore nodes that are already stopped.
      }
    }

    this.backgroundPadNodes = [];
    this.backgroundMode = "none";
  };

  AudioController.prototype.playUiClick = function () {
    if (!this.shouldPlayEffects()) {
      return;
    }

    this.playToneSequence([
      {
        delay: 0,
        duration: 0.045,
        frequency: 880,
        frequencyEnd: 660,
        type: "triangle",
        volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.clickVolume, 0.08)
      },
      {
        delay: 0.014,
        duration: 0.06,
        frequency: 1320,
        frequencyEnd: 980,
        type: "sine",
        volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.clickVolume, 0.08) * 0.45
      }
    ]);
  };

  AudioController.prototype.playToggleTone = function (direction) {
    if (direction === "down") {
      this.playToneSequence([
        {
          delay: 0,
          duration: 0.06,
          frequency: 520,
          frequencyEnd: 320,
          type: "triangle",
          volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06)
        }
      ]);
      return;
    }

    this.playToneSequence([
      {
        delay: 0,
        duration: 0.05,
        frequency: 420,
        frequencyEnd: 620,
        type: "triangle",
        volume: clampVolume(this.settings.soundEffects && this.settings.soundEffects.transitionVolume, 0.06)
      }
    ]);
  };

  AudioController.prototype.playToneSequence = function (steps) {
    var context = this.ensureAudioContext();

    if (!context || !this.masterGain) {
      return;
    }

    if (context.state === "suspended") {
      context.resume();
    }

    for (var index = 0; index < steps.length; index += 1) {
      this.playTone(context, steps[index]);
    }
  };

  AudioController.prototype.playTone = function (context, options) {
    var oscillator = context.createOscillator();
    var gainNode = context.createGain();
    var now = context.currentTime + (options.delay || 0);
    var volume = clampVolume(options.volume, 0.08);
    var endTime = now + (options.duration || 0.08);

    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(options.frequency || 440, now);
    oscillator.frequency.linearRampToValueAtTime(options.frequencyEnd || options.frequency || 440, endTime);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(endTime + 0.02);
  };

  AudioController.prototype.renderButtonState = function () {
    var label = "Sound off";

    this.button.disabled = false;

    if (this.state === "playing") {
      label = "Sound on";
      this.button.setAttribute("aria-pressed", "true");
    } else if (this.state === "muted") {
      label = "Sound muted";
      this.button.setAttribute("aria-pressed", "false");
    } else if (this.state === "ready") {
      label = "Tap for sound";
      this.button.setAttribute("aria-pressed", "false");
    } else if (this.state === "unavailable") {
      label = "Sound unavailable";
      this.button.setAttribute("aria-pressed", "false");
      this.button.disabled = true;
    }

    this.button.title = label;
    this.button.setAttribute("aria-label", label);
    this.statusText.textContent = label;
  };

  function createPadNode(context, targetNode, frequency, index) {
    var oscillator = context.createOscillator();
    var gainNode = context.createGain();
    var lfo = context.createOscillator();
    var lfoGain = context.createGain();

    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;

    gainNode.gain.value = 0.046 + (index * 0.01);

    lfo.type = "sine";
    lfo.frequency.value = 0.06 + (index * 0.02);
    lfoGain.gain.value = 0.008 + (index * 0.0025);

    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    oscillator.connect(gainNode);
    gainNode.connect(targetNode);

    oscillator.start();
    lfo.start();

    return {
      gainNode: gainNode,
      lfo: lfo,
      lfoGain: lfoGain,
      oscillator: oscillator
    };
  }

  function clampVolume(value, fallback) {
    var volume = Number(value);

    if (!Number.isFinite(volume)) {
      return fallback;
    }

    if (volume < 0) {
      return 0;
    }

    if (volume > 1) {
      return 1;
    }

    return volume;
  }

  window.ConclaveAudioController = AudioController;
}());
